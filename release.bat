@echo off
title Babel Agent - release

rem Make a release: asks for the new version, runs typecheck and tests,
rem creates the version commit and tag, then pushes them to origin.
rem GitHub Actions builds the installer from the tag and publishes it.
rem Usage: release.bat [version]   e.g. release.bat 0.1.1
rem The steps live in scripts\release.cjs.

pushd "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on PATH.
  goto :fail
)

if not exist "node_modules" (
  echo [ERROR] Dependencies are missing. Run npm install first.
  goto :fail
)

call npm run --silent release -- %*
if errorlevel 1 goto :fail

echo.
echo Press any key to close this window.
pause >nul
popd
exit /b 0

:fail
echo.
echo Press any key to close this window.
pause >nul
popd
exit /b 1
