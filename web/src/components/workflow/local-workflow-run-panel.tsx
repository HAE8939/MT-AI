import { App, Button, Input, Progress, Select, Tag, Upload } from "antd";
import { ArrowLeft, ImagePlus, LayoutTemplate, Play } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useLocalWorkflowRun } from "@/components/workflow/use-local-workflow-run";
import type { AgentTemplate } from "@/types/workflow";

// 画布侧栏本地工作流运行视图：填输入槽 → 立即运行，底部显示串跑进度。
// 图片槽支持选画布节点或本地上传（≤10MB）；文本槽直接填内容。

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function LocalWorkflowRunPanel({ template, theme, onBack }: { template: AgentTemplate; theme: Theme; onBack: () => void }) {
    const { message } = App.useApp();
    const { spec, slotValues, setSlotText, setSlotImage, localFiles, canvasImageNodes, running, progress, lastError, run } = useLocalWorkflowRun(template);

    if (!spec) return null;
    const canvasImageOptions = canvasImageNodes.map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id }));

    return (
        <div className="flex min-h-full flex-col gap-3">
            <div className="flex items-center gap-1.5">
                <Button type="text" size="small" icon={<ArrowLeft className="size-4" />} onClick={onBack} />
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: theme.toolbar.panel }}>{template.avatar || "🧩"}</span>
                <div className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: theme.node.text }}>{template.name}</div>
                <Tag className="m-0 shrink-0 border-0 px-1.5 text-[10px] leading-4" icon={<LayoutTemplate className="mr-0.5 inline size-3" />}>本地工作流</Tag>
            </div>
            {template.description ? <div className="text-xs leading-5" style={{ color: theme.node.muted }}>{template.description}</div> : null}

            <div className="flex-1 space-y-4">
                {spec.inputs.map((slot) => {
                    if (slot.kind === "image") {
                        const previewSrc = localFiles[slot.nodeId]?.previewUrl || slotValues[slot.nodeId] || "";
                        return (
                            <div key={slot.nodeId} className="space-y-2">
                                <div className="text-xs font-medium" style={{ color: theme.node.text }}>{slot.label}</div>
                                {previewSrc ? (
                                    <img src={previewSrc} alt={slot.label} className="h-24 w-24 rounded-lg border object-cover" style={{ borderColor: theme.node.stroke }} />
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
                                        value={!localFiles[slot.nodeId] && slotValues[slot.nodeId] ? slotValues[slot.nodeId] : undefined}
                                        onChange={(value) => setSlotText(slot.nodeId, value || "")}
                                    />
                                    <Upload
                                        accept="image/*"
                                        showUploadList={false}
                                        beforeUpload={(file) => {
                                            if (file.size > MAX_UPLOAD_BYTES) message.error("图片超过 10MB，请压缩后再试");
                                            else setSlotImage(slot.nodeId, file);
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
                        <div key={slot.nodeId} className="space-y-2">
                            <div className="text-xs font-medium" style={{ color: theme.node.text }}>{slot.label}</div>
                            <Input.TextArea rows={2} placeholder="填写内容" value={slotValues[slot.nodeId] || ""} onChange={(event) => setSlotText(slot.nodeId, event.target.value)} />
                        </div>
                    );
                })}
                {spec.inputs.length === 0 ? <div className="text-xs" style={{ color: theme.node.muted }}>此工作流没有输入槽，直接运行即可。</div> : null}
            </div>

            <div className="sticky bottom-0 space-y-2 pb-1 pt-2" style={{ background: theme.toolbar.panel }}>
                {progress ? <Progress percent={Math.round((progress.current / progress.total) * 100)} size="small" format={() => progress.label} /> : null}
                <Button type="primary" block size="large" icon={<Play className="size-4" />} loading={running} onClick={() => void run()}>
                    {running ? "串跑中…" : "立即运行"}
                </Button>
                {lastError ? (
                    <div className="rounded-md px-2 py-1.5 text-xs leading-5" style={{ color: "#f5222d", border: `1px solid ${theme.node.stroke}` }}>{lastError}</div>
                ) : null}
            </div>
        </div>
    );
}
