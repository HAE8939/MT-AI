import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

/** 智能体分类：按产出类型划分（东木形态） */
export type AgentCategory = "image" | "video" | "document";

/** RunningHub 工作流暴露给用户的一个输入项 */
export type RunningHubParamField = {
    nodeId: string;
    fieldName: string;
    /** 展示名，如「主体描述」 */
    label: string;
    /** text=文本输入；image=图片输入（画布节点/本地上传/公网 URL，均在提交时解析）；number=数值步进器 */
    kind: "text" | "image" | "number";
    /** 未填写时使用的默认值（来自工作流导出的原值） */
    defaultValue?: string;
};

/** 文档分析智能体：原「专业角色」的模板化形态，读取选中节点产出分析文本节点 */
export type DocAnalysisSpec = {
    kind: "doc-analysis";
    systemPrompt: string;
};

/** RunningHub 云工作流智能体：workflowId + 参数映射，执行走统一任务运行时 */
export type RunningHubSpec = {
    kind: "runninghub";
    workflowId: string;
    fields: RunningHubParamField[];
};

/** 画布模板智能体：一组节点+连线的可复用快照，插入画布后换输入重跑 */
export type CanvasTemplateSpec = {
    kind: "canvas";
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

/** 本地工作流的一个运行时输入槽：指向快照中某个节点，运行时由用户填值 */
export type LocalWorkflowInputSlot = {
    /** 指向 LocalWorkflowSpec.nodes 中节点的原始 id（快照内 id，运行时会重映射） */
    nodeId: string;
    /** 展示名，如「产品原图」「风格描述」 */
    label: string;
    /** image=图片输入（选画布节点/本地上传）；text=文本输入（提示词） */
    kind: "text" | "image";
};

/** 本地自建工作流：一组节点+连线快照 + 输入槽标记，运行时按依赖顺序自动串跑本地生成 */
export type LocalWorkflowSpec = {
    kind: "local-workflow";
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    inputs: LocalWorkflowInputSlot[];
};

/** 提示词引擎工作流的任务类型（决定生成走 edits 还是 generations，upscale 为特殊路由） */
export type PromptEngineTaskType = "masked-edit" | "full-edit" | "generate" | "upscale" | "multi-output" | "vision-analysis";

/** 提示词引擎工作流 JSON 配置里的额外表单项（下拉框 / 选项卡等） */
export type PromptEngineExtraField = {
    key: string;
    type: string;
    label_zh: string;
    options?: string[];
    default?: string | number;
};

/** 提示词引擎工作流 JSON 配置（workflows/*.json，三层结构：meta 管路由，inputSpec/outputSpec 管交互，promptEngine 管效果） */
export type PromptEngineWorkflowConfig = {
    meta: {
        id: string;
        version?: string;
        name: string;
        description?: string;
        taskType: PromptEngineTaskType;
        targetModel?: string;
        endpoint?: string;
        references?: string[];
    };
    inputSpec: {
        image: "required" | "optional" | "none";
        mask: "required" | "optional" | "none";
        refImages: number;
        refImagesOptional?: boolean;
        userText: "required" | "optional" | "none";
        extraFields?: PromptEngineExtraField[];
    };
    outputSpec: {
        type: "image" | "images" | "text" | "file";
        count: number;
    };
    /** 提示词引擎知识库：整体作为 System Prompt 注入扩写 LLM，前端不解析内部结构 */
    promptEngine: Record<string, unknown>;
};

/** 提示词引擎工作流：JSON 知识库驱动「LLM 扩写 → 图像生成」，用户一句话出专业效果图 */
export type PromptEngineSpec = {
    kind: "prompt-engine";
    config: PromptEngineWorkflowConfig;
};

export type AgentTemplateSpec = DocAnalysisSpec | RunningHubSpec | CanvasTemplateSpec | LocalWorkflowSpec | PromptEngineSpec;

export type AgentTemplate = {
    id: string;
    name: string;
    description: string;
    avatar?: string;
    category: AgentCategory;
    /** builtin=内置（public/roles.json 转换而来），user=用户创建 */
    source: "builtin" | "user";
    spec: AgentTemplateSpec;
    createdAt: string;
    updatedAt: string;
};

export const AGENT_CATEGORY_LABELS: Record<AgentCategory, string> = {
    image: "图片",
    video: "视频",
    document: "文档",
};
