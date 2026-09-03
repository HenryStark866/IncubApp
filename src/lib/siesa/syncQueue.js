/**
 * Cola local de sincronización Siesa + registro de historial.
 */

import { SIESA_SYNC_STATUS } from './constants'
import { mapEntity } from './mappers'
import { buildPlanoBundle, downloadPlanoFiles } from './planos'
import { pushDocumentsToSiesa } from './client'
import { supabase } from '../supabase'

const QUEUE_KEY = 'incubapp_siesa_queue_v1'
const LOG_KEY = 'incubapp_siesa_log_v1'
const MAX_LOG = 200

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* */
  }
}

function queueKey(orgId) {
  return `${QUEUE_KEY}:${orgId || 'none'}`
}
function logKey(orgId) {
  return `${LOG_KEY}:${orgId || 'none'}`
}

export function listSiesaQueue(orgId) {
  const q = readJson(queueKey(orgId), [])
  return Array.isArray(q) ? q : []
}

export function listSiesaLog(orgId) {
  const q = readJson(logKey(orgId), [])
  return Array.isArray(q) ? q : []
}

function pushLog(orgId, entry) {
  const list = listSiesaLog(orgId)
  list.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry,
  })
  writeJson(logKey(orgId), list.slice(0, MAX_LOG))
}

/**
 * Encola un documento para sync (dedupe por entity+sourceId).
 */
export function enqueueSiesaItem(orgId, { entity, sourceId, record, label }) {
  if (!orgId || !entity || !sourceId) return { error: 'Datos incompletos' }
  const q = listSiesaQueue(orgId)
  const idx = q.findIndex((x) => x.entity === entity && x.sourceId === sourceId)
  const item = {
    id: idx >= 0 ? q[idx].id : `sq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entity,
    sourceId,
    label: label || sourceId,
    record,
    status: SIESA_SYNC_STATUS.queued,
    enqueuedAt: new Date().toISOString(),
    attempts: idx >= 0 ? q[idx].attempts || 0 : 0,
    lastError: null,
  }
  if (idx >= 0) q[idx] = item
  else q.push(item)
  writeJson(queueKey(orgId), q)
  return { item }
}

export function enqueueMany(orgId, items) {
  const results = []
  for (const it of items) {
    results.push(enqueueSiesaItem(orgId, it))
  }
  return results
}

export function clearSiesaQueue(orgId, onlySynced = false) {
  if (!onlySynced) {
    writeJson(queueKey(orgId), [])
    return
  }
  const q = listSiesaQueue(orgId).filter((x) => x.status !== SIESA_SYNC_STATUS.synced)
  writeJson(queueKey(orgId), q)
}

export function removeSiesaQueueItem(orgId, id) {
  const q = listSiesaQueue(orgId).filter((x) => x.id !== id)
  writeJson(queueKey(orgId), q)
}

/**
 * Ejecuta sincronización de la cola según el modo de config.
 * @returns {{ ok, mode, mapped, planos?, rest?, syncedIds, errors }}
 */
export async function runSiesaSync(orgId, config, { onlyPending = true } = {}) {
  let queue = listSiesaQueue(orgId)
  if (onlyPending) {
    queue = queue.filter((x) =>
      [SIESA_SYNC_STATUS.queued, SIESA_SYNC_STATUS.pending, SIESA_SYNC_STATUS.error].includes(
        x.status
      )
    )
  }
  if (!queue.length) {
    return { ok: true, mode: config.mode, mapped: [], syncedIds: [], errors: [], message: 'Cola vacía' }
  }

  const enabled = config.entities || {}
  const toProcess = queue.filter((x) => enabled[x.entity] !== false)

  const mappedByEntity = {}
  const mappedList = []
  const errors = []

  for (const item of toProcess) {
    try {
      const payload = mapEntity(item.entity, item.record, config)
      if (!mappedByEntity[item.entity]) mappedByEntity[item.entity] = []
      mappedByEntity[item.entity].push(payload)
      mappedList.push({ queueId: item.id, sourceId: item.sourceId, entity: item.entity, payload })
    } catch (e) {
      errors.push({ id: item.id, error: e.message })
      item.status = SIESA_SYNC_STATUS.error
      item.lastError = e.message
      item.attempts = (item.attempts || 0) + 1
    }
  }

  let planosResult = null
  let restResult = null
  const syncedIds = []

  const mode = config.mode || 'plano'
  const doPlano = mode === 'plano' || mode === 'hybrid'
  const doRest = mode === 'rest' || mode === 'hybrid'

  if (doRest && mappedList.length) {
    restResult = await pushDocumentsToSiesa(
      config,
      mappedList.map((m) => m.payload)
    )
    if (restResult.ok) {
      for (const m of mappedList) syncedIds.push(m.queueId)
    } else if (mode === 'rest') {
      errors.push({ id: 'rest', error: restResult.error || 'Fallo REST' })
    }
  }

  if (doPlano && mappedList.length && (mode === 'plano' || !restResult?.ok)) {
    const files = buildPlanoBundle(mappedByEntity)
    planosResult = downloadPlanoFiles(files)
    for (const m of mappedList) {
      if (!syncedIds.includes(m.queueId)) syncedIds.push(m.queueId)
    }
  }

  // Actualizar cola
  const all = listSiesaQueue(orgId)
  const now = new Date().toISOString()
  for (const item of all) {
    if (syncedIds.includes(item.id)) {
      item.status = SIESA_SYNC_STATUS.synced
      item.syncedAt = now
      item.lastError = null
      item.attempts = (item.attempts || 0) + 1
    } else if (toProcess.some((t) => t.id === item.id) && errors.length) {
      const err = errors.find((e) => e.id === item.id) || errors[0]
      item.status = SIESA_SYNC_STATUS.error
      item.lastError = err?.error || 'Error de sincronización'
      item.attempts = (item.attempts || 0) + 1
    }
  }
  writeJson(queueKey(orgId), all)

  pushLog(orgId, {
    kind: 'sync',
    mode,
    count: mappedList.length,
    synced: syncedIds.length,
    errors: errors.length,
    restOk: restResult?.ok ?? null,
    planoFiles: planosResult?.count ?? 0,
  })

  // Best-effort log en Supabase
  try {
    await supabase.from('siesa_sync_log').insert({
      org_id: orgId,
      mode,
      count_total: mappedList.length,
      count_synced: syncedIds.length,
      count_errors: errors.length,
      detail: {
        rest: restResult
          ? { ok: restResult.ok, status: restResult.status, error: restResult.error }
          : null,
        planos: planosResult,
        entities: Object.fromEntries(
          Object.entries(mappedByEntity).map(([k, v]) => [k, v.length])
        ),
      },
      created_at: now,
    })
  } catch {
    /* tabla opcional */
  }

  return {
    ok: errors.length === 0 || syncedIds.length > 0,
    mode,
    mapped: mappedList,
    planos: planosResult,
    rest: restResult,
    syncedIds,
    errors,
    message:
      syncedIds.length > 0
        ? `Sincronizados ${syncedIds.length} documento(s) con Siesa (${mode}).`
        : errors[0]?.error || 'Sin sincronizar',
  }
}

/**
 * Construye ítems de cola desde datos vivos de ventas/remisiones/clientes.
 */
export function buildQueueFromDomain({
  customers = [],
  orders = [],
  remittances = [],
  inventory = [],
  workOrders = [],
  config,
  onlyPendingRemittances = true,
}) {
  const items = []
  const ent = config?.entities || {}

  if (ent.tercero !== false) {
    for (const c of customers) {
      if (c.status === 'blocked') continue
      items.push({
        entity: 'tercero',
        sourceId: c.id,
        record: c,
        label: c.name || c.nit || c.id,
      })
    }
  }
  if (ent.pedido !== false) {
    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'requested') continue
      items.push({
        entity: 'pedido',
        sourceId: o.id,
        record: o,
        label: o.code || o.id,
      })
    }
  }
  if (ent.remision !== false || ent.factura !== false) {
    for (const r of remittances) {
      if (r.status === 'cancelled') continue
      if (onlyPendingRemittances && r.siesa_synced_at) continue
      if (onlyPendingRemittances && r.accounting_exported_at && !config?.resyncExported) {
        // aún se pueden re-encolar facturas si factura está activo
      }
      if (ent.remision !== false) {
        items.push({
          entity: 'remision',
          sourceId: r.id,
          record: r,
          label: r.code || r.id,
        })
      }
      if (ent.factura !== false && ['dispatched', 'delivered'].includes(r.status)) {
        items.push({
          entity: 'factura',
          sourceId: `fv-${r.id}`,
          record: r,
          label: `FV ${r.code || r.id}`,
        })
      }
    }
  }
  if (ent.inventario === true) {
    for (const i of inventory) {
      items.push({
        entity: 'inventario',
        sourceId: i.id,
        record: i,
        label: i.name || i.sku || i.id,
      })
    }
  }
  if (ent.costo_ot === true) {
    for (const w of workOrders) {
      if (!(Number(w.cost) > 0)) continue
      items.push({
        entity: 'costo_ot',
        sourceId: w.id,
        record: w,
        label: w.code || w.title || w.id,
      })
    }
  }
  return items
}

export function siesaQueueStats(orgId) {
  const q = listSiesaQueue(orgId)
  const by = { total: q.length, queued: 0, synced: 0, error: 0, other: 0 }
  for (const x of q) {
    if (x.status === SIESA_SYNC_STATUS.queued || x.status === SIESA_SYNC_STATUS.pending) by.queued++
    else if (x.status === SIESA_SYNC_STATUS.synced) by.synced++
    else if (x.status === SIESA_SYNC_STATUS.error) by.error++
    else by.other++
  }
  return by
}
