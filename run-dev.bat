@echo off
title Babel Agent - dev

rem Always run from the folder this script lives in, not the caller's cwd.
pushd "%~dp0"

rem --- 1. Node.js must be on PATH -------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on PATH.
  echo         Install Node.js 20 or newer, then run this script again.
  goto :fail
)

rem --- 2. Dependencies -------------------------------------------------------
if not exist "node_modules" (
  echo [1/3] Installing dependencies. First run only, takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    goto :fail
  )
) else (
  echo [1/3] Dependencies OK.
)

rem --- 3. Electron binary ----------------------------------------------------
rem Electron 44 has no postinstall script, so the binary can be missing
rem even when node_modules exists.
if not exist "node_modules\electron\dist\electron.exe" (
  echo [2/3] Downloading Electron binary...
  call node "node_modules\electron\install.js"
  if errorlevel 1 (
    echo [ERROR] Electron download failed. Check network or proxy settings.
    goto :fail
  )
) else (
  echo [2/3] Electron binary OK.
)

rem --- 4. Start the app ------------------------------------------------------
echo [3/3] Starting Babel Agent...
echo       This console shows the dev logs. Closing it stops the app.
echo.
call npm run dev
if errorlevel 1 (
  echo.
  echo [ERROR] Dev server exited with an error. See the log above.
  goto :fail
)

popd
exit /b 0

:fail
echo.
echo Press any key to close this window.
pause >nul
popd
exit /b 1
