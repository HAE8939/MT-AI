@echo off
chcp 65001 >nul
title MT-AI - 一键启动
echo ========================================
echo MT-AI 一键启动
echo ========================================
echo.

REM 切换到脚本所在目录（支持从任意位置双击运行）
cd /d "%~dp0"

echo [1/2] 启动 Canvas Agent 服务器 (http://127.0.0.1:17371)...
start "Canvas Agent" /d "%~dp0canvas-agent" cmd /k "node dist\index.js"

echo [2/2] 启动 Vite 网页服务 (http://localhost:3000)...
start "Vite Web" /d "%~dp0web" cmd /k "npm run dev"

echo.
echo ========================================
echo 两个服务已在独立窗口中启动：
echo   - Canvas Agent 窗口 (http://127.0.0.1:17371)
echo   - Vite Web 窗口 (http://localhost:3000)
echo.
echo 关闭对应窗口即可停止服务。
echo ========================================
echo.
echo 3 秒后自动打开浏览器...
ping -n 4 127.0.0.1 >nul
start "" http://localhost:3000
exit
