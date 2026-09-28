# IncubApp · servidor local — 7. Actualiza la app con lo último de GitHub y la vuelve a publicar.
# Trae los cambios de la rama actual, reconstruye el contenedor `incubapp` (nginx + app)
# y comprueba que responde. Supabase y la base de datos no se tocan.
$aqui = $PSScriptRoot
$raiz = Split-Path $aqui -Parent
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
$log = "$aqui\logs\7-actualizar.txt"
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
function L($t, $c = 'Gray') { $m = "$(Get-Date -Format s) $t"; Add-Content -Path $log -Value $m; Write-Host $t -ForegroundColor $c }

Set-Location $raiz
$rama = (git rev-parse --abbrev-ref HEAD).Trim()
L "=== Actualizar IncubApp (rama $rama) ===" 'Cyan'
L 'Trayendo cambios de GitHub...'
git pull --ff-only 2>&1 | ForEach-Object { L "  $_" }
if ($LASTEXITCODE -ne 0) {
  L 'No se pudo traer los cambios sin mezclar (hay cambios locales o la rama se separó).' 'Red'
  L 'Revisa con "git status" o avisa a soporte antes de seguir. No se cambió nada.' 'Red'
  exit 1
}
L "Versión: $(git log -1 --format='%h %s')"

L 'Reconstruyendo la app (2 a 5 minutos)...'
$wslRaiz = AWsl $raiz
wsl.exe -d Ubuntu-24.04 -u root -- bash -c "cd '$wslRaiz' && docker compose build incubapp && docker compose up -d incubapp" 2>&1 | ForEach-Object { Add-Content -Path $log -Value $_ }
if ($LASTEXITCODE -ne 0) { L 'Falló la reconstrucción. Detalle en servidor-local\logs\7-actualizar.txt. La versión anterior sigue en línea si el contenedor no se reemplazó.' 'Red'; exit 1 }

L 'Aplicando cambios pendientes de la base de datos...'
wsl.exe -d Ubuntu-24.04 -u root -- bash "$wslRaiz/servidor-local/aplicar-migraciones.sh" "$wslRaiz" 2>&1 | ForEach-Object { L "  $_" }
if ($LASTEXITCODE -ne 0) { L 'Una migración falló (no quedó a medias). Detalle arriba y en servidor-local\logs\7-actualizar.txt.' 'Red'; exit 1 }

Start-Sleep 3
try {
  $r = Invoke-WebRequest -Uri 'http://localhost/' -UseBasicParsing -TimeoutSec 15
  L "La app responde en este equipo (HTTP $($r.StatusCode))." 'Green'
} catch { L "La app no respondió en http://localhost/: $($_.Exception.Message)" 'Yellow' }
L 'Listo. Quien tenga la app abierta la verá actualizada al recargar.' 'Green'
