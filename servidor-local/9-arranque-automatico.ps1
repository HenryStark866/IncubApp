# IncubApp · servidor local — 9. Arranque automático al encender el equipo.
# Deja todo listo para que, tras un reinicio o un corte de luz, IncubApp vuelva sola y
# rápido, AUNQUE NADIE INICIE SESIÓN en Windows:
#   1. En Ubuntu: servicio que levanta Supabase, la app y el túnel al encender, y un
#      vigilante que cada minuto revisa que la app responda y levanta lo que se caiga.
#   2. En Windows: la tarea «IncubApp Servidor» arranca Ubuntu al encender (sin esperar
#      a que alguien entre). Corre como el usuario en modo S4U: no pide contraseña. Se
#      repite cada 5 minutos: si Ubuntu se apagó con Windows encendido, lo vuelve a arrancar.
#   3. Quita reglas «portproxy» viejas de los puertos de la app (ARREGLAR_RED.bat): con la
#      red de WSL en espejo, Windows se adueña de 80/8000/4040 al encender, antes que
#      Docker, y la app y la API no pueden arrancar (29-09-2026).
#   4. Si hay un conector de Cloudflare instalado como servicio de Windows, lo apaga:
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
$alEncender = New-ScheduledTaskTrigger -AtStartup
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User $usuario
# 01-10-2026: si Ubuntu se apagaba con Windows encendido (wsl --shutdown, una falla de WSL),
# la tarea terminaba y nada la volvía a lanzar hasta el próximo reinicio (el vigilante vive
# dentro de Ubuntu). Ahora se repite cada 5 minutos: con «IgnoreNew» no hace nada mientras
# la de siempre siga viva, y si murió la relanza y todo vuelve solo.
$cada5 = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)).Repetition
$alEncender.Repetition = $cada5
$alEntrar.Repetition = $cada5
$disparos = @($alEncender, $alEntrar)
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
# S4U: corre como este usuario aunque nadie haya iniciado sesión, sin guardar contraseña
# (probado en el Lenovo el 29-09-2026: WSL y Docker arrancan bien así).
$sinSesion = $false
try {
  Register-ScheduledTask -TaskName 'IncubApp Servidor' -Action $accion -Trigger $disparos -Settings $ajustes `
    -Principal (New-ScheduledTaskPrincipal -UserId $usuario -LogonType S4U -RunLevel Highest) -Force `
    -Description 'Arranca Ubuntu (WSL), Docker, Supabase, la app y el túnel de IncubApp al encender, sin iniciar sesión' -ErrorAction Stop | Out-Null
  $sinSesion = $true
  L '   Listo: arranca al encender el equipo, aunque nadie inicie sesión.' 'Green'
} catch {
  L "   No se pudo registrar sin sesión ($($_.Exception.Message))." 'Yellow'
  L '   Se deja arrancando al iniciar sesión.' 'Yellow'
  Register-ScheduledTask -TaskName 'IncubApp Servidor' -Action $accion -Trigger $disparos[1] -Settings $ajustes `
    -RunLevel Highest -Force -Description 'Arranca IncubApp al iniciar sesión' | Out-Null
}
# Tareas de un arreglo anterior (29-09-2026) que hacían lo mismo por otro camino.
Unregister-ScheduledTask -TaskName 'IncubApp Arranque' -Confirm:$false -ErrorAction SilentlyContinue

L '   Quitando reglas portproxy de los puertos de la app...'
foreach ($p in 80, 443, 8000, 4040) {
  if ((netsh interface portproxy show v4tov4) -match "\s$p\s") {
    netsh interface portproxy delete v4tov4 listenport=$p listenaddress=0.0.0.0 | Out-Null
    L "   portproxy del puerto $p eliminado (bloqueaba a Docker al encender)" 'Yellow'
  }
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
L 'Si Ubuntu se apaga con Windows encendido, la tarea lo vuelve a arrancar en menos de 5 minutos.' 'Green'
