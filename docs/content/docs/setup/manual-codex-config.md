# 手动配置 Codex Desktop

由于 `codex` CLI 命令不在系统 PATH 中，需要手动配置。

## 步骤 1：启动 Canvas Agent

双击运行：
```
E:\19 Python File\draw\infinite-canvas\start-agent.bat
```

或者手动执行：
```bash
cd "E:\19 Python File\draw\infinite-canvas\canvas-agent"
npx tsx src/index.ts
```

启动后会输出：
```
Local URL: http://127.0.0.1:17371
Connect token: xxxxxx
```

**记住这两个值，后面要用。**

## 步骤 2：在 Codex Desktop 中配置

### 方法 A：通过 Codex Desktop 界面（如果支持）

1. 打开 Codex Desktop
2. 进入设置/配置页面
3. 找到 MCP 或插件配置
4. 添加新的 MCP 服务器：
   - 名称：`infinite-canvas`
   - 命令：`npx`
   - 参数：`-y @basketikun/canvas-agent mcp`
   - 或者：`node E:\19 Python File\draw\infinite-canvas\canvas-agent\dist\index.js mcp`

### 方法 B：通过配置文件

找到 Codex Desktop 的配置文件（通常在 `~/.codex/` 或 `~/AppData/Roaming/codex/`），编辑 `config.toml` 或 `config.json`：

**config.toml 格式：**
```toml
[mcp_servers.infinite-canvas]
command = "node"
args = ["E:\\19 Python File\\draw\\infinite-canvas\\canvas-agent\\dist\\index.js", "mcp"]
```

**config.json 格式：**
```json
{
  "mcpServers": {
    "infinite-canvas": {
      "command": "node",
      "args": ["E:\\19 Python File\\draw\\infinite-canvas\\canvas-agent\\dist\\index.js", "mcp"]
    }
  }
}
```

### 方法 C：如果 Codex Desktop 支持命令行安装

打开命令提示符或 PowerShell，执行：

```powershell
# 添加插件市场
codex plugin marketplace add "E:\19 Python File\draw\infinite-canvas"

# 安装插件
codex plugin add infinite-canvas@infinite-canvas-local
```

## 步骤 3：在网页中连接 Agent

1. 打开 Infinite Canvas 网页（`http://localhost:3000`）
2. 新建画布时，在 URL 参数中添加 Agent 信息：

```
http://localhost:3000/canvas?mode=new&agentUrl=http://127.0.0.1:17371&agentToken=你的token
```

或者在画布右上角的 Agent 按钮中填入：
- Agent URL: `http://127.0.0.1:17371`
- Connect Token: 步骤 1 输出的 token

## 步骤 4：测试连接

在 Codex Desktop 中输入：
```
打开 Infinite Canvas
```

或者：
```
读取当前画布状态
```

如果 Codex 能调用画布工具，说明配置成功。

## 可用的 MCP 工具

配置成功后，Codex 可以使用以下工具：

- `canvas_get_state` - 获取当前画布状态
- `canvas_get_selection` - 获取选中节点
- `canvas_export_snapshot` - 导出画布快照
- `canvas_apply_ops` - 应用画布操作
- `canvas_create_text_node` - 创建文本节点
- `canvas_create_image_prompt_flow` - 创建图片生成流程

## 排查问题

### Agent 启动失败

检查 canvas-agent 是否已构建：
```bash
cd canvas-agent
ls dist/
```

如果 dist 目录不存在，运行：
```bash
npm install
npx tsc -p tsconfig.json
```

### Codex 找不到工具

检查 MCP 是否正确配置：
- 在 Codex Desktop 中查看 MCP 列表
- 确认 `infinite-canvas` MCP 已启用

### 网页无法连接 Agent

1. 确认 Agent 正在运行（终端有输出）
2. 检查 token 是否正确
3. 确认浏览器访问的是 `http://127.0.0.1:17371`

## 使用示例

```text
# 打开画布
打开 Infinite Canvas

# 读取画布
读取当前画布并总结节点结构

# 创建节点
创建一个文本节点，内容是"Hello World"

# 生成图片
帮我生成一张赛博朋克风格的背景图
```
