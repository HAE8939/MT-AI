@echo off
chcp 65001 >nul
echo ========================================
echo Infinite Canvas Agent
echo ========================================
echo.

cd canvas-agent
echo 启动 Agent 服务器...
echo.
echo 重要：保持此窗口运行，不要关闭！
echo ========================================
echo.

node dist/index.js

echo.
echo Agent 已停止，按任意键关闭窗口...
pause >nul
