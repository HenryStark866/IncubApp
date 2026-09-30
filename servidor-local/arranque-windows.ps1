# IncubApp · servidor local — lo ejecutan las tareas programadas al encender el
# equipo y al iniciar sesión (ver registrar-arranque.ps1).
# 1. Quita reglas «portproxy» viejas de los puertos de la app: con la red de WSL en
#    espejo sobran, y al reiniciar Windows se adueñan de los puertos 80/8000/4040
#    antes que Docker, dejando la app caída.
# 2. Arranca WSL, espera a Docker y levanta los contenedores caídos (arranque.sh).
# 3. Se queda corriendo para que WSL no se apague por inactividad.
$ErrorActionPreference = 'Continue'
$distro = 'Ubuntu-24.04'
$log = "$PSScriptRoot\logs\arranque.txt"
New-Item -ItemType Directory -Force -Path "$PSScriptRoot\logs" | Out-Null
function L($t) { Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $t" }

L "=== Arranque ($env:USERNAME) ==="
foreach ($p in 80, 443, 8000, 4040) {
  $r = (netsh interface portproxy show v4tov4) -match "\s$p\s"
  if ($r) { netsh interface portproxy delete v4tov4 listenport=$p listenaddress=0.0.0.0 | Out-Null; L "portproxy del puerto $p eliminado" }
}

$wslSh = '/mnt/c' + (($PSScriptRoot -replace '^[A-Za-z]:', '') -replace '\\', '/') + '/arranque.sh'
for ($i = 1; $i -le 5; $i++) {
  $salida = & wsl.exe -d $distro -u root -- bash $wslSh 2>&1 | ForEach-Object { ($_ -as [string]) -replace "`0", '' }
  $salida | ForEach-Object { Add-Content -Path $log -Value $_ }
  if ($LASTEXITCODE -eq 0) { break }
  L "WSL/Docker no respondió (intento $i), reintento en 30 s"
  Start-Sleep -Seconds 30
}

L "Manteniendo WSL encendido"
& wsl.exe -d $distro -u root -- sh -c 'exec sleep infinity'
