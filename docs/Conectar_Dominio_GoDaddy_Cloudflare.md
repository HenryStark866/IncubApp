# Conectar incubapp.cdhmaker.com (GoDaddy → Cloudflare Tunnel → servidor IncubApp)

Instrucciones para un agente que opera el navegador y el PC de Henry. Objetivo: que
`https://incubapp.cdhmaker.com` abra IncubApp, que corre en el PC Lenovo de la oficina.
Hay que hacerlo sin romper el sitio ni el correo que ya usan `cdhmaker.com`.

## Reglas para el agente (obligatorias)

1. **No borres ningún registro DNS** ni en GoDaddy ni en Cloudflare. Solo se agregan registros o se cambia la nube a gris.
2. **No escribas contraseñas.** Si una página pide iniciar sesión, un código 2FA o una tarjeta, detente y pide a Henry que lo haga.
3. **El token del túnel es secreto.** No lo copies en chats, notas ni archivos. Henry lo copia y lo pega solo en la ventana del paso F.
4. **Antes de guardar el cambio de nameservers (paso D), detente y pide confirmación a Henry**, mostrándole la tabla del paso B comparada con la del paso C.
5. Si una pantalla no coincide con lo descrito (Cloudflare y GoDaddy cambian sus menús), busca la opción equivalente por su nombre. Si no la encuentras, toma una captura y pregunta. **No improvises.**
6. **No compres nada.** Todo se hace en planes gratuitos. Rechaza las ofertas de GoDaddy (DNS premium, protección, etc.).

## A. Requisito: el servidor está actualizado

En el PC Lenovo (`C:\IncubApp`), en la terminal de VS Code:
```powershell
git pull origin claude/blissful-pasteur-pwx5gl
```
Después, doble clic en `C:\IncubApp\servidor-local\7-ACTUALIZAR-APP.bat` y esperar a que diga
`La app responde en este equipo (HTTP 200).` Si falla, detente y avisa.

## B. Respaldo de los registros DNS actuales (GoDaddy)

1. Abre https://dcc.godaddy.com/control/portfolio (Henry inicia sesión si hace falta).
2. Haz clic en `cdhmaker.com` y luego en la pestaña **DNS** (o "Administrar DNS"). URL directa: https://dcc.godaddy.com/control/dnsmanagement?domainName=cdhmaker.com
3. Anota **todos** los registros en una tabla con: Tipo, Nombre, Valor, TTL. Suele haber `A @`, `CNAME www`, `MX`, `TXT` (SPF, verificación de Google/Firebase) y, si hay correo de Microsoft/GoDaddy, `CNAME autodiscover` y otros.
4. Si existe el botón **"Exportar"** o "Export zone file" (a veces está en el menú de tres puntos), descarga el archivo como respaldo y guárdalo en `Documentos`.
5. Anota también si el dominio tiene **reenvío** ("Forwarding") configurado.
6. En la sección **DNSSEC** del dominio, anota si está activado.

## C. Agregar el dominio a Cloudflare

1. Abre https://dash.cloudflare.com/sign-up. Si Henry ya tiene cuenta, usa https://dash.cloudflare.com/login (Henry inicia sesión).
2. En https://dash.cloudflare.com pulsa **"Add a domain"** / **"Onboard a domain"**.
3. Escribe `cdhmaker.com` y elige **"Quick scan for DNS records"**. Continúa.
4. Plan: **Free** ($0). Continúa.
5. Compara los registros que encontró Cloudflare con tu tabla del paso B:
   - Agrega con **"Add record"** cualquiera que falte, con el mismo Tipo, Nombre y Valor.
   - Pon **todos** los registros en **"DNS only"** (nube gris), sobre todo los `A`/`CNAME` del sitio actual (Firebase, IP `199.36.158.100`) y los de correo.
   - No agregues nada para `incubapp`: el túnel lo crea solo en el paso E.
6. Cloudflare muestra **dos nameservers** (por ejemplo `ana.ns.cloudflare.com` y `bob.ns.cloudflare.com`). Anota exactamente esos dos.

## D. Cambiar los nameservers en GoDaddy

**Detente y pide confirmación a Henry** mostrándole las tablas de B y C.

1. Si en el paso B el DNSSEC estaba activado: en GoDaddy, en la configuración del dominio, **desactiva DNSSEC** primero.
2. Abre https://dcc.godaddy.com/control/portfolio/cdhmaker.com/settings (o `cdhmaker.com` → **DNS** → pestaña **Nameservers**).
3. Pulsa **"Change Nameservers"** / **"Cambiar servidores de nombres"**.
4. Elige **"I'll use my own nameservers"** / **"Usaré mis propios servidores de nombres"**.
5. Borra los que aparecen (`nsXX.domaincontrol.com`) y escribe **solo** los dos de Cloudflare del paso C.6.
6. Guarda. Acepta la advertencia de GoDaddy de que dejará de administrar el DNS (es lo esperado).
7. Vuelve a Cloudflare, pulsa **"Check nameservers now"** y espera el correo o el estado **Active**. Suele tardar menos de una hora y puede llegar a 24 horas.
8. Mientras esperas, comprueba que el sitio actual `https://cdhmaker.com` sigue abriendo.

## E. Crear el túnel (solo cuando el dominio esté "Active")

1. Abre https://one.dash.cloudflare.com. Si pide nombre de equipo, usa `cdhmaker`. Si pide plan, elige **Free**; si pide tarjeta, detente y que Henry decida.
2. Menú **Networks → Tunnels** (también puede estar en **Networks → Connectors**). Pulsa **"Create a tunnel"**.
3. Tipo: **Cloudflared**. Nombre: `incubapp`. Pulsa **Save tunnel**.
4. En la pantalla de instalación se ve un comando con `--token eyJ...`. **No copies el token tú: avisa a Henry** para que lo copie (de `eyJ` hasta el final, sin espacios) y lo tenga listo para el paso F. No ejecutes ese comando: el script del paso F instala el conector.
5. Pulsa **Next**. En **Public hostname** (o "Published application routes"), llena:
   - Subdomain: `incubapp`
   - Domain: `cdhmaker.com`
   - Path: vacío
   - Service → Type: `HTTP`
   - Service → URL: `incubapp:80`
6. Pulsa **Save** / **Complete setup**.

## F. Conectar el PC Lenovo al túnel

1. En el Lenovo, doble clic en `C:\IncubApp\servidor-local\5-ACCESO-EXTERNO.bat`.
2. Cuando pida el token, **Henry lo pega** (no se ve al pegarlo) y presiona Enter.
3. Cuando pida la dirección, solo presiona **Enter** (queda `https://incubapp.cdhmaker.com`).
4. Espera `LISTO: el servidor responde desde internet.`
5. En https://one.dash.cloudflare.com → Networks → Tunnels, el túnel `incubapp` debe verse **HEALTHY**.

## G. Verificación final

- Abre https://incubapp.cdhmaker.com: debe aparecer la pantalla "Acceso a la plataforma" de IncubApp.
- Pruébalo también desde un celular con datos móviles, sin el wifi de la oficina, e inicia sesión.
- Comprueba que `https://cdhmaker.com` y el correo del dominio siguen funcionando.
- Informa a Henry: estado del túnel, resultado de las tres pruebas y cualquier registro que hayas agregado.

## Si algo falla

| Síntoma | Qué hacer |
|---|---|
| Error 1033 (Argo Tunnel error) | El Lenovo no está conectado: repite el paso F; revisa que el PC esté encendido y con internet. |
| Error 502 / Bad gateway | En el paso E.5 la URL debe ser exactamente `incubapp:80`; ejecuta `7-ACTUALIZAR-APP.bat`. |
| "This site can't be reached" / DNS_PROBE | El dominio aún no está Active o falta el hostname del paso E.5. Espera y revisa. |
| cdhmaker.com dejó de abrir | Falta un registro del paso B en Cloudflare o quedó en nube naranja: compáralo con la tabla. |
| Correo dejó de llegar | Faltan registros MX/TXT/CNAME del correo: agrégalos en Cloudflare en "DNS only". |
