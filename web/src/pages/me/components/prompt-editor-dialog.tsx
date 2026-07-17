import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, AutoComplete, Button, Input, Modal, Select, Space } from "antd";

import { addPrompt, updatePrompt, type Prompt } from "@/services/api/prompts";
import { enhancePromptText } from "@/lib/prompt-enhance";
import { PROMPT_COLORS, usePromptStore, type PromptColor } from "@/stores/use-prompt-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { PROMPT_COLOR_META } from "@/components/prompts/prompt-colors";
import { cardsToDrafts, draftsToCards, extractComboCardsFromText, type ComboCardDraft, type ComboKeyDraft } from "@/components/prompts/prompt-combo";

const { TextArea } = Input;

const UNGROUPED = "";

export function PromptEditorDialog({ open, prompt, onClose }: { open: boolean; prompt: Prompt | null; onClose: () => void }) {
    const { message } = App.useApp();
    const isEdit = Boolean(prompt);
    const [title, setTitle] = useState("");
    const [promptText, setPromptText] = useState("");
    const [tagsInput, setTagsInput] = useState<string[]>([]);
    const [coverUrl, setCoverUrl] = useState("");
    const [group, setGroup] = useState<string>(UNGROUPED);
    const [color, setColor] = useState<PromptColor | undefined>(undefined);
    const [cardDrafts, setCardDrafts] = useState<ComboCardDraft[]>([]);
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState("");
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
            setCardDrafts(cardsToDrafts(prompt?.cards));
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

    const addCardDraft = () => setCardDrafts((prev) => [...prev, { name: "", keys: [{ key: "", tagsText: "" }] }]);
    const updateCardDraft = (index: number, patch: Partial<ComboCardDraft>) => setCardDrafts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    const removeCardDraft = (index: number) => setCardDrafts((prev) => prev.filter((_, i) => i !== index));
    const addKeyDraft = (cardIndex: number) =>
        setCardDrafts((prev) => prev.map((c, i) => (i === cardIndex ? { ...c, keys: [...c.keys, { key: "", tagsText: "" }] } : c)));
    const updateKeyDraft = (cardIndex: number, keyIndex: number, patch: Partial<ComboKeyDraft>) =>
        setCardDrafts((prev) => prev.map((c, i) => (i === cardIndex ? { ...c, keys: c.keys.map((k, ki) => (ki === keyIndex ? { ...k, ...patch } : k)) } : c)));
    const removeKeyDraft = (cardIndex: number, keyIndex: number) =>
        setCardDrafts((prev) => prev.map((c, i) => (i === cardIndex ? { ...c, keys: c.keys.filter((_, ki) => ki !== keyIndex) } : c)));

    const handleImportJson = () => {
        const cards = extractComboCardsFromText(importText);
        if (!cards) {
            message.error("未能从文本中解析出 JSON 提示词");
            return;
        }
        setCardDrafts((prev) => [...prev, ...cardsToDrafts(cards)]);
        setImportOpen(false);
        setImportText("");
        message.success(`已导入 ${cards.length} 张卡片`);
    };

    const handleSave = () => {
        const cards = draftsToCards(cardDrafts);
        // 组合式卡片正文可空，只要有 cards；否则要求正文
        if (!title.trim() || (!promptText.trim() && !cards)) return;
        const payload = {
            title: title.trim(),
            prompt: promptText.trim(),
            tags: tagsInput,
            coverUrl,
            cards,
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
                        <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">提示词内容{cardDrafts.length > 0 ? "（组合式卡片可留空，作为前置说明）" : ""}</label>
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
                        <span className="text-sm font-medium text-stone-700 dark:text-stone-300">组合卡片（组合式提示词）</span>
                        <Space size={4}>
                            <Button size="small" onClick={() => setImportOpen(true)}>
                                从 JSON 导入
                            </Button>
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={addCardDraft}>
                                添加卡片
                            </Button>
                        </Space>
                    </div>
                    <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
                        卡片名作为组合 JSON 的一级键（留空则键值平铺顶层）。候选值每行一个标签：标签名 或 标签名=实际值，行首 * 表示默认勾选。留空则为普通文本卡片。
                    </p>
                    {cardDrafts.length === 0 ? (
                        <div className="text-xs text-stone-400 dark:text-stone-500">暂无组合卡片</div>
                    ) : (
                        <div className="space-y-4">
                            {cardDrafts.map((card, cardIndex) => (
                                <div key={cardIndex} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                                    <div className="mb-2 flex items-center gap-2">
                                        <Input value={card.name} onChange={(e) => updateCardDraft(cardIndex, { name: e.target.value })} placeholder="卡片名，如 场景与光效（可留空）" />
                                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => addKeyDraft(cardIndex)}>
                                            添加键值组
                                        </Button>
                                        <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={() => removeCardDraft(cardIndex)} />
                                    </div>
                                    <div className="space-y-2">
                                        {card.keys.map((draft, keyIndex) => (
                                            <div key={keyIndex} className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-start">
                                                <Input value={draft.key} onChange={(e) => updateKeyDraft(cardIndex, keyIndex, { key: e.target.value })} placeholder="键名，如 风格" />
                                                <TextArea
                                                    value={draft.tagsText}
                                                    onChange={(e) => updateKeyDraft(cardIndex, keyIndex, { tagsText: e.target.value })}
                                                    placeholder={"每行一个标签：标签名 或 标签名=实际值，行首 * 表示默认勾选"}
                                                    autoSize={{ minRows: 1, maxRows: 6 }}
                                                />
                                                <Button danger size="small" icon={<Trash2 className="size-3.5" />} onClick={() => removeKeyDraft(cardIndex, keyIndex)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <Modal title="从 JSON 导入组合卡片" open={importOpen} onCancel={() => setImportOpen(false)} onOk={handleImportJson} okText="导入" cancelText="取消" width={560} centered>
                <TextArea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={'粘贴任意 JSON 提示词（支持 ``` 代码块与前后说明文字），如 {"场景": {"时间": "清晨/黄昏"}}'}
                    autoSize={{ minRows: 8, maxRows: 16 }}
                />
            </Modal>
        </Modal>
    );
}
