import { useMemo, useState } from "react";
import { Badge, Button, Drawer, Empty, Tooltip } from "antd";
import { Clock3, RotateCcw, Trash2, X } from "lucide-react";

import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import type { AiWorkflowStatus, AiWorkflowType } from "@/types/ai-workflow";

const typeLabels: Record<AiWorkflowType, string> = {
    "drawing-render": "图纸渲染",
    "multi-angle": "双相机多角度",
    upscale: "AI 超分",
};

const statusLabels: Record<AiWorkflowStatus, string> = {
    queued: "等待提交",
    submitting: "正在提交",
    polling: "生成中",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消",
};

export function WorkflowTaskCenter() {
    const [open, setOpen] = useState(false);
    const tasks = useWorkflowTaskStore((state) => state.tasks);
    const cancelTask = useWorkflowTaskStore((state) => state.cancelTask);
    const retryTask = useWorkflowTaskStore((state) => state.retryTask);
    const removeTask = useWorkflowTaskStore((state) => state.removeTask);
    const clearCompletedTasks = useWorkflowTaskStore((state) => state.clearCompletedTasks);
    const projects = useCanvasStore((state) => state.projects);
    const projectTitles = useMemo(() => new Map(projects.map((project) => [project.id, project.title])), [projects]);
    const activeCount = tasks.filter((task) => ["queued", "submitting", "polling"].includes(task.status)).length;
    const failedCount = tasks.filter((task) => task.status === "failed").length;

    return (
        <>
            <Tooltip title="专业工作流任务">
                <Badge count={activeCount || failedCount} size="small" color={failedCount ? "#ef4444" : "#1677ff"}>
                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Clock3 className="size-4" />} onClick={() => setOpen(true)} aria-label="专业工作流任务" />
                </Badge>
            </Tooltip>
            <Drawer
                title="专业工作流任务"
                open={open}
                onClose={() => setOpen(false)}
                width={440}
                extra={tasks.some((task) => ["succeeded", "cancelled"].includes(task.status)) ? <Button type="text" size="small" onClick={clearCompletedTasks}>清理已结束</Button> : null}
            >
                {!tasks.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无专业工作流任务" /> : null}
                <div className="divide-y divide-stone-200 dark:divide-stone-800">
                    {tasks.map((task) => {
                        const active = ["queued", "submitting", "polling"].includes(task.status);
                        return (
                            <div key={task.id} className="py-4 first:pt-0">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold">{typeLabels[task.type]}</div>
                                        <div className="mt-1 truncate text-xs text-stone-500">{projectTitles.get(task.projectId) || "画布已删除"}</div>
                                    </div>
                                    <span className={task.status === "failed" ? "text-xs font-medium text-red-600" : task.status === "succeeded" ? "text-xs font-medium text-green-600" : "text-xs font-medium text-stone-500"}>{statusLabels[task.status]}</span>
                                </div>
                                <div className="mt-2 text-xs text-stone-500">{formatTaskTime(task.createdAt, task.updatedAt)}</div>
                                {task.error ? <div className="mt-2 rounded-md border border-red-200 px-2.5 py-2 text-xs leading-5 text-red-600 dark:border-red-900/60">{task.error}</div> : null}
                                <div className="mt-3 flex justify-end gap-1">
                                    {active ? <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={() => cancelTask(task.id)}>取消</Button> : null}
                                    {task.status === "failed" ? <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => retryTask(task.id)}>重试</Button> : null}
                                    {!active ? <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => removeTask(task.id)}>移除</Button> : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Drawer>
        </>
    );
}

function formatTaskTime(createdAt: string, updatedAt: string) {
    const start = new Date(createdAt).getTime();
    const end = new Date(updatedAt).getTime();
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
