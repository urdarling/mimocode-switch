@echo off
cd /d %~dp0
where bun >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 bun,请先安装: https://bun.sh/docs/installation
  pause
  exit /b 1
)
echo 启动 mimocode 供应商管理工具...
echo 关闭此窗口即退出服务。
start "" http://127.0.0.1:4173
bun server.ts
