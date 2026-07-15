import { useEffect, useState } from "react";
import { Button, Modal, Segmented, Slider } from "antd";
import { RotateCcw, WandSparkles } from "lucide-react";
import { MultiAngleCameraPreview } from "@/components/canvas/multi-angle-camera-preview";
import type { MultiAngleParams } from "@/types/ai-workflow";

export type CanvasImageAngleParams = {
    horizontalAngle: number;
    pitchAngle: number;
    cameraDistance: number;
    wideAngle: boolean;
};
export type CanvasImageAngleAction = { mode: "generic"; params: CanvasImageAngleParams } | { mode: "workflow"; params: MultiAngleParams };

const defaultParams: CanvasImageAngleParams = {
    horizontalAngle: 0,
    pitchAngle: 9,
    cameraDistance: 4.8,
    wideAngle: false,
};
const defaultWorkflowParams: MultiAngleParams = { camera1: { horizontal: 315, vertical: 0, zoom: 5 }, camera2: { horizontal: 45, vertical: 30, zoom: 5 } };

export function CanvasNodeAngleDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (action: CanvasImageAngleAction) => void }) {
    const [mode, setMode] = useState<"generic" | "workflow">("generic");
    const [params, setParams] = useState(defaultParams);
    const [workflowParams, setWorkflowParams] = useState(defaultWorkflowParams);

    useEffect(() => {
        if (open) {
            setMode("generic");
            setParams(defaultParams);
            setWorkflowParams(defaultWorkflowParams);
        }
    }, [dataUrl, open]);

    const update = <Key extends keyof CanvasImageAngleParams>(key: Key, value: CanvasImageAngleParams[Key]) => setParams((current) => ({ ...current, [key]: value }));

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">AI 多角度</h2>
                    <p className="mt-1 text-sm opacity-60">左侧只预览方向，结果会基于原图重新生成</p>
                </div>
                <Segmented block value={mode} options={[{ label: "通用模型", value: "generic" }, { label: "BizyAir 双相机", value: "workflow" }]} onChange={(value) => setMode(value as "generic" | "workflow")} />
                {mode === "workflow" ? (
                    <div className="grid gap-6 md:grid-cols-[minmax(280px,1fr)_390px]">
                        <div><MultiAngleCameraPreview params={workflowParams} open={open && mode === "workflow"} /><div className="mt-2 flex gap-4 text-xs"><span className="text-green-500">相机 1</span><span className="text-sky-500">相机 2</span></div></div>
                        <div className="space-y-5"><CameraControls label="相机 1" value={workflowParams.camera1} onChange={(camera1) => setWorkflowParams((current) => ({ ...current, camera1 }))} /><CameraControls label="相机 2" value={workflowParams.camera2} onChange={(camera2) => setWorkflowParams((current) => ({ ...current, camera2 }))} /></div>
                    </div>
                ) : (
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="flex min-h-[300px] flex-col justify-between rounded-xl border p-4">
                        <div className="grid flex-1 place-items-center">
                            <div className="relative">
                                <img src={dataUrl} alt="" className="size-48 rounded-2xl object-cover shadow-2xl" draggable={false} style={{ transform: previewTransform(params) }} />
                                <div className="absolute -bottom-6 left-1/2 h-10 w-24 -translate-x-1/2 rounded-full border bg-black/20 backdrop-blur" />
                            </div>
                        </div>
                        <Button className="w-fit" icon={<RotateCcw className="size-4" />} onClick={() => setParams(defaultParams)}>
                            重置
                        </Button>
                    </div>
                    <div className="space-y-6 py-2">
                        <AngleSlider label="左右角度" value={params.horizontalAngle} min={-60} max={60} step={1} suffix="deg" onChange={(value) => update("horizontalAngle", value)} />
                        <AngleSlider label="俯仰角度" value={params.pitchAngle} min={-45} max={45} step={1} suffix="deg" onChange={(value) => update("pitchAngle", value)} />
                        <AngleSlider label="镜头距离" value={params.cameraDistance} min={1} max={10} step={0.1} onChange={(value) => update("cameraDistance", value)} />
                        <div className="grid grid-cols-[88px_1fr_72px] items-center gap-4">
                            <span className="font-medium opacity-75">广角镜头</span>
                            <Segmented
                                className="w-fit"
                                value={params.wideAngle ? "wide" : "standard"}
                                options={[
                                    { label: "标准", value: "standard" },
                                    { label: "广角", value: "wide" },
                                ]}
                                onChange={(value) => update("wideAngle", value === "wide")}
                            />
                        </div>
                    </div>
                </div>
                )}
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<WandSparkles className="size-4" />} onClick={() => onConfirm(mode === "generic" ? { mode: "generic", params } : { mode: "workflow", params: workflowParams })}>
                        {mode === "workflow" ? "生成两个视角" : "AI 生成"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function CameraControls({ label, value, onChange }: { label: string; value: MultiAngleParams["camera1"]; onChange: (value: MultiAngleParams["camera1"]) => void }) {
    const update = (key: keyof typeof value, next: number) => onChange({ ...value, [key]: next });
    return <div className="space-y-3 rounded-lg border p-3"><div className="text-sm font-semibold">{label}</div><AngleSlider label="水平" value={value.horizontal} min={0} max={359} step={1} suffix="°" onChange={(next) => update("horizontal", next)} /><AngleSlider label="垂直" value={value.vertical} min={-60} max={60} step={1} suffix="°" onChange={(next) => update("vertical", next)} /><AngleSlider label="距离" value={value.zoom} min={1} max={10} step={0.1} onChange={(next) => update("zoom", next)} /></div>;
}

function AngleSlider({ label, value, min, max, step, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
    return (
        <div className="grid grid-cols-[88px_1fr_72px] items-center gap-4">
            <span className="font-medium opacity-75">{label}</span>
            <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
            <span className="whitespace-nowrap text-right font-semibold">
                {Number.isInteger(value) ? value : value.toFixed(1)}
                {suffix}
            </span>
        </div>
    );
}

function previewTransform(params: CanvasImageAngleParams) {
    const scale = 1.08 - params.cameraDistance * 0.035 + (params.wideAngle ? -0.08 : 0);
    return `perspective(520px) rotateY(${params.horizontalAngle * -0.45}deg) rotateX(${params.pitchAngle * 0.35}deg) scale(${Math.max(0.72, Math.min(1.08, scale))})`;
}
