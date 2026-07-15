import localforage from "localforage";

import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
import { enqueueCosUpload } from "@/services/media-sync";
import { useCosUploadStore } from "@/stores/use-cos-upload-store";
import type { CosMediaKind } from "@/types/cos-media";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    cosTaskId?: string;
};

type ImageUploadOptions = { kind?: CosMediaKind; fileName?: string; enqueueCos?: boolean };

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const objectUrls = new Map<string, string>();

export async function uploadImage(input: string | Blob, options: ImageUploadOptions = {}): Promise<UploadedImage> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const storageKey = `image:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = await readImageMeta(url);
    const mimeType = blob.type || meta.mimeType;
    const cosTaskId = options.enqueueCos === false ? undefined : enqueueCosUpload({ storageKey, fileName: options.fileName || `image.${mimeExtension(mimeType)}`, mimeType, mediaKind: options.kind || "images" });
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType, cosTaskId };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    enqueueCosUpload({ storageKey, fileName: `image.${mimeExtension(blob.type || "image/png")}`, mimeType: blob.type || "image/png", mediaKind: "images" });
    return url;
}

export type ImageThumbnail = { thumbUrl: string; thumbStorageKey: string };

export async function createImageThumbnail(input: string | Blob, maxSize = 300): Promise<ImageThumbnail | null> {
    const url = typeof input === "string" ? input : URL.createObjectURL(input);
    try {
        const image = await loadImageElement(url);
        if (!image) return null;
        if (image.naturalWidth <= maxSize && image.naturalHeight <= maxSize) return null;
        return await storeThumbnail(image, image.naturalWidth, image.naturalHeight, maxSize);
    } finally {
        if (typeof input !== "string") URL.revokeObjectURL(url);
    }
}

export async function createVideoThumbnail(url: string, maxSize = 300): Promise<ImageThumbnail | null> {
    const video = await loadVideoFrame(url);
    if (!video) return null;
    return storeThumbnail(video, video.videoWidth, video.videoHeight, maxSize);
}

async function storeThumbnail(source: CanvasImageSource, width: number, height: number, maxSize: number): Promise<ImageThumbnail | null> {
    if (!width || !height) return null;
    const ratio = Math.min(1, maxSize / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "medium";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
    if (!blob) return null;
    const thumbStorageKey = `image:${nanoid()}`;
    await store.setItem(thumbStorageKey, blob);
    const thumbUrl = URL.createObjectURL(blob);
    objectUrls.set(thumbStorageKey, thumbUrl);
    return { thumbUrl, thumbStorageKey };
}

function loadImageElement(url: string) {
    return new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 5000);
        image.src = url;
    });
}

function loadVideoFrame(url: string) {
    return new Promise<HTMLVideoElement | null>((resolve) => {
        const video = document.createElement("video");
        let settled = false;
        const finish = (value: HTMLVideoElement | null) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.onerror = () => finish(null);
        video.onloadeddata = () => {
            const target = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 2) : 0;
            if (target <= 0 || video.currentTime >= target) {
                finish(video);
                return;
            }
            video.onseeked = () => finish(video);
            video.currentTime = target;
        };
        setTimeout(() => finish(video.readyState >= 2 ? video : null), 5000);
        video.src = url;
    });
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            useCosUploadStore.getState().cancelByStorageKey(key);
            await store.removeItem(key);
        }),
    );
}

function mimeExtension(mimeType: string) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/svg+xml") return "svg";
    return mimeType.split("/")[1]?.replace("+xml", "") || "png";
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    if ("thumbStorageKey" in value && typeof value.thumbStorageKey === "string" && value.thumbStorageKey.startsWith("image:")) keys.add(value.thumbStorageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}
