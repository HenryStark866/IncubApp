@echo off
rem IncubApp - muestra si el bot esta encendido, su ultima y proxima ronda y el registro de hoy
title Estado del bot de rondas IncubApp
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$t = Get-ScheduledTask -TaskName 'IncubApp Bot Rondas' -ErrorAction SilentlyContinue;" ^
  "if (-not $t) { Write-Host 'El bot no esta instalado en este PC.' -ForegroundColor Red; exit };" ^
  "$i = $t | Get-ScheduledTaskInfo;" ^
  "if ($t.State -eq 'Disabled') { Write-Host '  BOT APAGADO' -ForegroundColor Red } elseif ($t.State -eq 'Running') { Write-Host '  BOT ENCENDIDO - haciendo una ronda en este momento' -ForegroundColor Green } else { Write-Host '  BOT ENCENDIDO' -ForegroundColor Green };" ^
  "Write-Host ('  Ultima ronda:  ' + $i.LastRunTime);" ^
  "if ($t.State -ne 'Disabled') { Write-Host ('  Proxima ronda: ' + $i.NextRunTime) };" ^
  "$log = Join-Path 'C:\IncubAppBot\logs' ('ronda-' + (Get-Date -Format 'yyyy-MM-dd') + '.txt');" ^
  "if (Test-Path $log) { Write-Host ''; Write-Host '  Registro de hoy (ultimas lineas):' -ForegroundColor Cyan; Get-Content $log -Tail 12 -Encoding UTF8 | ForEach-Object { Write-Host ('   ' + $_) } }"
echo.
pause
