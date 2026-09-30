# IncubApp · servidor local — 10. Instala n8n y el bot que lee las fotos de las rondas.
$aqui = $PSScriptRoot
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
Write-Host 'El bot usa Claude (Anthropic) para leer las pantallas de las fotos.' -ForegroundColor Cyan
Write-Host 'Pega la clave de la API (empieza por sk-ant-). Enter para dejar la que ya está guardada.'
$sec = Read-Host 'Clave de Claude (no se muestra)' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$tmp = $null
if ($key) {
  if ($key -notmatch '^sk-ant-[A-Za-z0-9_\-]+$') { Write-Host 'Esa clave no tiene la forma sk-ant-...: no se cambió nada.' -ForegroundColor Red; exit 2 }
  $tmp = Join-Path $env:TEMP ("n8n-" + [guid]::NewGuid().ToString('N') + '.env')
  [IO.File]::WriteAllText($tmp, "CLAUDE_KEY='$key'`n", (New-Object Text.UTF8Encoding($false)))
}
try {
  if ($tmp) { wsl.exe -d Ubuntu-24.04 -u root -- bash (AWsl "$aqui\n8n.sh") (AWsl $tmp) }
  else { wsl.exe -d Ubuntu-24.04 -u root -- bash (AWsl "$aqui\n8n.sh") }
}
finally { if ($tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue } }
Write-Host "`nTerminó. Registro: servidor-local\logs\10-n8n.txt" -ForegroundColor Green
