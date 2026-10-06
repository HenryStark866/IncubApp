# IncubApp · servidor local — 15. Verifica la última actualización (solo lee).
# Autor: Henry Taborda — Ing. en desarrollo de software
$aqui = $PSScriptRoot
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
wsl.exe -d Ubuntu-24.04 -u root -- bash (AWsl "$aqui\verificar-servidor.sh")
Write-Host "`nEnvíe a Claude el archivo verificacion_*.txt de la carpeta que se abre." -ForegroundColor Green
Start-Process explorer.exe "$aqui\exportes"
