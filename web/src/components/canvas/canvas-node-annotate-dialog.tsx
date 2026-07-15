import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button, Input, Modal, Segmented, Slider } from "antd";
import { ArrowUpRight, Brush, Eraser, RotateCcw, Square, Type, Undo2 } from "lucide-react";

import { flattenImageAnnotation } from "@/lib/canvas/canvas-image-annotation";
import { readImageMeta } from "@/lib/image-utils";

type Tool = "brush" | "rectangle" | "arrow" | "text" | "eraser";
type Point = { x: number; y: number };

export function CanvasNodeAnnotateDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (dataUrl: string) => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRef = useRef<{ active: boolean; start: Point; last: Point; snapshot?: ImageData } | null>(null);
    const historyRef = useRef<ImageData[]>([]);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [tool, setTool] = useState<Tool>("brush");
    const [color, setColor] = useState("#ef4444");
    const [size, setSize] = useState(12);
    const [text, setText] = useState("标注");

    useEffect(() => {
        if (!open) return;
        setTool("brush");
        historyRef.current = [];
        void readImageMeta(dataUrl).then((meta) => {
            setImage(meta);
            requestAnimationFrame(() => clearAnnotation(canvasRef.current));
        });
    }, [dataUrl, open]);

    const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget;
        const context = canvas.getContext("2d");
        if (!context) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = readPoint(canvas, event.clientX, event.clientY);
        historyRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
        if (historyRef.current.length > 30) historyRef.current.shift();
        if (tool === "text") {
            context.fillStyle = color;
            context.font = `600 ${Math.max(16, size * 2)}px sans-serif`;
            context.fillText(text.trim() || "标注", point.x, point.y);
            return;
        }
        drawRef.current = { active: true, start: point, last: point, snapshot: context.getImageData(0, 0, canvas.width, canvas.height) };
        if (tool === "brush" || tool === "eraser") drawStroke(context, point, point, color, size, tool === "eraser");
    };

    const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const state = drawRef.current;
        const canvas = event.currentTarget;
        const context = canvas.getContext("2d");
        if (!state?.active || !context) return;
        const point = readPoint(canvas, event.clientX, event.clientY);
        if (tool === "brush" || tool === "eraser") drawStroke(context, state.last, point, color, size, tool === "eraser");
        else if (state.snapshot) {
            context.putImageData(state.snapshot, 0, 0);
            if (tool === "rectangle") drawRectangle(context, state.start, point, color, size);
            if (tool === "arrow") drawArrow(context, state.start, point, color, size);
        }
        state.last = point;
    };

    const stop = () => {
        drawRef.current = null;
    };

    const undo = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        const previous = historyRef.current.pop();
        if (context && previous) context.putImageData(previous, 0, 0);
    };

    const confirm = async () => {
        const canvas = canvasRef.current;
        if (canvas) onConfirm(await flattenImageAnnotation(dataUrl, canvas));
    };

    return (
        <Modal title="图片标注" open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={1040} centered destroyOnHidden>
            <div className="grid gap-5 lg:grid-cols-[minmax(420px,1fr)_300px]">
                <div className="grid min-h-[480px] place-items-center rounded-lg border bg-stone-950 p-3">
                    <div className="relative inline-block max-w-full overflow-hidden"><img src={dataUrl} alt="" className="block max-h-[72vh] max-w-full object-contain" />{image ? <canvas ref={canvasRef} width={image.width} height={image.height} className="absolute inset-0 size-full cursor-crosshair touch-none" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /> : null}</div>
                </div>
                <div className="flex flex-col gap-5">
                    <Segmented block value={tool} options={[{ value: "brush", icon: <Brush className="size-4" />, label: "画笔" }, { value: "rectangle", icon: <Square className="size-4" />, label: "矩形" }, { value: "arrow", icon: <ArrowUpRight className="size-4" />, label: "箭头" }, { value: "text", icon: <Type className="size-4" />, label: "文字" }, { value: "eraser", icon: <Eraser className="size-4" />, label: "擦除" }]} onChange={(value) => setTool(value as Tool)} />
                    <div><div className="mb-2 text-sm font-medium">颜色</div><input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 w-full cursor-pointer" /></div>
                    <div><div className="mb-2 flex justify-between text-sm"><span>粗细</span><span>{size}px</span></div><Slider min={2} max={48} value={size} onChange={setSize} /></div>
                    {tool === "text" ? <Input value={text} placeholder="输入标注文字" onChange={(event) => setText(event.target.value)} /> : null}
                    <div className="flex gap-2"><Button block icon={<Undo2 className="size-4" />} onClick={undo}>撤销</Button><Button block icon={<RotateCcw className="size-4" />} onClick={() => { clearAnnotation(canvasRef.current); historyRef.current = []; }}>重置</Button></div>
                    <div className="mt-auto flex justify-end gap-2"><Button onClick={onClose}>取消</Button><Button type="primary" onClick={() => void confirm()}>生成标注图</Button></div>
                </div>
            </div>
        </Modal>
    );
}

function readPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * canvas.width, y: (clientY - rect.top) / rect.height * canvas.height };
}

function clearAnnotation(canvas: HTMLCanvasElement | null) {
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawStroke(context: CanvasRenderingContext2D, from: Point, to: Point, color: string, size: number, erase: boolean) {
    context.save();
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.strokeStyle = color;
    context.lineWidth = size;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
}

function drawRectangle(context: CanvasRenderingContext2D, start: Point, end: Point, color: string, size: number) {
    context.strokeStyle = color;
    context.lineWidth = size;
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
}

function drawArrow(context: CanvasRenderingContext2D, start: Point, end: Point, color: string, size: number) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = Math.max(16, size * 2.5);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = size;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
    context.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();
}
