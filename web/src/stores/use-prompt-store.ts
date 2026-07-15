import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

/** Macaron 卡片配色，具体色值见 components/prompts/prompt-colors.ts */
export const PROMPT_COLORS = ["pink", "mint", "lavender", "lemon", "peach", "sky", "lilac", "sage"] as const;
export type PromptColor = (typeof PROMPT_COLORS)[number];

/** 组合式卡片的键值标签组：勾选 tags 后组合为 JSON 提示词 */
export type PromptKeyGroup = {
    key: string;
    tags: string[];
};

export type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    /** 可选：键值标签组，存在且非空时卡片为「组合式卡片」 */
    keys?: PromptKeyGroup[];
    /** 可选：所属分组名，缺省为未分组 */
    group?: string;
    /** 可选：卡片颜色主题 */
    color?: PromptColor;
};

type PromptStore = {
    hydrated: boolean;
    prompts: Prompt[];
    jsonIds: string[];
    deletedJsonIds: string[];
    editedPrompts: Record<string, Prompt>;
    /** 用户自建分组（提示词自带的 group 字段会在 UI 层合并进来） */
    groups: string[];
    /** 从 localforage 还原的用户自建提示词，仅 rehydration 时使用 */
    userPrompts: Prompt[];
    addPrompt: (prompt: Omit<Prompt, "id" | "createdAt" | "updatedAt">) => string;
    updatePrompt: (id: string, patch: Partial<Omit<Prompt, "id" | "createdAt">>) => void;
    removePrompt: (id: string) => void;
    restoreJsonPrompt: (id: string) => void;
    duplicatePrompt: (id: string) => string | null;
    addGroup: (name: string) => void;
    renameGroup: (oldName: string, newName: string) => void;
    removeGroup: (name: string) => void;
    importPrompts: (items: Partial<Prompt>[], groups?: string[]) => { added: number; skipped: number };
};

const PROMPT_STORE_KEY = "infinite-canvas:prompt_store";

function createPromptId() {
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 清洗 keys 字段，容忍导入/JSON 中的脏数据；无有效内容时返回 undefined */
export function normalizePromptKeys(value: unknown): PromptKeyGroup[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const keys = value
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const key = typeof (item as PromptKeyGroup).key === "string" ? (item as PromptKeyGroup).key.trim() : "";
            const tags = Array.isArray((item as PromptKeyGroup).tags)
                ? (item as PromptKeyGroup).tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
                : [];
            if (!key || tags.length === 0) return null;
            return { key, tags };
        })
        .filter((item): item is PromptKeyGroup => item !== null);
    return keys.length > 0 ? keys : undefined;
}

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
            groups: [],
            userPrompts: [],

            addPrompt: (prompt) => {
                const now = new Date().toISOString();
                const id = createPromptId();
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

            duplicatePrompt: (id) => {
                const source = get().prompts.find((p) => p.id === id);
                if (!source) return null;
                const now = new Date().toISOString();
                const newId = createPromptId();
                const copy: Prompt = {
                    ...source,
                    id: newId,
                    title: `${source.title}（副本）`,
                    keys: source.keys?.map((k) => ({ key: k.key, tags: [...k.tags] })),
                    createdAt: now,
                    updatedAt: now,
                };
                set((state) => ({ prompts: [copy, ...state.prompts] }));
                return newId;
            },

            addGroup: (name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                set((state) => (state.groups.includes(trimmed) ? state : { groups: [...state.groups, trimmed] }));
            },

            renameGroup: (oldName, newName) => {
                const trimmed = newName.trim();
                if (!trimmed || trimmed === oldName) return;
                set((state) => {
                    const now = new Date().toISOString();
                    const jsonIdSet = new Set(state.jsonIds);
                    const editedPrompts = { ...state.editedPrompts };
                    const prompts = state.prompts.map((p) => {
                        if (p.group !== oldName) return p;
                        const next = { ...p, group: trimmed, updatedAt: now };
                        if (jsonIdSet.has(p.id)) editedPrompts[p.id] = next;
                        return next;
                    });
                    const groups = Array.from(
                        new Set(state.groups.map((g) => (g === oldName ? trimmed : g))),
                    );
                    return { prompts, editedPrompts, groups };
                });
            },

            removeGroup: (name) => {
                set((state) => {
                    const now = new Date().toISOString();
                    const jsonIdSet = new Set(state.jsonIds);
                    const editedPrompts = { ...state.editedPrompts };
                    const prompts = state.prompts.map((p) => {
                        if (p.group !== name) return p;
                        const { group: _group, ...rest } = p;
                        const next: Prompt = { ...rest, updatedAt: now };
                        if (jsonIdSet.has(p.id)) editedPrompts[p.id] = next;
                        return next;
                    });
                    return { prompts, editedPrompts, groups: state.groups.filter((g) => g !== name) };
                });
            },

            importPrompts: (items, groups) => {
                const state = get();
                const existingIds = new Set([...state.prompts.map((p) => p.id), ...state.deletedJsonIds]);
                const now = new Date().toISOString();
                const toAdd: Prompt[] = [];
                let skipped = 0;
                for (const item of items) {
                    const title = typeof item?.title === "string" ? item.title.trim() : "";
                    const promptText = typeof item?.prompt === "string" ? item.prompt : "";
                    const keys = normalizePromptKeys(item?.keys);
                    // 无标题、或既无正文也无组合键值的条目视为无效
                    if (!title || (!promptText.trim() && !keys)) {
                        skipped += 1;
                        continue;
                    }
                    // 重复 id 跳过，避免覆盖已有提示词
                    if (typeof item.id === "string" && existingIds.has(item.id)) {
                        skipped += 1;
                        continue;
                    }
                    const id = typeof item.id === "string" && item.id ? item.id : createPromptId();
                    toAdd.push({
                        id,
                        title,
                        coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : "",
                        prompt: promptText,
                        tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === "string") : [],
                        keys,
                        group: typeof item.group === "string" && item.group.trim() ? item.group.trim() : undefined,
                        color: PROMPT_COLORS.includes(item.color as PromptColor) ? (item.color as PromptColor) : undefined,
                        createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
                        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
                    });
                    existingIds.add(id);
                }
                if (toAdd.length > 0 || groups?.length) {
                    set((s) => ({
                        prompts: [...toAdd, ...s.prompts],
                        groups: Array.from(
                            new Set([
                                ...s.groups,
                                ...(groups || []).filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim()),
                                ...toAdd.map((p) => p.group).filter((g): g is string => Boolean(g)),
                            ]),
                        ),
                    }));
                }
                return { added: toAdd.length, skipped };
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
                groups: state.groups,
            }),
            onRehydrateStorage: () => () => {
                void (async () => {
                    const jsonPrompts = await loadJsonPrompts();
                    const state = usePromptStore.getState();
                    // After rehydration, state.userPrompts contains user-created prompts from localforage
                    // 老数据没有 groups 字段时保持默认空数组
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
