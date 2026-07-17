import axios from "axios";

// RunningHub 云工作流 Provider（OpenAPI v2）：Bearer 鉴权。
// 提交 POST /openapi/v2/run/workflow/{workflowId} → 轮询 POST /openapi/v2/query，status: QUEUED/RUNNING/SUCCESS/FAILED。
// 前置：工作流必须先在 RunningHub 平台手动成功运行过一次才能通过 API 调用；结果 URL 与上传文件仅 24 小时有效。

export const RUNNINGHUB_BASE_URL = "https://www.runninghub.ai";

export type RunningHubNodeInfo = { nodeId: string; fieldName: string; fieldValue: string };

/** v2 提交/查询共用的任务响应体（无 code/data 包裹） */
type RunningHubTaskPayload = {
    taskId?: string;
    status?: string;
    errorCode?: string | number;
    errorMessage?: string;
    failedReason?: { exception_message?: string; node_name?: string } | null;
    results?: Array<{ url?: string; nodeId?: string; outputType?: string; text?: string | null }> | null;
    promptTips?: string;
};

const PENDING_STATUS = new Set(["QUEUED", "RUNNING", "PENDING", "CREATED"]);
const SUCCESS_STATUS = new Set(["SUCCESS", "SUCCEED", "SUCCEEDED", "COMPLETED"]);

function runninghubUrl(baseUrl: string, path: string) {
    return `${baseUrl.trim().replace(/\/+$/, "")}${path}`;
}

function authHeaders(apiKey: string) {
    return { Authorization: `Bearer ${apiKey.trim()}` };
}

/** HTTP 非 2xx 时从响应体提取 RunningHub 的业务错误信息；取消信号原样抛出以保留取消语义 */
function toApiError(error: unknown, fallback: string): Error {
    if (axios.isCancel(error)) return error as Error;
    if (axios.isAxiosError(error)) {
        const data = error.response?.data as { errorMessage?: string; message?: string; msg?: string } | undefined;
        return new Error(data?.errorMessage || data?.message || data?.msg || error.message || fallback);
    }
    return error instanceof Error ? error : new Error(fallback);
}

/** 上传输入文件（图片/音频/视频），返回可写入 LoadImage 类节点的 fileName（平台内相对路径，勿拼接外链） */
export async function uploadRunningHubFile(config: { baseUrl: string; apiKey: string }, file: Blob, fileName: string, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append("file", file, fileName);
    try {
        const response = await axios.post<{ code?: number; message?: string; msg?: string; data?: { fileName?: string; download_url?: string } }>(
            runninghubUrl(config.baseUrl, "/openapi/v2/media/upload/binary"),
            form,
            { headers: authHeaders(config.apiKey), signal },
        );
        const { code, message, msg, data } = response.data;
        if (code !== 0 || !data?.fileName) throw new Error(message || msg || "文件上传失败");
        return data.fileName;
    } catch (error) {
        throw toApiError(error, "文件上传失败");
    }
}

/** 提交工作流任务，nodeInfoList 只需包含要覆盖的字段（空数组 = 按工作流默认参数运行） */
export async function submitRunningHubTask(config: { baseUrl: string; apiKey: string }, workflowId: string, nodeInfoList: RunningHubNodeInfo[], signal?: AbortSignal): Promise<string> {
    try {
        const response = await axios.post<RunningHubTaskPayload>(
            runninghubUrl(config.baseUrl, `/openapi/v2/run/workflow/${workflowId.trim()}`),
            { nodeInfoList },
            { headers: { ...authHeaders(config.apiKey), "Content-Type": "application/json" }, signal },
        );
        const { taskId, status, errorCode, errorMessage } = response.data;
        if (!taskId || (status || "").toUpperCase() === "FAILED") throw new Error(errorMessage || (errorCode ? `工作流任务提交失败（${errorCode}）` : "工作流任务提交失败"));
        return taskId;
    } catch (error) {
        throw toApiError(error, "工作流任务提交失败");
    }
}

/** 查询任务输出。QUEUED/RUNNING 继续轮询，SUCCESS 取 results[].url，FAILED 读 failedReason/errorMessage */
export async function pollRunningHubTask(config: { baseUrl: string; apiKey: string }, taskId: string, signal?: AbortSignal): Promise<{ final: boolean; failed: boolean; resultUrls?: string[]; error?: string }> {
    let payload: RunningHubTaskPayload;
    try {
        const response = await axios.post<RunningHubTaskPayload>(
            runninghubUrl(config.baseUrl, "/openapi/v2/query"),
            { taskId },
            { headers: { ...authHeaders(config.apiKey), "Content-Type": "application/json" }, signal },
        );
        payload = response.data;
    } catch (error) {
        throw toApiError(error, "任务状态查询失败");
    }
    const { status, errorCode, errorMessage, failedReason, results } = payload;
    const normalized = (status || "").toUpperCase();
    if (PENDING_STATUS.has(normalized)) return { final: false, failed: false };
    if (SUCCESS_STATUS.has(normalized)) {
        const urls = (results || []).map((item) => item.url).filter((url): url is string => Boolean(url));
        if (!urls.length) return { final: true, failed: true, error: "任务完成但没有返回结果文件" };
        return { final: true, failed: false, resultUrls: urls };
    }
    return { final: true, failed: true, error: failedReason?.exception_message || failedReason?.node_name || errorMessage || `任务状态 ${status || "未知"}${errorCode ? `（${errorCode}）` : ""}` };
}
