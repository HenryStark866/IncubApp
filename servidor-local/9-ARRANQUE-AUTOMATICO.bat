@echo off
title IncubApp - Arranque automatico
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp09-arranque-automatico.ps1"
echo.
pause
