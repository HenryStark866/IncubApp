# IncubApp · servidor local — registra el arranque automático (requiere administrador).
# Dos tareas que ejecutan arranque-windows.ps1:
#   · «IncubApp Arranque»: al encender Windows, aunque nadie inicie sesión (tras un apagón).
#   · «IncubApp Servidor»: al iniciar sesión, por si la primera no alcanzó a levantar todo.
# Ambas son seguras de correr a la vez: solo levantan lo que esté caído.
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'arranque-windows.ps1'
$usuario = "$env:USERDOMAIN\$env:USERNAME"
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

$alEncender = New-ScheduledTaskTrigger -AtStartup
$alEncender.Delay = 'PT30S'
Register-ScheduledTask -TaskName 'IncubApp Arranque' -Action $accion -Trigger $alEncender -Settings $ajustes `
  -Principal (New-ScheduledTaskPrincipal -UserId $usuario -LogonType S4U -RunLevel Highest) `
  -Description 'Levanta WSL, Docker y la app IncubApp al encender Windows (sin iniciar sesión)' -Force | Out-Null
Write-Host 'Tarea «IncubApp Arranque» (al encender el equipo) registrada'

Register-ScheduledTask -TaskName 'IncubApp Servidor' -Action $accion -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $usuario) -Settings $ajustes `
  -Principal (New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Highest) `
  -Description 'Levanta WSL, Docker y la app IncubApp al iniciar sesión' -Force | Out-Null
Write-Host 'Tarea «IncubApp Servidor» (al iniciar sesión) registrada'

# Reglas portproxy viejas (ARREGLAR_RED.bat): con red en espejo bloquean los puertos al reiniciar.
foreach ($p in 80, 443, 8000, 4040) { netsh interface portproxy delete v4tov4 listenport=$p listenaddress=0.0.0.0 2>$null | Out-Null }
Write-Host 'Reglas portproxy de los puertos 80/443/8000/4040 eliminadas'

Start-ScheduledTask -TaskName 'IncubApp Arranque'
Write-Host 'Arranque lanzado. Registro: servidor-local\logs\arranque.txt'
