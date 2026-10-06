# IncubApp · servidor local — 14. Exporta las rondas, OTs, cargues, transferencias y
# nacimientos de INC-05, INC-23 y NAC-07..12 (12-09 a 06-10-2026) a un JSON para analizar.
# Para otras máquinas o fechas: exportar-ciclo.sh "INC-01,NAC-01" 2026-09-01 2026-09-30
# Autor: Henry Taborda — Ing. en desarrollo de software. Solo lee la base.
$aqui = $PSScriptRoot
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
wsl.exe -d Ubuntu-24.04 -u root -- bash (AWsl "$aqui\exportar-ciclo.sh") @args
if ($LASTEXITCODE -eq 0) {
  Write-Host "`nListo. Envíe a Claude el archivo de la carpeta que se abre (servidor-local\exportes)." -ForegroundColor Green
  Start-Process explorer.exe "$aqui\exportes"
} else { Write-Host "`nNo se pudo exportar. Copie lo que aparece arriba y envíelo a soporte." -ForegroundColor Red }
