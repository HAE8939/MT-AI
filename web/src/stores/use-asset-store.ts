import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { cleanupUnusedImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";
import { enqueueCosUpload } from "@/services/media-sync";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; thumbUrl?: string; thumbStorageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; thumbUrl?: string; thumbStorageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    removeAssets: (ids: string[]) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.assets = await Promise.all(
            parsed.state.assets.map(async (asset) => {
                if (asset.kind === "video" && (asset.data.storageKey || asset.data.thumbStorageKey))
                    return {
                        ...asset,
                        data: {
                            ...asset.data,
                            url: asset.data.storageKey ? await resolveMediaUrl(asset.data.storageKey, asset.data.url) : asset.data.url,
                            thumbUrl: asset.data.thumbStorageKey ? await resolveImageUrl(asset.data.thumbStorageKey, asset.data.thumbUrl) : asset.data.thumbUrl,
                        },
                    };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey)
                    return {
                        ...asset,
                        coverUrl: asset.coverUrl.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl) : asset.coverUrl,
                        data: {
                            ...asset.data,
                            dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl),
                            thumbUrl: asset.data.thumbStorageKey ? await resolveImageUrl(asset.data.thumbStorageKey, asset.data.thumbUrl) : asset.data.thumbUrl,
                        },
                    };
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl);
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            assets: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                enqueueAssetMedia(asset, id);
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => {
                        if (asset.id !== id) return asset;
                        const updated = { ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset;
                        enqueueAssetMedia(updated, id);
                        return updated;
                    }),
                })),
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets };
                }),
            removeAssets: (ids) =>
                set((state) => {
                    const idSet = new Set(ids);
                    const assets = state.assets.filter((asset) => !idSet.has(asset.id));
                    get().cleanupImages({ assets });
                    return { assets };
                }),
            replaceAssets: (assets) => set({ assets }),
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => () => {
                useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);

function enqueueAssetMedia(asset: Omit<Asset, "id" | "createdAt" | "updatedAt"> | Asset, mediaId: string) {
    if (asset.kind === "text" || !asset.data.storageKey) return;
    const mimeType = asset.data.mimeType || (asset.kind === "image" ? "image/png" : "video/mp4");
    enqueueCosUpload({ storageKey: asset.data.storageKey, fileName: `${asset.title || "asset"}.${assetExtension(mimeType)}`, mimeType, mediaKind: "assets", mediaId });
}

function assetExtension(mimeType: string) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "video/quicktime") return "mov";
    return mimeType.split("/")[1]?.replace("+xml", "") || "bin";
}
