import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import type { AgentChatItem } from "@/stores/use-agent-store";
import type { ResponseInputMessage } from "@/services/api/image";

// 项目文本模型对话的会话存储：display 供 UI 渲染，context 供模型续聊，均持久化在 localforage。

const MAX_SESSIONS = 50;
const MAX_DISPLAY_MESSAGES = 200;
const MAX_CONTEXT_MESSAGES = 120;

export type ChatSession = {
    id: string;
    /** 绑定的角色模板 id；空串表示通用助手 */
    roleId: string;
    roleName: string;
    title: string;
    display: AgentChatItem[];
    context: ResponseInputMessage[];
    createdAt: string;
    updatedAt: string;
};

type ChatStore = {
    hydrated: boolean;
    sessions: ChatSession[];
    activeSessionId: string;
    createSession: (input?: { roleId?: string; roleName?: string }) => string;
    setActiveSession: (id: string) => void;
    setSessionRole: (id: string, roleId: string, roleName: string) => void;
    appendMessages: (id: string, display: AgentChatItem[], context: ResponseInputMessage[]) => void;
    replaceDisplayMessage: (id: string, streamId: string, message: AgentChatItem) => void;
    removeSession: (id: string) => void;
    clearSessions: () => void;
};

function touchTitle(session: ChatSession, display: AgentChatItem[]) {
    if (session.title !== "新对话") return session.title;
    const firstUser = display.find((item) => item.role === "user" && item.text.trim());
    return firstUser ? firstUser.text.trim().slice(0, 24) : session.title;
}

/** 从头部裁剪模型上下文，保证不会以 function_call/tool 断链开头 */
function trimContext(context: ResponseInputMessage[]) {
    if (context.length <= MAX_CONTEXT_MESSAGES) return context;
    let start = context.length - MAX_CONTEXT_MESSAGES;
    while (start < context.length) {
        const message = context[start];
        if (!("type" in message) && message.role !== "tool") break;
        start++;
    }
    return context.slice(start);
}

export const useChatStore = create<ChatStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            sessions: [],
            activeSessionId: "",
            createSession: (input = {}) => {
                const id = `chat-${nanoid()}`;
                const now = new Date().toISOString();
                const session: ChatSession = {
                    id,
                    roleId: input.roleId || "",
                    roleName: input.roleName || "通用助手",
                    title: "新对话",
                    display: [],
                    context: [],
                    createdAt: now,
                    updatedAt: now,
                };
                set((state) => ({ sessions: [session, ...state.sessions].slice(0, MAX_SESSIONS), activeSessionId: id }));
                return id;
            },
            setActiveSession: (activeSessionId) => set({ activeSessionId }),
            setSessionRole: (id, roleId, roleName) =>
                set((state) => ({ sessions: state.sessions.map((session) => (session.id === id ? { ...session, roleId, roleName, updatedAt: new Date().toISOString() } : session)) })),
            appendMessages: (id, display, context) =>
                set((state) => ({
                    sessions: state.sessions.map((session) => {
                        if (session.id !== id) return session;
                        const nextDisplay = [...session.display, ...display].slice(-MAX_DISPLAY_MESSAGES);
                        return {
                            ...session,
                            display: nextDisplay,
                            context: trimContext([...session.context, ...context]),
                            title: touchTitle(session, nextDisplay),
                            updatedAt: new Date().toISOString(),
                        };
                    }),
                })),
            replaceDisplayMessage: (id, streamId, message) =>
                set((state) => ({
                    sessions: state.sessions.map((session) => {
                        if (session.id !== id) return session;
                        const index = streamId ? session.display.findIndex((item) => item.streamId === streamId) : -1;
                        const display = index >= 0 ? session.display.map((item, i) => (i === index ? { ...message, id: item.id } : item)) : [...session.display, message].slice(-MAX_DISPLAY_MESSAGES);
                        return { ...session, display, updatedAt: new Date().toISOString() };
                    }),
                })),
            removeSession: (id) =>
                set((state) => ({
                    sessions: state.sessions.filter((session) => session.id !== id),
                    activeSessionId: state.activeSessionId === id ? "" : state.activeSessionId,
                })),
            clearSessions: () => set({ sessions: [], activeSessionId: "" }),
        }),
        {
            name: "infinite-canvas:chat-sessions",
            storage: {
                getItem: async (name) => {
                    const value = await localForageStorage.getItem(name);
                    return value ? JSON.parse(value) : null;
                },
                setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
                removeItem: (name) => localForageStorage.removeItem(name),
            } satisfies PersistStorage<ChatStore>,
            partialize: (state) => ({ sessions: state.sessions, activeSessionId: state.activeSessionId }) as StorageValue<ChatStore>["state"],
            onRehydrateStorage: () => () => useChatStore.setState({ hydrated: true }),
        },
    ),
);

export function activeChatSession(state: Pick<ChatStore, "sessions" | "activeSessionId">) {
    return state.sessions.find((session) => session.id === state.activeSessionId) || null;
}
