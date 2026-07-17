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

export type AgentTemplateSpec = DocAnalysisSpec | RunningHubSpec | CanvasTemplateSpec | LocalWorkflowSpec;

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
