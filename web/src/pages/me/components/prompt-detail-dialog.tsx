import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button, Modal, Space, Tag } from "antd";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { PromptComboBuilder } from "@/components/prompts/prompt-combo-builder";
import { isComboPrompt } from "@/components/prompts/prompt-combo";

export function PromptDetailDialog({
    prompt,
    isJsonPrompt = false,
    onClose,
    onCopy,
    onEdit,
    onDelete,
}: {
    prompt: Prompt | null;
    isJsonPrompt?: boolean;
    onClose: () => void;
    onCopy: (prompt: string) => void;
    onEdit?: (prompt: Prompt) => void;
    onDelete?: (prompt: Prompt) => void;
}) {
    const combo = prompt ? isComboPrompt(prompt) : false;

    return (
        <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={860}>
            {prompt ? (
                <div className={cn("grid gap-5", prompt.coverUrl && "md:grid-cols-[300px_minmax(0,1fr)]")}>
                    {prompt.coverUrl ? (
                        <div className="space-y-3">
                            <img src={prompt.coverUrl} alt={prompt.title} className="aspect-[4/3] w-full rounded-lg object-cover" />
                        </div>
                    ) : null}
                    <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            {isJsonPrompt ? <Tag color="blue" className="m-0">项目内置</Tag> : null}
                            {prompt.group ? <Tag className="m-0">{prompt.group}</Tag> : null}
                            {combo ? <Tag color="purple" className="m-0">组合式</Tag> : null}
                        </div>
                        {prompt.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {prompt.tags.map((tag) => (
                                    <Tag key={tag} className="m-0">
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        )}
                        {combo ? (
                            <div className="mt-4">
                                {prompt.prompt.trim() ? (
                                    <p className="mb-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{prompt.prompt}</p>
                                ) : null}
                                <PromptComboBuilder prompt={prompt} onCopy={(text) => onCopy(text)} useLabel="复制组合" />
                            </div>
                        ) : (
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{prompt.prompt}</p>
                        )}
                        <div className="mt-4 text-xs text-stone-500 dark:text-stone-400">
                            创建：{formatPromptDate(prompt.createdAt)} · 更新：{formatPromptDate(prompt.updatedAt)}
                            {isJsonPrompt ? " · 来自 prompts.json" : null}
                        </div>
                        <Space wrap className="mt-5">
                            {combo ? null : (
                                <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                                    复制提示词
                                </Button>
                            )}
                            {onEdit ? (
                                <Button icon={<Pencil className="size-4" />} onClick={() => onEdit(prompt)}>
                                    编辑
                                </Button>
                            ) : null}
                            {onDelete ? (
                                <Button danger icon={<Trash2 className="size-4" />} onClick={() => onDelete(prompt)}>
                                    {isJsonPrompt ? "隐藏" : "删除"}
                                </Button>
                            ) : null}
                        </Space>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
