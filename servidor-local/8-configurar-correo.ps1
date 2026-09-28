# IncubApp · servidor local — 8. Conecta el correo (SMTP) para recuperar contraseñas.
$aqui = $PSScriptRoot
function AWsl($p) { '/mnt/' + $p.Substring(0,1).ToLower() + ($p.Substring(2) -replace '\\', '/') }
Write-Host 'Datos del servidor de correo (SMTP). Ejemplos:' -ForegroundColor Cyan
Write-Host '  Gmail / Google Workspace: smtp.gmail.com, puerto 587, contraseña de aplicación'
Write-Host '  Brevo (gratis 300/día):   smtp-relay.brevo.com, puerto 587, clave SMTP'
Write-Host ''
$h = Read-Host 'Servidor SMTP (ej. smtp.gmail.com)'
$p = Read-Host 'Puerto [Enter = 587]'; if (-not $p) { $p = '587' }
$u = Read-Host 'Usuario SMTP (normalmente el correo)'
$sec = Read-Host 'Contraseña SMTP (no se muestra)' -AsSecureString
$pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
$s = Read-Host "Correo remitente [Enter = $u]"; if (-not $s) { $s = $u }
$n = Read-Host 'Nombre del remitente [Enter = IncubApp]'; if (-not $n) { $n = 'IncubApp' }
$url = Read-Host 'Direccion de la app [Enter = https://incubapp.cdhmaker.com]'; if (-not $url) { $url = 'https://incubapp.cdhmaker.com' }
if (-not $h -or -not $u -or -not $pw) { Write-Host 'Faltan datos: no se cambió nada.' -ForegroundColor Red; exit 2 }
$q = { param($v) "'" + ($v -replace "'", "'\''") + "'" }
$tmp = Join-Path $env:TEMP ("correo-" + [guid]::NewGuid().ToString('N') + '.env')
$lines = @(
  "HOST=$(& $q $h)", "PORT=$(& $q $p)", "USER=$(& $q $u)", "PASS=$(& $q $pw)",
  "SENDER=$(& $q $s)", "NAME=$(& $q $n)", "URL=$(& $q $url)"
)
[IO.File]::WriteAllText($tmp, ($lines -join "`n") + "`n", (New-Object Text.UTF8Encoding($false)))
try { wsl.exe -d Ubuntu-24.04 -u root -- bash (AWsl "$aqui\correo.sh") (AWsl $tmp) }
finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
Write-Host "`nTerminó. Registro: servidor-local\logs\8-correo.txt" -ForegroundColor Green
