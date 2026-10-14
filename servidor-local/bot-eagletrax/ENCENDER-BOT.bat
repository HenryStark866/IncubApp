@echo off
rem IncubApp - enciende el bot de rondas EagleTrax (vuelve a correr cada hora en el minuto 05)
title Encender bot de rondas IncubApp
schtasks /Query /TN "IncubApp Bot Rondas" >nul 2>&1
if errorlevel 1 (
  echo El bot no esta instalado en este PC. Ejecuta INSTALAR-BOT-EAGLETRAX.bat
  pause
  exit /b 1
)
schtasks /Change /TN "IncubApp Bot Rondas" /ENABLE >nul
echo.
echo  BOT ENCENDIDO: hace la ronda cada hora en el minuto 05.
echo  Deja EagleTrax abierto en el plano y no uses el mouse unos 5 minutos en esos momentos.
echo.
choice /C SN /M "Hacer una ronda ahora mismo"
if errorlevel 2 goto fin
schtasks /Run /TN "IncubApp Bot Rondas" >nul
echo Ronda iniciada: no toques el mouse por unos 5 minutos.
:fin
echo.
pause
