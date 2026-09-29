/**
 * Guardar una orden de trabajo con sus fotos/documentos de evidencia, tolerando
 * instalaciones sin las columnas nuevas y la falta de señal.
 *
 *  - La OT lleva un id generado en el teléfono: así sus evidencias la pueden
 *    referenciar aunque todo quede en la cola sin conexión.
 *  - Si la base no tiene alguna columna nueva (checklist, format_code…), se quita y se reintenta.
 *  - Sin red, la OT, las fotos y sus filas de evidencia entran a la cola en orden
 *    (primero la OT) y suben solas al volver la señal.
 * La usan el inicio del auxiliar de mantenimiento y el del operario de turno.
 * Henry Stark Desarrollador
 */
import { supabase } from './supabase'
import { compressImage } from './image'
import { isNetworkError, isOnline } from './network'
import { enqueueInsert, enqueueStorageUpload } from './offlineQueue'
import { openEvidenceFormat, workOrderRecordItem } from './sigRecordDocuments'

export const EVIDENCE_BUCKET = 'wo-evidence'

const MISSING_COLUMN = /Could not find the '([a-z_]+)' column|column "?([a-z_]+)"? of relation "?[a-z_]+"? does not exist/i

/**
 * Inserta y, si la base no tiene alguna columna nueva, la quita y reintenta.
 * @returns {Promise<{ error: string|null, dropped: string[] }>}
 */
export async function insertDroppingMissingColumns(client, table, row, { maxTries = 8 } = {}) {
  const current = { ...row }
  const dropped = []
  for (let i = 0; i < maxTries; i++) {
    const { error } = await client.from(table).insert(current)
    if (!error) return { error: null, dropped }
    const m = String(error.message || '').match(MISSING_COLUMN)
    const col = m && (m[1] || m[2])
    if (!col || !(col in current)) return { error: error.message, dropped }
    delete current[col]
    dropped.push(col)
  }
  return { error: 'No se pudo guardar la orden', dropped }
}

/** Columnas de work_orders presentes en todas las instalaciones (para la cola sin conexión). */
export const BASE_ORDER_COLUMNS = [
  'id', 'org_id', 'plant_id', 'machine_id', 'room_id', 'location_type', 'location_name', 'title', 'description', 'type',
  'priority', 'status', 'source', 'assigned_to', 'created_by', 'started_at', 'completed_at', 'downtime_minutes', 'resolution',
]

export const pickColumns = (row, cols = BASE_ORDER_COLUMNS) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => cols.includes(k)))

export const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

const safeName = (name) => String(name || 'archivo').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)

/**
 * Guarda la OT, sus evidencias y otras OT que dependan de ella (p. ej. la del hallazgo).
 * @param {object} p
 * @param {object} p.order fila de work_orders (sin id se le asigna uno)
 * @param {File[]} [p.files] fotos (se comprimen) o documentos
 * @param {object[]} [p.extraOrders] OT adicionales a crear después
 * @param {string} [p.evidenceNote] nota de cada evidencia
 * @returns {Promise<{ error: string|null, order?: object, offline?: boolean, warnings?: string[] }>}
 */
export async function saveWorkOrderWithEvidence({ orgId, userId, order: row, files = [], extraOrders = [], evidenceNote = null, client = supabase }) {
  if (!orgId || !userId) return { error: 'Sesión inválida' }
  const warnings = []
  const order = { ...row, id: row.id || newId() }
  const prepared = await Promise.all(files.map((f) => compressImage(f)))
  const evidence = prepared.map((file, i) => ({
    file,
    path: `${orgId}/${order.id}/${Date.now()}-${i}-${safeName(file.name)}`,
    row: {
      org_id: orgId,
      work_order_id: order.id,
      uploaded_by: userId,
      file_name: file.name,
      file_type: file.type?.startsWith('image/') ? 'image' : 'document',
      note: evidenceNote || `Evidencia de ${order.format_code || 'la OT'} · ${order.title}`,
    },
  }))

  const queueAll = async () => {
    await enqueueInsert('work_orders', pickColumns(order))
    for (const ev of evidence) {
      await enqueueStorageUpload(EVIDENCE_BUCKET, ev.path, ev.file, ev.file.type)
      await enqueueInsert('wo_evidence', { ...ev.row, file_path: ev.path })
    }
    for (const extra of extraOrders) await enqueueInsert('work_orders', pickColumns(extra))
    return { error: null, order, offline: true, warnings }
  }

  try {
    if (!isOnline()) return await queueAll()
    const ins = await insertDroppingMissingColumns(client, 'work_orders', order)
    if (ins.error) return isNetworkError(ins.error) ? await queueAll() : { error: ins.error }

    for (const ev of evidence) {
      const up = await client.storage.from(EVIDENCE_BUCKET).upload(ev.path, ev.file, { contentType: ev.file.type, upsert: false })
      if (up.error) {
        if (isNetworkError(up.error.message)) {
          await enqueueStorageUpload(EVIDENCE_BUCKET, ev.path, ev.file, ev.file.type)
          await enqueueInsert('wo_evidence', { ...ev.row, file_path: ev.path })
          warnings.push(`«${ev.file.name}» quedó en cola y sube al volver la red.`)
        } else warnings.push(`No se pudo subir «${ev.file.name}»: ${up.error.message}`)
        continue
      }
      const { error: evErr } = await client.from('wo_evidence').insert({ ...ev.row, file_path: ev.path })
      if (evErr) {
        await client.storage.from(EVIDENCE_BUCKET).remove([ev.path])
        warnings.push(`No se pudo anotar «${ev.file.name}»: ${evErr.message}`)
      }
    }
    for (const extra of extraOrders) {
      const r = await insertDroppingMissingColumns(client, 'work_orders', extra)
      if (r.error) warnings.push(`No se pudo crear la OT «${extra.title}»: ${r.error}`)
    }
    // El código de la OT (OT-0123) lo pone la base.
    const { data: saved } = await client.from('work_orders').select('*').eq('id', order.id).maybeSingle()
    return { error: null, order: saved || order, warnings }
  } catch (e) {
    if (isNetworkError(e?.message)) return queueAll()
    return { error: e?.message || String(e) }
  }
}

/**
 * Abre el formato de la OT (FOMAT01 / FOMAT04 / FOMAT06) con sus evidencias; las
 * fotos van con enlace firmado de una hora. Sin red abre el formato sin fotos.
 */
export async function openWorkOrderFormat({ order, machine = null, createdBy = null, assignedTo = null, nameOf = () => null, client = supabase }) {
  let files = []
  if (isOnline() && order?.id) {
    const { data } = await client
      .from('wo_evidence')
      .select('id, file_path, file_name, file_type, note, uploaded_by, created_at')
      .eq('work_order_id', order.id)
      .order('created_at')
    files = await Promise.all(
      (data || []).map(async (f) => {
        const { data: signed } = await client.storage.from(EVIDENCE_BUCKET).createSignedUrl(f.file_path, 3600)
        return { ...f, url: signed?.signedUrl || null, uploadedByName: nameOf(f.uploaded_by) }
      })
    )
  }
  openEvidenceFormat(workOrderRecordItem({ order, files, machine, createdBy, assignedTo }))
}
