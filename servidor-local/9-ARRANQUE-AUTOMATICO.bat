@echo off
:: Registra el arranque automatico del servidor (al encender y al iniciar sesion). Requiere admin.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando permisos de administrador...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0registrar-arranque.ps1"
pause
