import { useMemo, useState } from "react";
import { App, AutoComplete, Form, Input, Modal, Select } from "antd";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";

import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { CanvasNodeType } from "@/types/canvas";
import type { AgentTemplate, RunningHubSpec } from "@/types/workflow";

// 运行 RunningHub 工作流的共享对话框：填参数 → 提交统一任务运行时 → 结果写回画布新节点。
// 图片参数支持从当前画布的图片节点直接取公网 URL。

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
    const spec = template?.spec.kind === "runninghub" ? (template.spec as RunningHubSpec) : null;

    /** 当前画布上可直接引用的公网图片（RunningHub 需要可公开访问的 URL，跳过 dataURL/本地图） */
    const canvasImageOptions = useMemo(() => {
        const nodes = canvasContext?.snapshot.nodes || [];
        return nodes
            .filter((node) => node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && /^https?:\/\//.test(node.metadata.content))
            .map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id }));
    }, [canvasContext?.snapshot.nodes]);

    const run = () => {
        if (!template || !spec) return;
        if (!runninghub.apiKey.trim()) {
            message.warning("请先在登记弹窗或配置中填写 RunningHub API Key");
            return;
        }
        const nodeInfoList = spec.fields
            .map((field, index) => ({ nodeId: field.nodeId, fieldName: field.fieldName, fieldValue: (values[`${index}`] ?? field.defaultValue ?? "").trim() }))
            .filter((item) => item.fieldValue);
        const targetProjectId = projectId || defaultProjectId || projects[0]?.id || createProject(`${template.name} 运行结果`);
        const project = useCanvasStore.getState().projects.find((item) => item.id === targetProjectId);
        if (!project) return;
        const childId = nanoid();
        const promptText = nodeInfoList.map((item) => item.fieldValue).join(" / ");
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
        <Modal title={template ? `运行：${template.name}` : ""} open={Boolean(template)} onCancel={onClose} onOk={run} okText="运行" cancelText="取消" width={640} destroyOnHidden>
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
