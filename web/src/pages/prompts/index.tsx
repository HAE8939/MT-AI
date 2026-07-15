import { CopyPlus, Download, FolderCog, Plus, RotateCcw, Search, Sparkles, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { App, Button, Dropdown, Empty, Input, Modal, Spin, Tag } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { usePromptList, UNGROUPED_OPTION } from "@/components/prompts/use-prompt-list";
import { getPromptText, isComboPrompt } from "@/components/prompts/prompt-combo";
import { buildExportFile, downloadPromptJson, parseImportJson } from "@/components/prompts/prompt-io";
import { GalleryDialog } from "./components/gallery-dialog";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { PromptEditorDialog } from "./components/prompt-editor-dialog";
import { PromptGroupManagerDialog } from "./components/prompt-group-manager-dialog";
import { duplicatePrompt, removePrompt } from "@/services/api/prompts";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/use-asset-store";
import { usePromptStore } from "@/stores/use-prompt-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedGroup, setSelectedGroup] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
    const [groupManagerOpen, setGroupManagerOpen] = useState(false);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const prompts = usePromptStore((s) => s.prompts);
    const jsonIds = usePromptStore((s) => s.jsonIds);
    const deletedJsonIds = usePromptStore((s) => s.deletedJsonIds);
    const restoreJsonPrompt = usePromptStore((s) => s.restoreJsonPrompt);
    const importPrompts = usePromptStore((s) => s.importPrompts);
    const { items: promptItems, tags: promptTags, groups: groupInfo, total: totalPrompts, isLoading } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory, group: selectedGroup });

    const groupTabs = useMemo(() => {
        const tabs = [ALL_PROMPTS_OPTION, ...groupInfo.names];
        if (groupInfo.hasUngrouped) tabs.push(UNGROUPED_OPTION);
        return tabs;
    }, [groupInfo]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const copyPromptText = (item: Prompt) => copyText(getPromptText(item), isComboPrompt(item) ? "组合提示词已复制" : "提示词已复制");

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, data: { content: getPromptText(item) } });
        message.success("已加入我的素材");
    };

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
        const isJson = jsonIds.includes(item.id);
        Modal.confirm({
            title: isJson ? "隐藏提示词" : "删除提示词",
            content: isJson ? `确定要隐藏「${item.title}」吗？此提示词来自项目文件，重新加载页面后可自动恢复。` : `确定要删除「${item.title}」吗？此操作不可撤销。`,
            okText: isJson ? "隐藏" : "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                removePrompt(item.id);
                message.success(isJson ? "已隐藏" : "已删除");
                if (selectedPrompt?.id === item.id) setSelectedPrompt(null);
            },
        });
    };

    const handleRestore = (id: string) => {
        restoreJsonPrompt(id);
        message.success("已恢复");
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
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
                <div className="pb-8">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">提示词中心</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">共 {totalPrompts} 条提示词，支持组合式键值卡片、分组与 JSON 导入导出。</p>
                    </div>
                    {isLoading ? (
                        <div className="flex h-60 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    {!isLoading ? (
                        <>
                            <div className="mx-auto mt-8 flex w-full max-w-3xl flex-wrap items-center gap-3">
                                <Input size="large" className="min-w-[220px] flex-1" prefix={<Search className="size-4 text-stone-400" />} value={titleKeyword} placeholder="按标题查询" onChange={(event) => setTitleKeyword(event.target.value)} />
                                <Button type="primary" size="large" icon={<Plus className="size-4" />} onClick={openCreateEditor}>
                                    新建提示词
                                </Button>
                                <Button size="large" icon={<Sparkles className="size-4" />} onClick={() => setGalleryOpen(true)}>
                                    灵感画廊
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
                                <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
                            </div>

                            {groupTabs.length > 1 ? (
                                <div className="mx-auto mt-6 flex max-w-6xl flex-wrap gap-2">
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
                                <div className="mx-auto mt-6 grid max-w-6xl gap-3 text-left">
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
                        <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {promptItems.map((item) => (
                                <PromptCard
                                    key={item.id}
                                    item={item}
                                    onOpen={() => setSelectedPrompt(item)}
                                    onCopy={() => copyPromptText(item)}
                                    onEdit={() => openEditEditor(item)}
                                    onDelete={() => handleDelete(item)}
                                    extraAction={
                                        <Button size="small" icon={<CopyPlus className="size-3.5" />} onClick={() => handleDuplicate(item)}>
                                            复制卡片
                                        </Button>
                                    }
                                />
                            ))}
                        </div>
                        {promptItems.length === 0 && totalPrompts === 0 && deletedJsonIds.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有提示词，编辑 public/prompts.json 或点击「新建提示词」开始创建" className="py-16" />
                        ) : promptItems.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-16" />
                        ) : null}

                        {deletedJsonIds.length > 0 ? (
                            <div className="mx-auto mt-8 max-w-7xl rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900">
                                <div className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">已隐藏的项目内置提示词（{deletedJsonIds.length} 条）</div>
                                <div className="flex flex-wrap gap-2">
                                    {deletedJsonIds.map((id) => (
                                        <Tag
                                            key={id}
                                            closable
                                            onClose={(e) => {
                                                e.preventDefault();
                                                handleRestore(id);
                                            }}
                                            className="text-xs"
                                        >
                                            <RotateCcw className="mr-1 inline size-3" />
                                            {id}
                                        </Tag>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </main>

            <PromptDetailDialog
                prompt={selectedPrompt}
                isJsonPrompt={selectedPrompt ? jsonIds.includes(selectedPrompt.id) : false}
                onClose={() => setSelectedPrompt(null)}
                onCopy={(prompt) => copyText(prompt, "提示词已复制")}
                onSaveAsset={savePromptAsset}
                onEdit={openEditEditor}
                onDelete={handleDelete}
            />
            <PromptEditorDialog open={editorOpen} prompt={editingPrompt} onClose={() => setEditorOpen(false)} />
            <PromptGroupManagerDialog open={groupManagerOpen} onClose={() => setGroupManagerOpen(false)} />
            <GalleryDialog open={galleryOpen} onClose={() => setGalleryOpen(false)} />
        </div>
    );
}
