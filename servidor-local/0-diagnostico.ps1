# IncubApp · servidor local — 0. Diagnóstico del equipo (no cambia nada).
# Henry Stark Desarrollador · 23-09-2026
$ErrorActionPreference = 'Continue'
$log = Join-Path $PSScriptRoot 'logs\diagnostico.txt'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function W($t) { $t | Tee-Object -FilePath $log -Append }
"=== Diagnóstico $(Get-Date -Format s) ===" | Set-Content $log
$os = Get-CimInstance Win32_OperatingSystem
W "Windows: $($os.Caption) · versión $($os.Version) · build $($os.BuildNumber)"
$cs = Get-CimInstance Win32_ComputerSystem
W ("RAM total: {0:N1} GB · Equipo: {1} {2}" -f ($cs.TotalPhysicalMemory/1GB), $cs.Manufacturer, $cs.Model)
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
W "CPU: $($cpu.Name) · núcleos $($cpu.NumberOfCores) · hilos $($cpu.NumberOfLogicalProcessors) · virtualización en firmware: $($cpu.VirtualizationFirmwareEnabled)"
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { W ("Disco {0} libre {1:N0} GB de {2:N0} GB" -f $_.DeviceID, ($_.FreeSpace/1GB), ($_.Size/1GB)) }
W "Administrador en esta sesión: $(([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))"
W "--- WSL ---"
try { W ((wsl.exe --status 2>&1) -join "`n") } catch { W "wsl no disponible: $_" }
try { W ((wsl.exe -l -v 2>&1) -join "`n") } catch { }
W "--- Docker ---"
W ("docker en PATH: " + [bool](Get-Command docker -ErrorAction SilentlyContinue))
W ("Docker Desktop instalado: " + (Test-Path "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"))
W "--- Red ---"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } | ForEach-Object { W "IP $($_.IPAddress) · $($_.InterfaceAlias)" }
W "--- Energía ---"
W ((powercfg /getactivescheme) -join ' ')
W "--- Puertos ocupados 80/443/8000/5432 ---"
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 80,443,8000,5432,3000 } | ForEach-Object { W "Puerto $($_.LocalPort) ocupado por PID $($_.OwningProcess) $((Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName)" }
W "=== fin ==="
