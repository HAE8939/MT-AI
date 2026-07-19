# prompt 项目工作流知识库资产

## 概述

本目录包含从 `E:\19 Python File\prompt` 项目迁移的完整技术文档。这些资产已成功集成到 MT-AI 项目中。

## 迁移完成时间

2026-07-19

## 资产清单

### 1. 技术文档
- `自动化工作流-通用方案.md`（26KB）- 完整的技术设计文档，包含：
  - 22 个工作流的完整说明
  - 通用流水线架构设计
  - JSON 配置规范
  - 提示词引擎设计理念
  - 实施路线和注意事项

### 2. JSON 配置文件（22 个）
位置：`../web/public/workflows/`

所有配置已验证格式正确，包含：
- **蒙版编辑类**（6 个）：场景添加人物、局部开灯、局部材质修改、指定人物生成、指定材质替换、软硬装局部替换
- **全图编辑类**（14 个）：光影大师、光影重塑、室内氛围转换、室内风格转化、白膜出图、手绘线稿出图、毛坯房出图、软装拼贴出图、质感增强、全景渲染、一键彩平图、一键材质通道图、软装物料清单整理、家装平面方案生成
- **多图输出类**（1 个）：室内多视角分镜
- **高清放大类**（1 个）：高清放大

### 3. UI 原型图（22 张 PNG）
位置：`../web/public/workflows-images/`

每个工作流配套一张 UI 原型图，展示用户交互界面设计。

## 集成方案

采用 **方案 A+：作为增强型 AgentTemplate 集成**

### 核心理念
- 新增 `PromptEngineSpec` 作为第 5 种 AgentTemplate 类型
- JSON 配置驱动的 LLM 提示词引擎工作流
- 前端纯静态实现，无需后端

### 技术架构
```
用户选择工作流 → 动态渲染输入表单 → 填写参数 → 
LLM 扩写提示词 → 调用图像模型 → 结果写入画布 + 保存 final_prompt
```

### 实施状态
- ✅ Phase 1.1: 资产文件复制完成
- ✅ Phase 1.2: JSON 格式验证通过（22/22）
- ⏳ Phase 1.3: 类型系统扩展（待实施）
- ⏳ Phase 1.4: 核心服务实现（待实施）

## 技术特性

### prompt 项目核心价值
1. **知识资产化**：将提示词经验沉淀为 JSON 知识库
2. **配置驱动**：一条通用流水线 + 22 个 JSON 插件
3. **LLM 提示词引擎**：用户一句话 → LLM 自动扩写专业提示词

### 与 MT-AI 的完美契合
1. **架构一致**：MT-AI 的 AgentTemplate 系统天然支持此类扩展
2. **技术可行**：前端纯静态架构可完全实现提示词引擎
3. **功能互补**：MT-AI 画布 + prompt 知识库 = 室内设计 AI 工作台

## JSON 配置统计

| taskType | 数量 | 说明 |
|----------|------|------|
| masked-edit | 6 | 需要蒙版涂抹的局部编辑 |
| full-edit | 14 | 全图编辑或风格转换 |
| multi-output | 1 | 多视角分镜（输出多张图） |
| upscale | 1 | 高清放大（特殊路由） |

## 关键技术点

### 1. LLM 提示词扩写
- System Prompt = 固定引导 + JSON 的 `promptEngine` 全文
- User = 用户原文 + 原图（让 LLM 看图判断场景）
- 输出：60-140 词专业英文提示词

### 2. 蒙版处理
- 涂抹区 → 透明（alpha=0）= 重绘区
- 这是 gpt-image-1 的硬性要求
- 复用 MT-AI 的 `lib/mask-inpaint.ts`

### 3. 双层效力设计
- **硬契约**：outputContract、maskProtocol、failureModes（必须严格遵守）
- **脚手架**：templates、词汇库（质量标杆，鼓励超越）

## 预期成果

### 短期（2-3 周）
- 3-5 个核心工作流可用
- 用户可在画布侧栏运行工作流
- 生成结果保存 `final_prompt`

### 中期（1-2 月）
- 22 个工作流全部上线
- 建立知识库迭代机制
- 支持用户自定义工作流

### 长期（3-6 月）
- 工作流串联（推荐链路自动化）
- Canvas Agent 对话触发工作流
- 知识库扩展到其他行业

## 参考文档

- [完整实施计划](../../.claude/plans/e-19-python-file-prompt-mt-ai-logical-duckling.md)
- [执行摘要](../../.claude/plans/summary-and-next-steps.md)
- [原始技术方案](./自动化工作流-通用方案.md)

## 下一步行动

立即可进行的任务：

1. **扩展类型系统**（`web/src/types/workflow.ts`）
   - 添加 `PromptEngineSpec` 类型
   - 定义 `PromptEngineWorkflowConfig` 接口

2. **创建核心服务**（`web/src/services/prompt-engine/`）
   - `llm-expander.ts`：LLM 提示词扩写
   - `mask-processor.ts`：蒙版 alpha 转换
   - `workflow-runner.ts`：工作流执行器

3. **验证工作流**
   - 选择「光影重塑」作为首个验证工作流
   - 跑通端到端流程
   - 验证 LLM 扩写质量

---

**迁移状态**：Phase 1 资产准备已完成 ✅
**下一阶段**：Phase 2 单一工作流验证
