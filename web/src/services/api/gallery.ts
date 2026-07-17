import type { PromptColor, PromptComboCard } from "@/stores/use-prompt-store";

/**
 * 灵感广场数据：public/gallery.json 为项目内置、手工维护的室内行业灵感库，
 * 按场景分类（SU转写实/室内效果图/商业空间/建筑外观/景观规划/软装与材质/视角与分镜/组合模板/专业角色），
 * 条目带空间/风格标签，组合模板类条目带组合卡片 cards。
 * 只在广场首次打开时按需加载，模块级缓存避免重复请求。
 */

export type GalleryItem = {
    id: string;
    title: string;
    prompt: string;
    /** 场景分类，对应 GalleryData.categories */
    category: string;
    /** 空间 / 风格标签 */
    tags: string[];
    /** 组合卡片（组合模板分类使用） */
    cards?: PromptComboCard[];
    /** 马卡龙卡片配色 */
    color?: PromptColor;
};

export type GalleryData = {
    version: number;
    generatedAt: string;
    categories: string[];
    items: GalleryItem[];
};

let galleryCache: Promise<GalleryData> | null = null;

export function loadGallery(): Promise<GalleryData> {
    if (!galleryCache) {
        galleryCache = fetchGallery().catch((error) => {
            galleryCache = null;
            throw error;
        });
    }
    return galleryCache;
}

async function fetchGallery(): Promise<GalleryData> {
    const base = import.meta.env.BASE_URL || "/";
    const response = await fetch(`${base}gallery.json`);
    if (!response.ok) throw new Error(`加载灵感广场失败：HTTP ${response.status}`);
    const data = (await response.json()) as GalleryData;
    if (!Array.isArray(data?.items)) throw new Error("灵感广场数据格式不正确");
    return data;
}
