# Codex Desktop 适配说明

本文档说明如何让 Codex Desktop 连接 Infinite Canvas，支持 AI 操作画布。

## 前置条件

- 已安装 Codex Desktop 应用
- 已安装 Node.js 18+ 和 npm
- 已在本地启动 Infinite Canvas 画布服务（`cd web && bun run dev`）

## 安装步骤

### 1. 构建 canvas-agent

```bash
cd canvas-agent
npm install
npm run build
```

### 2. 添加本地 marketplace

在 Codex Desktop 中，打开终端或命令行，执行：

```bash
# Windows (使用完整路径)
codex plugin marketplace add "E:\19 Python File\draw\infinite-canvas"

# macOS/Linux
codex plugin marketplace add /path/to/infinite-canvas
```

这会把 Infinite Canvas 仓库注册为插件源。

### 3. 安装插件

```bash
codex plugin add infinite-canvas@infinite-canvas-local
```

安装完成后，建议开启一个新的 Codex 对话，让新的 skill 和 MCP 工具完整加载。

### 4. 验证安装

在新对话中输入：

```text
打开 Infinite Canvas
```

插件会自动：
- 检查本地画布服务是否运行
- 启动 Canvas Agent（如果未运行）
- 打开新画布并自动连接

## 手动配置（备选方案）

如果不想用插件方式，可以手动添加 MCP：

```bash
# 使用 npm 包
codex mcp add infinite-canvas -- npx -y @basketikun/canvas-agent mcp

# 或使用本地构建
codex mcp add infinite-canvas -- node "E:\19 Python File\draw\infinite-canvas\canvas-agent\dist\index.js" mcp
```

**自动放行配置（可选）：**

编辑 `~/.codex/config.toml`，添加：

```toml
[mcp_servers.infinite-canvas]
command = "npx"
args = ["-y", "@basketikun/canvas-agent", "mcp"]
default_tools_approval_mode = "approve"
```

这样 Codex 调用画布工具时不会频繁弹出审批。

## 使用方式

安装完成后，在 Codex 中可以：

```text
# 打开画布
打开 Infinite Canvas

# 读取画布
读取当前画布并总结节点结构

# 操作画布
根据选中节点创建一组生图提示词
创建一个文本节点，内容是"Hello World"

# 生成图片
帮我生成一张赛博朋克风格的背景图
```

## 可用的 MCP 工具

Codex 可以使用以下画布工具：

- `canvas_get_state` - 获取当前画布状态
- `canvas_get_selection` - 获取选中节点
- `canvas_export_snapshot` - 导出画布快照
- `canvas_apply_ops` - 应用画布操作
- `canvas_create_text_node` - 创建文本节点
- `canvas_create_image_prompt_flow` - 创建图片生成流程

## 排查问题

### 插件未加载

检查插件是否安装成功：

```bash
codex plugin list
```

应该看到 `infinite-canvas` 在列表中。

### MCP 工具不可用

检查 MCP 是否注册：

```bash
codex mcp list
```

应该看到 `infinite-canvas` MCP。

### 连接失败

手动启动 Canvas Agent 并查看输出：

```bash
cd canvas-agent
npm run dev
```

会输出：
```
Local URL: http://127.0.0.1:17371
Connect token: xxxxxx
```

然后在浏览器打开：
```
http://localhost:3000/canvas?mode=new&agentUrl=http://127.0.0.1:17371&agentToken=<你的token>
```

### 卸载插件

```bash
codex plugin remove infinite-canvas
```

如果手动添加了 MCP，也要移除：

```bash
codex mcp remove infinite-canvas
```

## 开发调试

在仓库内调试时，可以直接运行本地 Agent：

```bash
cd canvas-agent
npm run dev
```

这会启动开发模式，代码修改后会自动重启。

## 注意事项

- Canvas Agent 默认只监听 `127.0.0.1`，只能本机访问
- 网页第一次带正确 token 连接后，Agent 会记录该网页 Origin
- 之后其他 Origin 不能复用这个本地 Agent（除非清理 `~/.infinite-canvas/canvas-agent.json`）
- MCP 工具较多，会增加 Codex 上下文和 token 消耗；不使用时建议移除插件

## 下一步

开发完成后，如果要部署到 NAS：

1. 确保 NAS 上的 Web 服务能访问 canvas-agent
2. 配置 nginx 反向代理（如果需要）
3. 更新插件配置指向生产环境的 Agent 地址
