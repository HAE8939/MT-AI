import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";

import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { getImageBlob } from "@/services/image-storage";
import { RUNNINGHUB_BASE_URL, uploadRunningHubFile, type RunningHubNodeInfo } from "@/services/providers/runninghub";
import { CanvasNodeType } from "@/types/canvas";
import type { AgentTemplate, RunningHubSpec } from "@/types/workflow";

// RunningHub 工作流运行共享逻辑：字段状态（含本地文件）→ 提交时解析上传 → 入队统一任务运行时 + 画布占位节点。
// 运行弹窗（/workflows 页）与画布侧栏运行面板共同消费；同一下标的 values 与 localFiles 互斥。

export type RunningHubLocalFile = { file: File; previewUrl: string };

export function useRunningHubRun(template: AgentTemplate | null, options?: { defaultProjectId?: string }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const enqueueTask = useWorkflowTaskStore((state) => state.enqueueTask);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const runninghub = useConfigStore((state) => state.runninghub);
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const [values, setValues] = useState<Record<string, string>>({});
    const [localFiles, setLocalFiles] = useState<Record<number, RunningHubLocalFile>>({});
    const [projectId, setProjectId] = useState("");
    const [uploading, setUploading] = useState(false);
    const [lastTaskId, setLastTaskId] = useState<string | null>(null);
    /** 每次切换模板递增，令仍在上传中的旧 run() 作废，避免取消后任务仍被提交 */
    const runSessionRef = useRef(0);
    const localFilesRef = useRef(localFiles);
    localFilesRef.current = localFiles;
    const spec = template?.spec.kind === "runninghub" ? (template.spec as RunningHubSpec) : null;

    useEffect(() => {
        runSessionRef.current += 1;
        Object.values(localFilesRef.current).forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setValues({});
        setLocalFiles({});
        setProjectId("");
        setUploading(false);
        setLastTaskId(null);
    }, [template?.id]);

    useEffect(() => () => Object.values(localFilesRef.current).forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

    /** 当前画布上的全部图片节点：本地图（blob:/dataURL）在提交时上传，供图片字段选择 */
    const canvasImageNodes = useMemo(() => {
        const nodes = canvasContext?.snapshot.nodes || [];
        return nodes.filter((node) => node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && node.metadata.content);
    }, [canvasContext?.snapshot.nodes]);

    const setValue = (index: number, value: string) => {
        setValues((current) => ({ ...current, [`${index}`]: value }));
        setLocalFiles((current) => {
            if (!current[index]) return current;
            URL.revokeObjectURL(current[index].previewUrl);
            const next = { ...current };
            delete next[index];
            return next;
        });
    };

    const setLocalFile = (index: number, file: File | null) => {
        setLocalFiles((current) => {
            if (current[index]) URL.revokeObjectURL(current[index].previewUrl);
            const next = { ...current };
            if (file) next[index] = { file, previewUrl: URL.createObjectURL(file) };
            else delete next[index];
            return next;
        });
        if (file) setValues((current) => ({ ...current, [`${index}`]: "" }));
    };

    const uploadConfig = () => ({ baseUrl: runninghub.baseUrl.trim() || RUNNINGHUB_BASE_URL, apiKey: runninghub.apiKey });

    /** 把 image 字段的字符串值解析成 RunningHub 可用的 fieldValue：公网 URL 与已上传的 fileName 透传，画布本地图上传换 fileName */
    const resolveImageFieldValue = async (raw: string) => {
        if (/^https?:\/\//.test(raw)) return raw;
        const node = canvasImageNodes.find((item) => item.metadata?.content === raw);
        const isLocalUrl = raw.startsWith("blob:") || raw.startsWith("data:");
        if (!node && !isLocalUrl) return raw;
        const storageKey = node?.metadata?.storageKey;
        let blob: Blob | null = null;
        try {
            blob = storageKey ? await getImageBlob(storageKey) : null;
            if (!blob && isLocalUrl) blob = await (await fetch(raw)).blob();
        } catch {
            blob = null;
        }
        if (!blob) throw new Error("读取画布图片失败，请重新选择图片");
        const extension = (blob.type.split("/")[1] || "png").replace("+xml", "");
        return uploadRunningHubFile(uploadConfig(), blob, `canvas-input.${extension}`);
    };

    const run = async (): Promise<boolean> => {
        if (!template || !spec) return false;
        if (!runninghub.apiKey.trim()) {
            message.warning("请先在登记弹窗或配置中填写 RunningHub API Key");
            return false;
        }
        const session = runSessionRef.current;
        setUploading(true);
        let nodeInfoList: RunningHubNodeInfo[];
        let promptText: string;
        try {
            const resolved = await Promise.all(
                spec.fields.map(async (field, index) => {
                    const local = field.kind === "image" ? localFiles[index] : undefined;
                    const raw = (values[`${index}`] ?? field.defaultValue ?? "").trim();
                    if (!local && !raw) return null;
                    const fieldValue = field.kind === "image" ? (local ? await uploadRunningHubFile(uploadConfig(), local.file, local.file.name || "upload.png") : await resolveImageFieldValue(raw)) : raw;
                    return { field, raw: local ? local.file.name : raw, info: { nodeId: field.nodeId, fieldName: field.fieldName, fieldValue } };
                }),
            );
            const entries = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item));
            nodeInfoList = entries.map((item) => item.info);
            promptText = entries.filter((item) => item.field.kind === "text").map((item) => item.raw).join(" / ");
        } catch (error) {
            if (session !== runSessionRef.current) return false;
            const detail = error instanceof Error ? error.message : "";
            message.error(/[一-鿿]/.test(detail) ? detail : `图片上传失败${detail ? `：${detail}` : "，请稍后重试"}`);
            setUploading(false);
            return false;
        }
        if (session !== runSessionRef.current) return false;
        setUploading(false);
        const targetProjectId = projectId || options?.defaultProjectId || projects[0]?.id || createProject(`${template.name} 运行结果`);
        const project = useCanvasStore.getState().projects.find((item) => item.id === targetProjectId);
        if (!project) return false;
        const childId = nanoid();
        const taskId = enqueueTask({
            projectId: targetProjectId,
            sourceNodeId: childId,
            targetNodeIds: [childId],
            type: "runninghub",
            params: { workflowId: spec.workflowId, nodeInfoList, agentTemplateId: template.id },
            prompt: promptText || template.name,
        });
        const isVideo = template.category === "video";
        updateProject(targetProjectId, {
            nodes: [
                ...project.nodes,
                {
                    id: childId,
                    type: isVideo ? CanvasNodeType.Video : CanvasNodeType.Image,
                    title: template.name,
                    position: { x: 120, y: 120 + project.nodes.length * 24 },
                    width: 320,
                    height: 240,
                    metadata: { prompt: promptText, status: "loading", workflowTaskId: taskId, workflowType: "runninghub", workflowResultIndex: 0 },
                },
            ],
        });
        setLastTaskId(taskId);
        message.success("任务已提交，结果将写回画布节点");
        navigate(`/canvas/${targetProjectId}?focus=${encodeURIComponent(childId)}`);
        return true;
    };

    return { spec, values, setValue, localFiles, setLocalFile, canvasImageNodes, projects, projectId, setProjectId, uploading, lastTaskId, run };
}
