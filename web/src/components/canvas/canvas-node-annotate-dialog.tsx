import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Button, Input, Modal, Segmented, Slider } from "antd";
import { ArrowUpRight, Brush, Crop, Eraser, RotateCcw, Square, Type, Undo2 } from "lucide-react";

import { createTextObject, findTextObjectAt, flattenAnnotation, measureTextObject, type AnnotationTextObject } from "@/lib/canvas/canvas-annotation-text";
import { readImageMeta } from "@/lib/image-utils";

type Tool = "brush" | "rectangle" | "arrow" | "text" | "eraser";
type Point = { x: number; y: number };
type HistorySnapshot = { image: ImageData; texts: AnnotationTextObject[] };
type TextDrag = { id: string; mode: "move" | "resize"; startX: number; startY: number; originX: number; originY: number; originFontSize: number; moved: boolean };
type TextEditing = { id: string | null; x: number; y: number; value: string };

const maxHistory = 30;

export function CanvasNodeAnnotateDialog({ dataUrl, open, onClose, onConfirm, onConfirmAndCrop }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (dataUrl: string) => void; onConfirmAndCrop?: (dataUrl: string) => void }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRef = useRef<{ active: boolean; start: Point; last: Point; snapshot?: ImageData } | null>(null);
    const textDragRef = useRef<TextDrag | null>(null);
    const historyRef = useRef<HistorySnapshot[]>([]);
    const textsRef = useRef<AnnotationTextObject[]>([]);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [tool, setTool] = useState<Tool>("brush");
    const [color, setColor] = useState("#ef4444");
    const [size, setSize] = useState(12);
    const [texts, setTexts] = useState<AnnotationTextObject[]>([]);
    const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
    const [editing, setEditing] = useState<TextEditing | null>(null);
    const [contextTextId, setContextTextId] = useState<{ id: string; x: number; y: number } | null>(null);
    const [scale, setScale] = useState(1);
    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

    textsRef.current = texts;
    const selectedText = texts.find((item) => item.id === selectedTextId) || null;
    const defaultFontSize = Math.round(Math.max(18, size * 3));

    useEffect(() => {
        if (!open) return;
        setTool("brush");
        setTexts([]);
        setSelectedTextId(null);
        setEditing(null);
        setContextTextId(null);
        historyRef.current = [];
        void readImageMeta(dataUrl).then((meta) => {
            setImage(meta);
            requestAnimationFrame(() => clearAnnotation(canvasRef.current));
        });
    }, [dataUrl, open]);

    useLayoutEffect(() => {
        if (!open || !image) return;
        const measure = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width) setScale(rect.width / canvas.width);
        };
        measure();
        // Modal 打开动画使用 transform 缩放，动画结束后再校准一次
        const timer = window.setTimeout(measure, 400);
        const observer = new ResizeObserver(measure);
        if (wrapRef.current) observer.observe(wrapRef.current);
        return () => {
            window.clearTimeout(timer);
            observer.disconnect();
        };
    }, [open, image]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (editing) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            if ((event.key === "Delete" || event.key === "Backspace") && selectedTextId) {
                event.preventDefault();
                deleteText(selectedTextId);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, editing, selectedTextId]);

    const pushHistory = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        historyRef.current.push({ image: context.getImageData(0, 0, canvas.width, canvas.height), texts: texts.map((item) => ({ ...item })) });
        if (historyRef.current.length > maxHistory) historyRef.current.shift();
    };

    const undo = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        const previous = historyRef.current.pop();
        if (!context || !previous) return;
        context.putImageData(previous.image, 0, 0);
        setTexts(previous.texts.map((item) => ({ ...item })));
        setSelectedTextId((current) => (previous.texts.some((item) => item.id === current) ? current : null));
    };

    const reset = () => {
        pushHistory();
        clearAnnotation(canvasRef.current);
        setTexts([]);
        setSelectedTextId(null);
        setEditing(null);
    };

    const deleteText = (id: string) => {
        pushHistory();
        setTexts((current) => current.filter((item) => item.id !== id));
        setSelectedTextId((current) => (current === id ? null : current));
        setContextTextId(null);
    };

    const commitEditing = (value: string) => {
        const trimmed = value.trim();
        const target = editing;
        setEditing(null);
        if (!target) return;
        pushHistory();
        if (target.id) {
            if (!trimmed) {
                setTexts((current) => current.filter((item) => item.id !== target.id));
                setSelectedTextId((current) => (current === target.id ? null : current));
                return;
            }
            setTexts((current) => current.map((item) => (item.id === target.id ? { ...item, content: trimmed, color, fontSize: item.fontSize || defaultFontSize } : item)));
            setSelectedTextId(target.id);
            return;
        }
        if (!trimmed) return;
        const created = createTextObject({ content: trimmed, x: target.x, y: target.y, color, fontSize: defaultFontSize });
        setTexts((current) => [...current, created]);
        setSelectedTextId(created.id);
    };

    const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = event.currentTarget;
        const context = canvas.getContext("2d");
        if (!context || tool === "text") return;
        canvas.setPointerCapture(event.pointerId);
        const point = readPoint(canvas, event.clientX, event.clientY);
        pushHistory();
        drawRef.current = { active: true, start: point, last: point, snapshot: context.getImageData(0, 0, canvas.width, canvas.height) };
        if (tool === "brush" || tool === "eraser") drawStroke(context, point, point, color, size, tool === "eraser");
    };

    const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (tool === "brush" || tool === "eraser") setCursor({ x: event.clientX, y: event.clientY });
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

    const textLayerPoint = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        return readPoint(canvas, clientX, clientY);
    };

    const startTextInteraction = (event: ReactPointerEvent<HTMLElement>) => {
        if (tool !== "text" || event.button !== 0) return;
        const context = canvasRef.current?.getContext("2d");
        if (!context) return;
        const point = textLayerPoint(event.clientX, event.clientY);
        const hit = findTextObjectAt(context, textsRef.current, point.x, point.y);
        setContextTextId(null);
        if (!hit) {
            setSelectedTextId(null);
            setEditing({ id: null, x: point.x, y: point.y, value: "" });
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelectedTextId(hit.id);
        textDragRef.current = { id: hit.id, mode: "move", startX: point.x, startY: point.y, originX: hit.x, originY: hit.y, originFontSize: hit.fontSize, moved: false };
    };

    const startResize = (event: ReactPointerEvent<HTMLElement>) => {
        if (!selectedText) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = textLayerPoint(event.clientX, event.clientY);
        pushHistory();
        textDragRef.current = { id: selectedText.id, mode: "resize", startX: point.x, startY: point.y, originX: selectedText.x, originY: selectedText.y, originFontSize: selectedText.fontSize, moved: true };
    };

    const moveTextInteraction = (event: ReactPointerEvent<HTMLElement>) => {
        const drag = textDragRef.current;
        if (!drag) return;
        const point = textLayerPoint(event.clientX, event.clientY);
        if (drag.mode === "move") {
            const dx = point.x - drag.startX;
            const dy = point.y - drag.startY;
            if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
                drag.moved = true;
                pushHistory();
            }
            if (!drag.moved) return;
            setTexts((current) => current.map((item) => (item.id === drag.id ? { ...item, x: drag.originX + dx, y: drag.originY + dy } : item)));
            return;
        }
        const ratio = 1 + (point.x - drag.startX + (point.y - drag.startY)) / 200;
        const nextSize = Math.max(8, Math.round(drag.originFontSize * ratio));
        setTexts((current) => current.map((item) => (item.id === drag.id ? { ...item, fontSize: nextSize } : item)));
    };

    const stopTextInteraction = () => {
        textDragRef.current = null;
    };

    const editSelectedText = () => {
        if (!selectedText) return;
        setEditing({ id: selectedText.id, x: selectedText.x, y: selectedText.y, value: selectedText.content });
    };

    const confirm = async (thenCrop: boolean) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const result = await flattenAnnotation(dataUrl, canvas, texts);
        if (thenCrop && onConfirmAndCrop) onConfirmAndCrop(result);
        else onConfirm(result);
    };

    const context = canvasRef.current?.getContext("2d") || null;
    const transformBox = context && selectedText ? measureTextObject(context, selectedText) : null;
    const cursorSize = (tool === "eraser" ? size * 2 : size) * scale;

    return (
        <Modal title="图片标注" open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={1040} centered destroyOnHidden>
            <div className="grid gap-5 lg:grid-cols-[minmax(420px,1fr)_300px]">
                <div className="grid min-h-[480px] place-items-center rounded-lg border bg-stone-950 p-3">
                    <div ref={wrapRef} className="relative inline-block max-w-full overflow-hidden" onPointerLeave={() => setCursor(null)}>
                        <img src={dataUrl} alt="" className="block max-h-[72vh] max-w-full object-contain" />
                        {image ? (
                            <canvas
                                ref={canvasRef}
                                width={image.width}
                                height={image.height}
                                className={`absolute inset-0 size-full touch-none ${tool === "text" ? "cursor-text" : tool === "brush" || tool === "eraser" ? "cursor-none" : "cursor-crosshair"}`}
                                style={{ pointerEvents: tool === "text" ? "none" : "auto" }}
                                onPointerDown={start}
                                onPointerMove={move}
                                onPointerUp={stop}
                                onPointerCancel={stop}
                            />
                        ) : null}
                        {image ? (
                            <div className="pointer-events-none absolute inset-0 size-full overflow-hidden">
                                {texts.map((item) => (
                                    <span
                                        key={item.id}
                                        className="absolute -translate-y-1/2 whitespace-pre select-none"
                                        style={{ left: `${item.x * scale}px`, top: `${item.y * scale}px`, fontSize: `${item.fontSize * scale}px`, fontFamily: item.fontFamily, fontWeight: 600, color: item.color, lineHeight: 1 }}
                                    >
                                        {item.content}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        {image && tool === "text" ? (
                            <div
                                className="absolute inset-0 size-full cursor-text touch-none"
                                onPointerDown={startTextInteraction}
                                onPointerMove={moveTextInteraction}
                                onPointerUp={stopTextInteraction}
                                onPointerCancel={stopTextInteraction}
                                onDoubleClick={(event) => {
                                    const ctx = canvasRef.current?.getContext("2d");
                                    if (!ctx) return;
                                    const point = textLayerPoint(event.clientX, event.clientY);
                                    const hit = findTextObjectAt(ctx, textsRef.current, point.x, point.y);
                                    if (hit) setEditing({ id: hit.id, x: hit.x, y: hit.y, value: hit.content });
                                    else setEditing({ id: null, x: point.x, y: point.y, value: "" });
                                }}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    const ctx = canvasRef.current?.getContext("2d");
                                    if (!ctx) return;
                                    const point = textLayerPoint(event.clientX, event.clientY);
                                    const hit = findTextObjectAt(ctx, textsRef.current, point.x, point.y);
                                    const box = wrapRef.current?.getBoundingClientRect();
                                    if (hit && box) {
                                        setSelectedTextId(hit.id);
                                        setContextTextId({ id: hit.id, x: event.clientX - box.left, y: event.clientY - box.top });
                                    } else {
                                        setContextTextId(null);
                                    }
                                }}
                            >
                                {selectedText && transformBox ? (
                                    <div
                                        className="pointer-events-none absolute border border-dashed border-sky-400"
                                        style={{ left: `${selectedText.x * scale}px`, top: `${(selectedText.y - transformBox.height / 2) * scale}px`, width: `${transformBox.width * scale}px`, height: `${transformBox.height * scale}px` }}
                                    >
                                        <span
                                            className="pointer-events-auto absolute size-3 cursor-nwse-resize rounded-full border border-white bg-sky-500"
                                            style={{ right: -6, bottom: -6 }}
                                            onPointerDown={startResize}
                                            onPointerMove={moveTextInteraction}
                                            onPointerUp={stopTextInteraction}
                                            onDoubleClick={editSelectedText}
                                        />
                                    </div>
                                ) : null}
                                {contextTextId ? (
                                    <div className="pointer-events-auto absolute z-10 min-w-24 rounded-md border bg-white py-1 text-sm shadow-lg dark:bg-stone-800" style={{ left: contextTextId.x, top: contextTextId.y }} onPointerDown={(event) => event.stopPropagation()}>
                                        <button type="button" className="block w-full px-4 py-1.5 text-left text-[#ef4444] hover:bg-black/5 dark:hover:bg-white/10" onClick={() => deleteText(contextTextId.id)}>
                                            删除文字
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        {editing && image ? (
                            <div key={`${editing.id || "new"}-${editing.x}-${editing.y}`} className="absolute z-20 flex items-center gap-1 rounded-md bg-white/95 p-1 shadow-lg dark:bg-stone-800/95" style={editorStyle(editing, scale, image)} onPointerDown={(event) => event.stopPropagation()}>
                                <Input
                                    autoFocus
                                    size="small"
                                    defaultValue={editing.value}
                                    placeholder="输入文字"
                                    style={{ width: 180 }}
                                    onPressEnter={(event) => commitEditing((event.target as HTMLInputElement).value)}
                                    onBlur={(event) => commitEditing(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Escape") {
                                            event.stopPropagation();
                                            setEditing(null);
                                        }
                                    }}
                                />
                            </div>
                        ) : null}
                        {cursor && (tool === "brush" || tool === "eraser") && wrapRef.current ? (
                            <span
                                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                                style={{ left: cursor.x - wrapRef.current.getBoundingClientRect().left, top: cursor.y - wrapRef.current.getBoundingClientRect().top, width: cursorSize, height: cursorSize, backgroundColor: tool === "eraser" ? "rgba(255,255,255,.35)" : hexToRgba(color, 0.4), border: tool === "eraser" ? "1px dashed rgba(255,120,120,.9)" : `2px solid ${color}` }}
                            />
                        ) : null}
                    </div>
                </div>
                <div className="flex flex-col gap-5">
                    <Segmented block value={tool} options={[{ value: "brush", icon: <Brush className="size-4" />, label: "画笔" }, { value: "rectangle", icon: <Square className="size-4" />, label: "矩形" }, { value: "arrow", icon: <ArrowUpRight className="size-4" />, label: "箭头" }, { value: "text", icon: <Type className="size-4" />, label: "文字" }, { value: "eraser", icon: <Eraser className="size-4" />, label: "擦除" }]} onChange={(value) => { setTool(value as Tool); setContextTextId(null); if (value !== "text") setSelectedTextId(null); }} />
                    <div><div className="mb-2 text-sm font-medium">颜色</div><input type="color" value={color} onChange={(event) => { setColor(event.target.value); if (selectedTextId) setTexts((current) => current.map((item) => (item.id === selectedTextId ? { ...item, color: event.target.value } : item))); }} className="h-10 w-full cursor-pointer" /></div>
                    <div><div className="mb-2 flex justify-between text-sm"><span>{tool === "text" ? "字号" : "粗细"}</span><span>{tool === "text" && selectedText ? `${selectedText.fontSize}px` : `${size}px`}</span></div><Slider min={2} max={48} value={size} onChange={(value) => { setSize(value); if (selectedTextId) setTexts((current) => current.map((item) => (item.id === selectedTextId ? { ...item, fontSize: Math.round(Math.max(18, value * 3)) } : item))); }} /></div>
                    {tool === "text" ? <div className="rounded-md border border-dashed px-3 py-2 text-xs leading-relaxed opacity-70">单击空白处添加文字，双击文字可重新编辑，拖拽可移动，右键或选中后按 Delete 删除，拖拽右下角手柄调整字号。</div> : null}
                    <div className="flex gap-2"><Button block icon={<Undo2 className="size-4" />} onClick={undo}>撤销</Button><Button block icon={<RotateCcw className="size-4" />} onClick={reset}>重置</Button></div>
                    <div className="mt-auto flex justify-end gap-2">
                        <Button onClick={onClose}>取消</Button>
                        {onConfirmAndCrop ? <Button icon={<Crop className="size-4" />} onClick={() => void confirm(true)}>确认并裁剪</Button> : null}
                        <Button type="primary" onClick={() => void confirm(false)}>生成标注图</Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function editorStyle(editing: TextEditing, scale: number, image: { width: number; height: number }): CSSProperties {
    const left = Math.min(Math.max(0, editing.x * scale), image.width * scale - 60);
    const top = Math.max(0, editing.y * scale - 44);
    return { left: `${left}px`, top: `${top}px` };
}

function hexToRgba(hex: string, alpha: number) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!match) return hex;
    return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${alpha})`;
}

function readPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * canvas.width, y: ((clientY - rect.top) / rect.height) * canvas.height };
}

function clearAnnotation(canvas: HTMLCanvasElement | null) {
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawStroke(context: CanvasRenderingContext2D, from: Point, to: Point, color: string, size: number, erase: boolean) {
    context.save();
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.strokeStyle = color;
    context.lineWidth = erase ? size * 2 : size;
    context.lineCap = "round";
    context.lineJoin = "round";
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
