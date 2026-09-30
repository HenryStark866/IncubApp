# IncubApp · servidor local — 9. Arranque automático al encender el equipo.
# Deja todo listo para que, tras un reinicio o un corte de luz, IncubApp vuelva sola y
# rápido, AUNQUE NADIE INICIE SESIÓN en Windows:
#   1. En Ubuntu: servicio que levanta Supabase, la app y el túnel al encender, y un
#      vigilante que cada minuto revisa que la app responda y levanta lo que se caiga.
#   2. En Windows: la tarea «IncubApp Servidor» arranca Ubuntu al encender (sin esperar
#      a que alguien entre). Pide la contraseña de Windows UNA vez: la guarda Windows,
#      no este script.
#   3. Si hay un conector de Cloudflare instalado como servicio de Windows, lo apaga:
#      desde Windows no puede llegar a la app (incubapp:80) y daba 502 al turnarse
#      con el conector bueno, el de Docker.
# Henry Stark Desarrollador · 30-09-2026
$ErrorActionPreference = 'Continue'
$yo = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $yo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Pidiendo permisos de administrador...' -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}
$aqui = $PSScriptRoot
$distro = 'Ubuntu-24.04'
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
$log = "$aqui\logs\9-arranque.txt"
function L($t, $c = 'Gray') { Add-Content -Path $log -Value "$(Get-Date -Format s) $t"; Write-Host $t -ForegroundColor $c }
L '=== Arranque automático de IncubApp ===' 'Cyan'

# ── 1. Servicios en Ubuntu ────────────────────────────────────────────────────
L '1/4 Instalando el arranque y el vigilante dentro de Ubuntu...'
$sh = AWsl "$aqui\arranque.sh"
$pid1 = ((wsl.exe -d $distro -u root -- ps -p 1 -o comm=) -replace "`0", '').Trim()
if ($pid1 -ne 'systemd') {
  L '   Ubuntu no está usando systemd: se reinicia Ubuntu para activarlo.' 'Yellow'
  wsl.exe --shutdown
  Start-Sleep 5
}
wsl.exe -d $distro -u root -- bash $sh --instalar 2>&1 | ForEach-Object { L "   $_" }

# ── 2. Tarea de Windows que enciende Ubuntu al arrancar, sin iniciar sesión ─────
L '2/4 Tarea «IncubApp Servidor»: arrancar al encender el equipo...'
$usuario = "$env:USERDOMAIN\$env:USERNAME"
$accion = New-ScheduledTaskAction -Execute 'wsl.exe' -Argument "-d $distro -u root -- sh -c `"systemctl start docker incubapp-arranque.service incubapp-vigia.timer >/dev/null 2>&1; exec sleep infinity`""
$disparos = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn -User $usuario)
)
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Write-Host ''
Write-Host "Escriba la contraseña con la que entra a Windows el usuario $usuario." -ForegroundColor Cyan
Write-Host '(Si entra con cuenta Microsoft, es la contraseña de esa cuenta, no el PIN.)' -ForegroundColor Cyan
Write-Host 'Windows la guarda para poder arrancar el servidor sin que nadie inicie sesión.' -ForegroundColor Cyan
$sec = Read-Host 'Contraseña de Windows (no se muestra)' -AsSecureString
$plano = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$sinSesion = $false
try {
  Register-ScheduledTask -TaskName 'IncubApp Servidor' -Action $accion -Trigger $disparos -Settings $ajustes `
    -User $usuario -Password $plano -RunLevel Highest -Force `
    -Description 'Arranca Ubuntu (WSL), Docker, Supabase, la app y el túnel de IncubApp al encender, sin iniciar sesión' -ErrorAction Stop | Out-Null
  $sinSesion = $true
  L '   Listo: arranca al encender el equipo, aunque nadie inicie sesión.' 'Green'
} catch {
  L "   Windows no aceptó la contraseña ($($_.Exception.Message))." 'Yellow'
  L '   Se deja arrancando al iniciar sesión. Vuelva a correr este archivo para reintentar.' 'Yellow'
  Register-ScheduledTask -TaskName 'IncubApp Servidor' -Action $accion -Trigger $disparos[1] -Settings $ajustes `
    -RunLevel Highest -Force -Description 'Arranca IncubApp al iniciar sesión' | Out-Null
} finally {
  $plano = $null
}

# ── 3. Conector de Cloudflare instalado en Windows (sobra y causa 502) ─────────
L '3/4 Revisando conectores de Cloudflare en Windows...'
$cf = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($cf) {
  L '   Hay un conector de Cloudflare instalado como servicio de Windows. Desde Windows no' 'Yellow'
  L '   puede llegar a la app (incubapp:80) y Cloudflare le manda visitas: eso da 502.' 'Yellow'
  L '   Se detiene y se desactiva. El conector bueno es el contenedor incubapp-tunel.' 'Yellow'
  Stop-Service -Name 'cloudflared' -Force -ErrorAction SilentlyContinue
  Set-Service -Name 'cloudflared' -StartupType Disabled -ErrorAction SilentlyContinue
} else {
  L '   No hay conector de Cloudflare en Windows (bien: solo el de Docker).'
}

# ── 4. Arrancar ya y comprobar ─────────────────────────────────────────────────
L '4/4 Arrancando ahora y comprobando (hasta 5 minutos)...'
Start-ScheduledTask -TaskName 'IncubApp Servidor'
Start-Sleep 5
wsl.exe -d $distro -u root -- bash $sh 2>&1 | ForEach-Object { L "   $_" }
$ok = $false
for ($i = 1; $i -le 12 -and -not $ok; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1/' -UseBasicParsing -TimeoutSec 10
    $ok = $r.StatusCode -eq 200
  } catch { Start-Sleep 5 }
}
Write-Host ''
if ($ok) { L 'LISTO: la app responde en este equipo. Pruebe https://incubapp.cdhmaker.com' 'Green' }
else { L 'La app aún no responde aquí; el vigilante seguirá intentando cada minuto. Detalle en servidor-local\logs\9-arranque.txt' 'Yellow' }
if ($sinSesion) { L 'Tras un reinicio vuelve sola en 1 a 3 minutos, sin iniciar sesión.' 'Green' }
