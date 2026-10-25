@echo off
rem Double-click to start Avatar Cropper. Extra options go to start.ps1 (e.g. start.cmd -Sync).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
