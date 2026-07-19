import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { AiConfig } from "@/stores/use-config-store";
import type { PromptEngineWorkflowConfig } from "@/types/workflow";

const requestEdit = mock(async () => [{ id: "result", dataUrl: "data:image/png;base64,result" }]);

mock.module("@/services/api/image", () => ({
    requestEdit,
    requestGeneration: mock(async () => []),
}));
mock.module("./llm-expander", () => ({
    expandPrompt: mock(async () => "expanded prompt"),
}));

const { runPromptEngineWorkflow, validateRunInput } = await import("./workflow-runner");

const source = "data:image/png;base64,source";
const mask = "data:image/png;base64,mask";

function maskedWorkflow() {
    return {
        meta: { id: "masked-edit", name: "Masked edit", taskType: "masked-edit" },
        inputSpec: { image: "required", mask: "required", refImages: 0, userText: "optional" },
        outputSpec: { type: "image", count: 1 },
        promptEngine: {},
    } as unknown as PromptEngineWorkflowConfig;
}

describe("runPromptEngineWorkflow", () => {
    beforeEach(() => requestEdit.mockClear());

    test("uses automatic size for image editing workflows", async () => {
        const aiConfig = {
            model: "text-model",
            imageModel: "image-model",
            size: "16:9",
            quality: "high",
            count: "1",
        } as AiConfig;
        const workflow = {
            meta: { id: "white-model-render", name: "White model", taskType: "full-edit" },
            inputSpec: { image: "required", mask: "none", refImages: 0, userText: "optional" },
            outputSpec: { type: "image", count: 1 },
            promptEngine: {},
        } satisfies PromptEngineWorkflowConfig;

        await runPromptEngineWorkflow(aiConfig, workflow, { image: "data:image/png;base64,source" });

        expect(requestEdit).toHaveBeenCalledTimes(1);
        expect(requestEdit.mock.calls[0][0].size).toBe("auto");
    });

    test("allows masked workflows to run without a mask", async () => {
        const workflow = maskedWorkflow();
        const aiConfig = { model: "text-model", imageModel: "image-model", size: "auto", quality: "high", count: "1" } as AiConfig;

        expect(validateRunInput(workflow, { image: source })).toBeNull();
        await runPromptEngineWorkflow(aiConfig, workflow, { image: source });

        expect(requestEdit.mock.calls[0][3]).toBeUndefined();
    });

    test("passes a drawn mask to image editing", async () => {
        const aiConfig = { model: "text-model", imageModel: "image-model", size: "auto", quality: "high", count: "1" } as AiConfig;

        await runPromptEngineWorkflow(aiConfig, maskedWorkflow(), { image: source, mask });

        expect(requestEdit.mock.calls[0][3]?.dataUrl).toBe(mask);
    });
});
