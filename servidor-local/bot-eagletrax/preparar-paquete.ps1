# IncubApp · Arma la carpeta para llevar al PC EAGLETRAX (se corre en el servidor)
# Toma la dirección y la clave pública (anon) de .env.production y deja todo en
# servidor-local\bot-eagletrax\paquete (fuera de git). Esa carpeta se copia al PC EAGLETRAX
# y allá se ejecuta INSTALAR-BOT-EAGLETRAX.bat.
$aqui = $PSScriptRoot
$raiz = Resolve-Path (Join-Path $aqui '..\..')
$env = Get-Content (Join-Path $raiz '.env.production') -Encoding UTF8
$key = ($env | Where-Object { $_ -match '^VITE_SUPABASE_KEY=' }) -replace '^VITE_SUPABASE_KEY=', ''
if (-not $key) { Write-Host 'No encontré VITE_SUPABASE_KEY en .env.production' -ForegroundColor Red; exit 1 }
$paq = Join-Path $aqui 'paquete'
New-Item -ItemType Directory -Force -Path $paq | Out-Null
foreach ($f in 'bot-eagletrax.ps1', 'instalar.ps1', 'INSTALAR-BOT-EAGLETRAX.bat', 'LEEME.md') { Copy-Item (Join-Path $aqui $f) $paq -Force }
[ordered]@{
  url = 'https://incubapp.cdhmaker.com'
  anon_key = $key.Trim()
  email = 'bot.rondas@incubant.co'
  ventana_eagletrax = 'EagleTrax'
  ventana_maquina = 'OX Remote Control'
  espera_datos_seg = 4
} | ConvertTo-Json | Set-Content (Join-Path $paq 'config.json') -Encoding UTF8
Write-Host "Paquete listo en $paq. Cópialo al PC EAGLETRAX y ejecuta INSTALAR-BOT-EAGLETRAX.bat." -ForegroundColor Green
