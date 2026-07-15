import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Input, Modal, Segmented, Select, Slider } from "antd";
import { Brush, Eraser, RectangleHorizontal, RotateCcw, WandSparkles, X } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";

export type CanvasImageMaskEditPayload = {
    prompt: string;
    maskDataUrl: string;
    referenceNodeIds: string[];
};

type DrawMode = "paint" | "erase";

const defaultBrushSize = 100;
const maskFillColor = "rgba(37, 99, 235, .38)";
const maskBorderColor = "rgba(255, 255, 255, .72)";

export function CanvasNodeMaskEditDialog({ dataUrl, imageOptions = [], open, onClose, onConfirm }: { dataUrl: string; imageOptions?: Array<{ label: string; value: string }>; open: boolean; onClose: () => void; onConfirm: (payload: CanvasImageMaskEditPayload) => void }) {
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef<{ active: boolean; last: { x: number; y: number } | null }>({ active: false, last: null });
    const rectangleStartRef = useRef<{ x: number; y: number } | null>(null);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [prompt, setPrompt] = useState("");
    const [brushSize, setBrushSize] = useState(defaultBrushSize);
    const [mode, setMode] = useState<DrawMode>("paint");
    const [selectionMode, setSelectionMode] = useState<"brush" | "rectangle">("brush");
    const [ratio, setRatio] = useState<"free" | "1:1" | "16:9" | "9:16">("free");
    const [featherRadius, setFeatherRadius] = useState(5);
    const [referenceNodeIds, setReferenceNodeIds] = useState<string[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setPrompt("");
        setBrushSize(defaultBrushSize);
        setMode("paint");
        setSelectionMode("brush");
        setRatio("free");
        setFeatherRadius(5);
        setReferenceNodeIds([]);
        setError("");
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    useEffect(() => {
        clearCanvas(maskCanvasRef.current);
        clearCanvas(previewCanvasRef.current);
    }, [image]);

    const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const point = readCanvasPoint(event.currentTarget, event.clientX, event.clientY);
        const maskCanvas = maskCanvasRef.current;
        const context = maskCanvas?.getContext("2d");
        if (!maskCanvas || !context) return;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = brushSize;
        context.globalCompositeOperation = mode === "paint" ? "source-over" : "destination-out";
        context.strokeStyle = "#000";
        context.fillStyle = "#000";
        if (!drawingRef.current.last) {
            drawMaskStroke(context, point, point, brushSize);
        } else {
            drawMaskStroke(context, drawingRef.current.last, point, brushSize);
        }
        renderMaskPreview(maskCanvas, previewCanvasRef.current);
        drawingRef.current.last = point;
        if (mode === "paint") {
            setError("");
        }
    };

    const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        if (selectionMode === "rectangle") {
            rectangleStartRef.current = readCanvasPoint(event.currentTarget, event.clientX, event.clientY);
            clearCanvas(maskCanvasRef.current);
            clearCanvas(previewCanvasRef.current);
            return;
        }
        drawingRef.current = { active: true, last: null };
        if (maskCanvasRef.current) renderMaskPreview(maskCanvasRef.current, previewCanvasRef.current);
        draw(event);
    };

    const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (selectionMode === "rectangle" && rectangleStartRef.current) {
            const canvas = maskCanvasRef.current;
            const context = canvas?.getContext("2d");
            if (!canvas || !context) return;
            const end = readCanvasPoint(event.currentTarget, event.clientX, event.clientY);
            clearCanvas(canvas);
            drawRectangleMask(context, rectangleStartRef.current, end, ratio);
            renderMaskPreview(canvas, previewCanvasRef.current, true);
            setError("");
            return;
        }
        if (!drawingRef.current.active) return;
        event.preventDefault();
        draw(event);
    };

    const stopDraw = () => {
        rectangleStartRef.current = null;
        drawingRef.current = { active: false, last: null };
        const maskCanvas = maskCanvasRef.current;
        if (maskCanvas) renderMaskPreview(maskCanvas, previewCanvasRef.current, canvasHasPaint(maskCanvas));
    };

    const resetMask = () => {
        clearCanvas(maskCanvasRef.current);
        clearCanvas(previewCanvasRef.current);
        setError("");
    };

    const submit = () => {
        const nextPrompt = prompt.trim();
        const canvas = maskCanvasRef.current;
        if (!nextPrompt) return setError("请输入修改要求");
        if (!canvas) return;
        if (!canvasHasPaint(canvas)) return setError("请先涂抹局部区域");
        onConfirm({ prompt: nextPrompt, maskDataUrl: buildEditMask(canvas, featherRadius), referenceNodeIds });
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={980} centered destroyOnHidden>
            <div className="grid gap-5 lg:grid-cols-[minmax(360px,1fr)_320px]">
                <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-black/10 bg-transparent p-0 dark:border-white/10">
                    <div className="relative inline-block max-w-full overflow-hidden rounded-lg bg-transparent select-none">
                        <img src={dataUrl} alt="" className="block max-h-[68vh] max-w-full bg-transparent" draggable={false} />
                        {image ? (
                            <>
                                <canvas ref={maskCanvasRef} width={image.width} height={image.height} className="hidden" />
                                <canvas
                                    ref={previewCanvasRef}
                                    width={image.width}
                                    height={image.height}
                                    className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                                    onPointerDown={startDraw}
                                    onPointerMove={moveDraw}
                                    onPointerUp={stopDraw}
                                    onPointerCancel={stopDraw}
                                />
                            </>
                        ) : null}
                    </div>
                </div>

                <div className="flex min-h-[360px] flex-col gap-5">
                    <div>
                        <h2 className="text-xl font-semibold">局部遮罩编辑</h2>
                        <div className="mt-2 text-sm opacity-60">{image ? `${image.width} x ${image.height}px` : "读取中"}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <Button type={selectionMode === "brush" ? "primary" : "default"} icon={<Brush className="size-4" />} onClick={() => setSelectionMode("brush")}>画笔选择</Button>
                        <Button type={selectionMode === "rectangle" ? "primary" : "default"} icon={<RectangleHorizontal className="size-4" />} onClick={() => setSelectionMode("rectangle")}>矩形选择</Button>
                    </div>

                    {selectionMode === "brush" ? <div className="grid grid-cols-2 gap-2">
                        <Button type={mode === "paint" ? "primary" : "default"} icon={<Brush className="size-4" />} onClick={() => setMode("paint")}>
                            画笔
                        </Button>
                        <Button type={mode === "erase" ? "primary" : "default"} icon={<Eraser className="size-4" />} onClick={() => setMode("erase")}>
                            擦除
                        </Button>
                    </div> : <Segmented block value={ratio} options={[{ label: "自由", value: "free" }, { label: "1:1", value: "1:1" }, { label: "16:9", value: "16:9" }, { label: "9:16", value: "9:16" }]} onChange={(value) => setRatio(value as typeof ratio)} />}

                    {selectionMode === "brush" ? <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium opacity-75">笔刷大小</span>
                            <span className="font-semibold">{brushSize}px</span>
                        </div>
                        <Slider min={8} max={160} step={2} value={brushSize} onChange={setBrushSize} />
                    </div> : null}

                    <div className="space-y-2"><div className="flex items-center justify-between text-sm"><span className="font-medium opacity-75">羽化半径</span><span className="font-semibold">{featherRadius}px</span></div><Slider min={0} max={40} step={1} value={featherRadius} onChange={setFeatherRadius} /></div>

                    <Select mode="multiple" allowClear maxTagCount="responsive" placeholder="附加风格参考图（可选）" value={referenceNodeIds} options={imageOptions} onChange={setReferenceNodeIds} />

                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-75">修改要求</div>
                        <Input.TextArea
                            rows={6}
                            value={prompt}
                            status={error && !prompt.trim() ? "error" : undefined}
                            placeholder="例如：把选中区域改成金属材质，保持原图光影"
                            onChange={(event) => {
                                setPrompt(event.target.value);
                                setError("");
                            }}
                        />
                        {error ? <div className="text-xs font-medium text-[#ef4444]">{error}</div> : null}
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2">
                        <Button icon={<RotateCcw className="size-4" />} onClick={resetMask}>
                            重置
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button icon={<X className="size-4" />} onClick={onClose}>
                                取消
                            </Button>
                            <Button type="primary" icon={<WandSparkles className="size-4" />} onClick={submit}>
                                AI 修改
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function readCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawMaskStroke(context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, size: number) {
    if (from.x === to.x && from.y === to.y) {
        context.beginPath();
        context.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
        context.fill();
        return;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
}

function canvasHasPaint(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) return false;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) return true;
    }
    return false;
}

function renderMaskPreview(maskCanvas: HTMLCanvasElement, previewCanvas: HTMLCanvasElement | null, withBorder = false) {
    const context = previewCanvas?.getContext("2d");
    if (!previewCanvas || !context) return;
    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.fillStyle = maskFillColor;
    context.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(maskCanvas, 0, 0);
    context.globalCompositeOperation = "source-over";
    if (withBorder) drawDashedMaskBorder(context, maskCanvas);
}

function drawDashedMaskBorder(context: CanvasRenderingContext2D, maskCanvas: HTMLCanvasElement) {
    const maskContext = maskCanvas.getContext("2d");
    if (!maskContext) return;
    const { width, height } = maskCanvas;
    const data = maskContext.getImageData(0, 0, width, height).data;
    const step = Math.max(1, Math.round(Math.max(width, height) / 1200));
    const dash = step * 8;
    const gap = step * 5;
    const period = dash + gap;

    context.save();
    context.fillStyle = maskBorderColor;
    context.shadowColor = "rgba(0, 0, 0, .24)";
    context.shadowBlur = step * 1.5;
    for (let y = step; y < height - step; y += step) {
        for (let x = step; x < width - step; x += step) {
            const offset = (y * width + x) * 4 + 3;
            if (data[offset] === 0 || !isMaskEdge(data, width, x, y, step)) continue;
            if ((x + y) % period > dash) continue;
            context.fillRect(x - step / 2, y - step / 2, Math.max(1.5, step), Math.max(1.5, step));
        }
    }
    context.restore();
}

function isMaskEdge(data: Uint8ClampedArray, width: number, x: number, y: number, step: number) {
    return data[((y - step) * width + x) * 4 + 3] === 0 || data[((y + step) * width + x) * 4 + 3] === 0 || data[(y * width + x - step) * 4 + 3] === 0 || data[(y * width + x + step) * 4 + 3] === 0;
}

function buildEditMask(selectionCanvas: HTMLCanvasElement, featherRadius: number) {
    const canvas = document.createElement("canvas");
    canvas.width = selectionCanvas.width;
    canvas.height = selectionCanvas.height;
    const context = canvas.getContext("2d");
    if (!context) return selectionCanvas.toDataURL("image/png");
    const blurredSelection = document.createElement("canvas");
    blurredSelection.width = selectionCanvas.width;
    blurredSelection.height = selectionCanvas.height;
    const blurredContext = blurredSelection.getContext("2d");
    if (blurredContext) {
        blurredContext.filter = featherRadius ? `blur(${featherRadius}px)` : "none";
        blurredContext.drawImage(selectionCanvas, 0, 0);
    }
    const selectionContext = blurredSelection.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!selectionContext) return canvas.toDataURL("image/png");
    const selection = selectionContext.getImageData(0, 0, canvas.width, canvas.height);
    const mask = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < mask.data.length; index += 4) {
        if (selection.data[index] > 0) mask.data[index] = 0;
    }
    context.putImageData(mask, 0, 0);
    return canvas.toDataURL("image/png");
}

function drawRectangleMask(context: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }, ratio: "free" | "1:1" | "16:9" | "9:16") {
    let width = end.x - start.x;
    let height = end.y - start.y;
    const targetRatio = ratio === "1:1" ? 1 : ratio === "16:9" ? 16 / 9 : ratio === "9:16" ? 9 / 16 : null;
    if (targetRatio) {
        const signX = Math.sign(width) || 1;
        const signY = Math.sign(height) || 1;
        if (Math.abs(width / (height || 1)) > targetRatio) height = signY * Math.abs(width) / targetRatio;
        else width = signX * Math.abs(height) * targetRatio;
    }
    context.fillStyle = "#000";
    context.fillRect(start.x, start.y, width, height);
}
