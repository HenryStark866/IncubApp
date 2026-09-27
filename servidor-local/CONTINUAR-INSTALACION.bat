@echo off
rem Corre minimizado: un clic dentro de la consola la pausaria (modo seleccion).
start "IncubApp - Instalando (no cerrar)" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0continuar-instalacion.ps1"
