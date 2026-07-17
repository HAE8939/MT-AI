import { useEffect, useMemo } from "react";
import { App, Button, Input, InputNumber, Select, Tag, Upload } from "antd";
import { ArrowLeft, Cloud, ImagePlus, Play } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useRunningHubRun } from "@/components/workflow/use-runninghub-run";
import { useAgentStore } from "@/stores/use-agent-store";
import { useWorkflowTaskStore } from "@/stores/use-workflow-task-store";
import { CanvasNodeType } from "@/types/canvas";
import type { AiWorkflowStatus } from "@/types/ai-workflow";
import type { AgentTemplate } from "@/types/workflow";

// 画布侧栏的 RunningHub 式运行视图：图片双来源（画布节点/本地上传）+ 数值步进器 + 底部大按钮。
// 提交后停留本视图，底部状态条跟踪最近任务；结果照旧写回画布占位节点。图片不提供 URL 输入（弹窗保留该能力）。

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

const STATUS_LABELS: Record<AiWorkflowStatus, string> = {
    queued: "排队中",
    submitting: "提交中",
    polling: "运行中",
    running: "运行中",
    succeeded: "已完成，结果已写回画布",
    failed: "失败",
    cancelled: "已取消",
};

export function CanvasWorkflowRunPanel({ template, theme, currentProjectId, onBack }: { template: AgentTemplate; theme: Theme; currentProjectId?: string; onBack: () => void }) {
    const { message } = App.useApp();
    const { spec, values, setValue, localFiles, setLocalFile, canvasImageNodes, projects, projectId, setProjectId, uploading, lastTaskId, run } = useRunningHubRun(template, { defaultProjectId: currentProjectId });
    const lastTask = useWorkflowTaskStore((state) => (lastTaskId ? state.tasks.find((task) => task.id === lastTaskId) : undefined));

    const canvasImageOptions = useMemo(() => canvasImageNodes.map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id })), [canvasImageNodes]);
    const firstImageIndex = useMemo(() => (spec ? spec.fields.findIndex((field) => field.kind === "image") : -1), [spec]);

    /** 打开面板时，画布上已选中的图片节点自动预填第一个图片字段 */
    useEffect(() => {
        if (firstImageIndex < 0) return;
        const snapshot = useAgentStore.getState().canvasContext?.snapshot;
        if (!snapshot?.selectedNodeIds?.length) return;
        const selected = snapshot.nodes.find((node) => snapshot.selectedNodeIds.includes(node.id) && node.type === CanvasNodeType.Image && typeof node.metadata?.content === "string" && node.metadata.content);
        if (selected) setValue(firstImageIndex, selected.metadata!.content as string);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template.id, firstImageIndex]);

    if (!spec) return null;

    return (
        <div className="flex min-h-full flex-col gap-3">
            <div className="flex items-center gap-1.5">
                <Button type="text" size="small" icon={<ArrowLeft className="size-4" />} onClick={onBack} />
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: theme.toolbar.panel }}>{template.avatar || "🧩"}</span>
                <div className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: theme.node.text }}>{template.name}</div>
                <Tag className="m-0 shrink-0 border-0 px-1.5 text-[10px] leading-4" icon={<Cloud className="mr-0.5 inline size-3" />}>云工作流</Tag>
            </div>
            {template.description ? (
                <div className="text-xs leading-5" style={{ color: theme.node.muted }}>{template.description}</div>
            ) : null}

            <div className="flex-1 space-y-4">
                {spec.fields.map((field, index) => {
                    if (field.kind === "image") {
                        const previewSrc = localFiles[index]?.previewUrl || values[`${index}`] || "";
                        return (
                            <div key={index} className="space-y-2">
                                <div className="text-xs font-medium" style={{ color: theme.node.text }}>{field.label}</div>
                                {previewSrc ? (
                                    <img src={previewSrc} alt={field.label} className="h-24 w-24 rounded-lg border object-cover" style={{ borderColor: theme.node.stroke }} />
                                ) : (
                                    <div className="grid h-24 w-24 place-items-center rounded-lg border border-dashed" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                                        <ImagePlus className="size-5" />
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Select
                                        className="min-w-0 flex-1"
                                        size="small"
                                        allowClear
                                        placeholder={canvasImageOptions.length ? "选画布图片" : "画布上还没有图片"}
                                        options={canvasImageOptions}
                                        optionRender={(option) => (
                                            <div className="flex items-center gap-2">
                                                <img src={String(option.value)} alt="" className="size-6 shrink-0 rounded object-cover" />
                                                <span className="truncate">{option.label}</span>
                                            </div>
                                        )}
                                        value={!localFiles[index] && values[`${index}`] ? values[`${index}`] : undefined}
                                        onChange={(value) => setValue(index, value || "")}
                                    />
                                    <Upload
                                        accept="image/*"
                                        showUploadList={false}
                                        beforeUpload={(file) => {
                                            if (file.size > MAX_UPLOAD_BYTES) message.error("图片超过 30MB，官方接口不支持，请压缩后再试");
                                            else setLocalFile(index, file);
                                            return Upload.LIST_IGNORE;
                                        }}
                                    >
                                        <Button size="small">上传本地图</Button>
                                    </Upload>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div key={index} className="space-y-2">
                            <div className="text-xs font-medium" style={{ color: theme.node.text }}>{field.label}</div>
                            {field.kind === "number" ? (
                                <InputNumber className="w-full" size="small" placeholder={field.defaultValue || "填写数值"} value={values[`${index}`] ? Number(values[`${index}`]) : null} onChange={(value) => setValue(index, value === null || value === undefined ? "" : String(value))} />
                            ) : (
                                <Input.TextArea rows={2} placeholder={field.defaultValue || "填写内容"} value={values[`${index}`] || ""} onChange={(event) => setValue(index, event.target.value)} />
                            )}
                        </div>
                    );
                })}

                <div className="space-y-2">
                    <div className="text-xs font-medium" style={{ color: theme.node.text }}>结果写入画布</div>
                    <Select
                        className="w-full"
                        size="small"
                        allowClear
                        placeholder={currentProjectId ? "默认当前画布" : projects.length ? "选择画布（默认第一个）" : "将自动新建画布"}
                        value={projectId || undefined}
                        options={projects.map((project) => ({ value: project.id, label: project.title }))}
                        onChange={(value) => setProjectId(value || "")}
                    />
                </div>
            </div>

            <div className="sticky bottom-0 space-y-2 pb-1 pt-2" style={{ background: theme.toolbar.panel }}>
                <Button type="primary" block size="large" icon={<Play className="size-4" />} loading={uploading} onClick={() => void run()}>
                    {uploading ? "上传图片中…" : "立即运行"}
                </Button>
                {lastTask ? (
                    <div className="rounded-md px-2 py-1.5 text-xs leading-5" style={{ background: theme.toolbar.panel, color: lastTask.status === "failed" ? "#f5222d" : theme.node.muted, border: `1px solid ${theme.node.stroke}` }}>
                        最近任务：{STATUS_LABELS[lastTask.status]}
                        {lastTask.status === "failed" && lastTask.error ? `——${lastTask.error}` : ""}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
