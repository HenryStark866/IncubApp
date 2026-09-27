@echo off
:: Crea la tarea programada de auto-rebuild. Requiere admin.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando permisos de administrador...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
echo Registrando tarea IncubApp Auto-Rebuild URL...
schtasks /Create /TN "IncubApp Auto-Rebuild URL" /TR "PowerShell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""c:\IncubApp\servidor-local\6-auto-rebuild.ps1""" /SC ONLOGON /RL HIGHEST /F
if %errorlevel% equ 0 (
    echo.
    echo LISTO. La tarea se ejecutara automaticamente al iniciar sesion.
    echo Redetecta la URL de ngrok y reconstruye la app si cambia.
) else (
    echo ERROR al registrar la tarea. Codigo: %errorlevel%
)
pause
