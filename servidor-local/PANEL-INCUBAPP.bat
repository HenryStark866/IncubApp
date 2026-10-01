@echo off
rem Abre el Panel IncubApp (estado, soporte y seguridad del servidor).
cd /d "%~dp0panel"
where pythonw >nul 2>nul && (start "" pythonw panel.py & exit /b 0)
start "" python panel.py
