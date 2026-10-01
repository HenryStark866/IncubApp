# IncubApp · servidor local — 13. Panel IncubApp (interfaz gráfica del servidor).
# Deja el panel listo para abrirse SOLO cada vez que se inicia sesión en este equipo, y con
# accesos directos «Panel IncubApp» en el Escritorio y en el menú Inicio. No pide
# administrador. Muestra todo el tiempo el estado del servidor y trae herramientas de
# soporte y de seguridad (ver servidor-local/panel/DISENO.md).
#   13-INSTALAR-PANEL.bat            instala y abre el panel
#   13-instalar-panel.ps1 -Quitar    quita los accesos directos (el panel deja de abrirse solo)
# Henry Stark Desarrollador · 01-10-2026
param([switch]$Quitar)
$ErrorActionPreference = 'Continue'
$aqui = $PSScriptRoot
$panel = Join-Path $aqui 'panel'
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
$log = "$aqui\logs\13-panel.txt"
function L($t, $c = 'Gray') { Add-Content -Path $log -Value "$(Get-Date -Format s) $t"; Write-Host $t -ForegroundColor $c }
L '=== Panel IncubApp ===' 'Cyan'

$ws = New-Object -ComObject WScript.Shell
$rutas = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Panel IncubApp.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Panel IncubApp.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Startup')) 'Panel IncubApp.lnk')
)

if ($Quitar) {
  foreach ($r in $rutas) { if (Test-Path $r) { Remove-Item $r -Force; L "Quitado: $r" } }
  L 'Listo: el panel ya no se abre solo. (Si está abierto, ciérrelo con «Cerrar panel».)' 'Green'
  exit 0
}

# ── 1. Python ────────────────────────────────────────────────────────────────
# El de WindowsApps es un alias que a veces falla al arrancar Windows: se busca el real.
L '1/3 Buscando Python...'
$py = $null
foreach ($intento in 1, 2) {
  try {
    if ($intento -eq 1) { $exe = & python -c "import sys; print(sys.executable)" 2>$null | Select-Object -Last 1 }
    else { $exe = & py -3 -c "import sys; print(sys.executable)" 2>$null | Select-Object -Last 1 }
    if ($exe -and (Test-Path $exe.Trim())) { $py = $exe.Trim(); break }
  } catch { }
}
if (-not $py) {
  L 'No se encontró Python. Instálelo (python.org, versión 3.11 o más nueva) y vuelva a correr este paso.' 'Red'
  exit 1
}
$ok = & $py -c "import sys; print(sys.version_info >= (3, 11))"
if ($ok -ne 'True') { L "Python es muy viejo ($(& $py --version)). Instale 3.11 o más nuevo." 'Red'; exit 1 }
$pyw = Join-Path (Split-Path $py) 'pythonw.exe'
if (-not (Test-Path $pyw)) { $pyw = $py }
L "   Python: $pyw ($(& $py --version))"

# ── 2. Accesos directos ──────────────────────────────────────────────────────
L '2/3 Accesos directos (Escritorio, menú Inicio y arranque de Windows)...'
if (-not (Test-Path "$panel\web\icono.ico")) { & $py "$panel\crear_icono.py" | Out-Null }
foreach ($r in $rutas) {
  $s = $ws.CreateShortcut($r)
  $s.TargetPath = $pyw
  # El de la carpeta de arranque espera un poco y respeta el ajuste «abrir al iniciar».
  $s.Arguments = "`"$panel\panel.py`"" + $(if ($r -eq $rutas[2]) { ' --inicio' } else { '' })
  $s.WorkingDirectory = $panel
  $s.IconLocation = "$panel\web\icono.ico,0"
  $s.Description = 'Estado, soporte y seguridad del servidor IncubApp'
  $s.Save()
  L "   $r"
}

# ── 3. Abrir ─────────────────────────────────────────────────────────────────
L '3/3 Abriendo el panel...'
Start-Process -FilePath $pyw -ArgumentList "`"$panel\panel.py`"" -WorkingDirectory $panel
Write-Host ''
L 'LISTO: el panel se abre solo cada vez que alguien inicia sesión en este equipo.' 'Green'
L 'Para abrirlo a mano: acceso directo «Panel IncubApp» del Escritorio. Cerrar la ventana no lo apaga: sigue vigilando y avisando.' 'Green'
