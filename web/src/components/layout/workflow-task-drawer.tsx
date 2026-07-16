import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App, Badge, Button, Drawer, Empty, Image, Progress, Tooltip } from "antd";
import { Clock3, Copy, Crosshair, Download, ImageDown, RotateCcw, Trash2, X } from "lucide-react";

import { copyTaskImageToClipboard, downloadTaskImage, downloadTaskImageWithCaption } from "@/lib/workflow-task-image";
import { resolveImageUrl } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import type { AiWorkflowStatus, AiWorkflowTask, AiWorkflowType } from "@/types/ai-workflow";

const typeLabels: Record<AiWorkflowType, string> = {
    "image-generation": "画布生图",
    runninghub: "云工作流",
};

const statusLabels: Record<AiWorkflowStatus, string> = {
    queued: "等待提交",
    submitting: "正在提交",
    polling: "生成中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消",
};

const ACTIVE_STATUSES: AiWorkflowStatus[] = ["queued", "submitting", "polling", "running"];

/** 任务列表主体：任务中心抽屉与「我的→生成记录」共用 */
export function WorkflowTaskList({ onNavigate }: { onNavigate?: () => void }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const tasks = useWorkflowTaskStore((state) => state.tasks);
    const cancelTask = useWorkflowTaskStore((state) => state.cancelTask);
    const retryTask = useWorkflowTaskStore((state) => state.retryTask);
    const removeTask = useWorkflowTaskStore((state) => state.removeTask);
    const projects = useCanvasStore((state) => state.projects);
    const projectTitles = useMemo(() => new Map(projects.map((project) => [project.id, project.title])), [projects]);
    const currentProjectId = useCurrentProjectId();

    const locateTask = (task: AiWorkflowTask) => {
        const nodeId = task.targetNodeIds[0];
        if (!nodeId) {
            message.warning("该任务没有关联的画布节点");
            return;
        }
        if (!projectTitles.has(task.projectId)) {
            message.warning("对应画布已删除，无法定位");
            return;
        }
        onNavigate?.();
        if (task.projectId === currentProjectId) {
            window.dispatchEvent(new CustomEvent("canvas:focus-node", { detail: { projectId: task.projectId, nodeId } }));
        } else {
            navigate(`/canvas/${task.projectId}?focus=${encodeURIComponent(nodeId)}`);
        }
    };

    return (
        <>
            {!tasks.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" /> : null}
            <Image.PreviewGroup>
                <div className="divide-y divide-stone-200 dark:divide-stone-800">
                    {tasks.map((task) => (
                        <WorkflowTaskCard
                            key={task.id}
                            task={task}
                            projectTitle={projectTitles.get(task.projectId)}
                            crossProject={task.projectId !== currentProjectId}
                            onCancel={() => cancelTask(task.id)}
                            onRetry={() => retryTask(task.id)}
                            onRemove={() => removeTask(task.id)}
                            onLocate={() => locateTask(task)}
                        />
                    ))}
                </div>
            </Image.PreviewGroup>
        </>
    );
}

export function WorkflowTaskCenter() {
    const [open, setOpen] = useState(false);
    const tasks = useWorkflowTaskStore((state) => state.tasks);
    const clearCompletedTasks = useWorkflowTaskStore((state) => state.clearCompletedTasks);
    const activeCount = tasks.filter((task) => ACTIVE_STATUSES.includes(task.status)).length;
    const failedCount = tasks.filter((task) => task.status === "failed").length;

    return (
        <>
            <Tooltip title="任务中心">
                <Badge count={activeCount || failedCount} size="small" color={failedCount ? "#ef4444" : "#1677ff"}>
                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Clock3 className="size-4" />} onClick={() => setOpen(true)} aria-label="任务中心" />
                </Badge>
            </Tooltip>
            <Drawer
                title="任务中心"
                open={open}
                onClose={() => setOpen(false)}
                width={460}
                extra={tasks.some((task) => ["succeeded", "cancelled"].includes(task.status)) ? <Button type="text" size="small" onClick={clearCompletedTasks}>清理已结束</Button> : null}
            >
                <WorkflowTaskList onNavigate={() => setOpen(false)} />
            </Drawer>
        </>
    );
}

function WorkflowTaskCard({
    task,
    projectTitle,
    crossProject,
    onCancel,
    onRetry,
    onRemove,
    onLocate,
}: {
    task: AiWorkflowTask;
    projectTitle?: string;
    crossProject: boolean;
    onCancel: () => void;
    onRetry: () => void;
    onRemove: () => void;
    onLocate: () => void;
}) {
    const { message } = App.useApp();
    const active = ACTIVE_STATUSES.includes(task.status);
    const resultUrls = useResolvedResultUrls(task);

    const runDownload = async (url: string, index: number, withCaption: boolean) => {
        const baseName = `${task.type}-${task.id.slice(0, 6)}-${index + 1}`;
        try {
            if (withCaption) await downloadTaskImageWithCaption(url, task.prompt || "", `${baseName}-caption.png`);
            else await downloadTaskImage(url, `${baseName}.png`);
        } catch (error) {
            message.error(withCaption ? `图文合成失败：${errorText(error)}` : `下载失败：${errorText(error)}`);
        }
    };

    const runCopy = async (url: string) => {
        try {
            await copyTaskImageToClipboard(url);
            message.success("已复制图片到剪贴板");
        } catch (error) {
            message.error(`复制失败：${errorText(error)}`);
        }
    };

    return (
        <div className="py-4 first:pt-0">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{typeLabels[task.type]}</div>
                    <div className="mt-1 truncate text-xs text-stone-500">{projectTitle || "画布已删除"}</div>
                </div>
                <span className={task.status === "failed" ? "text-xs font-medium text-red-600" : task.status === "succeeded" ? "text-xs font-medium text-green-600" : "text-xs font-medium text-stone-500"}>{statusLabels[task.status]}</span>
            </div>
            {task.prompt ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">{task.prompt}</div> : null}
            {active ? <TaskProgress task={task} /> : <div className="mt-2 text-xs text-stone-500">{formatTaskTime(task.createdAt, task.updatedAt)}</div>}
            {task.error ? <div className="mt-2 rounded-md border border-red-200 px-2.5 py-2 text-xs leading-5 text-red-600 dark:border-red-900/60">{task.error}</div> : null}
            {resultUrls.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {resultUrls.map((url, index) => (
                        <div key={`${task.id}-${index}`} className="group relative size-20 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
                            <Image src={url} alt={`结果 ${index + 1}`} width={80} height={80} className="!h-20 !w-20 object-cover" />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/45 py-1 opacity-0 transition group-hover:opacity-100">
                                <button type="button" className="pointer-events-auto grid size-6 place-items-center rounded text-white transition hover:bg-white/20" title="下载" onClick={() => runDownload(url, index, false)}>
                                    <Download className="size-3.5" />
                                </button>
                                <button type="button" className="pointer-events-auto grid size-6 place-items-center rounded text-white transition hover:bg-white/20" title="带提示词下载" onClick={() => runDownload(url, index, true)}>
                                    <ImageDown className="size-3.5" />
                                </button>
                                <button type="button" className="pointer-events-auto grid size-6 place-items-center rounded text-white transition hover:bg-white/20" title="复制图片链接" onClick={() => copyLink(url, message)}>
                                    <Copy className="size-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
                {crossProject && task.status === "succeeded" ? <span className="mr-auto text-xs text-stone-400">结果来自其他画布</span> : null}
                {resultUrls.length ? <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => void runCopy(resultUrls[0])}>复制图片</Button> : null}
                {task.targetNodeIds.length ? <Button type="text" size="small" icon={<Crosshair className="size-3.5" />} onClick={onLocate}>定位</Button> : null}
                {active && task.type !== "image-generation" ? <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={onCancel}>取消</Button> : null}
                {task.status === "failed" && task.type !== "image-generation" ? <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>重试</Button> : null}
                {!active ? <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onRemove}>移除</Button> : null}
            </div>
        </div>
    );
}

function TaskProgress({ task }: { task: AiWorkflowTask }) {
    const elapsed = useElapsedLabel(task.createdAt, task.status);
    if (typeof task.progress === "number") {
        return (
            <div className="mt-2">
                <Progress percent={task.progress} size="small" status="active" />
            </div>
        );
    }
    return <div className="mt-2 text-xs text-stone-500">已等待 {elapsed}</div>;
}

function copyLink(url: string, message: ReturnType<typeof App.useApp>["message"]) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
        message.warning("当前环境不支持复制");
        return;
    }
    void navigator.clipboard.writeText(url).then(
        () => message.success("已复制图片链接"),
        () => message.error("复制链接失败"),
    );
}

function errorText(error: unknown) {
    return error instanceof Error ? error.message : "未知错误";
}

/** 优先用 resultUrls；持久化后 blob URL 失效则回退到 storageKey 重新解析 */
function useResolvedResultUrls(task: AiWorkflowTask) {
    const [resolved, setResolved] = useState<string[]>(() => task.resultUrls);
    useEffect(() => {
        let cancelled = false;
        const keys = task.resultStorageKeys;
        const needsResolve = keys?.length && task.resultUrls.some((url) => !url || url.startsWith("blob:"));
        if (!needsResolve) {
            setResolved(task.resultUrls);
            return;
        }
        void Promise.all(keys.map((key, index) => resolveImageUrl(key, task.resultUrls[index] || ""))).then((urls) => {
            if (!cancelled) setResolved(urls.filter(Boolean));
        });
        return () => {
            cancelled = true;
        };
    }, [task.resultStorageKeys, task.resultUrls]);
    return resolved;
}

function useCurrentProjectId() {
    const { pathname } = useLocation();
    return useMemo(() => {
        const match = pathname.match(/^\/canvas\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    }, [pathname]);
}

function useElapsedLabel(createdAt: string, status: AiWorkflowStatus) {
    const [now, setNow] = useState(() => Date.now());
    const active = ACTIVE_STATUSES.includes(status);
    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [active]);
    const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatTaskTime(createdAt: string, updatedAt: string) {
    const start = new Date(createdAt).getTime();
    const end = new Date(updatedAt).getTime();
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

