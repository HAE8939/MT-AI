import { useEffect, useState } from "react";
import { Button, Input, Modal, Popconfirm, Select } from "antd";
import { Pencil, Plus, RotateCcw, Trash2, WandSparkles } from "lucide-react";

import { useRoleStore, type AiRole } from "@/stores/use-role-store";

type RoleDraft = Omit<AiRole, "id"> & { id?: string };
const emptyDraft: RoleDraft = { name: "", description: "", systemPrompt: "" };

export function CanvasRoleWorkflowDialog({ selectedNodes, open, onClose, onRun }: { selectedNodes: Array<{ id: string; title: string; type: string }>; open: boolean; onClose: () => void; onRun: (role: AiRole, instruction: string) => void }) {
    const roles = useRoleStore((state) => state.roles);
    const addRole = useRoleStore((state) => state.addRole);
    const updateRole = useRoleStore((state) => state.updateRole);
    const removeRole = useRoleStore((state) => state.removeRole);
    const restoreBuiltIns = useRoleStore((state) => state.restoreBuiltIns);
    const [roleId, setRoleId] = useState("");
    const [instruction, setInstruction] = useState("");
    const [manageOpen, setManageOpen] = useState(false);
    const [draft, setDraft] = useState<RoleDraft>(emptyDraft);

    useEffect(() => {
        if (!open) return;
        setRoleId((current) => roles.some((role) => role.id === current) ? current : roles[0]?.id || "");
        setInstruction("");
    }, [open, roles]);

    const saveDraft = () => {
        const input = { name: draft.name.trim(), description: draft.description.trim(), systemPrompt: draft.systemPrompt.trim() };
        if (!input.name || !input.systemPrompt) return;
        if (draft.id) updateRole(draft.id, input);
        else setRoleId(addRole(input));
        setDraft(emptyDraft);
    };

    const selectedRole = roles.find((role) => role.id === roleId);
    return (
        <>
            <Modal title="专业角色工作流" open={open} onCancel={onClose} footer={null} width={760} centered destroyOnHidden>
                <div className="space-y-4">
                    <div className="rounded-md bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">将读取当前选中的 {selectedNodes.length} 个节点，分析结果会作为新的文本节点插入画布。</div>
                    <div className="flex gap-2"><Select className="min-w-0 flex-1" value={roleId || undefined} placeholder="选择专业角色" options={roles.map((role) => ({ value: role.id, label: `${role.name} · ${role.description}` }))} onChange={setRoleId} /><Button icon={<Pencil className="size-4" />} onClick={() => setManageOpen(true)}>管理角色</Button></div>
                    <Input.TextArea rows={5} value={instruction} placeholder="补充本次任务要求；留空时按角色默认职责分析选中节点" onChange={(event) => setInstruction(event.target.value)} />
                    <div className="flex justify-end"><Button type="primary" size="large" icon={<WandSparkles className="size-4" />} disabled={!selectedRole || !selectedNodes.length} onClick={() => selectedRole && onRun(selectedRole, instruction.trim())}>执行分析</Button></div>
                </div>
            </Modal>
            <Modal title="管理专业角色" open={manageOpen} onCancel={() => setManageOpen(false)} footer={null} width={860} centered>
                <div className="grid gap-5 md:grid-cols-[280px_1fr]">
                    <div className="space-y-1 border-r pr-4">
                        {roles.map((role) => <div key={role.id} className="flex items-center gap-1 rounded-md px-2 py-2 hover:bg-stone-100 dark:hover:bg-stone-900"><button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setDraft(role)}>{role.name}</button><Popconfirm title="删除这个角色？" onConfirm={() => removeRole(role.id)}><Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} /></Popconfirm></div>)}
                        <Button type="dashed" block icon={<Plus className="size-4" />} onClick={() => setDraft(emptyDraft)}>新建角色</Button>
                        <Button type="text" block icon={<RotateCcw className="size-4" />} onClick={restoreBuiltIns}>恢复内置角色</Button>
                    </div>
                    <div className="space-y-3"><Input value={draft.name} placeholder="角色名称" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><Input value={draft.description} placeholder="角色说明" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /><Input.TextArea rows={12} value={draft.systemPrompt} placeholder="System Prompt" onChange={(event) => setDraft((current) => ({ ...current, systemPrompt: event.target.value }))} /><div className="flex justify-end"><Button type="primary" disabled={!draft.name.trim() || !draft.systemPrompt.trim()} onClick={saveDraft}>保存角色</Button></div></div>
                </div>
            </Modal>
        </>
    );
}
