# IncubApp · servidor local — 1. Preparar Windows (se ejecuta como administrador).
# Activa WSL2, instala Ubuntu 24.04 con systemd, deja el equipo sin suspenderse,
# abre el firewall para la red local y programa el arranque automático.
# Se puede ejecutar varias veces: lo que ya está hecho lo salta.
# Henry Stark Desarrollador · 23-09-2026
$ErrorActionPreference = 'Continue'
$aqui = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
Start-Transcript -Path "$aqui\logs\1-preparar.txt" -Append | Out-Null
$distro = 'Ubuntu-24.04'
$reiniciar = $false

function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }

Paso 'Revisando el equipo'
$os = Get-CimInstance Win32_OperatingSystem
$build = [int]$os.BuildNumber
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
Write-Host "Windows $($os.Caption) build $build · RAM $ramGB GB"
if ($ramGB -lt 8) { Write-Host 'AVISO: con menos de 8 GB de RAM el servidor irá lento.' -ForegroundColor Yellow }

Paso 'Activando WSL y la plataforma de máquina virtual'
foreach ($f in 'Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform') {
  $estado = (Get-WindowsOptionalFeature -Online -FeatureName $f).State
  if ($estado -ne 'Enabled') {
    Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart | Out-Null
    $reiniciar = $true
    Write-Host "  $f activado (requiere reiniciar)"
  } else { Write-Host "  $f ya estaba activo" }
}
if ($reiniciar) {
  Write-Host "`nREINICIA EL EQUIPO y vuelve a ejecutar 1-PREPARAR-WINDOWS.bat para terminar." -ForegroundColor Yellow
  Stop-Transcript | Out-Null
  exit 3010
}

Paso 'Actualizando WSL'
# Descarga directa (sin Microsoft Store) y con tope de 10 minutos: si se demora, se sigue.
$p = Start-Process wsl.exe -ArgumentList '--update', '--web-download' -PassThru -NoNewWindow
if (-not $p.WaitForExit(600000)) { try { $p.Kill() } catch {} ; Write-Host '  (la actualización tardó demasiado; se continúa con la versión instalada)' -ForegroundColor Yellow }
Start-Process wsl.exe -ArgumentList '--set-default-version', '2' -Wait -NoNewWindow

Paso "Instalando $distro"
$lista = (wsl.exe -l -q 2>$null) -replace "`0", '' | Where-Object { $_ }
if ($lista -notcontains $distro) {
  # wsl --install --web-download resulto poco confiable en este equipo (se quedaba sin
  # registrar la distro tras descargar). En su lugar se importa directo la imagen oficial
  # de Canonical para WSL: mas confiable y no depende de la Microsoft Store.
  $instalarEn = "$env:LOCALAPPDATA\IncubApp\WSL\$distro"
  New-Item -ItemType Directory -Force -Path $instalarEn | Out-Null
  $rootfs = "$env:TEMP\ubuntu-noble-wsl-amd64.rootfs.tar.gz"
  $url = 'https://cloud-images.ubuntu.com/wsl/releases/24.04/current/ubuntu-noble-wsl-amd64-24.04lts.rootfs.tar.gz'
  if (-not (Test-Path $rootfs) -or (Get-Item $rootfs).Length -lt 100MB) {
    Write-Host "  Descargando $distro (~340 MB) de cloud-images.ubuntu.com..."
    $intentos = 0
    $ok = $false
    do {
      $intentos++
      try {
        Invoke-WebRequest -Uri $url -OutFile $rootfs -UseBasicParsing -TimeoutSec 1800
        $ok = $true
      } catch {
        Write-Host "  Intento $intentos fallo: $($_.Exception.Message)" -ForegroundColor Yellow
        Start-Sleep -Seconds 5
      }
    } while (-not $ok -and $intentos -lt 3)
  }
  if ((Test-Path $rootfs) -and (Get-Item $rootfs).Length -gt 100MB) {
    Write-Host "  Importando $distro a WSL2 (esto tarda unos minutos)..."
    Start-Process wsl.exe -ArgumentList '--import', $distro, $instalarEn, $rootfs, '--version', '2' -Wait -NoNewWindow
    Remove-Item $rootfs -Force -ErrorAction SilentlyContinue
    wsl.exe -d $distro -u root -- true 2>&1 | Out-Host
  } else {
    Write-Host "  No se pudo descargar $distro tras 3 intentos. Revisa la conexion a internet y vuelve a ejecutar este paso." -ForegroundColor Red
  }
} else { Write-Host "  $distro ya instalado" }

Paso 'Configurando Ubuntu (systemd, usuario root)'
wsl.exe -d $distro -u root -- bash -c 'cd /tmp; echo [boot] > /etc/wsl.conf; echo systemd=true >> /etc/wsl.conf; echo [user] >> /etc/wsl.conf; echo default=root >> /etc/wsl.conf; cat /etc/wsl.conf' 2>&1 | Out-Host

Paso 'Configurando WSL (.wslconfig)'
$mem = [math]::Max(4, [math]::Floor($ramGB * 0.6))
$wslcfg = "$env:USERPROFILE\.wslconfig"
if (Test-Path $wslcfg) { Copy-Item $wslcfg "$wslcfg.antes-incubapp" -Force }
$lineas = @('[wsl2]', "memory=${mem}GB", 'vmIdleTimeout=-1')
if ($build -ge 22621) { $lineas += 'networkingMode=mirrored'; Write-Host '  Red en modo espejo (Windows 11 22H2+)' }
else { Write-Host '  Windows sin red en espejo: se usará reenvío de puertos' -ForegroundColor Yellow }
Set-Content -Path $wslcfg -Value ($lineas -join "`r`n") -Encoding ASCII
Get-Content $wslcfg | Out-Host
wsl.exe --shutdown

Paso 'Energía: el equipo no se suspende ni hiberna conectado a la corriente'
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Paso 'Firewall: permitir la app en la red local (puertos 80, 443, 8000)'
if (-not (Get-NetFirewallRule -DisplayName 'IncubApp servidor local' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'IncubApp servidor local' -Direction Inbound -Protocol TCP -LocalPort 80,443,8000 -Action Allow -Profile Private,Domain | Out-Null
}
try { Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow -ErrorAction Stop; Write-Host '  Firewall de WSL abierto a la red local' } catch { Write-Host "  (firewall de Hyper-V no disponible: $($_.Exception.Message))" }

Paso 'Arranque automático al iniciar sesión'
$vbs = "$env:ProgramData\IncubApp\mantener-servidor.vbs"
New-Item -ItemType Directory -Force -Path (Split-Path $vbs) | Out-Null
Set-Content -Path $vbs -Encoding ASCII -Value ('CreateObject("WScript.Shell").Run "wsl.exe -d ' + $distro + ' -u root -- sh -c ""exec sleep infinity""", 0, False')
$accion = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$disparo = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'IncubApp Servidor' -Action $accion -Trigger $disparo -Settings $ajustes -Description 'Mantiene encendido Ubuntu/WSL con Docker y Supabase de IncubApp' -Force | Out-Null
Start-ScheduledTask -TaskName 'IncubApp Servidor'
Write-Host '  Tarea «IncubApp Servidor» creada y en marcha'

Paso 'Comprobación final'
wsl.exe -l -v 2>&1 | Out-Host
wsl.exe -d $distro -u root -- sh -c 'ps -p 1 -o comm=; uname -r' 2>&1 | Out-Host
Write-Host "`nLISTO. Ahora ejecuta 2-INSTALAR-SERVIDOR.bat" -ForegroundColor Green
Stop-Transcript | Out-Null
