# =============================================================================
# IncubApp · Bot de rondas desde EagleTrax (12-10-2026)
# Corre en el PC EAGLETRAX (192.168.5.25), cada hora. En el plano de EagleTrax hace doble
# clic en cada máquina, espera la ventana «OX Remote Control», le toma el pantallazo, la
# cierra y sube la imagen a IncubApp como la ronda de esa hora (machine_checks con la nota
# «[bot-eagletrax]»). El lector de fotos del servidor llena temperatura, humedad, CO2 y
# volteos como con cualquier foto de ronda. Con el bot reportando, el operario solo hace la
# ronda de recibir el turno; si el bot deja de reportar, la app vuelve a exigir las rondas.
#
# Uso (en el PC EAGLETRAX, con EagleTrax abierto en el plano de la planta):
#   powershell -ExecutionPolicy Bypass -File bot-eagletrax.ps1 -Calibrar   # una vez: ubica cada máquina
#   powershell -ExecutionPolicy Bypass -File bot-eagletrax.ps1 -Probar INC-18   # prueba una sin subir
#   powershell -ExecutionPolicy Bypass -File bot-eagletrax.ps1             # la ronda (la corre la tarea programada)
# =============================================================================
param(
  [switch]$RegistrarTarea,
  [switch]$Calibrar,
  # Calibrar solo estas máquinas (las demás posiciones se conservan): -Calibrar -Solo NAC-01,NAC-02
  [string[]]$Solo = @(),
  [string]$Probar = '',
  [switch]$SinSubir
)
$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
$logDir = Join-Path $aqui 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("ronda-" + (Get-Date -Format 'yyyy-MM-dd') + ".txt")
function L($t, $c = 'Gray') { Add-Content -Path $log -Value "$(Get-Date -Format s) $t" -Encoding UTF8; Write-Host $t -ForegroundColor $c }

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, int f);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  public static IntPtr Find(string prefix) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (sb.ToString().StartsWith(prefix)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static IntPtr[] FindAll(string[] prefixes) {
    var list = new System.Collections.Generic.List<IntPtr>();
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      var t = sb.ToString();
      foreach (var pre in prefixes) { if (t.StartsWith(pre)) { list.Add(h); break; } }
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }
  public static IntPtr FindContains(string part) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (sb.ToString().Contains(part)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
[void][W]::SetProcessDPIAware()

# ── Tarea programada: cada hora en el minuto 05, máximo 25 min por ronda; si una ronda
#    quedó colgada, la nueva la reemplaza (antes una colgada frenaba todas las siguientes).
if ($RegistrarTarea) {
  $script = Join-Path $aqui 'bot-eagletrax.ps1'
  $accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script + '"')
  $inicio = (Get-Date).Date.AddHours((Get-Date).Hour + 1).AddMinutes(5)
  $disparo = New-ScheduledTaskTrigger -Once -At $inicio -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
  $ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -MultipleInstances StopExisting -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $quien = New-ScheduledTaskPrincipal -UserId ($env:USERDOMAIN + '\' + $env:USERNAME) -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName 'IncubApp Bot Rondas' -Action $accion -Trigger $disparo -Settings $ajustes -Principal $quien -Force | Out-Null
  Write-Host ("Tarea «IncubApp Bot Rondas» lista: cada hora desde las " + $inicio.ToString('HH:mm') + ", máximo 25 min por ronda.") -ForegroundColor Green
  exit 0
}

$cfgPath = Join-Path $aqui 'config.json'
$mapPath = Join-Path $aqui 'maquinas.json'
if (-not (Test-Path $cfgPath)) { L "Falta config.json (corre INSTALAR-BOT-EAGLETRAX.bat)." 'Red'; exit 1 }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$ORDEN = @(1..24 | ForEach-Object { 'INC-{0:D2}' -f $_ }) + @(1..12 | ForEach-Object { 'NAC-{0:D2}' -f $_ })
# Ventanas que abre el doble clic: las máquinas nuevas abren «OX Remote Control»; las de la
# zona vieja, «Remote Link» (13-10-2026). Se aceptan las dos y las que se agreguen en config.json.
$TITULOS = @('OX Remote Control', 'Remote Link')
foreach ($t in @($cfg.ventana_maquina) + @($cfg.ventanas_maquina)) { if ($t -and $TITULOS -notcontains $t) { $TITULOS += $t } }
$ESPERA = if ($cfg.espera_datos_seg) { [int]$cfg.espera_datos_seg } else { 4 }

function Ventana-EagleTrax {
  $h = [W]::FindContains($cfg.ventana_eagletrax)
  if ($h -eq [IntPtr]::Zero) { return $null }
  [void][W]::ShowWindow($h, 3)   # maximizada: así las posiciones calibradas no cambian
  [void][W]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 700
  $r = New-Object W+RECT; [void][W]::GetWindowRect($h, [ref]$r)
  return @{ h = $h; r = $r }
}

# Cierra TODAS las ventanas de máquina abiertas (también las que quedaron de rondas anteriores)
function Cerrar-OX {
  for ($i = 0; $i -lt 10; $i++) {
    $abiertas = [W]::FindAll([string[]]$TITULOS)
    if (-not $abiertas -or $abiertas.Count -eq 0) { return }
    foreach ($h in $abiertas) { [void][W]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }  # WM_CLOSE
    Start-Sleep -Milliseconds 900
  }
}

function Doble-Clic($x, $y) {
  [void][W]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 150
  for ($i = 0; $i -lt 2; $i++) { [W]::mouse_event(0x02, 0, 0, 0, 0); [W]::mouse_event(0x04, 0, 0, 0, 0); Start-Sleep -Milliseconds 90 }
}

function Captura($h, $archivo) {
  $r = New-Object W+RECT; [void][W]::GetWindowRect($h, [ref]$r)
  $w = $r.Right - $r.Left; $alto = $r.Bottom - $r.Top
  if ($w -lt 200 -or $alto -lt 150) { throw "ventana muy pequeña ($w x $alto)" }
  $bmp = New-Object System.Drawing.Bitmap $w, $alto
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $dc = $g.GetHdc()
  $ok = [W]::PrintWindow($h, $dc, 2)   # PW_RENDERFULLCONTENT: aunque otra ventana la tape
  $g.ReleaseHdc($dc)
  if (-not $ok) { $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size) }
  $g.Dispose()
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $p = New-Object System.Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 88L
  $bmp.Save($archivo, $enc, $p); $bmp.Dispose()
}

function Abrir-Y-Capturar($maq, $et, $archivo) {
  Cerrar-OX
  $antes = @([W]::FindAll([string[]]$TITULOS))
  $x = [int]($et.r.Left + $maq.fx * ($et.r.Right - $et.r.Left))
  $y = [int]($et.r.Top + $maq.fy * ($et.r.Bottom - $et.r.Top))
  Doble-Clic $x $y
  # Espera la ventana NUEVA de la máquina (OX Remote Control o Remote Link)
  $ox = [IntPtr]::Zero
  for ($i = 0; $i -lt 40 -and $ox -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 500
    foreach ($h in [W]::FindAll([string[]]$TITULOS)) { if ($antes -notcontains $h) { $ox = $h; break } }
  }
  if ($ox -eq [IntPtr]::Zero) { throw ('no abrió la ventana de la máquina (se esperaba: ' + ($TITULOS -join ' o ') + ')') }
  $sb = New-Object System.Text.StringBuilder 256
  [void][W]::GetWindowText($ox, $sb, 256)
  $titulo = $sb.ToString()
  # «Remote Link» (zona vieja) tarda más en traer los valores de la máquina
  $espera = if ($titulo.StartsWith('Remote Link')) { [math]::Max($ESPERA, 7) } else { $ESPERA }
  Start-Sleep -Seconds $espera
  Captura $ox $archivo
  [void][W]::PostMessage($ox, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 900
  Cerrar-OX
  return $titulo
}

# ── Calibrar: ubicar cada máquina en el plano (una vez, o si cambia el plano) ──
if ($Calibrar) {
  $et = Ventana-EagleTrax
  if (-not $et) { L "No encuentro la ventana de EagleTrax («$($cfg.ventana_eagletrax)»). Ábrela en el plano de la planta." 'Red'; exit 1 }
  Write-Host "`nCALIBRAR: pon el puntero del mouse en el CENTRO de la pantallita de cada máquina y presiona ENTER aquí." -ForegroundColor Cyan
  Write-Host "Escribe s + ENTER para saltar una máquina que no esté en el plano. (La ventana de EagleTrax queda maximizada.)`n" -ForegroundColor Cyan
  $mapa = [ordered]@{}
  $lista = $ORDEN
  if ($Solo.Count) {
    # Se conservan las posiciones ya calibradas y solo se piden las indicadas
    if (Test-Path $mapPath) {
      $prev = Get-Content $mapPath -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($pp in $prev.PSObject.Properties) { $mapa[$pp.Name] = @{ fx = $pp.Value.fx; fy = $pp.Value.fy } }
    }
    $lista = @($Solo | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $ORDEN -contains $_ })
    Write-Host ("Solo se calibran: " + ($lista -join ', ')) -ForegroundColor Yellow
  }
  foreach ($code in $lista) {
    $resp = Read-Host "  $code"
    if ($resp -eq 's') { continue }
    $p = New-Object W+POINT; [void][W]::GetCursorPos([ref]$p)
    $fx = ($p.X - $et.r.Left) / ($et.r.Right - $et.r.Left)
    $fy = ($p.Y - $et.r.Top) / ($et.r.Bottom - $et.r.Top)
    $mapa[$code] = @{ fx = [math]::Round($fx, 5); fy = [math]::Round($fy, 5) }
  }
  $mapa | ConvertTo-Json | Set-Content -Path $mapPath -Encoding UTF8
  L "Calibración guardada: $($mapa.Count) máquinas en maquinas.json. Prueba con: -Probar INC-18" 'Green'
  exit 0
}

if (-not (Test-Path $mapPath)) { L 'Falta maquinas.json: corre primero con -Calibrar.' 'Red'; exit 1 }
$mapa = Get-Content $mapPath -Raw -Encoding UTF8 | ConvertFrom-Json

# ── Probar una máquina: abre, captura y deja la imagen en la carpeta, sin subir ──
if ($Probar) {
  $et = Ventana-EagleTrax
  if (-not $et) { L 'No encuentro EagleTrax abierto.' 'Red'; exit 1 }
  $m = $mapa.$Probar
  if (-not $m) { L "No hay posición para $Probar en maquinas.json." 'Red'; exit 1 }
  $f = Join-Path $aqui "prueba-$Probar.jpg"
  $t = Abrir-Y-Capturar $m $et $f
  L "Listo ($t): revisa $f (debe verse la pantalla de $Probar)." 'Green'
  exit 0
}

# ── Ronda de la hora ──
$ahora = Get-Date
$hora = $ahora.Hour
$turno = if ($hora -ge 6 -and $hora -lt 14) { 1 } elseif ($hora -ge 14 -and $hora -lt 22) { 2 } else { 3 }
$fechaTurno = if ($turno -eq 3 -and $hora -lt 6) { $ahora.AddDays(-1).ToString('yyyy-MM-dd') } else { $ahora.ToString('yyyy-MM-dd') }
L "=== Ronda del bot · $fechaTurno T$turno H$('{0:D2}' -f $hora) ===" 'Cyan'

# Sesión de la cuenta del bot (la clave quedó cifrada para este usuario de Windows)
$secreto = Join-Path $aqui 'clave.bin'
if (-not (Test-Path $secreto)) { L 'Falta la clave de la cuenta del bot (corre INSTALAR-BOT-EAGLETRAX.bat).' 'Red'; exit 1 }
$clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Get-Content $secreto | ConvertTo-SecureString)))
$base = $cfg.url.TrimEnd('/')
$hdr = @{ apikey = $cfg.anon_key }
try {
  $ses = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $hdr -ContentType 'application/json' -Body (@{ email = $cfg.email; password = $clave } | ConvertTo-Json)
} catch { L "No se pudo iniciar sesión con la cuenta del bot: $($_.Exception.Message)" 'Red'; exit 1 }
$clave = $null
$auth = @{ apikey = $cfg.anon_key; Authorization = "Bearer $($ses.access_token)" }
$uid = $ses.user.id
$miembro = Invoke-RestMethod -Uri "$base/rest/v1/organization_members?select=org_id&user_id=eq.$uid&limit=1" -Headers $auth
if (-not $miembro) { L 'La cuenta del bot no pertenece a la empresa (agrégala en Administración y apruébala).' 'Red'; exit 1 }
$org = $miembro[0].org_id
$maquinas = Invoke-RestMethod -Uri "$base/rest/v1/machines?select=id,code,plant_id&code=in.($([string]::Join(',', $ORDEN)))" -Headers $auth
$porCodigo = @{}; foreach ($m in $maquinas) { $porCodigo[$m.code] = $m }
$hechas = Invoke-RestMethod -Uri "$base/rest/v1/machine_checks?select=machine_id&org_id=eq.$org&shift_date=eq.$fechaTurno&hour_slot=eq.$hora&notes=like.*bot-eagletrax*" -Headers $auth
$yaHechas = @{}; foreach ($c in $hechas) { $yaHechas[$c.machine_id] = $true }

$et = Ventana-EagleTrax
if (-not $et) { L "EagleTrax no está abierto: no se pudo hacer la ronda. IncubApp avisará y pedirá la ronda al operario." 'Red'; exit 2 }

Cerrar-OX   # las que hayan quedado abiertas de antes
$tmp = Join-Path $env:TEMP 'incubapp-bot'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$ok = 0; $fallas = 0
foreach ($code in $ORDEN) {
  $pos = $mapa.$code
  $m = $porCodigo[$code]
  if (-not $m) { continue }
  if (-not $pos) { L "  $code sin posición en el plano: calíbrala con -Calibrar -Solo $code" 'Yellow'; $fallas++; continue }
  if ($yaHechas[$m.id]) { continue }
  $archivo = Join-Path $tmp "$code.jpg"
  try {
    try {
      $tituloVentana = Abrir-Y-Capturar $pos $et $archivo
    } catch {
      L "  $code reintento: $($_.Exception.Message)" 'Yellow'
      Cerrar-OX
      Start-Sleep -Seconds 3
      $tituloVentana = Abrir-Y-Capturar $pos $et $archivo
    }
    if ($SinSubir) { $ok++; L "  $code ✓ ($tituloVentana)"; continue }
    $ruta = "$org/$($m.id)/$fechaTurno/T$turno-H$('{0:D2}' -f $hora)-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())-bot.jpg"
    Invoke-RestMethod -Method Post -Uri "$base/storage/v1/object/machine-checks/$ruta" -Headers ($auth + @{ 'x-upsert' = 'false' }) -ContentType 'image/jpeg' -InFile $archivo | Out-Null
    $fila = @{
      org_id = $org; plant_id = $m.plant_id; machine_id = $m.id; taken_by = $uid
      shift_date = $fechaTurno; shift_number = $turno; hour_slot = $hora; condition = 'normal'
      notes = "[bot-eagletrax] Pantallazo de EagleTrax ($tituloVentana)"; photo_path = $ruta
    }
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/machine_checks" -Headers ($auth + @{ Prefer = 'return=minimal' }) -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($fila | ConvertTo-Json))) | Out-Null
    $ok++
    L "  $code ✓ ($tituloVentana)"
  } catch {
    $fallas++
    L "  $code ✗ $($_.Exception.Message)" 'Yellow'
    Cerrar-OX
    $et = Ventana-EagleTrax
    if (-not $et) { L 'EagleTrax se cerró en plena ronda.' 'Red'; break }
  } finally {
    Remove-Item $archivo -ErrorAction SilentlyContinue
  }
}
L "Ronda terminada: $ok máquinas subidas, $fallas con falla." $(if ($fallas) { 'Yellow' } else { 'Green' })
exit $(if ($ok -gt 0) { 0 } else { 3 })
