/**
 * =============================================================================
 * ARCHIVO: src/lib/offlineQueue.js
 * PROPÓSITO: Cola IndexedDB de operaciones offline (checks con FOTO, actividades, mutaciones).
 * CÓMO FUNCIONA: Guarda Blobs nativos en IndexedDB (fiable en móvil); reintenta al volver online.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Cola offline universal (IndexedDB).
 *
 * Tipos:
 *  - machine_check     { meta, fileBlob|fileB64 }  → storage + machine_checks
 *  - activity_complete { meta, file? }  → storage + shift_activities update
 *  - db_insert / db_update / db_upsert / storage_upload
 *
 * Fotos: se guardan como Blob (no base64) para no inflar cuota ni romper en WebViews.
 * Al sincronizar se reconstruye File desde Blob o, en legado, desde data URL.
 */

const DB_NAME = 'incubapp_offline'
const DB_VERSION = 3
const STORE_CHECKS = 'pending_checks'
const STORE_ACTIVITIES = 'pending_activities'
const STORE_MUTATIONS = 'pending_mutations'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_CHECKS)) {
        db.createObjectStore(STORE_CHECKS, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORE_ACTIVITIES)) {
        db.createObjectStore(STORE_ACTIVITIES, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
        db.createObjectStore(STORE_MUTATIONS, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

function dbTx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const st = tx.objectStore(store)
    const req = fn(st)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function dbGetAll(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function dbDelete(db, store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Data URL / base64 → string base64 puro + mime */
function parseBase64Payload(b64) {
  if (!b64 || typeof b64 !== 'string') return null
  if (b64.startsWith('data:')) {
    const m = b64.match(/^data:([^;,+]+)?(?:;charset=[^;]+)?;base64,(.+)$/i)
    if (m) return { mime: m[1] || 'application/octet-stream', data: m[2] }
    // data:image/jpeg,... (sin base64) — raro
    const comma = b64.indexOf(',')
    if (comma > 0) {
      const header = b64.slice(0, comma)
      const mime = (header.match(/^data:([^;]+)/) || [])[1] || 'application/octet-stream'
      return { mime, data: b64.slice(comma + 1), raw: !/;base64/i.test(header) }
    }
  }
  return { mime: 'application/octet-stream', data: b64 }
}

/**
 * Decodifica data URL o base64 a File sin usar fetch() (falla en algunos WebViews móviles).
 */
export async function base64ToFile(b64, name, type) {
  if (!b64) return null
  // Ya es Blob/File
  if (b64 instanceof Blob) {
    return b64 instanceof File
      ? b64
      : new File([b64], name || 'file.bin', { type: type || b64.type || 'application/octet-stream' })
  }
  const parsed = parseBase64Payload(b64)
  if (!parsed?.data) return null
  const mime = type || parsed.mime || 'application/octet-stream'
  try {
    let bytes
    if (parsed.raw) {
      // no-base64 data URL
      const bin = unescape(encodeURIComponent(parsed.data))
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } else {
      const bin = atob(parsed.data.replace(/\s/g, ''))
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    }
    return new File([bytes], name || 'photo.jpg', { type: mime, lastModified: Date.now() })
  } catch {
    // Último recurso: fetch data URL (Chrome desktop)
    try {
      const res = await fetch(typeof b64 === 'string' && b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`)
      const blob = await res.blob()
      return new File([blob], name || 'photo.jpg', { type: type || blob.type || mime })
    } catch {
      return null
    }
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

function notifyQueueChanged() {
  try {
    window.dispatchEvent(new Event('incubapp:queue-changed'))
  } catch {
    /* */
  }
}

/**
 * Prepara campos de archivo para IndexedDB.
 * Prioridad: Blob nativo (eficiente). Si falla clone, cae a base64.
 */
async function withFileFields(file) {
  if (!file) return { fileBlob: null, fileB64: null, fileName: null, fileType: null, fileSize: 0 }

  const name = file.name || 'photo.jpg'
  const type = file.type || 'image/jpeg'
  const size = file.size || 0

  // IndexedDB clona Blobs nativamente — mejor que base64 (mitad de espacio, sin atob roto)
  if (file instanceof Blob && size > 0) {
    try {
      // Forzar materialización del blob (algunos File de cámara son "lazy")
      const slice = file.slice(0, file.size, type)
      return {
        fileBlob: slice,
        fileB64: null,
        fileName: name,
        fileType: type,
        fileSize: size,
      }
    } catch {
      /* cae a base64 */
    }
  }

  try {
    const b64 = await blobToBase64(file)
    return { fileBlob: null, fileB64: b64, fileName: name, fileType: type, fileSize: size }
  } catch (e) {
    throw new Error(`No se pudo guardar la foto en el dispositivo: ${e?.message || e}`)
  }
}

/** Reconstruye File desde item de cola (Blob nativo o base64 legado). */
export async function itemToFile(item) {
  if (!item) return null
  if (item.fileBlob instanceof Blob && item.fileBlob.size > 0) {
    return new File([item.fileBlob], item.fileName || 'photo.jpg', {
      type: item.fileType || item.fileBlob.type || 'image/jpeg',
      lastModified: Date.now(),
    })
  }
  if (item.fileB64) {
    return base64ToFile(item.fileB64, item.fileName, item.fileType)
  }
  return null
}

/** Encola machine_check con foto (o sin foto si condition=off). */
export async function enqueueCheck(meta, file) {
  const db = await openDB()
  try {
    const files = await withFileFields(file)
    // Validar: si hay condición con foto obligatoria y no hay bytes, fallar claro
    const needsPhoto = (meta?.condition || 'normal') !== 'off'
    if (needsPhoto && !files.fileBlob && !files.fileB64) {
      throw new Error('La foto no se guardó en el dispositivo (archivo vacío). Vuelve a tomar la foto.')
    }
    await dbTx(db, STORE_CHECKS, 'readwrite', (st) =>
      st.add({
        meta: { ...meta },
        ...files,
        queuedAt: Date.now(),
        kind: 'machine_check',
      })
    )
  } finally {
    db.close()
  }
  notifyQueueChanged()
}

/** Export «pendingCheckMetas»: API pública de este módulo. Henry Stark Desarrollador */
export async function pendingCheckMetas() {
  const db = await openDB()
  try {
    const items = await dbGetAll(db, STORE_CHECKS)
    return items.map((it) => ({
      ...it.meta,
      queuedAt: it.queuedAt,
      hasPhoto: !!(it.fileBlob?.size || it.fileB64),
      fileSize: it.fileSize || it.fileBlob?.size || 0,
    }))
  } finally {
    db.close()
  }
}

/** Encola cierre de actividad de turno (compat) */
export async function enqueueActivity(meta, file) {
  const db = await openDB()
  try {
    const files = await withFileFields(file)
    await dbTx(db, STORE_ACTIVITIES, 'readwrite', (st) =>
      st.add({ meta, ...files, queuedAt: Date.now() })
    )
  } finally {
    db.close()
  }
  notifyQueueChanged()
}

/**
 * Mutación genérica offline.
 * @param {'db_insert'|'db_update'|'db_upsert'|'storage_upload'} type
 * @param {object} payload
 * @param {File|null} file
 */
/** Export «enqueueMutation»: API pública de este módulo. Henry Stark Desarrollador */
export async function enqueueMutation(type, payload, file = null) {
  const db = await openDB()
  try {
    const files = await withFileFields(file)
    await dbTx(db, STORE_MUTATIONS, 'readwrite', (st) =>
      st.add({ type, payload, ...files, queuedAt: Date.now(), attempts: 0 })
    )
  } finally {
    db.close()
  }
  notifyQueueChanged()
}

/** Subida de archivo a Storage encolada (bucket + path). */
export async function enqueueStorageUpload(bucket, path, file, contentType) {
  return enqueueMutation(
    'storage_upload',
    { bucket, path, contentType: contentType || file?.type || 'application/octet-stream' },
    file
  )
}

/** Export «enqueueInsert»: API pública de este módulo. Henry Stark Desarrollador */
export async function enqueueInsert(table, row) {
  return enqueueMutation('db_insert', { table, row })
}

/** Export «enqueueUpdate»: API pública de este módulo. Henry Stark Desarrollador */
export async function enqueueUpdate(table, id, row, idField = 'id') {
  return enqueueMutation('db_update', { table, id, row, idField })
}

/** Export «enqueueUpsert»: API pública de este módulo. Henry Stark Desarrollador */
export async function enqueueUpsert(table, row, onConflict) {
  return enqueueMutation('db_upsert', { table, row, onConflict })
}

/** Pendientes de mutaciones (para UI optimista) */
export async function pendingMutations(filterType = null) {
  const db = await openDB()
  try {
    let items = await dbGetAll(db, STORE_MUTATIONS)
    if (filterType) items = items.filter((i) => i.type === filterType)
    return items
  } finally {
    db.close()
  }
}

/** Export «pendingCount»: API pública de este módulo. Henry Stark Desarrollador */
export async function pendingCount() {
  try {
    const db = await openDB()
    try {
      const [checks, acts, muts] = await Promise.all([
        dbGetAll(db, STORE_CHECKS),
        dbGetAll(db, STORE_ACTIVITIES),
        dbGetAll(db, STORE_MUTATIONS),
      ])
      return checks.length + acts.length + muts.length
    } finally {
      db.close()
    }
  } catch {
    return 0
  }
}

/**
 * Vacía la cola hacia Supabase.
 * @param {{
 *   uploadCheck: (meta, file) => Promise<{error: string|null}>,
 *   completeActivity: (meta, file) => Promise<{error: string|null}>,
 *   runMutation: (type, payload, file) => Promise<{error: string|null}>,
 * }} handlers
 */
/** Export «flushQueue»: API pública de este módulo. Henry Stark Desarrollador */
export async function flushQueue({ uploadCheck, completeActivity, runMutation }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0, skipped: 'offline' }
  }

  const db = await openDB()
  let synced = 0
  let failed = 0
  const errors = []

  try {
    const checks = await dbGetAll(db, STORE_CHECKS)
    // 1) Reportes reales (con foto / condition ≠ off) antes que "apagada" del mismo slot
    // 2) Luego FIFO por antigüedad
    checks.sort((a, b) => {
      const keyA = `${a.meta?.machineId}|${a.meta?.shiftDate}|${a.meta?.hourSlot}`
      const keyB = `${b.meta?.machineId}|${b.meta?.shiftDate}|${b.meta?.hourSlot}`
      if (keyA === keyB) {
        const aOff = (a.meta?.condition || 'normal') === 'off'
        const bOff = (b.meta?.condition || 'normal') === 'off'
        if (aOff !== bOff) return aOff ? 1 : -1
      }
      return (a.queuedAt || 0) - (b.queuedAt || 0)
    })

    for (const item of checks) {
      try {
        const file = await itemToFile(item)
        const needsPhoto = (item.meta?.condition || 'normal') !== 'off' && !item.meta?.storagePath
        if (needsPhoto && (!file || file.size === 0)) {
          // Foto perdida: no borrar; reintentar no ayudará — marcar fallo visible
          errors.push(`check#${item.id}: foto vacía en cola local`)
          failed++
          continue
        }
        const { error } = await uploadCheck(item.meta, file)
        if (error) throw new Error(error)
        await dbDelete(db, STORE_CHECKS, item.id)
        synced++
      } catch (e) {
        failed++
        errors.push(`check#${item.id}: ${e?.message || e}`)
      }
    }

    const activities = await dbGetAll(db, STORE_ACTIVITIES)
    activities.sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0))
    for (const item of activities) {
      try {
        const file = await itemToFile(item)
        const { error } = await completeActivity(item.meta, file)
        if (error) throw new Error(error)
        await dbDelete(db, STORE_ACTIVITIES, item.id)
        synced++
      } catch (e) {
        failed++
        errors.push(`activity#${item.id}: ${e?.message || e}`)
      }
    }

    const muts = await dbGetAll(db, STORE_MUTATIONS)
    muts.sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0))
    for (const item of muts) {
      try {
        const file = await itemToFile(item)
        const { error } = await runMutation(item.type, item.payload, file)
        if (error) throw new Error(error)
        await dbDelete(db, STORE_MUTATIONS, item.id)
        synced++
      } catch (e) {
        failed++
        errors.push(`mut#${item.id}: ${e?.message || e}`)
      }
    }
  } finally {
    db.close()
  }

  if (synced > 0) notifyQueueChanged()
  return { synced, failed, errors: errors.slice(0, 8) }
}

/** ¿Hay red usable? (navigator.onLine no es 100 % fiable, pero ayuda) */
export function isLikelyOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}
