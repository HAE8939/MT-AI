export type AiWorkflowType = "image-generation" | "runninghub";
export type AiWorkflowStatus = "queued" | "submitting" | "polling" | "running" | "succeeded" | "failed" | "cancelled";

/** 画布常规 AI 生图任务的轻量登记参数 */
export type ImageGenerationParams = {
    prompt: string;
    mode: "generation" | "edit";
    model?: string;
    count?: number;
};

/** RunningHub 云工作流任务：workflowId + 已解析的 nodeInfoList 覆盖项 */
export type RunningHubTaskParams = {
    workflowId: string;
    nodeInfoList: Array<{ nodeId: string; fieldName: string; fieldValue: string }>;
    /** 模板 id，仅用于展示 */
    agentTemplateId?: string;
};

export type AiWorkflowParams = ImageGenerationParams | RunningHubTaskParams;

export type AiWorkflowTask = {
    id: string;
    projectId: string;
    sourceNodeId: string;
    targetNodeIds: string[];
    type: AiWorkflowType;
    status: AiWorkflowStatus;
    externalTaskId?: string;
    params: AiWorkflowParams;
    resultUrls: string[];
    /** 结果图在本地 image-storage 的 storageKey，用于刷新后重新解析出可用 URL */
    resultStorageKeys?: string[];
    /** 结果提示词，用于图文合成下载与预览标注 */
    prompt?: string;
    /** 远端返回的进度百分比（0-100），无进度数据时为空 */
    progress?: number;
    error?: string;
    createdAt: string;
    updatedAt: string;
};
