import { useEffect, useState } from "react";
import { Input, Modal, Select } from "antd";

import { addPrompt, updatePrompt, type Prompt } from "@/services/api/prompts";

const { TextArea } = Input;

export function PromptEditorDialog({ open, prompt, onClose }: { open: boolean; prompt: Prompt | null; onClose: () => void }) {
    const isEdit = Boolean(prompt);
    const [title, setTitle] = useState("");
    const [promptText, setPromptText] = useState("");
    const [tagsInput, setTagsInput] = useState<string[]>([]);
    const [coverUrl, setCoverUrl] = useState("");

    useEffect(() => {
        if (open) {
            setTitle(prompt?.title || "");
            setPromptText(prompt?.prompt || "");
            setTagsInput(prompt?.tags || []);
            setCoverUrl(prompt?.coverUrl || "");
        }
    }, [open, prompt]);

    const handleSave = () => {
        if (!title.trim() || !promptText.trim()) return;
        if (prompt) {
            updatePrompt(prompt.id, { title: title.trim(), prompt: promptText.trim(), tags: tagsInput, coverUrl });
        } else {
            addPrompt({ title: title.trim(), prompt: promptText.trim(), tags: tagsInput, coverUrl });
        }
        onClose();
    };

    return (
        <Modal title={isEdit ? "编辑提示词" : "新建提示词"} open={open} onCancel={onClose} onOk={handleSave} okText="保存" cancelText="取消" width={640} centered destroyOnClose>
            <div className="space-y-4 pt-2">
                <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">名称</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="给提示词起个名字" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">提示词内容</label>
                    <TextArea value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="输入提示词正文" autoSize={{ minRows: 4, maxRows: 12 }} />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">标签</label>
                    <Select mode="tags" value={tagsInput} onChange={setTagsInput} placeholder="输入后回车添加标签" className="w-full" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">封面图片 URL（可选）</label>
                    <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://..." />
                </div>
            </div>
        </Modal>
    );
};
