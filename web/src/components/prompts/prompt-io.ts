import { normalizePromptCards, PROMPT_COLORS, type Prompt, type PromptColor } from "@/stores/use-prompt-store";

/** 导出文件格式版本，便于未来无损往返升级；v2 起组合字段为 cards（卡片层级） */
export const PROMPT_EXPORT_VERSION = 2;

export type PromptExportFile = {
    version: number;
    exportedAt: string;
    groups: string[];
    prompts: Array<Partial<Prompt>>;
};

/** 精简导出字段：只保留可无损还原的内容 */
function toExportPrompt(p: Prompt): Partial<Prompt> {
    const item: Partial<Prompt> = {
        id: p.id,
        title: p.title,
        prompt: p.prompt,
        tags: p.tags,
        coverUrl: p.coverUrl,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
    };
    if (p.cards?.length) item.cards = p.cards;
    if (p.group) item.group = p.group;
    if (p.color) item.color = p.color;
    return item;
}

export function buildExportFile(prompts: Prompt[]): PromptExportFile {
    const groups = Array.from(new Set(prompts.map((p) => p.group).filter((g): g is string => Boolean(g))));
    return {
        version: PROMPT_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        groups,
        prompts: prompts.map(toExportPrompt),
    };
}

/** 触发浏览器下载 JSON 文件 */
export function downloadPromptJson(data: PromptExportFile, prefix: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    const safePrefix = prefix.replace(/[<>:"/\\|?*]/g, "_");
    anchor.download = `${safePrefix}-${ts}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

export type ParsedImport = { prompts: Array<Partial<Prompt>>; groups: string[] };

/** 解析导入的 JSON 文本，兼容 {prompts:[...]} 与裸数组两种形态 */
export function parseImportJson(text: string): ParsedImport {
    const data = JSON.parse(text);
    const rawPrompts: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.prompts)
          ? data.prompts
          : [];
    const prompts = rawPrompts
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => {
            const out: Partial<Prompt> = {
                id: typeof item.id === "string" ? item.id : undefined,
                title: typeof item.title === "string" ? item.title : "",
                prompt: typeof item.prompt === "string" ? item.prompt : "",
                coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : "",
                tags: Array.isArray(item.tags) ? (item.tags.filter((t) => typeof t === "string") as string[]) : [],
                cards: normalizePromptCards(item.cards),
                group: typeof item.group === "string" && item.group.trim() ? item.group.trim() : undefined,
                color: PROMPT_COLORS.includes(item.color as PromptColor) ? (item.color as PromptColor) : undefined,
                createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
                updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
            };
            return out;
        });
    const groups = Array.isArray(data?.groups) ? (data.groups.filter((g: unknown) => typeof g === "string") as string[]) : [];
    return { prompts, groups };
}
