@echo off
chcp 65001 >nul
echo ==========================================
echo 乒乓球预约系统 - 启动脚本
echo ==========================================
echo.

cd /d %~dp0

echo 检查 Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo Node.js 已安装
node --version
echo.

echo 检查 data 目录...
if not exist "data" (
    echo 创建 data 目录...
    mkdir data
)

echo 启动服务器...
echo.
node server.js

pause

