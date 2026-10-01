@echo off
title IncubApp - Instalar el panel
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp013-instalar-panel.ps1" %*
echo.
pause
