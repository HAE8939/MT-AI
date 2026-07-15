import axios from "axios";

import type { BizyAirWorkflowConfig, BizyAirWorkflowInput, BizyAirWorkflowResult } from "@/types/ai-workflow";

type BizyAirPayload = {
    task_id?: string;
    status?: string;
    message?: string;
    msg?: string;
    error?: string | { message?: string };
    outputs?: Array<{ object_url?: string }>;
    output_values?: Record<string, unknown>;
};

const CREATE_PATH = "/w/v1/webapp/task/openapi/create";
const GET_PATH = "/w/v1/webapp/task/openapi/get";

export async function submitBizyAirWorkflow(config: BizyAirWorkflowConfig, input: BizyAirWorkflowInput, signal?: AbortSignal): Promise<BizyAirWorkflowResult> {
    try {
        const response = await axios.post<BizyAirPayload>(buildUrl(config.baseUrl, CREATE_PATH), buildRequestBody(input), {
            headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
            signal,
        });
        return normalizeBizyAirResult(response.data);
    } catch (error) {
        throw new Error(axiosErrorMessage(error));
    }
}

export async function pollBizyAirWorkflow(config: BizyAirWorkflowConfig, externalTaskId: string, signal?: AbortSignal): Promise<BizyAirWorkflowResult> {
    try {
        const response = await axios.get<BizyAirPayload>(buildUrl(config.baseUrl, GET_PATH), {
            params: { task_id: externalTaskId },
            headers: { Authorization: `Bearer ${config.apiKey}` },
            signal,
        });
        return normalizeBizyAirResult(response.data, externalTaskId);
    } catch (error) {
        throw new Error(axiosErrorMessage(error));
    }
}

function buildRequestBody(input: BizyAirWorkflowInput) {
    const seed = Math.floor(Math.random() * 2147483647);
    if (input.type === "drawing-render") {
        return {
            web_app_id: 51345,
            suppress_preview_output: false,
            input_values: {
                "126:LoadImage.image": input.sourceImage,
                "147:LoadImage.image": input.referenceImage,
                "133:Text Multiline.text": input.params.description,
                "165:BizyAirJoyCaption3.custom_prompt": input.params.customPrompt,
                "134:PrimitiveFloat.value": input.params.styleStrength,
                "149:PrimitiveInt.value": input.params.outputQuality,
            },
        };
    }
    if (input.type === "multi-angle") {
        return {
            web_app_id: 51218,
            suppress_preview_output: false,
            seed,
            input_values: {
                "41:LoadImage.image": input.sourceImage,
                "108:QwenMultiangleCameraNode.horizontal_angle": input.params.camera1.horizontal,
                "108:QwenMultiangleCameraNode.vertical_angle": input.params.camera1.vertical,
                "108:QwenMultiangleCameraNode.zoom": input.params.camera1.zoom,
                "109:QwenMultiangleCameraNode.horizontal_angle": input.params.camera2.horizontal,
                "109:QwenMultiangleCameraNode.vertical_angle": input.params.camera2.vertical,
                "109:QwenMultiangleCameraNode.zoom": input.params.camera2.zoom,
            },
        };
    }
    return {
        web_app_id: 51263,
        suppress_preview_output: false,
        seed,
        input_values: {
            "234:LoadImage.image": input.sourceImage,
            "229:INTConstant.value": input.params.targetResolution,
        },
    };
}

function normalizeBizyAirResult(payload: BizyAirPayload, externalTaskId?: string): BizyAirWorkflowResult {
    const status = String(payload.status || "").toLowerCase();
    const resultUrls = collectResultUrls(payload);
    const error = readError(payload);
    if (error || status === "failed" || status === "error") return { status: "failed", externalTaskId: payload.task_id || externalTaskId, resultUrls, error: error || payload.message || payload.msg || "BizyAir 任务失败" };
    if (resultUrls.length) return { status: "succeeded", externalTaskId: payload.task_id || externalTaskId, resultUrls };
    const taskId = payload.task_id || externalTaskId;
    if (taskId) return { status: "polling", externalTaskId: taskId, resultUrls: [] };
    return { status: "failed", resultUrls: [], error: payload.message || payload.msg || (status === "success" || status === "succeeded" || status === "completed" ? "BizyAir 任务完成但未返回图片" : "BizyAir 未返回任务 ID 或结果") };
}

function collectResultUrls(payload: BizyAirPayload) {
    const urls = (payload.outputs || []).map((item) => item.object_url).filter((url): url is string => Boolean(url));
    Object.values(payload.output_values || {}).forEach((value) => collectUrls(value, urls));
    return Array.from(new Set(urls));
}

function collectUrls(value: unknown, urls: string[]) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) urls.push(value);
    else if (Array.isArray(value)) value.forEach((item) => collectUrls(item, urls));
    else if (value && typeof value === "object") Object.values(value).forEach((item) => collectUrls(item, urls));
}

function readError(payload: BizyAirPayload) {
    if (typeof payload.error === "string") return payload.error;
    return payload.error?.message || "";
}

function buildUrl(baseUrl: string, path: string) {
    return `${baseUrl.trim().replace(/\/+$/, "")}${path}`;
}

function axiosErrorMessage(error: unknown) {
    if (!axios.isAxiosError<BizyAirPayload>(error)) return error instanceof Error ? error.message : "BizyAir 请求失败";
    const payload = error.response?.data;
    if (typeof payload?.error === "string") return payload.error;
    return payload?.error?.message || payload?.message || payload?.msg || error.message;
}
