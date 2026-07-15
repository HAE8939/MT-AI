import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import { router } from "@/router";

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

// 开屏动画仅首次访问播放；老用户与减少动态用户完全不加载该代码块
const shouldPlayIntro = (() => {
    try {
        if (window.localStorage.getItem("infinite-canvas:intro_seen")) return false;
    } catch {
        return false;
    }
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
})();
const IntroAnimation = shouldPlayIntro ? lazy(() => import("@/components/intro/intro-animation")) : null;

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
        {IntroAnimation ? (
            <Suspense fallback={null}>
                <IntroAnimation />
            </Suspense>
        ) : null}
    </React.StrictMode>,
);
