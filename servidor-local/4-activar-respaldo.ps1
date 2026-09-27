# IncubApp · servidor local — 4. Activa la copia de seguridad diaria en OneDrive.
$aqui = $PSScriptRoot
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
$od = Get-ChildItem $env:USERPROFILE -Directory -Filter 'OneDrive - *' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $od) { $od = Get-Item $env:OneDrive -ErrorAction SilentlyContinue }
if (-not $od) { Write-Host 'No encontré la carpeta de OneDrive.' -ForegroundColor Red; exit 2 }
$dest = Join-Path $od.FullName 'IncubApp-Respaldos'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Destino del respaldo: $dest" -ForegroundColor Cyan
# El temporizador diario necesita systemd: si Ubuntu arrancó sin él, se reinicia Ubuntu
# (Docker vuelve a levantar solo los contenedores de Supabase).
$pid1 = ((wsl.exe -d Ubuntu-24.04 -u root -- ps -p 1 -o comm= 2>$null) -join '').Trim()
if ($pid1 -ne 'systemd') {
  Write-Host "Reiniciando Ubuntu para activar systemd (proceso 1 era '$pid1')..." -ForegroundColor Yellow
  wsl.exe --shutdown; Start-Sleep 8
  wsl.exe -d Ubuntu-24.04 -u root -- sh -c 'ps -p 1 -o comm=; systemctl enable --now docker; sleep 60; docker ps --format "{{.Names}}: {{.Status}}"'
  Start-ScheduledTask -TaskName 'IncubApp Servidor' -ErrorAction SilentlyContinue
}
wsl.exe -d Ubuntu-24.04 -u root -- bash (AWsl "$aqui\instalar-respaldo.sh") (AWsl $dest)
Write-Host "`nTerminó. Registro: servidor-local\logs\respaldo.txt" -ForegroundColor Green
