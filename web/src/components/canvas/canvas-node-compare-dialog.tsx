import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject, WheelEvent as ReactWheelEvent } from "react";
import { Button, Modal } from "antd";
import { Columns2, Maximize2, Minimize2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CompareTransform = { scale: number; x: number; y: number };
type DragState = { mode: "pan" | "slider"; pointerId: number; x: number; y: number; originX: number; originY: number } | null;

const INITIAL_TRANSFORM: CompareTransform = { scale: 1, x: 0, y: 0 };

export function CanvasNodeCompareDialog({ images, open, onClose }: { images: Array<{ id: string; title: string; url: string }>; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const viewportRef = useRef<HTMLDivElement>(null);
    const bottomWorldRef = useRef<HTMLDivElement>(null);
    const topWorldRef = useRef<HTMLDivElement>(null);
    const topLayerRef = useRef<HTMLDivElement>(null);
    const dividerRef = useRef<HTMLDivElement>(null);
    const transformRef = useRef<CompareTransform>({ ...INITIAL_TRANSFORM });
    const dividerPercentRef = useRef(50);
    const dragRef = useRef<DragState>(null);
    const [fullscreen, setFullscreen] = useState(false);

    const applyTransform = useCallback(() => {
        const { scale, x, y } = transformRef.current;
        const transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        if (bottomWorldRef.current) bottomWorldRef.current.style.transform = transform;
        if (topWorldRef.current) topWorldRef.current.style.transform = transform;
    }, []);

    const applyDivider = useCallback((percent: number) => {
        const value = Math.max(0, Math.min(100, percent));
        dividerPercentRef.current = value;
        if (topLayerRef.current) topLayerRef.current.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
        if (dividerRef.current) dividerRef.current.style.left = `${value}%`;
    }, []);

    const resetView = useCallback(() => {
        transformRef.current = { ...INITIAL_TRANSFORM };
        applyTransform();
        applyDivider(50);
    }, [applyDivider, applyTransform]);

    useEffect(() => {
        if (open) {
            setFullscreen(false);
            requestAnimationFrame(resetView);
        }
    }, [open, resetView]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.isContentEditable)) return;
            if ((event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                setFullscreen((value) => !value);
                return;
            }
            if (event.key === "Escape" && fullscreen) {
                event.preventDefault();
                event.stopPropagation();
                setFullscreen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [fullscreen, open]);

    useEffect(() => {
        if (!open) return;
        requestAnimationFrame(() => {
            applyTransform();
            applyDivider(dividerPercentRef.current);
        });
    }, [applyDivider, applyTransform, fullscreen, open]);

    useEffect(() => {
        if (!open) return;
        const onPointerMove = (event: PointerEvent) => {
            const drag = dragRef.current;
            const viewport = viewportRef.current;
            if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
            if (drag.mode === "slider") {
                const rect = viewport.getBoundingClientRect();
                applyDivider(((event.clientX - rect.left) / rect.width) * 100);
                return;
            }
            transformRef.current.x = drag.originX + event.clientX - drag.x;
            transformRef.current.y = drag.originY + event.clientY - drag.y;
            applyTransform();
        };
        const onPointerUp = (event: PointerEvent) => {
            if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        };
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
        return () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        };
    }, [applyDivider, applyTransform, open]);

    const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || event.target instanceof Element && event.target.closest("[data-compare-divider]")) return;
        event.preventDefault();
        dragRef.current = { mode: "pan", pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: transformRef.current.x, originY: transformRef.current.y };
    };

    const startDivider = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragRef.current = { mode: "slider", pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: 0, originY: 0 };
    };

    const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        const viewport = viewportRef.current;
        if (!viewport) return;
        const current = transformRef.current;
        const nextScale = Math.max(0.2, Math.min(10, current.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
        const rect = viewport.getBoundingClientRect();
        const mouseX = event.clientX - rect.left - rect.width / 2;
        const mouseY = event.clientY - rect.top - rect.height / 2;
        const ratio = nextScale / current.scale;
        transformRef.current = {
            scale: nextScale,
            x: mouseX * (1 - ratio) + current.x * ratio,
            y: mouseY * (1 - ratio) + current.y * ratio,
        };
        applyTransform();
    };

    const [first, second] = images;

    return (
        <Modal
            title={
                <div className="flex items-center gap-2 pr-8">
                    <span>图片对比</span>
                    <Button
                        type="text"
                        size="small"
                        icon={fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                        onClick={() => setFullscreen((value) => !value)}
                        aria-label={fullscreen ? "退出全屏" : "全屏"}
                        title={fullscreen ? "退出全屏 (F)" : "全屏 (F)"}
                    />
                </div>
            }
            open={open && images.length === 2}
            onCancel={onClose}
            footer={null}
            width={fullscreen ? "100vw" : "calc(100vw - 48px)"}
            centered
            destroyOnHidden
            style={fullscreen ? { top: 0, maxWidth: "100vw", paddingBottom: 0 } : undefined}
            styles={
                fullscreen
                    ? {
                          container: { height: "100vh", maxHeight: "100vh", padding: 0, borderRadius: 0, display: "flex", flexDirection: "column" as const },
                          header: { padding: "12px 16px", marginBottom: 0 },
                          body: { padding: 0, display: "flex" as const, flexDirection: "column" as const, flex: 1, minHeight: 0 },
                      }
                    : { body: { padding: 0 } }
            }
        >
            <div
                ref={viewportRef}
                className={`relative select-none overflow-hidden bg-neutral-950 ${fullscreen ? "min-h-0 flex-1" : "h-[min(78vh,820px)] min-h-[420px]"}`}
                onPointerDown={startPan}
                onWheel={handleWheel}
                onDoubleClick={resetView}
            >
                <CompareLayer worldRef={bottomWorldRef} image={first} />
                <div ref={topLayerRef} className="pointer-events-none absolute inset-0" style={{ clipPath: "inset(0 50% 0 0)" }}>
                    <CompareLayer worldRef={topWorldRef} image={second} />
                </div>
                <div ref={dividerRef} data-compare-divider className="absolute inset-y-0 z-20 w-px -translate-x-1/2 cursor-ew-resize bg-white/90" style={{ left: "50%" }} onPointerDown={startDivider}>
                    <div className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-black/65 text-white shadow-xl backdrop-blur">
                        <Columns2 className="size-4" />
                    </div>
                </div>
                <CompareLabel align="left" title={first?.title || "图片 1"} />
                <CompareLabel align="right" title={second?.title || "图片 2"} />
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 text-xs text-white/55">拖动分隔线对比 · 滚轮缩放 · 拖动画面平移 · 双击重置</div>
            </div>
            <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ color: theme.node.muted, background: theme.node.panel }}>
                <span className="truncate">左侧：{first?.title || "图片 1"}</span>
                <span className="truncate text-right">右侧：{second?.title || "图片 2"}</span>
            </div>
        </Modal>
    );
}

function CompareLayer({ worldRef, image }: { worldRef: RefObject<HTMLDivElement | null>; image?: { title: string; url: string } }) {
    return (
        <div ref={worldRef} className="absolute inset-0 will-change-transform" style={{ transformOrigin: "50% 50%" }}>
            {image ? <img src={image.url} alt={image.title} draggable={false} className="size-full object-contain" /> : null}
        </div>
    );
}

function CompareLabel({ align, title }: { align: "left" | "right"; title: string }) {
    return <div className={`pointer-events-none absolute top-4 z-30 max-w-[40%] truncate rounded-md bg-black/55 px-2.5 py-1.5 text-xs text-white/85 backdrop-blur ${align === "left" ? "left-4" : "right-4"}`}>{title}</div>;
}
