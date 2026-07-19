import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import { loadPromptEngineConfigs } from "@/services/prompt-engine/workflow-registry";
import type { AgentCategory, AgentTemplate, AgentTemplateSpec, PromptEngineWorkflowConfig } from "@/types/workflow";

// 智能体模板库：内置模板来自 public/roles.json（原「专业角色」自动转换为文档分析智能体），
// 用户模板（RunningHub 登记 / 画布保存 / 自建角色）持久化在 localforage。

type AgentStoreState = {
    hydrated: boolean;
    templates: AgentTemplate[];
    builtinTemplates: AgentTemplate[];
    userTemplates: AgentTemplate[];
    editedTemplates: Record<string, AgentTemplate>;
    deletedBuiltinIds: string[];
    addTemplate: (input: { name: string; description: string; avatar?: string; category: AgentCategory; spec: AgentTemplateSpec }) => string;
    updateTemplate: (id: string, patch: Partial<Omit<AgentTemplate, "id" | "source" | "createdAt">>) => void;
    removeTemplate: (id: string) => void;
    restoreBuiltins: () => void;
};

function mergeTemplates(builtins: AgentTemplate[], users: AgentTemplate[], edits: Record<string, AgentTemplate>, deletedIds: string[]) {
    const deleted = new Set(deletedIds);
    return [...builtins.filter((item) => !deleted.has(item.id)).map((item) => edits[item.id] || item), ...users];
}

/** 内置模板 = 提示词引擎工作流（public/workflows/）+ 原 roles.json 角色转换的文档分析智能体 */
async function loadBuiltinTemplates(): Promise<AgentTemplate[]> {
    const [promptEngine, roles] = await Promise.all([loadPromptEngineTemplates(), loadRoleTemplates()]);
    return [...promptEngine, ...roles];
}

/** public/workflows/ 下的提示词引擎工作流配置转换为内置模板 */
async function loadPromptEngineTemplates(): Promise<AgentTemplate[]> {
    const configs = await loadPromptEngineConfigs();
    const iso = new Date(0).toISOString();
    return configs.map((config: PromptEngineWorkflowConfig) => ({
        id: `builtin-prompt-engine-${config.meta.id}`,
        name: config.meta.name,
        description: config.meta.description || "",
        avatar: "🏠",
        category: "image" as const,
        source: "builtin" as const,
        spec: { kind: "prompt-engine" as const, config },
        createdAt: iso,
        updatedAt: iso,
    }));
}

/** 原 roles.json 的角色定义直接转换为内置文档分析智能体 */
async function loadRoleTemplates(): Promise<AgentTemplate[]> {
    try {
        const response = await fetch(`${import.meta.env.BASE_URL || "/"}roles.json`, { cache: "no-store" });
        const data = await response.json();
        const roles = Array.isArray(data?.roles) ? data.roles : [];
        const iso = new Date(0).toISOString();
        return roles
            .filter((role: { id?: string; name?: string; systemPrompt?: string }) => role?.id && role?.name && role?.systemPrompt)
            .map((role: { id: string; name: string; description?: string; systemPrompt: string; avatar?: string }) => ({
                id: role.id,
                name: role.name,
                description: role.description || "",
                avatar: role.avatar,
                category: "document" as const,
                source: "builtin" as const,
                spec: { kind: "doc-analysis" as const, systemPrompt: role.systemPrompt },
                createdAt: iso,
                updatedAt: iso,
            }));
    } catch {
        return [];
    }
}

export const useAgentTemplateStore = create<AgentStoreState>()(
    persist(
        (set) => ({
            hydrated: false,
            templates: [],
            builtinTemplates: [],
            userTemplates: [],
            editedTemplates: {},
            deletedBuiltinIds: [],
            addTemplate: (input) => {
                const id = `agent-${nanoid()}`;
                const now = new Date().toISOString();
                const template: AgentTemplate = { ...input, id, source: "user", createdAt: now, updatedAt: now };
                set((state) => ({ templates: [...state.templates, template], userTemplates: [...state.userTemplates, template] }));
                return id;
            },
            updateTemplate: (id, patch) =>
                set((state) => {
                    const template = state.templates.find((item) => item.id === id);
                    if (!template) return state;
                    const updated = { ...template, ...patch, updatedAt: new Date().toISOString() };
                    const builtin = state.builtinTemplates.some((item) => item.id === id);
                    return {
                        templates: state.templates.map((item) => (item.id === id ? updated : item)),
                        ...(builtin ? { editedTemplates: { ...state.editedTemplates, [id]: updated } } : { userTemplates: state.userTemplates.map((item) => (item.id === id ? updated : item)) }),
                    };
                }),
            removeTemplate: (id) =>
                set((state) => {
                    const builtin = state.builtinTemplates.some((item) => item.id === id);
                    return {
                        templates: state.templates.filter((item) => item.id !== id),
                        ...(builtin ? { deletedBuiltinIds: [...new Set([...state.deletedBuiltinIds, id])] } : { userTemplates: state.userTemplates.filter((item) => item.id !== id) }),
                    };
                }),
            restoreBuiltins: () => set((state) => ({ deletedBuiltinIds: [], editedTemplates: {}, templates: mergeTemplates(state.builtinTemplates, state.userTemplates, {}, []) })),
        }),
        {
            name: "infinite-canvas:agent-templates",
            storage: {
                getItem: async (name) => {
                    const value = await localForageStorage.getItem(name);
                    return value ? JSON.parse(value) : null;
                },
                setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
                removeItem: (name) => localForageStorage.removeItem(name),
            } satisfies PersistStorage<AgentStoreState>,
            partialize: (state) => ({ userTemplates: state.userTemplates, editedTemplates: state.editedTemplates, deletedBuiltinIds: state.deletedBuiltinIds }) as StorageValue<AgentStoreState>["state"],
            onRehydrateStorage: () => () => {
                void loadBuiltinTemplates().then((builtinTemplates) => {
                    const state = useAgentTemplateStore.getState();
                    useAgentTemplateStore.setState({ hydrated: true, builtinTemplates, templates: mergeTemplates(builtinTemplates, state.userTemplates, state.editedTemplates, state.deletedBuiltinIds) });
                });
            },
        },
    ),
);
