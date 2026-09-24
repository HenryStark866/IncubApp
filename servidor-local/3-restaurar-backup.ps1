# IncubApp · servidor local — 3. Restaurar el backup descargado de Supabase.
$aqui = $PSScriptRoot
$wslPath = '/mnt/' + $aqui.Substring(0,1).ToLower() + ($aqui.Substring(2) -replace '\\', '/')
$bk = Get-ChildItem "$env:USERPROFILE\Downloads\db_cluster-*.backup.gz" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $bk) { Write-Host 'No encontré db_cluster-*.backup.gz en Descargas.' -ForegroundColor Red; exit 2 }
Write-Host "Restaurando $($bk.Name)..." -ForegroundColor Cyan
$bkWsl = '/mnt/' + $bk.FullName.Substring(0,1).ToLower() + ($bk.FullName.Substring(2) -replace '\\', '/')
wsl.exe -d Ubuntu-24.04 -u root -- bash "$wslPath/restaurar.sh" "$bkWsl"
Write-Host "`nTerminó. Registro: servidor-local\logs\3-restaurar.txt" -ForegroundColor Green
