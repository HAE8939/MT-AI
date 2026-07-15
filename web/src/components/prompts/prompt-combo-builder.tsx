import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Tag } from "antd";

import { cn } from "@/lib/utils";
import type { Prompt } from "@/stores/use-prompt-store";
import { buildComboText, defaultComboSelection } from "./prompt-combo";

/**
 * 组合式卡片构建器：每个 key 下渲染多个可勾选 tag，
 * 勾选实时组合成 JSON 提示词，含 JSON 预览、复制与填充（onUse）。
 */
export function PromptComboBuilder({
    prompt,
    onCopy,
    onUse,
    useLabel = "使用此提示词",
}: {
    prompt: Prompt;
    onCopy?: (text: string) => void;
    onUse?: (text: string) => void;
    useLabel?: string;
}) {
    const [selection, setSelection] = useState<Record<string, string[]>>(() => defaultComboSelection(prompt));

    useEffect(() => {
        setSelection(defaultComboSelection(prompt));
    }, [prompt]);

    const composed = useMemo(() => buildComboText(prompt, selection), [prompt, selection]);

    const toggleTag = (key: string, tag: string) => {
        setSelection((prev) => {
            const current = prev[key] || [];
            const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
            return { ...prev, [key]: next };
        });
    };

    return (
        <div className="space-y-4">
            {prompt.keys?.map((group) => {
                const selected = selection[group.key] || [];
                return (
                    <div key={group.key}>
                        <div className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">{group.key}</div>
                        <div className="flex flex-wrap gap-2">
                            {group.tags.map((tag) => {
                                const active = selected.includes(tag);
                                return (
                                    <Tag.CheckableTag
                                        key={tag}
                                        checked={active}
                                        className={cn("prompt-filter-tag", active && "is-active")}
                                        onChange={() => toggleTag(group.key, tag)}
                                    >
                                        {tag}
                                    </Tag.CheckableTag>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            <div>
                <div className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">JSON 预览</div>
                <pre className="thin-scrollbar max-h-64 overflow-auto rounded-lg bg-stone-100 p-3 text-xs leading-5 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                    {composed || "（未勾选任何标签）"}
                </pre>
            </div>

            <div className="flex flex-wrap gap-2">
                {onUse ? (
                    <Button type="primary" icon={<Check className="size-4" />} disabled={!composed} onClick={() => onUse(composed)}>
                        {useLabel}
                    </Button>
                ) : null}
                {onCopy ? (
                    <Button icon={<Copy className="size-4" />} disabled={!composed} onClick={() => onCopy(composed)}>
                        复制组合
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
