# IncubApp · servidor local — 5. Acceso desde fuera de la oficina (Cloudflare Tunnel).
$aqui = $PSScriptRoot
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
Write-Host 'Antes de seguir, en Cloudflare (Zero Trust > Networks > Tunnels):' -ForegroundColor Cyan
Write-Host '  1. Create a tunnel > Cloudflared > nombre: incubapp'
Write-Host '  2. Copia el token (el texto largo despues de "--token" o "install")'
Write-Host '  3. Public hostname: subdominio incubapp + dominio cdhmaker.com > Service: HTTP  >  incubapp:80'
Write-Host '     (cdhmaker.com debe estar agregado a Cloudflare, con sus nameservers)'
Write-Host ''
$sec = Read-Host 'Pega aqui el token del tunel (no se muestra)' -AsSecureString
$tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$tok = ($tok -split '\s+' | Where-Object { $_.Length -gt 50 } | Select-Object -Last 1)
if (-not $tok) { Write-Host 'Token vacio o incompleto.' -ForegroundColor Red; exit 2 }
$url = Read-Host 'Direccion publica [Enter = https://incubapp.cdhmaker.com]'
if (-not $url) { $url = 'https://incubapp.cdhmaker.com' }
$tmp = Join-Path $env:TEMP ("tunel-" + [guid]::NewGuid().ToString('N') + '.txt')
Set-Content -Path $tmp -Value $tok -NoNewline -Encoding ASCII
try { wsl.exe -d Ubuntu-24.04 -u root -- bash (AWsl "$aqui\tunel.sh") (AWsl $tmp) $url }
finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
Write-Host "`nTermino. Registro: servidor-local\logs\5-tunel.txt" -ForegroundColor Green
