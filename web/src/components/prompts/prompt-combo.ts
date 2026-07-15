import type { Prompt } from "@/stores/use-prompt-store";

/** 组合式卡片：keys 非空即视为组合卡片 */
export function isComboPrompt(prompt: Prompt): boolean {
    return Boolean(prompt.keys && prompt.keys.length > 0);
}

/** 默认勾选：每个 key 选中第一个 tag（与 DMDS 默认行为一致） */
export function defaultComboSelection(prompt: Prompt): Record<string, string[]> {
    const selection: Record<string, string[]> = {};
    for (const group of prompt.keys || []) {
        if (group.tags.length > 0) selection[group.key] = [group.tags[0]];
    }
    return selection;
}

/** 把勾选结果组合为键值 JSON 对象（参考 DMDS getPromptText：多选 tag 用逗号连接） */
export function buildComboJson(prompt: Prompt, selection: Record<string, string[]>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const group of prompt.keys || []) {
        const chosen = (selection[group.key] || []).filter((tag) => group.tags.includes(tag));
        if (chosen.length > 0) result[group.key] = chosen.join(", ");
    }
    return result;
}

/** 组合最终提示词文本：基础正文（如有）+ 键值 JSON */
export function buildComboText(prompt: Prompt, selection: Record<string, string[]>): string {
    const json = buildComboJson(prompt, selection);
    const jsonText = Object.keys(json).length > 0 ? JSON.stringify(json, null, 2) : "";
    const base = prompt.prompt.trim();
    if (base && jsonText) return `${base}\n\n${jsonText}`;
    return jsonText || base;
}

/** 组合卡片的默认文本（默认勾选下的组合结果），用于卡片级复制 / 加入素材 */
export function getPromptText(prompt: Prompt): string {
    if (!isComboPrompt(prompt)) return prompt.prompt;
    return buildComboText(prompt, defaultComboSelection(prompt));
}
