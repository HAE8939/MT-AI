import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App, Button, Input, Modal, Popconfirm, Select, Tooltip } from "antd";
import { Plus, Settings2, StickyNote, Trash2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useUserStore } from "@/stores/use-user-store";
import { useAgentStore, type AgentAttachment, type AgentChatItem } from "@/stores/use-agent-store";
import { useChatStore } from "@/stores/use-chat-store";
import { useAgentTemplateStore } from "@/stores/use-agent-template-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { ModelPicker } from "@/components/model-picker";
import { CHAT_AGENT_BASE_PROMPT, chatAgentToolLabel, isAbortError, runChatAgentTurn, type ChatAgentEvent } from "@/lib/agent/chat-agent-runtime";
import { summarizeCanvasAgentOps, type CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import { CanvasNodeType } from "@/types/canvas";
import type { AgentTemplate } from "@/types/workflow";
import type { ResponseInputMessage } from "@/services/api/image";
import { AgentChatComposer, AgentChatMessage, AgentPendingToolCard, AgentWorkingMessage, type CanvasAgentChatAttachment } from "./canvas-agent-chat-ui";

// 对话 tab 的「项目模型」引擎视图：角色选择器 + 模型选择 + 浏览器端 agent loop。
// 会话持久化在 use-chat-store，输入草稿与附件沿用 use-agent-store（与 codex 引擎共享）。

const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_PAYLOAD_BYTES = 28 * 1024 * 1024;
const GENERAL_ROLE_ID = "";
const GENERAL_ROLE_NAME = "通用助手";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];
type DocRoleTemplate = AgentTemplate & { spec: { kind: "doc-analysis"; systemPrompt: string } };

function docRoles(templates: AgentTemplate[]) {
    return templates.filter((item): item is DocRoleTemplate => item.spec.kind === "doc-analysis");
}

export function CanvasModelChatView({ theme }: { theme: Theme }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const templates = useAgentTemplateStore((state) => state.templates);
    const roles = useMemo(() => docRoles(templates), [templates]);
    const sessions = useChatStore((state) => state.sessions);
    const activeSessionId = useChatStore((state) => state.activeSessionId);
    const session = useMemo(() => sessions.find((item) => item.id === activeSessionId) || null, [sessions, activeSessionId]);
    const createSession = useChatStore((state) => state.createSession);
    const setSessionRole = useChatStore((state) => state.setSessionRole);
    const appendMessages = useChatStore((state) => state.appendMessages);
    const replaceDisplayMessage = useChatStore((state) => state.replaceDisplayMessage);
    const { prompt, attachments, chatModel, confirmTools, canvasContext, setAgentState } = useAgentStore();

    const [running, setRunning] = useState(false);
    const [activity, setActivity] = useState("");
    const [pendingOps, setPendingOps] = useState<{ ops?: CanvasAgentOp[] } | null>(null);
    const [roleManagerOpen, setRoleManagerOpen] = useState(false);
    const [draftRoleId, setDraftRoleId] = useState(GENERAL_ROLE_ID);
    const pendingResolveRef = useRef<((approved: boolean) => void) | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const canvasContextRef = useRef(canvasContext);
    const confirmToolsRef = useRef(confirmTools);
    const attachmentUrlsRef = useRef(new Set<string>());

    useEffect(() => {
        canvasContextRef.current = canvasContext;
    }, [canvasContext]);
    useEffect(() => {
        confirmToolsRef.current = confirmTools;
    }, [confirmTools]);
    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [session?.display, pendingOps, running]);
    useEffect(() => () => attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

    const currentRoleId = session ? session.roleId : draftRoleId;
    const currentRole = roles.find((role) => role.id === currentRoleId) || null;
    const currentRoleName = currentRole?.name || GENERAL_ROLE_NAME;
    const roleOptions = useMemo(
        () => [{ value: GENERAL_ROLE_ID, label: GENERAL_ROLE_NAME }, ...roles.map((role) => ({ value: role.id, label: `${role.avatar ? `${role.avatar} ` : ""}${role.name}` }))],
        [roles],
    );

    const changeRole = (roleId: string) => {
        const role = roles.find((item) => item.id === roleId) || null;
        if (session) setSessionRole(session.id, roleId, role?.name || GENERAL_ROLE_NAME);
        else setDraftRoleId(roleId);
    };

    const requestApplyOpsConfirm = useCallback((input: { ops?: CanvasAgentOp[] }) => {
        if (!confirmToolsRef.current) return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
            pendingResolveRef.current = resolve;
            setPendingOps(input);
        });
    }, []);

    const resolvePendingOps = (approved: boolean) => {
        pendingResolveRef.current?.(approved);
        pendingResolveRef.current = null;
        setPendingOps(null);
    };

    const handleAgentEvent = useCallback(
        (sessionId: string, roleName: string, event: ChatAgentEvent) => {
            if (event.type === "assistant_delta") replaceDisplayMessage(sessionId, event.streamId, { id: event.streamId, role: "assistant", title: roleName, text: event.text, streamId: event.streamId });
            else if (event.type === "assistant_done") replaceDisplayMessage(sessionId, event.streamId, { id: event.streamId, role: "assistant", title: roleName, text: event.text });
            else if (event.type === "tool_start") setActivity(`调用${chatAgentToolLabel(event.name)}`);
            else if (event.type === "tool_done") appendMessages(sessionId, [{ id: createId(), role: "tool", title: `${chatAgentToolLabel(event.name)}完成`, text: event.summary, detail: { name: event.name, input: event.input, result: event.result } }], []);
            else if (event.type === "tool_error") appendMessages(sessionId, [{ id: createId(), role: "tool", title: "工具失败", text: event.error, detail: { name: event.name, input: event.input } }], []);
            else if (event.type === "tool_rejected") appendMessages(sessionId, [{ id: createId(), role: "tool", title: "拒绝执行", text: chatAgentToolLabel(event.name), detail: { name: event.name, input: event.input } }], []);
        },
        [appendMessages, replaceDisplayMessage],
    );

    const sendPrompt = async () => {
        const text = prompt.trim();
        const files = attachments;
        if ((!text && !files.length) || running) return;
        if (attachmentPayloadBytes(files) > MAX_ATTACHMENT_PAYLOAD_BYTES) {
            message.warning("图片附件超过 30MB，请删减后再发送。");
            return;
        }
        const model = chatModel || effectiveConfig.textModel;
        const config = { ...effectiveConfig, model };
        if (!isAiConfigReady(config, model)) {
            message.warning("请先在配置中心添加文本模型渠道");
            navigate("/config");
            return;
        }
        const role = roles.find((item) => item.id === currentRoleId) || null;
        const roleName = role?.name || GENERAL_ROLE_NAME;
        const sessionId = session?.id || createSession({ roleId: role?.id || GENERAL_ROLE_ID, roleName });
        const content = files.length
            ? [...(text ? [{ type: "text" as const, text }] : []), ...files.map((file) => ({ type: "image_url" as const, image_url: { url: file.dataUrl } }))]
            : text;
        appendMessages(sessionId, [{ id: createId(), role: "user", text: text || "发送了图片", attachments: files.map(toChatAttachmentItem) }], [{ role: "user", content }]);
        files.forEach((file) => {
            URL.revokeObjectURL(file.url);
            attachmentUrlsRef.current.delete(file.url);
        });
        setAgentState({ prompt: "", attachments: [] });
        setRunning(true);
        setActivity("思考中");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const systemPrompt = [role?.spec.systemPrompt || "", CHAT_AGENT_BASE_PROMPT].filter(Boolean).join("\n\n");
            const context = useChatStore.getState().sessions.find((item) => item.id === sessionId)?.context || [];
            const history: ResponseInputMessage[] = [{ role: "system", content: systemPrompt }, ...context];
            const result = await runChatAgentTurn(
                history,
                { config, getCanvasContext: () => canvasContextRef.current, navigate, confirmApplyOps: requestApplyOpsConfirm, signal: controller.signal },
                (event) => handleAgentEvent(sessionId, roleName, event),
            );
            appendMessages(sessionId, [], result.appended);
        } catch (error) {
            if (isAbortError(error)) appendMessages(sessionId, [{ id: createId(), role: "system", text: "已停止本轮对话" }], []);
            else appendMessages(sessionId, [{ id: createId(), role: "error", title: "请求失败", text: error instanceof Error ? error.message : "请求失败" }], []);
        } finally {
            setRunning(false);
            setActivity("");
            abortRef.current = null;
            if (pendingResolveRef.current) resolvePendingOps(false);
        }
    };

    const stopTurn = () => {
        abortRef.current?.abort();
        if (pendingResolveRef.current) resolvePendingOps(false);
    };

    const addAttachments = async (files: FileList | File[] | null) => {
        if (!files) return;
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        const prev = useAgentStore.getState().attachments;
        try {
            const next = await Promise.all(
                images.slice(0, Math.max(0, MAX_ATTACHMENTS - prev.length)).map(async (file) => {
                    const dataUrl = await readDataUrl(file);
                    const url = URL.createObjectURL(file);
                    attachmentUrlsRef.current.add(url);
                    return { id: createId(), name: file.name, type: file.type, size: file.size, url, dataUrl };
                }),
            );
            const merged = [...prev, ...next];
            if (attachmentPayloadBytes(merged) > MAX_ATTACHMENT_PAYLOAD_BYTES) {
                next.forEach((item) => {
                    URL.revokeObjectURL(item.url);
                    attachmentUrlsRef.current.delete(item.url);
                });
                message.warning("图片附件最多约 30MB。");
                return;
            }
            if (next.length) setAgentState({ attachments: merged });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片读取失败");
        }
    };

    const removeAttachment = (id: string) => {
        const removed = attachments.find((item) => item.id === id);
        if (removed) {
            URL.revokeObjectURL(removed.url);
            attachmentUrlsRef.current.delete(removed.url);
        }
        setAgentState({ attachments: attachments.filter((item) => item.id !== id) });
    };

    const insertToCanvas = (text: string) => {
        const context = canvasContextRef.current;
        if (!context) {
            message.warning("当前不在画布页，无法插入");
            return;
        }
        const maxX = context.snapshot.nodes.length ? Math.max(...context.snapshot.nodes.map((node) => node.position.x + node.width)) : 0;
        context.applyOps([{ type: "add_node", nodeType: CanvasNodeType.Text, title: `${currentRoleName}回复`, position: { x: maxX + 80, y: 120 }, metadata: { content: text, status: "success", fontSize: 14 } }]);
        message.success("已插入画布文本节点");
    };

    const display = session?.display || [];

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                <Select size="small" className="min-w-32 flex-1" popupMatchSelectWidth={false} value={currentRoleId} options={roleOptions} onChange={changeRole} />
                <Tooltip title="管理角色">
                    <Button size="small" type="text" className="!h-7 !w-7 !min-w-7" style={{ color: theme.node.muted }} icon={<Settings2 className="size-3.5" />} onClick={() => setRoleManagerOpen(true)} />
                </Tooltip>
                <ModelPicker config={effectiveConfig} capability="text" value={chatModel || effectiveConfig.textModel} onChange={(model) => {
                    localStorage.setItem("canvas-chat-model", model);
                    setAgentState({ chatModel: model });
                }} onMissingConfig={() => navigate("/config")} />
                <Tooltip title="新对话">
                    <Button size="small" type="text" className="!h-7 !w-7 !min-w-7" style={{ color: theme.node.muted }} icon={<Plus className="size-3.5" />} onClick={() => createSession({ roleId: currentRoleId, roleName: currentRoleName })} />
                </Tooltip>
            </div>
            <div ref={listRef} className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {!display.length ? (
                    <div className="px-3 py-10 text-center text-sm" style={{ color: theme.node.muted }}>
                        <div className="text-base font-medium" style={{ color: theme.node.text }}>{currentRoleName}</div>
                        <div className="mt-2 leading-6">{currentRole?.description || "用项目配置的文本模型直接对话，可让 AI 操作画布、搜索提示词和管理素材。"}</div>
                    </div>
                ) : null}
                {display.map((item) => (
                    <div key={item.id}>
                        <AgentChatMessage item={chatItemToMessage(item)} theme={theme} user={user} />
                        {item.role === "assistant" && !item.streamId && item.text.trim() && canvasContext ? (
                            <div className="ml-11 mt-1">
                                <Button size="small" type="text" className="!h-6 !px-1.5 !text-[11px]" style={{ color: theme.node.muted }} icon={<StickyNote className="size-3" />} onClick={() => insertToCanvas(item.text)}>
                                    插入画布
                                </Button>
                            </div>
                        ) : null}
                    </div>
                ))}
                {pendingOps ? <AgentPendingToolCard summary={summarizeCanvasAgentOps(pendingOps.ops || []) || "画布操作"} detail={{ name: "canvas_apply_ops", input: pendingOps }} theme={theme} onReject={() => resolvePendingOps(false)} onApprove={() => resolvePendingOps(true)} /> : null}
                {running && !pendingOps ? <AgentWorkingMessage theme={theme} /> : null}
            </div>
            <AgentChatComposer
                prompt={prompt}
                attachments={attachments.map(toChatAttachment)}
                sending={running}
                placeholder={`向${currentRoleName}提问，或让它操作网站/画布`}
                theme={theme}
                onPromptChange={(value) => setAgentState({ prompt: value })}
                onSubmit={sendPrompt}
                onStop={stopTurn}
                onAddFiles={addAttachments}
                onRemoveAttachment={removeAttachment}
                left={activity ? <span className="text-[11px]" style={{ color: theme.node.muted }}>{activity}</span> : null}
            />
            <ChatRoleManagerDialog open={roleManagerOpen} theme={theme} onClose={() => setRoleManagerOpen(false)} />
        </>
    );
}

/** 历史 tab：项目模型对话会话列表 */
export function ChatHistoryView({ theme }: { theme: Theme }) {
    const { modal, message } = App.useApp();
    const sessions = useChatStore((state) => state.sessions);
    const activeSessionId = useChatStore((state) => state.activeSessionId);
    const setActiveSession = useChatStore((state) => state.setActiveSession);
    const createSession = useChatStore((state) => state.createSession);
    const removeSession = useChatStore((state) => state.removeSession);
    const setAgentState = useAgentStore((state) => state.setAgentState);

    const enterSession = (id: string) => {
        setActiveSession(id);
        setAgentState({ activeTab: "chat", engine: "model" });
    };

    const confirmDelete = (id: string, label: string) => {
        modal.confirm({
            title: "删除对话记录",
            content: `确定删除「${label.length > 48 ? `${label.slice(0, 48)}...` : label}」吗？`,
            okText: "删除",
            okType: "danger",
            cancelText: "取消",
            onOk: () => {
                removeSession(id);
                message.success("记录已删除");
            },
        });
    };

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm" style={{ color: theme.node.muted }}>
                        {sessions.length ? `${sessions.length} 条对话` : "暂无对话"}
                    </div>
                    <Button size="small" type="primary" icon={<Plus className="size-3.5" />} onClick={() => enterSession(createSession())}>
                        新对话
                    </Button>
                </div>
                <div className="space-y-2">
                    {sessions.map((item) => {
                        const active = item.id === activeSessionId;
                        return (
                            <div key={item.id} className="rounded-lg border px-2.5 py-1.5 transition" style={{ borderColor: active ? theme.node.text : theme.node.stroke, color: theme.node.text }}>
                                <div className="flex items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {active ? <span className="shrink-0 text-[10px] font-medium">当前</span> : null}
                                            <div className="truncate text-sm font-medium leading-5">{item.title}</div>
                                        </div>
                                        <div className="truncate text-[11px] leading-4 opacity-65">{item.roleName} · {item.display.length} 条消息</div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <span className="text-[10px] opacity-55">{new Date(item.updatedAt).toLocaleString()}</span>
                                        <Button size="small" className="!h-6 !px-2" onClick={() => enterSession(item.id)}>
                                            进入
                                        </Button>
                                        <Tooltip title="删除记录">
                                            <Button size="small" danger type="text" className="!h-6 !w-6 !min-w-6" icon={<Trash2 className="size-3.5" />} onClick={() => confirmDelete(item.id, item.title)} />
                                        </Tooltip>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {!sessions.length ? (
                        <div className="px-3 py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                            还没有对话记录，去「对话」发起第一条吧
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

type RoleDraft = { id?: string; name: string; description: string; avatar: string; systemPrompt: string };
const emptyRoleDraft: RoleDraft = { name: "", description: "", avatar: "", systemPrompt: "" };

/** 角色管理：新增/编辑/删除对话角色（doc-analysis 模板） */
function ChatRoleManagerDialog({ open, theme, onClose }: { open: boolean; theme: Theme; onClose: () => void }) {
    const { message } = App.useApp();
    const templates = useAgentTemplateStore((state) => state.templates);
    const addTemplate = useAgentTemplateStore((state) => state.addTemplate);
    const updateTemplate = useAgentTemplateStore((state) => state.updateTemplate);
    const removeTemplate = useAgentTemplateStore((state) => state.removeTemplate);
    const roles = useMemo(() => docRoles(templates), [templates]);
    const [draft, setDraft] = useState<RoleDraft | null>(null);

    const saveDraft = () => {
        if (!draft) return;
        const name = draft.name.trim();
        const systemPrompt = draft.systemPrompt.trim();
        if (!name || !systemPrompt) return;
        const patch = { name, description: draft.description.trim(), avatar: draft.avatar.trim() || undefined };
        if (draft.id) updateTemplate(draft.id, { ...patch, spec: { kind: "doc-analysis", systemPrompt } });
        else addTemplate({ ...patch, description: patch.description, category: "document", spec: { kind: "doc-analysis", systemPrompt } });
        message.success("角色已保存");
        setDraft(null);
    };

    return (
        <Modal title="管理对话角色" open={open} onCancel={onClose} footer={null} width={640} destroyOnHidden>
            {draft ? (
                <div className="space-y-3 pt-1">
                    <div className="grid gap-3 md:grid-cols-[96px_1fr]">
                        <Input value={draft.avatar} placeholder="表情头像" onChange={(event) => setDraft((current) => current && { ...current, avatar: event.target.value })} />
                        <Input value={draft.name} placeholder="角色名称" onChange={(event) => setDraft((current) => current && { ...current, name: event.target.value })} />
                    </div>
                    <Input value={draft.description} placeholder="一句话说明" onChange={(event) => setDraft((current) => current && { ...current, description: event.target.value })} />
                    <Input.TextArea rows={10} value={draft.systemPrompt} placeholder="System Prompt" onChange={(event) => setDraft((current) => current && { ...current, systemPrompt: event.target.value })} />
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setDraft(null)}>返回</Button>
                        <Button type="primary" disabled={!draft.name.trim() || !draft.systemPrompt.trim()} onClick={saveDraft}>
                            保存
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2 pt-1">
                    {roles.map((role) => (
                        <div key={role.id} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: theme.node.stroke }}>
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm" onClick={() => setDraft({ id: role.id, name: role.name, description: role.description, avatar: role.avatar || "", systemPrompt: role.spec.systemPrompt })}>
                                <span className="shrink-0">{role.avatar || "🤖"}</span>
                                <span className="truncate font-medium">{role.name}</span>
                                <span className="truncate text-xs opacity-60">{role.description}</span>
                            </button>
                            <Popconfirm title="删除这个角色？" onConfirm={() => removeTemplate(role.id)}>
                                <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} />
                            </Popconfirm>
                        </div>
                    ))}
                    <Button type="dashed" block icon={<Plus className="size-3.5" />} onClick={() => setDraft(emptyRoleDraft)}>
                        新建角色
                    </Button>
                </div>
            )}
        </Modal>
    );
}

function chatItemToMessage(item: AgentChatItem) {
    return { ...item, attachments: item.attachments?.map(toChatAttachment) };
}

function toChatAttachment(item: AgentAttachment): CanvasAgentChatAttachment {
    return { id: item.id, name: item.name, url: item.dataUrl || item.url };
}

function toChatAttachmentItem(item: AgentAttachment): AgentAttachment {
    // 持久化到会话时只留 dataUrl，objectURL 在发送后立即失效
    return { ...item, url: "" };
}

function attachmentPayloadBytes(attachments: AgentAttachment[]) {
    return attachments.reduce((total, item) => total + item.dataUrl.length, 0);
}

function readDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
        reader.readAsDataURL(file);
    });
}

function createId() {
    return typeof crypto === "undefined" || typeof crypto.randomUUID !== "function" ? `${Date.now()}-${Math.random()}` : crypto.randomUUID();
}
