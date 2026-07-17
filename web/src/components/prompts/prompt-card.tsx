import { Copy, Layers, Pencil, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Button, Card, Tag } from "antd";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";
import { getPromptColorMeta } from "./prompt-colors";
import { isComboPrompt } from "./prompt-combo";

export function PromptCard({
    item,
    onOpen,
    onCopy,
    onEdit,
    onDelete,
    actionLabel = "复制",
    actionIcon = <Copy className="size-3.5" />,
    actionType = "text",
    extraAction,
}: {
    item: Prompt;
    onOpen: () => void;
    onCopy: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    actionLabel?: string;
    actionIcon?: ReactNode;
    actionType?: "text" | "primary";
    extraAction?: ReactNode;
}) {
    const colorMeta = getPromptColorMeta(item.color);
    const combo = isComboPrompt(item);
    const bodyStyle: CSSProperties = colorMeta
        ? { padding: 0, backgroundColor: colorMeta.soft, borderTop: `3px solid ${colorMeta.accent}` }
        : { padding: 0 };

    return (
        <Card
            hoverable
            className="overflow-hidden"
            styles={{ body: bodyStyle }}
            cover={
                item.coverUrl ? (
                    <button type="button" className="block w-full text-left" onClick={onOpen}>
                        <img src={item.coverUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" />
                    </button>
                ) : undefined
            }
        >
            <button type="button" className="block w-full text-left" onClick={onOpen}>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{item.title}</h2>
                        <span className="shrink-0 text-xs text-stone-400 dark:text-stone-500">{formatPromptDate(item.updatedAt)}</span>
                    </div>
                    {combo ? (
                        <p className="mt-2 flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                            <Layers className="size-3.5" />
                            组合式 · {item.keys?.length} 个键值组
                        </p>
                    ) : (
                        <p className="mt-2 line-clamp-3 text-xs leading-5 text-stone-600 dark:text-stone-400">{item.prompt}</p>
                    )}
                    {item.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {item.tags.map((tag) => (
                                <Tag key={tag} className="m-0 text-[11px]">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    )}
                </div>
            </button>
            <div className="flex items-center gap-2 px-4 pb-4">
                <Button block={actionType === "primary"} type={actionType} size="small" icon={actionIcon} onClick={onCopy}>
                    {actionLabel}
                </Button>
                {extraAction}
                {onEdit && (
                    <Button size="small" icon={<Pencil className="size-3.5" />} onClick={onEdit} />
                )}
                {onDelete && (
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete} />
                )}
            </div>
        </Card>
    );
}
