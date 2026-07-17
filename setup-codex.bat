@echo off
chcp 65001 >nul
echo ========================================
echo MT-AI - Codex Desktop 配置脚本
echo ========================================
echo.

:: 检查 canvas-agent 目录
if not exist "canvas-agent" (
    echo [错误] 未找到 canvas-agent 目录
    echo 请确保在 MT-AI 仓库根目录下运行此脚本
    pause
    exit /b 1
)

cd canvas-agent

:: 安装依赖
echo [1/3] 安装依赖...
call npm install
if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)

:: 构建
echo.
echo [2/3] 构建 canvas-agent...
call npx tsc -p tsconfig.json
if errorlevel 1 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

echo.
echo [3/3] 添加 Codex 插件市场...
cd ..

:: 获取当前目录的完整路径
for %%I in (.) do set "CURRENT_DIR=%%~fI"

echo 添加插件市场: %CURRENT_DIR%
call codex plugin marketplace add "%CURRENT_DIR%"
if errorlevel 1 (
    echo [警告] 添加插件市场失败，请检查 Codex CLI 是否已安装
) else (
    echo.
    echo 安装插件...
    call codex plugin add mt-ai@mt-ai-local
    if errorlevel 1 (
        echo [警告] 插件安装失败
    ) else (
        echo.
        echo ========================================
        echo [成功] Codex Desktop 配置完成！
        echo ========================================
        echo.
        echo 下一步：
        echo 1. 开启新的 Codex 对话
        echo 2. 输入"打开 MT-AI"
        echo 3. 开始使用 AI 操作画布
    )
)

echo.
pause
