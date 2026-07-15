import { uploadMediaFile } from "@/services/file-storage";
import { createImageThumbnail, createVideoThumbnail, uploadImage } from "@/services/image-storage";
import type { Asset } from "@/stores/use-asset-store";

export type NewAssetInput = Omit<Asset, "id" | "createdAt" | "updatedAt">;

// 将本地文件（图片/视频）转换为可入库的素材数据，并生成缩略图。非图片/视频返回 null。
export async function fileToAssetInput(file: File): Promise<NewAssetInput | null> {
    if (file.type.startsWith("image/")) {
        const image = await uploadImage(file, { fileName: file.name });
        const thumb = await createImageThumbnail(file, 300);
        return {
            kind: "image",
            title: stripExtension(file.name) || "未命名图片",
            coverUrl: image.url,
            tags: [],
            source: "本地导入",
            metadata: { source: "import" },
            data: { dataUrl: image.url, storageKey: image.storageKey, thumbUrl: thumb?.thumbUrl, thumbStorageKey: thumb?.thumbStorageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
        };
    }
    if (file.type.startsWith("video/")) {
        const media = await uploadMediaFile(file, "video", { kind: "videos", fileName: file.name });
        const thumb = await createVideoThumbnail(media.url, 300);
        return {
            kind: "video",
            title: stripExtension(file.name) || "未命名视频",
            coverUrl: "",
            tags: [],
            source: "本地导入",
            metadata: { source: "import" },
            data: { url: media.url, storageKey: media.storageKey, thumbUrl: thumb?.thumbUrl, thumbStorageKey: thumb?.thumbStorageKey, width: media.width || 0, height: media.height || 0, bytes: media.bytes, mimeType: media.mimeType },
        };
    }
    return null;
}

// 从拖拽事件中收集文件，支持文件夹（递归读取目录项）。
export async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
    const items = dataTransfer.items;
    const entries: FileSystemEntry[] = [];
    if (items && items.length) {
        for (let index = 0; index < items.length; index += 1) {
            const entry = items[index].webkitGetAsEntry?.();
            if (entry) entries.push(entry);
        }
    }
    if (entries.length) {
        const collected = await Promise.all(entries.map((entry) => readEntry(entry)));
        return collected.flat();
    }
    return Array.from(dataTransfer.files || []);
}

function readEntry(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile) {
        return new Promise((resolve) => (entry as FileSystemFileEntry).file((file) => resolve([file]), () => resolve([])));
    }
    if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        return new Promise((resolve) => {
            const all: FileSystemEntry[] = [];
            const readBatch = () => {
                reader.readEntries(async (batch) => {
                    if (!batch.length) {
                        const nested = await Promise.all(all.map((child) => readEntry(child)));
                        resolve(nested.flat());
                        return;
                    }
                    all.push(...batch);
                    readBatch();
                }, () => resolve([]));
            };
            readBatch();
        });
    }
    return Promise.resolve([]);
}

function stripExtension(name: string) {
    return name.replace(/\.[^.]+$/, "").trim();
}
