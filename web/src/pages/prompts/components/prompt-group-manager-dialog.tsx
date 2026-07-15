import { Check, FolderPlus, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { App, Button, Input, Modal } from "antd";

import { usePromptStore } from "@/stores/use-prompt-store";

/** 分组管理：新建 / 重命名 / 删除（删除后卡片归入未分组） */
export function PromptGroupManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const prompts = usePromptStore((s) => s.prompts);
    const storeGroups = usePromptStore((s) => s.groups);
    const addGroup = usePromptStore((s) => s.addGroup);
    const renameGroup = usePromptStore((s) => s.renameGroup);
    const removeGroup = usePromptStore((s) => s.removeGroup);

    const [newName, setNewName] = useState("");
    const [editingName, setEditingName] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState("");

    const groups = useMemo(() => {
        const names = new Set<string>(storeGroups);
        prompts.forEach((p) => p.group && names.add(p.group));
        return Array.from(names).map((name) => ({
            name,
            count: prompts.filter((p) => p.group === name).length,
        }));
    }, [prompts, storeGroups]);

    const handleAdd = () => {
        const name = newName.trim();
        if (!name) return;
        if (groups.some((g) => g.name === name)) {
            message.warning("该分组已存在");
            return;
        }
        addGroup(name);
        setNewName("");
        message.success("已新建分组");
    };

    const startEdit = (name: string) => {
        setEditingName(name);
        setEditingValue(name);
    };

    const commitEdit = () => {
        if (!editingName) return;
        const next = editingValue.trim();
        if (next && next !== editingName) {
            renameGroup(editingName, next);
            message.success("已重命名");
        }
        setEditingName(null);
    };

    const handleRemove = (name: string, count: number) => {
        Modal.confirm({
            title: "删除分组",
            content: count > 0 ? `确定删除分组「${name}」吗？其中 ${count} 条提示词将归入未分组。` : `确定删除分组「${name}」吗？`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                removeGroup(name);
                message.success("已删除分组");
            },
        });
    };

    return (
        <Modal title="管理分组" open={open} onCancel={onClose} footer={null} width={480} centered>
            <div className="flex gap-2 pt-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} onPressEnter={handleAdd} placeholder="新建分组名称" />
                <Button type="primary" icon={<FolderPlus className="size-4" />} onClick={handleAdd}>
                    新建
                </Button>
            </div>
            <div className="mt-4 space-y-2">
                {groups.length === 0 ? (
                    <div className="py-6 text-center text-sm text-stone-400 dark:text-stone-500">暂无分组</div>
                ) : (
                    groups.map((group) => (
                        <div key={group.name} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
                            {editingName === group.name ? (
                                <>
                                    <Input
                                        size="small"
                                        value={editingValue}
                                        onChange={(e) => setEditingValue(e.target.value)}
                                        onPressEnter={commitEdit}
                                        autoFocus
                                        className="flex-1"
                                    />
                                    <Button size="small" type="text" icon={<Check className="size-3.5" />} onClick={commitEdit} />
                                    <Button size="small" type="text" icon={<X className="size-3.5" />} onClick={() => setEditingName(null)} />
                                </>
                            ) : (
                                <>
                                    <span className="flex-1 truncate text-sm text-stone-800 dark:text-stone-200">{group.name}</span>
                                    <span className="text-xs text-stone-400 dark:text-stone-500">{group.count} 条</span>
                                    <Button size="small" type="text" icon={<Pencil className="size-3.5" />} onClick={() => startEdit(group.name)} />
                                    <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} onClick={() => handleRemove(group.name, group.count)} />
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </Modal>
    );
}
