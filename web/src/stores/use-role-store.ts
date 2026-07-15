import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";

export type AiRole = { id: string; name: string; description: string; systemPrompt: string };

type RoleStore = {
    hydrated: boolean;
    roles: AiRole[];
    builtInRoles: AiRole[];
    userRoles: AiRole[];
    editedRoles: Record<string, AiRole>;
    deletedBuiltInIds: string[];
    addRole: (input: Omit<AiRole, "id">) => string;
    updateRole: (id: string, patch: Partial<Omit<AiRole, "id">>) => void;
    removeRole: (id: string) => void;
    restoreBuiltIns: () => void;
};

function mergeRoles(builtIns: AiRole[], userRoles: AiRole[], edits: Record<string, AiRole>, deletedIds: string[]) {
    const deleted = new Set(deletedIds);
    return [...builtIns.filter((role) => !deleted.has(role.id)).map((role) => edits[role.id] || role), ...userRoles];
}

async function loadBuiltIns() {
    try {
        const response = await fetch(`${import.meta.env.BASE_URL || "/"}roles.json`, { cache: "no-store" });
        const data = await response.json();
        return Array.isArray(data?.roles) ? data.roles as AiRole[] : [];
    } catch {
        return [];
    }
}

export const useRoleStore = create<RoleStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            roles: [],
            builtInRoles: [],
            userRoles: [],
            editedRoles: {},
            deletedBuiltInIds: [],
            addRole: (input) => {
                const id = `role-${nanoid()}`;
                const role = { ...input, id };
                set((state) => ({ roles: [...state.roles, role], userRoles: [...state.userRoles, role] }));
                return id;
            },
            updateRole: (id, patch) => set((state) => {
                const role = state.roles.find((item) => item.id === id);
                if (!role) return state;
                const updated = { ...role, ...patch };
                const builtIn = state.builtInRoles.some((item) => item.id === id);
                return { roles: state.roles.map((item) => item.id === id ? updated : item), ...(builtIn ? { editedRoles: { ...state.editedRoles, [id]: updated } } : { userRoles: state.userRoles.map((item) => item.id === id ? updated : item) }) };
            }),
            removeRole: (id) => set((state) => {
                const builtIn = state.builtInRoles.some((item) => item.id === id);
                return { roles: state.roles.filter((item) => item.id !== id), ...(builtIn ? { deletedBuiltInIds: [...new Set([...state.deletedBuiltInIds, id])] } : { userRoles: state.userRoles.filter((item) => item.id !== id) }) };
            }),
            restoreBuiltIns: () => set((state) => ({ deletedBuiltInIds: [], editedRoles: {}, roles: mergeRoles(state.builtInRoles, state.userRoles, {}, []) })),
        }),
        {
            name: "infinite-canvas:roles",
            storage: {
                getItem: async (name) => {
                    const value = await localForageStorage.getItem(name);
                    return value ? JSON.parse(value) : null;
                },
                setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
                removeItem: (name) => localForageStorage.removeItem(name),
            } satisfies PersistStorage<RoleStore>,
            partialize: (state) => ({ userRoles: state.userRoles, editedRoles: state.editedRoles, deletedBuiltInIds: state.deletedBuiltInIds }) as StorageValue<RoleStore>["state"],
            onRehydrateStorage: () => () => {
                void loadBuiltIns().then((builtInRoles) => {
                    const state = useRoleStore.getState();
                    useRoleStore.setState({ hydrated: true, builtInRoles, roles: mergeRoles(builtInRoles, state.userRoles, state.editedRoles, state.deletedBuiltInIds) });
                });
            },
        },
    ),
);
