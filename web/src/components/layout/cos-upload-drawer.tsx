import { useState } from "react";
import { Badge, Button, Drawer, Empty, Tooltip } from "antd";
import { CloudUpload, RotateCcw, Settings, Trash2, X } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import { useCosUploadStore } from "@/stores/use-cos-upload-store";
import type { CosMediaKind, CosUploadStatus } from "@/types/cos-media";

const kindLabels: Record<CosMediaKind, string> = { images: "图片", videos: "视频", assets: "素材", results: "生成结果" };
const statusLabels: Record<CosUploadStatus, string> = { queued: "等待上传", uploading: "上传中", succeeded: "已同步", failed: "失败", cancelled: "已取消" };

export function CosUploadCenter() {
    const [open, setOpen] = useState(false);
    const tasks = useCosUploadStore((state) => state.tasks);
    const retry = useCosUploadStore((state) => state.retry);
    const cancel = useCosUploadStore((state) => state.cancel);
    const remove = useCosUploadStore((state) => state.remove);
    const clearCompleted = useCosUploadStore((state) => state.clearCompleted);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const activeCount = tasks.filter((task) => ["queued", "uploading"].includes(task.status)).length;
    const failedCount = tasks.filter((task) => task.status === "failed").length;

    return (
        <>
            <Tooltip title="COS 媒体同步">
                <Badge count={activeCount || failedCount} size="small" color={failedCount ? "#ef4444" : "#1677ff"}>
                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" icon={<CloudUpload className="size-4" />} onClick={() => setOpen(true)} aria-label="COS 媒体同步" />
                </Badge>
            </Tooltip>
            <Drawer title="COS 媒体同步" open={open} onClose={() => setOpen(false)} width={440} extra={tasks.some((task) => ["succeeded", "cancelled"].includes(task.status)) ? <Button type="text" size="small" onClick={clearCompleted}>清理已结束</Button> : null}>
                {!tasks.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无媒体同步任务" /> : null}
                <div className="divide-y divide-stone-200 dark:divide-stone-800">
                    {tasks.map((task) => {
                        const active = ["queued", "uploading"].includes(task.status);
                        return (
                            <div key={task.id} className="py-4 first:pt-0">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold">{task.fileName}</div>
                                        <div className="mt-1 text-xs text-stone-500">{kindLabels[task.mediaKind]}{task.attempt ? ` · 第 ${task.attempt} 次` : ""}</div>
                                    </div>
                                    <span className={task.status === "failed" ? "text-xs font-medium text-red-600" : task.status === "succeeded" ? "text-xs font-medium text-green-600" : "text-xs font-medium text-stone-500"}>{statusLabels[task.status]}</span>
                                </div>
                                {task.error ? <div className="mt-2 rounded-md border border-red-200 px-2.5 py-2 text-xs leading-5 text-red-600 dark:border-red-900/60">{task.error}</div> : null}
                                <div className="mt-3 flex justify-end gap-1">
                                    {active ? <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={() => cancel(task.id)}>取消</Button> : null}
                                    {task.status === "failed" ? <Button type="text" size="small" icon={<Settings className="size-3.5" />} onClick={() => openConfigDialog(false, "cos")}>配置</Button> : null}
                                    {task.status === "failed" ? <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => retry(task.id)}>重试</Button> : null}
                                    {!active ? <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => remove(task.id)}>移除</Button> : null}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Drawer>
        </>
    );
}
