# IncubApp · servidor local — 6. Auto-rebuild cuando cambia la URL del túnel ngrok.
# Se ejecuta al iniciar sesión (después de que WSL/Docker/ngrok estén en marcha).
# Si la URL de ngrok cambió respecto a lo que hay en .env, reconstruye y redesplega.
# Si el dominio es fijo (Cloudflare Tunnel), este script no hace nada y sale en 2 s.
# Henry Stark Desarrollador · 27-09-2026
$ErrorActionPreference = "Continue"
$aqui   = Split-Path $PSScriptRoot -Parent   # carpeta raíz de IncubApp (c:\IncubApp)
$log    = "$PSScriptRoot\logs\6-auto-rebuild.txt"
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\logs" | Out-Null

function L($t) {
    $msg = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $t"
    Add-Content -Path $log -Value $msg
    Write-Host $msg
}

L "=== Auto-rebuild iniciado ==="

# ── 1. Esperar a que WSL y Docker estén listos (hasta 3 minutos) ──────────────
L "Esperando que WSL y Docker estén listos..."
$ready = $false
for ($i = 0; $i -lt 36; $i++) {
    $test = (wsl.exe -d Ubuntu-24.04 -u root -- sh -c "docker ps -q 2>/dev/null | wc -l" 2>&1) -replace "`0",""
    if ($test -match "^\d+$" -and [int]$test -gt 0) { $ready = $true; break }
    Start-Sleep -Seconds 5
}
if (-not $ready) { L "Docker no arrancó en 3 min — saliendo sin rebuild."; exit 0 }
L "Docker listo."

# ── 2. Si hay Cloudflare Tunnel activo → URL fija, no hace falta rebuild ──────
$hasTunel = (wsl.exe -d Ubuntu-24.04 -u root -- sh -c "docker inspect incubapp-tunel --format '{{.State.Running}}' 2>/dev/null" 2>&1) -replace "`0",""
if ($hasTunel -match "true") {
    L "Cloudflare Tunnel activo -> URL fija, no se necesita rebuild automático."
    exit 0
}

# ── 3. Obtener URL pública de ngrok ──────────────────────────────────────────
L "Consultando URL pública de ngrok..."
$ngrokJson = (wsl.exe -d Ubuntu-24.04 -u root -- sh -c "curl -s --max-time 10 http://localhost:4040/api/tunnels 2>/dev/null" 2>&1) -replace "`0",""
if (-not $ngrokJson -or $ngrokJson -notmatch "public_url") {
    L "ngrok no responde. Reintentando en 30 s..."
    Start-Sleep -Seconds 30
    $ngrokJson = (wsl.exe -d Ubuntu-24.04 -u root -- sh -c "curl -s --max-time 10 http://localhost:4040/api/tunnels 2>/dev/null" 2>&1) -replace "`0",""
}
if (-not $ngrokJson -or $ngrokJson -notmatch "public_url") {
    L "ngrok sigue sin responder — saliendo sin rebuild."; exit 0
}

try {
    $parsed = $ngrokJson | ConvertFrom-Json
    $newUrl = ($parsed.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
    if (-not $newUrl) { $newUrl = $parsed.tunnels[0].public_url }
} catch { L "Error parseando JSON de ngrok: $_"; exit 0 }
if (-not $newUrl) { L "No se encontró URL https en ngrok."; exit 0 }
L "URL actual de ngrok: $newUrl"

# ── 4. Comparar con la URL en .env ───────────────────────────────────────────
$envFile    = "$aqui\.env"
$envLines   = Get-Content $envFile -Encoding UTF8
$currentUrl = ($envLines | Where-Object { $_ -match "^VITE_SUPABASE_URL=" }) -replace "^VITE_SUPABASE_URL=",""

if ($currentUrl -eq $newUrl) {
    L "URL sin cambios ($currentUrl) — no se necesita rebuild."; exit 0
}
L "URL cambio: '$currentUrl' -> '$newUrl'"

# ── 5. Actualizar .env ────────────────────────────────────────────────────────
$newLines = $envLines | ForEach-Object {
    if ($_ -match "^VITE_SUPABASE_URL=") { "VITE_SUPABASE_URL=$newUrl" } else { $_ }
}
Set-Content -Path $envFile -Value $newLines -Encoding UTF8
L ".env actualizado."

# ── 6. npm run build ──────────────────────────────────────────────────────────
L "Reconstruyendo app (npm run build)..."
$buildLog = "$PSScriptRoot\logs\6-build.txt"
$p = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "cd /d `"$aqui`" && npm run build >> `"$buildLog`" 2>&1" `
    -Wait -PassThru -NoNewWindow
L "Build termino con codigo $($p.ExitCode)."
if ($p.ExitCode -ne 0) { L "Build fallo — ver logs\6-build.txt"; exit 1 }

# ── 7. Docker compose build + up ─────────────────────────────────────────────
L "Reconstruyendo imagen Docker y redesployando..."
$wslPath = "/mnt/" + $aqui.Substring(0,1).ToLower() + ($aqui.Substring(2) -replace "\\","/")
wsl.exe -d Ubuntu-24.04 -u root -- bash -c "cd '$wslPath' && docker compose build incubapp --no-cache >> /mnt/c/IncubApp/servidor-local/logs/6-docker.txt 2>&1 && docker compose up -d incubapp >> /mnt/c/IncubApp/servidor-local/logs/6-docker.txt 2>&1"
L "Redeploy completo. App en linea en: $newUrl"
L "=== Fin auto-rebuild ==="
