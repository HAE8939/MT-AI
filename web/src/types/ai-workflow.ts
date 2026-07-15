export type AiWorkflowType = "drawing-render" | "multi-angle" | "upscale";
export type AiWorkflowStatus = "queued" | "submitting" | "polling" | "succeeded" | "failed" | "cancelled";

export type DrawingRenderParams = {
    template: "photography" | "custom";
    customPrompt: string;
    description: string;
    referenceNodeId?: string;
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

export type AiWorkflowParams = DrawingRenderParams | MultiAngleParams | UpscaleWorkflowParams;

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
    error?: string;
};
