/**
 * =============================================================================
 * ARCHIVO: src/lib/roles.js
 * PROPÓSITO: Catálogo de roles, áreas de trabajo y módulos de negocio de la organización.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Catálogo único de roles, áreas y módulos de negocio de IncubApp.
 * Usado por Admin, App (pestañas) y paneles departamentales.
 *
 * Regla: cada coordinador de área tiene uno o varios auxiliares.
 * SST y Gestión ambiental son áreas distintas.
 * Granja / planta veterinaria: vacunas, medicina, fertilidad, wet tunnels.
 */

/**
 * Etiquetas cortas para pills y chat.
 * IMPORTANTE: roles de EMPRESA CLIENTE ≠ admin de plataforma SaaS (CDH Maker).
 * - owner / admin → gobierno de la empresa cliente (no desarrollo del software).
 * - developer / platform_role=admin → solo personal CDH Maker (plataforma).
 */
export const ROLE_LABEL = {
  owner: 'Propietario de empresa',
  admin: 'Administrador de empresa',
  /** Solo staff CDH Maker / modo desarrollador de plataforma */
  developer: 'Desarrollador de plataforma (CDH Maker)',
  platform_admin: 'Administrador SaaS (CDH Maker)',

  // Gerencia
  management: 'Gerencia',
  management_auxiliary: 'Auxiliar de gerencia',

  // Líderes de área (antes “coordinador”; área en organization_members.area)
  coordinator: 'Líder de área',
  supervisor: 'Supervisor',

  // Auxiliares de módulos corporativos
  hr_auxiliary: 'Auxiliar de RR. HH.',
  accounting_auxiliary: 'Auxiliar de contabilidad',
  sales_logistics_auxiliary: 'Auxiliar de ventas',
  logistics_auxiliary: 'Auxiliar de logística (despacho)',
  driver: 'Conductor',
  sst_auxiliary: 'Auxiliar de SST',
  environmental_auxiliary: 'Auxiliar de gestión ambiental',
  /** @deprecated use sst_auxiliary — se mantiene por datos históricos */
  hse_auxiliary: 'Auxiliar de SST',
  maintenance_auxiliary: 'Auxiliar de mantenimiento',

  // Sanidad / veterinaria
  vaccination_auxiliary: 'Auxiliar de vacunación',
  plant_veterinarian: 'Médico veterinario (planta)',

  // Comercial
  customer: 'Cliente',

  // Operación planta / granja
  operator: 'Operario de turno',
  auxiliary: 'Auxiliar de turno',
  auxiliary_production: 'Auxiliar de producción',
  barn_operator: 'Operario galponero',
  reception_operator: 'Operario de recepción',
  viewer: 'Observador',
}

/**
 * Roles asignables en la empresa (selector del admin).
 * Agrupados para legibilidad en la UI.
 */
/**
 * Roles asignables en empresas CLIENTES.
 * No incluye herramientas de desarrollo del SaaS (eso es platform_role / CDH Maker).
 */
/** Export «ORG_ROLES»: API pública de este módulo. Henry Stark Desarrollador */
export const ORG_ROLES = [
  { value: 'owner', label: 'Propietario de empresa', group: 'Dirección empresa' },
  { value: 'admin', label: 'Administrador de empresa', group: 'Dirección empresa' },
  { value: 'management', label: 'Gerencia', group: 'Gerencia' },
  { value: 'management_auxiliary', label: 'Auxiliar de gerencia', group: 'Gerencia' },

  {
    value: 'coordinator',
    label: 'Líder de área (elige área abajo; define módulo y herramientas)',
    group: 'Liderazgo de área',
  },
  { value: 'supervisor', label: 'Supervisor de planta', group: 'Operaciones' },

  { value: 'hr_auxiliary', label: 'Auxiliar de RR. HH.', group: 'Recursos humanos' },
  { value: 'accounting_auxiliary', label: 'Auxiliar de contabilidad', group: 'Contabilidad' },
  {
    value: 'sales_logistics_auxiliary',
    label: 'Auxiliar de ventas (confirmación y Excel contable)',
    group: 'Ventas y logística',
  },
  {
    value: 'logistics_auxiliary',
    label: 'Auxiliar de logística (remisiones y despacho)',
    group: 'Ventas y logística',
  },
  {
    value: 'driver',
    label: 'Conductor (preoperacional FOSST22 y rutas)',
    group: 'Ventas y logística',
  },
  { value: 'customer', label: 'Cliente (portal de pedidos)', group: 'Ventas y logística' },

  { value: 'sst_auxiliary', label: 'Auxiliar de SST (seguridad y salud)', group: 'SST' },
  {
    value: 'environmental_auxiliary',
    label: 'Auxiliar de gestión ambiental',
    group: 'Gestión ambiental',
  },
  { value: 'maintenance_auxiliary', label: 'Auxiliar de mantenimiento', group: 'Mantenimiento' },

  {
    value: 'plant_veterinarian',
    label: 'Médico veterinario de planta',
    group: 'Sanidad veterinaria',
  },
  {
    value: 'vaccination_auxiliary',
    label: 'Auxiliar de vacunación',
    group: 'Sanidad veterinaria',
  },

  { value: 'operator', label: 'Operario de turno', group: 'Operaciones' },
  { value: 'auxiliary', label: 'Auxiliar de turno', group: 'Operaciones' },
  { value: 'auxiliary_production', label: 'Auxiliar de producción', group: 'Operaciones' },
  { value: 'barn_operator', label: 'Operario galponero', group: 'Granja' },
  { value: 'reception_operator', label: 'Operario de recepción', group: 'Planta' },

  { value: 'viewer', label: 'Observador', group: 'Otros' },
]

/**
 * Roles de organización reservados al equipo CDH Maker (no clientes).
 * El admin de plataforma no debe asignarlos a usuarios de empresas cliente.
 */
export const PLATFORM_STAFF_ORG_ROLES = [
  {
    value: 'developer',
    label: 'Desarrollador de plataforma (solo CDH Maker)',
    group: 'CDH Maker · plataforma',
  },
]

/** Roles que un admin SaaS puede poner en un cliente (sin desarrollo) */
export function clientOrgRoles() {
  return ORG_ROLES
}

/** Roles completos solo en vistas de plataforma */
export function allOrgRolesIncludingPlatformStaff() {
  return [...ORG_ROLES, ...PLATFORM_STAFF_ORG_ROLES]
}

/**
 * Área del coordinador (organization_members.area).
 * Cada área tiene al menos un auxiliar típico (ver COORD_AUXILIARIES).
 */
/** Export «WORK_AREAS»: API pública de este módulo. Henry Stark Desarrollador */
export const WORK_AREAS = [
  { value: 'general', label: 'General', moduleId: null },
  { value: 'management', label: 'Gerencia', moduleId: 'gerencia' },
  { value: 'hr', label: 'Recursos humanos', moduleId: 'rrhh' },
  { value: 'accounting', label: 'Contabilidad', moduleId: 'contabilidad' },
  { value: 'sales', label: 'Ventas', moduleId: 'ventas' },
  { value: 'logistics', label: 'Logística', moduleId: 'logistica' },
  /** legacy: unificado — sigue dando acceso a ambos módulos hasta reasignar */
  { value: 'sales_logistics', label: 'Ventas y logística (legacy)', moduleId: 'ventas' },
  { value: 'maintenance', label: 'Mantenimiento', moduleId: 'coord_mantenimiento' },
  { value: 'sst', label: 'SST (seguridad y salud en el trabajo)', moduleId: 'sst' },
  {
    value: 'environmental',
    label: 'Gestión ambiental',
    moduleId: 'ambiental',
  },
  /** legacy: mapas antiguos hse → se tratan como SST */
  { value: 'hse', label: 'SST (legacy)', moduleId: 'sst' },
  { value: 'plant', label: 'Planta (incubación)', moduleId: null },
  {
    value: 'farm',
    label: 'Granja (líder de área veterinario)',
    moduleId: 'veterinaria',
  },
  { value: 'veterinary', label: 'Sanidad veterinaria planta', moduleId: 'veterinaria' },
  { value: 'quality', label: 'Calidad / producción', moduleId: null },
]

/** Valores canónicos de área (coinciden con UI y DB tras migration work_area) */
export const WORK_AREA_VALUES = WORK_AREAS.map((a) => a.value)

/**
 * Normaliza área antes de escribir en Supabase.
 * Acepta logistics, sales, sst… (ya no se fuerza sales_logistics).
 */
export function normalizeWorkArea(area) {
  if (area == null || area === '') return null
  const v = String(area).trim().toLowerCase()
  if (WORK_AREA_VALUES.includes(v)) return v
  // alias frecuentes
  if (v === 'logistica' || v === 'logística') return 'logistics'
  if (v === 'ventas') return 'sales'
  if (v === 'planta') return 'plant'
  if (v === 'granja') return 'farm'
  return 'general'
}

/**
 * Auxiliares (y roles de apoyo) asociados a cada área de coordinación.
 * Un coordinador puede tener uno o varios auxiliares.
 */
/** Export «COORD_AUXILIARIES»: API pública de este módulo. Henry Stark Desarrollador */
export const COORD_AUXILIARIES = {
  management: ['management_auxiliary'],
  hr: ['hr_auxiliary'],
  accounting: ['accounting_auxiliary'],
  sales: ['sales_logistics_auxiliary'],
  logistics: ['logistics_auxiliary', 'driver'],
  sales_logistics: ['sales_logistics_auxiliary', 'logistics_auxiliary', 'driver'], // legacy
  maintenance: ['maintenance_auxiliary'],
  sst: ['sst_auxiliary'],
  environmental: ['environmental_auxiliary'],
  hse: ['sst_auxiliary'], // legacy
  plant: ['reception_operator', 'vaccination_auxiliary', 'plant_veterinarian'],
  farm: ['barn_operator', 'vaccination_auxiliary'],
  veterinary: ['vaccination_auxiliary', 'plant_veterinarian'],
  quality: ['auxiliary_production'],
  general: ['auxiliary'],
}

/**
 * Módulos principales de negocio (pestañas + paneles).
 * El control de acceso real vive en src/lib/privacyScopes.js (perfiles
 * herméticos: `can(tab)` en App.jsx). Estas entradas solo aportan el
 * contenido de cada panel (tagline, features, accesos rápidos) — ya NO
 * llevan `roles`/`coordinatorAreas` propios: esa lista quedó desactualizada
 * cuando el modelo pasó a herméticos (owner/admin ya no ven todo) y nadie
 * la leía — canAccessDepartment()/departmentsFor() (removidas) eran una
 * segunda puerta de acceso que nunca se llamaba y contradecía a la real.
 */
export const DEPARTMENT_MODULES = [
  {
    id: 'gerencia',
    tab: 'gerencia',
    label: 'Gerencia',
    icon: null,
    tagline: 'Dirección estratégica y tablero ejecutivo',
    features: [
      'Indicadores globales de planta, granja y mantenimiento',
      'Supervisión de planta: rondas con foto, historial y nacimiento',
      'Seguimiento de metas y decisiones de dirección',
      'Visión consolidada multi-sede',
      'Coordinación con auxiliares de gerencia',
    ],
    quickLinks: [
      { tab: 'supervision', label: 'Supervisión (rondas)' },
      { tab: 'panel', label: 'Panel de planta' },
      { tab: 'plantas', label: 'Plantas' },
      { tab: 'monitoreo', label: 'Monitoreo' },
    ],
  },
  {
    id: 'rrhh',
    tab: 'rrhh',
    label: 'Recursos humanos',
    icon: null,
    tagline: 'Coordinación de personal, turnos y clima laboral',
    features: [
      'Dotación por área y sede (inventario de EPP / dotación)',
      'Acompañamiento de ingresos y egresos de personal',
      'Apoyo a horarios y cobertura de turnos',
      'Líder de área RR. HH. + auxiliar(es)',
    ],
    quickLinks: [
      { tab: 'inventarios', label: 'Inventario dotación' },
      { tab: 'horarios', label: 'Horarios' },
      { tab: 'supervision', label: 'Supervisión' },
      { tab: 'perfil', label: 'Perfil' },
    ],
  },
  {
    id: 'contabilidad',
    tab: 'contabilidad',
    label: 'Contabilidad',
    icon: null,
    tagline: 'Costos, facturación y sincronización con Siesa',
    features: [
      'Integración y sincronización con Siesa (ERP contable)',
      'Terceros, pedidos, remisiones y facturas → Siesa (API o planos)',
      'Cruce Excel de remisiones y pedidos de ventas',
      'Costos de OT de mantenimiento hacia contabilidad',
      'Cola de sincronización e historial por empresa',
      'Líder de área de contabilidad + auxiliar(es)',
    ],
    quickLinks: [
      { tab: 'ventas', label: 'Ventas / cruce contable' },
      { tab: 'logistica', label: 'Logística / remisiones' },
      { tab: 'inventarios', label: 'Inventarios' },
      { tab: 'mantenimiento', label: 'Órdenes de trabajo' },
      { tab: 'produccion', label: 'Levantes' },
    ],
  },
  {
    id: 'ventas',
    tab: 'ventas',
    label: 'Ventas',
    icon: null,
    tagline: 'Clientes verificados, pedidos y cruce contable (Siesa / Excel)',
    features: [
      'Cliente registrado y verificado → pedido',
      'Líder de área de ventas + auxiliar(es) de ventas',
      'Confirmación de pedidos y exportación Excel contable',
      'Compatibilidad con sincronización Siesa (terceros y pedidos)',
      'Inventario personalizable de la coordinación de ventas',
    ],
    quickLinks: [
      { tab: 'logistica', label: 'Logística (despacho)' },
      { tab: 'inventarios', label: 'Inventarios' },
      { tab: 'produccion', label: 'Levantes' },
      { tab: 'cargue', label: 'Cargue' },
    ],
  },
  {
    id: 'logistica',
    tab: 'logistica',
    label: 'Logística',
    icon: null,
    tagline: 'Remisiones, despacho y entrega (separado de ventas)',
    features: [
      'Rutas, conductores, entregas y mapa GPS en tiempo real',
      'Chat directo con conductores (GPS activo en ruta)',
      'Llegada a planta automática por geocerca GPS',
      'Contactos: mecánicos, proveedores, etc.',
      'Remisiones desde pedidos confirmados por ventas',
      'Inventario personalizable de la coordinación',
    ],
    quickLinks: [
      { tab: 'logistica', label: 'Panel de flota' },
      { tab: 'ventas', label: 'Ventas (pedidos)' },
      { tab: 'inventarios', label: 'Inventarios' },
      { tab: 'cargue', label: 'Cargue' },
    ],
  },
  {
    id: 'coord_mantenimiento',
    tab: 'coord_mantenimiento',
    label: 'Coord. mantenimiento',
    icon: null,
    tagline: 'Plan de mantenimiento, OT y auxiliares técnicos',
    features: [
      'Priorización de órdenes de trabajo',
      'Programación preventiva y correctiva',
      'Asignación a uno o varios auxiliares de mantenimiento',
      'Indicadores de downtime y criticidad',
    ],
    quickLinks: [
      { tab: 'mantenimiento', label: 'Órdenes de trabajo' },
      { tab: 'monitoreo', label: 'Monitoreo' },
      { tab: 'plantas', label: 'Plantas' },
    ],
  },
  {
    id: 'sst',
    tab: 'sst',
    label: 'SST',
    icon: null,
    tagline: 'Seguridad y salud en el trabajo (independiente de ambiental)',
    features: [
      'Inspecciones de seguridad y EPP',
      'Reportes de incidentes y acciones correctivas',
      'Salud ocupacional y condiciones de trabajo',
      'Líder de área SST + auxiliar(es) de SST',
    ],
    quickLinks: [
      { tab: 'inventarios', label: 'Mi inventario / EPP' },
      { tab: 'iot', label: 'IoT / Bioseguridad' },
      { tab: 'supervision', label: 'Supervisión' },
      { tab: 'mantenimiento', label: 'Mantenimiento' },
      { tab: 'plantas', label: 'Plantas' },
    ],
  },
  {
    id: 'ambiental',
    tab: 'ambiental',
    label: 'Gestión ambiental',
    icon: null,
    tagline: 'Residuos, emisiones, agua y cumplimiento ambiental',
    features: [
      'Gestión de residuos y vertimientos',
      'Seguimiento ambiental de planta y granja',
      'Registros y cumplimiento normativo',
      'Líder de área ambiental + auxiliar(es) ambientales',
    ],
    quickLinks: [
      { tab: 'iot', label: 'IoT / ambiente sedes' },
      { tab: 'inventarios', label: 'Mi inventario' },
      { tab: 'plantas', label: 'Plantas' },
      { tab: 'granjas', label: 'Granjas' },
      { tab: 'supervision', label: 'Supervisión' },
    ],
  },
  {
    id: 'veterinaria',
    tab: 'veterinaria',
    label: 'Sanidad veterinaria',
    icon: null,
    tagline: 'Vacunas, medicina, fertilidad y laboratorio (wet tunnels)',
    features: [
      'Programas de vacunación (planta y granja)',
      'Medicamentos y tratamientos',
      'Pruebas de fertilidad',
      'Muestras de laboratorio de ambientes / wet tunnels',
      'Médico veterinario de planta + auxiliares de vacunación',
      'Líderes de área de granja (veterinarios) con sus auxiliares',
    ],
    quickLinks: [
      { tab: 'produccion', label: 'Levantes / lotes' },
      { tab: 'plantas', label: 'Plantas' },
      { tab: 'granjas', label: 'Granjas' },
      { tab: 'inventarios', label: 'Inventarios' },
    ],
  },
]

/** Export «roleLabel»: API pública de este módulo. Henry Stark Desarrollador */
export function roleLabel(role) {
  return ROLE_LABEL[role] ?? role
}

/** Export «areaLabel»: API pública de este módulo. Henry Stark Desarrollador */
export function areaLabel(area) {
  return WORK_AREAS.find((a) => a.value === area)?.label ?? area ?? 'General'
}

/**
 * Roles que exigen área en el admin.
 * El líder de área (coordinator) SIEMPRE debe tener área para personalizar
 * menú y herramientas (como logística, ventas, RRHH…).
 */
export function roleNeedsArea(role) {
  return role === 'coordinator'
}

/** Etiqueta unificada del cargo + área (p. ej. “Líder de área · Logística”) */
export function leaderTitle(role, area) {
  if (role === 'coordinator') {
    const a = areaLabel(area)
    return a && a !== 'General' ? `Líder de área · ${a}` : 'Líder de área'
  }
  return roleLabel(role)
}

/**
 * Entrada unificada: tablero «Hoy» (experiencia por rol).
 * Admin de plataforma sin org sigue en Administración.
 */
/** Export «defaultHomeTab»: API pública de este módulo. Henry Stark Desarrollador */
export function defaultHomeTab({ isPlatformAdmin }) {
  // Primero el módulo de negocio del servicio SaaS (no menú del cliente)
  if (isPlatformAdmin) return 'platform-business'
  return 'hoy'
}

/**
 * Agrupa roles para <optgroup>.
 * @param {{ includePlatformStaff?: boolean }} [opts]
 * Por defecto SOLO roles de cliente (sin developer de plataforma).
 */
export function orgRolesGrouped(opts = {}) {
  const list = opts.includePlatformStaff
    ? allOrgRolesIncludingPlatformStaff()
    : clientOrgRoles()
  const map = new Map()
  for (const r of list) {
    const g = r.group || 'Otros'
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(r)
  }
  return [...map.entries()].map(([group, roles]) => ({ group, roles }))
}

/** ¿Este rol de org es de personal de plataforma (no cliente)? */
export function isPlatformStaffOrgRole(role) {
  return role === 'developer'
}

/**
 * Coordinadores (cualquier área), gerencia y dueños/admins de empresa
 * pueden administrar usuarios de SU organización (crear, aprobar, roles).
 * No ven ni asignan rol developer (CDH Maker).
 */
export function canManageOrgUsers(role) {
  return (
    role === 'coordinator' ||
    role === 'management' ||
    role === 'owner' ||
    role === 'admin'
  )
}

/** Roles que el admin de empresa puede asignar (nunca developer) */
export function orgAdminAssignableRoles() {
  return clientOrgRoles().filter((r) => r.value !== 'developer')
}

/** Auxiliares típicos del área de un coordinador */
export function auxiliariesForArea(area) {
  return COORD_AUXILIARIES[area] || COORD_AUXILIARIES.general
}

/** ¿Participa en sanidad veterinaria (vacunas, lab, fertilidad)? */
export function isVeterinaryRole(role, area) {
  // Sin owner/admin/management: módulo hermético (solo nativos + grants en App)
  if (['plant_veterinarian', 'vaccination_auxiliary'].includes(role)) {
    return true
  }
  if (role === 'coordinator' && ['farm', 'veterinary', 'plant'].includes(area)) return true
  return false
}

/**
 * Potestad completa de supervisión de planta:
 * rondas con foto, nacimiento, historial, cerrar ronda, asignar actividades.
 * Gerencia y coordinador/líder de planta (y demás líderes con acceso al módulo)
 * + supervisor y plataforma.
 */
export function canSupervisePlant(role, area) {
  if (
    ['owner', 'admin', 'supervisor', 'management', 'management_auxiliary', 'coordinator'].includes(
      role
    )
  ) {
    return true
  }
  // Coordinador de planta por área (por si llega un alias de rol)
  if (role === 'plant_coordinator' || (area === 'plant' && role === 'leader')) return true
  return false
}

/**
 * Puede registrar ronda (foto de interfaz) u operar supervisión básica.
 * Operarios y auxiliares de turno también toman fotos; gerencia y coord. planta
 * tienen el paquete completo vía canSupervisePlant.
 */
export function canOperatePlantRounds(role, area) {
  if (canSupervisePlant(role, area)) return true
  return [
    'operator',
    'auxiliary',
    'auxiliary_production',
    'maintenance_auxiliary',
    'reception_operator',
  ].includes(role)
}

/** Puede ejecutar calibración de máquina (2 fotos: calibrador + pantalla). */
export function canCalibrateMachines(role) {
  return [
    'operator',
    'auxiliary',
    'auxiliary_production',
    'maintenance_auxiliary',
    'supervisor',
    'coordinator',
    'owner',
    'admin',
    'management',
    'management_auxiliary',
  ].includes(role)
}

/** Puede asignar actividades / OT de turno en supervisión */
export function canAssignShiftWork(role, area) {
  return canSupervisePlant(role, area)
}

/**
 * Acceso al recorrido 3D de la planta — el «metaverso» de IncubApp, en
 * /planta3d/. Exclusivo de liderazgo: líderes de área y gerencia, más el
 * dueño y el administrador de la empresa, que están por encima de ambos.
 * La operación de turno (operarios, auxiliares, supervisores, conductores)
 * NO lo ve.
 */
export function canSeePlant3DTour(role) {
  return [
    'coordinator',
    'management',
    'management_auxiliary',
    'owner',
    'admin',
  ].includes(role)
}

/**
 * Ruta del recorrido 3D, servido como página aparte desde public/planta3d/.
 * Se apunta al index.html explícito, no a la carpeta: en desarrollo Vite no
 * resuelve el índice de directorio y /planta3d/ cae al index de la SPA.
 */
export const PLANT_3D_TOUR_URL = '/planta3d/index.html'
