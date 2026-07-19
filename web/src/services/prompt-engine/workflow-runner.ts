import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import { requestEdit, requestGeneration } from "@/services/api/image";
import type { PromptEngineWorkflowConfig } from "@/types/workflow";
import type { ReferenceImage } from "@/types/image";

import { expandPrompt, type ExpandPromptInput } from "./llm-expander";

// 提示词引擎工作流执行器：预处理 → LLM 扩写 → 按 taskType 路由图像模型。
// 蒙版无需单独转换：requestEdit 的 images/edits 通道内部会做二值化，
// 画布蒙版语义与 gpt-image-1 一致（透明区 = 重绘区）。

export type PromptEngineRunInput = {
    /** 原图 dataUrl（inputSpec.image 非 none 时必填/可选） */
    image?: string;
    /** 蒙版 dataUrl（画布蒙版编辑器产出格式） */
    mask?: string;
    /** 参考图 dataUrl 列表 */
    refImages?: string[];
    /** 用户一句话输入 */
    userText?: string;
    /** 额外表单项取值 */
    extraFields?: Record<string, string | number>;
};

export type PromptEngineRunResult = {
    /** 生成结果（id + dataUrl），多图工作流可能多张 */
    images: Array<{ id: string; dataUrl: string }>;
    /** LLM 扩写出的最终提示词（调优观测窗口，必须保存与展示） */
    finalPrompt: string;
};

/** 按 inputSpec 校验输入完整性，返回错误信息（null = 通过） */
export function validateRunInput(config: PromptEngineWorkflowConfig, input: PromptEngineRunInput): string | null {
    if (config.inputSpec.image === "required" && !input.image) return "请先上传原图";
    if (config.inputSpec.mask === "required" && !input.mask) return "请先涂抹蒙版指定修改区域";
    if (config.inputSpec.userText === "required" && !input.userText?.trim()) return "请输入描述文字";
    const requiredRefs = config.inputSpec.refImagesOptional ? 0 : config.inputSpec.refImages || 0;
    if (requiredRefs > 0 && (input.refImages?.length || 0) < requiredRefs) return `请上传 ${requiredRefs} 张参考图`;
    return null;
}

function toReference(dataUrl: string, name: string): ReferenceImage {
    return { id: `pe-${nanoid()}`, name, type: "image/png", dataUrl };
}

/**
 * 运行一个提示词引擎工作流：LLM 扩写 → 图像生成。
 * aiConfig 需同时配置好文本模型（扩写）与图像模型（生成）。
 */
export async function runPromptEngineWorkflow(
    aiConfig: AiConfig,
    config: PromptEngineWorkflowConfig,
    input: PromptEngineRunInput,
    options?: { signal?: AbortSignal; onExpandDelta?: (text: string) => void; onPhase?: (phase: "expanding" | "generating") => void },
): Promise<PromptEngineRunResult> {
    const invalid = validateRunInput(config, input);
    if (invalid) throw new Error(invalid);
    if (config.meta.taskType === "upscale") throw new Error("高清放大需要专业放大服务（Real-ESRGAN/Topaz 类），暂未接入，请先使用其他工作流");

    // 1. LLM 扩写
    options?.onPhase?.("expanding");
    const expandInput: ExpandPromptInput = {
        userText: input.userText,
        extraFields: input.extraFields,
        imageDataUrl: input.image,
        refImageDataUrls: input.refImages,
    };
    const finalPrompt = await expandPrompt(aiConfig, config, expandInput, { signal: options?.signal, onDelta: options?.onExpandDelta });

    // 2. 图像生成：按 taskType 路由
    options?.onPhase?.("generating");
    const count = Math.max(1, config.outputSpec.count || 1);
    const generationConfig: AiConfig = { ...aiConfig, model: aiConfig.imageModel || aiConfig.model, count: String(count) };

    const references: ReferenceImage[] = [];
    if (input.image) references.push(toReference(input.image, "source.png"));
    (input.refImages || []).forEach((dataUrl, index) => references.push(toReference(dataUrl, `reference-${index + 1}.png`)));

    let generated: Array<{ id: string; dataUrl: string }>;
    if (config.meta.taskType === "generate" || !references.length) {
        generated = await requestGeneration(generationConfig, finalPrompt, { signal: options?.signal });
    } else {
        const mask = config.meta.taskType === "masked-edit" && input.mask ? toReference(input.mask, "mask.png") : undefined;
        generated = await requestEdit(generationConfig, finalPrompt, references, mask, { signal: options?.signal });
    }
    if (!generated.length) throw new Error("图像模型没有返回结果");

    return { images: generated, finalPrompt };
}
