import { useEffect, useState } from "react";
import { App, Button, Input, Modal, Select } from "antd";
import { Trash2 } from "lucide-react";

import type { LocalWorkflowInputSlot } from "@/types/workflow";

export type SaveLocalWorkflowPayload = { name: string; description: string; inputs: LocalWorkflowInputSlot[] };

export function SaveLocalWorkflowDialog({
    open,
    defaultInputs,
    stepCount,
    onCancel,
    onSave,
}: {
    open: boolean;
    defaultInputs: LocalWorkflowInputSlot[];
    stepCount: number;
    onCancel: () => void;
    onSave: (payload: SaveLocalWorkflowPayload) => void;
}) {
    const { message } = App.useApp();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [inputs, setInputs] = useState<LocalWorkflowInputSlot[]>([]);

    useEffect(() => {
        if (!open) return;
        setName("");
        setDescription("");
        setInputs(defaultInputs);
    }, [open, defaultInputs]);

    const save = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            message.warning("请填写工作流名称");
            return;
        }
        const valid = inputs.filter((slot) => slot.nodeId.trim() && slot.label.trim());
        onSave({ name: trimmed, description: description.trim(), inputs: valid });
    };

    return (
        <Modal title="保存为本地工作流" open={open} onCancel={onCancel} onOk={save} okText="保存" cancelText="取消" width={640} destroyOnHidden>
            <div className="space-y-4">
                <div className="rounded-md bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                    共 {stepCount} 个生成步骤。运行时将按依赖顺序自动串跑，下面标记的输入槽会在运行前让用户填值。
                </div>
                <Input value={name} placeholder="工作流名称（如：产品图两步精修）" onChange={(event) => setName(event.target.value)} />
                <Input value={description} placeholder="说明（可空）" onChange={(event) => setDescription(event.target.value)} />
                <div>
                    <div className="mb-2 text-sm font-medium">输入槽</div>
                    <div className="space-y-2">
                        {inputs.map((slot, index) => (
                            <div key={index} className="grid grid-cols-[1fr_96px_32px] items-center gap-2">
                                <Input
                                    value={slot.label}
                                    placeholder="展示名（如：产品原图）"
                                    onChange={(event) => setInputs((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))}
                                />
                                <Select
                                    value={slot.kind}
                                    options={[{ value: "image", label: "图片" }, { value: "text", label: "文本" }]}
                                    onChange={(kind) => setInputs((current) => current.map((item, i) => (i === index ? { ...item, kind } : item)))}
                                />
                                <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => setInputs((current) => current.filter((_, i) => i !== index))} />
                            </div>
                        ))}
                        {inputs.length === 0 ? <div className="text-xs text-stone-400">未标记输入槽，运行时直接按快照默认值出图。</div> : null}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
