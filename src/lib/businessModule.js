/**
 * =============================================================================
 * MÓDULO DE NEGOCIO — IncubApp (producto SaaS de CDH Maker)
 * =============================================================================
 * Estructura de administración del SERVICIO (no operación de planta del cliente).
 * Define roles de plataforma, herramientas, ciclo de vida del cliente y
 * garantías para prestar el SaaS con la mayor seguridad y predictibilidad.
 *
 * Henry Stark · CEO y co-fundador de CDH Maker
 * =============================================================================
 */

import { BRAND } from './brandIdentity'
import { DEFAULT_CLIENT_TEMPLATE } from './clientMenuTemplate'

/** Versión del modelo de negocio de plataforma */
export const BUSINESS_MODEL_VERSION = '1.0.0'

/** Capas del sistema (para no mezclar responsabilidades) */
export const SYSTEM_LAYERS = [
  {
    id: 'platform',
    name: 'Plataforma IncubApp',
    owner: 'CDH Maker',
    description:
      'Producto SaaS, consola, multi-tenant, seguridad, plantillas, desarrollo y soporte del servicio.',
  },
  {
    id: 'tenant',
    name: 'Empresa cliente (tenant)',
    owner: 'Cliente (ej. Incubant)',
    description:
      'Datos, usuarios y menú operativo de planta/granja. Aislados por org_id. Plantilla por defecto incubant_ops_v1.',
  },
  {
    id: 'end_user',
    name: 'Usuario final del cliente',
    owner: 'Roles del tenant',
    description:
      'Gerencia, líderes, supervisores, operarios… solo ven su empresa y módulos permitidos.',
  },
]

/**
 * Roles del equipo que PRESTA el servicio IncubApp (staff CDH Maker).
 * Distintos de organization_members.role (roles DENTRO del cliente).
 */
export const PLATFORM_STAFF_ROLES = [
  {
    id: 'platform_owner',
    label: 'Propietario SaaS / CEO',
    person: 'Equipo de plataforma',
    platform_role: 'admin',
    powers: [
      'Administración total del SaaS',
      'Alta/baja de empresas y platform admins',
      'Definición de plantillas y empaques',
      'Acceso desarrollador a cualquier tenant',
    ],
    tools: ['platform-business', 'admin', 'platform-templates', 'platform-product', 'diseno', 'datos'],
  },
  {
    id: 'platform_ops',
    label: 'Operaciones de servicio',
    platform_role: 'admin',
    powers: [
      'Onboarding de clientes',
      'Salud de tenants y checklist de go-live',
      'Aplicar plantillas y configurar módulos',
      'Supervisar cumplimiento de SLA interno',
    ],
    tools: ['platform-business', 'admin', 'platform-templates', 'platform-dev'],
  },
  {
    id: 'platform_success',
    label: 'Customer success',
    platform_role: 'admin',
    powers: [
      'Acompañamiento post-venta',
      'Capacitación por rol del cliente',
      'Seguimiento de adopción (rondas, asistencia, cumplimiento)',
      'Escalamiento de incidencias de producto',
    ],
    tools: ['platform-business', 'admin', 'platform-product'],
  },
  {
    id: 'platform_support',
    label: 'Soporte técnico a clientes',
    platform_role: 'admin',
    powers: [
      'Diagnóstico de incidencias',
      'Revisión de cola offline y permisos',
      'Entrada controlada a tenant en modo desarrollador',
      'Registro de causas raíz',
    ],
    tools: ['platform-business', 'admin', 'platform-dev', 'datos'],
  },
  {
    id: 'platform_dev',
    label: 'Desarrollo de producto',
    platform_role: 'admin',
    powers: [
      'Studio UI y módulos',
      'Evolución del código y migraciones',
      'Calidad, seguridad multi-tenant',
      'Herramientas de diagnóstico',
    ],
    tools: ['diseno', 'platform-dev', 'platform-templates', 'datos'],
  },
]

/**
 * Pilares del servicio: con qué se garantiza la prestación.
 */
export const SERVICE_PILLARS = [
  {
    id: 'isolation',
    title: 'Aislamiento multi-tenant',
    guarantee:
      'Ningún usuario de un cliente ve datos de otro. Solo membership o admin SaaS con traza.',
    controls: [
      'RLS por org_id en Supabase',
      'Selector de compañía solo para staff',
      'Caché y cola offline prefijadas por org',
      'Assets de cliente separados de /brand/',
    ],
  },
  {
    id: 'identity',
    title: 'Identidad y acceso',
    guarantee: 'Nadie opera sin aprobación y rol; staff y cliente no se confunden.',
    controls: [
      'Auth Supabase + is_approved',
      'platform_role=admin solo equipo CDH Maker',
      'Roles de tenant (owner/admin/management/…)',
      'Login de plataforma vs login de cliente',
    ],
  },
  {
    id: 'onboarding',
    title: 'Alta controlada de clientes',
    guarantee: 'Toda empresa nueva nace con plantilla operativa probada (Incubant).',
    controls: [
      `Plantilla ${DEFAULT_CLIENT_TEMPLATE.id}`,
      'settings.menu_template_* en organizations',
      'Checklist go-live antes de uso masivo',
      'Asignación de owner/admin del cliente',
    ],
  },
  {
    id: 'continuity',
    title: 'Continuidad operativa',
    guarantee: 'El turno no se detiene por red intermitente.',
    controls: [
      'Cola offline IndexedDB (fotos y mutaciones)',
      'Sincronización automática + forzar subida',
      'PWA / shell offline',
      'Banner de pendientes visible',
    ],
  },
  {
    id: 'evidence',
    title: 'Evidencia y auditoría',
    guarantee: 'Lo crítico queda con foto, hora, usuario y exportable.',
    controls: [
      'Rondas con foto + Storage',
      'Asistencia con selfie y marca de agua',
      'Exportes Excel/Word/PDF con membrete',
      'Historial de checks y OT',
    ],
  },
  {
    id: 'support',
    title: 'Soporte y escalamiento',
    guarantee: 'Incidencias con dueño, severidad y camino de resolución.',
    controls: [
      'Roles platform_support / platform_ops',
      'Modo desarrollador en tenant (sin mezclar marca)',
      'Datos del tenant (staff)',
      'Playbooks de severidad (ver abajo)',
    ],
  },
]

/**
 * Herramientas del negocio SaaS → pestaña de la consola.
 */
export const BUSINESS_TOOLS = [
  {
    id: 'business_model',
    label: 'Modelo de negocio y garantías',
    tab: 'platform-business',
    group: 'Administración del servicio',
    description: 'Capas, roles staff, pilares, ciclo de vida y checklist de calidad.',
  },
  {
    id: 'tenants_users',
    label: 'Empresas y usuarios',
    tab: 'admin',
    group: 'Administración del servicio',
    description: 'Tenants, aprobaciones, membresías multi-empresa, plantas base.',
  },
  {
    id: 'templates',
    label: 'Plantillas de empresa',
    tab: 'platform-templates',
    group: 'Administración del servicio',
    description: 'Menú y módulos por defecto al crear un cliente (incubant_ops_v1).',
  },
  {
    id: 'product_brand',
    label: 'Producto e identidad',
    tab: 'platform-product',
    group: 'Administración del servicio',
    description: 'Marca IncubApp, misión, visión, empaques y GTM.',
  },
  {
    id: 'studio',
    label: 'Studio UI / módulos',
    tab: 'diseno',
    group: 'Ingeniería del servicio',
    description: 'Evolución de interfaz y módulos personalizados del producto.',
  },
  {
    id: 'devtools',
    label: 'Herramientas de desarrollo',
    tab: 'platform-dev',
    group: 'Ingeniería del servicio',
    description: 'Cola offline, diagnóstico, estado del tenant en modo dev.',
  },
  {
    id: 'tenant_data',
    label: 'Datos del tenant',
    tab: 'datos',
    group: 'Ingeniería del servicio',
    description: 'Corrección de datos del cliente activo (solo staff + tenant elegido).',
    requiresTenant: true,
  },
  {
    id: 'enter_tenant',
    label: 'Entrar a empresa (modo desarrollador)',
    tab: null,
    group: 'Prestación del servicio',
    description:
      'Barra «Elegir compañía»: opera el menú del cliente con potestad de desarrollo general.',
    action: 'company_picker',
  },
]

/** Estados del ciclo de vida de un cliente (servicio) */
export const CLIENT_LIFECYCLE = [
  {
    id: 'prospect',
    label: 'Prospecto',
    description: 'Interés comercial; aún no hay tenant en producción.',
    staffOwner: 'platform_success',
  },
  {
    id: 'contracted',
    label: 'Contratado',
    description: 'Acuerdo de servicio; se crea la empresa en el SaaS.',
    staffOwner: 'platform_ops',
  },
  {
    id: 'provisioning',
    label: 'Aprovisionamiento',
    description: 'Plantilla, owner del cliente, plantas/salas mínimas, usuarios clave.',
    staffOwner: 'platform_ops',
  },
  {
    id: 'go_live',
    label: 'Go-live',
    description: 'Checklist de garantía superado; uso real en turno.',
    staffOwner: 'platform_ops',
  },
  {
    id: 'run',
    label: 'Operación asistida',
    description: 'Uso cotidiano; success y soporte activos; métricas de adopción.',
    staffOwner: 'platform_success',
  },
  {
    id: 'expand',
    label: 'Expansión',
    description: 'Más sedes, módulos o empaque superior (Ops / Enterprise).',
    staffOwner: 'platform_success',
  },
  {
    id: 'suspended',
    label: 'Suspendido',
    description: 'Acceso restringido por contrato o seguridad; datos retenidos.',
    staffOwner: 'platform_owner',
  },
]

/** Checklist de garantía antes de declarar go-live */
export const GO_LIVE_CHECKLIST = [
  { id: 'org_created', label: 'Empresa creada con slug único y plantilla incubant_ops_v1' },
  { id: 'owner_assigned', label: 'Al menos un owner/admin del cliente aprobado y con membership' },
  { id: 'roles_mapped', label: 'Roles clave mapeados (gerencia, supervisor, líderes, operarios)' },
  { id: 'plant_skeleton', label: 'Planta/salas/máquinas mínimas o plan de carga de maestro' },
  { id: 'isolation_tested', label: 'Prueba: usuario del cliente no ve otras orgs' },
  { id: 'photo_pipeline', label: 'Prueba: ronda con foto online y offline → sync' },
  { id: 'attendance', label: 'Prueba: asistencia con selfie (si aplica al empaque)' },
  { id: 'exports', label: 'Prueba: export Excel/PDF con membrete correcto del tenant' },
  { id: 'support_channel', label: 'Canal de soporte y contacto CDH Maker comunicados' },
  { id: 'backup_rls', label: 'RLS/Storage revisados para el proyecto Supabase' },
]

/** Severidades de soporte (prestación del servicio) */
export const SUPPORT_SEVERITIES = [
  {
    id: 'S1',
    label: 'Crítica',
    sla: 'Respuesta en menos de 2 h laborables',
    examples: 'Caída total login, pérdida de datos cross-tenant, storage caído en planta',
  },
  {
    id: 'S2',
    label: 'Alta',
    sla: 'Respuesta en menos de 8 h laborables',
    examples: 'Rondas no sincronizan, roles rotos, planta sin poder cerrar turno',
  },
  {
    id: 'S3',
    label: 'Media',
    sla: 'Respuesta en menos de 2 días laborables',
    examples: 'UI confusa, reportes incompletos, permisos de un módulo',
  },
  {
    id: 'S4',
    label: 'Baja',
    sla: 'Backlog de producto',
    examples: 'Mejoras, textos, nuevas plantillas de módulo',
  },
]

/** Empaques comerciales ↔ alcance de servicio */
export const SERVICE_PACKAGES = [
  {
    id: 'starter',
    name: 'IncubApp Starter',
    includes: ['Usuarios y roles', 'Rondas con foto', 'OT básicas', 'Asistencia', 'Offline'],
    guaranteeFocus: ['isolation', 'identity', 'continuity', 'evidence'],
  },
  {
    id: 'ops',
    name: 'IncubApp Ops',
    includes: ['Starter', 'Nacimiento/cargue', 'Inventarios', 'Sensores/IoT', 'Reportes'],
    guaranteeFocus: ['isolation', 'identity', 'onboarding', 'continuity', 'evidence', 'support'],
  },
  {
    id: 'enterprise',
    name: 'IncubApp Enterprise',
    includes: ['Ops', 'Multi-sede', 'White-label cliente', 'SLA reforzado', 'Onboarding dedicado'],
    guaranteeFocus: ['isolation', 'identity', 'onboarding', 'continuity', 'evidence', 'support'],
  },
]

/** Resumen ejecutivo para UI */
export function businessModuleSummary() {
  return {
    product: BRAND.productName,
    slogan: BRAND.slogan,
    version: BUSINESS_MODEL_VERSION,
    defaultTemplate: DEFAULT_CLIENT_TEMPLATE.id,
    staffRoles: PLATFORM_STAFF_ROLES.length,
    pillars: SERVICE_PILLARS.length,
    tools: BUSINESS_TOOLS.length,
    lifecycleSteps: CLIENT_LIFECYCLE.length,
    goLiveItems: GO_LIVE_CHECKLIST.length,
  }
}
