# IncubApp · servidor local — 17. Cierra los hallazgos de seguridad del Lenovo (análisis
# del Panel IncubApp del 01-10-2026) que dependen de este equipo.
#
#   1. PostgreSQL de Windows escuchando en 5432 para toda la red  → se bloquea la entrada
#      desde la red (desde el mismo equipo sigue funcionando).
#   2. Inspector de ngrok (4040) abierto a la red                  → igual que el 1. ngrok ya
#      no se usa: la app sale por el túnel de Cloudflare.
#   3. Puerto 8000 (API de Supabase) abierto en el firewall          → la app no lo necesita
#      desde la red: el celular entra por incubapp.cdhmaker.com y la API va por el puerto 80.
#   4. Protección en tiempo real de Defender apagada                 → se enciende, con una
#      exclusión solo para el disco de Ubuntu (ext4.vhdx) para que Docker no se ponga lento.
#
# Lo que NO cambia (solo se informa, ver el final):
#   - La red Ethernet como «Pública»: es el perfil MÁS restrictivo del firewall. Pasarla a
#     «Privada» abriría más cosas, no menos. Se deja como está.
#   - La zona Wi-Fi compartida y el router MikroTik: se arreglan a mano (instrucciones al final).
#
# Modos: 1 = revisar (no cambia nada) · 2 = aplicar (pregunta antes de cada paso) ·
#        3 = deshacer (quita las reglas «IncubApp seguridad» que creó este script).
# Registro: servidor-local\logs\17-seguridad.txt
$ErrorActionPreference = 'Continue'
$yo = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $yo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Pidiendo permisos de administrador...' -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}
$aqui = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
$log = "$aqui\logs\17-seguridad.txt"
function L($t, $c = 'Gray') { Add-Content -Path $log -Value "$(Get-Date -Format s) $t"; Write-Host $t -ForegroundColor $c }
function Si($pregunta) { (Read-Host "$pregunta (S/N)") -match '^[sS]' }
$prefijo = 'IncubApp seguridad'
$wslVm = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
$hyperv = [bool](Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue)
# Solo otros equipos (red local, Tailscale, redes privadas); 127.0.0.1 (este mismo equipo) queda libre.
$redes = @('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '169.254.0.0/16')

L '=== Seguridad del servidor IncubApp ===' 'Cyan'
Write-Host ''
Write-Host '  1. Revisar (no cambia nada)'
Write-Host '  2. Aplicar (pregunta antes de cada paso)'
Write-Host '  3. Deshacer lo que aplicó este script'
$modo = Read-Host 'Elija 1, 2 o 3'
L "Modo elegido: $modo"

function Escuchando($puerto) {
  Get-NetTCPConnection -State Listen -LocalPort $puerto -ErrorAction SilentlyContinue |
    ForEach-Object {
      $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      "$($_.LocalAddress):$puerto ($($p.ProcessName))"
    } | Select-Object -Unique
}

function ReglaBloqueo($nombre, $puertos, $motivo) {
  $dn = "$prefijo · $nombre"
  Get-NetFirewallRule -DisplayName $dn -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $dn -Direction Inbound -Action Block -Protocol TCP -LocalPort $puertos `
    -RemoteAddress $redes -Profile Any -Description $motivo | Out-Null
  L "   Regla de Windows creada: $dn (bloquea entrada desde otros equipos al puerto $($puertos -join ', '))" 'Green'
  if ($hyperv) {
    $hn = ($dn -replace '[^A-Za-z0-9]+', '-')
    Get-NetFirewallHyperVRule -Name $hn -ErrorAction SilentlyContinue | Remove-NetFirewallHyperVRule
    try {
      New-NetFirewallHyperVRule -Name $hn -DisplayName $dn -Direction Inbound -VMCreatorId $wslVm -Protocol TCP `
        -LocalPorts ($puertos -join ',') -RemoteAddresses ($redes -join ',') -Action Block -ErrorAction Stop | Out-Null
      L '   Misma regla en el firewall de Ubuntu (WSL).' 'Green'
    } catch { L "   No se pudo crear en el firewall de WSL: $($_.Exception.Message)" 'Yellow' }
  }
}

if ($modo -eq '3') {
  L 'Quitando las reglas creadas por este script...' 'Cyan'
  Get-NetFirewallRule -DisplayName "$prefijo*" -ErrorAction SilentlyContinue | ForEach-Object {
    L "   Quitada: $($_.DisplayName)"; $_ | Remove-NetFirewallRule
  }
  if ($hyperv) {
    Get-NetFirewallHyperVRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "$prefijo*" } |
      ForEach-Object { L "   Quitada (WSL): $($_.DisplayName)"; $_ | Remove-NetFirewallHyperVRule }
  }
  L 'Listo. Defender y su exclusión se dejan como están (ver Seguridad de Windows).' 'Green'
  exit
}
$aplicar = $modo -eq '2'

# ── 1 y 2. Puertos 5432 (PostgreSQL) y 4040 (ngrok) ─────────────────────────────
foreach ($h in @(
    @{ n = 'PostgreSQL 5432'; p = 5432; m = 'PostgreSQL no se usa desde otros equipos; IncubApp lo usa solo dentro del servidor.' },
    @{ n = 'ngrok 4040'; p = 4040; m = 'Inspector de ngrok: muestra el tráfico de la app. ngrok ya no se usa (túnel de Cloudflare).' }
  )) {
  L "Puerto $($h.p) — $($h.n)" 'Cyan'
  $e = Escuchando $h.p
  if ($e) { L "   Escuchando: $($e -join '; ')" 'Yellow' } else { L '   Nada escuchando ahora.' }
  $ya = Get-NetFirewallRule -DisplayName "$prefijo · $($h.n)" -ErrorAction SilentlyContinue
  if ($ya) { L '   Ya está bloqueado desde la red por este script.' 'Green'; continue }
  L "   $($h.m)"
  if ($aplicar -and (Si "   ¿Bloquear la entrada al puerto $($h.p) desde otros equipos?")) {
    ReglaBloqueo $h.n @($h.p) $h.m
  }
}

# ── 3. Puerto 8000 (API de Supabase) ────────────────────────────────────────────
L 'Puerto 8000 — API de Supabase' 'Cyan'
$permite = Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True -ErrorAction SilentlyContinue |
  Where-Object { ($_ | Get-NetFirewallPortFilter).LocalPort -contains '8000' }
foreach ($r in $permite) { L "   Regla que lo abre: «$($r.DisplayName)» (perfil $($r.Profile))" 'Yellow' }
if (-not $permite) { L '   Ninguna regla de Windows lo abre.' }
if (Get-NetFirewallRule -DisplayName "$prefijo · API 8000" -ErrorAction SilentlyContinue) {
  L '   Ya está bloqueado desde la red por este script.' 'Green'
} else {
  L '   El celular y el computador entran por incubapp.cdhmaker.com (puerto 80 / túnel); la API no'
  L '   necesita estar abierta a la red. Desde este mismo equipo sigue funcionando (scripts 8, 12…).'
  if ($aplicar -and (Si '   ¿Bloquear la entrada al puerto 8000 desde otros equipos?')) {
    ReglaBloqueo 'API 8000' @(8000) 'La API de Supabase se usa por el puerto 80 de la app o desde el mismo servidor.'
  }
}

# ── 4. Defender en tiempo real ─────────────────────────────────────────────────
L 'Antivirus — Microsoft Defender' 'Cyan'
$otros = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue |
  Where-Object { $_.displayName -notmatch 'Defender' }
$mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
if ($otros) {
  L "   Hay otro antivirus: $(($otros.displayName) -join ', '). Defender queda en segundo plano; no se toca." 'Yellow'
} elseif (-not $mp) {
  L '   No se pudo leer el estado de Defender.' 'Yellow'
} elseif ($mp.RealTimeProtectionEnabled) {
  L '   La protección en tiempo real ya está encendida.' 'Green'
} else {
  L '   La protección en tiempo real está APAGADA.' 'Yellow'
  if ($aplicar -and (Si '   ¿Encenderla (con exclusión solo para el disco de Ubuntu)?')) {
    # Disco de Ubuntu (ext4.vhdx): excluirlo evita que Docker se ponga lento.
    $discos = @()
    Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | ForEach-Object {
      $bp = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).BasePath
      if ($bp) { $bp = $bp -replace '^\\\\\?\\', ''; $v = Join-Path $bp 'ext4.vhdx'; if (Test-Path $v) { $discos += $v } }
    }
    foreach ($d in $discos) {
      Add-MpPreference -ExclusionPath $d -ErrorAction SilentlyContinue
      L "   Exclusión agregada: $d" 'Green'
    }
    if (-not $discos) { L '   No se encontró el disco de Ubuntu; se enciende sin exclusión.' 'Yellow' }
    Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue
    Start-Sleep 2
    if ((Get-MpComputerStatus).RealTimeProtectionEnabled) {
      L '   Protección en tiempo real ENCENDIDA.' 'Green'
    } else {
      L '   Windows no dejó encenderla desde aquí (protección contra alteraciones o una directiva).' 'Yellow'
      L '   Enciéndala en Seguridad de Windows → Protección antivirus y contra amenazas.' 'Yellow'
    }
  }
}

# ── Solo informe ───────────────────────────────────────────────────────────────
L 'Red Ethernet' 'Cyan'
Get-NetConnectionProfile -ErrorAction SilentlyContinue | ForEach-Object {
  L "   $($_.InterfaceAlias): $($_.NetworkCategory)"
}
L '   «Public» es el perfil MÁS estricto del firewall; no se cambia. La app sale por el túnel.'

L 'Zona Wi-Fi compartida' 'Cyan'
$hot = Get-NetIPAddress -IPAddress '192.168.137.1' -ErrorAction SilentlyContinue
if ($hot) {
  L "   Activa en «$($hot.InterfaceAlias)»: otros equipos pueden conectarse a internet por este servidor." 'Yellow'
  L '   Si nadie la necesita: Configuración → Red e Internet → Zona con cobertura inalámbrica móvil → Desactivado.' 'Yellow'
} else { L '   No está activa.' 'Green' }

L 'Router MikroTik (192.168.5.1) — lo cambia quien administra la red' 'Cyan'
L '   En Winbox: IP → Services → desactivar «telnet» y «ftp»; en «winbox» y «www» poner en'
L '   «Available From» solo la IP del equipo del administrador. Cambiar la clave de admin si es la de fábrica.'

Write-Host ''
if ($aplicar) { L 'Listo. Para revertir los bloqueos: 17-SEGURIDAD-SERVIDOR.bat, modo 3.' 'Green' }
else { L 'Revisión terminada (no se cambió nada). Para aplicar: modo 2.' 'Green' }
