# COS Media Layer Design

## Goal

为 infinite-canvas 增加可配置的腾讯云 COS 媒体层。文本内容继续使用现有本地数据链路；图片、视频、生成结果和“我的素材”先可靠写入浏览器本地缓存，再上传到 COS，并在需要公网 URL 的 AI 请求中统一使用 COS 地址。

## Scope

- 配置页增加腾讯云 COS 配置入口。
- 图片、视频、生成结果和素材统一进入 COS 同步队列。
- 保留现有 IndexedDB/localforage 本地缓存，媒体可在上传失败时继续显示和编辑。
- 需要公网 URL 的图片/视频生成请求必须等待相关媒体上传成功后再提交。
- BizyAir 等当前支持 Base64 的请求也优先使用 COS URL；仅当目标接口明确只接受 Base64 时才从本地缓存转换。
- 生成结果下载到本地后自动归档 COS。
- 密钥失效后，用户可在配置页更换配置并重试失败任务。

不在本次范围内：文本节点云同步、COS 服务端签名、第三方图床降级、删除 COS 历史对象、跨用户权限体系。

## Architecture

采用“本地缓存 + COS 最终副本”的双层模型：

1. 媒体首先通过现有 `image-storage`、视频存储或素材存储写入 IndexedDB。
2. 写入成功后创建可持久化 COS 同步任务。
3. 根组件挂载一个全局同步运行器，负责上传、自动重试和刷新恢复。
4. 成功后把 `cosKey` 和 `cosUrl` 写回媒体元数据；本地 `storageKey` 继续作为首选显示源。
5. AI 请求需要公网媒体时调用统一解析器。已有 `cosUrl` 直接复用；处于等待状态时等待同步任务；失败状态阻止请求并提供明确重试入口。

COS 解决媒体公网访问与长期保存，异步生成仍由现有 `externalTaskId + localforage + polling` 机制管理。两个队列独立：媒体上传失败不能被误报为远程生成失败，远程生成失败也不能删除已上传媒体。

## Configuration

在 `use-config-store` 增加：

```ts
export type CosConfig = {
    enabled: boolean;
    secretId: string;
    secretKey: string;
    bucket: string;
    region: string;
    publicBaseUrl: string;
    objectPrefix: string;
};
```

配置页新增“腾讯云 COS”区块，字段包括：

- 启用 COS
- SecretId
- SecretKey（密码输入框）
- Bucket
- Region
- 公网访问域名
- 对象前缀，默认 `infinite-canvas`
- “测试连接”按钮

初始值使用 DMDS 当前内置 COS 配置，所有字段均可编辑并保存在当前浏览器配置中。画布导出、任务记录和 WebDAV 数据不复制 COS 密钥。

“测试连接”会向 `${objectPrefix}/health/` 上传一个极小测试对象，成功后尝试删除；上传成功即视为连接可用，删除失败只显示清理提示，不判定连接失败。

## COS Client

新增独立的浏览器端 COS 客户端，使用 Web Crypto 实现与 DMDS 相同的腾讯云 COS HMAC-SHA1 请求签名，不引入新的状态管理或 UI 依赖。

公开接口：

```ts
uploadCosObject(config, input, signal): Promise<{ key: string; url: string }>;
deleteCosObject(config, key, signal): Promise<void>;
testCosConnection(config, signal): Promise<void>;
```

对象键统一为：

```text
{objectPrefix}/{kind}/{yyyy}/{mm}/{uuid}.{extension}
```

`kind` 取 `images`、`videos`、`assets`、`results`。文件扩展名优先从原文件名获取，缺失时根据 MIME 类型推断。对象键不包含用户提示词、画布标题或原始本地路径。

## Persistent Upload Queue

新增 localforage 持久化 Store：

```ts
export type CosUploadTask = {
    id: string;
    mediaId: string;
    mediaKind: "image" | "video" | "asset" | "result";
    storageKey: string;
    fileName: string;
    mimeType: string;
    status: "queued" | "uploading" | "succeeded" | "failed" | "cancelled";
    attempt: number;
    cosKey?: string;
    cosUrl?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
};
```

任务只保存本地 `storageKey` 和元数据，不保存 Blob、Base64、密钥、AbortController 或定时器。刷新后，`queued` 和 `uploading` 任务恢复为待执行状态。

每次上传最多自动尝试三次，间隔依次为 2 秒、5 秒、15 秒。三次失败后保留本地媒体并标记为 `failed`。用户修改 COS 配置后，可在媒体同步任务中心点击“重试”；重试会清空旧错误并使用最新配置。

## Media Data Flow

### User Uploads

图片、视频或素材被选择后：

1. 校验文件类型和大小。
2. 写入现有本地媒体存储。
3. 立即在画布或素材库显示本地版本。
4. 创建 COS 上传任务。
5. 上传成功后写回 `cosKey`、`cosUrl` 和同步状态。

### AI Request Inputs

提交生图、图生图、视频、图纸渲染、局部重绘、多角度或超分任务前，对所有媒体输入调用 `ensureCosMediaUrl()`：

- 已同步：立即返回 `cosUrl`。
- 正在同步：等待对应任务完成。
- 尚未创建任务：创建任务并等待。
- 同步失败：阻止远程请求，提示“COS 上传失败”，并打开同步任务入口。

若目标 API 协议只接受 Base64，则从本地 `storageKey` 读取内容构建请求；该媒体仍会并行归档 COS。

### Generated Results

远程任务成功后：

1. 下载远程结果为 Blob。
2. 写入本地媒体存储并替换画布占位节点。
3. 创建 `result` 类型 COS 上传任务。
4. 上传成功后把 COS 地址写入节点或生成记录元数据。
5. 上传失败时结果继续通过本地缓存显示，任务中心提供重试。

远程结果无法下载时，保留原始结果 URL 和明确错误，不把临时 URL 当作 COS 同步成功。

## UI

配置页负责编辑和测试 COS 配置。顶部现有“专业工作流任务”保持远程 AI 任务语义，旁边增加低视觉重量的“媒体同步”入口，展示：

- 等待、上传中、失败数量
- 文件名、媒体类型、来源页面和当前状态
- 失败原因
- 重试、取消、移除已完成任务

画布节点和素材卡不增加常驻大面积状态组件。同步失败时只显示小型状态图标或提示；媒体本身仍可正常查看和编辑。

## Failure Handling

- COS 配置不完整：媒体先保存本地，任务标记失败并引导打开配置页。
- 401/403：提示检查 SecretId、SecretKey、Bucket、Region 和授权策略。
- CORS：提示检查 COS 存储桶跨域规则，不降级到代理或其他图床。
- 网络中断：执行三次自动重试，最终失败后等待用户手动重试。
- 本地媒体已被删除：取消对应上传任务，不创建空对象。
- COS 已存在同名对象：UUID 对象键避免覆盖，不进行覆盖兼容逻辑。
- 配置修改：后续上传和手动重试立即使用新配置，已成功对象保持原 URL。

## Integration Boundaries

- `services/api/cos-media.ts`：签名、上传、删除和连接测试。
- `stores/use-cos-upload-store.ts`：可序列化同步任务。
- `hooks/use-cos-upload-runner.ts`：全局执行、重试和刷新恢复。
- `services/media-sync.ts`：把现有本地媒体存储与 COS 任务连接起来，提供 `enqueueCosUpload()` 和 `ensureCosMediaUrl()`。
- `components/layout/cos-upload-drawer.tsx`：媒体同步任务中心。
- 现有图片、视频、素材和生成结果入口只调用统一媒体同步接口，不各自实现 COS 签名或重试。

## Verification

- 配置页可保存、更新并测试 DMDS COS 配置。
- 本地图片、视频、素材新增后立即可见，随后得到 COS URL。
- 刷新页面后未完成上传继续执行，不产生重复对象。
- COS 密钥错误时本地媒体不丢失，任务三次后进入失败状态。
- 更换密钥后手动重试可成功，且使用新配置。
- 需要 URL 的 AI 请求会等待上传，上传失败时不会发送残缺请求。
- 只接受 Base64 的 API 继续工作，同时媒体独立归档 COS。
- 生成结果先进入本地画布，再异步归档 COS。
- 画布导出、工作流任务和 WebDAV 数据不包含 COS SecretId/SecretKey。
- 图片、视频和素材分别验证桌面与移动布局，确保同步状态不遮挡现有操作。

## Follow-up Subprojects

COS 媒体层完成并验证后，分别处理：

1. 修复提示词和角色 Store 的 hydration 异常。
2. 使用 DMDS 完整 System Prompt 替换当前角色摘要，并提供可见角色管理入口。
3. 将 DMDS 结构化提示词选择器迁移为 React 组件，而不是只填充普通提示词列表。
