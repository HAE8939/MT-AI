import { useMemo, useState } from "react";
import { App, Button, Empty, Form, Input, Modal, Popconfirm, Segmented, Select, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { Cloud, LayoutTemplate, Play, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";

import { useAgentTemplateStore } from "@/stores/use-agent-template-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useConfigStore } from "@/stores/use-config-store";
import { RunningHubRunDialog } from "@/components/workflow/runninghub-run-dialog";
import { AGENT_CATEGORY_LABELS, type AgentCategory, type AgentTemplate, type RunningHubParamField } from "@/types/workflow";

const CATEGORY_TABS: Array<{ value: AgentCategory | "all"; label: string }> = [
    { value: "all", label: "全部" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "document", label: "文档" },
];

function specKindLabel(template: AgentTemplate) {
    if (template.spec.kind === "runninghub") return { label: "云工作流", icon: <Cloud className="size-3.5" /> };
    return { label: "画布模板", icon: <LayoutTemplate className="size-3.5" /> };
}

/** 工作流页：登记与管理 RunningHub 云工作流、画布模板；对话角色在对话面板中管理 */
export default function WorkflowsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const templates = useAgentTemplateStore((state) => state.templates);
    const removeTemplate = useAgentTemplateStore((state) => state.removeTemplate);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const [category, setCategory] = useState<AgentCategory | "all">("all");
    const [registerOpen, setRegisterOpen] = useState(false);
    const [runTarget, setRunTarget] = useState<AgentTemplate | null>(null);

    const workflows = useMemo(() => templates.filter((item) => item.spec.kind !== "doc-analysis"), [templates]);
    const filtered = useMemo(() => (category === "all" ? workflows : workflows.filter((item) => item.category === category)), [workflows, category]);

    const insertCanvasTemplate = (template: AgentTemplate) => {
        if (template.spec.kind !== "canvas") return;
        const spec = template.spec;
        const targetProjectId = projects[0]?.id || createProject(`${template.name}`);
        const project = useCanvasStore.getState().projects.find((item) => item.id === targetProjectId);
        if (!project) return;
        const idMap = new Map(spec.nodes.map((node) => [node.id, nanoid()]));
        const offsetX = 120 + (project.nodes.length ? Math.max(...project.nodes.map((node) => node.position.x + node.width)) : 0);
        const nodes = spec.nodes.map((node) => ({ ...node, id: idMap.get(node.id)!, position: { x: node.position.x + offsetX, y: node.position.y + 120 } }));
        const connections = spec.connections.map((connection) => ({ id: nanoid(), fromNodeId: idMap.get(connection.fromNodeId)!, toNodeId: idMap.get(connection.toNodeId)! }));
        updateProject(targetProjectId, { nodes: [...project.nodes, ...nodes], connections: [...project.connections, ...connections] });
        message.success("模板已插入画布，填充输入节点后即可运行");
        navigate(`/canvas/${targetProjectId}`);
    };

    const startRun = (template: AgentTemplate) => {
        if (template.spec.kind === "runninghub") setRunTarget(template);
        else insertCanvasTemplate(template);
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)]">
                <div className="mx-auto max-w-7xl">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">工作流</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">可复用的自动化流程：登记 RunningHub 云工作流或画布模板，输入素材一键运行出完整成品。对话 AI 角色请在右侧对话面板中管理。</p>
                    </div>

                    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                        <Segmented value={category} options={CATEGORY_TABS} onChange={(value) => setCategory(value as AgentCategory | "all")} />
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setRegisterOpen(true)}>
                            登记 RunningHub 工作流
                        </Button>
                    </div>

                    {filtered.length === 0 ? (
                        <div className="mt-16">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该分类下还没有工作流。可以登记 RunningHub 云工作流，或在画布中选中节点保存为模板。" />
                        </div>
                    ) : (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {filtered.map((template) => {
                                const kind = specKindLabel(template);
                                return (
                                    <section key={template.id} className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-lg dark:bg-stone-900">{template.avatar || "🧩"}</span>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold">{template.name}</div>
                                                    <div className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
                                                        {kind.icon}
                                                        {kind.label} · {AGENT_CATEGORY_LABELS[template.category]}
                                                    </div>
                                                </div>
                                            </div>
                                            {template.source === "builtin" ? <Tag className="m-0 text-[11px]">内置</Tag> : null}
                                        </div>
                                        <p className="mt-3 line-clamp-2 min-h-10 flex-1 text-xs leading-5 text-stone-500">{template.description || "暂无说明"}</p>
                                        <div className="mt-3 flex items-center justify-end gap-1">
                                            <Popconfirm title="删除这个工作流？" onConfirm={() => removeTemplate(template.id)}>
                                                <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} />
                                            </Popconfirm>
                                            <Button type="primary" size="small" icon={<Play className="size-3.5" />} onClick={() => startRun(template)}>
                                                运行
                                            </Button>
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>

            <RunningHubRegisterDialog open={registerOpen} onClose={() => setRegisterOpen(false)} />
            <RunningHubRunDialog template={runTarget} onClose={() => setRunTarget(null)} />
        </div>
    );
}

/** 登记 RunningHub 工作流：workflowId + 暴露给用户的参数映射 */
function RunningHubRegisterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const addTemplate = useAgentTemplateStore((state) => state.addTemplate);
    const runninghub = useConfigStore((state) => state.runninghub);
    const updateRunningHubConfig = useConfigStore((state) => state.updateRunningHubConfig);
    const [form] = Form.useForm<{ name: string; description: string; category: AgentCategory; workflowId: string; apiKey: string }>();
    const [fields, setFields] = useState<RunningHubParamField[]>([{ nodeId: "", fieldName: "text", label: "提示词", kind: "text" }]);

    const save = async () => {
        const values = await form.validateFields();
        const validFields = fields.filter((field) => field.nodeId.trim() && field.fieldName.trim() && field.label.trim());
        if (!validFields.length) {
            message.warning("至少配置一个可填写的参数（nodeId + fieldName）");
            return;
        }
        if (values.apiKey?.trim() && values.apiKey.trim() !== runninghub.apiKey) updateRunningHubConfig("apiKey", values.apiKey.trim());
        addTemplate({
            name: values.name.trim(),
            description: values.description?.trim() || "",
            category: values.category,
            spec: { kind: "runninghub", workflowId: values.workflowId.trim(), fields: validFields },
        });
        message.success("工作流已登记");
        form.resetFields();
        setFields([{ nodeId: "", fieldName: "text", label: "提示词", kind: "text" }]);
        onClose();
    };

    return (
        <Modal title="登记 RunningHub 工作流" open={open} onCancel={onClose} onOk={() => void save()} okText="登记" cancelText="取消" width={720} destroyOnHidden>
            <Form form={form} layout="vertical" requiredMark={false} initialValues={{ category: "image", apiKey: runninghub.apiKey }}>
                <div className="rounded-md bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                    工作流须先在 RunningHub 平台手动成功运行过一次。workflowId 取自工作流页面链接末尾数字；nodeId 和 fieldName 参考工作台「导出工作流 API」的 JSON。
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Form.Item name="name" label="工作流名称" rules={[{ required: true, message: "请填写名称" }]} className="mb-0">
                        <Input placeholder="如：产品图精修" />
                    </Form.Item>
                    <Form.Item name="category" label="分类" className="mb-0">
                        <Select options={(Object.keys(AGENT_CATEGORY_LABELS) as AgentCategory[]).map((key) => ({ value: key, label: AGENT_CATEGORY_LABELS[key] }))} />
                    </Form.Item>
                    <Form.Item name="workflowId" label="workflowId" rules={[{ required: true, message: "请填写 workflowId" }]} className="mb-0">
                        <Input placeholder="如 1862xxxxxxxxxx" />
                    </Form.Item>
                    <Form.Item name="apiKey" label="RunningHub API Key（企业级）" className="mb-0">
                        <Input.Password placeholder="保存后全局生效" />
                    </Form.Item>
                    <Form.Item name="description" label="说明" className="mb-0 md:col-span-2">
                        <Input placeholder="这个工作流做什么" />
                    </Form.Item>
                </div>
                <div className="mt-4">
                    <div className="mb-2 text-sm font-medium">用户可填参数（映射到 nodeInfoList）</div>
                    <div className="space-y-2">
                        {fields.map((field, index) => (
                            <div key={index} className="grid grid-cols-[90px_110px_1fr_96px_32px] items-center gap-2">
                                <Input placeholder="nodeId" value={field.nodeId} onChange={(event) => setFields((current) => current.map((item, i) => (i === index ? { ...item, nodeId: event.target.value } : item)))} />
                                <Input placeholder="fieldName" value={field.fieldName} onChange={(event) => setFields((current) => current.map((item, i) => (i === index ? { ...item, fieldName: event.target.value } : item)))} />
                                <Input placeholder="展示名（如：主体描述）" value={field.label} onChange={(event) => setFields((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))} />
                                <Select value={field.kind} options={[{ value: "text", label: "文本" }, { value: "image", label: "图片URL" }]} onChange={(kind) => setFields((current) => current.map((item, i) => (i === index ? { ...item, kind } : item)))} />
                                <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} disabled={fields.length <= 1} onClick={() => setFields((current) => current.filter((_, i) => i !== index))} />
                            </div>
                        ))}
                    </div>
                    <Button type="dashed" size="small" className="mt-2" icon={<Plus className="size-3.5" />} onClick={() => setFields((current) => [...current, { nodeId: "", fieldName: "", label: "", kind: "text" }])}>
                        添加参数
                    </Button>
                </div>
            </Form>
        </Modal>
    );
}
