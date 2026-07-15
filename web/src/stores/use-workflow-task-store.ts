import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import type { AiWorkflowParams, AiWorkflowTask, AiWorkflowType } from "@/types/ai-workflow";

type WorkflowTaskStore = {
    hydrated: boolean;
    tasks: AiWorkflowTask[];
    enqueueTask: (input: { projectId: string; sourceNodeId: string; targetNodeIds: string[]; type: AiWorkflowType; params: AiWorkflowParams }) => string;
    updateTask: (id: string, patch: Partial<Omit<AiWorkflowTask, "id" | "createdAt">>) => void;
    cancelTask: (id: string) => void;
    retryTask: (id: string) => void;
    removeTask: (id: string) => void;
    clearCompletedTasks: () => void;
};

const STORAGE_KEY = "infinite-canvas:workflow_tasks";

export const useWorkflowTaskStore = create<WorkflowTaskStore>()(
    persist(
        (set) => ({
            hydrated: false,
            tasks: [],
            enqueueTask: (input) => {
                const id = nanoid();
                const now = new Date().toISOString();
                set((state) => ({ tasks: [{ ...input, id, status: "queued", resultUrls: [], createdAt: now, updatedAt: now }, ...state.tasks].slice(0, 100) }));
                return id;
            },
            updateTask: (id, patch) => set((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task)) })),
            cancelTask: (id) => set((state) => ({ tasks: state.tasks.map((task) => (task.id === id && ["queued", "submitting", "polling"].includes(task.status) ? { ...task, status: "cancelled", updatedAt: new Date().toISOString() } : task)) })),
            retryTask: (id) => set((state) => ({ tasks: state.tasks.map((task) => (task.id === id && task.status === "failed" ? { ...task, status: task.externalTaskId ? "polling" : "queued", error: undefined, updatedAt: new Date().toISOString() } : task)) })),
            removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
            clearCompletedTasks: () => set((state) => ({ tasks: state.tasks.filter((task) => !["succeeded", "cancelled"].includes(task.status)) })),
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
            } satisfies PersistStorage<WorkflowTaskStore>,
            partialize: (state) => ({ tasks: state.tasks }) as StorageValue<WorkflowTaskStore>["state"],
            onRehydrateStorage: () => () => useWorkflowTaskStore.setState({ hydrated: true }),
        },
    ),
);
