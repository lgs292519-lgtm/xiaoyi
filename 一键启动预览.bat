@echo off
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
echo If you see "python is not recognized", install Python and re-run.
echo Close the server window to stop.
echo.

REM Start server in a new window so this script can open browser.
powershell -NoProfile -Command "Start-Process -WindowStyle Normal -FilePath python -ArgumentList '-m','http.server','%PORT%' -WorkingDirectory '%CD%'"

REM Give the server a moment to start, then open browser.
timeout /t 2 /nobreak >nul
start "" "%URL%"

endlocal

