@echo off
title IncubApp - Preparar Windows
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath %~f0 -Verb RunAs" & exit /b)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp01-preparar-windows.ps1"
echo.
pause
