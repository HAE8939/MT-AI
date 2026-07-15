import { useMemo } from "react";

import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";
import { usePromptStore } from "@/stores/use-prompt-store";

export const PROMPT_PAGE_SIZE = 20;
/** 未分组分组 tab 的固定标识 */
export const UNGROUPED_OPTION = "未分组";

export function usePromptList({
    keyword,
    tags,
    category,
    group,
    enabled = true,
}: {
    keyword: string;
    tags: string[];
    category: string;
    group?: string;
    enabled?: boolean;
}) {
    const hydrated = usePromptStore((s) => s.hydrated);
    const prompts = usePromptStore((s) => s.prompts);
    const storeGroups = usePromptStore((s) => s.groups);

    const matchGroup = (item: Prompt) => {
        if (!group || group === ALL_PROMPTS_OPTION) return true;
        if (group === UNGROUPED_OPTION) return !item.group;
        return item.group === group;
    };

    const filtered = useMemo<Prompt[]>(() => {
        if (!enabled || !hydrated) return [];
        const kw = keyword.trim().toLowerCase();
        return prompts.filter((item) => {
            if (!matchGroup(item)) return false;
            if (category && category !== ALL_PROMPTS_OPTION && !item.tags.includes(category)) return false;
            if (tags.length && !tags.some((tag) => item.tags.includes(tag))) return false;
            if (!kw) return true;
            return [item.title, item.prompt, ...item.tags].join(" ").toLowerCase().includes(kw);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, hydrated, prompts, keyword, tags, category, group]);

    const items = useMemo(() => filtered.slice(0, PROMPT_PAGE_SIZE * 100), [filtered]);

    const allTags = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        const withoutTagFilter = prompts.filter((item) => {
            if (!matchGroup(item)) return false;
            if (category && category !== ALL_PROMPTS_OPTION && !item.tags.includes(category)) return false;
            if (!kw) return true;
            return [item.title, item.prompt, ...item.tags].join(" ").toLowerCase().includes(kw);
        });
        return [ALL_PROMPTS_OPTION, ...Array.from(new Set(withoutTagFilter.flatMap((p) => p.tags).filter(Boolean)))];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prompts, keyword, category, group]);

    // 全部分组名（来自 store.groups 与提示词自带 group 的并集），含是否存在未分组卡片
    const groups = useMemo(() => {
        const names = new Set<string>(storeGroups);
        let hasUngrouped = false;
        prompts.forEach((p) => {
            if (p.group) names.add(p.group);
            else hasUngrouped = true;
        });
        return { names: Array.from(names), hasUngrouped };
    }, [prompts, storeGroups]);

    return {
        items,
        tags: allTags,
        categories: [ALL_PROMPTS_OPTION] as string[],
        groups,
        total: filtered.length,
        isLoading: !hydrated && enabled,
    };
}
