import { Maximize2, Settings2, Sparkles, UserRound, Workflow } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        label: "画布",
        icon: Maximize2,
    },
    {
        slug: "agents",
        label: "智能体",
        icon: Workflow,
    },
    {
        slug: "plaza",
        label: "灵感广场",
        icon: Sparkles,
    },
    {
        slug: "me",
        label: "我的",
        icon: UserRound,
    },
    {
        slug: "config",
        label: "配置",
        icon: Settings2,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
