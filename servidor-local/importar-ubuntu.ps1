# IncubApp · servidor local — importa Ubuntu en WSL (no requiere administrador) y deja el registro.
$ErrorActionPreference = 'Continue'; $ProgressPreference = 'SilentlyContinue'
$aqui = $PSScriptRoot; $log = "$aqui\logs\importar.txt"
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
function W($t) { ($t | Out-String) -replace "`0", '' | Add-Content -Path $log -Encoding UTF8 }
function WslOut { param([string[]]$a) $o = & wsl.exe @a 2>&1 | ForEach-Object { ($_ -as [string]) -replace "`0", '' }; W ("wsl " + ($a -join ' ') + " → código $LASTEXITCODE"); W $o; return $LASTEXITCODE }
Set-Content -Path $log -Value "=== Importar Ubuntu $(Get-Date -Format s) ===" -Encoding UTF8
$cs = Get-CimInstance Win32_ComputerSystem
W "HypervisorPresent: $($cs.HypervisorPresent) · VT en firmware: $((Get-CimInstance Win32_Processor | Select-Object -First 1).VirtualizationFirmwareEnabled)"
W ((systeminfo | Select-String -Pattern 'Hyper-V|hipervisor|Virtualiz' ) -join "`n")
WslOut '--version' | Out-Null
WslOut '--status' | Out-Null
$distro = 'Ubuntu-24.04'
$lista = (& wsl.exe -l -q 2>$null) -replace "`0", '' | Where-Object { $_ }
if ($lista -notcontains $distro) {
  $rootfs = "$env:TEMP\ubuntu-noble-wsl-amd64.rootfs.tar.gz"
  if (-not (Test-Path $rootfs) -or (Get-Item $rootfs).Length -lt 100MB) {
    W 'Descargando imagen de Ubuntu...'
    Invoke-WebRequest 'https://cloud-images.ubuntu.com/wsl/releases/24.04/current/ubuntu-noble-wsl-amd64-24.04lts.rootfs.tar.gz' -OutFile $rootfs -UseBasicParsing -TimeoutSec 1800
  }
  W "Imagen: $rootfs ($([math]::Round((Get-Item $rootfs).Length/1MB)) MB)"
  $dest = "$env:LOCALAPPDATA\IncubApp\WSL\$distro"; New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $c = WslOut '--import', $distro, $dest, $rootfs, '--version', '2'
}
$lista = (& wsl.exe -l -q 2>$null) -replace "`0", '' | Where-Object { $_ }
if ($lista -contains $distro) {
  W 'UBUNTU_OK: registrado'
  WslOut '-d', $distro, '-u', 'root', '--', 'bash', '-c', 'printf "[boot]\nsystemd=true\n[user]\ndefault=root\n" > /etc/wsl.conf; cat /etc/wsl.conf; uname -r' | Out-Null
  & wsl.exe --shutdown
  Start-Sleep 5
  WslOut '-d', $distro, '-u', 'root', '--', 'sh', '-c', 'ps -p 1 -o comm=; free -m' | Out-Null
  Remove-Item "$env:TEMP\ubuntu-noble-wsl-amd64.rootfs.tar.gz" -Force -ErrorAction SilentlyContinue
  W 'Siguiente: CONTINUAR-INSTALACION (salta el paso 1)'
  & "$aqui\continuar-instalacion.ps1"
} else { W 'UBUNTU_FALLO: ver el error de wsl --import arriba' }
