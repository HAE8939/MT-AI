import { useCosUploadStore } from "@/stores/use-cos-upload-store";
import type { CosMediaKind, CosUploadTask } from "@/types/cos-media";

export type EnqueueCosUploadInput = { storageKey: string; fileName: string; mimeType: string; mediaKind: CosMediaKind; mediaId?: string };

export function enqueueCosUpload(input: EnqueueCosUploadInput) {
    return useCosUploadStore.getState().enqueue(input);
}

export function findCosMedia(storageKey: string) {
    return useCosUploadStore.getState().tasks.find((task) => task.storageKey === storageKey && task.status !== "cancelled");
}

export async function ensureCosMediaUrl(input: EnqueueCosUploadInput, signal?: AbortSignal) {
    const existing = findCosMedia(input.storageKey);
    if (existing?.status === "succeeded" && existing.cosUrl) return existing.cosUrl;
    if (existing?.status === "failed") throw new Error(existing.error || "COS 上传失败，请在媒体同步中心重试");
    const taskId = existing?.id || enqueueCosUpload(input);
    return waitForTask(taskId, signal);
}

function waitForTask(id: string, signal?: AbortSignal) {
    return new Promise<string>((resolve, reject) => {
        let unsubscribe: () => void = () => undefined;
        const finish = (task?: CosUploadTask) => {
            if (task?.status === "succeeded" && task.cosUrl) {
                unsubscribe();
                resolve(task.cosUrl);
                return true;
            }
            if (task && ["failed", "cancelled"].includes(task.status)) {
                unsubscribe();
                reject(new Error(task.error || (task.status === "cancelled" ? "COS 上传已取消" : "COS 上传失败")));
                return true;
            }
            return false;
        };
        if (finish(useCosUploadStore.getState().tasks.find((task) => task.id === id))) return;
        unsubscribe = useCosUploadStore.subscribe((state) => finish(state.tasks.find((task) => task.id === id)));
        signal?.addEventListener("abort", () => {
            unsubscribe();
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}
