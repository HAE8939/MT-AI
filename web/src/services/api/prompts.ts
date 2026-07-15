import { usePromptStore, type Prompt } from "@/stores/use-prompt-store";

export type { Prompt } from "@/stores/use-prompt-store";

export const ALL_PROMPTS_OPTION = "全部";

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

export async function fetchPrompts({
    keyword = "",
    tag = [],
    category = ALL_PROMPTS_OPTION,
    page = 1,
    pageSize = 20,
}: {
    keyword?: string;
    tag?: string[];
    category?: string;
    page?: number;
    pageSize?: number;
} = {}): Promise<PromptListResponse> {
    const prompts = usePromptStore.getState().prompts;
    const normalizedKeyword = keyword.trim().toLowerCase();
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.max(1, Math.min(100, pageSize));

    const withoutTagFilter = filterPrompts(prompts, { keyword: normalizedKeyword, category });
    const filtered = filterPrompts(prompts, { keyword: normalizedKeyword, category, tags: tag });

    return {
        items: filtered.slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize),
        tags: collectTags(withoutTagFilter),
        categories: [],
        total: filtered.length,
    };
}

export function addPrompt(data: Omit<Prompt, "id" | "createdAt" | "updatedAt">) {
    return usePromptStore.getState().addPrompt(data);
}

export function updatePrompt(id: string, patch: Partial<Omit<Prompt, "id" | "createdAt">>) {
    usePromptStore.getState().updatePrompt(id, patch);
}

export function removePrompt(id: string) {
    usePromptStore.getState().removePrompt(id);
}

export function duplicatePrompt(id: string) {
    return usePromptStore.getState().duplicatePrompt(id);
}

function filterPrompts(items: Prompt[], options: { keyword: string; category: string; tags?: string[] }) {
    return items.filter((item) => {
        if (isActiveOption(options.category) && item.tags?.includes(options.category) === false) return false;
        if (options.tags?.length && !options.tags.some((tag) => item.tags.includes(tag))) return false;
        if (!options.keyword) return true;
        return [item.title, item.prompt, ...item.tags].join(" ").toLowerCase().includes(options.keyword);
    });
}

function collectTags(items: Prompt[]) {
    return Array.from(new Set(items.flatMap((item) => item.tags).filter(Boolean)));
}

function isActiveOption(value: string) {
    return value && value !== "全部" && value !== "all";
}

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
