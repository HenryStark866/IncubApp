/**
 * Plantilla de menú/módulos operativos del tenant cliente.
 * Lo construido para Incubant (Antioqueña) es la plantilla predeterminada
 * al crear cualquier empresa nueva en IncubApp (catálogo CDH Maker).
 *
 * NO incluye herramientas de plataforma CDH Maker (esas van en platformMenu.js).
 * Henry Stark · CEO CDH Maker
 */

/** ID de plantilla versionada */
export const DEFAULT_CLIENT_TEMPLATE_ID = 'incubant_ops_v1'

export const DEFAULT_CLIENT_TEMPLATE = {
  id: DEFAULT_CLIENT_TEMPLATE_ID,
  name: 'Operación incubación / granja',
  description:
    'Estructura base del producto: supervisión, OT, gerencia, comercial, granja, sanidad, IoT, misionales y administración de la empresa. Se aplica al crear un tenant y se actualiza cuando se adecua el producto.',
  sourceClient: 'Plantilla base IncubApp (CDH Maker)',
  version: 8,
  /**
   * Ítems del menú operativo del cliente (plantilla).
   * group = agrupación en el menú del tenant (no CDH Maker).
   */
  menu: [
    { id: 'hoy', label: 'Hoy', group: 'Inicio', always: true },
    {
      id: 'admin',
      label: 'Administración',
      group: 'Dirección',
      tab: 'admin',
      hint: 'Usuarios, plantas y granjas de la empresa',
    },
    { id: 'reportes', label: 'Reportes', group: 'Comunicación', always: true },
    { id: 'asistencia', label: 'Asistencia', group: 'Operación', always: true },
    { id: 'cumplimiento', label: 'Cumplimiento', group: 'Operación', always: true },
    {
      id: 'misionales',
      label: 'Desplazamientos misionales',
      group: 'Operación',
      tab: 'misionales',
      hint: 'Inspección pre-operacional de vehículos',
      always: true,
    },
    {
      id: 'informes',
      label: 'Informes gerencia',
      group: 'Dirección',
      tab: 'informes',
      hint: 'Datos verificados',
    },
    { id: 'panel', label: 'Panel de coordinación', group: 'Dirección', tab: 'panel' },
    { id: 'gerencia', label: 'Gerencia', group: 'Dirección', tab: 'gerencia' },
    {
      id: 'datos-op',
      label: 'Datos de producción',
      group: 'Dirección',
      tab: 'datos-op',
      hint: 'Lotes, cantidades, fechas y cargas actuales en incubadora',
    },
    { id: 'rrhh', label: 'Recursos humanos', group: 'Dirección', tab: 'rrhh' },
    { id: 'contabilidad', label: 'Contabilidad', group: 'Dirección', tab: 'contabilidad' },
    { id: 'ventas', label: 'Ventas', group: 'Comercial', tab: 'ventas' },
    { id: 'logistica', label: 'Logística', group: 'Comercial', tab: 'logistica' },
    {
      id: 'preoperacional',
      label: 'Preoperacional vehículos',
      group: 'Comercial',
      tab: 'preoperacional',
      hint: 'FOSST22 · conductores diligencian, líder de logística exporta',
    },
    {
      id: 'supervision',
      label: 'Supervisión',
      group: 'Operación',
      tab: 'supervision',
      hint: 'Rondas con foto, cargue, nacimiento',
    },
    {
      id: 'calibracion',
      label: 'Calibrar máquina',
      group: 'Operación',
      tab: 'calibracion',
      hint: '2 fotos: calibrador + pantalla · OT de calibración INC/nacedoras',
    },
    {
      id: 'historial',
      label: 'Mi historial',
      group: 'Operación',
      tab: 'historial',
      hint: 'Actividades realizadas y comparativos entre períodos',
    },
    { id: 'mantenimiento', label: 'Órdenes de trabajo', group: 'Operación', tab: 'mantenimiento' },
    { id: 'horarios', label: 'Horarios de turno', group: 'Operación', tab: 'horarios' },
    { id: 'monitoreo', label: 'Monitoreo', group: 'Operación', tab: 'monitoreo' },
    { id: 'produccion', label: 'Producción', group: 'Operación', tab: 'produccion' },
    { id: 'huevos', label: 'Reportes de huevo', group: 'Operación', tab: 'huevos' },
    { id: 'clasificacion', label: 'Clasificación', group: 'Recepción y Planta', tab: 'clasificacion', hint: 'Ovoscopia, bandejas y descarte' },
    { id: 'recepcion', label: 'Recepción / cuarto frío', group: 'Recepción y Planta', tab: 'recepcion', hint: 'Llegadas a planta y certificación' },
    { id: 'liquidar-cargues', label: 'Liquidar cargues', group: 'Recepción y Planta', tab: 'liquidar-cargues', hint: 'Liquidación y balance de cargues' },
    { id: 'auditoria-huevos', label: 'Auditoría de huevos', group: 'Control de Calidad', tab: 'auditoria-huevos', hint: 'Control de calidad, fisuras y muestras' },
    { id: 'autorizar-datos', label: 'Autorizar datos', group: 'Control de Calidad', tab: 'autorizar-datos', hint: 'Aprobación y validación de lotes' },
    { id: 'solicitudes', label: 'Solicitudes', group: 'Mi Turno', tab: 'solicitudes', hint: 'Permisos, insumos y novedades' },
    { id: 'reportes-informes', label: 'Reportes e informes', group: 'Informes', tab: 'reportes-informes', hint: 'Consolidados y balances' },
    { id: 'informacion', label: 'Información', group: 'Ayuda y Guías', tab: 'informacion', hint: 'Guías, bioseguridad y manuales' },
    {
      id: 'cargue',
      label: 'Cargue',
      group: 'Operación',
      tab: 'cargue',
      hint: 'Clasificación, mapa Petersime y órdenes de cargue',
      // Habilitado para todos los perfiles de la empresa (pedido 2026-07-12)
      always: true,
    },
    { id: 'plantas', label: 'Plantas y planos', group: 'Instalaciones', tab: 'plantas' },
    { id: 'granjas', label: 'Granjas', group: 'Instalaciones', tab: 'granjas' },
    { id: 'inventarios', label: 'Inventarios', group: 'Recursos', tab: 'inventarios' },
    { id: 'veterinaria', label: 'Sanidad veterinaria', group: 'Sanidad', tab: 'veterinaria' },
    { id: 'sst', label: 'SST', group: 'Cumplimiento', tab: 'sst' },
    { id: 'ambiental', label: 'Gestión ambiental', group: 'Cumplimiento', tab: 'ambiental' },
    { id: 'iot', label: 'IoT y bioseguridad', group: 'Cumplimiento', tab: 'iot' },
    { id: 'perfil', label: 'Perfil', group: null, always: true },
  ],
  /** Módulos de dominio habilitados por defecto (privacy / grants) */
  enabledDomains: [
    'gerencia',
    'plant',
    'farm',
    'maintenance',
    'sales',
    'logistics',
    'rrhh',
    'contabilidad',
    'sst',
    'ambiental',
    'veterinary',
    'inventories',
    'iot',
  ],
  /** Roles sugeridos al onboarding (no se crean usuarios) */
  suggestedRoles: [
    'owner',
    'admin',
    'management',
    'supervisor',
    'coordinator',
    'operator',
    'auxiliary',
  ],
}

/**
 * Construye ítems de menú del cliente filtrando por permiso can(tab).
 * @param {{ can: (id: string) => boolean, role?: string, template?: typeof DEFAULT_CLIENT_TEMPLATE }} opts
 */
const SHIFT_WORKER_ROLES = [
  'operator',
  'auxiliary',
  'auxiliary_production',
  'reception_operator',
  'barn_operator',
]

/** Etiqueta del ítem según el rol (el operario habla de «sus» tareas, no de supervisión) */
function navLabelFor(item, role) {
  const isShiftWorker = SHIFT_WORKER_ROLES.includes(role)
  if (item.id === 'supervision' && role === 'operator') return 'Ronda y registros'
  if (item.id === 'supervision' && isShiftWorker) return 'Mis actividades'
  if (item.id === 'cargue' && isShiftWorker) return 'Órdenes de cargue'
  if (item.id === 'hoy' && isShiftWorker) return 'Mi turno'
  if (role === 'reception_operator') {
    if (item.id === 'horarios') return 'Mi horario'
    if (item.id === 'recepcion') return 'Recepción'
    if (item.id === 'reportes-informes' || item.id === 'reportes') return 'Reportes e informes'
  }
  // Líder de área: su home «Hoy» es el tablero combinado con monitoreo y widgets
  if (item.id === 'hoy' && role === 'coordinator') return 'Panel principal del líder'
  return item.label
}

export function buildClientNavItems({ can, role, template = DEFAULT_CLIENT_TEMPLATE }) {
  const items = []
  for (const m of template.menu) {
    if (m.id === 'perfil') continue // se agrega al final en App
    const label = navLabelFor(m, role)
    const tab = m.tab || m.id
    // `always` cubre las pestañas comunes a toda la org (Hoy, Perfil, Accesos…),
    // pero igual se valida el permiso: un rol sin acceso no debe verla en el menú.
    if (m.always && (can(tab) || can(m.id))) {
      items.push({ id: m.id, label, group: m.group, hint: m.hint })
      continue
    }
    if (m.always) continue
    if (!can(tab) && !can(m.id)) continue
    items.push({
      id: m.id,
      label,
      group: m.group || 'Operación',
      hint: m.hint,
    })
  }
  return items
}

/** Payload a guardar en organizations.settings al crear empresa */
export function templateSettingsPayload(template = DEFAULT_CLIENT_TEMPLATE) {
  return {
    menu_template_id: template.id,
    menu_template_name: template.name,
    menu_template_version: template.version,
    enabled_domains: [...template.enabledDomains],
    enabled_menu_ids: template.menu.map((m) => m.id),
    applied_at: new Date().toISOString(),
    source: 'platform_default_template',
  }
}

export function listClientTemplates() {
  return [DEFAULT_CLIENT_TEMPLATE]
}

/** Payload JSON para RPC platform_upsert_default_template */
export function defaultTemplateRpcPayload(template = DEFAULT_CLIENT_TEMPLATE) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    version: template.version,
    menu: template.menu,
    enabled_domains: template.enabledDomains,
    suggested_roles: template.suggestedRoles,
    source_note: 'Sincronizado desde consola plataforma IncubApp',
  }
}
