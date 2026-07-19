import { describe, expect, test } from "bun:test";

import { changeWorkflowMaskSource, clearWorkflowMask, emptyWorkflowMaskState, saveWorkflowMask } from "@/lib/workflow-mask-state";

const mask = "data:image/png;base64,mask";
const preview = "data:image/png;base64,preview";

describe("workflow mask state", () => {
    test("clears a saved mask when the source changes", () => {
        const saved = saveWorkflowMask(changeWorkflowMaskSource(emptyWorkflowMaskState, "source-a"), mask, preview);

        expect(changeWorkflowMaskSource(saved, "source-b")).toEqual({ sourceKey: "source-b", maskDataUrl: "", maskPreviewDataUrl: "" });
    });

    test("keeps a saved mask when the source stays the same", () => {
        const saved = saveWorkflowMask(changeWorkflowMaskSource(emptyWorkflowMaskState, "source-a"), mask, preview);

        expect(changeWorkflowMaskSource(saved, "source-a")).toBe(saved);
    });

    test("clears only mask output while retaining the source", () => {
        const saved = saveWorkflowMask(changeWorkflowMaskSource(emptyWorkflowMaskState, "source-a"), mask, preview);

        expect(clearWorkflowMask(saved)).toEqual({ sourceKey: "source-a", maskDataUrl: "", maskPreviewDataUrl: "" });
    });
});
