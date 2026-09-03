# Identidad de marca — IncubApp

**Producto comercial (catálogo CDH Maker):** IncubApp  
**Propietario y desarrollo del SaaS:** CDH Maker  
**CEO y co-fundador:** Henry Stark  
**Primer cliente (tenant):** Antioqueña de Incubación SAS / Incubant  

---

## Modelo de propiedad

| Qué | Quién |
|-----|--------|
| Código, plataforma, consola admin, roles de desarrollador | **CDH Maker** (Henry Stark) |
| Marca comercial del producto | **IncubApp** (futurista / IA) |
| Datos y logos de la empresa cliente | **Solo dentro del tenant** (ej. Incubant) |

Los favicons/logos de clientes viven en `public/client-brands/`.  
Los del producto/plataforma en `public/brand/` (nunca se mezclan en la consola staff).

---

## Slogan

> **Infraestructura operativa con inteligencia. Multi-empresa. Tiempo real.**

**Tagline:** SaaS de operación industrial · IA y desarrollo avanzado.

## Consola de plataforma

- Login propio: **Admin plataforma** (sitio público) → UI inmersiva 3D.
- Tras entrar con `platform_role=admin`: barra **Elegir compañía**.
- Al seleccionar un tenant → **modo desarrollador general** (todos los módulos + Studio UI + datos).
- “Ver como” sigue disponible para simular roles de **cliente** (QA).

---

## Misión

Digitalizar la operación diaria de plantas de incubación y granjas con un SaaS multi-empresa confiable: evidencia fotográfica, roles claros, datos medibles y continuidad offline, para que cada turno se pueda auditar y mejorar.

## Visión

Ser la plataforma de referencia en Latinoamérica para la gestión operativa avícola: donde cada empresa cliente ve solo su mundo, y gerencia decide con datos verificados — no con rumores de pasillo.

## Valores

1. **Evidencia primero** — foto, hora, usuario y máquina.  
2. **Hermeticidad** — multi-tenant estricto, sin fugas entre clientes.  
3. **Operación real** — móvil de planta, no solo oficina.  
4. **Mejora continua** — cumplimiento y metas medibles.  
5. **Socio tecnológico** — CDH Maker opera; el cliente produce.

---

## Acerca de nosotros

IncubApp es el **nombre comercial** del software de operación para incubación y granja. El servicio es **propiedad y administración de CDH Maker** (infraestructura, seguridad, actualizaciones y soporte). Cada organización cliente opera en su propio tenant; puede conservar su identidad visual interna (como Incubant) solo dentro de su empresa.

---

## A quién vendemos

| Segmento | Entrada típica |
|----------|----------------|
| Plantas de incubación | Demo + piloto 30–90 días |
| Integrados / granjas ligadas | Módulos granja + planta |
| Grupos multi-sede | Licencia multi-empresa |
| Gerencia / dueños | Cockpit + exportes |

## Canales

- Venta consultiva directa (CDH Maker)  
- Referidos del piloto y red avícola  
- Alianzas con proveedores del sector  
- Landing IncubApp + propuesta PDF/PPT  
- Expansión módulo a módulo  

## Empaques

- **Starter** — rondas, OT, asistencia, offline  
- **Ops** — + nacimiento/cargue, inventarios, sensores, reportes  
- **Enterprise** — multi-sede, white-label, SLA, onboarding  

---

## Activos de marca (repo)

| Archivo | Uso |
|---------|-----|
| `public/brand/incubapp-mark.svg` | Ícono / favicon-style |
| `public/brand/incubapp-logo.svg` | Logo + wordmark |
| `public/brand/incubapp-wordmark.svg` | Solo texto |
| `public/brand/incubapp-og.svg` | Open Graph / portada |
| `src/lib/brandIdentity.js` | Textos de marca |
| Landing en app (sin sesión) | Sitio + Entrar |

## Membretes

Exportes Excel/Word/PDF usan `corporateBrand.js` → línea producto **IncubApp** y pie **operado por CDH Maker**; dentro del tenant Incubant, membrete del cliente.

## Fix técnico relacionado

Si al asignar área **Logística** aparece  
`invalid input value for enum work_area: "logistics"`  
ejecutar en Supabase:

`supabase_migration_work_area_logistics.sql`
