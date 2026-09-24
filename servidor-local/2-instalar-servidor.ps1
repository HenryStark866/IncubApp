# IncubApp · servidor local — 2. Instalar Docker + Supabase dentro de Ubuntu (WSL).
$aqui = $PSScriptRoot
$wslPath = '/mnt/' + $aqui.Substring(0,1).ToLower() + ($aqui.Substring(2) -replace '\\', '/')
Write-Host "Instalando servidor (puede tardar 15-30 minutos la primera vez)..." -ForegroundColor Cyan
wsl.exe -d Ubuntu-24.04 -u root -- bash "$wslPath/instalar.sh"
Write-Host "`nTerminó con código $LASTEXITCODE. El registro está en servidor-local\logs\2-instalar.txt" -ForegroundColor Green
