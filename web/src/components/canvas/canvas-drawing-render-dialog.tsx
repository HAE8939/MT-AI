import { useEffect, useState } from "react";
import { App, Button, Input, Modal, Segmented, Select, Slider, Upload } from "antd";
import { Building2, Upload as UploadIcon, X } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import { DRAWING_RENDER_PHOTOGRAPHY_PROMPT } from "@/lib/canvas/drawing-render-prompt";
import { readFileAsDataUrl } from "@/lib/image-utils";
import type { DrawingRenderParams } from "@/types/ai-workflow";

export function CanvasDrawingRenderDialog({ sourceUrl, imageOptions, open, onClose, onConfirm }: { sourceUrl: string; imageOptions: Array<{ label: string; value: string }>; open: boolean; onClose: () => void; onConfirm: (params: DrawingRenderParams) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [template, setTemplate] = useState<"photography" | "custom">("photography");
    const [customPrompt, setCustomPrompt] = useState(DRAWING_RENDER_PHOTOGRAPHY_PROMPT);
    const [description, setDescription] = useState("");
    const [referenceNodeId, setReferenceNodeId] = useState<string>();
    const [referenceDataUrl, setReferenceDataUrl] = useState<string>();
    const [referenceFileName, setReferenceFileName] = useState("");
    const [styleStrength, setStyleStrength] = useState(0.75);
    const [outputQuality, setOutputQuality] = useState(2048);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setTemplate("photography");
        setCustomPrompt(DRAWING_RENDER_PHOTOGRAPHY_PROMPT);
        setDescription("");
        setReferenceNodeId(undefined);
        setReferenceDataUrl(undefined);
        setReferenceFileName("");
        setStyleStrength(0.75);
        setOutputQuality(2048);
        setError("");
    }, [open, sourceUrl]);

    const formatJson = () => {
        try {
            setCustomPrompt(JSON.stringify(JSON.parse(customPrompt), null, 4));
            setError("");
            message.success("JSON 已格式化");
        } catch (formatError) {
            message.error(`JSON 格式错误：${formatError instanceof Error ? formatError.message : String(formatError)}`);
        }
    };

    const copyJson = () => copyText(customPrompt, "已复制到剪贴板");

    const uploadReference = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            message.error("请选择图片文件");
            return false;
        }
        try {
            const dataUrl = await readFileAsDataUrl(file);
            setReferenceDataUrl(dataUrl);
            setReferenceFileName(file.name);
            setReferenceNodeId(undefined);
        } catch {
            message.error("读取图片失败");
        }
        return false;
    };

    const clearLocalReference = () => {
        setReferenceDataUrl(undefined);
        setReferenceFileName("");
    };

    const submit = () => {
        const prompt = template === "photography" ? DRAWING_RENDER_PHOTOGRAPHY_PROMPT : customPrompt.trim();
        try {
            JSON.parse(prompt);
        } catch {
            setError("自定义模板必须是有效 JSON");
            return;
        }
        onConfirm({ template, customPrompt: prompt, description: description.trim(), referenceNodeId: referenceDataUrl ? undefined : referenceNodeId, referenceDataUrl, styleStrength, outputQuality });
    };

    return (
        <Modal title={null} open={open && Boolean(sourceUrl)} onCancel={onClose} footer={null} width={920} centered destroyOnHidden>
            <div className="space-y-5">
                <div><h2 className="text-xl font-semibold">图纸渲染</h2><p className="mt-1 text-sm opacity-60">保持图纸空间结构，将草图或 SU 截图转换为写实效果图</p></div>
                <div className="grid gap-6 md:grid-cols-[300px_1fr]">
                    <div className="rounded-lg border p-3"><img src={sourceUrl} alt="源图纸" className="h-64 w-full rounded-md object-contain" /><div className="mt-3 text-xs opacity-55">源图纸</div></div>
                    <div className="space-y-4">
                        <Segmented block value={template} options={[{ label: "建筑摄影模板", value: "photography" }, { label: "自定义 JSON", value: "custom" }]} onChange={(value) => setTemplate(value as "photography" | "custom")} />
                        <div className="flex items-center gap-2">
                            <Select allowClear className="min-w-0 flex-1" placeholder="参考图（可选，未选择时使用源图）" value={referenceNodeId} options={imageOptions} disabled={Boolean(referenceDataUrl)} onChange={setReferenceNodeId} />
                            <Upload accept="image/*" showUploadList={false} beforeUpload={uploadReference}><Button icon={<UploadIcon className="size-4" />}>本地上传</Button></Upload>
                        </div>
                        {referenceDataUrl ? (
                            <div className="flex items-center gap-3 rounded-md border p-2">
                                <img src={referenceDataUrl} alt="本地参考图" className="h-12 w-12 rounded object-cover" />
                                <span className="min-w-0 flex-1 truncate text-xs opacity-70">{referenceFileName || "本地参考图"}</span>
                                <Button type="text" size="small" icon={<X className="size-4" />} onClick={clearLocalReference} />
                            </div>
                        ) : null}
                        <Input.TextArea rows={2} value={description} placeholder="补充要求，例如：傍晚暖光、现代极简材质" onChange={(event) => setDescription(event.target.value)} />
                        {template === "custom" ? (
                            <div className="space-y-2">
                                <Input.TextArea rows={9} value={customPrompt} onChange={(event) => { setCustomPrompt(event.target.value); setError(""); }} />
                                <div className="flex gap-2"><Button size="small" onClick={formatJson}>格式化 JSON</Button><Button size="small" onClick={copyJson}>复制 JSON</Button></div>
                            </div>
                        ) : <pre className="max-h-52 overflow-auto rounded-md bg-stone-100 p-3 text-xs leading-5 dark:bg-stone-900">{DRAWING_RENDER_PHOTOGRAPHY_PROMPT}</pre>}
                        {error ? <div className="text-xs font-medium text-red-600">{error}</div> : null}
                        <div className="grid grid-cols-[90px_1fr_50px] items-center gap-3 text-sm"><span>风格强度</span><Slider min={0} max={1} step={0.05} value={styleStrength} onChange={setStyleStrength} /><span>{styleStrength.toFixed(2)}</span></div>
                        <Segmented block value={outputQuality} options={[{ label: "1K", value: 1024 }, { label: "2K", value: 2048 }]} onChange={(value) => setOutputQuality(Number(value))} />
                    </div>
                </div>
                <div className="flex justify-end"><Button type="primary" size="large" icon={<Building2 className="size-4" />} onClick={submit}>提交图纸渲染</Button></div>
            </div>
        </Modal>
    );
}
