# IncubApp · servidor local — 11. Abre la salida de correo (SMTP) del Lenovo y dice dónde
# está el bloqueo si sigue cerrado.
#
# 01-10-2026: desde Ubuntu (WSL) salían cerrados los puertos 587, 465 y 2525 hacia Gmail,
# Brevo, Office 365 y SMTP2GO, pero abiertos 8025 y 80. Este script:
#   1. Abre en el firewall de Windows la salida TCP 587, 465 y 2525 (regla «IncubApp correo saliente»).
#   2. Abre lo mismo en el firewall de Hyper-V que filtra a WSL (si existe en este Windows).
#   3. Prueba desde Windows y desde Ubuntu, y dice si el bloqueo es del equipo o de la red.
# No toca otras reglas ni el antivirus.
$ErrorActionPreference = 'Continue'
$yo = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $yo.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Pidiendo permisos de administrador...' -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}
$aqui = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
$log = "$aqui\logs\11-puertos-correo.txt"
function L($t, $c = 'Gray') { Add-Content -Path $log -Value "$(Get-Date -Format s) $t"; Write-Host $t -ForegroundColor $c }
$puertos = @(587, 465, 2525)
$nombre = 'IncubApp correo saliente'

L '=== Salida de correo (SMTP) del servidor ===' 'Cyan'

L '1/3 Firewall de Windows: permitir salida TCP 587, 465 y 2525...'
Get-NetFirewallRule -DisplayName $nombre -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $nombre -Direction Outbound -Action Allow -Protocol TCP -RemotePort $puertos -Profile Any `
  -Description 'Correos de IncubApp (recuperar contraseña, invitaciones)' | Out-Null
L '   Regla creada.' 'Green'

L '2/3 Firewall de Hyper-V para Ubuntu (WSL)...'
$wsl = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
if (Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue) {
  Get-NetFirewallHyperVRule -Name 'IncubApp-correo-saliente' -ErrorAction SilentlyContinue | Remove-NetFirewallHyperVRule
  try {
    New-NetFirewallHyperVRule -Name 'IncubApp-correo-saliente' -DisplayName $nombre -Direction Outbound -VMCreatorId $wsl `
      -Protocol TCP -RemotePorts ($puertos -join ',') -Action Allow -ErrorAction Stop | Out-Null
    L '   Regla creada para WSL.' 'Green'
  } catch { L "   No se pudo crear: $($_.Exception.Message)" 'Yellow' }
} else {
  L '   Este Windows no tiene firewall de Hyper-V para WSL: nada que hacer.'
}

L '3/3 Probando desde Windows y desde Ubuntu...'
$destinos = @(
  @{ h = 'smtp-relay.brevo.com'; p = 2525 }, @{ h = 'smtp-relay.brevo.com'; p = 587 },
  @{ h = 'smtp.gmail.com'; p = 587 }, @{ h = 'smtp.gmail.com'; p = 465 }
)
$win = 0; $ubu = 0
foreach ($d in $destinos) {
  $okW = Test-NetConnection -ComputerName $d.h -Port $d.p -InformationLevel Quiet -WarningAction SilentlyContinue
  $r = wsl.exe -d Ubuntu-24.04 -u root -- bash -c "timeout 6 bash -c '</dev/tcp/$($d.h)/$($d.p)' 2>/dev/null && echo SI || echo NO"
  $okU = ("$r" -replace "`0", '').Trim() -eq 'SI'
  if ($okW) { $win++ }; if ($okU) { $ubu++ }
  L ("   {0,-28} Windows: {1,-8} Ubuntu: {2}" -f "$($d.h):$($d.p)", ($(if ($okW) { 'abierto' } else { 'cerrado' })), ($(if ($okU) { 'abierto' } else { 'cerrado' })))
}
Write-Host ''
if ($ubu -gt 0) {
  L 'LISTO: Ubuntu ya sale por un puerto de correo. Ejecute 8-CONFIGURAR-CORREO, modo 2, para probar el envío.' 'Green'
} elseif ($win -gt 0) {
  L 'Windows sí sale pero Ubuntu no: el bloqueo está entre Windows y WSL. Reinicie Ubuntu (wsl --shutdown) y repita; si sigue, avise a soporte.' 'Yellow'
} else {
  L 'Cerrado también desde Windows: el bloqueo NO es de este equipo.' 'Yellow'
  L '  - Si hay antivirus (ESET, Kaspersky, Avast...), revise su «protección de correo» o firewall propio.' 'Yellow'
  L '  - Si no, es el router / firewall de la red o el proveedor de internet: permita salida TCP 587 (y 2525)' 'Yellow'
  L '    desde la IP de este equipo. Mientras tanto se puede usar SMTP2GO por el puerto 8025, que sí está abierto.' 'Yellow'
}
