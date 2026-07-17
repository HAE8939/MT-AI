import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

/** Macaron 卡片配色，具体色值见 components/prompts/prompt-colors.ts */
export const PROMPT_COLORS = ["pink", "mint", "lavender", "lemon", "peach", "sky", "lilac", "sage"] as const;
export type PromptColor = (typeof PROMPT_COLORS)[number];

/** 组合式标签：label 为芯片显示文本，value 为组合进 JSON 的实际值（缺省用 label），selected 为初始勾选 */
export type PromptComboTag = {
    label: string;
    value?: string;
    selected?: boolean;
};

/** 组合式卡片的键值标签组：勾选 tags 后组合为 JSON 提示词 */
export type PromptKeyGroup = {
    key: string;
    tags: PromptComboTag[];
};

/** 组合卡片：name 为组合 JSON 的一级键；空串表示该卡片键值平铺到顶层 */
export type PromptComboCard = {
    name: string;
    keys: PromptKeyGroup[];
};

export type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    /** 可选：组合卡片，存在且非空时卡片为「组合式卡片」 */
    cards?: PromptComboCard[];
    /** 可选：所属分组名，缺省为未分组 */
    group?: string;
    /** 可选：卡片颜色主题 */
    color?: PromptColor;
};

type PromptStore = {
    hydrated: boolean;
    prompts: Prompt[];
    /** 用户自建分组（提示词自带的 group 字段会在 UI 层合并进来） */
    groups: string[];
    addPrompt: (prompt: Omit<Prompt, "id" | "createdAt" | "updatedAt">) => string;
    updatePrompt: (id: string, patch: Partial<Omit<Prompt, "id" | "createdAt">>) => void;
    removePrompt: (id: string) => void;
    duplicatePrompt: (id: string) => string | null;
    addGroup: (name: string) => void;
    renameGroup: (oldName: string, newName: string) => void;
    removeGroup: (name: string) => void;
    importPrompts: (items: Partial<Prompt>[], groups?: string[]) => { added: number; skipped: number };
};

const PROMPT_STORE_KEY = "infinite-canvas:prompt_store";

/** 灵感广场收藏条目的固定分组 */
export const GALLERY_GROUP = "灵感精选";

function createPromptId() {
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 清洗 cards 字段，容忍导入/JSON 中的脏数据（string 标签自动包为 { label }）；无有效内容时返回 undefined */
export function normalizePromptCards(value: unknown): PromptComboCard[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const cards = value
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const raw = item as PromptComboCard;
            const name = typeof raw.name === "string" ? raw.name.trim() : "";
            const keys = (Array.isArray(raw.keys) ? raw.keys : [])
                .map((group) => {
                    if (!group || typeof group !== "object") return null;
                    const key = typeof group.key === "string" ? group.key.trim() : "";
                    const tags = (Array.isArray(group.tags) ? (group.tags as unknown[]) : [])
                        .map((entry): PromptComboTag | null => {
                            if (typeof entry === "string") return entry.trim() ? { label: entry.trim() } : null;
                            if (!entry || typeof entry !== "object") return null;
                            const tag = entry as PromptComboTag;
                            if (typeof tag.label !== "string" || !tag.label.trim()) return null;
                            return {
                                label: tag.label.trim(),
                                ...(typeof tag.value === "string" && tag.value.trim() ? { value: tag.value } : {}),
                                ...(tag.selected === true ? { selected: true } : {}),
                            };
                        })
                        .filter((tag): tag is PromptComboTag => tag !== null);
                    if (!key || tags.length === 0) return null;
                    return { key, tags };
                })
                .filter((group): group is PromptKeyGroup => group !== null);
            if (keys.length === 0) return null;
            return { name, keys };
        })
        .filter((card): card is PromptComboCard => card !== null);
    return cards.length > 0 ? cards : undefined;
}

export const usePromptStore = create<PromptStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            prompts: [],
            groups: [],

            addPrompt: (prompt) => {
                const now = new Date().toISOString();
                const id = createPromptId();
                const newPrompt: Prompt = { ...prompt, id, createdAt: now, updatedAt: now };
                set((state) => ({ prompts: [newPrompt, ...state.prompts] }));
                return id;
            },

            updatePrompt: (id, patch) => {
                set((state) => ({
                    prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
                }));
            },

            removePrompt: (id) => {
                set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) }));
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
                    cards: source.cards ? structuredClone(source.cards) : undefined,
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
                    const prompts = state.prompts.map((p) => (p.group === oldName ? { ...p, group: trimmed, updatedAt: now } : p));
                    const groups = Array.from(new Set(state.groups.map((g) => (g === oldName ? trimmed : g))));
                    return { prompts, groups };
                });
            },

            removeGroup: (name) => {
                set((state) => {
                    const now = new Date().toISOString();
                    const prompts = state.prompts.map((p) => {
                        if (p.group !== name) return p;
                        const { group: _group, ...rest } = p;
                        return { ...rest, updatedAt: now } as Prompt;
                    });
                    return { prompts, groups: state.groups.filter((g) => g !== name) };
                });
            },

            importPrompts: (items, groups) => {
                const state = get();
                const existingIds = new Set(state.prompts.map((p) => p.id));
                const now = new Date().toISOString();
                const toAdd: Prompt[] = [];
                let skipped = 0;
                for (const item of items) {
                    const title = typeof item?.title === "string" ? item.title.trim() : "";
                    const promptText = typeof item?.prompt === "string" ? item.prompt : "";
                    const cards = normalizePromptCards(item?.cards);
                    // 无标题、或既无正文也无组合卡片的条目视为无效
                    if (!title || (!promptText.trim() && !cards)) {
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
                        cards,
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
            partialize: (state) => ({ prompts: state.prompts, groups: state.groups }) as StorageValue<PromptStore>["state"],
            onRehydrateStorage: () => () => {
                usePromptStore.setState({ hydrated: true });
            },
        },
    ),
);
