import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

export type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
};

type PromptStore = {
    hydrated: boolean;
    prompts: Prompt[];
    jsonIds: string[];
    deletedJsonIds: string[];
    editedPrompts: Record<string, Prompt>;
    /** 从 localforage 还原的用户自建提示词，仅 rehydration 时使用 */
    userPrompts: Prompt[];
    addPrompt: (prompt: Omit<Prompt, "id" | "createdAt" | "updatedAt">) => string;
    updatePrompt: (id: string, patch: Partial<Omit<Prompt, "id" | "createdAt">>) => void;
    removePrompt: (id: string) => void;
    restoreJsonPrompt: (id: string) => void;
};

const PROMPT_STORE_KEY = "infinite-canvas:prompt_store";

function mergePrompts(
    jsonPrompts: Prompt[],
    userPrompts: Prompt[],
    editedPrompts: Record<string, Prompt>,
    deletedJsonIds: string[],
): Prompt[] {
    const deletedSet = new Set(deletedJsonIds);
    const jsonMap = new Map(jsonPrompts.map((p) => [p.id, p]));

    // JSON prompts: show edited version if available, hide if deleted
    const jsonVisible = jsonPrompts
        .filter((p) => !deletedSet.has(p.id))
        .map((p) => editedPrompts[p.id] || p);

    // User prompts that aren't overriding a JSON prompt
    const userOnly = userPrompts.filter((p) => !jsonMap.has(p.id));

    return [...jsonVisible, ...userOnly].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

async function loadJsonPrompts(): Promise<Prompt[]> {
    try {
        const base = import.meta.env.BASE_URL || "/";
        const url = `${base}prompts.json`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data?.prompts) ? data.prompts : [];
    } catch {
        return [];
    }
}

export const usePromptStore = create<PromptStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            prompts: [],
            jsonIds: [],
            deletedJsonIds: [],
            editedPrompts: {},
            userPrompts: [],

            addPrompt: (prompt) => {
                const now = new Date().toISOString();
                const id = `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const newPrompt: Prompt = { ...prompt, id, createdAt: now, updatedAt: now };
                set((state) => ({ prompts: [newPrompt, ...state.prompts] }));
                return id;
            },

            updatePrompt: (id, patch) => {
                const isJson = get().jsonIds.includes(id);
                set((state) => {
                    const updated = state.prompts.map((p) =>
                        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
                    );
                    if (isJson) {
                        const edited = updated.find((p) => p.id === id);
                        return {
                            prompts: updated,
                            editedPrompts: edited ? { ...state.editedPrompts, [id]: edited } : state.editedPrompts,
                        };
                    }
                    return { prompts: updated };
                });
            },

            removePrompt: (id) => {
                const isJson = get().jsonIds.includes(id);
                set((state) => {
                    const next: Partial<PromptStore> = {
                        prompts: state.prompts.filter((p) => p.id !== id),
                    };
                    if (isJson) {
                        if (!state.deletedJsonIds.includes(id)) {
                            next.deletedJsonIds = [...state.deletedJsonIds, id];
                        }
                        const { [id]: _, ...restEdited } = state.editedPrompts;
                        next.editedPrompts = restEdited;
                    }
                    return next;
                });
            },

            restoreJsonPrompt: (id) => {
                // Remove from deletedJsonIds — triggers persist to localforage
                set((state) => ({
                    deletedJsonIds: state.deletedJsonIds.filter((dId) => dId !== id),
                }));
                // Reload JSON and re-merge
                void loadJsonPrompts().then((jsonPrompts) => {
                    const state = get();
                    set({
                        jsonIds: jsonPrompts.map((p) => p.id),
                        prompts: mergePrompts(jsonPrompts, state.prompts, state.editedPrompts, state.deletedJsonIds),
                    });
                });
            },
        }),
        {
            name: PROMPT_STORE_KEY,
            storage: {
                getItem: async (name) => {
                    const value = await localForageStorage.getItem(name);
                    return value ? JSON.parse(value) : null;
                },
                setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
                removeItem: (name) => localForageStorage.removeItem(name),
            } satisfies PersistStorage<PromptStore>,
            partialize: (state) => ({
                userPrompts: state.prompts.filter((p) => !state.jsonIds.includes(p.id)),
                editedPrompts: state.editedPrompts,
                deletedJsonIds: state.deletedJsonIds,
            }),
            onRehydrateStorage: () => () => {
                void (async () => {
                    const jsonPrompts = await loadJsonPrompts();
                    const state = usePromptStore.getState();
                    // After rehydration, state.userPrompts contains user-created prompts from localforage
                    usePromptStore.setState({
                        hydrated: true,
                        jsonIds: jsonPrompts.map((p) => p.id),
                        prompts: mergePrompts(jsonPrompts, state.userPrompts, state.editedPrompts, state.deletedJsonIds),
                    });
                })();
            },
        },
    ),
);
