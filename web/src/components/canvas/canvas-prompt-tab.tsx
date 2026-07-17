import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Tag } from "antd";
import { Layers, Search, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { PromptComboBuilder } from "@/components/prompts/prompt-combo-builder";
import { countComboKeys, isComboPrompt } from "@/components/prompts/prompt-combo";
import { useCopyText } from "@/hooks/use-copy-text";
import { loadGallery } from "@/services/api/gallery";
import { useAgentStore } from "@/stores/use-agent-store";
import { GALLERY_GROUP, usePromptStore, type Prompt } from "@/stores/use-prompt-store";
import { CanvasNodeType } from "@/types/canvas";

// 面板「提示词」tab：浏览提示词库、点选组合标签，直接填入画布当前选中的生成节点。
// 顶部草稿区承接文本节点「结构化编辑」转来的组合卡片（会话态）。

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

const ALL_GROUP = "全部";
const UNGROUPED = "未分组";
/** 内置组合模板（源自 gallery.json，含 DMDS 提示词生成器），画布侧栏常驻可用 */
const COMBO_TEMPLATE_GROUP = "组合模板";

export function CanvasPromptTab({ theme }: { theme: Theme }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const prompts = usePromptStore((state) => state.prompts);
    const storeGroups = usePromptStore((state) => state.groups);
    const canvasContext = useAgentStore((state) => state.canvasContext);
    const draft = useAgentStore((state) => state.promptComboDraft);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const [keyword, setKeyword] = useState("");
    const [group, setGroup] = useState(ALL_GROUP);
    const [expandedId, setExpandedId] = useState("");
    const [galleryCombos, setGalleryCombos] = useState<Prompt[]>([]);

    useEffect(() => {
        let cancelled = false;
        void loadGallery()
            .then((data) => {
                if (cancelled) return;
                setGalleryCombos(
                    data.items
                        .filter((item) => item.cards?.length)
                        .map((item) => ({ id: `gallery-${item.id}`, title: item.title, coverUrl: "", prompt: item.prompt, tags: item.tags, createdAt: "", updatedAt: "", cards: item.cards, group: COMBO_TEMPLATE_GROUP, color: item.color })),
                );
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const allPrompts = useMemo(() => [...prompts, ...galleryCombos], [prompts, galleryCombos]);

    const groupTabs = useMemo(() => {
        const names = new Set<string>(storeGroups);
        allPrompts.forEach((p) => p.group && names.add(p.group));
        names.add(GALLERY_GROUP);
        return [ALL_GROUP, ...Array.from(names), UNGROUPED];
    }, [allPrompts, storeGroups]);

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return allPrompts.filter((p) => {
            if (group === UNGROUPED ? p.group : group !== ALL_GROUP && p.group !== group) return false;
            if (!kw) return true;
            return p.title.toLowerCase().includes(kw) || p.tags.some((tag) => tag.toLowerCase().includes(kw));
        });
    }, [allPrompts, keyword, group]);

    /** 直填目标：画布当前唯一选中的可生成节点 */
    const snapshot = canvasContext?.snapshot;
    const targetNode = useMemo(() => {
        if (!snapshot || snapshot.selectedNodeIds.length !== 1) return null;
        const node = snapshot.nodes.find((item) => item.id === snapshot.selectedNodeIds[0]);
        return node && node.type !== CanvasNodeType.Group && node.type !== CanvasNodeType.Config ? node : null;
    }, [snapshot]);

    const fill = (text: string) => {
        if (!canvasContext || !targetNode) return;
        // 文本节点正文是 content（prompt 字段不上屏）；生成类节点填 prompt 供生成面板使用
        const isTextNode = targetNode.type === CanvasNodeType.Text;
        canvasContext.applyOps([{ type: "update_node", id: targetNode.id, metadata: isTextNode ? { content: text } : { prompt: text } }]);
        message.success(isTextNode ? `已填入文本节点「${targetNode.title}」` : `已填入节点「${targetNode.title}」提示词，打开节点编辑面板可见`);
    };

    const hint = !snapshot ? "请先打开画布项目" : !targetNode ? "请在画布中选中一个生成节点" : "";
    const useLabel = "填入选中节点";

    const saveDraftToLibrary = () => {
        if (!draft) return;
        usePromptStore.getState().addPrompt({ title: draft.title, coverUrl: "", prompt: "", tags: [], cards: draft.cards });
        message.success("已保存到提示词库");
    };

    const renderActions = (prompt: Prompt) =>
        isComboPrompt(prompt) ? (
            <PromptComboBuilder basePrompt={prompt.prompt} cards={prompt.cards || []} onUse={targetNode ? fill : undefined} onCopy={(text) => copyText(text, "组合提示词已复制")} useLabel={useLabel} />
        ) : (
            <div className="space-y-3">
                <pre className="thin-scrollbar max-h-52 overflow-auto rounded-lg p-3 font-sans text-xs leading-5 whitespace-pre-wrap" style={{ background: theme.node.fill, color: theme.node.text }}>
                    {prompt.prompt}
                </pre>
                <div className="flex flex-wrap gap-2">
                    <Button size="small" type="primary" disabled={!targetNode} onClick={() => fill(prompt.prompt)}>
                        {useLabel}
                    </Button>
                    <Button size="small" onClick={() => copyText(prompt.prompt, "提示词已复制")}>
                        复制
                    </Button>
                </div>
            </div>
        );

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
                {hint ? (
                    <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                        {hint}
                    </div>
                ) : null}

                {draft ? (
                    <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium">{draft.title}</div>
                            <Button size="small" type="text" icon={<X className="size-3.5" />} onClick={() => setAgentState({ promptComboDraft: null })} />
                        </div>
                        <PromptComboBuilder cards={draft.cards} onUse={targetNode ? fill : undefined} onCopy={(text) => copyText(text, "组合提示词已复制")} useLabel={useLabel} />
                        <Button size="small" className="mt-2" onClick={saveDraftToLibrary}>
                            保存到提示词库
                        </Button>
                    </div>
                ) : null}

                <Input allowClear size="small" prefix={<Search className="size-3.5 opacity-50" />} placeholder="搜索标题或标签" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                <div className="flex flex-wrap gap-1">
                    {groupTabs.map((name) => (
                        <Tag.CheckableTag key={name} checked={group === name} onChange={() => setGroup(name)}>
                            {name}
                        </Tag.CheckableTag>
                    ))}
                </div>

                <div className="space-y-2">
                    {filtered.map((prompt) => {
                        const combo = isComboPrompt(prompt);
                        const expanded = expandedId === prompt.id;
                        return (
                            <div key={prompt.id} className="rounded-lg border" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                <button type="button" className="block w-full px-3 py-2 text-left" onClick={() => setExpandedId(expanded ? "" : prompt.id)}>
                                    <div className="truncate text-sm font-medium leading-5">{prompt.title}</div>
                                    <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] leading-4" style={{ color: theme.node.muted }}>
                                        {combo ? (
                                            <>
                                                <Layers className="size-3 shrink-0" />
                                                组合式 · {prompt.cards?.length} 张卡片 · {countComboKeys(prompt.cards || [])} 个键值组
                                            </>
                                        ) : (
                                            prompt.prompt
                                        )}
                                    </div>
                                </button>
                                {expanded ? <div className="border-t px-3 py-3" style={{ borderColor: theme.node.stroke }}>{renderActions(prompt)}</div> : null}
                            </div>
                        );
                    })}
                    {!filtered.length ? (
                        <div className="py-6">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-xs">没有匹配的提示词，去「灵感广场」收藏或到「我的」新建</span>} />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
