export type WorkflowMaskState = {
    sourceKey: string;
    maskDataUrl: string;
    maskPreviewDataUrl: string;
};

export const emptyWorkflowMaskState: WorkflowMaskState = { sourceKey: "", maskDataUrl: "", maskPreviewDataUrl: "" };

export function changeWorkflowMaskSource(state: WorkflowMaskState, sourceKey: string): WorkflowMaskState {
    return state.sourceKey === sourceKey ? state : { sourceKey, maskDataUrl: "", maskPreviewDataUrl: "" };
}

export function saveWorkflowMask(state: WorkflowMaskState, maskDataUrl: string, maskPreviewDataUrl: string): WorkflowMaskState {
    return { ...state, maskDataUrl, maskPreviewDataUrl };
}

export function clearWorkflowMask(state: WorkflowMaskState): WorkflowMaskState {
    return { ...state, maskDataUrl: "", maskPreviewDataUrl: "" };
}
