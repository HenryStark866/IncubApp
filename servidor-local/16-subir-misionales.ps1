# IncubApp · servidor local — 16. Sube la copia descargada de la ventana de Misionales
# («C:\IncubApp\repo misionales») a una rama PRIVADA para replicarla en IncubApp.
#
# 06-10-2026: el dueño del repositorio original lo dejó en privado. IncubApp es público, así
# que la copia NO se sube a IncubApp: va a la rama «material/repo-misionales» del
# repositorio privado Plataforma-de-Incubaci-n-CDH-Maker. No toca la carpeta de IncubApp
# ni su rama. Deja fuera node_modules, .git, compilados y archivos .env (claves).
param([string]$Origen = 'C:\IncubApp\repo misionales')
$ErrorActionPreference = 'Continue'
$aqui = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$aqui\logs" | Out-Null
$log = "$aqui\logs\16-misionales.txt"
function L($t, $c = 'Gray') { Add-Content -Path $log -Value "$(Get-Date -Format s) $t"; Write-Host $t -ForegroundColor $c }
$destino = 'https://github.com/HenryStark866/Plataforma-de-Incubaci-n-CDH-Maker.git'
$rama = 'material/repo-misionales'

L '=== Subir copia de Misionales (rama privada) ===' 'Cyan'
if (-not (Test-Path -LiteralPath $Origen)) { L "No existe la carpeta: $Origen" 'Red'; exit 1 }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { L 'No se encontró git en este equipo.' 'Red'; exit 1 }

$tmp = Join-Path $env:TEMP ("misionales-" + (Get-Date -Format 'yyyyMMddHHmmss'))
L "1/3 Copiando sin node_modules, .git, compilados ni .env..."
robocopy $Origen $tmp /E /NFL /NDL /NJH /NJS /NP `
  /XD node_modules .git dist build .next .vercel .turbo coverage `
  /XF .env .env.* *.pem *.key | Out-Null
$archivos = (Get-ChildItem -LiteralPath $tmp -Recurse -File).Count
$mb = [math]::Round(((Get-ChildItem -LiteralPath $tmp -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
L "   $archivos archivos, $mb MB."
if ($archivos -eq 0) { L 'La carpeta quedó vacía: revise la ruta.' 'Red'; exit 1 }

L '2/3 Preparando la copia...'
Push-Location $tmp
git init -q
git checkout -q -b $rama
git -c core.autocrlf=false add -A
git -c user.name='IncubApp servidor' -c user.email='servidor@incubapp.local' commit -q -m "Copia de la ventana de Misionales ($(Get-Date -Format 'yyyy-MM-dd'))"

L "3/3 Subiendo a la rama privada $rama..."
$salida = git push -f $destino "${rama}:refs/heads/$rama" 2>&1
$ok = $LASTEXITCODE -eq 0
$salida | ForEach-Object { L "   $_" }
Pop-Location
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
if ($ok) {
  L 'LISTO: la copia quedó en la rama privada. Avise a Claude para replicar la ventana.' 'Green'
} else {
  L 'No se pudo subir. Envíe a Claude lo que aparece arriba (no incluye claves).' 'Yellow'
}
