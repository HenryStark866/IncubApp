# Bot de rondas EagleTrax → IncubApp

Corre en el PC **EAGLETRAX** (192.168.5.25). Cada hora, en el minuto 05:

1. Pone EagleTrax en primer plano (maximizado, en el plano de la planta).
2. Por cada máquina (INC-01 a INC-24, NAC-01 a NAC-12) hace doble clic en su pantallita,
   espera la ventana **OX Remote Control**, le toma el pantallazo y la cierra.
3. Sube la imagen a IncubApp como la ronda de esa hora (`machine_checks`, nota
   `[bot-eagletrax]`). El lector de fotos del servidor llena temperatura ovoscan y de aire,
   humedad, CO₂ y volteos, igual que con las fotos del turnero.

Con el bot reportando, el operario de turno **solo hace la ronda de recibir el turno**. Si
el bot no reporta en 2 horas (PC apagado, EagleTrax cerrado, sesión bloqueada), la app vuelve
a exigir las rondas de siempre y el líder lo ve en el flujo.

## Instalar

1. En IncubApp > Administración, crea la cuenta del bot (por ejemplo
   `bot.rondas@incubant.co`) con el rol **Observador** y apruébala.
2. En el servidor: `powershell -ExecutionPolicy Bypass -File preparar-paquete.ps1`.
3. Copia la carpeta `paquete` al PC EAGLETRAX y ejecuta `INSTALAR-BOT-EAGLETRAX.bat`:
   pide el correo y la clave de la cuenta del bot (queda cifrada con Windows), calibra y
   programa la tarea.

## Calibrar (una vez, o si cambia el plano de EagleTrax)

`powershell -ExecutionPolicy Bypass -File C:\IncubAppBot\bot-eagletrax.ps1 -Calibrar`

Por cada máquina pon el puntero en el centro de su pantallita en el plano y presiona ENTER
(`s` + ENTER salta una). Las posiciones se guardan relativas a la ventana maximizada.

## Probar

`powershell -ExecutionPolicy Bypass -File C:\IncubAppBot\bot-eagletrax.ps1 -Probar INC-18`
deja `prueba-INC-18.jpg` en la carpeta sin subir nada. `-SinSubir` hace la ronda completa
sin subir.

## Condiciones del PC

- Sesión de Windows iniciada, sin bloqueo automático ni protector de pantalla.
- EagleTrax abierto en el plano de la planta.
- Durante la ronda (unos 4 minutos) no usar el mouse en ese PC.

Registro de cada ronda: `C:\IncubAppBot\logs\ronda-AAAA-MM-DD.txt`.
