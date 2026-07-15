import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, AutoComplete, Button, Input, Modal, Select, Space } from "antd";

import { addPrompt, updatePrompt, type Prompt } from "@/services/api/prompts";
import { enhancePromptText } from "@/lib/prompt-enhance";
import { normalizePromptKeys, PROMPT_COLORS, usePromptStore, type PromptColor, type PromptKeyGroup } from "@/stores/use-prompt-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { PROMPT_COLOR_META } from "@/components/prompts/prompt-colors";

const { TextArea } = Input;

const UNGROUPED = "";

/** 编辑器内使用的键值组结构，tags 用逗号/换行分隔字符串便于输入 */
type KeyDraft = { key: string; tagsText: string };

function keysToDrafts(keys?: PromptKeyGroup[]): KeyDraft[] {
    return (keys || []).map((k) => ({ key: k.key, tagsText: k.tags.join(", ") }));
}

function draftsToKeys(drafts: KeyDraft[]): PromptKeyGroup[] | undefined {
    const parsed = drafts.map((d) => ({
        key: d.key.trim(),
        tags: d.tagsText
            .split(/[,，\n]/)
            .map((t) => t.trim())
            .filter(Boolean),
    }));
    return normalizePromptKeys(parsed);
}

export function PromptEditorDialog({ open, prompt, onClose }: { open: boolean; prompt: Prompt | null; onClose: () => void }) {
    const { message } = App.useApp();
    const isEdit = Boolean(prompt);
    const [title, setTitle] = useState("");
    const [promptText, setPromptText] = useState("");
    const [tagsInput, setTagsInput] = useState<string[]>([]);
    const [coverUrl, setCoverUrl] = useState("");
    const [group, setGroup] = useState<string>(UNGROUPED);
    const [color, setColor] = useState<PromptColor | undefined>(undefined);
    const [keyDrafts, setKeyDrafts] = useState<KeyDraft[]>([]);
    const [enhancing, setEnhancing] = useState(false);
    const [enhanceBackup, setEnhanceBackup] = useState<string | null>(null);
    const enhanceAbortRef = useRef<AbortController | null>(null);

    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    const prompts = usePromptStore((s) => s.prompts);
    const storeGroups = usePromptStore((s) => s.groups);
    const groupOptions = useMemo(() => {
        const names = new Set<string>(storeGroups);
        prompts.forEach((p) => p.group && names.add(p.group));
        return Array.from(names).map((name) => ({ value: name }));
    }, [prompts, storeGroups]);

    useEffect(() => {
        if (open) {
            setTitle(prompt?.title || "");
            setPromptText(prompt?.prompt || "");
            setTagsInput(prompt?.tags || []);
            setCoverUrl(prompt?.coverUrl || "");
            setGroup(prompt?.group || UNGROUPED);
            setColor(prompt?.color);
            setKeyDrafts(keysToDrafts(prompt?.keys));
            setEnhanceBackup(null);
        } else {
            enhanceAbortRef.current?.abort();
        }
    }, [open, prompt]);

    useEffect(() => () => enhanceAbortRef.current?.abort(), []);

    const handleEnhance = async () => {
        const input = promptText.trim();
        if (!input || enhancing) return;
        const generationConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(generationConfig, generationConfig.model)) {
            openConfigDialog(true);
            return;
        }
        const controller = new AbortController();
        enhanceAbortRef.current = controller;
        setEnhancing(true);
        setEnhanceBackup(promptText);
        try {
            const answer = await enhancePromptText(generationConfig, input, (value) => setPromptText(value), { signal: controller.signal });
            if (answer?.trim()) setPromptText(answer.trim());
            message.success("提示词已增强，可点击「恢复原文」撤销");
        } catch (error) {
            const canceled = error instanceof Error && (error.message === "请求已取消" || error.name === "AbortError");
            setPromptText(input);
            if (!canceled) message.error(error instanceof Error ? error.message : "提示词增强失败");
        } finally {
            enhanceAbortRef.current = null;
            setEnhancing(false);
        }
    };

    const restoreEnhanceBackup = () => {
        if (enhanceBackup === null) return;
        setPromptText(enhanceBackup);
        setEnhanceBackup(null);
    };

    const addKeyDraft = () => setKeyDrafts((prev) => [...prev, { key: "", tagsText: "" }]);
    const updateKeyDraft = (index: number, patch: Partial<KeyDraft>) => setKeyDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    const removeKeyDraft = (index: number) => setKeyDrafts((prev) => prev.filter((_, i) => i !== index));

    const handleSave = () => {
        const keys = draftsToKeys(keyDrafts);
        // 组合式卡片正文可空，只要有 keys；否则要求正文
        if (!title.trim() || (!promptText.trim() && !keys)) return;
        const payload = {
            title: title.trim(),
            prompt: promptText.trim(),
            tags: tagsInput,
            coverUrl,
            keys,
            group: group.trim() || undefined,
            color,
        };
        if (prompt) {
            updatePrompt(prompt.id, payload);
        } else {
            addPrompt(payload);
        }
        onClose();
    };

    return (
        <Modal title={isEdit ? "编辑提示词" : "新建提示词"} open={open} onCancel={onClose} onOk={handleSave} okText="保存" cancelText="取消" width={680} centered destroyOnClose>
            <div className="thin-scrollbar max-h-[70vh] space-y-4 overflow-y-auto pr-1 pt-2">
                <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">名称</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="给提示词起个名字" />
                </div>
                <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">提示词内容{keyDrafts.length > 0 ? "（组合式卡片可留空，作为前置说明）" : ""}</label>
                        <Space size={4}>
                            {enhanceBackup !== null && !enhancing ? (
                                <Button size="small" type="text" onClick={restoreEnhanceBackup}>
                                    恢复原文
                                </Button>
                            ) : null}
                            <Button size="small" icon={<Sparkles className="size-3.5" />} loading={enhancing} disabled={!promptText.trim()} onClick={handleEnhance}>
                                AI 增强
                            </Button>
                        </Space>
                    </div>
                    <TextArea value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="输入提示词正文" autoSize={{ minRows: 4, maxRows: 12 }} disabled={enhancing} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">分组</label>
                        <AutoComplete
                            className="w-full"
                            value={group}
                            options={groupOptions}
                            onChange={(value) => setGroup(value)}
                            placeholder="未分组（可新建或选择）"
                            allowClear
                            filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">卡片颜色</label>
                        <Select
                            className="w-full"
                            value={color}
                            onChange={(value) => setColor(value)}
                            placeholder="默认（无主题色）"
                            allowClear
                            options={PROMPT_COLORS.map((c) => ({
                                value: c,
                                label: (
                                    <span className="flex items-center gap-2">
                                        <span className="inline-block size-3 rounded-full" style={{ backgroundColor: PROMPT_COLOR_META[c].accent }} />
                                        {PROMPT_COLOR_META[c].label}
                                    </span>
                                ),
                            }))}
                        />
                    </div>
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">标签</label>
                    <Select mode="tags" value={tagsInput} onChange={setTagsInput} placeholder="输入后回车添加标签" className="w-full" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">封面图片 URL（可选）</label>
                    <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://..." />
                </div>

                <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-700 dark:text-stone-300">键值标签组（组合式卡片）</span>
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={addKeyDraft}>
                            添加键
                        </Button>
                    </div>
                    <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">填写后卡片会渲染为可勾选的键值组合构建器，勾选实时组合成 JSON 提示词。留空则为普通文本卡片。</p>
                    {keyDrafts.length === 0 ? (
                        <div className="text-xs text-stone-400 dark:text-stone-500">暂无键值组</div>
                    ) : (
                        <div className="space-y-3">
                            {keyDrafts.map((draft, index) => (
                                <div key={index} className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-start">
                                    <Input value={draft.key} onChange={(e) => updateKeyDraft(index, { key: e.target.value })} placeholder="键名，如 风格" />
                                    <TextArea value={draft.tagsText} onChange={(e) => updateKeyDraft(index, { tagsText: e.target.value })} placeholder="候选值，逗号或换行分隔，如 现代简约, 工业风" autoSize={{ minRows: 1, maxRows: 4 }} />
                                    <Space.Compact>
                                        <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={() => removeKeyDraft(index)} />
                                    </Space.Compact>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
