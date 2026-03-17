@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

REM Pick an available port starting from 5173
set "PORT=5173"
:pick_port
powershell -NoProfile -Command "exit (Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue | Measure-Object).Count" >nul 2>&1
if "%ERRORLEVEL%" NEQ "0" (
  set /a PORT=%PORT%+1
  goto pick_port
)

set "URL=http://127.0.0.1:%PORT%/"

echo Starting local server at %URL%
echo.
powershell -NoProfile -Command "Start-Process -WindowStyle Normal -FilePath python -ArgumentList '-m','http.server','%PORT%' -WorkingDirectory '%CD%'"

timeout /t 2 /nobreak >nul
start "" "%URL%"

endlocal

