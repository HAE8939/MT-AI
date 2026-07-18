import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { CosConfig } from "@/types/cos-media";

export type ApiCallFormat = "openai" | "gemini";

/** 渠道的提供方类型：由渠道记录显式声明，取代 URL/模型名嗅探。
 *  dongmu = 东木-AI 聚合平台（能力自描述 + 媒体异步任务）；
 *  runninghub = RunningHub 云工作流（workflowId + nodeInfoList）；
 *  compat = 裸 OpenAI/Gemini 兼容渠道（保底，含 Seedance/火山方舟）。 */
export type ChannelProvider = "compat" | "dongmu" | "runninghub";

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: string[];
    provider?: ChannelProvider;
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
};

export type ConfigTabKey = "channels" | "models" | "preferences" | "cos" | "runninghub" | "codex";

/** RunningHub 云工作流平台配置（智能体模块使用） */
export type RunningHubConfig = {
    baseUrl: string;
    apiKey: string;
};

export const defaultRunningHubConfig: RunningHubConfig = {
    baseUrl: "https://www.runninghub.ai",
    apiKey: "",
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

/** 项目配置文件（public/config.json）中可覆盖的字段。
 *  除 AiConfig 外，还支持管理员级下发腾讯云 COS 与 RunningHub 平台配置。 */
type ProjectConfigJson = Partial<AiConfig> & {
    cosConfig?: Partial<CosConfig>;
    runninghub?: Partial<RunningHubConfig>;
};

/** 拆出 config.json 中的 COS / RunningHub 段，避免它们混入 AiConfig */
function splitProjectConfig(projectConfig: ProjectConfigJson | null) {
    const { cosConfig, runninghub, ...aiConfig } = projectConfig || {};
    return { cosConfig: cosConfig || {}, runninghub: runninghub || {}, aiConfig };
}
const CONFIG_HASH_KEY = "infinite-canvas:config_json_hash";

/** 简单字符串哈希，用于检测 config.json 内容是否变更 */
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return String(hash);
}

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: "默认渠道",
            baseUrl: OPENAI_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            models: ["gpt-image-2", "grok-imagine-video", "gpt-5.5", "gpt-4o-mini-tts"],
        },
    ],
    model: "default::gpt-image-2",
    imageModel: "default::gpt-image-2",
    videoModel: "default::grok-imagine-video",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: ["default::gpt-image-2", "default::grok-imagine-video", "default::gpt-5.5", "default::gpt-4o-mini-tts"],
    imageModels: ["default::gpt-image-2"],
    videoModels: ["default::grok-imagine-video"],
    textModels: ["default::gpt-5.5"],
    audioModels: ["default::gpt-4o-mini-tts"],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
};

export const defaultCosConfig: CosConfig = {
    enabled: false,
    secretId: "",
    secretKey: "",
    bucket: "",
    region: "",
    publicBaseUrl: "",
    objectPrefix: "mt-ai",
};

type ConfigStore = {
    config: AiConfig;
    cosConfig: CosConfig;
    runninghub: RunningHubConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    initialized: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateCosConfig: <K extends keyof CosConfig>(key: K, value: CosConfig[K]) => void;
    updateRunningHubConfig: <K extends keyof RunningHubConfig>(key: K, value: RunningHubConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function isVideoModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo");
}

function isImageModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

/** Provider 能力发现声明的模型类型（如东木 /skills/models 的 type 字段），优先于模型名子串猜测 */
const declaredModelCapabilities = new Map<string, ModelCapability>();

export function registerModelCapabilities(entries: Array<{ name: string; capability: ModelCapability }>) {
    entries.forEach(({ name, capability }) => declaredModelCapabilities.set(name, capability));
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    const declared = declaredModelCapabilities.get(modelOptionName(model));
    if (declared) return declared === capability;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());
}

// --- project config loading ---

let loadedProjectConfig: ProjectConfigJson | null = null;

async function fetchProjectConfig(): Promise<ProjectConfigJson> {
    try {
        const base = import.meta.env.BASE_URL || "/";
        const url = `${base}config.json`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return {};
        return (await response.json()) as ProjectConfigJson;
    } catch {
        return {};
    }
}

function normalizeConfig(baseConfig: AiConfig, persistedConfig: Partial<AiConfig>): AiConfig {
    const config = { ...baseConfig, ...persistedConfig };
    if (!Array.isArray(persistedConfig.channels)) config.channels = baseConfig.channels;
    const channels = normalizeChannels(config);
    const models = modelOptionsFromChannels(channels);

    // For model lists: use persisted if available, else baseConfig's, else auto-derive
    const pc = persistedConfig;
    const imageModels = Array.isArray(pc.imageModels) ? normalizeModelList(config.imageModels, channels) : baseConfig.imageModels.length ? normalizeModelList(baseConfig.imageModels, channels) : filterModelsByCapability(models, "image");
    const videoModels = Array.isArray(pc.videoModels) ? normalizeModelList(config.videoModels, channels) : baseConfig.videoModels.length ? normalizeModelList(baseConfig.videoModels, channels) : filterModelsByCapability(models, "video");
    const textModels = Array.isArray(pc.textModels) ? normalizeModelList(config.textModels, channels) : baseConfig.textModels.length ? normalizeModelList(baseConfig.textModels, channels) : filterModelsByCapability(models, "text");
    const audioModels = Array.isArray(pc.audioModels) ? normalizeModelList(config.audioModels, channels) : baseConfig.audioModels.length ? normalizeModelList(baseConfig.audioModels, channels) : filterModelsByCapability(models, "audio");

    return {
        ...config,
        channelMode: "local",
        apiFormat: normalizeApiFormat(config.apiFormat),
        channels,
        models,
        imageModel: normalizeModelOptionValue(config.imageModel || config.model, channels),
        videoModel: normalizeModelOptionValue(config.videoModel || "grok-imagine-video", channels),
        textModel: normalizeModelOptionValue(config.textModel || config.model, channels),
        audioModel: normalizeModelOptionValue(config.audioModel || baseConfig.audioModel, channels),
        audioVoice: config.audioVoice || baseConfig.audioVoice,
        audioFormat: config.audioFormat || baseConfig.audioFormat,
        audioSpeed: config.audioSpeed || baseConfig.audioSpeed,
        audioInstructions: config.audioInstructions || "",
        videoSeconds: config.videoSeconds || "6",
        vquality: config.vquality || "720",
        videoGenerateAudio: config.videoGenerateAudio || "true",
        videoWatermark: config.videoWatermark || "false",
        canvasImageCount: config.canvasImageCount || "3",
        imageModels,
        videoModels,
        textModels,
        audioModels,
    };
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            cosConfig: defaultCosConfig,
            runninghub: defaultRunningHubConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            initialized: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateCosConfig: (key, value) => set((state) => ({ cosConfig: { ...state.cosConfig, [key]: value } })),
            updateRunningHubConfig: (key, value) => set((state) => ({ runninghub: { ...state.runninghub, [key]: value } })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => set({ isConfigOpen: true, shouldPromptContinue, configTab }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => {
                // Only persist user-added channels (filter out admin channels from config.json)
                const adminIds = new Set((loadedProjectConfig?.channels || []).map((c) => c.id));
                const userChannels = state.config.channels.filter((c) => !adminIds.has(c.id));
                return {
                    config: { ...state.config, channels: userChannels },
                    cosConfig: state.cosConfig,
                    runninghub: state.runninghub,
                };
            },
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedCosConfig = persistedState.cosConfig || {};
                const project = splitProjectConfig(loadedProjectConfig);
                const baseConfig = loadedProjectConfig ? { ...defaultConfig, ...project.aiConfig } : defaultConfig;
                const persistedRunningHub = { ...defaultRunningHubConfig, ...project.runninghub, ...(persistedState.runninghub || {}) };
                // RunningHub CN 站因政策变动停用，历史配置中的旧默认地址自动切换到国际站
                if (persistedRunningHub.baseUrl === "https://www.runninghub.cn") persistedRunningHub.baseUrl = defaultRunningHubConfig.baseUrl;
                return {
                    ...current,
                    initialized: false,
                    cosConfig: { ...defaultCosConfig, ...project.cosConfig, ...persistedCosConfig },
                    runninghub: persistedRunningHub,
                    config: normalizeConfig(baseConfig, persistedConfig),
                };
            },
            onRehydrateStorage: () => () => {
                void (async () => {
                    const projectConfig = await fetchProjectConfig();
                    loadedProjectConfig = projectConfig;
                    const project = splitProjectConfig(projectConfig);
                    const rawHash = simpleHash(JSON.stringify(projectConfig));
                    const storedHash = window.localStorage.getItem(CONFIG_HASH_KEY);
                    const baseConfig = { ...defaultConfig, ...project.aiConfig };

                    // Extract user channels that were persisted (already filtered by partialize)
                    const persistedRaw = window.localStorage.getItem(CONFIG_STORE_KEY);
                    let persistedChannels: ModelChannel[] = [];
                    let persistedModelPrefs: Partial<AiConfig> = {};
                    if (persistedRaw) {
                        try {
                            const parsed = JSON.parse(persistedRaw);
                            if (Array.isArray(parsed?.state?.config?.channels)) {
                                persistedChannels = parsed.state.config.channels;
                            }
                            if (parsed?.state?.config) persistedModelPrefs = parsed.state.config as Partial<AiConfig>;
                        } catch {
                            // ignore parse errors
                        }
                    }

                    if (rawHash !== storedHash) {
                        // config.json changed — overwrite non-channel config, merge channels
                        const adminConfig = normalizeConfig(baseConfig, {});
                        const mergedChannels = [...adminConfig.channels, ...persistedChannels];
                        const state = useConfigStore.getState();
                        useConfigStore.setState({
                            config: { ...adminConfig, channels: mergedChannels },
                            // config.json 中给出的 COS / RunningHub 字段以管理员值为准，未给出的字段保留设备本地值
                            cosConfig: { ...state.cosConfig, ...project.cosConfig },
                            runninghub: { ...state.runninghub, ...project.runninghub },
                            initialized: true,
                        });
                        window.localStorage.setItem(CONFIG_HASH_KEY, rawHash);
                    } else {
                        // config.json unchanged — ensure admin channels are fresh, keep user overrides
                        const currentState = useConfigStore.getState();
                        const adminConfig = normalizeConfig(baseConfig, {});
                        const mergedChannels = [...adminConfig.channels, ...persistedChannels];
                        // 启动合并时管理员渠道尚未加载，针对它们的模型选择会被归一化清空；
                        // 这里渠道齐了再恢复：优先持久化的用户选择，其次当前值，均无效则回退管理员默认值
                        const pickModel = (persisted: string | undefined, current: string, adminDefault: string) => {
                            for (const candidate of [persisted, current]) {
                                const normalized = normalizeModelOptionValue(candidate, mergedChannels);
                                if (normalized && isChannelModelValue(normalized)) return normalized;
                            }
                            return adminDefault;
                        };
                        const pickModelList = (persisted: string[] | undefined, adminDefault: string[]) => {
                            const normalized = normalizeModelList(persisted || [], mergedChannels);
                            return normalized.length ? normalized : adminDefault;
                        };
                        const cur = currentState.config;
                        const pm = persistedModelPrefs;
                        useConfigStore.setState({
                            config: {
                                ...cur,
                                channels: mergedChannels,
                                models: modelOptionsFromChannels(mergedChannels),
                                model: pickModel(pm.model, cur.model, adminConfig.model),
                                imageModel: pickModel(pm.imageModel, cur.imageModel, adminConfig.imageModel),
                                videoModel: pickModel(pm.videoModel, cur.videoModel, adminConfig.videoModel),
                                textModel: pickModel(pm.textModel, cur.textModel, adminConfig.textModel),
                                audioModel: pickModel(pm.audioModel, cur.audioModel, adminConfig.audioModel),
                                imageModels: pickModelList(pm.imageModels, adminConfig.imageModels),
                                videoModels: pickModelList(pm.videoModels, adminConfig.videoModels),
                                textModels: pickModelList(pm.textModels, adminConfig.textModels),
                                audioModels: pickModelList(pm.audioModels, adminConfig.audioModels),
                            },
                            initialized: true,
                        });
                    }
                })();
            },
        },
    ),
);

function normalizeModelList(models: string[], channels: ModelChannel[]) {
    const allModelOptions = channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model)));
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)))
        .map((model) => normalizeModelOptionValue(model, channels))
        .filter((model) => !allModelOptions.length || allModelOptions.includes(model) || !isChannelModelValue(model));
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    const provider = channel?.provider === "dongmu" || channel?.provider === "runninghub" ? channel.provider : "compat";
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || "新渠道",
        baseUrl: channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat),
        apiKey: channel?.apiKey || "",
        apiFormat,
        models: uniqueRawModels(channel?.models || []),
        provider,
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.includes(decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.includes(model)) || channels[0];
    return channel && channel.models.includes(model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.includes(model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: "默认渠道", baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
        provider: (channel.provider || "compat") as ChannelProvider,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
            models: uniqueRawModels(channel.models || []),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: "默认渠道",
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: uniqueRawModels([
                    ...(config.models || []),
                    config.model,
                    config.imageModel,
                    config.videoModel,
                    config.textModel,
                    config.audioModel,
                ]),
            }),
        );
    }
    return channels.map((channel) => ({ ...channel, models: uniqueRawModels(channel.models) }));
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    return apiFormat === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? "gemini" : "openai";
}

function uniqueRawModels(models: string[]) {
    return Array.from(new Set((models || []).map((model) => modelOptionName(model).trim()).filter(Boolean)));
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
