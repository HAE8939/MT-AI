import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Tag } from "antd";

import { cn } from "@/lib/utils";
import type { PromptComboCard } from "@/stores/use-prompt-store";
import { buildComboText, cloneComboCards } from "./prompt-combo";

/**
 * 卡片层级组合器：内部持有 cards 深拷贝，点选标签切换 selected，
 * 实时组合成 JSON 提示词，含 JSON 预览、复制与填充（onUse）。
 */
export function PromptComboBuilder({
    basePrompt = "",
    cards,
    onCopy,
    onUse,
    useLabel = "使用此提示词",
}: {
    basePrompt?: string;
    cards: PromptComboCard[];
    onCopy?: (text: string) => void;
    onUse?: (text: string) => void;
    useLabel?: string;
}) {
    const [cardsState, setCardsState] = useState<PromptComboCard[]>(() => cloneComboCards(cards));

    useEffect(() => {
        setCardsState(cloneComboCards(cards));
    }, [cards]);

    const composed = useMemo(() => buildComboText(basePrompt, cardsState), [basePrompt, cardsState]);

    const toggleTag = (cardIndex: number, keyIndex: number, tagIndex: number) => {
        setCardsState((prev) =>
            prev.map((card, ci) =>
                ci !== cardIndex
                    ? card
                    : {
                          ...card,
                          keys: card.keys.map((group, ki) =>
                              ki !== keyIndex
                                  ? group
                                  : { ...group, tags: group.tags.map((tag, ti) => (ti !== tagIndex ? tag : { ...tag, selected: !tag.selected })) },
                          ),
                      },
            ),
        );
    };

    return (
        <div className="space-y-4">
            {cardsState.map((card, cardIndex) => (
                <div key={cardIndex} className="space-y-3">
                    {card.name.trim() ? <div className="text-sm font-semibold text-stone-700 dark:text-stone-200">{card.name}</div> : null}
                    {card.keys.map((group, keyIndex) => (
                        <div key={keyIndex}>
                            <div className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">{group.key}</div>
                            <div className="flex flex-wrap gap-2">
                                {group.tags.map((tag, tagIndex) => (
                                    <Tag.CheckableTag
                                        key={tagIndex}
                                        checked={Boolean(tag.selected)}
                                        className={cn("prompt-filter-tag", tag.selected && "is-active")}
                                        onChange={() => toggleTag(cardIndex, keyIndex, tagIndex)}
                                    >
                                        <span title={tag.value && tag.value !== tag.label ? tag.value : undefined}>{tag.label}</span>
                                    </Tag.CheckableTag>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ))}

            <div>
                <div className="mb-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">JSON 预览</div>
                <pre className="thin-scrollbar max-h-64 overflow-auto rounded-lg bg-stone-100 p-3 text-xs leading-5 whitespace-pre-wrap text-stone-700 dark:bg-stone-800 dark:text-stone-300">
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
