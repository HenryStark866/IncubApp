$aqui = $PSScriptRoot
$w = '/mnt/' + $aqui.Substring(0,1).ToLower() + ($aqui.Substring(2) -replace '\\', '/')
$o = & wsl.exe -d Ubuntu-24.04 -u root -- bash "$w/diag-red.sh" 2>&1 | ForEach-Object { ($_ -as [string]) -replace "`0", '' }
$o | Set-Content "$aqui\logs\diag-red.txt" -Encoding UTF8
