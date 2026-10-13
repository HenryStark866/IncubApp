@echo off
rem IncubApp - actualiza solo el programa del bot (no pide clave ni recalibra)
if not exist "C:\IncubAppBot\config.json" (
  echo El bot no esta instalado. Ejecuta INSTALAR-BOT-EAGLETRAX.bat
  pause
  exit /b 1
)
schtasks /End /TN "IncubApp Bot Rondas" >nul 2>&1
copy /Y "%~dp0bot-eagletrax.ps1" "C:\IncubAppBot\bot-eagletrax.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\IncubAppBot\bot-eagletrax.ps1" -RegistrarTarea
echo Bot actualizado. Las posiciones calibradas y la clave se conservan.
pause
