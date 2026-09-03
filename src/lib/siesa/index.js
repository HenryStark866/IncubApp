/**
 * Integración IncubApp ↔ Siesa (ERP contable).
 * Punto de entrada único para contabilidad y dependencias (ventas, remisiones, inventarios, OT).
 */

export {
  SIESA_PRODUCT,
  SIESA_INTEGRATION_VERSION,
  SIESA_MODES,
  SIESA_ENTITY_TYPES,
  SIESA_SYNC_STATUS,
  SIESA_SYNC_STATUS_LABEL,
  SIESA_ACCOUNTING_DEPS,
  DEFAULT_SIESA_CONFIG,
} from './constants'

export {
  getSiesaConfig,
  saveSiesaConfigLocal,
  loadSiesaConfig,
  persistSiesaConfig,
  isSiesaReady,
} from './config'

export {
  mapCustomerToTercero,
  mapOrderToPedido,
  mapRemittanceToRemision,
  mapRemittanceToFactura,
  mapInventoryItem,
  mapWorkOrderCost,
  mapEntity,
} from './mappers'

export { buildPlanoBundle, downloadPlanoFiles, downloadTextFile } from './planos'
export { testSiesaConnection, pushDocumentsToSiesa } from './client'

export {
  listSiesaQueue,
  listSiesaLog,
  enqueueSiesaItem,
  enqueueMany,
  clearSiesaQueue,
  removeSiesaQueueItem,
  runSiesaSync,
  buildQueueFromDomain,
  siesaQueueStats,
} from './syncQueue'
