# Estado: servidor local Supabase self-hosted para IncubApp

Este archivo es para que una sesión de Claude en OTRO equipo (el Lenovo de mesa,
`DESKTOP-ROMOGM3`) retome el trabajo sin perder contexto. Está en
`servidor-local/ESTADO.md` dentro del repo `IncubApp`.

## Por qué se está haciendo esto

El proyecto de Supabase en la nube (`pdxlmjlooeqlvvgbosbu`, org "Incubant") quedó
**pausado por facturas sin pagar** y Henry no puede pagarlo ahora mismo
("no tengo para pagar"). Se decidió auto-hospedar Supabase (Docker + Postgres)
en un equipo físico de la oficina, en vez de pagar la nube.

## Dónde están los scripts

`IncubApp/servidor-local/` (en el repo de git, rama `main`). Se ejecutan desde
VS Code: **Terminal → Run Task** y eliges la tarea. Hay 4 pasos, en orden:

1. **Servidor 0 · Diagnóstico del equipo** — solo lee, no cambia nada.
2. **Servidor 1 · Preparar Windows (pide administrador)** — activa WSL2, instala
   Ubuntu-24.04, deja el equipo sin suspenderse, abre el firewall, programa
   arranque automático. Pide el permiso de administrador de Windows (UAC).
3. **Servidor 2 · Instalar Docker y Supabase** — instala Docker dentro de WSL,
   clona `supabase/supabase` (rama `self-hosted/v0.8.2`), genera claves nuevas
   (nunca reutiliza las de la nube) y levanta los contenedores. Tarda
   15-30 min. NO pide administrador.
4. **Servidor 3 · Restaurar backup** — restaura el backup de la base de datos
   descargado de Supabase (`db_cluster-23-09-2026@09-32-28.backup.gz`, debería
   estar en la carpeta Descargas) al Postgres nuevo.

Los scripts son **idempotentes**: se pueden volver a correr y saltan lo que ya
esté hecho.

## Ojo: se instaló por error primero en el portátil ("mrstark")

Henry pidió instalar todo en "el PC de escritorio de la oficina". Se empezó a
instalar en el equipo conectado en ese momento, cuyo nombre de dispositivo es
`mrstark` — que resultó ser **su portátil**, no el Lenovo de mesa
(`DESKTOP-ROMOGM3`). Se detuvo ahí cuando se aclaró la confusión.

**En mrstark (portátil) ya quedó instalado y funcionando:**
- WSL2 activado, Ubuntu-24.04 importado (usando `wsl --import` porque
  `wsl --install --web-download` fallaba en ese equipo — no registraba la
  distro después de descargar; el script ya trae el arreglo).
- Tarea programada de Windows "IncubApp Servidor" (mantiene WSL vivo al
  iniciar sesión).
- El paso 2 (Docker + Supabase) se lanzó pero **no se confirmó si terminó**
  antes de cortar — revisar `servidor-local/logs/2-instalar.txt` en mrstark si
  se retoma ahí.

Por ahora esto se deja tal cual en el portátil (no se pidió deshacerlo). El
trabajo real se está pasando al Lenovo.

## El Lenovo (DESKTOP-ROMOGM3) — equipo objetivo real

- Windows 11 Pro, Intel Core i3-4160 @ 3.60GHz, **12 GB RAM DDR3**, sin tarjeta
  de video dedicada (Intel HD Graphics 4400, 112 MB).
- Con 12 GB el equipo ya tiene margen razonable para Docker + Supabase
  self-hosted, aunque el procesador sigue siendo antiguo y sera el limite en
  tareas concurrentes.
- El script de preparación (`1-preparar-windows.ps1`) asigna automaticamente
  **7 GB a WSL**, **4 GB de swap** y hasta **4 procesadores**, dejando unos
  5 GB para Windows. Si el equipo se pone inestable, editar
  `%USERPROFILE%\.wslconfig` y bajar `memory=` a 6GB.

## Qué falta después de que el servidor quede levantado

1. Restaurar el backup de la base de datos (paso 3).
2. Buscar y restaurar el **backup de archivos/storage** (fotos, evidencias,
   manuales) — Henry lo estaba descargando de Supabase pero no se confirmó
   dónde quedó ni si terminó de descargar. Preguntarle.
3. Reconfigurar el frontend de IncubApp para que apunte al servidor nuevo:
   tomar `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY` de
   `servidor-local/logs/publico.env` (que genera el paso 2) y ponerlos donde
   la app los lea (variables de entorno de build / `.env` local), en vez de
   apuntar al proyecto de Supabase en la nube que está pausado.
4. Probablemente haya que exponer el servidor a internet si alguien necesita
   entrar desde fuera de la red local (no pedido todavía — por ahora es solo
   red local).

## Hablar siempre en español con Henry

Instrucción explícita y permanente de Henry desde el inicio de esta sesión.
También pidió: sin autenticación de Google (ya se quitó, ver commit
`44b9564`), que la app funcione 100% offline (ya implementado, ver
`src/lib/offlineAuth.js`).

## Estado de git

- Último commit real de la app: `44b9564` "fix: acceso como al inicio (sin
  Google), registro con empresa y entrada sin conexión" — ya en
  `origin/main`.
- El working tree en mrstark tiene **muchísimos archivos modificados sin
  commitear** que no tienen relación con esta tarea (componentes, datos,
  scripts de planta, etc.) — probablemente trabajo en curso de Henry con otra
  herramienta. **No tocar ni commitear esos archivos** al trabajar en
  `servidor-local/`; solo se sube esa carpeta (y este archivo).

## Nota sobre las tareas de VS Code

`.vscode/tasks.json` está en `.gitignore` (config local del editor), así que
las tareas "Servidor 0/1/2/3" que aparecen en **Terminal → Run Task** en
mrstark NO viajan con el `git pull` en el Lenovo. Ahí lo más simple es correr
los `.bat` directamente desde el Explorador de archivos (doble clic), en este
orden: `0-DIAGNOSTICO.bat` → `1-PREPARAR-WINDOWS.bat` (pide administrador) →
`2-INSTALAR-SERVIDOR.bat` → `3-RESTAURAR-BACKUP.bat`. O se puede recrear
`tasks.json` a mano si se prefiere usar VS Code.

## Actualización 23-09-2026 (noche) — Lenovo DESKTOP-ROMOGM3

- Repo clonado en `C:\IncubApp` (sin espacios en la ruta; el usuario de Windows es
  "Admin Mantenimiento" y las rutas con espacio dan problemas al pasar a WSL).
- Diagnóstico inicial: RAM 3,9 GB, **virtualización desactivada en BIOS** (hay que activar
  Intel VT-x: F1 → Advanced → CPU Setup), disco C: 293 GB libres, IP LAN 192.168.5.68.
- Actualización: la RAM fue ampliada a **12 GB DDR3**. El script ahora configura
  WSL con `memory=7168MB`, `processors=4`, `swap=4GB` y recuperación gradual de
  memoria, dejando aproximadamente 5 GB para Windows.
- Paso 1 corrido una vez: WSL y VirtualMachinePlatform activados; falta reiniciar
  y volver a correrlo.
- El ajuste anterior para 4 GB (`memory=2560MB`, `swap=3GB`) queda obsoleto. Con
  12 GB se mantiene `autoMemoryReclaim=gradual`; tras arrancar se apagan `studio`, `supavisor` e
  `imgproxy` (la app no usa transformación de imágenes). Studio: `docker compose start studio`.
- Nuevos pasos:
  - **4-ACTIVAR-RESPALDO.bat** → respaldo diario 2:00 a. m. (temporizador systemd
    `incubapp-respaldo`) a `OneDrive - Antioqueña de Incubacion\IncubApp-Respaldos`:
    base (`pg_dump -Fc` + roles, 14 días) y fotos (rsync incremental, nunca borra).
  - **5-ACCESO-EXTERNO.bat** → Cloudflare Tunnel (contenedor `incubapp-tunel`, token en
    `/opt/incubapp/tunel.env`); requiere cuenta de Cloudflare y un dominio en Cloudflare.
    Public hostname → `HTTP kong:8000`. Actualiza SUPABASE_PUBLIC_URL y `logs/publico.env`.
  - El arranque automático queda configurado por la tarea de Windows **IncubApp Servidor**:
    se ejecuta al iniciar Windows y al iniciar sesión, arranca WSL, Docker y el contenedor
    `incubapp-tunel`. El contenedor usa `--restart unless-stopped` para recuperarse de
    caídas de red o reinicios del proceso.
- Datos del backup en la nube: 16 usuarios, ~80 MB de datos, 15.160 archivos (2,1 GB)
  registrados en storage.objects. **Los archivos de fotos NO vienen en el backup de la
  base**: hay que conseguir el backup de Storage aparte.
