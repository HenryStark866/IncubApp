# IncubApp · servidor local — corre en orden los pasos 1 (admin), 2, 3 y 4.
$aqui = $PSScriptRoot
$log = "$aqui\logs\continuar.txt"
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
function L($t) { "$(Get-Date -Format s) $t" | Tee-Object -FilePath $log -Append }
L '=== Continuar instalación ==='
# Candado: evita que corran dos copias a la vez.
$candado = "$aqui\logs\continuar.lock"
if (Test-Path $candado) {
  $otro = [int](Get-Content $candado -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($otro -and $otro -ne $PID -and (Get-Process -Id $otro -ErrorAction SilentlyContinue)) { L 'Ya hay una instalación en curso; esta copia se cierra.'; exit 0 }
}
Set-Content $candado $PID
try {
$listo1 = ((wsl.exe -l -q 2>$null) -replace "`0", '' | Where-Object { $_ }) -contains 'Ubuntu-24.04' -and (Select-String -Path "$env:USERPROFILE\.wslconfig" -Pattern '^memory=\d+MB$' -Quiet -ErrorAction SilentlyContinue)
if ($listo1) { L 'Paso 1 ya estaba hecho (Ubuntu instalado y .wslconfig listo): se salta.' }
else {
  L 'Paso 1 (acepta la ventana de administrador)'
  try { $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Minimized -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$aqui\1-preparar-windows.ps1`"" -ErrorAction Stop }
  catch { L "DETENIDO: no se aceptó la ventana de administrador ($($_.Exception.Message))."; exit 1 }
  if (-not $p) { L 'DETENIDO: no se dio el permiso de administrador.'; exit 1 }
  L "Paso 1 terminó con código $($p.ExitCode)"
}
$ok = ((& wsl.exe -d Ubuntu-24.04 -u root -- echo WSL_OK 2>&1 | Out-String) -replace "`0", '')
L "Prueba de Ubuntu: $ok"
if ($ok -notmatch 'WSL_OK') { L 'DETENIDO: Ubuntu/WSL no arranca (¿virtualización activada en la BIOS?).'; exit 1 }
L 'Paso 2: Docker + Supabase (15-30 min)'
& "$aqui\2-instalar-servidor.ps1"
$srv = ((& wsl.exe -d Ubuntu-24.04 -u root -- sh -c 'test -f /opt/incubapp/server/.env && docker ps -q | wc -l' 2>&1 | Out-String) -replace "`0", '').Trim()
L "Contenedores de Supabase en marcha: $srv"
if (-not ($srv -match '^\d+$') -or [int]$srv -lt 5) { L 'DETENIDO: el paso 2 no dejó el servidor funcionando; ver logs\2-instalar.txt'; exit 1 }
L 'Paso 3: restaurar backup'
& "$aqui\3-restaurar-backup.ps1"
L 'Paso 4: respaldo diario'
& "$aqui\4-activar-respaldo.ps1"
L '=== FIN ==='
} finally { Remove-Item $candado -Force -ErrorAction SilentlyContinue }
