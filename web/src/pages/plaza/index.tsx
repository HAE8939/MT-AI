import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Modal, Pagination, Spin, Tag } from "antd";
import { BookmarkPlus, ExternalLink, Search } from "lucide-react";

import { PromptCard } from "@/components/prompts/prompt-card";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { loadGallery, type GalleryData, type GalleryItem } from "@/services/api/gallery";
import { GALLERY_GROUP, usePromptStore } from "@/stores/use-prompt-store";
import type { Prompt } from "@/services/api/prompts";

const GALLERY_PAGE_SIZE = 24;
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

/** 灵感广场：只读公共内容源，条目只有「复制提示词」和「收藏」两个动作，收藏落入「我的→收藏」 */
export default function PlazaPage() {
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
        if (data) return;
        setLoadError("");
        loadGallery()
            .then(setData)
            .catch((error) => setLoadError(error instanceof Error ? error.message : "加载灵感广场失败"));
    }, [data]);

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

    const saveToFavorites = (item: GalleryItem) => {
        const { added } = importPrompts([toPrompt(item)]);
        if (added > 0) message.success(`「${item.title}」已收藏，可在「我的」中查看`);
        else message.info("该条目已收藏过（或与已隐藏的内置条目重复）");
    };

    const categoryTabs = [ALL_CATEGORY, ...(data?.categories || [])];

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
                <div className="mx-auto max-w-5xl text-center">
                    <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">灵感广场</h1>
                    <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">浏览热门提示词灵感，复制到画布使用，或收藏到「我的」。</p>
                </div>

                <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center gap-3">
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

                <div className="mx-auto mt-6 max-w-7xl">
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
                            <Spin tip="正在加载灵感广场数据…" />
                        </div>
                    ) : pageItems.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的灵感" className="py-16" />
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {pageItems.map((item) => {
                                const saved = libraryIds.has(item.id);
                                return (
                                    <PromptCard
                                        key={item.id}
                                        item={toPrompt(item)}
                                        onOpen={() => setDetail(item)}
                                        onCopy={() => copyText(item.prompt, "提示词已复制，请到画布中粘贴使用")}
                                        extraAction={
                                            <Button size="small" type="primary" ghost disabled={saved} icon={<BookmarkPlus className="size-3.5" />} onClick={() => saveToFavorites(item)}>
                                                {saved ? "已收藏" : "收藏"}
                                            </Button>
                                        }
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="mx-auto mt-6 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4 dark:border-stone-700">
                    {data ? (
                        <a href={data.attribution.url} target="_blank" rel="noreferrer" className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
                            灵感数据来自 {data.attribution.name} © {data.attribution.author} · <span className="underline">{data.attribution.license}</span>
                        </a>
                    ) : (
                        <span />
                    )}
                    {filtered.length > GALLERY_PAGE_SIZE ? <Pagination current={page} total={filtered.length} pageSize={GALLERY_PAGE_SIZE} showSizeChanger={false} onChange={setPage} /> : null}
                </div>
            </main>

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
                                <Button onClick={() => detail && copyText(detail.prompt, "提示词已复制，请到画布中粘贴使用")}>复制</Button>
                                <Button type="primary" disabled={libraryIds.has(detail.id)} icon={<BookmarkPlus className="size-3.5" />} onClick={() => saveToFavorites(detail)}>
                                    {libraryIds.has(detail.id) ? "已收藏" : "收藏"}
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
        </div>
    );
}
