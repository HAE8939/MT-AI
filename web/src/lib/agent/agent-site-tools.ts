import type { NavigateFunction } from "react-router-dom";

import { fetchPrompts } from "@/services/api/prompts";
import { uploadImage } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";

// 在网页端执行 Agent 的「站点级」工具（画布列表、提示词搜索、素材增删查等）。
// 这些工具的数据都在浏览器本地（localforage / zustand），因此由本模块直接读写对应 store 后返回结果。

export const SITE_TOOL_NAMES = [
    "canvas_list_projects",
    "prompts_search",
    "assets_list",
    "assets_add",
] as const;

export type SiteToolName = (typeof SITE_TOOL_NAMES)[number];

export function isSiteTool(name: string): name is SiteToolName {
    return (SITE_TOOL_NAMES as readonly string[]).includes(name);
}

export const SITE_TOOL_LABELS: Record<SiteToolName, string> = {
    canvas_list_projects: "画布列表",
    prompts_search: "搜索提示词",
    assets_list: "素材列表",
    assets_add: "添加素材",
};

type SiteToolInput = Record<string, unknown>;

export async function runSiteTool(name: SiteToolName, input: SiteToolInput, navigate: NavigateFunction): Promise<unknown> {
    void navigate;
    switch (name) {
        case "canvas_list_projects":
            return listCanvasProjects(input);
        case "prompts_search":
            return searchPrompts(input);
        case "assets_list":
            return listAssets(input);
        case "assets_add":
            return addAsset(input);
        default:
            throw new Error(`未知工具：${name}`);
    }
}

function listCanvasProjects(input: SiteToolInput) {
    const { projects, hydrated } = useCanvasStore.getState();
    if (!hydrated) throw new Error("画布还在加载中，请稍后重试");
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = keyword ? projects.filter((project) => project.title.toLowerCase().includes(keyword)) : projects;
    const { page, pageSize, start, end } = paginate(input, filtered.length, 20);
    const items = filtered.slice(start, end).map((project) => ({
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        nodeCount: project.nodes.length,
        connectionCount: project.connections.length,
    }));
    return { total: filtered.length, page, pageSize, items, hint: "用 site_navigate 跳转 /canvas/{id} 打开对应画布" };
}

async function searchPrompts(input: SiteToolInput) {
    const page = Math.max(1, Math.floor(Number(input.page)) || 1);
    const pageSize = Math.max(1, Math.min(50, Math.floor(Number(input.pageSize)) || 20));
    const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const result = await fetchPrompts({ keyword: String(input.keyword || ""), category: String(input.category || "全部"), tag: tags, page, pageSize });
    return {
        total: result.total,
        page,
        pageSize,
        categories: result.categories,
        tags: result.tags.slice(0, 60),
        items: result.items.map((prompt) => ({ id: prompt.id, title: prompt.title, prompt: prompt.prompt, tags: prompt.tags, coverUrl: prompt.coverUrl })),
    };
}

function listAssets(input: SiteToolInput) {
    const { assets, hydrated } = useAssetStore.getState();
    if (!hydrated) throw new Error("素材还在加载中，请稍后重试");
    const kind = input.kind === "text" || input.kind === "image" || input.kind === "video" ? input.kind : "all";
    const keyword = String(input.keyword || "").trim().toLowerCase();
    const filtered = assets.filter((asset) => {
        if (kind !== "all" && asset.kind !== kind) return false;
        if (!keyword) return true;
        return [asset.title, asset.note, asset.source, ...asset.tags].filter(Boolean).join(" ").toLowerCase().includes(keyword);
    });
    const { page, pageSize, start, end } = paginate(input, filtered.length, 20);
    const items = filtered.slice(start, end).map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        title: asset.title,
        tags: asset.tags,
        source: asset.source,
        note: asset.note,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        coverUrl: asset.coverUrl || undefined,
        content: asset.kind === "text" ? asset.data.content : undefined,
    }));
    return { total: filtered.length, page, pageSize, items };
}

async function addAsset(input: SiteToolInput) {
    const kind = input.kind;
    const title = String(input.title || "").trim();
    if (!title) throw new Error("请提供素材标题 title");
    const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const source = typeof input.source === "string" ? input.source : "Agent";
    const note = typeof input.note === "string" ? input.note : undefined;
    const store = useAssetStore.getState();
    if (kind === "text") {
        const content = String(input.content || "").trim();
        if (!content) throw new Error("kind=text 时需要提供 content 文本内容");
        const id = store.addAsset({ kind: "text", title, coverUrl: "", tags, source, note, data: { content } });
        return { ok: true, id, kind: "text" };
    }
    if (kind === "image") {
        const imageUrl = String(input.imageUrl || "").trim();
        if (!imageUrl) throw new Error("kind=image 时需要提供 imageUrl（图片地址或 dataURL）");
        let stored;
        try {
            stored = await uploadImage(imageUrl);
        } catch {
            throw new Error("无法读取该图片地址，请改用 dataURL 或可跨域访问的图片链接");
        }
        const id = store.addAsset({ kind: "image", title, coverUrl: stored.url, tags, source, note, data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType } });
        return { ok: true, id, kind: "image" };
    }
    throw new Error("assets_add 仅支持 kind=text 或 kind=image");
}

function paginate(input: SiteToolInput, total: number, defaultSize: number) {
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize)) || defaultSize));
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(maxPage, Math.max(1, Math.floor(Number(input.page)) || 1));
    const start = (page - 1) * pageSize;
    return { page, pageSize, start, end: start + pageSize };
}
