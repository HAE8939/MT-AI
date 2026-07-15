export type AiWorkflowType = "drawing-render" | "multi-angle" | "upscale" | "image-generation";
export type AiWorkflowStatus = "queued" | "submitting" | "polling" | "running" | "succeeded" | "failed" | "cancelled";

export type DrawingRenderParams = {
    template: "photography" | "custom";
    customPrompt: string;
    description: string;
    referenceNodeId?: string;
    /** 本地上传的参考图 dataURL，优先于 referenceNodeId */
    referenceDataUrl?: string;
    styleStrength: number;
    outputQuality: number;
};

export type MultiAngleParams = {
    camera1: { horizontal: number; vertical: number; zoom: number };
    camera2: { horizontal: number; vertical: number; zoom: number };
};

export type UpscaleWorkflowParams = {
    targetResolution: 2048 | 4096;
};

/** 画布常规 AI 生图任务的轻量登记参数 */
export type ImageGenerationParams = {
    prompt: string;
    mode: "generation" | "edit";
    model?: string;
    count?: number;
};

export type AiWorkflowParams = DrawingRenderParams | MultiAngleParams | UpscaleWorkflowParams | ImageGenerationParams;

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

export type BizyAirWorkflowConfig = {
    baseUrl: string;
    apiKey: string;
};

export type BizyAirWorkflowInput =
    | { type: "drawing-render"; sourceImage: string; referenceImage: string; params: DrawingRenderParams }
    | { type: "multi-angle"; sourceImage: string; params: MultiAngleParams }
    | { type: "upscale"; sourceImage: string; params: UpscaleWorkflowParams };

export type BizyAirWorkflowResult = {
    status: "polling" | "succeeded" | "failed";
    externalTaskId?: string;
    resultUrls: string[];
    progress?: number;
    error?: string;
};
