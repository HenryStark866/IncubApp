# Panel IncubApp — diseño y contrato entre módulos

Interfaz gráfica del servidor local de IncubApp (el Lenovo `DESKTOP-ROMOGM3`). Se abre sola al
iniciar sesión en Windows, muestra todo el tiempo el estado de cada componente y trae
herramientas de soporte y de ciberseguridad para el servidor y para la red de la empresa.

**Este documento es el contrato.** Cada módulo lo implementa una persona/agente distinto en
paralelo; las formas JSON y las firmas de aquí son las que valen. Si un módulo necesita algo
más, lo agrega como campo opcional (nunca cambia ni quita lo que está aquí).

## Arquitectura

```
Ventana (Edge en modo aplicación, sin barra de direcciones)
   │  http://127.0.0.1:8770  (solo este equipo; cookie de sesión + cabecera X-Panel)
   ▼
panel.py ── servidor HTTP (biblioteca estándar), rutas /api/…, archivos de web/
   ├── nucleo/estado.py     Monitor: estado de componentes cada 10 s / 60 s, métricas, eventos
   ├── nucleo/acciones.py   Herramientas de soporte (catálogo cerrado) + visor de registros + reporte
   ├── nucleo/seguridad.py  Auditoría de seguridad del servidor + puertos + conexiones + accesos a la app
   ├── nucleo/red.py        Red de la empresa: monitor de internet, equipos, puertos, herramientas
   ├── nucleo/trabajos.py   (ya hecho) trabajos en segundo plano con salida en vivo
   ├── nucleo/secretos.py   (ya hecho) tachar(texto): oculta claves y contraseñas en registros
   └── nucleo/sistema.py    (ya hecho) rutas, wsl(), powershell(), JSON, registro, Ajustes
wsl/estado.sh               corre DENTRO de Ubuntu y devuelve en un solo JSON el estado de Linux/Docker
```

- **Solo biblioteca estándar de Python** (3.14 instalado; escribir compatible con 3.11). Nada de pip.
- El frontend es HTML/CSS/JS **sin dependencias externas ni CDN** (el servidor debe funcionar sin
  internet). Fuente del sistema (Segoe UI). Gráficas a mano con SVG/canvas.
- El panel corre con `pythonw.exe` (sin consola). **Nunca usar `subprocess` directo**: siempre
  `sistema.ejecutar / wsl / powershell / powershell_admin` o `trabajos.*`, que ocultan la ventana,
  ponen tiempo límite y no lanzan excepciones.
- PowerShell tarda 1-5 s en arrancar en este equipo (i3-4160): **no usarlo en el ciclo rápido**.
  CPU/RAM/disco de Windows con `ctypes`/`shutil`. PowerShell solo en ciclos lentos o bajo demanda.
- wsl.exe tarda ~1 s por llamada: agrupar todo lo de Linux en **un** script por ciclo.
- Si WSL está detenido (`wsl.exe -l -v` dice Stopped), el monitor **no** lo arranca solo con sus
  consultas: reporta «detenido» y la pantalla ofrece la acción `arrancar_servidor`.

## Convenciones

- Código, nombres y mensajes **en español** (como el resto de `servidor-local/`). Mensajes para
  personas de mantenimiento, no para programadores: claros, de usted, sin jerga innecesaria
  («La base de datos no responde» y en `detalle` lo técnico).
- Fechas: texto ISO local con zona (`sistema.ahora_iso()`, `sistema.iso(epoch)`).
- **Niveles de estado** (componentes): `ok` · `aviso` · `falla` · `apagado` (detenido a propósito,
  p. ej. studio/supavisor/imgproxy en producción) · `desconocido` (no se pudo revisar).
- **Severidad de hallazgos** (seguridad/red): `critico` · `alto` · `medio` · `bajo` · `info` · `ok`.
- **Nunca** devolver secretos por la API: contraseñas, `SERVICE_ROLE_KEY`, `JWT_SECRET`,
  `TUNNEL_TOKEN`, `SMTP_PASS`, `NGROK_AUTHTOKEN`, `CLAUDE_KEY`… Si una salida de registro puede
  traerlos, pasarla por `secretos.tachar(texto)` (`nucleo/secretos.py`, ya hecho) antes de devolverla.
- **Nada de ejecutar comandos arbitrarios** desde la pantalla. Cada acción es una entrada de un
  catálogo cerrado; los parámetros se validan con listas permitidas o expresiones regulares
  estrictas y se citan con `sistema.q()` antes de meterlos en bash.
- Datos persistentes en `sistema.DATOS` (= `servidor-local/logs/panel/`, no se versiona).
  Escribir con `sistema.guardar_json` (atómico) / `anexar_jsonl`.
- Pruebas: `panel/pruebas/test_<modulo>.py` con `unittest`, sobre salidas de ejemplo (sin tocar el
  sistema real). Correr: `cd servidor-local/panel && python -m unittest discover -s pruebas -v`.

### Prohibido mientras se desarrolla (el servidor está EN PRODUCCIÓN, la planta lo usa)

No reiniciar ni detener contenedores, WSL ni Docker; no correr respaldos, actualizaciones,
`arranque.sh`, `correo.sh`; no aplicar arreglos de seguridad; no llamar `powershell_admin`
(abre un aviso de Windows en la pantalla del usuario); no cambiar firewall, servicios ni
registro de Windows. Solo lectura. Para probar acciones, probar la validación y armar el
comando, pero no ejecutarlo (o usar comandos inocuos como `echo`/`docker ps`). Escaneos de red:
como máximo un barrido de la red local y escaneos de puertos a la puerta de enlace
(192.168.5.1) y a este equipo (192.168.5.28).

## Datos del servidor (para no adivinar)

- Repo: `C:\IncubApp` (= `/mnt/c/IncubApp` en Ubuntu). Scripts: `servidor-local/`.
- Ubuntu: `Ubuntu-24.04`, systemd, red de WSL en espejo (la IP de Ubuntu es la del Lenovo,
  192.168.5.28; puerta de enlace 192.168.5.1). Docker dentro de Ubuntu.
- Supabase self-hosted en `/opt/incubapp/server` (`.env` con secretos, `docker compose`).
  Servicios que sobran en producción y se dejan apagados: `studio`, `supavisor` (contenedor
  `supabase-pooler`), `imgproxy` (`SOBRAN='^(studio|supavisor|imgproxy)$'` en `arranque.sh`).
- Contenedores (nombre → qué es):
  `incubapp-incubapp-1` app (nginx, puerto 80) · `supabase-db` Postgres · `supabase-auth` cuentas ·
  `supabase-rest` API REST · `supabase-storage` fotos/archivos · `realtime-dev.supabase-realtime`
  tiempo real · `supabase-envoy` puerta de la API (puerto 8000; reemplaza a kong) ·
  `supabase-meta` · `supabase-edge-functions` · `supabase-studio` (sobra) · `supabase-pooler` (sobra) ·
  `supabase-imgproxy` (sobra) · `supabase-correo-plantillas-1` plantillas de correo ·
  `incubapp-tunel` Cloudflare Tunnel (métricas en `http://incubapp-tunel:2000/ready` y `/metrics`,
  solo desde la red de Docker: `docker exec incubapp-incubapp-1 wget -q -T 5 -O - …`) ·
  `incubapp-ngrok-1` ngrok (antiguo, puerto 4040) · `incubapp-lector` lector de fotos de ronda ·
  `incubapp-asistente` asistente de voz (`http://incubapp-asistente:8080/`) ·
  `incubapp-n8n` n8n (`http://127.0.0.1:5678/healthz`).
- Salud de punta a punta (igual que el vigilante): `curl http://127.0.0.1/` = 200 y
  `curl http://127.0.0.1/auth/v1/health` = 200 o 401.
- Base de datos: `docker exec supabase-db psql -U postgres -d postgres -tAc "…"` (sin contraseña).
- systemd: `incubapp-arranque.service` (al encender), `incubapp-vigia.timer` (cada minuto),
  `incubapp-respaldo.timer` (2:00 a. m.). Registro del vigilante: `/var/log/incubapp-arranque.log`.
- Respaldo: destino en `/opt/incubapp/respaldo-destino` (carpeta de OneDrive), resultado en
  `servidor-local/logs/ultimo-respaldo.txt` (línea 1 fecha ISO, línea 2 `OK`/`ERROR`), registro
  `servidor-local/logs/respaldo.txt`, archivos `base-de-datos/incubapp-AAAA-MM-DD_HHMM.tar`.
- Windows: tarea programada «IncubApp Servidor» (S4U, al encender). Regla de firewall
  «IncubApp servidor local» (entrada TCP 80,443,8000, perfiles Privado/Dominio).
- URL pública: `https://incubapp.cdhmaker.com` (Cloudflare Tunnel → `incubapp:80`).

## `nucleo/estado.py` — Monitor de estado

```python
class Monitor:
    def __init__(self, ajustes: sistema.Ajustes): ...
    def iniciar(self) -> None            # hilos: ciclo rápido (ajustes.intervalo_rapido_s) y completo
    def detener(self) -> None
    def instantanea(self) -> dict        # último estado (forma ESTADO). Nunca bloquea; antes del
                                         # primer ciclo devuelve resumen.nivel='desconocido'
    def actualizar_ya(self) -> None      # pide un ciclo completo ya (no bloquea)
    def metricas(self, horas: float = 24) -> dict   # forma METRICAS
    def eventos(self, limite: int = 200) -> list[dict]   # más nuevo primero, forma EVENTO
    al_cambiar: list[Callable[[dict], None]]   # ganchos: se llaman con cada EVENTO nuevo
```

Una transición de nivel cuenta cuando se repite en **2 ciclos seguidos** (evita avisos por un
corte de 10 s). Eventos en `DATOS/eventos.jsonl`. Métricas: 1 punto por minuto, 7 días, en
`DATOS/metricas.json` (guardar cada 5 min y al detener).

**ESTADO** (`GET /api/estado`):
```json
{
  "generado": "2026-10-01T10:40:00-05:00",
  "ciclo_completo": "2026-10-01T10:39:30-05:00",
  "resumen": {"nivel": "ok|aviso|falla|desconocido", "titulo": "IncubApp funcionando",
              "detalle": "Todo responde. 1 aviso: …", "fallas": 0, "avisos": 1},
  "componentes": [COMPONENTE, ...],
  "contenedores": [CONTENEDOR, ...],
  "equipo": {"nombre": "DESKTOP-ROMOGM3", "windows": "Windows 11 Pro", "ip": "192.168.5.28",
             "cpu": 12.5, "ram_total_mb": 12207, "ram_usada_mb": 6100, "ram_pct": 50.0,
             "discos": [{"unidad": "C:", "total_gb": 451.0, "libre_gb": 214.0, "pct": 52.6}],
             "encendido_desde": "iso", "usuario": "Admin Mantenimiento"},
  "wsl": {"estado": "Running|Stopped|desconocido", "systemd": true, "ram_total_mb": 5926,
          "ram_usada_mb": 2283, "swap_usada_mb": 0, "disco_total_gb": 1007, "disco_libre_gb": 923,
          "carga": [0.5, 0.4, 0.3], "docker": "29.5.3"},
  "base": {"tamano": "252 MB", "tamano_bytes": 264241152, "conexiones": 40, "usuarios": 52,
           "activos_15min": 3, "tablas_grandes": [{"tabla": "public.x", "tamano": "40 MB"}]},
  "tunel": {"listo": true, "conexiones": 4, "peticiones": 1590, "errores": 0},
  "respaldo": {"ultimo": "iso|null", "resultado": "OK|ERROR|null", "horas": 8.6,
               "proximo": "iso|null", "destino": "…/IncubApp-Respaldos", "registro": ["…"]},
  "vigilante": {"activo": true, "ultima": "iso|null", "proxima": "iso|null", "registro": ["…"]},
  "git": {"rama": "…", "commit": "1ab52c8", "mensaje": "…", "fecha": "iso",
          "cambios_locales": 3, "pendientes_remoto": null},
  "publico": {"url": "https://incubapp.cdhmaker.com", "codigo": 200, "ms": 420,
              "cert_dias": 75, "error": null}
}
```
Bloques de los que no se tenga dato: `null` (la pantalla lo muestra como «sin datos»).

**COMPONENTE**:
```json
{"id": "app", "nombre": "App IncubApp", "grupo": "Acceso",
 "nivel": "ok", "estado": "Responde en 35 ms", "detalle": "texto técnico opcional o null",
 "desde": "iso de cuando tomó este nivel", "contenedor": "incubapp-incubapp-1" ,
 "acciones": ["reiniciar_contenedor"], "datos": {}}
```
Ids fijos (la pantalla les pone ícono; se pueden agregar más):
- grupo `Servidor`: `equipo` (Windows: CPU/RAM/disco), `wsl` (Ubuntu), `docker`
- grupo `Acceso`: `app` (nginx en :80), `api` (/auth/v1/health por nginx), `publico` (URL pública
  desde internet), `tunel` (Cloudflare), `ngrok` (antiguo; `apagado` si no corre)
- grupo `Supabase`: `base`, `auth`, `rest`, `storage`, `realtime`, `envoy`, `meta`, `edge`,
  `studio` (apagado = ok en producción), `pooler`, `imgproxy`, `correo` (plantillas + SMTP configurado)
- grupo `Servicios IncubApp`: `lector`, `asistente`, `n8n`
- grupo `Mantenimiento`: `respaldo` (aviso > 26 h, falla > 50 h o ERROR), `vigilante`
  (timer activo y última corrida < 3 min), `arranque` (servicio/tarea de arranque), `version` (git)
Para el `resumen`: falla si falla `app`, `api`, `base`, `wsl` o `docker`; aviso si cualquier otro
está en falla o aviso. `titulo` en lenguaje simple: «IncubApp funcionando», «IncubApp funciona
con avisos», «IncubApp NO está disponible».

**CONTENEDOR**:
```json
{"nombre": "supabase-db", "servicio": "db", "proyecto": "supabase", "estado": "running",
 "salud": "healthy|unhealthy|starting|none", "estado_texto": "Up 35 minutes (healthy)",
 "desde": "iso", "reinicios": 0, "cpu": 8.8, "mem_mb": 434.6, "mem_limite_mb": 5926,
 "puertos": "0.0.0.0:80->80/tcp", "imagen": "…", "nivel": "ok", "sobra": false}
```
(`cpu`/`mem_*` solo se llenan en el ciclo completo con `docker stats --no-stream`.)

**METRICAS** (`GET /api/metricas?horas=24`):
```json
{"t": [epoch_s, ...], "series": {"cpu": [...], "ram_pct": [...], "wsl_ram_pct": [...],
 "app_ms": [...], "contenedores_mem_mb": [...]},
 "disponibilidad": {"app": 99.8, "api": 99.9, "publico": 98.1, "tunel": 97.0, ...}}
```
(`disponibilidad`: % del tiempo en `ok`/`aviso` en la ventana pedida, por componente.)

**EVENTO**: `{"t": "iso", "componente": "tunel", "nombre": "Túnel de Cloudflare",
"nivel": "falla", "antes": "ok", "mensaje": "El túnel perdió la conexión con Cloudflare"}`

`wsl/estado.sh [rapido|completo]`: corre en Ubuntu, imprime **un** JSON. Rápido: `docker ps -a`
con formato, `curl` a la app y a /auth/v1/health (código y ms), `free`, `df /`, systemd de los 3
servicios. Completo: además `docker stats --no-stream`, psql (tamaño, conexiones, usuarios,
activos 15 min, 5 tablas más grandes), métricas del túnel, asistente, n8n, respaldo
(`ultimo-respaldo.txt`, `systemctl show incubapp-respaldo.timer`), últimas 30 líneas de
`/var/log/incubapp-arranque.log`, SMTP_HOST configurado (sí/no, **sin** la contraseña).
Cada sub-consulta con `timeout` propio; una que falle no tumba el JSON.

## `nucleo/acciones.py` — herramientas de soporte

```python
class ErrorAccion(ValueError): ...   # mensaje en español para la pantalla (HTTP 400)
def catalogo() -> list[dict]          # forma ACCION
def ejecutar(id: str, parametros: dict) -> trabajos.Trabajo   # valida y lanza; ErrorAccion si no
def fuentes_registro() -> list[dict]  # [{"id": "contenedor:supabase-auth", "nombre": "…", "grupo": "…"}]
def leer_registro(fuente: str, lineas: int = 300, filtro: str | None = None) -> dict
    # {"fuente": id, "nombre": "…", "generado": iso, "lineas": ["…"]}  (tachadas con secretos.tachar)
def configurar(monitor=None, monitor_red=None) -> None
    # panel.py le pasa los monitores al arrancar (el reporte de soporte usa monitor.instantanea()
    # y monitor.eventos(); si no están configurados, lee los archivos de DATOS).
```
**ACCION**: `{"id": "reiniciar_contenedor", "titulo": "Reiniciar un servicio", "descripcion": "…",
"grupo": "Servicios|Servidor|Mantenimiento|Diagnóstico|Abrir", "peligro": "bajo|medio|alto",
"confirmar": "texto de confirmación o null", "admin": false,
"parametros": [{"nombre": "contenedor", "etiqueta": "Servicio", "tipo": "contenedor|texto|correo|opcion",
"opciones": ["…"], "requerido": true}]}`

Catálogo mínimo (ids fijos):
`revisar_todo` (arranque.sh --vigia) · `arranque_completo` (arranque.sh) · `arrancar_servidor`
(Start-ScheduledTask «IncubApp Servidor» + esperar a que Ubuntu responda; sirve con WSL detenido) ·
`reiniciar_contenedor` / `detener_contenedor` / `encender_contenedor` (parámetro `contenedor`,
solo nombres que existan en `docker ps -a`) · `reiniciar_app` · `reiniciar_supabase` (sin los que
sobran) · `recrear_tunel` (`arranque.sh --tunel`, opción nueva que llama a `tunel_crear`) ·
`respaldo_ahora` (respaldar.sh y mostrar el resultado) · `actualizar_app` (7-actualizar-app.ps1) ·
`probar_correo` (parámetro `correo`; `correo.sh --probar`) · `studio_encender` / `studio_apagar` ·
`reiniciar_wsl` (peligro alto: `wsl --shutdown` y volver a arrancar con la tarea) ·
`limpiar_docker` (imágenes colgadas y caché de compilación > 7 días; muestra `docker system df`
antes y después) · `diagnostico_red_wsl` (diag-red.sh) · `estado_docker` (`docker system df`,
`docker info` resumido) · `reporte_soporte` (ZIP en `DATOS/reportes/` con estado, eventos,
auditoría y registros recientes **tachados**; resultado `{"archivo": ruta}`) ·
`abrir` (parámetro `destino` ∈ `app_local|publico|studio|n8n|carpeta_registros|carpeta_respaldos|carpeta_reportes`;
`os.startfile`, sin trabajo largo).
Fuentes de registro: cada contenedor (`docker logs --tail N`), `vigilante`
(/var/log/incubapp-arranque.log), `respaldo` (logs/respaldo.txt), `panel` (DATOS/panel.txt),
`actualizar` (logs/7-actualizar.txt), `correo` (logs/8-correo.txt), `arranque_windows`
(logs/9-arranque.txt).

## `nucleo/seguridad.py` — ciberseguridad del servidor

```python
tachar = secretos.tachar             # se re-exporta (lo hace nucleo/secretos.py)
def auditar(trabajo: trabajos.Trabajo | None = None) -> dict   # forma AUDITORIA; guarda DATOS/seguridad.json
def ultima_auditoria() -> dict | None
def arreglos() -> list[dict]          # [{"id","titulo","descripcion","admin": bool,"peligro"}]
def aplicar_arreglo(trabajo, id: str) -> dict   # {"ok": bool, "mensaje": "…"}; ValueError si id no existe
def puertos_escuchando() -> list[dict]
    # [{"puerto": 4040, "direccion": "0.0.0.0", "proceso": "docker-proxy", "contenedor": "incubapp-ngrok-1",
    #   "lado": "windows|ubuntu", "expuesto": true, "riesgo": "alto", "nota": "…"}]
def conexiones_activas() -> list[dict]
    # [{"local": "192.168.5.28:51234", "remoto": "104.16.1.1:443", "proceso": "chrome", "pid": 1,
    #   "estado": "Established", "nota": null|"Puerto inusual"}]
def accesos_app(horas: int = 24) -> dict
    # {"generado","horas","ingresos_ok": n,"fallidos": n,"por_usuario":[{"correo","ok","fallidos","ultimo"}],
    #  "por_ip":[{"ip","fallidos"}],"usuarios_nuevos":[{"correo","creado"}],"alertas":[HALLAZGO]}
```
**AUDITORIA**: `{"generado": iso, "segundos": 12.3, "puntaje": 0-100, "resumen": {"critico": 0,
"alto": 2, "medio": 3, "bajo": 1, "info": 4, "ok": 12}, "hallazgos": [HALLAZGO, ...]}`

**HALLAZGO**: `{"id": "defender_tiempo_real", "categoria": "windows|red|docker|supabase|app|respaldo|web",
"titulo": "La protección en tiempo real de Windows Defender está apagada", "nivel": "alto",
"detalle": "…", "recomendacion": "…", "arreglo": "activar_defender" | null, "evidencia": "texto corto" | null}`

Revisiones mínimas (cada una en su propia función; si una falla, `nivel: "info"` con el error, no
tumba la auditoría): Defender (tiempo real, firmas, último análisis) · firewall (perfiles, regla de
IncubApp: el puerto 8000 abierto a la red no hace falta, la app entra por el 80) · puertos
escuchando en 0.0.0.0 (4040 inspector de ngrok = alto: muestra el tráfico con sus claves a
cualquiera de la red; 8000 = medio) · zona Wi-Fi / conexión compartida activa (interfaz
192.168.137.x) · RDP (y NLA) · SMBv1 · cuenta Invitado · UAC · inicio de sesión automático con
contraseña guardada · recursos compartidos no administrativos · última actualización de Windows ·
Docker (puertos publicados en 0.0.0.0, contenedores privilegiados, reinicios en bucle) ·
Supabase (secretos de ejemplo en `.env`: JWT_SECRET, POSTGRES_PASSWORD, DASHBOARD_PASSWORD;
permisos de `.env` y `tunel.env` = 600; `DISABLE_SIGNUP`, `ENABLE_EMAIL_AUTOCONFIRM` como info) ·
**tablas de `public` sin RLS** (alto: con la clave anon, que es pública, cualquiera las lee) ·
la `SERVICE_ROLE_KEY` NO aparece en los archivos que sirve nginx (crítico si aparece) ·
`.env` con secretos versionado en git · web pública: días de certificado, cabeceras (HSTS,
X-Content-Type-Options, X-Frame-Options o CSP frame-ancestors, Referrer-Policy), `/.env` y
`/.git/config` no se sirven · respaldo reciente · espacio en disco · hora del equipo sincronizada.
Arreglos automáticos (solo con botón y confirmación; los de Windows con `powershell_admin`):
`activar_defender`, `analisis_rapido_defender`, `actualizar_firmas_defender`, `cerrar_puerto_8000`
(quitar 8000 de la regla de firewall), `ngrok_solo_local` (detener ngrok y quitarle el reinicio
automático: `docker update --restart=no` + `docker stop`; la app sigue por Cloudflare),
`activar_firewall`, `desactivar_smb1`, `desactivar_invitado`, `permisos_env` (chmod 600).

## `nucleo/red.py` — red de la empresa

```python
class MonitorRed:
    def __init__(self, ajustes): ...
    def iniciar(self) / detener(self)
    def resumen(self) -> dict     # forma RED
    def calidad(self, horas: float = 24) -> dict
        # {"t": [epoch], "series": {"puerta": [ms|null], "1.1.1.1": [...], "8.8.8.8": [...], "dns_ms": [...]},
        #  "perdida": {"puerta": 0.0, ...}, "cortes": [{"inicio","fin","segundos","objetivo"}]}
def escanear_red(trabajo, red: str | None = None) -> dict
    # {"red": "192.168.5.0/24", "generado", "segundos", "dispositivos": [DISPOSITIVO], "nuevos": [DISPOSITIVO]}
def inventario() -> list[dict]                       # [DISPOSITIVO] guardados en DATOS/red-dispositivos.json
def actualizar_dispositivo(mac: str, nombre=None, notas=None, conocido=None) -> dict
def olvidar_dispositivo(mac: str) -> bool
def escanear_puertos(trabajo, host: str, perfil: str = 'comun') -> dict
    # perfil: 'rapido' (20) | 'comun' (~100) | 'industrial' (PLC/SCADA/cámaras) | 'completo' (1-1024 + extra)
    # {"host","perfil","generado","segundos","abiertos":[{"puerto","servicio","riesgo","nota","titulo_web": "…"|null}],
    #  "hallazgos":[HALLAZGO]}
def herramienta(trabajo, tipo: str, params: dict) -> dict
    # tipo: ping (host, cantidad≤50) · traceroute (host) · dns (nombre; compara DNS del equipo vs 1.1.1.1 y 8.8.8.8)
    #       http (url http/https: código, ms, cabeceras de seguridad, certificado) · puerto (host, puerto)
    #       wol (mac) · upnp (descubrimiento SSDP en la red)
def auditar_red(trabajo) -> dict      # forma AUDITORIA, guarda DATOS/red-auditoria.json
def ultima_auditoria_red() -> dict | None
def actualizar_fabricantes(trabajo) -> dict    # descarga la base de fabricantes (manuf de Wireshark) a DATOS/fabricantes.txt
```
Validar `host` (IPv4, o nombre DNS con `^[A-Za-z0-9.-]{1,253}$`), `mac`, `red` (CIDR, máximo /22).
Escaneos con hilos (máx. 64 a la vez) y tiempo límite corto; `trabajo.revisar()` en los bucles.
**RED**: `{"generado", "interfaces": [{"nombre","ip","mascara","puerta","dns":[…],"mac","tipo"}],
"puerta": "192.168.5.1", "red": "192.168.5.0/24", "internet": {"nivel": "ok|aviso|falla",
"puerta_ms": 1, "internet_ms": 25, "perdida_pct": 0, "dns_ms": 12, "texto": "Internet estable"},
"dispositivos": {"total": 16, "conocidos": 10, "nuevos": 2, "ultimo_escaneo": "iso"},
"alertas": [HALLAZGO]}` (alertas en vivo: MAC de la puerta de enlace cambió / duplicada →
posible suplantación ARP; equipos nuevos sin identificar).
**DISPOSITIVO**: `{"ip","mac","fabricante","nombre_red" (DNS/NetBIOS),"nombre" (puesto por el usuario),
"notas","conocido": bool,"primera_vez","ultima_vez","en_linea": bool,"mac_aleatoria": bool,
"tipo": "router|camara|impresora|pc|celular|plc|desconocido","puertos": [n,…]}`
Monitor de internet: cada `ajustes.intervalo_internet_s` mide puerta de enlace, 1.1.1.1 y 8.8.8.8
(ICMP con `IcmpSendEcho` de iphlpapi por ctypes: no abre procesos y no pide administrador) y el
tiempo de DNS; historial 7 días en `DATOS/red-calidad.json`.

## `panel.py` — servidor, sesión, ventana y avisos

- `python panel.py` (= `--abrir`): si ya hay un panel corriendo (GET `/api/ping` en el puerto
  de `PRIVADO/sesion.json`), solo abre otra ventana; si no, arranca el servidor y abre la ventana.
  `--sin-ventana`: solo el servidor. `--puerto N` (por defecto 8770; si está ocupado por otro
  programa, prueba 8771-8779).
- Escucha **solo en 127.0.0.1**. Llave aleatoria (`secrets.token_urlsafe(32)`) por arranque en
  `PRIVADO/sesion.json` `{"puerto","llave","pid","inicio"}`.
- Ventana: `msedge.exe --app=http://127.0.0.1:PUERTO/entrar?llave=… --user-data-dir=PRIVADO/edge
  --no-first-run --no-default-browser-check --window-size=1440,900`; si no hay Edge, Chrome; si no,
  `os.startfile`.
- `GET /entrar?llave=…` → cookie `panel=<llave>; HttpOnly; SameSite=Strict; Path=/` y redirige a `/`.
- Toda `/api/*` (menos `/api/ping`) exige la cookie. Además: cabecera `Host` debe ser
  `127.0.0.1:PUERTO` o `localhost:PUERTO` (contra DNS rebinding); toda petición que no sea GET
  exige la cabecera `X-Panel: 1` y, si trae `Origin`, que sea el del panel (contra CSRF).
  Sin sesión → 401 `{"error": "Abra el panel desde el acceso directo «Panel IncubApp»."}`.
- Cabeceras: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`,
  `X-Frame-Options: DENY`, `Cache-Control: no-store` en /api.
- Arranca `Monitor`, `MonitorRed`, y tareas periódicas: auditoría cada `ajustes.auditoria_min`,
  escaneo de red cada `ajustes.escaneo_red_min`.
- Avisos de Windows (toast) si `ajustes.notificaciones`: eventos de `falla` y de recuperación de
  componentes del resumen, equipo nuevo en la red, suplantación ARP, respaldo fallido. Máximo
  1 aviso por componente cada 10 min. (PowerShell + Windows.UI.Notifications, en un hilo.)

### Rutas HTTP (todas devuelven JSON; error → `{"error": "mensaje en español"}` con 400/404/409/500)

| Método y ruta | Llama a | Devuelve |
|---|---|---|
| GET `/api/ping` (sin sesión) | — | `{"app": "incubapp-panel", "version", "pid"}` |
| GET `/api/estado` | `monitor.instantanea()` | ESTADO |
| POST `/api/estado/actualizar` | `monitor.actualizar_ya()` | `{"ok": true}` |
| GET `/api/metricas?horas=24` | `monitor.metricas(h)` | METRICAS |
| GET `/api/eventos?limite=200` | `monitor.eventos(n)` | `{"eventos": [EVENTO]}` |
| GET `/api/acciones` | `acciones.catalogo()` | `{"acciones": [ACCION]}` |
| POST `/api/acciones/<id>` body `{"parametros": {}}` | `acciones.ejecutar` | `{"trabajo": TRABAJO}` |
| GET `/api/trabajos` | `TRABAJOS.lista()` | `{"trabajos": [TRABAJO sin líneas]}` |
| GET `/api/trabajos/<id>?desde=N` | `Trabajo.como_dict(N)` | TRABAJO |
| POST `/api/trabajos/<id>/cancelar` | `TRABAJOS.cancelar` | `{"ok": bool}` |
| GET `/api/registros/fuentes` | `acciones.fuentes_registro()` | `{"fuentes": […]}` |
| GET `/api/registros?fuente=…&lineas=300&filtro=…` | `acciones.leer_registro` | REGISTRO |
| GET `/api/seguridad` | `seguridad.ultima_auditoria()` + arreglos | `{"auditoria": AUDITORIA|null, "arreglos": […], "trabajo": TRABAJO|null}` |
| POST `/api/seguridad/auditar` | `TRABAJOS.lanzar('auditoria', …, seguridad.auditar, exclusivo='auditoria')` | `{"trabajo"}` |
| POST `/api/seguridad/arreglar` body `{"id"}` | `TRABAJOS.lanzar('arreglo', …, seguridad.aplicar_arreglo, id)` | `{"trabajo"}` |
| GET `/api/seguridad/puertos` | `seguridad.puertos_escuchando()` | `{"puertos": […]}` |
| GET `/api/seguridad/conexiones` | `seguridad.conexiones_activas()` | `{"conexiones": […]}` |
| GET `/api/seguridad/accesos?horas=24` | `seguridad.accesos_app(h)` | ACCESOS |
| GET `/api/red` | `monitor_red.resumen()` | RED |
| GET `/api/red/calidad?horas=24` | `monitor_red.calidad(h)` | CALIDAD |
| GET `/api/red/dispositivos` | `red.inventario()` | `{"dispositivos": [DISPOSITIVO]}` |
| POST `/api/red/dispositivos` body `{"mac","nombre","notas","conocido"}` | `red.actualizar_dispositivo` | DISPOSITIVO |
| POST `/api/red/dispositivos/olvidar` body `{"mac"}` | `red.olvidar_dispositivo` | `{"ok"}` |
| POST `/api/red/escanear` body `{"red": null}` | `lanzar('escaneo_red', …, exclusivo='escaneo_red')` | `{"trabajo"}` |
| POST `/api/red/puertos` body `{"host","perfil"}` | `lanzar('puertos', …)` | `{"trabajo"}` |
| POST `/api/red/herramienta` body `{"tipo", ...params}` | `lanzar('herramienta', …)` | `{"trabajo"}` |
| GET `/api/red/auditoria` | `red.ultima_auditoria_red()` | `{"auditoria": AUDITORIA|null, "trabajo": TRABAJO|null}` |
| POST `/api/red/auditar` | `lanzar('auditoria_red', …, exclusivo='auditoria_red')` | `{"trabajo"}` |
| POST `/api/red/fabricantes` | `lanzar('fabricantes', …)` | `{"trabajo"}` |
| GET `/api/ajustes` · POST `/api/ajustes` | `Ajustes` | ajustes |
| POST `/api/salir` | cierra el servidor | `{"ok"}` |
| GET `/` y `/<archivo>` | archivos de `web/` (sin sesión; sin listar carpetas; sin `..`) | |

**TRABAJO** = `Trabajo.como_dict()` (ver `nucleo/trabajos.py`). La pantalla consulta
`/api/trabajos/<id>?desde=<total_lineas>` cada 1 s mientras `estado == "corriendo"`.

## Instalación (`13-INSTALAR-PANEL.bat` / `13-instalar-panel.ps1`)

Sin permisos de administrador: busca `pythonw.exe` real (no el alias de WindowsApps), crea
accesos directos «Panel IncubApp» en el Escritorio, en el menú Inicio y en la carpeta **Inicio**
de Windows (se abre sola al iniciar sesión), con ícono propio (`panel/web/icono.ico`), y abre el
panel. `PANEL-INCUBAPP.bat` abre el panel a mano. Registro en `logs/13-panel.txt`.

## Modo «servidor activo» (control remoto y bloqueo del apagado) — `nucleo/modo.py`

Para cuando el responsable no está en la planta: el equipo solo se controla a distancia desde
sus equipos. Lo activa una persona desde el panel (Windows pide permiso de administrador).
Activar aplica, en un solo script elevado:
1. Botón de encendido y botón de suspensión del equipo → «No hacer nada» (con y sin batería,
   `powercfg … SUB_BUTTONS PBUTTONACTION / SBUTTONACTION = 0`). La pulsación LARGA (4 s) es un
   apagado forzado del hardware: no se puede bloquear por software (se dice en la pantalla).
2. Sin botón de apagar en la pantalla de inicio de sesión / bloqueo (`ShutdownWithoutLogon=0`).
3. Escritorio remoto encendido con NLA, y firewall: se desactivan las reglas genéricas de
   «Escritorio remoto» y se crea «IncubApp acceso remoto» (TCP 3389) SOLO desde `permitidos`
   (IP o CIDR privadas, o la red de Tailscale 100.64.0.0/10).
4. Sin suspensión/hibernación (ya lo dejaba el paso 1 de instalación; se reafirma).
5. Opcional: bloquear la pantalla al terminar.
Desactivar revierte 1-3 (botón = Apagar, apagado en la pantalla de inicio, escritorio remoto
apagado y regla borrada).

```python
def estado() -> dict            # MODO (lee el estado real del equipo; sin administrador)
def activar(trabajo, permitidos: list[str], bloquear: bool = False) -> dict   # pide UAC
def desactivar(trabajo) -> dict                                           # pide UAC
def bloquear_pantalla() -> dict  # bloquea la sesión ahora (sin administrador)
def validar_permitidos(lista) -> list[str]   # ValueError en español si alguna no sirve
```
**MODO** (`GET /api/modo`):
```json
{"activo": true, "parcial": false, "activado_en": "iso|null", "permitidos": ["100.64.0.0/10", "192.168.5.37"],
 "boton_encendido": {"ac": "nada|apagar|suspender|hibernar|apagar_pantalla|desconocido", "dc": "…"},
 "boton_suspender": {"ac": "…", "dc": "…"},
 "apagado_sin_sesion": false,
 "escritorio_remoto": {"activo": true, "nla": true, "regla": true, "regla_remotos": ["100.64.0.0/10"],
                       "reglas_genericas_abiertas": false, "puerto": 3389},
 "tailscale": {"instalado": true, "servicio": "Running|Stopped|null", "ip": "100.101.102.103|null", "nombre": "desktop-romogm3|null"},
 "equipo": {"nombre": "DESKTOP-ROMOGM3", "ip_lan": "192.168.5.28", "usuario": "Admin Mantenimiento"},
 "protecciones": [{"id": "boton", "titulo": "Botón de encendido sin efecto", "ok": true, "detalle": "…"}, …],
 "avisos": ["Mantener presionado el botón 4 segundos apaga el equipo a la fuerza: eso no se puede bloquear por software."]}
```
Rutas: `GET /api/modo` · `POST /api/modo/activar {"permitidos": [...], "bloquear": bool}` → `{"trabajo"}` ·
`POST /api/modo/desactivar` → `{"trabajo"}` · `POST /api/modo/bloquear` → `{"ok": true}`.
Acción `abrir` con destinos nuevos: `tailscale` (https://tailscale.com/download/windows) y `manual`
(el PDF `servidor-local/MANUAL-SERVIDOR-INCUBAPP.pdf`).
