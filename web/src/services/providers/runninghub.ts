import axios from "axios";

// RunningHub 云工作流 Provider：workflowId + nodeInfoList 提交 → outputs 轮询（813 排队 / 804 运行 / 805 失败 / 0 完成）。
// 前置：工作流必须先在 RunningHub 平台手动成功运行过一次才能通过 API 调用。

export const RUNNINGHUB_BASE_URL = "https://www.runninghub.cn";

export type RunningHubNodeInfo = { nodeId: string; fieldName: string; fieldValue: string };

type RunningHubResponse<T> = { code: number; msg?: string; data?: T };

function runninghubUrl(baseUrl: string, path: string) {
    return `${baseUrl.trim().replace(/\/+$/, "")}${path}`;
}

/** 上传输入文件（图片/音频/视频），返回可写入 LoadImage 类节点的 fileName */
export async function uploadRunningHubFile(config: { baseUrl: string; apiKey: string }, file: Blob, fileName: string, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append("apiKey", config.apiKey);
    form.append("fileType", "input");
    form.append("file", file, fileName);
    const response = await axios.post<RunningHubResponse<{ fileName?: string }>>(runninghubUrl(config.baseUrl, "/task/openapi/upload"), form, { signal });
    if (response.data.code !== 0 || !response.data.data?.fileName) throw new Error(response.data.msg || "文件上传失败");
    return response.data.data.fileName;
}

/** 提交工作流任务，nodeInfoList 只需包含要覆盖的字段 */
export async function submitRunningHubTask(config: { baseUrl: string; apiKey: string }, workflowId: string, nodeInfoList: RunningHubNodeInfo[], signal?: AbortSignal): Promise<string> {
    const response = await axios.post<RunningHubResponse<{ taskId?: string; promptTips?: string }>>(
        runninghubUrl(config.baseUrl, "/task/openapi/create"),
        { apiKey: config.apiKey, workflowId, nodeInfoList },
        { headers: { "Content-Type": "application/json" }, signal },
    );
    if (response.data.code !== 0 || !response.data.data?.taskId) throw new Error(response.data.msg || "工作流任务提交失败");
    return response.data.data.taskId;
}

/** 查询任务输出。code: 0 完成 / 804 运行中 / 813 排队 / 805 失败 */
export async function pollRunningHubTask(config: { baseUrl: string; apiKey: string }, taskId: string, signal?: AbortSignal): Promise<{ final: boolean; failed: boolean; resultUrls?: string[]; error?: string }> {
    const response = await axios.post<RunningHubResponse<Array<{ fileUrl?: string }>> & { failedReason?: { exception_message?: string; node_name?: string } }>(
        runninghubUrl(config.baseUrl, "/task/openapi/outputs"),
        { apiKey: config.apiKey, taskId },
        { headers: { "Content-Type": "application/json" }, signal },
    );
    const { code, msg, data, failedReason } = response.data;
    if (code === 0) {
        const urls = (data || []).map((item) => item.fileUrl).filter((url): url is string => Boolean(url));
        if (!urls.length) return { final: true, failed: true, error: "任务完成但没有返回结果文件" };
        return { final: true, failed: false, resultUrls: urls };
    }
    if (code === 804 || code === 813) return { final: false, failed: false };
    if (code === 805) return { final: true, failed: true, error: failedReason?.exception_message || failedReason?.node_name || msg || "工作流执行失败" };
    return { final: true, failed: true, error: msg || `未知状态码 ${code}` };
}
