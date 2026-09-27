# IncubApp — SaaS multi-empresa (planta, granja y gerencia)

**Marca comercial / producto:** **IncubApp**  
**Propietario y operador del SaaS:** **CDH Maker**  
**Primer cliente / piloto:** Antioqueña de Incubación SAS (Incubant) — datos conservados; su identidad visual solo **dentro** de su tenant.

Plataforma web multi-tenant para **plantas de incubación** y **granjas**: rondas con foto, OT, ventas, logística, sanidad, gerencia, asistencia, cumplimiento y expansión a más empresas.

**Versión documentada:** 3.2 · Julio 2026  
**Operador SaaS:** CDH Maker · Henry Camilo Taborda Galeano  

---

## Documentación

| Documento | Descripción |
|-----------|-------------|
| [docs/Modulo_Negocio_IncubApp.md](./docs/Modulo_Negocio_IncubApp.md) | **Módulo de negocio: roles, garantías, go-live, SLA** |
| [docs/Identidad_IncubApp.md](./docs/Identidad_IncubApp.md) | Slogan, misión, visión, GTM y activos de marca |
| [docs/SaaS_CDH_Maker_MultiTenant.md](./docs/SaaS_CDH_Maker_MultiTenant.md) | Modelo multi-tenant y seguridad |
| [docs/00_INDICE_DOCUMENTACION.md](./docs/00_INDICE_DOCUMENTACION.md) | Índice de `docs/` |
| [docs/Plan_Fidelizacion_y_Expansion_SaaS.md](./docs/Plan_Fidelizacion_y_Expansion_SaaS.md) | **Plan de fidelización (90 d / 95 %) y expansión** a clientes y empresas hermanas |
| [docs/Avance_Producto_Julio_2026.md](./docs/Avance_Producto_Julio_2026.md) | Avance técnico y de módulos |
| [docs/Tecnologias_y_Lenguajes_FAQ.md](./docs/Tecnologias_y_Lenguajes_FAQ.md) | **Tecnologías y lenguajes:** qué son, cómo funcionan y para qué |
| [src/DOCUMENTACION_RECORRIDO.md](./src/DOCUMENTACION_RECORRIDO.md) | Mapa del código fuente |
| `docs/*.docx` / `*.pptx` | Manuales, contrato, presupuesto, presentación |

---

## Módulos principales

- **Administración CDH Maker (SaaS)** — empresas clientes, usuarios, multi-membresía, aprobaciones.  
  Los usuarios de clientes **no** tienen herramientas de desarrollo del software.
- **Módulos herméticos** — cada rol ve solo su área; accesos temporales con aprobación.
- **Gerencia** — cockpit, scorecard IE, **bandeja** (OC / facturas / cotizaciones / informes), asesor.
- **Plantas y planos** — mapa de piso, salas, máquinas, geo-calibración.
- **Granjas y levantes** — lotes, grading, reportes de huevo.
- **Mantenimiento y supervisión** — OT, rondas con foto, turnos.
- **Recepción, frío y cargue** — cadena del huevo.
- **Ventas, logística, inventarios, veterinaria, IoT/bioseguridad**.
- **Asistencia** — ingreso/salida con **selfie + marca de agua** (nombre, fecha, hora, lugar, GPS).
- **Cumplimiento** — metas del coordinador vs reportado; rondas mín. 6/turno; elegibilidad de bono.
- **Chat y notificaciones** — org + DM; OT no se empujan a gerencia.

---

## Plan de fidelización y expansión (resumen)

1. **Uso al 100 %** de la app por todo el personal (indicadores de labor).
2. Tras **90 días de uso continuo** de la SaaS → elegibilidad al plan de bonos.
3. Bono para quien cumple **≥ 95 %** de lo esperado (metas del coordinador) + adherencia al turno.
4. Turneros: **mínimo 6 reportes de ronda por turno** (ajustable).
5. El **dinero del bono no sale de la nómina de la planta**: se financia con la venta de **infraestructura como servicio** a **clientes y empresas hermanas** (software + BD administrados).
6. Los 90 días en planta real son el **respaldo** para captar a los demás: servicio sólido, medible y demostrable.

Detalle completo: [docs/Plan_Fidelizacion_y_Expansion_SaaS.md](./docs/Plan_Fidelizacion_y_Expansion_SaaS.md).

---

## Roles (orientativos)

Desarrollador (org), gerencia, coordinadores por área, supervisor, operario de turno, auxiliares, recepción, galponero, cliente (portal), admin de plataforma.  
Cada rol entra a su módulo; el único omnisciente es el **admin de plataforma**.

---

## Stack

- **Frontend:** React 19 + Vite 8 (PWA)
- **Backend:** Supabase (PostgreSQL + RLS multi-tenant, Auth, Realtime, Storage)
- **Despliegue:** Vercel (`deploy_incubapp.bat`)
- **Grok / OpenAI:** opcionales (`VITE_XAI_API_KEY`); la app funciona sin ellos
- **Offline:** Service Worker (shell), cola IndexedDB, caché de lecturas y banner de sincronización — ver [docs/Offline_Operacion.md](./docs/Offline_Operacion.md)

### ¿Qué es cada tecnología? (FAQ)

Preguntas y respuestas en lenguaje claro (**qué es · cómo funciona · para qué**):

→ **[docs/Tecnologias_y_Lenguajes_FAQ.md](./docs/Tecnologias_y_Lenguajes_FAQ.md)**

Incluye JavaScript, JSX, HTML, CSS, SQL, React, Vite, Supabase, PostgreSQL, RLS, Vercel, PWA, Leaflet, Excel (SheetJS), Node/npm, y conceptos (SPA, multi-tenant, hooks, migraciones).

---

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm run lint     # oxlint
npm run build    # build de producción
```

Variables (`.env`):

```
VITE_SUPABASE_URL=<url del proyecto>
VITE_SUPABASE_KEY=<anon / publishable key>
# Opcional:
# VITE_XAI_API_KEY=...
```

### Migraciones recomendadas (SQL Editor de Supabase)

```
supabase_migration_dispatches_attendance.sql
supabase_migration_performance_bonus.sql
supabase_migration_access_grants.sql
# + resto según módulos que use la empresa
```

Sin esas tablas, bandeja / asistencia / cumplimiento operan en **modo local** del navegador.

---

## Regenerar documentación Word / PPTX

```bash
node scripts/generar_docs_presentacion.mjs
node scripts/generar_plan_fidelizacion.mjs
node scripts/generar_faq_tecnologias.mjs
node scripts/generar_propuesta_perfil.mjs
```

---

## Despliegue

**Producción (desde el 27-09-2026):** servidor propio en el PC de la oficina
(Lenovo `DESKTOP-ROMOGM3`), con Supabase self-hosted en Docker. El contenedor
`incubapp` (`Dockerfile` + `nginx.conf`) sirve la app y reenvía `/auth`, `/rest`,
`/storage`, `/realtime` y `/functions` a Supabase, así que la app y su API salen
por el mismo dominio. Pasos de instalación: `servidor-local/ESTADO.md`.

Actualizar la app en el servidor (en `C:\IncubApp`, dentro de Ubuntu/WSL):

```bash
git pull && docker compose build incubapp && docker compose up -d incubapp
```

**Dominio propio: `https://incubapp.cdhmaker.com`** (Cloudflare Tunnel, gratis y sin abrir puertos)

1. Agregar `cdhmaker.com` a una cuenta de Cloudflare (plan Free) y cambiar sus
   nameservers en el registrador por los dos que indique Cloudflare. Antes de
   cambiarlos, revisar que Cloudflare haya copiado los registros actuales del dominio
   (sitio web y correo), para que no se caigan.
2. Cloudflare → Zero Trust → Networks → Tunnels → Create tunnel (Cloudflared),
   nombre `incubapp`. Copiar el token.
3. En el túnel, Public hostname: subdominio `incubapp`, dominio `cdhmaker.com`,
   Service `HTTP` → `incubapp:80`.
4. En el servidor, doble clic en `servidor-local/5-ACCESO-EXTERNO.bat`, pegar el token
   y Enter (la dirección por defecto ya es `https://incubapp.cdhmaker.com`).
5. Probar `https://incubapp.cdhmaker.com` y dar ese enlace al personal.

Mientras tanto la app sigue en la dirección de ngrok (`docker-compose.yml`).

Vercel (`deploy_incubapp.bat`) queda solo para la nube de Supabase: la compilación
usa `VITE_SUPABASE_URL` directo cuando es un `*.supabase.co`.

---

## Planta 3D — el «metaverso» de la planta

Recorrido virtual navegable en `public/planta3d/`, servido en **`/planta3d/`**.
Es HTML + three.js sin build: también se abre con doble clic en su `index.html`.
El acceso desde la app es exclusivo de **líderes de área y gerencia**
(`canSeePlant3DTour` en `src/lib/roles.js`).

Las pantallas de cada equipo muestran su última foto de ronda. Para ponerlas al
día con la ronda más reciente:

```
npm run planta3d:fotos
```

Necesita `.env.planta3d` (ver `.env.planta3d.example`).
