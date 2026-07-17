import type { NavigateFunction } from "react-router-dom";

import { requestAgentChat, type ResponseFunctionTool, type ResponseInputMessage, type ResponseToolCall } from "@/services/api/image";
import { isSiteTool, runSiteTool, SITE_TOOL_LABELS } from "@/lib/agent/agent-site-tools";
import { summarizeCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import type { AgentCanvasContext } from "@/stores/use-agent-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData } from "@/types/canvas";

// 浏览器端对话 Agent 运行时：项目文本模型 + function calling 循环，
// 工具在本地执行（画布 ops / 站点工具 / 路由跳转），不依赖本地 codex Agent。

const MAX_TOOL_ROUNDS = 8;

/** 面向项目文本模型的基础操作说明（参考 canvas-agent AGENT_PROMPT，按浏览器端工具集精简） */
export const CHAT_AGENT_BASE_PROMPT = [
    "你是 MT-AI 网站内置的 AI 助手，可以直接调用工具操作当前网站和画布。",
    "切换页面用 site_navigate，可跳 / (首页)、/canvas (我的画布)、/canvas/:id (指定画布)、/plaza (灵感广场)、/me (我的：收藏/提示词/素材/生成记录)、/workflows (工作流)、/config (配置)。",
    "需要改动画布时：先 canvas_get_state 读取当前画布，再用 canvas_apply_ops 批量提交操作；若当前不在画布页，画布工具会报错，需先用 site_navigate 打开画布。想了解用户已有画布，用 canvas_list_projects 获取清单和 id。",
    "canvas_apply_ops 的 ops 支持：add_node（nodeType 为 text/image/config/video/audio，附 title、position{x,y}、width、height、metadata；文本节点正文放 metadata.content 并带 status:\"success\"、fontSize:14；配置节点提示词放 metadata.prompt、模式放 metadata.generationMode）、update_node（id + patch/metadata）、delete_node、delete_connections、connect_nodes（fromNodeId/toNodeId）、set_viewport、select_nodes、run_generation（nodeId + mode: text/image/video/audio，触发该节点 AI 生成）。",
    "用 prompts_search 搜索提示词库；用 assets_list 查看「我的素材」、assets_add 新增文本或图片素材。",
    "工具结果用户不可见，需要时在回复中用中文简要总结。不要编造工具没有返回的内容。",
].join("\n");

export type ChatAgentToolName = "canvas_get_state" | "canvas_apply_ops" | "site_navigate" | "canvas_list_projects" | "prompts_search" | "assets_list" | "assets_add";

export const CHAT_AGENT_TOOL_LABELS: Record<ChatAgentToolName, string> = {
    canvas_get_state: "读取画布",
    canvas_apply_ops: "画布操作",
    site_navigate: "网站跳转",
    ...SITE_TOOL_LABELS,
};

export function chatAgentToolLabel(name: string) {
    return (CHAT_AGENT_TOOL_LABELS as Record<string, string>)[name] || name;
}

const pageQuery = { page: { type: "number", description: "页码，从 1 开始" }, pageSize: { type: "number", description: "每页数量" } } as const;

export const CHAT_AGENT_TOOLS: ResponseFunctionTool[] = [
    {
        type: "function",
        function: { name: "canvas_get_state", description: "读取当前网页画布的节点、连线、选区和视口。", parameters: { type: "object", properties: {} } },
    },
    {
        type: "function",
        function: {
            name: "canvas_apply_ops",
            description: "批量操作当前网页画布。ops 支持 add_node、update_node、delete_node、delete_connections、connect_nodes、set_viewport、select_nodes、run_generation。",
            parameters: {
                type: "object",
                properties: {
                    ops: {
                        type: "array",
                        description: "画布操作列表，按顺序执行",
                        items: {
                            type: "object",
                            properties: {
                                type: { type: "string", enum: ["add_node", "update_node", "delete_node", "delete_connections", "connect_nodes", "set_viewport", "select_nodes", "run_generation"] },
                                id: { type: "string" },
                                ids: { type: "array", items: { type: "string" } },
                                nodeType: { type: "string", enum: ["text", "image", "config", "video", "audio"] },
                                title: { type: "string" },
                                position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
                                width: { type: "number" },
                                height: { type: "number" },
                                metadata: { type: "object", description: "节点元数据：文本节点 content/status/fontSize，配置节点 prompt/generationMode 等" },
                                patch: { type: "object", description: "update_node 的基础字段补丁" },
                                fromNodeId: { type: "string" },
                                toNodeId: { type: "string" },
                                viewport: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, k: { type: "number" } } },
                                nodeId: { type: "string", description: "run_generation 的目标节点" },
                                mode: { type: "string", enum: ["text", "image", "video", "audio"] },
                                prompt: { type: "string", description: "run_generation 可覆盖提示词" },
                                all: { type: "boolean", description: "delete_connections 时删除全部连线" },
                            },
                            required: ["type"],
                        },
                    },
                },
                required: ["ops"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "site_navigate",
            description: "跳转网站页面。path 可为 / (首页)、/canvas (我的画布)、/canvas/:id (指定画布)、/plaza (灵感广场)、/me (我的)、/workflows (工作流)、/config (配置)。操作画布前若不在画布页，先用本工具打开画布。",
            parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
        },
    },
    {
        type: "function",
        function: {
            name: "canvas_list_projects",
            description: "列出用户全部画布（标题、时间、节点数、连线数），支持 keyword 搜索和分页。返回的 id 可配合 site_navigate 跳 /canvas/:id。",
            parameters: { type: "object", properties: { keyword: { type: "string" }, ...pageQuery } },
        },
    },
    {
        type: "function",
        function: {
            name: "prompts_search",
            description: "搜索提示词库，支持 keyword、category、tags 过滤和分页，返回标题、提示词、分类、标签、封面等。",
            parameters: { type: "object", properties: { keyword: { type: "string" }, category: { type: "string" }, tags: { type: "array", items: { type: "string" } }, ...pageQuery } },
        },
    },
    {
        type: "function",
        function: {
            name: "assets_list",
            description: "列出用户「我的素材」，支持 kind（text/image/video）过滤、keyword 搜索和分页。",
            parameters: { type: "object", properties: { kind: { type: "string", enum: ["all", "text", "image", "video"] }, keyword: { type: "string" }, ...pageQuery } },
        },
    },
    {
        type: "function",
        function: {
            name: "assets_add",
            description: "向「我的素材」新增素材。kind=text 用 content 传文本；kind=image 用 imageUrl 传图片地址或 dataURL。",
            parameters: {
                type: "object",
                properties: {
                    kind: { type: "string", enum: ["text", "image"] },
                    title: { type: "string" },
                    content: { type: "string" },
                    imageUrl: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    source: { type: "string" },
                    note: { type: "string" },
                },
                required: ["kind", "title"],
            },
        },
    },
];

export type ChatAgentEvent =
    | { type: "assistant_delta"; streamId: string; text: string }
    | { type: "assistant_done"; streamId: string; text: string }
    | { type: "tool_start"; name: string; input: Record<string, unknown> }
    | { type: "tool_done"; name: string; input: Record<string, unknown>; summary: string; result: unknown }
    | { type: "tool_error"; name: string; input: Record<string, unknown>; error: string }
    | { type: "tool_rejected"; name: string; input: Record<string, unknown> };

export type ChatAgentEnv = {
    config: AiConfig;
    /** 每轮实时获取，applyOps 之后快照会更新 */
    getCanvasContext: () => AgentCanvasContext | null;
    navigate: NavigateFunction;
    /** canvas_apply_ops 的用户确认门槛；返回 false 表示拒绝执行 */
    confirmApplyOps?: (input: { ops?: CanvasAgentOp[] }) => Promise<boolean>;
    signal?: AbortSignal;
};

export type ChatAgentTurnResult = {
    /** 本轮新增的模型上下文消息（assistant / function_call / tool），追加到会话历史持久化 */
    appended: ResponseInputMessage[];
    /** 最后一段 assistant 文本 */
    finalText: string;
};

/**
 * 执行一轮对话：history 需包含 system 与最新的 user 消息。
 * 循环调用模型，执行工具并回填结果，直到没有工具调用或达到轮次上限。
 */
export async function runChatAgentTurn(history: ResponseInputMessage[], env: ChatAgentEnv, emit: (event: ChatAgentEvent) => void): Promise<ChatAgentTurnResult> {
    const appended: ResponseInputMessage[] = [];
    let finalText = "";
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        throwIfAborted(env.signal);
        const streamId = `chat-${Date.now()}-${round}`;
        const result = await requestAgentChat(env.config, [...history, ...appended], CHAT_AGENT_TOOLS, (text) => emit({ type: "assistant_delta", streamId, text }), { signal: env.signal });
        if (result.content.trim()) {
            finalText = result.content;
            appended.push({ role: "assistant", content: result.content });
            emit({ type: "assistant_done", streamId, text: result.content });
        }
        if (!result.toolCalls.length) break;
        for (const call of result.toolCalls) {
            throwIfAborted(env.signal);
            appended.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments, thoughtSignature: call.thoughtSignature });
            appended.push({ role: "tool", tool_call_id: call.id, content: await executeToolCall(call, env, emit) });
        }
        if (round === MAX_TOOL_ROUNDS - 1) {
            appended.push({ role: "user", content: "（系统提示：工具调用轮次已达上限，请直接总结当前进展回复用户，不要再调用工具。）" });
        }
    }
    return { appended, finalText };
}

async function executeToolCall(call: ResponseToolCall, env: ChatAgentEnv, emit: (event: ChatAgentEvent) => void): Promise<string> {
    const name = call.function.name;
    const input = parseToolArguments(call.function.arguments);
    emit({ type: "tool_start", name, input });
    try {
        if (name === "canvas_apply_ops" && env.confirmApplyOps) {
            const approved = await env.confirmApplyOps(input as { ops?: CanvasAgentOp[] });
            if (!approved) {
                emit({ type: "tool_rejected", name, input });
                return JSON.stringify({ error: "用户拒绝了本次画布操作" });
            }
        }
        const result = await runChatAgentTool(name, input, env);
        emit({ type: "tool_done", name, input, summary: toolResultSummary(name, input, result), result });
        return JSON.stringify(result ?? { ok: true });
    } catch (error) {
        if (isAbortError(error)) throw error;
        const message = error instanceof Error ? error.message : "工具执行失败";
        emit({ type: "tool_error", name, input, error: message });
        return JSON.stringify({ error: message });
    }
}

async function runChatAgentTool(name: string, input: Record<string, unknown>, env: ChatAgentEnv): Promise<unknown> {
    if (isSiteTool(name)) return runSiteTool(name, input, env.navigate);
    if (name === "site_navigate") {
        const path = String(input.path || "/");
        env.navigate(path);
        return { ok: true, path };
    }
    if (name === "canvas_get_state") {
        const snapshot = env.getCanvasContext()?.snapshot;
        if (!snapshot) throw new Error("当前不在画布页，请先用 site_navigate 打开画布");
        return compactChatCanvasState(snapshot);
    }
    if (name === "canvas_apply_ops") {
        const context = env.getCanvasContext();
        if (!context) throw new Error("当前不在画布页，请先用 site_navigate 打开画布");
        const next = context.applyOps((input.ops as CanvasAgentOp[]) || []);
        return compactChatCanvasState(next);
    }
    throw new Error(`未知工具：${name}`);
}

/** 与 canvas-agent 的 compactCanvasState 对齐：截断长文本，去掉图片 dataURL 等大字段，避免撑爆上下文 */
export function compactChatCanvasState(state: CanvasAgentSnapshot) {
    return { ...state, nodes: state.nodes.map(compactChatNode) };
}

function compactChatNode(node: CanvasNodeData) {
    const metadata: Record<string, unknown> = { ...(node.metadata || {}) };
    if (typeof metadata.content === "string" && metadata.content.length > 240) metadata.content = `${metadata.content.slice(0, 120)}...`;
    return { id: node.id, type: node.type, title: node.title, position: node.position, width: node.width, height: node.height, metadata };
}

function toolResultSummary(name: string, input: Record<string, unknown>, result: unknown) {
    if (name === "canvas_apply_ops") return summarizeCanvasAgentOps((input.ops as CanvasAgentOp[]) || []) || "画布操作";
    if (name === "site_navigate") return `已跳转到 ${String(input.path || "/")}`;
    if (name === "canvas_get_state") {
        const state = result as { nodes?: unknown[]; connections?: unknown[] } | undefined;
        return `读取到 ${state?.nodes?.length || 0} 个节点，${state?.connections?.length || 0} 条连线`;
    }
    const data = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
    if (name === "canvas_list_projects") return `共 ${Number(data.total) || 0} 个画布`;
    if (name === "prompts_search") return `找到 ${Number(data.total) || 0} 条提示词`;
    if (name === "assets_list") return `共 ${Number(data.total) || 0} 个素材`;
    if (name === "assets_add") return "已加入我的素材";
    return "已完成";
}

function parseToolArguments(value: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("对话已停止", "AbortError");
}

export function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
}
