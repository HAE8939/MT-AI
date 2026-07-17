import { CopyPlus, Download, FolderCog, Plus, Search, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { App, Button, Dropdown, Empty, Input, Modal, Spin, Tag } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { usePromptList, UNGROUPED_OPTION } from "@/components/prompts/use-prompt-list";
import { getPromptText, isComboPrompt } from "@/components/prompts/prompt-combo";
import { buildExportFile, downloadPromptJson, parseImportJson } from "@/components/prompts/prompt-io";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { PromptEditorDialog } from "./components/prompt-editor-dialog";
import { PromptGroupManagerDialog } from "./components/prompt-group-manager-dialog";
import { duplicatePrompt, removePrompt } from "@/services/api/prompts";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { GALLERY_GROUP, usePromptStore } from "@/stores/use-prompt-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

/** 「我的」页提示词分区。mode=favorites 时只展示灵感广场收藏（灵感精选分组），mode=prompts 展示其余提示词。 */
export function PromptsSection({ mode }: { mode: "prompts" | "favorites" }) {
    const { message } = App.useApp();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedGroup, setSelectedGroup] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
    const [groupManagerOpen, setGroupManagerOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const favorites = mode === "favorites";
    const copyText = useCopyText();
    const prompts = usePromptStore((s) => s.prompts);
    const importPrompts = usePromptStore((s) => s.importPrompts);
    const listGroup = favorites ? GALLERY_GROUP : selectedGroup;
    const { items: rawItems, tags: promptTags, groups: groupInfo, total: totalPrompts, isLoading } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory, group: listGroup });
    // 我的提示词分区在「全部」下不重复展示收藏分组（收藏有独立分区）
    const promptItems = useMemo(() => (!favorites && selectedGroup === ALL_PROMPTS_OPTION ? rawItems.filter((item) => item.group !== GALLERY_GROUP) : rawItems), [favorites, rawItems, selectedGroup]);

    const groupTabs = useMemo(() => {
        if (favorites) return [];
        const tabs = [ALL_PROMPTS_OPTION, ...groupInfo.names.filter((name) => name !== GALLERY_GROUP)];
        if (groupInfo.hasUngrouped) tabs.push(UNGROUPED_OPTION);
        return tabs;
    }, [favorites, groupInfo]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const copyPromptText = (item: Prompt) => copyText(getPromptText(item), isComboPrompt(item) ? "组合提示词已复制" : "提示词已复制");

    const openCreateEditor = () => {
        setEditingPrompt(null);
        setEditorOpen(true);
    };

    const openEditEditor = (item: Prompt) => {
        setEditingPrompt(item);
        setEditorOpen(true);
        setSelectedPrompt(null);
    };

    const handleDuplicate = (item: Prompt) => {
        const id = duplicatePrompt(item.id);
        if (id) message.success("已复制为新卡片");
    };

    const handleDelete = (item: Prompt) => {
        Modal.confirm({
            title: "删除提示词",
            content: `确定要删除「${item.title}」吗？此操作不可撤销。`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                removePrompt(item.id);
                message.success("已删除");
                if (selectedPrompt?.id === item.id) setSelectedPrompt(null);
            },
        });
    };

    const exportAll = () => {
        if (prompts.length === 0) return message.info("暂无可导出的提示词");
        downloadPromptJson(buildExportFile(prompts), "prompts-all");
        message.success(`已导出 ${prompts.length} 条提示词`);
    };

    const exportCurrentGroup = () => {
        const scoped = selectedGroup === ALL_PROMPTS_OPTION ? prompts : selectedGroup === UNGROUPED_OPTION ? prompts.filter((p) => !p.group) : prompts.filter((p) => p.group === selectedGroup);
        if (scoped.length === 0) return message.info("当前分组暂无提示词");
        downloadPromptJson(buildExportFile(scoped), `prompts-${selectedGroup}`);
        message.success(`已导出「${selectedGroup}」${scoped.length} 条提示词`);
    };

    const triggerImport = () => fileInputRef.current?.click();

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            const text = await file.text();
            const { prompts: parsed, groups } = parseImportJson(text);
            if (parsed.length === 0) return message.warning("文件中没有可导入的提示词");
            const { added, skipped } = importPrompts(parsed, groups);
            message.success(`导入完成：新增 ${added} 条${skipped > 0 ? `，跳过 ${skipped} 条（重复或无效）` : ""}`);
        } catch {
            message.error("导入失败：文件不是有效的 JSON");
        }
    };

    return (
        <div className="pb-4">
            <div className="pb-6">
                <p className="text-sm text-stone-500 dark:text-stone-400">{favorites ? `共 ${totalPrompts} 条收藏，来自灵感广场。` : `共 ${totalPrompts} 条提示词，支持组合式键值卡片、分组与 JSON 导入导出。`}</p>
                    {isLoading ? (
                        <div className="flex h-60 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    {!isLoading ? (
                        <>
                            <div className="mt-4 flex w-full max-w-3xl flex-wrap items-center gap-3">
                                <Input size="large" className="min-w-[220px] flex-1" prefix={<Search className="size-4 text-stone-400" />} value={titleKeyword} placeholder="按标题查询" onChange={(event) => setTitleKeyword(event.target.value)} />
                                {!favorites ? (
                                    <>
                                        <Button type="primary" size="large" icon={<Plus className="size-4" />} onClick={openCreateEditor}>
                                            新建提示词
                                        </Button>
                                <Dropdown
                                    menu={{
                                        items: [
                                            { key: "export-all", icon: <Download className="size-4" />, label: "导出全部", onClick: exportAll },
                                            { key: "export-group", icon: <Download className="size-4" />, label: `导出当前分组（${selectedGroup}）`, onClick: exportCurrentGroup },
                                            { type: "divider" },
                                            { key: "import", icon: <Upload className="size-4" />, label: "导入 JSON（合并，重复 id 跳过）", onClick: triggerImport },
                                            { type: "divider" },
                                            { key: "groups", icon: <FolderCog className="size-4" />, label: "管理分组", onClick: () => setGroupManagerOpen(true) },
                                        ],
                                    }}
                                >
                                    <Button size="large">数据管理</Button>
                                </Dropdown>
                                    </>
                                ) : null}
                                <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
                            </div>

                            {groupTabs.length > 1 ? (
                                <div className="mt-6 flex max-w-6xl flex-wrap gap-2">
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
                                <div className="mt-6 grid max-w-6xl gap-3 text-left">
                                    <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                        <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">标签</div>
                                        <div className="flex flex-wrap gap-2">
                                            {promptTags.map((tag) => (
                                                <Tag.CheckableTag
                                                    key={tag}
                                                    checked={tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)}
                                                    className={cn("prompt-filter-tag", (tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)) && "is-active")}
                                                    onChange={() => toggleTag(tag)}
                                                >
                                                    {tag}
                                                </Tag.CheckableTag>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : null}
                </div>

                {!isLoading ? (
                    <div>
                        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {promptItems.map((item) => (
                                <PromptCard
                                    key={item.id}
                                    item={item}
                                    onOpen={() => setSelectedPrompt(item)}
                                    onCopy={() => copyPromptText(item)}
                                    onEdit={favorites ? undefined : () => openEditEditor(item)}
                                    onDelete={() => handleDelete(item)}
                                    extraAction={
                                        favorites ? undefined : (
                                            <Button size="small" icon={<CopyPlus className="size-3.5" />} onClick={() => handleDuplicate(item)}>
                                                复制卡片
                                            </Button>
                                        )
                                    }
                                />
                            ))}
                        </div>
                        {promptItems.length === 0 && totalPrompts === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={favorites ? "还没有收藏，去灵感广场逛逛吧" : "还没有提示词，点击「新建提示词」创建，或去灵感广场收藏"} className="py-16" />
                        ) : promptItems.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={favorites ? "还没有收藏，去灵感广场逛逛吧" : "没有找到匹配的提示词"} className="py-16" />
                        ) : null}
                    </div>
                ) : null}

            <PromptDetailDialog
                prompt={selectedPrompt}
                onClose={() => setSelectedPrompt(null)}
                onCopy={(prompt) => copyText(prompt, "提示词已复制")}
                onEdit={favorites ? undefined : openEditEditor}
                onDelete={handleDelete}
            />
            <PromptEditorDialog open={editorOpen} prompt={editingPrompt} onClose={() => setEditorOpen(false)} />
            <PromptGroupManagerDialog open={groupManagerOpen} onClose={() => setGroupManagerOpen(false)} />
        </div>
    );
}
