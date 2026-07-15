import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { CosMediaKind, CosUploadTask } from "@/types/cos-media";

type EnqueueInput = { mediaId?: string; mediaKind: CosMediaKind; storageKey: string; fileName: string; mimeType: string };

type CosUploadStore = {
    hydrated: boolean;
    tasks: CosUploadTask[];
    enqueue: (input: EnqueueInput) => string;
    updateTask: (id: string, patch: Partial<Omit<CosUploadTask, "id" | "createdAt">>) => void;
    retry: (id: string) => void;
    cancel: (id: string) => void;
    cancelByStorageKey: (storageKey: string) => void;
    remove: (id: string) => void;
    clearCompleted: () => void;
};

const STORAGE_KEY = "infinite-canvas:cos_upload_tasks";

export const useCosUploadStore = create<CosUploadStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            tasks: [],
            enqueue: (input) => {
                const existing = get().tasks.find((task) => task.storageKey === input.storageKey && !["failed", "cancelled"].includes(task.status));
                if (existing) {
                    if (existing.mediaKind !== input.mediaKind) get().updateTask(existing.id, { mediaKind: input.mediaKind, fileName: input.fileName, mimeType: input.mimeType });
                    return existing.id;
                }
                const id = nanoid();
                const now = new Date().toISOString();
                const task: CosUploadTask = { ...input, id, mediaId: input.mediaId || input.storageKey, status: "queued", attempt: 0, createdAt: now, updatedAt: now };
                set((state) => ({ tasks: [task, ...state.tasks].slice(0, 200) }));
                return id;
            },
            updateTask: (id, patch) => set((state) => ({ tasks: state.tasks.map((task) => task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task) })),
            retry: (id) => set((state) => ({ tasks: state.tasks.map((task) => task.id === id && task.status === "failed" ? { ...task, status: "queued", attempt: 0, error: undefined, updatedAt: new Date().toISOString() } : task) })),
            cancel: (id) => set((state) => ({ tasks: state.tasks.map((task) => task.id === id && ["queued", "uploading"].includes(task.status) ? { ...task, status: "cancelled", updatedAt: new Date().toISOString() } : task) })),
            cancelByStorageKey: (storageKey) => set((state) => ({ tasks: state.tasks.map((task) => task.storageKey === storageKey && ["queued", "uploading"].includes(task.status) ? { ...task, status: "cancelled", updatedAt: new Date().toISOString() } : task) })),
            remove: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
            clearCompleted: () => set((state) => ({ tasks: state.tasks.filter((task) => !["succeeded", "cancelled"].includes(task.status)) })),
        }),
        {
            name: STORAGE_KEY,
            storage: {
                getItem: async (name) => {
                    const value = await localForageStorage.getItem(name);
                    return value ? JSON.parse(value) : null;
                },
                setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
                removeItem: (name) => localForageStorage.removeItem(name),
            } satisfies PersistStorage<CosUploadStore>,
            partialize: (state) => ({ tasks: state.tasks }) as StorageValue<CosUploadStore>["state"],
            onRehydrateStorage: () => () => useCosUploadStore.setState((state) => ({ hydrated: true, tasks: state.tasks.map((task) => task.status === "uploading" ? { ...task, status: "queued" } : task) })),
        },
    ),
);
