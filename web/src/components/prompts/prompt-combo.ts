import type { Prompt, PromptComboCard, PromptComboTag, PromptKeyGroup } from "@/stores/use-prompt-store";

/** 组合式卡片：cards 非空即视为组合卡片 */
export function isComboPrompt(prompt: Prompt): boolean {
    return Boolean(prompt.cards && prompt.cards.length > 0);
}

/** 深拷贝卡片，供组合器做本地勾选状态 */
export function cloneComboCards(cards: PromptComboCard[]): PromptComboCard[] {
    return structuredClone(cards);
}

/** 组合卡片键值组总数，用于卡片角标文案 */
export function countComboKeys(cards: PromptComboCard[]): number {
    return cards.reduce((sum, card) => sum + card.keys.length, 0);
}

/** 按 selected 标签组合键值 JSON：{卡片名: {键: "值, 值"}}；无名卡片平铺顶层；空卡片/空键跳过 */
export function buildComboJson(cards: PromptComboCard[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const card of cards) {
        const cardData: Record<string, string> = {};
        for (const group of card.keys) {
            const chosen = group.tags.filter((tag) => tag.selected);
            if (chosen.length > 0) cardData[group.key] = chosen.map((tag) => tag.value || tag.label).join(", ");
        }
        if (Object.keys(cardData).length === 0) continue;
        const name = card.name.trim();
        if (name) result[name] = cardData;
        else Object.assign(result, cardData);
    }
    return result;
}

/** 组合最终提示词文本：基础正文（如有）+ 键值 JSON */
export function buildComboText(basePrompt: string, cards: PromptComboCard[]): string {
    const json = buildComboJson(cards);
    const jsonText = Object.keys(json).length > 0 ? JSON.stringify(json, null, 2) : "";
    const base = basePrompt.trim();
    if (base && jsonText) return `${base}\n\n${jsonText}`;
    return jsonText || base;
}

/** 组合卡片的默认文本（按数据自带 selected 组合），用于卡片级复制 / 加入素材 */
export function getPromptText(prompt: Prompt): string {
    if (!isComboPrompt(prompt)) return prompt.prompt;
    return buildComboText(prompt.prompt, prompt.cards!);
}

const TAG_SEPARATOR = /\/|\+|、|，|,/;

/** DMDS 通用 JSON 导入：任意对象 → 组合卡片；非对象/数组/空对象返回 null */
export function comboCardsFromJson(data: unknown): PromptComboCard[] | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const cards: PromptComboCard[] = [];
    for (const [cardName, cardValue] of Object.entries(data)) {
        if (!cardValue || typeof cardValue !== "object" || Array.isArray(cardValue)) {
            const label = String(cardValue).trim();
            if (label) cards.push({ name: cardName, keys: [{ key: "内容", tags: [{ label, selected: true }] }] });
            continue;
        }
        const keys: PromptKeyGroup[] = [];
        for (const [keyName, keyValue] of Object.entries(cardValue)) {
            const tags: PromptComboTag[] = [];
            const push = (raw: string) => {
                const label = raw.trim();
                if (!label || tags.some((tag) => (tag.value || tag.label).trim() === label)) return;
                tags.push({ label, selected: true });
            };
            if (typeof keyValue === "string") keyValue.split(TAG_SEPARATOR).forEach(push);
            else if (Array.isArray(keyValue)) keyValue.forEach((item) => push(typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)));
            else if (typeof keyValue === "object" && keyValue !== null) push(JSON.stringify(keyValue));
            else push(String(keyValue));
            if (tags.length > 0) keys.push({ key: keyName, tags });
        }
        if (keys.length > 0) cards.push({ name: cardName, keys });
    }
    return cards.length > 0 ? cards : null;
}

/** 从自由文本提取组合卡片：优先 ``` 代码块，其次首个 { 到末个 } 子串；解析失败返回 null */
export function extractComboCardsFromText(text: string): PromptComboCard[] | null {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let candidate = fence ? fence[1] : text;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    candidate = candidate.slice(start, end + 1);
    try {
        return comboCardsFromJson(JSON.parse(candidate));
    } catch {
        return null;
    }
}

/** 编辑器草稿：每行一个标签，语法 `标签名` 或 `标签名=实际值`，行首 `*` 表示默认勾选 */
export type ComboKeyDraft = { key: string; tagsText: string };
export type ComboCardDraft = { name: string; keys: ComboKeyDraft[] };

function tagToLine(tag: PromptComboTag): string {
    const value = tag.value && tag.value !== tag.label ? `=${tag.value}` : "";
    return `${tag.selected ? "*" : ""}${tag.label}${value}`;
}

function lineToTag(line: string): PromptComboTag | null {
    let text = line.trim();
    if (!text) return null;
    const selected = text.startsWith("*");
    if (selected) text = text.slice(1).trim();
    const eq = text.indexOf("=");
    const label = (eq === -1 ? text : text.slice(0, eq)).trim();
    const value = eq === -1 ? "" : text.slice(eq + 1).trim();
    if (!label) return null;
    return { label, ...(value && value !== label ? { value } : {}), ...(selected ? { selected: true } : {}) };
}

export function cardsToDrafts(cards?: PromptComboCard[]): ComboCardDraft[] {
    return (cards || []).map((card) => ({
        name: card.name,
        keys: card.keys.map((group) => ({ key: group.key, tagsText: group.tags.map(tagToLine).join("\n") })),
    }));
}

export function draftsToCards(drafts: ComboCardDraft[]): PromptComboCard[] | undefined {
    const cards = drafts
        .map((draft) => ({
            name: draft.name.trim(),
            keys: draft.keys
                .map((group) => ({
                    key: group.key.trim(),
                    tags: group.tagsText.split("\n").map(lineToTag).filter((tag): tag is PromptComboTag => tag !== null),
                }))
                .filter((group) => group.key && group.tags.length > 0),
        }))
        .filter((card) => card.keys.length > 0);
    return cards.length > 0 ? cards : undefined;
}
