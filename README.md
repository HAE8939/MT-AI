<p align="center">
  <img src="web/public/logo.svg" width="96" alt="MT-AI logo">
</p>

<h1 align="center">MT-AI</h1>

<p align="center">
  <a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
  <a href="https://render.com/deploy?repo=https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/badge/Render-Deploy-46e3b7?style=flat-square&logo=render&logoColor=111111" alt="Deploy to Render"></a>
  <a href="https://github.com/basketikun/infinite-canvas"><img src="https://img.shields.io/github/stars/basketikun/infinite-canvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/basketikun/infinite-canvas/tags"><img src="https://img.shields.io/github/v/tag/basketikun/infinite-canvas?style=flat-square&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/50077?utm_source=trendshift-badge&amp;utm_medium=badge&amp;utm_campaign=badge-trendshift-50077" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/trendshift/repositories/50077/daily?language=TypeScript" alt="basketikun%2Finfinite-canvas | Trendshift" width="250" height="55"></a>
</p>

<p align="center">
  <a href="docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="docs/content/docs/overview/render.mdx">Render 部署</a> · <a href="docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="CLA.md">贡献者协议</a> · <a href="SECURITY.md">漏洞提交</a> · <a href="docs/content/docs/progress/todo.mdx">待办事项</a> · <a href="canvas-agent/README.md">本地 Canvas Agent</a> · <a href="plugins/mt-ai">Codex app 插件</a>
</p>

MT-AI 是一款面向图片创作的开源无限画布工作台。它把画布编排、AI 图片生成、参考图编辑、云工作流（RunningHub）、对话助手、提示词库和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代图片结果。主导航分为「画布 / 工作流 / 灵感广场 / 我的 / 配置」五个模块。

> [!NOTE]
> 本仓库是基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 的**二次开发项目**，当前处于开发测试阶段，详见 [NOTICE.md](NOTICE.md)。

> [!CAUTION]
> 项目目前处于开发阶段，不保证历史数据兼容。各种本地存储格式都可能直接调整，欢迎关注后续更新，当前更适合个人/本地部署，不建议直接公网多人共用。
>
> 如果你需要稳定维护自己的分支，建议自行 fork 后独立开发。二次开发与 PR 请保留原作者信息和前端页面标识。

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、组节点、节点命名、小地图、撤销重做、zip 导入导出。
- AI 创作：浏览器前端直连你配置的 OpenAI / Gemini 兼容接口，支持文生图、图生图、参考图编辑、文本问答、音频（TTS）和视频生成；Seedance 可通过火山方舟接入；渠道支持 provider 抽象，可一键添加东木-AI 聚合平台（模型与能力分类自动发现，生图/视频走统一异步任务接口）。画布节点是唯一生成入口，生成配置、参考图连线都在画布上完成。
- 图片工具箱：双图滑杆对比、360° 全景查看与生成、非破坏性标注、裁剪、行列切图、局部重绘（比例选区 + 羽化 + 附加参考图）、本地插值放大、多角度生成（three.js 相机预览）。
- 任务中心：生成任务支持跨路由、刷新恢复、取消、失败重试和结果写回画布。
- 云工作流（RunningHub）：「工作流」页登记 RunningHub 工作流（workflowId + 参数映射，支持导入/粘贴「导出工作流 API」JSON 自动识别图片与提示词参数），接口走 OpenAPI v2（国际站 runninghub.ai，Bearer 鉴权）；画布侧栏「工作流」tab 提供 RunningHub 式运行面板——图片参数可选画布节点或本地上传（≤30MB）、数值步进器、提交后停留视图迭代重跑、状态实时跟踪，结果自动写回画布占位节点；内置「Z Image 亿级像素文生图」模板开箱即用。
- 工作流模板与文档智能体：画布多选节点可「保存为工作流模板」（保留生成参数骨架，插入任意画布换输入重跑）；原「专业角色」升级为文档智能体，读取选中节点并生成连接的分析文本节点，内置模板可增删改。
- 全站 Agent：本机 Canvas Agent 连接 Codex / Claude Code，注册 28 个 MCP 工具，覆盖页面导航（`site_navigate`）、画布操作与生成、提示词库与素材；Agent 面板全站常驻，跨页面保持同一会话。
- Codex App 插件：安装后自动注册 MCP 并尝试拉起本地 Agent；Windows 提供 `setup-codex.bat`（一键安装插件）和 `start-agent.bat`（一键启动 Agent）。
- 提示词库：「灵感广场」内置约 107 条室内行业提示词（SU转写实、室内效果图、商业空间、建筑外观、景观规划、软装与材质、视角与分镜、组合模板、专业角色），支持搜索、分类与标签筛选、一键收藏到「我的」；「我的」空间支持新建、编辑、分组和 JSON 导入导出，用户数据持久化在浏览器本地；提示词编辑器内置「AI 增强」，调用已配置文本模型把简单描述改写为专业结构化提示词。
- 配置下发：`public/config.json` 提供管理员级模型渠道配置，启动时检测变更并自动同步到所有设备，用户自定义渠道独立保存、更新不丢失。
- 数据与同步：画布、素材、生成记录默认保存在浏览器 IndexedDB（localforage）；媒体文件支持腾讯云 COS 本地优先上传队列（自动重试 + 同步中心），COS 作为媒体唯一云端存储。

完整功能说明见 [功能介绍](docs/content/docs/overview/features.mdx)，Agent 能力范围见 [Codex 能力清单](docs/content/docs/overview/codex-capabilities.mdx)。

如果你在为担心没有合适的生图API来发愁，可以查看该免费生图项目：[chatgpt2api](https://github.com/basketikun/chatgpt2api)

## 快速开始

AI API Key、Base URL、画布、素材和生成记录默认保存在浏览器本地。

### 本地开发

```bash
cd web
bun install
bun run dev        # Vite dev server，端口 3000
bun run typecheck  # TypeScript 严格检查（可选）
bun run build      # 生产构建，输出 web/dist
```

### Docker 运行

```bash
docker compose up -d                          # 使用预构建镜像 ghcr.io/basketikun/infinite-canvas
docker compose -f docker-compose.local.yml up -d --build  # 或本地构建镜像
```

运行后默认端口 3000，可访问 `http://localhost:3000`。

### 初始配置

- 打开后进入右上角配置（或 `/config` 页面），填入 OpenAI / Gemini 兼容的 `Base URL` 和 `API Key`；每个渠道可选择调用格式并拉取模型列表。
- 也可以直接编辑 `web/public/config.json` 做部署级配置：预置模型渠道、默认模型和生成偏好会在启动时自动下发到所有打开该站点的设备。
- 腾讯云 COS 媒体同步需在配置页填入 SecretId、SecretKey、Bucket、Region 等，并为 Bucket 配置 PUT/DELETE 的 CORS 规则。
- 使用 RunningHub 云工作流需在配置弹窗「RunningHub」标签页填入 Base URL（默认国际站 `https://www.runninghub.ai`）和 API Key，也可在登记工作流时填写，两处同源。

### 连接 Codex（可选）

- Windows：运行 `setup-codex.bat` 一键安装 Codex 插件，或 `start-agent.bat` 直接启动本地 Agent 后在网页连接；`start-all.bat` 可同时拉起本地 Agent 与网页服务并自动打开浏览器。
- 直接运行 `npx -y @basketikun/canvas-agent` 不会安装 MCP、不增加 Codex token 消耗；只有安装插件或手动 `codex mcp add` 后工具才进入 Codex 上下文。

## New API 自动配置

如果使用 New API，可在 `系统设置 -> 聊天方式 -> 添加聊天设置` 中填入：

```text
https://canvas.best?apiKey={key}&baseUrl={address}
```

跳转后会自动打开配置弹窗并填入 API Key 和 Base URL。
如果自己部署了，可以把 `https://canvas.best` 替换成你部署的地址。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/jkWsF8q1/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/XrnfXHx7/image.png" alt="image" border="0"></td>
  </tr>
</table>

## 联系方式

项目定制二次开发需求 / 生图 API 需求可联系。

邮箱：1844025705@qq.com · QQ：1844025705

## 赞助支持

<div align="center">

如果这个项目对你有帮助，欢迎通过爱发电赞助支持，你的每一份鼓励都是持续更新的动力！

<br>

<a href="https://ifdian.net/a/basketikun">
  <img src="https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-%E8%B5%9E%E5%8A%A9%E4%BD%9C%E8%80%85-946ce6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyMS4zNWwtMS40NS0xLjMyQzUuNCAxNS4zNiAyIDEyLjI4IDIgOC41IDIgNS40MiA0LjQyIDMgNy41IDNjMS43NCAwIDMuNDEuODEgNC41IDIuMDlDMTMuMDkgMy44MSAxNC43NiAzIDE2LjUgMyAxOS41OCAzIDIyIDUuNDIgMjIgOC41YzAgMy43OC0zLjQgNi44Ni04LjU1IDExLjU0TDEyIDIxLjM1eiIvPjwvc3ZnPg==&logoColor=white" alt="爱发电赞助" />
</a>

<br>
<br>

</div>

## 社区支持

学 AI，上 L 站：[LinuxDO](https://linux.do/)

点击链接加入群聊【AI开源交流】：https://qm.qq.com/q/DFnKzZ807u

## 开源协议

本项目使用 GNU Affero General Public License v3.0，见 [LICENSE](LICENSE)。

## Star History

<a href="https://www.star-history.com/?repos=basketikun%2Finfinite-canvas&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=basketikun/infinite-canvas&type=date&legend=top-left" />
 </picture>
</a>
