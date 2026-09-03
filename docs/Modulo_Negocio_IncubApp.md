# Módulo de negocio — IncubApp

**Producto:** IncubApp  
**Operador:** CDH Maker  
**CEO / co-fundador:** Henry Stark  
**Versión del modelo:** 1.0.0  

## Propósito

Estructurar **cómo se administra y garantiza el servicio SaaS**, antes de seguir expandiendo módulos del cliente.  
No sustituye el menú operativo de Incubant: lo **contiene** como plantilla de tenant.

## Tres capas (obligatorio no mezclar)

| Capa | Dueño | Contenido |
|------|--------|-----------|
| Plataforma | CDH Maker | Consola, roles staff, plantillas, seguridad, soporte, desarrollo |
| Tenant | Cliente | Datos y menú de planta/granja (plantilla `incubant_ops_v1`) |
| Usuario final | Roles del tenant | Gerencia, líderes, operarios… solo su empresa |

## Roles de plataforma (prestación del servicio)

1. **Propietario SaaS / CEO** — administración total  
2. **Operaciones de servicio** — onboarding y go-live  
3. **Customer success** — adopción y expansión  
4. **Soporte técnico** — incidencias y diagnóstico  
5. **Desarrollo de producto** — Studio, calidad, multi-tenant  

*Implementación actual:* acceso staff = `profiles.platform_role = admin`.  
El modelo de roles es la **matriz de responsabilidades**; se puede especializar más adelante.

## Herramientas de la consola

| Herramienta | Tab |
|-------------|-----|
| Módulo de negocio | `platform-business` |
| Inicio plataforma | `platform-home` |
| Empresas y usuarios | `admin` |
| Plantillas | `platform-templates` |
| Producto e identidad | `platform-product` |
| Studio UI | `diseno` |
| Dev tools | `platform-dev` |
| Datos del tenant | `datos` (con compañía elegida) |

## Garantías (pilares)

- Aislamiento multi-tenant  
- Identidad y acceso  
- Alta controlada (plantilla Incubant)  
- Continuidad offline  
- Evidencia y auditoría  
- Soporte y escalamiento (S1–S4)  

## Ciclo del cliente

Prospecto → Contratado → Aprovisionamiento → Go-live → Operación asistida → Expansión → (Suspendido)

## Checklist go-live

Definido en `src/lib/businessModule.js` → `GO_LIVE_CHECKLIST`  
UI: Módulo de negocio → pestaña **Checklist go-live**.

## Código

- `src/lib/businessModule.js` — modelo  
- `src/components/BusinessModule.jsx` — UI  
- `src/lib/platformMenu.js` — menú de servicio  
- `src/lib/clientMenuTemplate.js` — plantilla de tenant (Incubant)  
