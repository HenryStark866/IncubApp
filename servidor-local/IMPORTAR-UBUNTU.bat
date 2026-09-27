@echo off
start "IncubApp - Importando Ubuntu (no cerrar)" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0importar-ubuntu.ps1"
