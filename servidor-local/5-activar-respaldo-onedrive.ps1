# IncubApp · Activar respaldo diario a OneDrive
# Crea una Tarea Programada de Windows que corre a las 2:00 AM todos los días
# Henry Stark Desarrollador · 26-09-2026

$ErrorActionPreference = "Stop"

# Requiere elevación
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host "Solicitando permisos de administrador..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$TASK_NAME = "IncubApp Respaldo OneDrive"
$SCRIPT_WSL = "/mnt/c/IncubApp/servidor-local/respaldo-onedrive.sh"

# Instalar rsync en WSL si no existe
Write-Host "Verificando rsync en WSL..." -ForegroundColor Cyan
wsl.exe -d Ubuntu-24.04 -u root -- bash -c "command -v rsync || apt-get install -y rsync 2>/dev/null | tail -1"

# Crear la acción: correr el script bash dentro de WSL
$Action = New-ScheduledTaskAction `
    -Execute "wsl.exe" `
    -Argument "-d Ubuntu-24.04 -u root -- bash `"$SCRIPT_WSL`""

# Ejecutar todos los días a las 2:00 AM
$Trigger = New-ScheduledTaskTrigger -Daily -At "2:00AM"

# Condición: solo si hay red (OneDrive necesita internet para sincronizar)
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -WakeToRun:$false

# Registrar la tarea
$existing = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
    Write-Host "Tarea anterior eliminada." -ForegroundColor Yellow
}

Register-ScheduledTask `
    -TaskName $TASK_NAME `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -RunLevel Highest `
    -Description "Respaldo diario de IncubApp: base de datos PostgreSQL y archivos a OneDrive" `
    | Out-Null

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host " Respaldo diario configurado correctamente!" -ForegroundColor Green
Write-Host " Tarea: $TASK_NAME" -ForegroundColor Green
Write-Host " Horario: Todos los dias a las 2:00 AM" -ForegroundColor Green
Write-Host " Destino: OneDrive\IncubApp-Respaldos\" -ForegroundColor Green
Write-Host " Incluye: Base de datos + Fotos/Evidencias" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""

# Ejecutar un primer respaldo ahora mismo para verificar que funciona
Write-Host "Ejecutando primer respaldo ahora mismo..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $TASK_NAME
Write-Host "Respaldo iniciado en segundo plano. Revisa en 2-3 minutos:" -ForegroundColor Green
Write-Host " OneDrive\IncubApp-Respaldos\$(Get-Date -Format 'yyyy-MM-dd')\" -ForegroundColor Cyan
