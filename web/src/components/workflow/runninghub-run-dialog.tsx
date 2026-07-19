import { useMemo } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Select, Upload } from "antd";
import { ImagePlus, X } from "lucide-react";

import { useRunningHubRun } from "@/components/workflow/use-runninghub-run";
import type { AgentTemplate } from "@/types/workflow";

// 运行 RunningHub 工作流的弹窗（/workflows 页）：填参数 → 提交统一任务运行时 → 结果写回画布新节点。
// 图片字段支持本地上传、选画布图片节点两种方式；图片统一限制 ≤10MB，避免第三方 API 因过大失败。

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function RunningHubRunDialog({ template, defaultProjectId, onClose }: { template: AgentTemplate | null; defaultProjectId?: string; onClose: () => void }) {
    const { message } = App.useApp();
    const { spec, values, setValue, localFiles, setLocalFile, canvasImageNodes, projects, projectId, setProjectId, uploading, run } = useRunningHubRun(template, { defaultProjectId });
    const canvasImageOptions = useMemo(() => canvasImageNodes.map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id })), [canvasImageNodes]);

    const submit = async () => {
        if (await run()) onClose();
    };

    return (
        <Modal
            title={template ? `运行：${template.name}` : ""}
            open={Boolean(template)}
            onCancel={onClose}
            onOk={() => void submit()}
            okText={uploading ? "上传图片中…" : "运行"}
            okButtonProps={{ loading: uploading }}
            cancelText="取消"
            width={640}
            destroyOnHidden
        >
            {spec ? (
                <div className="space-y-4 pt-1">
                    <Form layout="vertical" requiredMark={false}>
                        {spec.fields.map((field, index) => (
                            <Form.Item key={index} label={field.label} className="mb-3">
                                {field.kind === "image" ? (
                                    <div className="space-y-2">
                                        {/* 本地上传预览 + 清除 */}
                                        {localFiles[index] ? (
                                            <div className="relative inline-block">
                                                <img src={localFiles[index].previewUrl} alt={field.label} className="h-24 w-24 rounded-lg border border-stone-200 object-cover dark:border-stone-700" />
                                                <button
                                                    type="button"
                                                    className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900"
                                                    onClick={() => setLocalFile(index, null)}
                                                >
                                                    <X className="size-3" />
                                                </button>
                                            </div>
                                        ) : null}
                                        {/* 上传按钮 + 画布图片选择 */}
                                        <div className="flex gap-2">
                                            <Upload
                                                accept="image/*"
                                                showUploadList={false}
                                                beforeUpload={(file) => {
                                                    if (file.size > MAX_UPLOAD_BYTES) {
                                                        message.error("图片超过 10MB，请压缩后再试");
                                                    } else {
                                                        setLocalFile(index, file);
                                                    }
                                                    return Upload.LIST_IGNORE;
                                                }}
                                            >
                                                <Button icon={<ImagePlus className="size-3.5" />} size="small">
                                                    本地上传
                                                </Button>
                                            </Upload>
                                            <Select
                                                className="min-w-0 flex-1"
                                                allowClear
                                                placeholder={canvasImageOptions.length ? "或从画布选图片" : "画布上还没有图片"}
                                                options={canvasImageOptions}
                                                value={!localFiles[index] && values[`${index}`] ? values[`${index}`] : undefined}
                                                onChange={(value) => setValue(index, value || "")}
                                            />
                                        </div>
                                    </div>
                                ) : field.kind === "number" ? (
                                    <InputNumber className="w-full" placeholder={field.defaultValue || "填写数值"} value={values[`${index}`] ? Number(values[`${index}`]) : null} onChange={(value) => setValue(index, value === null || value === undefined ? "" : String(value))} />
                                ) : (
                                    <Input.TextArea rows={2} placeholder={field.defaultValue || "填写内容"} value={values[`${index}`] || ""} onChange={(event) => setValue(index, event.target.value)} />
                                )}
                            </Form.Item>
                        ))}
                        <Form.Item label="结果写入画布" className="mb-0">
                            <Select
                                placeholder={defaultProjectId ? "默认当前画布" : projects.length ? "选择画布（默认第一个）" : "将自动新建画布"}
                                allowClear
                                value={projectId || undefined}
                                options={projects.map((project) => ({ value: project.id, label: project.title }))}
                                onChange={(value) => setProjectId(value || "")}
                            />
                        </Form.Item>
                    </Form>
                </div>
            ) : null}
        </Modal>
    );
}
