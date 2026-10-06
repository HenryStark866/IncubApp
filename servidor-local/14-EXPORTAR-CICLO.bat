@echo off
title IncubApp - Exportar ciclo para analisis
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp014-exportar-ciclo.ps1" %*
echo.
pause
