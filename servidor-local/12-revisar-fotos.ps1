# IncubApp · servidor local — 12. Revisa por qué una foto no se guarda en un depósito
# (wo-evidence / machine-checks). Solo lee y sube archivos de prueba que luego borra.
$aqui = $PSScriptRoot
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
wsl.exe -d Ubuntu-24.04 -u root -- bash (AWsl "$aqui\revisar-fotos.sh")
Write-Host "`nTerminó. Registro: servidor-local\logs\12-fotos.txt" -ForegroundColor Green
