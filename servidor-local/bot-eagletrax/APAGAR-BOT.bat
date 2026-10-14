@echo off
rem IncubApp - apaga el bot de rondas EagleTrax (deja de correr hasta que lo vuelvas a encender)
title Apagar bot de rondas IncubApp
schtasks /Query /TN "IncubApp Bot Rondas" >nul 2>&1
if errorlevel 1 (
  echo El bot no esta instalado en este PC.
  pause
  exit /b 1
)
rem Detiene la ronda si esta corriendo y desactiva las siguientes
schtasks /End /TN "IncubApp Bot Rondas" >nul 2>&1
schtasks /Change /TN "IncubApp Bot Rondas" /DISABLE >nul
echo.
echo  BOT APAGADO: ya no hace rondas.
echo  Si quedo abierta alguna ventana de maquina (OX Remote Control o Remote Link), cierrala.
echo.
echo  OJO: con el bot apagado, a las 2 horas IncubApp vuelve a pedirle las rondas
echo  de cada hora al operario de turno. Para volver a encenderlo: ENCENDER-BOT.
echo.
pause
