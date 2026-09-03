/**
 * Constantes de integración IncubApp ↔ Siesa (ERP contable Colombia).
 * Documentos y estados alineados a uso comercial / financiero típico.
 */

export const SIESA_PRODUCT = 'Siesa'
export const SIESA_INTEGRATION_VERSION = '1.0.0'

/** Modos de conexión */
export const SIESA_MODES = {
  rest: {
    id: 'rest',
    label: 'API REST',
    description: 'Envío en vivo a endpoint Siesa / middleware (Pangea, Easy Connect, etc.).',
  },
  plano: {
    id: 'plano',
    label: 'Planos / archivos',
    description: 'Genera archivos de importación (CSV/plano) para cargar en Siesa.',
  },
  hybrid: {
    id: 'hybrid',
    label: 'Híbrido',
    description: 'Intenta REST y deja plano de respaldo si falla la API.',
  },
}

/**
 * Tipos de documento / entidad sincronizables.
 * code: referencia contable/comercial habitual en Siesa (configurable por org).
 */
export const SIESA_ENTITY_TYPES = {
  tercero: {
    id: 'tercero',
    label: 'Terceros / clientes',
    source: 'customers',
    defaultDocType: 'TER',
    direction: 'out',
  },
  pedido: {
    id: 'pedido',
    label: 'Pedidos de venta',
    source: 'sales_orders',
    defaultDocType: 'PV',
    direction: 'out',
  },
  remision: {
    id: 'remision',
    label: 'Remisiones',
    source: 'sales_remittances',
    defaultDocType: 'RM',
    direction: 'out',
  },
  factura: {
    id: 'factura',
    label: 'Facturas / cruce contable',
    source: 'sales_remittances',
    defaultDocType: 'FV',
    direction: 'out',
  },
  inventario: {
    id: 'inventario',
    label: 'Movimientos de inventario',
    source: 'inventory',
    defaultDocType: 'IM',
    direction: 'out',
  },
  costo_ot: {
    id: 'costo_ot',
    label: 'Costos OT (mantenimiento)',
    source: 'work_orders',
    defaultDocType: 'NC',
    direction: 'out',
  },
}

export const SIESA_SYNC_STATUS = {
  pending: 'pending',
  queued: 'queued',
  syncing: 'syncing',
  synced: 'synced',
  error: 'error',
  skipped: 'skipped',
}

export const SIESA_SYNC_STATUS_LABEL = {
  pending: 'Pendiente',
  queued: 'En cola',
  syncing: 'Sincronizando',
  synced: 'Sincronizado',
  error: 'Error',
  skipped: 'Omitido',
}

/** Dependencias del módulo contabilidad que alimentan Siesa */
export const SIESA_ACCOUNTING_DEPS = [
  { id: 'customers', label: 'Clientes (terceros)', entity: 'tercero', tab: 'ventas' },
  { id: 'sales_orders', label: 'Pedidos de venta', entity: 'pedido', tab: 'ventas' },
  { id: 'sales_remittances', label: 'Remisiones / despachos', entity: 'remision', tab: 'logistica' },
  { id: 'inventory', label: 'Inventarios de área', entity: 'inventario', tab: 'inventarios' },
  { id: 'work_orders', label: 'Costos de OT', entity: 'costo_ot', tab: 'mantenimiento' },
]

export const DEFAULT_SIESA_CONFIG = {
  enabled: false,
  mode: 'plano',
  /** Código de compañía en Siesa */
  companyCode: '',
  /** Centro de operación / sucursal */
  co: '',
  /** Unidad de negocio */
  un: '',
  /** Base URL del API o middleware (sin trailing slash) */
  baseUrl: '',
  /** Token / API key (solo en cliente del tenant; no se expone públicamente) */
  apiKey: '',
  /** Prefijo de referencia externa IncubApp */
  externalPrefix: 'INC',
  /** Tipos de documento por entidad (override) */
  docTypes: {
    tercero: 'TER',
    pedido: 'PV',
    remision: 'RM',
    factura: 'FV',
    inventario: 'IM',
    costo_ot: 'NC',
  },
  /** Mapeo de ítems de producto IncubApp → código ítem Siesa */
  itemCodes: {
    day_old_chicks: '',
    eggs: '',
    other: '',
  },
  /** Sincronizar automáticamente al exportar Excel contable */
  autoQueueOnExport: true,
  /** Entidades habilitadas */
  entities: {
    tercero: true,
    pedido: true,
    remision: true,
    factura: true,
    inventario: false,
    costo_ot: false,
  },
  notes: '',
  updatedAt: null,
}
