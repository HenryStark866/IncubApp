@echo off
title IncubApp - Activar respaldo diario
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp04-activar-respaldo.ps1"
echo.
pause
