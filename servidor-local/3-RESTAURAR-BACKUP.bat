@echo off
title IncubApp - Restaurar backup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp03-restaurar-backup.ps1"
echo.
pause
