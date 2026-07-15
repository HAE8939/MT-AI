/**
 * 灵感画廊数据：public/gallery.json 由 scripts/build-gallery.mjs 生成，
 * 数据来自 NanoBanana Trending Prompts（CC BY 4.0, © MeiGen.ai），体积较大（约 2.5MB），
 * 仅在画廊入口首次打开时按需加载，模块级缓存避免重复请求。
 */

export type GalleryItem = {
    id: string;
    title: string;
    prompt: string;
    coverUrl: string;
    tags: string[];
    author: string;
    likes: number;
    views: number;
    score: number;
    date: string;
    sourceUrl: string;
};

export type GalleryAttribution = {
    name: string;
    author: string;
    url: string;
    license: string;
    licenseUrl: string;
};

export type GalleryData = {
    version: number;
    generatedAt: string;
    attribution: GalleryAttribution;
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
    if (!response.ok) throw new Error(`加载灵感画廊失败：HTTP ${response.status}`);
    const data = (await response.json()) as GalleryData;
    if (!Array.isArray(data?.items)) throw new Error("灵感画廊数据格式不正确");
    return data;
}
