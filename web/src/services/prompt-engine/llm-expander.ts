import type { AiConfig } from "@/stores/use-config-store";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import type { PromptEngineWorkflowConfig } from "@/types/workflow";

// LLM 提示词扩写引擎：System = 固定引导 + 工作流 JSON 的 promptEngine 知识库全文，
// User = 用户输入 + 原图/参考图（带图扩写为默认，扩写模型需具备视觉能力）。

export type ExpandPromptInput = {
    /** 用户的一句话输入（部分工作流无文本输入） */
    userText?: string;
    /** 额外表单项的取值（模式/档位/分辨率等），随用户输入一起传给 LLM */
    extraFields?: Record<string, string | number>;
    /** 原图 dataUrl（第一张图 = 几何/内容权威） */
    imageDataUrl?: string;
    /** 参考图 dataUrl 列表（图序按工作流 referenceProtocol 约定） */
    refImageDataUrls?: string[];
};

function buildSystemPrompt(config: PromptEngineWorkflowConfig): string {
    return [
        `你是「${config.meta.name}」方向的提示词专家。以下是本工作流的提示词知识库（JSON）：`,
        "",
        JSON.stringify(config.promptEngine),
        "",
        "规则：",
        "1. 先阅读 llmGuidance，区分硬契约与脚手架",
        "2. 按 coreFormula 分层组织扩写，脚手架部分鼓励基于图与意图自由发挥",
        "3. 按当前场景判断风险，将相关 failureModes 防错语义融入提示词",
        "4. 严格遵守 outputContract，只输出最终提示词本身，不要任何解释、前缀或代码块标记",
    ].join("\n");
}

function buildUserMessage(input: ExpandPromptInput): AiTextMessage {
    const textParts: string[] = [];
    if (input.userText?.trim()) textParts.push(`用户输入：「${input.userText.trim()}」`);
    if (input.extraFields && Object.keys(input.extraFields).length) {
        const fields = Object.entries(input.extraFields)
            .map(([key, value]) => `${key}=${value}`)
            .join("；");
        textParts.push(`用户选择的选项：${fields}`);
    }
    if (input.refImageDataUrls?.length) textParts.push(`第一张图为原图，其后 ${input.refImageDataUrls.length} 张为参考图（图序按 referenceProtocol 约定）。`);
    if (!textParts.length) textParts.push("用户没有额外输入，请基于图片与知识库默认方案扩写。");

    const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [{ type: "text", text: textParts.join("\n") }];
    if (input.imageDataUrl) content.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
    for (const url of input.refImageDataUrls || []) content.push({ type: "image_url", image_url: { url } });
    // 无图时退化为纯文本消息
    return { role: "user", content: content.length === 1 ? textParts.join("\n") : content };
}

/** 去掉 LLM 偶发包裹的代码块 / 引号，只留提示词本体 */
function cleanFinalPrompt(raw: string): string {
    return raw
        .trim()
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/, "")
        .replace(/^["“]|["”]$/g, "")
        .trim();
}

/**
 * 调用扩写 LLM 产出最终英文提示词。
 * 使用配置的文本模型（需具备视觉能力）；onDelta 可选，用于流式展示扩写过程。
 */
export async function expandPrompt(aiConfig: AiConfig, workflowConfig: PromptEngineWorkflowConfig, input: ExpandPromptInput, options?: { signal?: AbortSignal; onDelta?: (text: string) => void }): Promise<string> {
    const messages: AiTextMessage[] = [
        { role: "system", content: buildSystemPrompt(workflowConfig) },
        buildUserMessage(input),
    ];
    const expandConfig = { ...aiConfig, model: aiConfig.textModel || aiConfig.model };
    const answer = await requestImageQuestion(expandConfig, messages, options?.onDelta || (() => {}), { signal: options?.signal });
    const finalPrompt = cleanFinalPrompt(answer);
    if (!finalPrompt || finalPrompt === "没有返回内容") throw new Error("LLM 扩写未返回有效提示词，请检查文本模型配置");
    return finalPrompt;
}
