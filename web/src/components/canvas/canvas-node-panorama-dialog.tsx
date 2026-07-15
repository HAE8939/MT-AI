import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { Button, Modal, Switch } from "antd";
import { RotateCcw } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type ViewState = { longitude: number; latitude: number; fov: number };
type DragState = { pointerId: number; x: number; y: number; longitude: number; latitude: number } | null;

const INITIAL_VIEW: ViewState = { longitude: 0, latitude: 0, fov: 70 };

export function CanvasNodePanoramaDialog({ image, open, onClose }: { image: { title: string; url: string; width?: number; height?: number } | null; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<ViewState>({ ...INITIAL_VIEW });
    const dragRef = useRef<DragState>(null);
    const cameraRef = useRef<{ fov: number; updateProjectionMatrix: () => void } | null>(null);
    const [autoRotate, setAutoRotate] = useState(true);
    const autoRotateRef = useRef(true);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    useEffect(() => {
        autoRotateRef.current = autoRotate;
    }, [autoRotate]);

    useEffect(() => {
        const container = containerRef.current;
        if (!open || !image?.url || !container) return;
        let disposed = false;
        let animationFrame = 0;
        let resizeObserver: ResizeObserver | null = null;
        let renderer: import("three").WebGLRenderer | null = null;
        let geometry: import("three").SphereGeometry | null = null;
        let material: import("three").MeshBasicMaterial | null = null;
        let texture: import("three").Texture | null = null;
        setStatus("loading");

        void (async () => {
            try {
                const THREE = await import("three");
                if (disposed) return;
                renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.setClearColor(0x050505, 1);
                renderer.domElement.className = "block size-full";
                container.replaceChildren(renderer.domElement);

                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera(viewRef.current.fov, 1, 1, 1100);
                cameraRef.current = camera;
                geometry = new THREE.SphereGeometry(500, 72, 48);
                geometry.scale(-1, 1, 1);
                texture = await new THREE.TextureLoader().loadAsync(image.url);
                if (disposed) {
                    texture.dispose();
                    return;
                }
                texture.colorSpace = THREE.SRGBColorSpace;
                material = new THREE.MeshBasicMaterial({ map: texture });
                scene.add(new THREE.Mesh(geometry, material));

                const resize = () => {
                    if (!renderer) return;
                    const width = Math.max(1, container.clientWidth);
                    const height = Math.max(1, container.clientHeight);
                    renderer.setSize(width, height, false);
                    camera.aspect = width / height;
                    camera.updateProjectionMatrix();
                };
                resizeObserver = new ResizeObserver(resize);
                resizeObserver.observe(container);
                resize();
                setStatus("ready");

                const target = new THREE.Vector3();
                const animate = () => {
                    if (disposed || !renderer) return;
                    if (autoRotateRef.current && !dragRef.current) viewRef.current.longitude += 0.025;
                    const latitude = Math.max(-85, Math.min(85, viewRef.current.latitude));
                    const phi = THREE.MathUtils.degToRad(90 - latitude);
                    const theta = THREE.MathUtils.degToRad(viewRef.current.longitude);
                    target.set(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta));
                    camera.lookAt(target);
                    renderer.render(scene, camera);
                    animationFrame = requestAnimationFrame(animate);
                };
                animate();
            } catch {
                if (!disposed) setStatus("error");
            }
        })();

        return () => {
            disposed = true;
            cancelAnimationFrame(animationFrame);
            resizeObserver?.disconnect();
            cameraRef.current = null;
            texture?.dispose();
            material?.dispose();
            geometry?.dispose();
            renderer?.dispose();
            renderer?.forceContextLoss();
            container.replaceChildren();
        };
    }, [image?.url, open]);

    const resetView = () => {
        viewRef.current = { ...INITIAL_VIEW };
        if (cameraRef.current) {
            cameraRef.current.fov = INITIAL_VIEW.fov;
            cameraRef.current.updateProjectionMatrix();
        }
    };

    const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, longitude: viewRef.current.longitude, latitude: viewRef.current.latitude };
        setAutoRotate(false);
    };

    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        viewRef.current.longitude = drag.longitude - (event.clientX - drag.x) * 0.12;
        viewRef.current.latitude = Math.max(-85, Math.min(85, drag.latitude + (event.clientY - drag.y) * 0.12));
    };

    const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        const camera = cameraRef.current;
        if (!camera) return;
        viewRef.current.fov = Math.max(30, Math.min(100, viewRef.current.fov + event.deltaY * 0.04));
        camera.fov = viewRef.current.fov;
        camera.updateProjectionMatrix();
    };

    const ratio = image?.width && image?.height ? image.width / image.height : null;
    const distorted = ratio ? Math.abs(ratio - 2) > 0.08 : false;

    return (
        <Modal title={image?.title ? `全景查看 · ${image.title}` : "全景查看"} open={open && Boolean(image?.url)} onCancel={onClose} footer={null} width="calc(100vw - 48px)" centered destroyOnHidden styles={{ body: { padding: 0 } }}>
            <div className="relative h-[min(78vh,820px)] min-h-[440px] overflow-hidden bg-neutral-950" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onWheel={handleWheel}>
                <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
                {status === "loading" ? <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-white/55">正在加载全景场景...</div> : null}
                {status === "error" ? <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-red-300">图片或 WebGL 场景加载失败</div> : null}
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-md bg-black/55 px-3 py-2 text-xs text-white/75 backdrop-blur">
                    <span>自动旋转</span>
                    <Switch size="small" checked={autoRotate} onChange={setAutoRotate} />
                    <Button type="text" size="small" className="!text-white/75" icon={<RotateCcw className="size-3.5" />} onClick={resetView} aria-label="重置视角" />
                </div>
                {distorted ? <div className="pointer-events-none absolute right-4 top-4 rounded-md bg-amber-500/85 px-3 py-2 text-xs font-medium text-black">当前图片不是标准 2:1，全景投影可能变形</div> : null}
                <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/55">拖动旋转视角 · 滚轮调整视野</div>
            </div>
            <div className="px-4 py-2 text-xs" style={{ color: theme.node.muted, background: theme.node.panel }}>标准全景图建议使用 2:1 等距柱状投影。</div>
        </Modal>
    );
}
