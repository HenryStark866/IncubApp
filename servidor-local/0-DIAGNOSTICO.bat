@echo off
title IncubApp - Diagnostico
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp00-diagnostico.ps1"
echo.
echo Listo. Avisale a Claude.
pause
