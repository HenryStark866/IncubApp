# IncubApp · Copia Encender / Apagar / Estado del bot a C:\IncubAppBot y deja sus accesos
# directos en el escritorio de este usuario. Lo llaman el instalador y el actualizador.
$origen = $PSScriptRoot
$destino = 'C:\IncubAppBot'
$escritorio = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$accesos = @(
  @{ archivo = 'ENCENDER-BOT.bat'; nombre = 'Encender bot de rondas'; icono = 'imageres.dll,101' },
  @{ archivo = 'APAGAR-BOT.bat';   nombre = 'Apagar bot de rondas';   icono = 'imageres.dll,100' },
  @{ archivo = 'ESTADO-BOT.bat';   nombre = 'Estado del bot de rondas'; icono = 'imageres.dll,76' }
)
foreach ($a in $accesos) {
  $src = Join-Path $origen $a.archivo
  if (-not (Test-Path $src)) { continue }
  Copy-Item $src $destino -Force
  $lnk = $shell.CreateShortcut((Join-Path $escritorio ($a.nombre + '.lnk')))
  $lnk.TargetPath = Join-Path $destino $a.archivo
  $lnk.WorkingDirectory = $destino
  $lnk.IconLocation = "$env:SystemRoot\System32\$($a.icono)"
  $lnk.Save()
}
Write-Host 'En el escritorio quedaron: «Encender bot de rondas», «Apagar bot de rondas» y «Estado del bot de rondas».' -ForegroundColor Green
