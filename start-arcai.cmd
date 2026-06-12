@echo off
setlocal
set "APP_DIR=%~dp0"
set "NODE_EXE=C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  echo ArcAI could not find the bundled Node.js runtime.
  echo Expected: %NODE_EXE%
  pause
  exit /b 1
)

start "ArcAI server" /min "%NODE_EXE%" "%APP_DIR%server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173/"
endlocal
