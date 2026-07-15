import { Check, Search } from "lucide-react";
import { useState } from "react";
import { Empty, Input, Modal, Spin, Tag } from "antd";

import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { PromptCard } from "./prompt-card";
import { PromptComboBuilder } from "./prompt-combo-builder";
import { isComboPrompt } from "./prompt-combo";
import { usePromptList, UNGROUPED_OPTION } from "./use-prompt-list";

export function PromptSelectDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void }) {
    const [keyword, setKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedGroup, setSelectedGroup] = useState(ALL_PROMPTS_OPTION);
    const [comboPrompt, setComboPrompt] = useState<Prompt | null>(null);
    const { items, tags: promptTags, groups: groupInfo, isLoading } = usePromptList({ keyword, tags: selectedTags, category: selectedCategory, group: selectedGroup, enabled: open });

    const groupTabs = [ALL_PROMPTS_OPTION, ...groupInfo.names, ...(groupInfo.hasUngrouped ? [UNGROUPED_OPTION] : [])];

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const selectPrompt = (prompt: string) => {
        onSelect(prompt);
        onOpenChange(false);
    };

    // 组合式卡片：先打开构建器，勾选后再填充；纯文本卡片：直接填充正文
    const handleUse = (item: Prompt) => {
        if (isComboPrompt(item)) {
            setComboPrompt(item);
        } else {
            selectPrompt(item.prompt);
        }
    };

    return (
        <Modal title={comboPrompt ? comboPrompt.title : "提示词库"} open={open} onCancel={() => { setComboPrompt(null); onOpenChange(false); }} footer={null} width={1040} centered>
            <div data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                {comboPrompt ? (
                    <div className="thin-scrollbar max-h-[560px] overflow-y-auto pr-1">
                        <button type="button" className="mb-4 text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100" onClick={() => setComboPrompt(null)}>
                            ← 返回列表
                        </button>
                        {comboPrompt.prompt.trim() ? (
                            <p className="mb-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{comboPrompt.prompt}</p>
                        ) : null}
                        <PromptComboBuilder prompt={comboPrompt} onUse={(text) => { setComboPrompt(null); selectPrompt(text); }} useLabel="使用此组合" />
                    </div>
                ) : (
                    <>
                        <div className="mx-auto max-w-2xl">
                            <Input size="large" prefix={<Search className="size-4 text-stone-400" />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按标题查询" />
                        </div>
                        {groupTabs.length > 1 ? (
                            <div className="mt-5 flex flex-wrap gap-2">
                                {groupTabs.map((tab) => {
                                    const active = selectedGroup === tab;
                                    return (
                                        <Tag.CheckableTag key={tab} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => setSelectedGroup(tab)}>
                                            {tab}
                                        </Tag.CheckableTag>
                                    );
                                })}
                            </div>
                        ) : null}
                        {promptTags.length > 1 ? (
                            <div className="mt-5 grid gap-3">
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">标签</div>
                                    <div className="flex flex-wrap gap-2">
                                        {promptTags.map((tag) => {
                                            const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                                            return (
                                                <Tag.CheckableTag key={tag} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>
                                                    {tag}
                                                </Tag.CheckableTag>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        <div className="thin-scrollbar mt-6 max-h-[520px] overflow-y-auto pr-2" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                            {isLoading ? (
                                <div className="flex h-40 items-center justify-center">
                                    <Spin />
                                </div>
                            ) : null}
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {items.map((item) => (
                                    <PromptCard
                                        key={item.id}
                                        item={item}
                                        onOpen={() => handleUse(item)}
                                        onCopy={() => handleUse(item)}
                                        actionLabel={isComboPrompt(item) ? "组合并使用" : "使用此提示词"}
                                        actionIcon={<Check className="size-3.5" />}
                                        actionType="primary"
                                    />
                                ))}
                            </div>
                            {!isLoading && items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-8" /> : null}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
