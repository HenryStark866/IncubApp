# IncubApp · Instala el bot de rondas en el PC EAGLETRAX (12-10-2026)
# 1. Copia el bot a C:\IncubAppBot
# 2. Pide el correo y la clave de la cuenta del bot (cuenta «Observador» creada en
#    IncubApp > Administración). La clave queda cifrada con Windows para este usuario: no se
#    guarda en texto ni sale del equipo.
# 3. Calibra: se ubica cada máquina en el plano de EagleTrax.
# 4. Programa la tarea «IncubApp Bot Rondas» cada hora (minuto 05), con la sesión iniciada.
$ErrorActionPreference = 'Stop'
$origen = $PSScriptRoot
# Si se abrió el instalador de la carpeta de origen, la configuración está en «paquete»
if (-not (Test-Path (Join-Path $origen 'config.json')) -and (Test-Path (Join-Path $origen 'paquete\config.json'))) {
  $origen = Join-Path $origen 'paquete'
}
$destino = 'C:\IncubAppBot'
Write-Host "=== Bot de rondas EagleTrax → IncubApp ===" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $origen 'config.json'))) {
  Write-Host 'Falta config.json: abre la carpeta «paquete» y ejecuta el INSTALAR-BOT-EAGLETRAX.bat que está adentro.' -ForegroundColor Red
  exit 1
}
New-Item -ItemType Directory -Force -Path $destino | Out-Null
foreach ($f in 'bot-eagletrax.ps1', 'config.json', 'LEEME.md') { Copy-Item (Join-Path $origen $f) $destino -Force }
if (Test-Path (Join-Path $origen 'maquinas.json')) { Copy-Item (Join-Path $origen 'maquinas.json') $destino -Force }

$cfg = Get-Content (Join-Path $destino 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
try {
  $r = Invoke-WebRequest -Uri "$($cfg.url.TrimEnd('/'))/auth/v1/health" -Headers @{ apikey = $cfg.anon_key } -UseBasicParsing -TimeoutSec 20
  Write-Host "Conexión con IncubApp: OK ($($r.StatusCode))." -ForegroundColor Green
} catch {
  Write-Host "Este PC no llega a $($cfg.url): $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Revisa que tenga internet (el bot sube los pantallazos por esa dirección) y vuelve a ejecutar el instalador.' -ForegroundColor Red
  exit 1
}
$correo = Read-Host "Correo de la cuenta del bot [$($cfg.email)]"
if ($correo) { $cfg.email = $correo.Trim(); $cfg | ConvertTo-Json | Set-Content (Join-Path $destino 'config.json') -Encoding UTF8 }
$clave = Read-Host 'Clave de la cuenta del bot' -AsSecureString
$clave | ConvertFrom-SecureString | Set-Content (Join-Path $destino 'clave.bin')
Write-Host 'Clave guardada cifrada.' -ForegroundColor Green

if (-not (Test-Path (Join-Path $destino 'maquinas.json')) -or (Read-Host '¿Calibrar las posiciones de las máquinas ahora? (s/n)') -eq 's') {
  Write-Host 'Deja EagleTrax abierto en el plano de la planta.' -ForegroundColor Yellow
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $destino 'bot-eagletrax.ps1') -Calibrar
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $destino 'bot-eagletrax.ps1') -RegistrarTarea
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $origen 'accesos-directos.ps1')
Write-Host 'Importante: deja la sesión de Windows iniciada, sin bloqueo de pantalla ni protector, y EagleTrax abierto en el plano.' -ForegroundColor Yellow
Write-Host "Prueba ya una máquina:  powershell -ExecutionPolicy Bypass -File $destino\bot-eagletrax.ps1 -Probar INC-18" -ForegroundColor Cyan
