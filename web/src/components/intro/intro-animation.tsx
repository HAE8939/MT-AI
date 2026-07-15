import { useEffect, useRef, useState } from "react";

export const INTRO_SEEN_KEY = "infinite-canvas:intro_seen";

const INTRO_TEXT = "无限画布";
const PHASE_FALL_MS = 900;
const INTRO_DURATION_MS = 2600;
const FADE_MS = 500;
const MOUSE_RADIUS = 110;

type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    originX: number;
    originY: number;
    alpha: number;
    size: number;
    gravity: number;
    bounce: number;
    friction: number;
    ease: number;
    falling: boolean;
    bounceCount: number;
};

function markIntroSeen() {
    try {
        window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
        // 隐私模式下 localStorage 不可用时忽略
    }
}

/** 离屏绘制文字并按网格采样出粒子目标点（坐标为 CSS 像素） */
function sampleTextPoints(text: string, viewW: number, viewH: number) {
    const scale = Math.min(1200 / viewW, 700 / viewH, 1);
    const sampleW = Math.ceil(viewW * scale);
    const sampleH = Math.ceil(viewH * scale);
    const off = document.createElement("canvas");
    off.width = sampleW;
    off.height = sampleH;
    const oc = off.getContext("2d");
    if (!oc) return { points: [] as { x: number; y: number }[], gap: 4 };

    const fontSize = Math.min(viewW * 0.18, viewH * 0.3, 200);
    oc.fillStyle = "#000";
    oc.fillRect(0, 0, sampleW, sampleH);
    oc.fillStyle = "#fff";
    oc.font = `900 ${fontSize * scale}px "PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif`;
    oc.textAlign = "center";
    oc.textBaseline = "middle";
    oc.fillText(text, sampleW / 2, sampleH * 0.46);

    const data = oc.getImageData(0, 0, sampleW, sampleH).data;
    const gap = Math.max(3, Math.floor(viewW / 180));
    const step = gap * scale;
    const points: { x: number; y: number }[] = [];
    for (let y = 0; y < sampleH; y += step) {
        for (let x = 0; x < sampleW; x += step) {
            const idx = (Math.floor(y) * sampleW + Math.floor(x)) * 4;
            if (data[idx] > 128) {
                points.push({ x: x / scale, y: y / scale });
            }
        }
    }
    return { points, gap };
}

function createParticles(viewW: number, viewH: number): Particle[] {
    const { points, gap } = sampleTextPoints(INTRO_TEXT, viewW, viewH);
    return points.map((p) => ({
        x: p.x + (Math.random() - 0.5) * viewW * 0.1,
        y: -10 - Math.random() * viewH * 0.35,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.5 + Math.random() * 1.2,
        originX: p.x,
        originY: p.y,
        alpha: 0.4 + Math.random() * 0.6,
        size: Math.max(1, gap * 0.28),
        gravity: 0.2 + Math.random() * 0.15,
        bounce: 0.4 + Math.random() * 0.25,
        friction: 0.85 + Math.random() * 0.05,
        ease: 0.06 + Math.random() * 0.08,
        falling: true,
        bounceCount: 0,
    }));
}

/**
 * 开屏粒子动画：粒子下落弹跳后聚合成「无限画布」，支持鼠标斥力与点击跳过。
 * 仅首次访问播放（localStorage 记录），且遵守 prefers-reduced-motion。
 */
export default function IntroAnimation() {
    const [status, setStatus] = useState<"playing" | "fading" | "done">(() => {
        if (typeof window === "undefined") return "done";
        try {
            if (window.localStorage.getItem(INTRO_SEEN_KEY)) return "done";
        } catch {
            return "done";
        }
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "done";
        return "playing";
    });
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: -9999, y: -9999 });
    const endedRef = useRef(false);
    const fadeStartedRef = useRef(false);
    const beginFadeRef = useRef(() => {});

    useEffect(() => {
        if (status === "done") return;
        markIntroSeen();
    }, [status]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (status === "done" || !canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            setStatus("done");
            return;
        }

        endedRef.current = false;
        fadeStartedRef.current = false;
        let particles: Particle[] = [];
        let rafId = 0;
        let fadeTimer = 0;
        let resizeTimer = 0;
        let viewW = 0;
        let viewH = 0;
        let frameCount = 0;
        const startTime = performance.now();

        const setupCanvas = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            viewW = window.innerWidth;
            viewH = window.innerHeight;
            canvas.width = viewW * dpr;
            canvas.height = viewH * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            particles = createParticles(viewW, viewH);
        };

        const beginFade = () => {
            if (fadeStartedRef.current) return;
            fadeStartedRef.current = true;
            setStatus("fading");
            fadeTimer = window.setTimeout(() => {
                endedRef.current = true;
                setStatus("done");
            }, FADE_MS);
        };
        beginFadeRef.current = beginFade;

        const animate = (now: number) => {
            if (endedRef.current) return;
            rafId = requestAnimationFrame(animate);
            if (document.hidden) return;

            const elapsed = now - startTime;
            if (elapsed >= INTRO_DURATION_MS) beginFade();

            const mouse = mouseRef.current;
            const applyMouse = frameCount++ % 2 === 0;
            const inFallPhase = elapsed < PHASE_FALL_MS;
            const groundY = viewH * 0.46;

            ctx.clearRect(0, 0, viewW, viewH);
            for (const p of particles) {
                if (applyMouse) {
                    const dx = mouse.x - p.x;
                    const dy = mouse.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < MOUSE_RADIUS && dist > 0.1) {
                        const f = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
                        p.vx -= (dx / dist) * f * 8;
                        p.vy -= (dy / dist) * f * 8;
                    }
                }

                if (inFallPhase && p.falling) {
                    p.vy += p.gravity;
                    p.x += p.vx;
                    p.y += p.vy;
                    if (p.y >= groundY) {
                        p.y = groundY;
                        p.bounceCount++;
                        if (p.bounceCount <= 2) {
                            p.vy = -Math.abs(p.vy) * p.bounce;
                            p.vx *= 0.7;
                        } else {
                            p.falling = false;
                        }
                    }
                } else {
                    p.vx += (p.originX - p.x) * p.ease;
                    p.vy += (p.originY - p.y) * p.ease;
                    p.vx *= p.friction;
                    p.vy *= p.friction;
                    p.x += p.vx;
                    p.y += p.vy;
                }

                ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
                ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
            }
        };

        const handleResize = () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                if (window.innerWidth !== viewW || window.innerHeight !== viewH) setupCanvas();
            }, 200);
        };

        setupCanvas();
        rafId = requestAnimationFrame(animate);
        window.addEventListener("resize", handleResize);

        return () => {
            endedRef.current = true;
            cancelAnimationFrame(rafId);
            window.clearTimeout(fadeTimer);
            window.clearTimeout(resizeTimer);
            window.removeEventListener("resize", handleResize);
        };
        // 动画生命周期只在挂载时启动一次，fading 阶段继续复用同一循环
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (status === "done") return null;

    return (
        <div
            className={`fixed inset-0 z-[9999] cursor-pointer bg-[#0a0a0a] transition-opacity duration-500 ${status === "fading" ? "opacity-0" : "opacity-100"}`}
            onClick={() => beginFadeRef.current()}
            onPointerMove={(e) => {
                mouseRef.current.x = e.clientX;
                mouseRef.current.y = e.clientY;
            }}
            onPointerLeave={() => {
                mouseRef.current.x = -9999;
                mouseRef.current.y = -9999;
            }}
        >
            <canvas ref={canvasRef} className="block h-full w-full" />
            <div className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-xs text-white/40">
                点击任意处跳过
            </div>
        </div>
    );
}
