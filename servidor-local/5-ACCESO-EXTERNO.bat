@echo off
title IncubApp - Acceso desde fuera de la oficina
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp05-acceso-externo.ps1"
echo.
pause
