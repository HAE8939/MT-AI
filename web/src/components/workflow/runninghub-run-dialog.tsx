import { useEffect, useMemo, useRef, useState } from "react";
import { App, AutoComplete, Form, Input, Modal, Select } from "antd";
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

// 运行 RunningHub 工作流的共享对话框：填参数 → 提交统一任务运行时 → 结果写回画布新节点。
// 图片参数可选画布任意图片节点（本地图在提交时经 RunningHub 上传接口换取 fileName），也可直接填公网 URL。

export function RunningHubRunDialog({ template, defaultProjectId, onClose }: { template: AgentTemplate | null; defaultProjectId?: string; onClose: () => void }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const enqueueTask = useWorkflowTaskStore((state) => state.enqueueTask);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const runninghub = useConfigStore((state) => state.runninghub);
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const [values, setValues] = useState<Record<string, string>>({});
    const [projectId, setProjectId] = useState<string>("");
    const [uploading, setUploading] = useState(false);
    /** 每次关闭/切换模板递增，令仍在上传中的旧 run() 作废，避免取消后任务仍被提交 */
    const runSessionRef = useRef(0);
    const spec = template?.spec.kind === "runninghub" ? (template.spec as RunningHubSpec) : null;

    useEffect(() => {
        runSessionRef.current += 1;
        setValues({});
        setProjectId("");
        setUploading(false);
    }, [template?.id]);

    /** 当前画布上的全部图片节点：本地图（blob:/dataURL）在提交时上传，公网 URL 直接透传 */
    const canvasImageNodes = useMemo(() => {
        const nodes = canvasContext?.snapshot.nodes || [];
        return nodes.filter((node) => node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && node.metadata.content);
    }, [canvasContext?.snapshot.nodes]);
    const canvasImageOptions = useMemo(() => canvasImageNodes.map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id })), [canvasImageNodes]);

    /** 把 image 字段的值解析成 RunningHub 可用的 fieldValue：公网 URL 与已上传的 fileName 透传，画布本地图上传换 fileName */
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
        const config = { baseUrl: runninghub.baseUrl.trim() || RUNNINGHUB_BASE_URL, apiKey: runninghub.apiKey };
        return uploadRunningHubFile(config, blob, `canvas-input.${extension}`);
    };

    const run = async () => {
        if (!template || !spec) return;
        if (!runninghub.apiKey.trim()) {
            message.warning("请先在登记弹窗或配置中填写 RunningHub API Key");
            return;
        }
        const session = runSessionRef.current;
        setUploading(true);
        let nodeInfoList: RunningHubNodeInfo[];
        let promptText: string;
        try {
            const resolved = await Promise.all(
                spec.fields.map(async (field, index) => {
                    const raw = (values[`${index}`] ?? field.defaultValue ?? "").trim();
                    if (!raw) return null;
                    const fieldValue = field.kind === "image" ? await resolveImageFieldValue(raw) : raw;
                    return { field, raw, info: { nodeId: field.nodeId, fieldName: field.fieldName, fieldValue } };
                }),
            );
            const entries = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item));
            nodeInfoList = entries.map((item) => item.info);
            promptText = entries.filter((item) => item.field.kind === "text").map((item) => item.raw).join(" / ");
        } catch (error) {
            if (session !== runSessionRef.current) return;
            const detail = error instanceof Error ? error.message : "";
            message.error(/[一-鿿]/.test(detail) ? detail : `图片上传失败${detail ? `：${detail}` : "，请稍后重试"}`);
            setUploading(false);
            return;
        }
        if (session !== runSessionRef.current) return;
        setUploading(false);
        const targetProjectId = projectId || defaultProjectId || projects[0]?.id || createProject(`${template.name} 运行结果`);
        const project = useCanvasStore.getState().projects.find((item) => item.id === targetProjectId);
        if (!project) return;
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
        message.success("任务已提交，可在任务中心查看进度");
        setValues({});
        onClose();
        navigate(`/canvas/${targetProjectId}?focus=${encodeURIComponent(childId)}`);
    };

    return (
        <Modal
            title={template ? `运行：${template.name}` : ""}
            open={Boolean(template)}
            onCancel={onClose}
            onOk={() => void run()}
            okText={uploading ? "上传图片中…" : "运行"}
            okButtonProps={{ loading: uploading }}
            cancelText="取消"
            width={640}
            destroyOnHidden
        >
            {spec ? (
                <div className="space-y-4 pt-1">
                    <Form layout="vertical" requiredMark={false}>
                        {spec.fields.map((field, index) => (
                            <Form.Item key={index} label={field.label} className="mb-3">
                                {field.kind === "image" ? (
                                    <AutoComplete
                                        className="w-full"
                                        options={canvasImageOptions}
                                        value={values[`${index}`] || ""}
                                        placeholder={canvasImageOptions.length ? "选择画布图片，或填写图片公网 URL" : "图片公网 URL（COS 直链或其他可公开访问地址）"}
                                        onChange={(value) => setValues((current) => ({ ...current, [`${index}`]: value }))}
                                    />
                                ) : (
                                    <Input.TextArea rows={2} placeholder={field.defaultValue || "填写内容"} value={values[`${index}`] || ""} onChange={(event) => setValues((current) => ({ ...current, [`${index}`]: event.target.value }))} />
                                )}
                            </Form.Item>
                        ))}
                        <Form.Item label="结果写入画布" className="mb-0">
                            <Select
                                placeholder={defaultProjectId ? "默认当前画布" : projects.length ? "选择画布（默认第一个）" : "将自动新建画布"}
                                allowClear
                                value={projectId || undefined}
                                options={projects.map((project) => ({ value: project.id, label: project.title }))}
                                onChange={(value) => setProjectId(value || "")}
                            />
                        </Form.Item>
                    </Form>
                </div>
            ) : null}
        </Modal>
    );
}
