import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Modal, Pagination, Spin, Tag } from "antd";
import { BookmarkPlus, ExternalLink, Search } from "lucide-react";

import { PromptCard } from "@/components/prompts/prompt-card";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { loadGallery, type GalleryData, type GalleryItem } from "@/services/api/gallery";
import { usePromptStore } from "@/stores/use-prompt-store";
import type { Prompt } from "@/services/api/prompts";

const GALLERY_PAGE_SIZE = 24;
/** 与 scripts/build-gallery.mjs 精选子集使用同一分组，收入后与内置精选合并展示 */
const GALLERY_GROUP = "灵感精选";
const ALL_CATEGORY = "全部";

function toPrompt(item: GalleryItem): Prompt {
    const iso = item.date ? `${item.date}T00:00:00.000Z` : new Date().toISOString();
    return {
        id: item.id,
        title: item.title,
        coverUrl: item.coverUrl,
        prompt: item.prompt,
        tags: item.tags,
        createdAt: iso,
        updatedAt: iso,
        group: GALLERY_GROUP,
    };
}

function formatCount(value: number) {
    return value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value.toLocaleString();
}

export function GalleryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [data, setData] = useState<GalleryData | null>(null);
    const [loadError, setLoadError] = useState("");
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState(ALL_CATEGORY);
    const [page, setPage] = useState(1);
    const [detail, setDetail] = useState<GalleryItem | null>(null);

    const prompts = usePromptStore((s) => s.prompts);
    const importPrompts = usePromptStore((s) => s.importPrompts);
    const libraryIds = useMemo(() => new Set(prompts.map((p) => p.id)), [prompts]);

    useEffect(() => {
        if (!open || data) return;
        setLoadError("");
        loadGallery()
            .then(setData)
            .catch((error) => setLoadError(error instanceof Error ? error.message : "加载灵感画廊失败"));
    }, [open, data]);

    const filtered = useMemo(() => {
        if (!data) return [];
        const kw = keyword.trim().toLowerCase();
        return data.items.filter((item) => {
            if (category !== ALL_CATEGORY && !item.tags.includes(category)) return false;
            if (!kw) return true;
            return [item.title, item.prompt, ...item.tags].join(" ").toLowerCase().includes(kw);
        });
    }, [data, keyword, category]);

    const pageItems = useMemo(() => filtered.slice((page - 1) * GALLERY_PAGE_SIZE, page * GALLERY_PAGE_SIZE), [filtered, page]);

    const changeFilter = (next: () => void) => {
        next();
        setPage(1);
    };

    const saveToLibrary = (item: GalleryItem) => {
        const { added } = importPrompts([toPrompt(item)]);
        if (added > 0) message.success(`「${item.title}」已收入我的提示词库（分组：${GALLERY_GROUP}）`);
        else message.info("该提示词已在库中（或与已隐藏的内置条目重复）");
    };

    const categoryTabs = [ALL_CATEGORY, ...(data?.categories || [])];

    return (
        <Modal title="灵感画廊" open={open} onCancel={onClose} footer={null} width={1120} centered destroyOnClose>
            <div className="flex flex-wrap items-center gap-3 pt-2">
                <Input className="max-w-xs" prefix={<Search className="size-4 text-stone-400" />} value={keyword} placeholder="搜索标题、正文或标签" allowClear onChange={(event) => changeFilter(() => setKeyword(event.target.value))} />
                <div className="flex flex-wrap gap-2">
                    {categoryTabs.map((tab) => (
                        <Tag.CheckableTag key={tab} checked={category === tab} className={cn("prompt-filter-tag", category === tab && "is-active")} onChange={() => changeFilter(() => setCategory(tab))}>
                            {tab}
                        </Tag.CheckableTag>
                    ))}
                </div>
                {data ? <span className="ml-auto text-xs text-stone-400">共 {filtered.length} 条</span> : null}
            </div>

            <div className="thin-scrollbar mt-4 max-h-[62vh] min-h-60 overflow-y-auto pr-1">
                {loadError ? (
                    <div className="flex h-60 flex-col items-center justify-center gap-3">
                        <span className="text-sm text-red-500">{loadError}</span>
                        <Button
                            onClick={() => {
                                setData(null);
                                setLoadError("");
                            }}
                        >
                            重试
                        </Button>
                    </div>
                ) : !data ? (
                    <div className="flex h-60 items-center justify-center">
                        <Spin tip="正在加载灵感画廊数据…" />
                    </div>
                ) : pageItems.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的灵感" className="py-16" />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {pageItems.map((item) => {
                            const saved = libraryIds.has(item.id);
                            return (
                                <PromptCard
                                    key={item.id}
                                    item={toPrompt(item)}
                                    onOpen={() => setDetail(item)}
                                    onCopy={() => copyText(item.prompt, "提示词已复制")}
                                    extraAction={
                                        <Button size="small" type="primary" ghost disabled={saved} icon={<BookmarkPlus className="size-3.5" />} onClick={() => saveToLibrary(item)}>
                                            {saved ? "已在库中" : "收入库"}
                                        </Button>
                                    }
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3 dark:border-stone-700">
                {data ? (
                    <a href={data.attribution.url} target="_blank" rel="noreferrer" className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
                        灵感数据来自 {data.attribution.name} © {data.attribution.author} · <span className="underline">{data.attribution.license}</span>
                    </a>
                ) : (
                    <span />
                )}
                {filtered.length > GALLERY_PAGE_SIZE ? <Pagination current={page} total={filtered.length} pageSize={GALLERY_PAGE_SIZE} showSizeChanger={false} onChange={setPage} /> : null}
            </div>

            <Modal
                title={detail?.title}
                open={Boolean(detail)}
                onCancel={() => setDetail(null)}
                width={720}
                centered
                footer={
                    detail ? (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-stone-400">
                                {detail.author ? `@${detail.author} · ` : ""}
                                {formatCount(detail.likes)} 赞 · {formatCount(detail.views)} 浏览
                                {detail.sourceUrl ? (
                                    <a href={detail.sourceUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 hover:text-stone-600 dark:hover:text-stone-300">
                                        原帖 <ExternalLink className="size-3" />
                                    </a>
                                ) : null}
                            </span>
                            <div className="flex gap-2">
                                <Button onClick={() => detail && copyText(detail.prompt, "提示词已复制")}>复制</Button>
                                <Button type="primary" disabled={libraryIds.has(detail.id)} icon={<BookmarkPlus className="size-3.5" />} onClick={() => saveToLibrary(detail)}>
                                    {libraryIds.has(detail.id) ? "已在库中" : "收入我的提示词库"}
                                </Button>
                            </div>
                        </div>
                    ) : null
                }
            >
                {detail ? (
                    <div className="thin-scrollbar max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                        {detail.coverUrl ? <img src={detail.coverUrl} alt={detail.title} className="w-full rounded-lg object-cover" loading="lazy" /> : null}
                        {detail.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {detail.tags.map((tag) => (
                                    <Tag key={tag} className="m-0 text-[11px]">
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        ) : null}
                        <pre className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-xs leading-5 text-stone-700 dark:bg-stone-900 dark:text-stone-300">{detail.prompt}</pre>
                    </div>
                ) : null}
            </Modal>
        </Modal>
    );
}
