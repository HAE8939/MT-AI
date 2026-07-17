import { useMemo } from "react";
import { AutoComplete, Form, Input, InputNumber, Modal, Select } from "antd";

import { useRunningHubRun } from "@/components/workflow/use-runninghub-run";
import type { AgentTemplate } from "@/types/workflow";

// 运行 RunningHub 工作流的弹窗（/workflows 页）：填参数 → 提交统一任务运行时 → 结果写回画布新节点。
// 核心逻辑在 useRunningHubRun；图片参数可选画布图片节点或直接填公网 URL（AutoComplete 自由输入保留 URL 能力）。

export function RunningHubRunDialog({ template, defaultProjectId, onClose }: { template: AgentTemplate | null; defaultProjectId?: string; onClose: () => void }) {
    const { spec, values, setValue, canvasImageNodes, projects, projectId, setProjectId, uploading, run } = useRunningHubRun(template, { defaultProjectId });
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
                                    <AutoComplete
                                        className="w-full"
                                        options={canvasImageOptions}
                                        value={values[`${index}`] || ""}
                                        placeholder={canvasImageOptions.length ? "选择画布图片，或填写图片公网 URL" : "图片公网 URL（COS 直链或其他可公开访问地址）"}
                                        onChange={(value) => setValue(index, value)}
                                    />
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
