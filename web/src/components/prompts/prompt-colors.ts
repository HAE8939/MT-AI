import type { PromptColor } from "@/stores/use-prompt-store";

export type PromptColorMeta = {
    /** 色板名称（编辑弹窗展示用） */
    label: string;
    /** 主色，用于色条 / 选中描边 */
    accent: string;
    /** 浅色底，半透明以兼容深浅主题 */
    soft: string;
};

/** 8 个 Macaron 卡片配色（参考 DMDS getColorVar 的八色主题） */
export const PROMPT_COLOR_META: Record<PromptColor, PromptColorMeta> = {
    pink: { label: "樱花粉", accent: "#f472b6", soft: "rgba(244,114,182,0.12)" },
    mint: { label: "薄荷绿", accent: "#34d399", soft: "rgba(52,211,153,0.12)" },
    lavender: { label: "薰衣草", accent: "#a78bfa", soft: "rgba(167,139,250,0.12)" },
    lemon: { label: "柠檬黄", accent: "#eab308", soft: "rgba(234,179,8,0.12)" },
    peach: { label: "蜜桃橙", accent: "#fb923c", soft: "rgba(251,146,60,0.12)" },
    sky: { label: "天空蓝", accent: "#38bdf8", soft: "rgba(56,189,248,0.12)" },
    lilac: { label: "丁香紫", accent: "#c084fc", soft: "rgba(192,132,252,0.12)" },
    sage: { label: "鼠尾草", accent: "#84cc16", soft: "rgba(132,204,22,0.12)" },
};

export function getPromptColorMeta(color?: PromptColor): PromptColorMeta | null {
    return color ? PROMPT_COLOR_META[color] || null : null;
}
