import { useEffect, useState } from "react";
import { Button, Input, Modal, Popconfirm, Select } from "antd";
import { Pencil, Plus, RotateCcw, Trash2, WandSparkles } from "lucide-react";

import { useAgentTemplateStore } from "@/stores/use-agent-template-store";
import type { AgentTemplate } from "@/types/workflow";

// 画布「文档智能体」入口：原「专业角色工作流」，读取选中节点、按模板 systemPrompt 分析并产出文本节点。
// 模板数据来自智能体模板库（文档分类），与智能体页共享。

export type DocAgentRunTarget = { id: string; name: string; systemPrompt: string };

type TemplateDraft = { id?: string; name: string; description: string; systemPrompt: string; avatar: string };
const emptyDraft: TemplateDraft = { name: "", description: "", systemPrompt: "", avatar: "" };
const AVATAR_PRESETS = ["🎨", "📸", "✨", "🌇", "🙃", "🕸️", "🌈", "🧠", "🎬", "🏠", "🪄", "📐", "🖌️", "💡", "📷", "🤖"];

function docTemplates(templates: AgentTemplate[]) {
    return templates.filter((item): item is AgentTemplate & { spec: { kind: "doc-analysis"; systemPrompt: string } } => item.spec.kind === "doc-analysis");
}

export function CanvasRoleWorkflowDialog({ selectedNodes, open, onClose, onRun }: { selectedNodes: Array<{ id: string; title: string; type: string }>; open: boolean; onClose: () => void; onRun: (target: DocAgentRunTarget, instruction: string) => void }) {
    const templates = useAgentTemplateStore((state) => state.templates);
    const addTemplate = useAgentTemplateStore((state) => state.addTemplate);
    const updateTemplate = useAgentTemplateStore((state) => state.updateTemplate);
    const removeTemplate = useAgentTemplateStore((state) => state.removeTemplate);
    const restoreBuiltins = useAgentTemplateStore((state) => state.restoreBuiltins);
    const docs = docTemplates(templates);
    const [templateId, setTemplateId] = useState("");
    const [instruction, setInstruction] = useState("");
    const [manageOpen, setManageOpen] = useState(false);
    const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);

    useEffect(() => {
        if (!open) return;
        setTemplateId((current) => (docs.some((item) => item.id === current) ? current : docs[0]?.id || ""));
        setInstruction("");
        // docs 每次渲染都是新数组，仅在弹窗打开与模板数量变化时重算
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, templates.length]);

    const saveDraft = () => {
        const name = draft.name.trim();
        const systemPrompt = draft.systemPrompt.trim();
        if (!name || !systemPrompt) return;
        const patch = { name, description: draft.description.trim(), avatar: draft.avatar.trim() || undefined };
        if (draft.id) updateTemplate(draft.id, { ...patch, spec: { kind: "doc-analysis", systemPrompt } });
        else setTemplateId(addTemplate({ ...patch, description: patch.description, category: "document", spec: { kind: "doc-analysis", systemPrompt } }));
        setDraft(emptyDraft);
    };

    const selected = docs.find((item) => item.id === templateId);
    return (
        <>
            <Modal title="文档智能体" open={open} onCancel={onClose} footer={null} width={760} centered destroyOnHidden>
                <div className="space-y-4">
                    <div className="rounded-md bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">将读取当前选中的 {selectedNodes.length} 个节点，分析结果会作为新的文本节点插入画布。</div>
                    <div className="flex gap-2">
                        <Select className="min-w-0 flex-1" value={templateId || undefined} placeholder="选择文档智能体" options={docs.map((item) => ({ value: item.id, label: `${item.avatar ? `${item.avatar} ` : ""}${item.name}${item.description ? ` · ${item.description}` : ""}` }))} onChange={setTemplateId} />
                        <Button icon={<Pencil className="size-4" />} onClick={() => setManageOpen(true)}>管理</Button>
                    </div>
                    <Input.TextArea rows={5} value={instruction} placeholder="补充本次任务要求；留空时按智能体默认职责分析选中节点" onChange={(event) => setInstruction(event.target.value)} />
                    <div className="flex justify-end">
                        <Button type="primary" size="large" icon={<WandSparkles className="size-4" />} disabled={!selected || !selectedNodes.length} onClick={() => selected && onRun({ id: selected.id, name: selected.name, systemPrompt: selected.spec.systemPrompt }, instruction.trim())}>
                            执行分析
                        </Button>
                    </div>
                </div>
            </Modal>
            <Modal title="管理文档智能体" open={manageOpen} onCancel={() => setManageOpen(false)} footer={null} width={860} centered>
                <div className="grid gap-5 md:grid-cols-[280px_1fr]">
                    <div className="space-y-1 border-r pr-4">
                        {docs.map((item) => (
                            <div key={item.id} className="flex items-center gap-1 rounded-md px-2 py-2 hover:bg-stone-100 dark:hover:bg-stone-900">
                                <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm" onClick={() => setDraft({ id: item.id, name: item.name, description: item.description, systemPrompt: item.spec.systemPrompt, avatar: item.avatar || "" })}>
                                    <span className="w-5 shrink-0 text-center">{item.avatar || "👤"}</span>
                                    <span className="min-w-0 truncate">{item.name}</span>
                                </button>
                                <Popconfirm title="删除这个智能体？" onConfirm={() => removeTemplate(item.id)}>
                                    <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} />
                                </Popconfirm>
                            </div>
                        ))}
                        <Button type="dashed" block icon={<Plus className="size-4" />} onClick={() => setDraft(emptyDraft)}>新建</Button>
                        <Button type="text" block icon={<RotateCcw className="size-4" />} onClick={restoreBuiltins}>恢复内置</Button>
                    </div>
                    <div className="space-y-3">
                        <Input value={draft.name} placeholder="名称" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                        <Input value={draft.description} placeholder="说明" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-100 text-base dark:bg-stone-900">{draft.avatar.trim() || "👤"}</span>
                            {AVATAR_PRESETS.map((emoji) => (
                                <button key={emoji} type="button" className={`grid size-8 place-items-center rounded-md text-base transition hover:bg-stone-100 dark:hover:bg-stone-900 ${draft.avatar === emoji ? "bg-stone-100 dark:bg-stone-900" : ""}`} onClick={() => setDraft((current) => ({ ...current, avatar: emoji }))}>
                                    {emoji}
                                </button>
                            ))}
                            <Input className="!w-24" value={draft.avatar} maxLength={4} placeholder="自定义" onChange={(event) => setDraft((current) => ({ ...current, avatar: event.target.value }))} />
                            {draft.avatar ? <Button type="text" size="small" onClick={() => setDraft((current) => ({ ...current, avatar: "" }))}>清除头像</Button> : null}
                        </div>
                        <Input.TextArea rows={10} value={draft.systemPrompt} placeholder="System Prompt" onChange={(event) => setDraft((current) => ({ ...current, systemPrompt: event.target.value }))} />
                        <div className="flex justify-end">
                            <Button type="primary" disabled={!draft.name.trim() || !draft.systemPrompt.trim()} onClick={saveDraft}>保存</Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
}
