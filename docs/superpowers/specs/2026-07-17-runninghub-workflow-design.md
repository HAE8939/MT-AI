# RunningHub 工作流模块补全设计（以 F2K 材质替换为验证用例）

## 背景

RunningHub 云工作流链路已在 `codex/dmds-core-migration` 分支端到端实现（客户端 `web/src/services/providers/runninghub.ts`、执行器 `runninghub-executor.ts`、统一任务运行器、注册/运行对话框、画布写回），但未经真实工作流验证，且存在三处影响可用性的缺口。本次以「F2K-家具软装-材质迁移-材质替换」（workflowId `2057342903248314370`）为验证用例补全。

该工作流可注入节点：47（LoadImage，原始图）、49（LoadImage，材质参考图）、41（CLIPTextEncode，提示词）。

## 已确认的决策

- 画布本地图片（blob:/storageKey）通过 **RunningHub 官方上传接口**（已实现的 `uploadRunningHubFile`）桥接，不走腾讯 COS。
- 上传时机为**提交时**：运行对话框内解析并上传，任务参数仍存最终 nodeInfoList，执行器不改。接受局限：上传链接 1 天有效，隔天重试需重新发起。
- **不迁移** v2 接口，维持旧版 `/task/openapi/*`（Key 在请求体），验证能跑通即不动。
- 不暴露 seed 字段（API 每次强制随机 seed，符合出图场景）；不做多输出上画布、视频写回修复、远程取消。

## 工作项

### 1. 运行对话框接线官方上传（`web/src/components/workflow/runninghub-run-dialog.tsx`）

- image 字段候选从「仅公网 https URL 节点」扩展为所有画布图片节点。
- 提交时逐个解析 image 字段值：公网 URL 原样透传；画布节点经 `getImageBlob(storageKey)` → `uploadRunningHubFile()` 取 fileName；无 storageKey 的 dataURL 转 Blob 后同上；均不满足则中文报错且不入队。
- 上传期间运行按钮 loading（「上传图片中…」），失败 message 提示，对话框不关闭。
- 页面与画布工作流标签页共用此组件，改一处两边生效。

### 2. 配置弹窗新增 RunningHub 设置（`web/src/components/layout/app-config-modal.tsx`）

- `ConfigTabKey` 增加 `"runninghub"` 标签页（参照 COS 标签页写法）：baseUrl + API Key，写入 `updateRunningHubConfig()`。
- 修复执行器报错「请先在配置页填写 RunningHub API Key」与配置页无此入口的矛盾。

### 3. 注册对话框支持导入 API JSON（`web/src/pages/workflows/index.tsx`）

- 新增「导入工作流 API JSON」区域：粘贴导出的 api_format JSON → 解析生成参数行：
  - `class_type === "LoadImage"` → image 字段，label 取 `_meta.title`；
  - `class_type === "CLIPTextEncode"` 且 `inputs.text` 为字符串 → text 字段，`defaultValue` 取当前文本。
- workflowId 仍手动填写（不在 JSON 内）；解析结果可手动增删改。
- 参数行补充 `defaultValue` 输入（运行对话框已消费，注册侧此前无法设置）。

### 4. 端到端验证

注册 F2K 模板 → 配置 Key → 画布两张输入图 → 运行 → 任务中心出现「云工作流」任务 → 结果写回占位节点。对应 `docs/content/docs/progress/pending-test.mdx` 第 1 项，同时确认旧版接口可用性。

## 错误处理

上传失败 / JSON 解析失败均为中文 antd message 提示，不破坏现有任务失败展示路径；其余错误路径复用现有实现。

## 收尾

`CHANGELOG.md` Unreleased 增加对应中文条目；验证完成后更新 `pending-test.mdx`。
