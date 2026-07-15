import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Drawer, Popconfirm, Select, Tooltip } from "antd";
import { ArrowUp, Eraser, FilePlus2, LoaderCircle, MessagesSquare, Square, UserRound, X } from "lucide-react";
import { Streamdown } from "streamdown";

import { canvasThemes } from "@/lib/canvas-theme";
import { isPlainEnterKey } from "@/lib/keyboard-event";
import { useThemeStore } from "@/stores/use-theme-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { ROLE_CHAT_HISTORY_MAX, useRoleStore, type AiRole, type RoleChatMessage } from "@/stores/use-role-store";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const ROLE_CHAT_CONTEXT_LIMIT = 20;
const ROLE_CHAT_MESSAGE_CHAR_LIMIT = 2000;

/** 把画布图片节点转成多模态消息里的 image_url 片段（优先原图 dataURL）。 */
export async function buildRoleImageParts(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes
            .filter((node) => node.type === CanvasNodeType.Image && node.metadata?.content)
            .map(async (node) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl({ storageKey: node.metadata?.storageKey, url: node.metadata?.content }) } })),
    );
}

/** 提取节点上的文字内容（文本节点取正文，其余取提示词），拼成分析输入。 */
export function buildRoleTextInputs(nodes: CanvasNodeData[]) {
    return nodes.flatMap((node) => {
        const text = node.type === CanvasNodeType.Text ? node.metadata?.content : node.metadata?.prompt;
        return text?.trim() ? [`${node.title}：\n${text.trim()}`] : [];
    });
}

function truncateRoleChatText(text: string) {
    return text.length > ROLE_CHAT_MESSAGE_CHAR_LIMIT ? `${text.slice(0, ROLE_CHAT_MESSAGE_CHAR_LIMIT)}...[消息过长已截断]` : text;
}

function buildRoleChatMessages(role: AiRole, history: RoleChatMessage[], userContent: AiTextMessage["content"]): AiTextMessage[] {
    const recent = history
        .filter((item) => !item.error && item.text.trim())
        .slice(-ROLE_CHAT_CONTEXT_LIMIT)
        .map((item) => ({ role: item.role, content: truncateRoleChatText(item.text) }) satisfies AiTextMessage);
    return [{ role: "system", content: role.systemPrompt }, ...recent, { role: "user", content: userContent }];
}

function isRoleChatCanceled(error: unknown) {
    return error instanceof Error && (error.message === "请求已取消" || error.name === "AbortError");
}

export function CanvasRoleChatPanel({ open, initialRoleId, selectedImageNodes, onSaveText, onClose }: { open: boolean; initialRoleId?: string | null; selectedImageNodes: CanvasNodeData[]; onSaveText: (text: string) => void; onClose: () => void }) {
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const roles = useRoleStore((state) => state.roles);
    const chatHistories = useRoleStore((state) => state.chatHistories);
    const appendChatMessage = useRoleStore((state) => state.appendChatMessage);
    const clearChatHistory = useRoleStore((state) => state.clearChatHistory);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [roleId, setRoleId] = useState("");
    const [prompt, setPrompt] = useState("");
    const [sending, setSending] = useState(false);
    const [streamingText, setStreamingText] = useState<string | null>(null);
    const [excludedNodeIds, setExcludedNodeIds] = useState<Set<string>>(new Set());
    const listRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const role = roles.find((item) => item.id === roleId);
    const history = useMemo(() => (roleId ? chatHistories[roleId] || [] : []), [chatHistories, roleId]);
    const attachments = useMemo(() => selectedImageNodes.filter((node) => !excludedNodeIds.has(node.id)), [excludedNodeIds, selectedImageNodes]);

    useEffect(() => {
        if (!open) return;
        setRoleId((current) => {
            if (initialRoleId && roles.some((item) => item.id === initialRoleId)) return initialRoleId;
            return roles.some((item) => item.id === current) ? current : roles[0]?.id || "";
        });
        setExcludedNodeIds(new Set());
    }, [initialRoleId, open, roles]);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [history, open, roleId, streamingText]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const sendMessage = async () => {
        const text = prompt.trim();
        if (!role || sending || (!text && !attachments.length)) return;
        const generationConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(generationConfig, generationConfig.model)) {
            openConfigDialog(true);
            return;
        }
        const currentRole = role;
        const userText = text || "请结合角色职责分析这些图片。";
        const pastHistory = useRoleStore.getState().chatHistories[currentRole.id] || [];
        setSending(true);
        setStreamingText("");
        setPrompt("");
        appendChatMessage(currentRole.id, { role: "user", text: userText, imageCount: attachments.length || undefined });
        const controller = new AbortController();
        abortRef.current = controller;
        let streamed = "";
        try {
            const imageParts = await buildRoleImageParts(attachments);
            const userContent: AiTextMessage["content"] = imageParts.length ? [...imageParts, { type: "text", text: userText }] : userText;
            const answer = await requestImageQuestion(generationConfig, buildRoleChatMessages(currentRole, pastHistory, userContent), (value) => {
                streamed = value;
                setStreamingText(value);
            }, { signal: controller.signal });
            appendChatMessage(currentRole.id, { role: "assistant", text: answer || streamed });
        } catch (error) {
            if (isRoleChatCanceled(error)) {
                if (streamed.trim()) appendChatMessage(currentRole.id, { role: "assistant", text: streamed });
            } else {
                appendChatMessage(currentRole.id, { role: "assistant", text: error instanceof Error ? error.message : "角色对话失败", error: true });
            }
        } finally {
            abortRef.current = null;
            setSending(false);
            setStreamingText(null);
            setExcludedNodeIds(new Set());
        }
    };

    const stopMessage = () => {
        abortRef.current?.abort();
    };

    const saveMessageToCanvas = (text: string) => {
        if (!text.trim()) return;
        onSaveText(text);
        message.success("已保存为画布文本节点");
    };

    return (
        <Drawer
            title={
                <span className="inline-flex items-center gap-2">
                    <MessagesSquare className="size-4" />
                    角色对话
                </span>
            }
            open={open}
            mask={false}
            width={430}
            onClose={onClose}
            styles={{ body: { padding: 0, display: "flex", flexDirection: "column", minHeight: 0 } }}
            extra={
                <Popconfirm title="清空当前角色的对话历史？" okText="清空" cancelText="取消" onConfirm={() => roleId && clearChatHistory(roleId)}>
                    <Button type="text" size="small" danger disabled={!history.length || sending} icon={<Eraser className="size-3.5" />}>
                        清空历史
                    </Button>
                </Popconfirm>
            }
        >
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                <Select
                    className="min-w-0 flex-1"
                    value={roleId || undefined}
                    placeholder="选择专业角色"
                    disabled={sending}
                    options={roles.map((item) => ({ value: item.id, label: `${item.avatar ? `${item.avatar} ` : ""}${item.name}` }))}
                    onChange={setRoleId}
                />
                <span className="shrink-0 text-xs" style={{ color: theme.node.muted }}>{history.length}/{ROLE_CHAT_HISTORY_MAX} 条</span>
            </div>

            <div ref={listRef} className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {!history.length && streamingText === null ? (
                    <div className="px-3 py-10 text-center text-sm leading-6" style={{ color: theme.node.muted }}>
                        {role ? `与「${role.name}」连续对话，每次会携带最近 ${ROLE_CHAT_CONTEXT_LIMIT} 条历史。选中画布图片节点后发送，可作为图片上下文。` : "先在上方选择一个专业角色。"}
                    </div>
                ) : null}
                {history.map((item) => (
                    <RoleChatMessageRow key={item.id} item={item} role={role} theme={theme} onSave={item.role === "assistant" && !item.error ? () => saveMessageToCanvas(item.text) : undefined} />
                ))}
                {streamingText !== null ? (
                    <div className="flex items-start gap-2.5">
                        <RoleChatAvatar role={role} theme={theme} />
                        <div className="min-w-0 max-w-[82%] text-sm leading-6" style={{ color: theme.node.text }}>
                            {streamingText ? <Streamdown animated isAnimating>{streamingText}</Streamdown> : <LoaderCircle className="size-4 animate-spin" style={{ color: theme.node.muted }} />}
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: theme.node.stroke }}>
                {attachments.length ? (
                    <div className="thin-scrollbar mb-2 flex gap-2 overflow-x-auto pb-1">
                        {attachments.map((node) => (
                            <div key={node.id} className="group relative size-14 shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: theme.node.stroke }} title={node.title}>
                                <img src={node.metadata?.content} alt={node.title} className="size-full object-cover" />
                                <button
                                    type="button"
                                    className="absolute right-1 top-1 grid size-5 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover:opacity-100"
                                    style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                                    onClick={() => setExcludedNodeIds((current) => new Set([...current, node.id]))}
                                    aria-label="本次不携带该图片"
                                >
                                    <X className="size-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : null}
                <div className="rounded-[18px] border px-3 pb-2.5 pt-2.5" style={{ borderColor: theme.node.stroke }}>
                    <textarea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => {
                            if (!isPlainEnterKey(event)) return;
                            event.preventDefault();
                            void sendMessage();
                        }}
                        className="thin-scrollbar max-h-28 min-h-16 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 outline-none placeholder:opacity-45"
                        style={{ color: theme.node.text }}
                        placeholder={role ? `向「${role.name}」提问，Enter 发送` : "先选择角色"}
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[11px]" style={{ color: theme.node.muted }}>
                            {attachments.length ? `将携带 ${attachments.length} 张选中的画布图片` : "选中画布图片节点可作为图片上下文"}
                        </span>
                        {sending ? (
                            <Button danger shape="circle" className="!h-9 !w-9 !min-w-9" icon={<Square className="size-4" />} onClick={stopMessage} aria-label="停止" />
                        ) : (
                            <Button type="primary" shape="circle" className="!h-9 !w-9 !min-w-9" disabled={!role || (!prompt.trim() && !attachments.length)} icon={<ArrowUp className="size-4" />} onClick={() => void sendMessage()} aria-label="发送" />
                        )}
                    </div>
                </div>
            </div>
        </Drawer>
    );
}

function RoleChatMessageRow({ item, role, theme, onSave }: { item: RoleChatMessage; role?: AiRole; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSave?: () => void }) {
    const isUser = item.role === "user";
    if (isUser) {
        return (
            <div className="flex items-start justify-end gap-2.5">
                <div className="min-w-0 max-w-[82%] text-right">
                    <div className="inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-sm leading-6" style={{ background: theme.node.fill, color: theme.node.text }}>{item.text}</div>
                    {item.imageCount ? <div className="mt-1 text-[11px]" style={{ color: theme.node.muted }}>携带 {item.imageCount} 张画布图片</div> : null}
                </div>
                <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    <UserRound className="size-4" />
                </span>
            </div>
        );
    }
    return (
        <div className="flex items-start gap-2.5">
            <RoleChatAvatar role={role} theme={theme} />
            <div className="min-w-0 max-w-[82%] text-sm leading-6" style={{ color: item.error ? "#dc2626" : theme.node.text }}>
                {item.error ? <div className="whitespace-pre-wrap break-words">{item.text}</div> : <Streamdown>{item.text}</Streamdown>}
                {onSave ? (
                    <div className="mt-1">
                        <Tooltip title="把这条回复以文本节点加入画布">
                            <Button type="text" size="small" style={{ color: theme.node.muted }} icon={<FilePlus2 className="size-3.5" />} onClick={onSave}>
                                保存为画布节点
                            </Button>
                        </Tooltip>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function RoleChatAvatar({ role, theme }: { role?: AiRole; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <span className="grid size-8 shrink-0 place-items-center rounded-full text-base" style={{ background: theme.node.fill, color: theme.node.text }} role="img" aria-label={role?.name || "角色"}>
            {role?.avatar || <UserRound className="size-4" />}
        </span>
    );
}
