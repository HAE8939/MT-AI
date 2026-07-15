import { useMemo } from "react";

import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";
import { usePromptStore } from "@/stores/use-prompt-store";

export const PROMPT_PAGE_SIZE = 20;

export function usePromptList({ keyword, tags, category, enabled = true }: { keyword: string; tags: string[]; category: string; enabled?: boolean }) {
    const hydrated = usePromptStore((s) => s.hydrated);
    const prompts = usePromptStore((s) => s.prompts);

    const filtered = useMemo<Prompt[]>(() => {
        if (!enabled || !hydrated) return [];
        const kw = keyword.trim().toLowerCase();
        return prompts.filter((item) => {
            if (category && category !== ALL_PROMPTS_OPTION && !item.tags.includes(category)) return false;
            if (tags.length && !tags.some((tag) => item.tags.includes(tag))) return false;
            if (!kw) return true;
            return [item.title, item.prompt, ...item.tags].join(" ").toLowerCase().includes(kw);
        });
    }, [enabled, hydrated, prompts, keyword, tags, category]);

    const items = useMemo(() => filtered.slice(0, PROMPT_PAGE_SIZE * 100), [filtered]);

    const allTags = useMemo(() => {
        const withoutTagFilter = prompts.filter((item) => {
            const kw = keyword.trim().toLowerCase();
            if (category && category !== ALL_PROMPTS_OPTION && !item.tags.includes(category)) return false;
            if (!kw) return true;
            return [item.title, item.prompt, ...item.tags].join(" ").toLowerCase().includes(kw);
        });
        return [ALL_PROMPTS_OPTION, ...Array.from(new Set(withoutTagFilter.flatMap((p) => p.tags).filter(Boolean)))];
    }, [prompts, keyword, category]);

    return {
        items,
        tags: allTags,
        categories: [ALL_PROMPTS_OPTION] as string[],
        total: filtered.length,
        isLoading: !hydrated && enabled,
    };
}
