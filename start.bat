@echo off
cd /d %~dp0
where bun >nul 2>nul
if errorlevel 1 (
  echo [ERROR] bun not found. Please install it first: https://bun.sh/docs/installation
  pause
  exit /b 1
)
echo Starting mimocode provider manager...
echo Closing this window will stop the service.
start "" http://127.0.0.1:4173
bun server.ts
