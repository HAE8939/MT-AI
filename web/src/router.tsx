import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import UserLayout from "@/layouts/user-layout";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import MePage from "@/pages/me";
import NotFound from "@/pages/not-found";
import PlazaPage from "@/pages/plaza";
import WorkflowsPage from "@/pages/workflows";

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/workflows", element: <WorkflowsPage /> },
            // 原智能体页已拆分：角色进入对话面板，工作流独立成页，保留旧路径跳转
            { path: "/agents", element: <Navigate to="/workflows" replace /> },
            { path: "/plaza", element: <PlazaPage /> },
            { path: "/me", element: <MePage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
