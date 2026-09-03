# CDH Maker — SaaS multi-empresa

**Propiedad del software:** 100 % **CDH Maker**  
**Primer cliente (piloto):** Antioqueña de Incubación SAS / Incubant  
**Fecha de reorientación:** julio 2026

## Modelo

| Capa | Quién | Qué ve |
|------|--------|--------|
| **Plataforma** | Admin SaaS (`profiles.platform_role = admin`) | Todas las empresas, diseño UI, datos operativos, “Ver como”, alta de orgs |
| **Tenant / cliente** | Usuarios con `organization_members` | Solo datos de **sus** orgs; roles de planta/gerencia **dentro** de su empresa |
| **White-label** | Org con marca conocida (p. ej. `brand_key=incubant`) | Logos, fondo, membrete y acentos del cliente **solo dentro de esa org** |
| **Fuera de cliente** | Login, splash, admin sin tenant | Identidad **CDH Maker** |

## Qué se conservó

- Organización Incubant y todo su contenido (plantas, máquinas, rondas, usuarios, etc.).
- Roles operativos ya planteados (gerencia, supervisor, líderes de área, operarios…).
- Cola offline, supervisión con foto, bandejas, cumplimiento, etc.

## Qué cambió

1. **Marca por defecto = CDH Maker** (auth, PWA, splash, pie de página).
2. **Incubant** solo como **cliente white-label** (detectado por slug/nombre o `brand_key`).
3. Roles de org: `owner` / `admin` = **gobierno de la empresa**, no “desarrollador del software”.
4. **Diseño UI / DevStudio / datos masivos** solo para admin de plataforma CDH Maker.
5. Rol org `developer` **no se asigna a clientes** (migración lo convierte a `admin`).
6. **Multi-membresía**: un usuario puede estar en varias empresas; el SaaS admin las asigna.
7. Selector de empresa cuando hay más de una membership.

## Seguridad multi-tenant

- El cliente **nunca** debe ver `org_id` ajenos (RLS en Supabase).
- El front solo consulta con el `orgId` activo de la membership.
- Al cambiar de empresa se recargan paneles (`cdh:org-switched`).
- Solo el admin SaaS puede listar todas las orgs (políticas `is_platform_admin`).

### Checklist antes de vender a un 2.º cliente

1. Ejecutar `supabase_migration_saas_cdh_maker.sql`.
2. Revisar RLS en tablas de negocio (`org_id` + membership).
3. Storage buckets con path prefijado por `org_id`.
4. No dar `platform_role=admin` a personal del cliente.
5. Probar con dos orgs y un usuario solo en la A: cero filas de la B.

## Cómo dar de alta un cliente nuevo

1. Admin CDH → **Empresas** → crear org (nombre, slug, NIT).
2. Aprobar usuario(s) y **asignar membership** con rol de empresa (p. ej. owner/admin/management).
3. Si necesita white-label propio: añadir entrada en `src/lib/platform.js` → `CLIENT_BRANDS` y opcionalmente `brand_key` en DB.
4. Configurar plantas/salas/máquinas dentro del tenant (no copiar datos de otro).

## Archivos clave

- `src/lib/platform.js` — dueño SaaS + catálogo white-label  
- `src/lib/corporateBrand.js` — membretes por tenant  
- `src/components/Brand.jsx` — logos CDH / cliente  
- `src/hooks/useOrganization.js` — multi-membresía + empresa activa  
- `src/lib/roles.js` — roles de empresa vs plataforma  
- `supabase_migration_saas_cdh_maker.sql` — limpieza developer + brand_key  
