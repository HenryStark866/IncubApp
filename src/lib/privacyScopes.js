/**
 * =============================================================================
 * ARCHIVO: src/lib/privacyScopes.js
 * PROPÓSITO: Módulos herméticos: qué pestañas ve cada perfil y quién puede otorgar acceso temporal.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Perfiles herméticos: cada dominio es un módulo de información.
 * Solo el admin de plataforma (isOmniscient) ve todo.
 * El resto solo ve su dominio nativo + accesos temporales aprobados
 * por un otorgante del dominio solicitado.
 */

/** Tabs de todos los miembros de org (además de su módulo) */
export const COMMON_TABS = [
  'hoy',
  'perfil',
  'accesos',
  'reportes',
  'asistencia',
  'cumplimiento',
  /** Desplazamientos misionales: todos los perfiles de la empresa */
  'misionales',
  /** Cargue: habilitado para todos los perfiles de la empresa (el cliente
   *  externo del portal se excluye en nativeTabsFor). */
  'cargue',
]

/**
 * Roles de ejecución de turno: operan herramientas, no coordinan.
 * Ven su bandeja de trabajo y su historial, no los tableros de coordinación.
 */
export const SHIFT_WORKER_ROLES = [
  'operator',
  'auxiliary',
  'auxiliary_production',
  'reception_operator',
  'barn_operator',
]

/** ¿Es personal de ejecución de turno (operario / auxiliar)? */
export function isShiftWorkerRole(role) {
  return SHIFT_WORKER_ROLES.includes(role)
}

/**
 * Dominios / módulos.
 * - members(): quién entra al módulo de forma nativa
 * - canGrant(): quién puede aprobar/denegar acceso temporal a terceros
 * - tabs: pestañas del menú del módulo (todos los miembros del dominio)
 * - tabsFor(role, area): pestañas efectivas por rol dentro del dominio.
 *   Si existe, tiene prioridad sobre `tabs` para miembros nativos; permite que
 *   un operario NO herede los tableros de coordinación de su propio dominio.
 *   Los accesos temporales (grants) siguen otorgando `tabs` completo.
 */
/** Export «PRIVACY_DOMAINS»: API pública de este módulo. Henry Stark Desarrollador */
export const PRIVACY_DOMAINS = [
  {
    id: 'gerencia',
    label: 'Gerencia / dirección',
    description:
      'Cockpit de gerencia, metas, decisiones, informes, datos maestros y supervisión de planta (rondas con foto)',
    // Supervisión nativa: gerencia puede registrar/ver rondas como el supervisor.
    // `datos-op`: centro de datos (lotes, cantidades, fechas, cargas actuales) que
    // arranca el pipeline automatizado de clasificación/cargue.
    tabs: ['gerencia', 'informes', 'datos-op', 'supervision', 'panel', 'monitoreo', 'plantas'],
    members: (role, area) =>
      role === 'management' ||
      role === 'management_auxiliary' ||
      (role === 'coordinator' && area === 'management'),
    canGrant: (role, area) =>
      role === 'management' || (role === 'coordinator' && area === 'management'),
  },
  {
    id: 'plant',
    label: 'Liderazgo / operación de planta',
    description: 'Panel de planta, rondas, monitoreo, planos, recepción y cargue',
    tabs: [
      'panel',
      'monitoreo',
      'plantas',
      'clasificacion',
      'recepcion',
      'liquidar-cargues',
      'auditoria-huevos',
      'autorizar-datos',
      'cargue',
      'supervision',
      'calibracion',
      'horarios',
      'asistencia',
      'solicitudes',
      'reportes-informes',
      'informacion',
      'huevos',
      'historial',
    ],
    /**
     * El operario de turno NO ve panel de coordinación ni planos: solo sus
     * herramientas de ejecución (actividades, cargue, historial).
     */
    tabsFor: (role, _area) => {
      if (role === 'operator' || role === 'auxiliary' || role === 'auxiliary_production') {
        return ['supervision', 'calibracion', 'horarios', 'cargue', 'historial']
      }
      if (role === 'reception_operator') {
        return [
          'clasificacion',
          'recepcion',
          'liquidar-cargues',
          'auditoria-huevos',
          'autorizar-datos',
          'horarios',
          'asistencia',
          'solicitudes',
          'reportes-informes',
          'informacion',
        ]
      }
      if (role === 'management' || role === 'management_auxiliary') {
        return ['panel', 'monitoreo', 'plantas', 'supervision', 'calibracion']
      }
      // supervisor y líder de área de planta: dominio completo
      const completo = [
        'panel',
        'monitoreo',
        'plantas',
        'recepcion',
        'cargue',
        'supervision',
        'calibracion',
        'horarios',
        'huevos',
        'historial',
      ]
      // El líder ve además la producción, que es lo que dirige: la de la planta
      // (`datos-op` — lotes, cantidades, fechas y cargas actuales en incubadora,
      // que nace en el dominio de gerencia) y la de granja (`produccion`, los
      // lotes en levante). Se le conceden esas DOS pestañas y nada más: sumarlo
      // como miembro de gerencia o de granja le abriría también el cockpit, los
      // informes y los planos de granja, que no dirige.
      //
      // Va aquí y no en el array `tabs` de arriba a propósito: `tabs` es lo que
      // entrega un grant temporal del dominio completo, y quien reciba planta
      // prestada no tiene por qué llevarse la producción de paso.
      //
      // A esta rama solo llegan el supervisor y los líderes del dominio de
      // planta, así que basta con distinguir el rol: el supervisor NO las lleva
      // —ejecuta el turno, no dirige la producción.
      if (role === 'coordinator') return [...completo, 'datos-op', 'produccion']
      return completo
    },
    members: (role, area) =>
      role === 'supervisor' ||
      role === 'management' ||
      role === 'management_auxiliary' ||
      (role === 'coordinator' &&
        ['plant', 'general', 'quality', null, undefined].includes(area || 'general')) ||
      ['operator', 'auxiliary', 'auxiliary_production', 'reception_operator'].includes(role),
    canGrant: (role, area) =>
      role === 'supervisor' ||
      role === 'management' ||
      (role === 'coordinator' &&
        ['plant', 'general', 'quality'].includes(area || 'general')),
  },
  {
    id: 'farm',
    label: 'Granja / levantes',
    description: 'Planos de granja, lotes en levante y producción avícola',
    tabs: ['granjas', 'produccion', 'huevos', 'historial'],
    /** Galponero: registra huevo e historial; no edita planos de granja. */
    tabsFor: (role) =>
      role === 'barn_operator'
        ? ['produccion', 'huevos', 'historial']
        : ['granjas', 'produccion', 'huevos', 'historial'],
    members: (role, area) =>
      (role === 'coordinator' && area === 'farm') || role === 'barn_operator',
    canGrant: (role, area) => role === 'coordinator' && area === 'farm',
  },
  {
    id: 'maintenance',
    label: 'Mantenimiento',
    description: 'Órdenes de trabajo y coordinación de mantenimiento',
    tabs: ['mantenimiento', 'calibracion', 'coord_mantenimiento', 'historial'],
    /** Auxiliar de mantenimiento ejecuta OT y calibraciones; no ve el tablero de coordinación. */
    tabsFor: (role, area) => {
      if (role === 'maintenance_auxiliary') return ['mantenimiento', 'calibracion', 'historial']
      if (role === 'coordinator' && area === 'maintenance') {
        return ['mantenimiento', 'calibracion', 'coord_mantenimiento', 'historial']
      }
      return ['mantenimiento', 'calibracion']
    },
    members: (role, area) =>
      role === 'maintenance_auxiliary' ||
      (role === 'coordinator' && area === 'maintenance') ||
      // supervisor/planta nativos también usan OT en su labor
      role === 'supervisor' ||
      (role === 'coordinator' && ['plant', 'general'].includes(area || 'general')),
    canGrant: (role, area) =>
      (role === 'coordinator' && area === 'maintenance') ||
      role === 'maintenance_auxiliary',
  },
  {
    id: 'sales',
    label: 'Ventas',
    description: 'Pedidos, clientes y portal comercial',
    tabs: ['ventas'],
    members: (role, area) =>
      role === 'sales_logistics_auxiliary' ||
      role === 'customer' ||
      (role === 'coordinator' && ['sales', 'sales_logistics'].includes(area)),
    canGrant: (role, area) =>
      role === 'sales_logistics_auxiliary' ||
      (role === 'coordinator' && ['sales', 'sales_logistics'].includes(area)),
  },
  {
    id: 'logistics',
    label: 'Logística',
    description: 'Remisiones, flota, rutas, despacho y preoperacional de vehículos (FOSST22)',
    tabs: ['logistica', 'preoperacional', 'historial'],
    /** El conductor solo diligencia su preoperacional y ve su historial. */
    tabsFor: (role) =>
      role === 'driver'
        ? ['preoperacional', 'historial']
        : ['logistica', 'preoperacional', 'historial'],
    members: (role, area) =>
      role === 'logistics_auxiliary' ||
      role === 'driver' ||
      (role === 'coordinator' && ['logistics', 'sales_logistics'].includes(area)),
    canGrant: (role, area) =>
      role === 'logistics_auxiliary' ||
      (role === 'coordinator' && area === 'logistics'),
  },
  {
    id: 'rrhh',
    label: 'Recursos humanos',
    description: 'Módulo RR. HH. y personal',
    tabs: ['rrhh'],
    members: (role, area) =>
      role === 'hr_auxiliary' || (role === 'coordinator' && area === 'hr'),
    canGrant: (role, area) =>
      role === 'hr_auxiliary' || (role === 'coordinator' && area === 'hr'),
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    description: 'Indicadores, módulo contable e integración Siesa',
    tabs: ['contabilidad'],
    members: (role, area) =>
      role === 'accounting_auxiliary' ||
      (role === 'coordinator' && area === 'accounting'),
    canGrant: (role, area) =>
      role === 'accounting_auxiliary' ||
      (role === 'coordinator' && area === 'accounting'),
  },
  {
    id: 'sst',
    label: 'SST',
    description: 'Seguridad y salud en el trabajo',
    tabs: ['sst'],
    members: (role, area) =>
      role === 'sst_auxiliary' ||
      role === 'hse_auxiliary' ||
      (role === 'coordinator' && (area === 'sst' || area === 'hse')),
    canGrant: (role, area) =>
      role === 'sst_auxiliary' ||
      (role === 'coordinator' && (area === 'sst' || area === 'hse')),
  },
  {
    id: 'ambiental',
    label: 'Gestión ambiental',
    description: 'Residuos, emisiones y cumplimiento ambiental',
    tabs: ['ambiental'],
    members: (role, area) =>
      role === 'environmental_auxiliary' ||
      (role === 'coordinator' && area === 'environmental'),
    canGrant: (role, area) =>
      role === 'environmental_auxiliary' ||
      (role === 'coordinator' && area === 'environmental'),
  },
  {
    id: 'veterinary',
    label: 'Sanidad veterinaria',
    description: 'Vacunas, medicina, fertilidad y wet tunnels',
    tabs: ['veterinaria'],
    members: (role, area) =>
      role === 'plant_veterinarian' ||
      role === 'vaccination_auxiliary' ||
      (role === 'coordinator' && ['farm', 'veterinary'].includes(area)),
    canGrant: (role, area) =>
      role === 'plant_veterinarian' ||
      (role === 'coordinator' && ['farm', 'veterinary'].includes(area)),
  },
  {
    id: 'inventories',
    label: 'Inventarios de área',
    description: 'Inventarios por coordinación',
    tabs: ['inventarios'],
    members: (role, area) =>
      [
        'hr_auxiliary',
        'sst_auxiliary',
        'hse_auxiliary',
        'environmental_auxiliary',
        'sales_logistics_auxiliary',
        'plant_veterinarian',
        'vaccination_auxiliary',
      ].includes(role) ||
      (role === 'coordinator' &&
        ['hr', 'sst', 'hse', 'environmental', 'farm', 'plant', 'veterinary', 'sales'].includes(
          area
        )),
    canGrant: (role, area) =>
      role === 'coordinator' &&
      ['hr', 'sst', 'hse', 'environmental', 'farm', 'plant', 'veterinary', 'sales'].includes(area),
  },
  {
    id: 'iot',
    label: 'IoT y bioseguridad',
    description: 'Sensores, IoT y bioseguridad',
    tabs: ['iot'],
    members: (role, area) =>
      role === 'supervisor' ||
      role === 'maintenance_auxiliary' ||
      role === 'sst_auxiliary' ||
      role === 'hse_auxiliary' ||
      role === 'environmental_auxiliary' ||
      (role === 'coordinator' &&
        ['plant', 'maintenance', 'sst', 'hse', 'environmental', 'general'].includes(
          area || 'general'
        )),
    canGrant: (role, area) =>
      role === 'supervisor' ||
      (role === 'coordinator' &&
        ['plant', 'maintenance', 'sst', 'environmental'].includes(area || 'general')),
  },
  {
    id: 'design',
    label: 'Diseño de interfaz (CDH Maker)',
    description: 'Taller de UI del SaaS — solo personal de plataforma CDH Maker',
    tabs: ['diseno'],
    // Clientes NUNCA: ni role=developer en org. Solo isOmniscient (platform_role=admin).
    members: () => false,
    canGrant: () => false,
  },
  {
    id: 'datos',
    label: 'Datos operativos',
    description: 'Edición masiva de datasets (solo admin SaaS CDH Maker)',
    tabs: ['datos'],
    // Nunca nativo en empresas cliente — solo isOmniscient (platform_role=admin)
    members: () => false,
    canGrant: () => false,
  },
]

/** Export «domainById»: API pública de este módulo. Henry Stark Desarrollador */
export function domainById(id) {
  return PRIVACY_DOMAINS.find((d) => d.id === id) || null
}

/** Export «domainsMemberOf»: API pública de este módulo. Henry Stark Desarrollador */
export function domainsMemberOf(role, area) {
  if (!role) return []
  return PRIVACY_DOMAINS.filter((d) => d.members(role, area))
}

/** Export «domainsGrantableBy»: API pública de este módulo. Henry Stark Desarrollador */
export function domainsGrantableBy(role, area) {
  if (!role) return []
  return PRIVACY_DOMAINS.filter((d) => d.canGrant(role, area))
}

/**
 * Pestañas que un dominio concede a un rol concreto.
 * `tabsFor` (si existe) acota el dominio al perfil; si no, se usa `tabs`.
 */
export function domainTabsForRole(domain, role, area) {
  if (!domain) return []
  if (typeof domain.tabsFor === 'function') {
    const list = domain.tabsFor(role, area)
    if (Array.isArray(list)) return list
  }
  return domain.tabs || []
}

/** Export «nativeTabsFor»: API pública de este módulo. Henry Stark Desarrollador */
export function nativeTabsFor(role, area) {
  const set = new Set(COMMON_TABS)
  // Cliente externo (portal comercial): sin módulos de operación interna
  if (role === 'customer') set.delete('cargue')
  // Operario y auxiliares de turno no salen en vehículo: sin desplazamientos misionales.
  if (['operator', 'auxiliary', 'auxiliary_production'].includes(role)) set.delete('misionales')
  for (const d of domainsMemberOf(role, area)) {
    for (const t of domainTabsForRole(d, role, area)) set.add(t)
  }
  return set
}

/**
 * Tabs efectivos = nativos + grants activos.
 * isOmniscient (admin de plataforma) → todo.
 *
 * Nota: un grant temporal entrega el dominio completo (`tabs`), no la vista
 * recortada del rol: quien pide acceso a un módulo ajeno lo hace para
 * consultarlo, no para ejecutarlo como su titular.
 */
/** Export «effectiveTabsFor»: API pública de este módulo. Henry Stark Desarrollador */
export function effectiveTabsFor({ role, area, isOmniscient, grantedScopeIds = [] }) {
  if (isOmniscient) {
    const all = new Set([...COMMON_TABS, 'admin', 'panel', 'informes', '*custom*'])
    for (const d of PRIVACY_DOMAINS) {
      for (const t of d.tabs) all.add(t)
    }
    return all
  }
  // GERENTE: único perfil de la EMPRESA con acceso y monitoreo de todos los
  // datos, módulos y herramientas de su organización (no herramientas de
  // plataforma CDH Maker: diseno/datos siguen siendo solo del SaaS).
  if (role === 'management') {
    const all = new Set([...COMMON_TABS, 'admin', 'panel', 'informes'])
    for (const d of PRIVACY_DOMAINS) {
      if (d.id === 'design' || d.id === 'datos') continue
      for (const t of d.tabs) all.add(t)
    }
    return all
  }
  const set = nativeTabsFor(role, area)
  for (const scopeId of grantedScopeIds) {
    const d = domainById(scopeId)
    if (!d) continue
    for (const t of d.tabs) set.add(t)
  }
  // Módulos personalizados: solo plataforma (omnisciente) o quien tenga tab diseno por grant
  if (set.has('diseno')) set.add('*custom*')
  return set
}

/** Export «requestableDomainsFor»: API pública de este módulo. Henry Stark Desarrollador */
export function requestableDomainsFor(role, area, isOmniscient) {
  if (isOmniscient) return []
  const mine = new Set(domainsMemberOf(role, area).map((d) => d.id))
  return PRIVACY_DOMAINS.filter((d) => !mine.has(d.id) && d.id !== 'datos')
}

/** Export «capabilitiesFromTabs»: API pública de este módulo. Henry Stark Desarrollador */
export function capabilitiesFromTabs(tabs, { isOmniscient }) {
  const has = (t) => isOmniscient || tabs.has(t)
  return {
    canOpen: (t) => {
      if (isOmniscient) return true
      if (String(t).startsWith('cm-')) return tabs.has('*custom*')
      return tabs.has(t)
    },
    canMaintain: has('mantenimiento'),
    canMonitor: has('monitoreo'),
    canDoMaintenance: has('mantenimiento'),
    hasOpsPanel: has('panel'),
    canFarms: has('granjas'),
    canFarmProduction: has('produccion'),
    canPlants: has('plantas'),
    canEggReport: has('huevos'),
    canReception: has('recepcion'),
    canLoad: has('cargue'),
    canColdRoom: has('recepcion'),
    canSchedule: has('horarios') || has('supervision'),
    canHistory: has('historial'),
    canInventories: has('inventarios'),
    canVeterinary: has('veterinaria'),
    canIot: has('iot'),
    canDesign: has('diseno'),
    canEditAllData: has('datos') || isOmniscient,
    isSalesTeam: has('ventas'),
    isLogisticsTeam: has('logistica'),
  }
}

/** Export «primarySiloLabel»: API pública de este módulo. Henry Stark Desarrollador */
export function primarySiloLabel(role, area) {
  const owned = domainsMemberOf(role, area)
  if (!owned.length) return 'Perfil hermético (solo Hoy / Accesos / Perfil)'
  if (owned.length === 1) return `Módulo: ${owned[0].label}`
  return `Módulos: ${owned.map((d) => d.label).join(' · ')}`
}

/** Export «GRANT_DURATIONS»: API pública de este módulo. Henry Stark Desarrollador */
export const GRANT_DURATIONS = [
  { hours: 2, label: '2 horas' },
  { hours: 8, label: '8 horas (turno)' },
  { hours: 24, label: '24 horas' },
  { hours: 72, label: '3 días' },
  { hours: 168, label: '7 días' },
]
