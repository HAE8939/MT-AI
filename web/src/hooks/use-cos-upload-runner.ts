import { useEffect } from "react";

import { uploadCosObject } from "@/services/api/cos-media";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { useConfigStore } from "@/stores/use-config-store";
import { useCosUploadStore } from "@/stores/use-cos-upload-store";
import type { CosUploadTask } from "@/types/cos-media";

const runningTasks = new Map<string, AbortController>();
const retryDelays = [2000, 5000, 15000];

export function useCosUploadRunner() {
    const hydrated = useCosUploadStore((state) => state.hydrated);
    const tasks = useCosUploadStore((state) => state.tasks);

    useEffect(() => {
        if (!hydrated) return;
        tasks.forEach((task) => {
            if (task.status !== "queued" || runningTasks.has(task.id)) return;
            const controller = new AbortController();
            runningTasks.set(task.id, controller);
            void runUpload(task, controller.signal).finally(() => runningTasks.delete(task.id));
        });
        runningTasks.forEach((controller, id) => {
            const task = tasks.find((item) => item.id === id);
            if (!task || task.status === "cancelled") controller.abort();
        });
    }, [hydrated, tasks]);
}

async function runUpload(task: CosUploadTask, signal: AbortSignal) {
    const store = useCosUploadStore.getState();
    const config = useConfigStore.getState().cosConfig;
    if (!config.enabled || !config.secretId.trim() || !config.secretKey.trim() || !config.bucket.trim() || !config.region.trim()) {
        return store.updateTask(task.id, { status: "failed", error: "请先在配置页完善腾讯云 COS 配置" });
    }
    const blob = task.storageKey.startsWith("image:") ? await getImageBlob(task.storageKey) : await getMediaBlob(task.storageKey);
    if (!blob) return store.updateTask(task.id, { status: "failed", error: "本地媒体已不存在" });
    for (let attempt = 1; attempt <= 3 && !signal.aborted; attempt++) {
        store.updateTask(task.id, { status: "uploading", attempt, error: undefined });
        try {
            const result = await uploadCosObject(config, { blob, fileName: task.fileName, kind: task.mediaKind, key: task.cosKey }, signal);
            return store.updateTask(task.id, { status: "succeeded", cosKey: result.key, cosUrl: result.url, error: undefined });
        } catch (error) {
            if (signal.aborted) return;
            const message = error instanceof Error ? error.message : "COS 上传失败";
            if (attempt === 3) return store.updateTask(task.id, { status: "failed", error: message, attempt });
            store.updateTask(task.id, { status: "uploading", error: `${message}，准备重试`, attempt });
            await wait(retryDelays[attempt - 1], signal);
        }
    }
}

function wait(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
            window.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}
