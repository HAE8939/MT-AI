import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";

import { useAgentStore } from "@/stores/use-agent-store";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { CanvasNodeType } from "@/types/canvas";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import { relinkStep, remapSnapshotIds, topoSortStepNodes } from "@/lib/canvas/local-workflow";
import type { AgentTemplate, LocalWorkflowSpec } from "@/types/workflow";

// 本地工作流运行：重映射快照 id → 插入当前画布（写入输入槽值）→ 拓扑排序生成步骤 →
// 逐步 await runGenerationAndWait，每步跑完把下游连线从占位结果重连到实际产出。全程走 canvasContext.applyOps。

export type LocalWorkflowLocalFile = { file: File; previewUrl: string };

// 图片体积上限：防止第三方 API 因图片过大而处理失败
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function checkImageSize(blob: { size: number }, label: string) {
    if (blob.size > MAX_IMAGE_BYTES) throw new Error(`${label}超过 10MB，请压缩后再提交`);
}

export function useLocalWorkflowRun(template: AgentTemplate | null) {
    const { message } = App.useApp();
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const spec = template?.spec.kind === "local-workflow" ? (template.spec as LocalWorkflowSpec) : null;

    const [slotValues, setSlotValues] = useState<Record<string, string>>({});
    const [localFiles, setLocalFiles] = useState<Record<string, LocalWorkflowLocalFile>>({});
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
    const [lastError, setLastError] = useState<string>("");
    const localFilesRef = useRef(localFiles);
    localFilesRef.current = localFiles;

    useEffect(() => {
        Object.values(localFilesRef.current).forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setSlotValues({});
        setLocalFiles({});
        setRunning(false);
        setProgress(null);
        setLastError("");
    }, [template?.id]);

    useEffect(() => () => Object.values(localFilesRef.current).forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

    const canvasImageNodes = useMemo(() => {
        const nodes = canvasContext?.snapshot.nodes || [];
        return nodes.filter((node) => node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && node.metadata.content);
    }, [canvasContext?.snapshot.nodes]);

    const setSlotText = (nodeId: string, value: string) => {
        setSlotValues((current) => ({ ...current, [nodeId]: value }));
        setLocalFiles((current) => {
            if (!current[nodeId]) return current;
            URL.revokeObjectURL(current[nodeId].previewUrl);
            const next = { ...current };
            delete next[nodeId];
            return next;
        });
    };

    const setSlotImage = (nodeId: string, file: File | null) => {
        setLocalFiles((current) => {
            if (current[nodeId]) URL.revokeObjectURL(current[nodeId].previewUrl);
            const next = { ...current };
            if (file) next[nodeId] = { file, previewUrl: URL.createObjectURL(file) };
            else delete next[nodeId];
            return next;
        });
        if (file) setSlotValues((current) => ({ ...current, [nodeId]: "" }));
    };

    const run = async (): Promise<boolean> => {
        if (!template || !spec) return false;
        const context = useAgentStore.getState().canvasContext;
        if (!context?.applyOps || !context.runGenerationAndWait) {
            message.warning("请先打开一个画布再运行本地工作流");
            return false;
        }
        setRunning(true);
        setLastError("");
        try {
            // 1. 重映射 id
            const { nodes, connections, idMap } = remapSnapshotIds(spec.nodes, spec.connections);
            // 2. 计算步骤执行顺序（在重映射后的图上）
            const order = topoSortStepNodes(nodes, connections);
            // 3. 解析输入槽的值（图片先上传拿 storageKey）
            const slotPatch = new Map<string, { content: string; storageKey?: string }>();
            for (const slot of spec.inputs) {
                const newId = idMap.get(slot.nodeId);
                if (!newId) continue;
                if (slot.kind === "image") {
                    const local = localFiles[slot.nodeId];
                    if (local) {
                        checkImageSize(local.file, `「${slot.label}」`);
                        const uploaded = await uploadImage(local.file, { fileName: local.file.name || "input.png" });
                        slotPatch.set(newId, { content: uploaded.url, storageKey: uploaded.storageKey });
                    } else {
                        const raw = (slotValues[slot.nodeId] || "").trim();
                        if (raw) {
                            const node = canvasImageNodes.find((item) => item.metadata?.content === raw);
                            const storageKey = node?.metadata?.storageKey;
                            if (storageKey) {
                                const blob = await getImageBlob(storageKey);
                                if (blob) checkImageSize(blob, `「${slot.label}」`);
                            }
                            slotPatch.set(newId, { content: raw, storageKey });
                        }
                    }
                } else {
                    const raw = (slotValues[slot.nodeId] || "").trim();
                    if (raw) slotPatch.set(newId, { content: raw });
                }
            }
            // 4. 把节点插入当前画布（写入输入槽值），再连线
            const addOps: CanvasAgentOp[] = nodes.map((node) => {
                const patch = slotPatch.get(node.id);
                return {
                    type: "add_node",
                    id: node.id,
                    nodeType: node.type,
                    title: node.title,
                    position: { x: node.position.x + 80, y: node.position.y + 80 },
                    width: node.width,
                    height: node.height,
                    metadata: patch ? { ...node.metadata, content: patch.content, storageKey: patch.storageKey, status: "success" } : node.metadata,
                };
            });
            const connectOps: CanvasAgentOp[] = connections.map((connection) => ({ type: "connect_nodes", fromNodeId: connection.fromNodeId, toNodeId: connection.toNodeId }));
            context.applyOps([...addOps, ...connectOps]);

            // 5. 逐步串跑，步间重连
            let liveConnections = connections;
            for (let i = 0; i < order.length; i++) {
                const stepId = order[i];
                setProgress({ current: i + 1, total: order.length, label: `第 ${i + 1}/${order.length} 步` });
                const beforeIds = new Set(useAgentStore.getState().canvasContext?.snapshot.nodes.map((node) => node.id) || []);
                const result = await context.runGenerationAndWait!(stepId, "");
                if (result.status === "error" || !result.primaryNodeId) {
                    setLastError(`第 ${i + 1} 步生成失败`);
                    message.error(`第 ${i + 1} 步生成失败，已停止后续步骤`);
                    return false;
                }
                // 重连：把旧占位结果的下游边指向实际产出，删除占位
                const relinked = relinkStep(liveConnections, stepId, result.primaryNodeId, beforeIds);
                if (relinked.removedNodeIds.length) {
                    const relinkOps: CanvasAgentOp[] = [
                        { type: "delete_node", ids: relinked.removedNodeIds },
                        ...relinked.connections
                            .filter((connection) => connection.fromNodeId === result.primaryNodeId)
                            .map((connection): CanvasAgentOp => ({ type: "connect_nodes", fromNodeId: connection.fromNodeId, toNodeId: connection.toNodeId })),
                    ];
                    context.applyOps(relinkOps);
                }
                liveConnections = relinked.connections;
            }
            message.success("本地工作流已全部完成，结果在画布上");
            return true;
        } catch (error) {
            setLastError(error instanceof Error ? error.message : "运行失败");
            message.error(error instanceof Error ? error.message : "本地工作流运行失败");
            return false;
        } finally {
            setRunning(false);
            setProgress(null);
        }
    };

    return { spec, slotValues, setSlotText, setSlotImage, localFiles, canvasImageNodes, running, progress, lastError, run };
}
