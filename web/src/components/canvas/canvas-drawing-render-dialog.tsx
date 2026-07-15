import { useEffect, useState } from "react";
import { Button, Input, Modal, Segmented, Select, Slider } from "antd";
import { Building2 } from "lucide-react";

import { DRAWING_RENDER_PHOTOGRAPHY_PROMPT } from "@/lib/canvas/drawing-render-prompt";
import type { DrawingRenderParams } from "@/types/ai-workflow";

export function CanvasDrawingRenderDialog({ sourceUrl, imageOptions, open, onClose, onConfirm }: { sourceUrl: string; imageOptions: Array<{ label: string; value: string }>; open: boolean; onClose: () => void; onConfirm: (params: DrawingRenderParams) => void }) {
    const [template, setTemplate] = useState<"photography" | "custom">("photography");
    const [customPrompt, setCustomPrompt] = useState(DRAWING_RENDER_PHOTOGRAPHY_PROMPT);
    const [description, setDescription] = useState("");
    const [referenceNodeId, setReferenceNodeId] = useState<string>();
    const [styleStrength, setStyleStrength] = useState(0.75);
    const [outputQuality, setOutputQuality] = useState(2048);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setTemplate("photography");
        setCustomPrompt(DRAWING_RENDER_PHOTOGRAPHY_PROMPT);
        setDescription("");
        setReferenceNodeId(undefined);
        setStyleStrength(0.75);
        setOutputQuality(2048);
        setError("");
    }, [open, sourceUrl]);

    const submit = () => {
        const prompt = template === "photography" ? DRAWING_RENDER_PHOTOGRAPHY_PROMPT : customPrompt.trim();
        try {
            JSON.parse(prompt);
        } catch {
            setError("自定义模板必须是有效 JSON");
            return;
        }
        onConfirm({ template, customPrompt: prompt, description: description.trim(), referenceNodeId, styleStrength, outputQuality });
    };

    return (
        <Modal title={null} open={open && Boolean(sourceUrl)} onCancel={onClose} footer={null} width={920} centered destroyOnHidden>
            <div className="space-y-5">
                <div><h2 className="text-xl font-semibold">图纸渲染</h2><p className="mt-1 text-sm opacity-60">保持图纸空间结构，将草图或 SU 截图转换为写实效果图</p></div>
                <div className="grid gap-6 md:grid-cols-[300px_1fr]">
                    <div className="rounded-lg border p-3"><img src={sourceUrl} alt="源图纸" className="h-64 w-full rounded-md object-contain" /><div className="mt-3 text-xs opacity-55">源图纸</div></div>
                    <div className="space-y-4">
                        <Segmented block value={template} options={[{ label: "建筑摄影模板", value: "photography" }, { label: "自定义 JSON", value: "custom" }]} onChange={(value) => setTemplate(value as "photography" | "custom")} />
                        <Select allowClear className="w-full" placeholder="参考图（可选，未选择时使用源图）" value={referenceNodeId} options={imageOptions} onChange={setReferenceNodeId} />
                        <Input.TextArea rows={2} value={description} placeholder="补充要求，例如：傍晚暖光、现代极简材质" onChange={(event) => setDescription(event.target.value)} />
                        {template === "custom" ? <Input.TextArea rows={9} value={customPrompt} onChange={(event) => { setCustomPrompt(event.target.value); setError(""); }} /> : <pre className="max-h-52 overflow-auto rounded-md bg-stone-100 p-3 text-xs leading-5 dark:bg-stone-900">{DRAWING_RENDER_PHOTOGRAPHY_PROMPT}</pre>}
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
