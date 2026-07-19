import { App, Button, Input, Select, Tag, Tooltip, Upload } from "antd";
import { ArrowLeft, ImagePlus, Play, Sparkles, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { usePromptEngineRun } from "@/components/workflow/use-prompt-engine-run";
import type { AgentTemplate } from "@/types/workflow";

// 画布侧栏提示词引擎工作流运行视图：按 inputSpec 动态渲染表单（原图/蒙版/参考图/文字/选项），
// 运行后展示 LLM 扩写出的 final_prompt（调优观测窗口）。

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function ImageSlot({ label, previewSrc, theme, onFile, onClear, message }: { label: string; previewSrc?: string; theme: Theme; onFile: (file: File) => void; onClear?: () => void; message: ReturnType<typeof App.useApp>["message"] }) {
    return (
        <div className="space-y-2">
            <div className="text-xs font-medium" style={{ color: theme.node.text }}>{label}</div>
            <div className="flex items-start gap-2">
                {previewSrc ? (
                    <div className="relative">
                        <img src={previewSrc} alt={label} className="h-24 w-24 rounded-lg border object-cover" style={{ borderColor: theme.node.stroke }} />
                        {onClear ? (
                            <button type="button" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-white shadow-sm" style={{ borderColor: theme.node.stroke }} onClick={onClear}>
                                <X className="size-3" />
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <div className="grid h-24 w-24 place-items-center rounded-lg border border-dashed" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                        <ImagePlus className="size-5" />
                    </div>
                )}
                <Upload
                    accept="image/*"
                    showUploadList={false}
                    beforeUpload={(file) => {
                        if (file.size > MAX_UPLOAD_BYTES) message.error("图片超过 10MB，请压缩后再试");
                        else onFile(file);
                        return Upload.LIST_IGNORE;
                    }}
                >
                    <Button size="small">上传图片</Button>
                </Upload>
            </div>
        </div>
    );
}

export function PromptEngineRunPanel({ template, theme, onBack }: { template: AgentTemplate; theme: Theme; onBack: () => void }) {
    const { message } = App.useApp();
    const {
        config,
        sourceImage,
        sourceFromCanvas,
        setSourceFromCanvas,
        pickSourceFile,
        maskImage,
        pickMaskFile,
        setMaskImage,
        refImages,
        addReferenceFile,
        removeReference,
        userText,
        setUserText,
        extraValues,
        setExtraValue,
        canvasImageNodes,
        running,
        phase,
        finalPrompt,
        lastError,
        run,
    } = usePromptEngineRun(template);

    if (!config) return null;
    const canvasImageOptions = canvasImageNodes.map((node) => ({ value: node.metadata!.content as string, label: node.title || node.id }));
    const needImage = config.inputSpec.image !== "none";
    const needMask = config.inputSpec.mask !== "none";
    const maxRefs = config.inputSpec.refImages || 0;
    const needText = config.inputSpec.userText !== "none";

    return (
        <div className="flex min-h-full flex-col gap-3">
            <div className="flex items-center gap-1.5">
                <Button type="text" size="small" icon={<ArrowLeft className="size-4" />} onClick={onBack} />
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: theme.toolbar.panel }}>{template.avatar || "🏠"}</span>
                <div className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: theme.node.text }}>{template.name}</div>
                <Tag className="m-0 shrink-0 border-0 px-1.5 text-[10px] leading-4" icon={<Sparkles className="mr-0.5 inline size-3" />}>提示词引擎</Tag>
            </div>
            {template.description ? <div className="line-clamp-3 text-xs leading-5" style={{ color: theme.node.muted }}>{template.description}</div> : null}

            <div className="flex-1 space-y-4">
                {needImage ? (
                    <div className="space-y-2">
                        <ImageSlot label={`原图${config.inputSpec.image === "optional" ? "（可选）" : ""}`} previewSrc={sourceImage?.previewUrl || sourceFromCanvas || undefined} theme={theme} onFile={(file) => void pickSourceFile(file)} message={message} />
                        <Select
                            className="w-full"
                            size="small"
                            allowClear
                            placeholder={canvasImageOptions.length ? "或选画布图片" : "画布上还没有图片"}
                            options={canvasImageOptions}
                            value={!sourceImage && sourceFromCanvas ? sourceFromCanvas : undefined}
                            onChange={(value) => setSourceFromCanvas(value || "")}
                        />
                    </div>
                ) : null}

                {needMask ? (
                    <ImageSlot
                        label={`蒙版${config.inputSpec.mask === "optional" ? "（可选）" : ""} · 涂抹处 = 修改区`}
                        previewSrc={maskImage?.previewUrl}
                        theme={theme}
                        onFile={(file) => void pickMaskFile(file)}
                        onClear={() => setMaskImage(null)}
                        message={message}
                    />
                ) : null}

                {maxRefs > 0 ? (
                    <div className="space-y-2">
                        <div className="text-xs font-medium" style={{ color: theme.node.text }}>
                            参考图（{config.inputSpec.refImagesOptional ? "可选，" : ""}最多 {maxRefs} 张）
                        </div>
                        <div className="flex flex-wrap items-start gap-2">
                            {refImages.map((item, index) => (
                                <div key={item.previewUrl} className="relative">
                                    <img src={item.previewUrl} alt={`参考图 ${index + 1}`} className="h-20 w-20 rounded-lg border object-cover" style={{ borderColor: theme.node.stroke }} />
                                    <button type="button" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-white shadow-sm" style={{ borderColor: theme.node.stroke }} onClick={() => removeReference(index)}>
                                        <X className="size-3" />
                                    </button>
                                </div>
                            ))}
                            {refImages.length < maxRefs ? (
                                <Upload
                                    accept="image/*"
                                    showUploadList={false}
                                    beforeUpload={(file) => {
                                        if (file.size > MAX_UPLOAD_BYTES) message.error("图片超过 10MB，请压缩后再试");
                                        else void addReferenceFile(file);
                                        return Upload.LIST_IGNORE;
                                    }}
                                >
                                    <div className="grid h-20 w-20 cursor-pointer place-items-center rounded-lg border border-dashed" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                                        <ImagePlus className="size-5" />
                                    </div>
                                </Upload>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {(config.inputSpec.extraFields || []).map((field) => (
                    <div key={field.key} className="space-y-2">
                        <div className="text-xs font-medium" style={{ color: theme.node.text }}>{field.label_zh}</div>
                        {field.options?.length ? (
                            <Select className="w-full" size="small" options={field.options.map((option) => ({ value: option, label: option }))} value={String(extraValues[field.key] ?? field.default ?? "")} onChange={(value) => setExtraValue(field.key, value)} />
                        ) : (
                            <Input size="small" value={String(extraValues[field.key] ?? "")} onChange={(event) => setExtraValue(field.key, event.target.value)} />
                        )}
                    </div>
                ))}

                {needText ? (
                    <div className="space-y-2">
                        <div className="text-xs font-medium" style={{ color: theme.node.text }}>
                            描述{config.inputSpec.userText === "optional" ? "（可选）" : ""}
                        </div>
                        <Input.TextArea rows={3} placeholder="一句话说清「哪里 + 改成什么」即可，专业扩写交给系统" value={userText} onChange={(event) => setUserText(event.target.value)} />
                    </div>
                ) : null}

                {finalPrompt ? (
                    <div className="space-y-1.5">
                        <div className="text-xs font-medium" style={{ color: theme.node.text }}>扩写提示词（final_prompt）</div>
                        <Tooltip title="LLM 按知识库扩写出的最终英文提示词，已保存到结果节点，可用于调试与学习">
                            <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-md border px-2 py-1.5 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                                {finalPrompt}
                            </div>
                        </Tooltip>
                    </div>
                ) : null}
            </div>

            <div className="sticky bottom-0 space-y-2 pb-1 pt-2" style={{ background: theme.toolbar.panel }}>
                <Button type="primary" block size="large" icon={<Play className="size-4" />} loading={running} onClick={() => void run()}>
                    {running ? (phase === "expanding" ? "扩写提示词中…" : "生成图片中…") : "立即生成"}
                </Button>
                {lastError ? (
                    <div className="rounded-md px-2 py-1.5 text-xs leading-5" style={{ color: "#f5222d", border: `1px solid ${theme.node.stroke}` }}>{lastError}</div>
                ) : null}
            </div>
        </div>
    );
}
