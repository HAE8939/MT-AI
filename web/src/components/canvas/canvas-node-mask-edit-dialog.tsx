import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Checkbox, Input, Modal, Segmented, Select, Slider } from "antd";
import { Brush, Eraser, RectangleHorizontal, RotateCcw, WandSparkles, X } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";

export type CanvasImageMaskRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CanvasImageMaskEditPayload = {
    prompt: string;
    maskDataUrl: string;
    referenceNodeIds: string[];
    featherRadius: number;
    selectionMode: MaskSelectionMode;
    ratio: MaskRatio;
    /** 矩形选区（原图像素坐标），画笔模式下为空 */
    rect?: CanvasImageMaskRect;
    saveCompareCrops: boolean;
};

type DrawMode = "paint" | "erase";
type MaskSelectionMode = "brush" | "rectangle";
type MaskRatio = "free" | "1:1" | "16:9" | "9:16";
type RectangleHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
type NormalizedRect = { x: number; y: number; width: number; height: number };

const defaultBrushSize = 100;
const maskFillColor = "rgba(37, 99, 235, .38)";
const maskBorderColor = "rgba(255, 255, 255, .72)";
const rectangleHandles: RectangleHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const minRectSize = 0.02;

export function CanvasNodeMaskEditDialog({ dataUrl, imageOptions = [], open, onClose, onConfirm }: { dataUrl: string; imageOptions?: Array<{ label: string; value: string }>; open: boolean; onClose: () => void; onConfirm: (payload: CanvasImageMaskEditPayload) => void }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef<{ active: boolean; last: { x: number; y: number } | null }>({ active: false, last: null });
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [prompt, setPrompt] = useState("");
    const [brushSize, setBrushSize] = useState(defaultBrushSize);
    const [mode, setMode] = useState<DrawMode>("paint");
    const [selectionMode, setSelectionMode] = useState<MaskSelectionMode>("brush");
    const [ratio, setRatio] = useState<MaskRatio>("free");
    const [featherRadius, setFeatherRadius] = useState(5);
    const [rect, setRect] = useState<NormalizedRect | null>(null);
    const [saveCompareCrops, setSaveCompareCrops] = useState(false);
    const [referenceNodeIds, setReferenceNodeIds] = useState<string[]>([]);
    const [error, setError] = useState("");

    // 归一化高宽比：height_n = width_n * ratioN 时，像素比例等于所选比例
    const ratioN = useMemo(() => maskRatioN(ratio, image), [ratio, image]);

    useEffect(() => {
        if (!open) return;
        setPrompt("");
        setBrushSize(defaultBrushSize);
        setMode("paint");
        setSelectionMode("brush");
        setRatio("free");
        setFeatherRadius(5);
        setRect(null);
        setSaveCompareCrops(false);
        setReferenceNodeIds([]);
        setError("");
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    useEffect(() => {
        clearCanvas(maskCanvasRef.current);
        clearCanvas(previewCanvasRef.current);
    }, [image]);

    // 矩形选区同步到蒙版画布
    useEffect(() => {
        if (selectionMode !== "rectangle") return;
        const canvas = maskCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        context.globalCompositeOperation = "source-over";
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (!rect) {
            clearCanvas(previewCanvasRef.current);
            return;
        }
        context.fillStyle = "#000";
        context.fillRect(rect.x * canvas.width, rect.y * canvas.height, rect.width * canvas.width, rect.height * canvas.height);
        renderMaskPreview(canvas, previewCanvasRef.current);
    }, [rect, selectionMode, image]);

    const readNormalizedPoint = (clientX: number, clientY: number) => {
        const box = boxRef.current?.getBoundingClientRect();
        if (!box || !box.width || !box.height) return null;
        return {
            x: Math.max(0, Math.min(1, (clientX - box.left) / box.width)),
            y: Math.max(0, Math.min(1, (clientY - box.top) / box.height)),
        };
    };

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

    // 在选区外按下才重新框选；选区内部/拉杆由对应元素接管
    const startRectangleDraw = (event: ReactPointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const start = readNormalizedPoint(event.clientX, event.clientY);
        if (!start) return;
        setRect(null);
        setError("");
        const move = (moveEvent: PointerEvent) => {
            const current = readNormalizedPoint(moveEvent.clientX, moveEvent.clientY);
            if (current) setRect(buildDrawRect(start, current, ratioN));
        };
        const up = (upEvent: PointerEvent) => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
            const current = readNormalizedPoint(upEvent.clientX, upEvent.clientY);
            const next = current ? buildDrawRect(start, current, ratioN) : null;
            setRect(next && next.width >= minRectSize && next.height >= minRectSize ? next : null);
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
    };

    const startRectangleDrag = (dragMode: "move" | "resize", event: ReactPointerEvent, handle?: RectangleHandle) => {
        const box = boxRef.current?.getBoundingClientRect();
        if (!box || !rect) return;
        event.preventDefault();
        event.stopPropagation();
        const start = { x: event.clientX, y: event.clientY, rect };
        const move = (moveEvent: PointerEvent) => {
            const dx = (moveEvent.clientX - start.x) / box.width;
            const dy = (moveEvent.clientY - start.y) / box.height;
            setRect(dragMode === "move" ? moveRect(start.rect, dx, dy) : resizeRect(start.rect, dx, dy, handle || "se", ratioN));
        };
        const up = () => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
    };

    const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (selectionMode === "rectangle") {
            startRectangleDraw(event);
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawingRef.current = { active: true, last: null };
        if (maskCanvasRef.current) renderMaskPreview(maskCanvasRef.current, previewCanvasRef.current);
        draw(event);
    };

    const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (selectionMode === "rectangle") return;
        if (!drawingRef.current.active) return;
        event.preventDefault();
        draw(event);
    };

    const stopDraw = () => {
        if (selectionMode === "rectangle") return;
        drawingRef.current = { active: false, last: null };
        const maskCanvas = maskCanvasRef.current;
        if (maskCanvas) renderMaskPreview(maskCanvas, previewCanvasRef.current, canvasHasPaint(maskCanvas));
    };

    const changeSelectionMode = (next: MaskSelectionMode) => {
        if (next === selectionMode) return;
        setSelectionMode(next);
        setRect(null);
        clearCanvas(maskCanvasRef.current);
        clearCanvas(previewCanvasRef.current);
        setError("");
    };

    const resetMask = () => {
        setRect(null);
        clearCanvas(maskCanvasRef.current);
        clearCanvas(previewCanvasRef.current);
        setError("");
    };

    const submit = () => {
        const nextPrompt = prompt.trim();
        const canvas = maskCanvasRef.current;
        if (!nextPrompt) return setError("请输入修改要求");
        if (!canvas) return;
        if (selectionMode === "rectangle" && !rect) return setError("请先框选局部区域");
        if (!canvasHasPaint(canvas)) return setError("请先涂抹局部区域");
        const pixelRect = selectionMode === "rectangle" && rect ? toPixelRect(rect, canvas.width, canvas.height) : undefined;
        if (pixelRect && (pixelRect.width < 16 || pixelRect.height < 16)) return setError("选区太小，请重新框选");
        onConfirm({
            prompt: nextPrompt,
            maskDataUrl: buildEditMask(canvas, featherRadius),
            referenceNodeIds,
            featherRadius,
            selectionMode,
            ratio,
            rect: pixelRect,
            saveCompareCrops,
        });
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={980} centered destroyOnHidden>
            <div className="grid gap-5 lg:grid-cols-[minmax(360px,1fr)_320px]">
                <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-black/10 bg-transparent p-0 dark:border-white/10">
                    <div ref={boxRef} className="relative inline-block max-w-full overflow-hidden rounded-lg bg-transparent select-none">
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
                                {selectionMode === "rectangle" && rect ? (
                                    <div className="absolute cursor-move touch-none border-2 border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.35)]" style={rectStyle(rect)} onPointerDown={(event) => startRectangleDrag("move", event)}>
                                        {rectangleHandles.map((handle) => (
                                            <button key={handle} type="button" className="absolute size-3 touch-none rounded-full border border-black bg-white" style={handleStyle(handle)} onPointerDown={(event) => startRectangleDrag("resize", event, handle)} aria-label="调整选区" />
                                        ))}
                                        <div className="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-white">
                                            {Math.round(rect.width * image.width)} × {Math.round(rect.height * image.height)} px
                                        </div>
                                    </div>
                                ) : null}
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
                        <Button type={selectionMode === "brush" ? "primary" : "default"} icon={<Brush className="size-4" />} onClick={() => changeSelectionMode("brush")}>画笔选择</Button>
                        <Button type={selectionMode === "rectangle" ? "primary" : "default"} icon={<RectangleHorizontal className="size-4" />} onClick={() => changeSelectionMode("rectangle")}>矩形选择</Button>
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

                    <Checkbox checked={saveCompareCrops} onChange={(event) => setSaveCompareCrops(event.target.checked)}>生成选区对比小图（原图选区 / AI 生成区）</Checkbox>

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
    // 羽化边缘写入渐变透明度：alpha=0 完全编辑，alpha=255 完全保留，中间值供客户端合成渐变混合
    for (let index = 3; index < mask.data.length; index += 4) {
        mask.data[index] = 255 - selection.data[index];
    }
    context.putImageData(mask, 0, 0);
    return canvas.toDataURL("image/png");
}

function maskRatioN(ratio: MaskRatio, image: { width: number; height: number } | null): number | null {
    if (ratio === "free" || !image || !image.width || !image.height) return null;
    const [w, h] = ratio.split(":").map(Number);
    return image.width / image.height / (w / h);
}

function buildDrawRect(start: { x: number; y: number }, current: { x: number; y: number }, ratioN: number | null): NormalizedRect {
    let x = Math.min(start.x, current.x);
    let y = Math.min(start.y, current.y);
    let width = Math.abs(current.x - start.x);
    let height = Math.abs(current.y - start.y);
    if (ratioN && width > 0 && height > 0) {
        // 以拖拽幅度较大的边为主导，另一边按比例约束，锚定按下点
        if (height > width * ratioN) height = width * ratioN;
        else width = height / ratioN;
        x = current.x >= start.x ? start.x : start.x - width;
        y = current.y >= start.y ? start.y : start.y - height;
        // 边界 clamp（保持比例）
        if (x < 0) { x = 0; width = Math.min(height / ratioN, 1); }
        if (y < 0) { y = 0; height = Math.min(width * ratioN, 1); }
        if (x + width > 1) { width = 1 - x; height = width * ratioN; }
        if (y + height > 1) { height = 1 - y; width = height / ratioN; }
    }
    x = clamp(x, 0, 1);
    y = clamp(y, 0, 1);
    return { x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) };
}

function moveRect(rect: NormalizedRect, dx: number, dy: number): NormalizedRect {
    return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.width), y: clamp(rect.y + dy, 0, 1 - rect.height) };
}

function resizeRect(rect: NormalizedRect, dx: number, dy: number, handle: RectangleHandle, ratioN: number | null): NormalizedRect {
    const next = { ...rect };
    if (handle.includes("e")) next.width = rect.width + dx;
    if (handle.includes("s")) next.height = rect.height + dy;
    if (handle.includes("w")) {
        next.x = rect.x + dx;
        next.width = rect.width - dx;
    }
    if (handle.includes("n")) {
        next.y = rect.y + dy;
        next.height = rect.height - dy;
    }
    next.width = clamp(next.width, minRectSize, 1);
    next.height = clamp(next.height, minRectSize, 1);
    if (ratioN) {
        // 以变化更明显的边为主导，另一边按比例约束
        const drivenByWidth = handle.includes("e") || handle.includes("w") || (!handle.includes("n") && !handle.includes("s"));
        if (drivenByWidth) {
            next.height = clamp(next.width * ratioN, minRectSize, 1);
            next.width = next.height / ratioN;
        } else {
            next.width = clamp(next.height / ratioN, minRectSize, 1);
            next.height = next.width * ratioN;
        }
        if (handle.includes("w")) next.x = rect.x + rect.width - next.width;
        if (handle.includes("n")) next.y = rect.y + rect.height - next.height;
    }
    next.x = clamp(next.x, 0, 1 - next.width);
    next.y = clamp(next.y, 0, 1 - next.height);
    return next;
}

function toPixelRect(rect: NormalizedRect, width: number, height: number): CanvasImageMaskRect {
    const x = Math.round(rect.x * width);
    const y = Math.round(rect.y * height);
    return { x, y, width: Math.min(Math.round(rect.width * width), width - x), height: Math.min(Math.round(rect.height * height), height - y) };
}

function rectStyle(rect: NormalizedRect) {
    return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` };
}

function handleStyle(handle: RectangleHandle) {
    const top = handle.includes("n") ? "-6px" : handle.includes("s") ? "calc(100% - 6px)" : "calc(50% - 6px)";
    const left = handle.includes("w") ? "-6px" : handle.includes("e") ? "calc(100% - 6px)" : "calc(50% - 6px)";
    return { top, left, cursor: `${handle}-resize` };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
