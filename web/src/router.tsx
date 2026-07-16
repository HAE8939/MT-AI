import { createBrowserRouter, Outlet } from "react-router-dom";

import UserLayout from "@/layouts/user-layout";
import AgentsPage from "@/pages/agents";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import MePage from "@/pages/me";
import NotFound from "@/pages/not-found";
import PlazaPage from "@/pages/plaza";

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/agents", element: <AgentsPage /> },
            { path: "/plaza", element: <PlazaPage /> },
            { path: "/me", element: <MePage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
