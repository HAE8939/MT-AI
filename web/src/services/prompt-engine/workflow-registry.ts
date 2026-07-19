import type { PromptEngineWorkflowConfig } from "@/types/workflow";

// 提示词引擎工作流注册表：启动时加载 public/workflows/index.json 清单，
// 逐个拉取并校验配置 JSON；静态站点无法列目录，新增工作流需同步更新 index.json。

const WORKFLOWS_BASE = `${import.meta.env.BASE_URL || "/"}workflows`;

function isValidConfig(data: unknown): data is PromptEngineWorkflowConfig {
    if (!data || typeof data !== "object") return false;
    const config = data as PromptEngineWorkflowConfig;
    return Boolean(config.meta?.id && config.meta?.name && config.meta?.taskType && config.inputSpec && config.outputSpec && config.promptEngine);
}

async function fetchWorkflowConfig(filename: string): Promise<PromptEngineWorkflowConfig | null> {
    try {
        const response = await fetch(`${WORKFLOWS_BASE}/${encodeURIComponent(filename)}`, { cache: "no-store" });
        if (!response.ok) return null;
        const data = await response.json();
        if (!isValidConfig(data)) {
            console.warn(`[prompt-engine] 工作流配置校验失败，已跳过: ${filename}`);
            return null;
        }
        return data;
    } catch (error) {
        console.warn(`[prompt-engine] 工作流配置加载失败，已跳过: ${filename}`, error);
        return null;
    }
}

/** 加载全部提示词引擎工作流配置（校验失败的文件跳过，不阻断其余加载） */
export async function loadPromptEngineConfigs(): Promise<PromptEngineWorkflowConfig[]> {
    try {
        const response = await fetch(`${WORKFLOWS_BASE}/index.json`, { cache: "no-store" });
        if (!response.ok) return [];
        const manifest = await response.json();
        const files: string[] = Array.isArray(manifest?.files) ? manifest.files : [];
        const configs = await Promise.all(files.map(fetchWorkflowConfig));
        return configs.filter((config): config is PromptEngineWorkflowConfig => config !== null);
    } catch {
        return [];
    }
}
