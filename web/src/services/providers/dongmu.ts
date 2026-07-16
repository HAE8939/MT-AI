import axios from "axios";

import { buildApiUrl, type ModelChannel } from "@/stores/use-config-store";

// 东木-AI 聚合平台 Provider：能力发现 + 媒体异步任务（提交 → 5s 轮询 → 终态取 result_url）。
// 平台能力文档见 .claude/skills/ai-api-skill/API_CAPABILITIES.md；chat 模型走 OpenAI 兼容路径，无需特殊处理。

export const DONGMU_BASE_URL = "https://api.lk888.ai/api";

export type DongmuModel = {
    name: string;
    display_name?: string;
    type: "chat" | "image" | "video" | "audio";
    tags?: string[];
};

type DongmuTaskStatus = {
    task_id: string;
    status?: string;
    progress?: string;
    is_final: boolean;
    result_url?: string;
    error?: string;
};

function dongmuHeaders(apiKey: string) {
    return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

export function isDongmuChannel(channel: Pick<ModelChannel, "provider">) {
    return channel.provider === "dongmu";
}

/** 能力发现：拉取平台全部可用模型（含类型与功能标签） */
export async function fetchDongmuModels(channel: Pick<ModelChannel, "baseUrl" | "apiKey">): Promise<DongmuModel[]> {
    const response = await axios.get<{ models?: DongmuModel[]; data?: DongmuModel[] }>(buildApiUrl(channel.baseUrl, "/skills/models"), { headers: dongmuHeaders(channel.apiKey) });
    const models = response.data.models || response.data.data || [];
    return models.filter((model) => model?.name);
}

/** 提交媒体生成任务（图片/视频/音频/TTS/音乐同一入口），返回 task_id */
export async function submitDongmuMediaTask(config: { baseUrl: string; apiKey: string }, input: { model: string; prompt: string; params?: Record<string, unknown> }, signal?: AbortSignal): Promise<string> {
    const response = await axios.post<{ code?: number; msg?: string; data?: Record<string, unknown> }>(
        buildApiUrl(config.baseUrl, "/media/generate"),
        { model: input.model, prompt: input.prompt, ...(input.params && Object.keys(input.params).length ? { params: input.params } : {}) },
        { headers: dongmuHeaders(config.apiKey), signal },
    );
    // 实测成功返回 code=200（非 0）；仅在明确的业务错误码时抛错
    if (typeof response.data.code === "number" && response.data.code !== 0 && response.data.code !== 200) throw new Error(response.data.msg || "任务提交失败");
    const data = response.data.data || {};
    const taskId = String(data.task_id || data["任务id"] || "");
    if (!taskId) throw new Error("任务提交后未返回 ID");
    return taskId;
}

/** 查询任务状态；is_final=true 时终结 */
export async function pollDongmuMediaTask(config: { baseUrl: string; apiKey: string }, taskId: string, signal?: AbortSignal): Promise<{ final: boolean; failed: boolean; progress?: number; resultUrl?: string; error?: string }> {
    const response = await axios.get<{ data?: DongmuTaskStatus } & DongmuTaskStatus>(buildApiUrl(config.baseUrl, "/skills/task-status"), {
        params: { task_id: taskId },
        headers: dongmuHeaders(config.apiKey),
        signal,
    });
    const status = response.data.data || response.data;
    const progress = status.progress ? Number(String(status.progress).replace("%", "")) : undefined;
    if (!status.is_final) return { final: false, failed: false, progress: Number.isFinite(progress) ? progress : undefined };
    if (status.result_url) return { final: true, failed: false, progress: 100, resultUrl: status.result_url };
    return { final: true, failed: true, error: status.error || status.status || "生成失败" };
}

/** 提交并轮询到终态，返回结果 URL；供画布生成路径内联使用 */
export async function generateDongmuMedia(config: { baseUrl: string; apiKey: string }, input: { model: string; prompt: string; params?: Record<string, unknown> }, options?: { signal?: AbortSignal; pollIntervalMs?: number; timeoutMs?: number }): Promise<string> {
    const taskId = await submitDongmuMediaTask(config, input, options?.signal);
    const interval = options?.pollIntervalMs ?? 5000;
    const deadline = Date.now() + (options?.timeoutMs ?? 30 * 60 * 1000);
    while (Date.now() < deadline) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        await new Promise((resolve) => setTimeout(resolve, interval));
        const result = await pollDongmuMediaTask(config, taskId, options?.signal);
        if (result.final) {
            if (result.failed || !result.resultUrl) throw new Error(result.error || "生成失败");
            return result.resultUrl;
        }
    }
    throw new Error("任务轮询超时");
}
