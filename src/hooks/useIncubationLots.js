/**
 * =============================================================================
 * ARCHIVO: src/hooks/useIncubationLots.js
 * PROPÓSITO: Hook «useIncubationLots»: datos maestros del módulo Datos de gerencia.
 *   - Lotes de huevo (incubation_lots): código, origen, huevos por fecha de postura.
 *   - Llegadas a planta (lot_arrivals): cantidades por fecha que registra recepción.
 *   - Órdenes de clasificación (classification_orders): FIFO por fecha → recepción.
 * CÓMO FUNCIONA: consulta Supabase + Realtime por org, expone loading/error/datos
 *   y funciones mutadoras; deriva bandejas y carros con la config del mapa Petersime.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/image'
import { uniqueChannel } from '../lib/realtimeChannel'
import { EGGS_PER_TRAY, TRAYS_PER_CART, CARTS_PER_MACHINE } from '../lib/loadMapEngine'

/** Huevos por carro lleno = 336 × 16 = 5.376 */
export const EGGS_PER_CART = EGGS_PER_TRAY * TRAYS_PER_CART

/** Suma de huevos incubables de un arreglo de posturas [{ productionDate, eggs }]. */
export function sumEggs(postures) {
  return (postures || []).reduce((s, p) => s + (Number(p?.eggs) || 0), 0)
}

/** Totales derivados de un lote: huevos → bandejas → carros. */
export function lotTotals(postures) {
  const eggs = sumEggs(postures)
  return {
    eggs,
    trays: eggs / EGGS_PER_TRAY,
    carts: eggs / EGGS_PER_CART,
    // Carros "físicos" (un carro parcial ocupa un carro completo)
    fullCarts: Math.ceil(eggs / EGGS_PER_CART),
  }
}

function missingTable(msg) {
  return /does not exist|schema cache|Could not find|relation|PGRST205|column/i.test(String(msg || ''))
}

/* ─── Avance real de la orden de clasificación ────────────────────────────── */

/** Orden de los estados del lote: solo se avanza, nunca se devuelve. */
export const LOT_STATUS_RANK = { planned: 0, arrived: 1, classifying: 2, classified: 3, loaded: 4, closed: 5 }

/** Desde qué estados puede pasar cada transición automática (guarda en la base). */
const LOT_FROM = {
  classified: ['planned', 'arrived', 'classifying'],
  loaded: ['planned', 'arrived', 'classifying', 'classified'],
}
const ORDER_FROM = {
  in_progress: ['published'],
  done: ['published', 'in_progress'],
}

const codeKey = (v) => String(v ?? '').trim().toUpperCase()

/**
 * Cruza una orden de clasificación con los carros registrados.
 *
 * egg_tape_classifications guarda el lote como CÓDIGO de texto (sin lotId), así
 * que el cruce es por código y SOLO con carros registrados desde que se publicó
 * la orden (published_at). Si en la misma orden dos lotes distintos comparten
 * código, ese código queda «ambiguo»: cuenta para el avance de la orden pero no
 * mueve el estado de ninguno de los dos lotes.
 *
 * Un lote está «todo en carros» cuando los huevos de sus carros alcanzan los de
 * la orden con una tolerancia de una bandeja (336) por fecha de postura: cada
 * fecha puede cerrar con una bandeja incompleta.
 *
 * @param {object} order  fila de classification_orders ({ id, status, items, published_at, created_at })
 * @param {object[]} carts carros normalizados (useLoadClassification.entries)
 */
export function orderProgress(order, carts = []) {
  if (!order?.items?.length) return null
  const since = order.published_at || order.created_at || null
  const sinceMs = since ? Date.parse(since) : NaN

  const byCode = new Map()
  for (const it of order.items) {
    const key = codeKey(it.code)
    if (!key) continue
    const row =
      byCode.get(key) ||
      {
        code: String(it.code).trim(),
        lotIds: new Set(),
        isTreated: false,
        items: 0,
        orderEggs: 0,
        classifiedEggs: 0,
        cartIds: new Set(),
        loadedCartIds: new Set(),
      }
    if (it.lotId) row.lotIds.add(it.lotId)
    row.isTreated = row.isTreated || !!it.isTreated
    row.items += 1
    row.orderEggs += Number(it.eggs) || 0
    byCode.set(key, row)
  }

  const orderCartIds = new Set()
  const loadedCartIds = new Set()
  for (const c of carts || []) {
    if (!c) continue
    const t = Date.parse(c.classifiedAt || '')
    if (Number.isFinite(sinceMs) && Number.isFinite(t) && t < sinceMs) continue
    let matched = false
    for (const l of c.lots || []) {
      const row = byCode.get(codeKey(l.lot))
      if (!row) continue
      matched = true
      row.classifiedEggs += Number(l.eggs) || 0
      row.cartIds.add(c.id)
      if (c.status === 'loaded') row.loadedCartIds.add(c.id)
    }
    if (matched) {
      orderCartIds.add(c.id)
      if (c.status === 'loaded') loadedCartIds.add(c.id)
    }
  }

  const lots = [...byCode.values()].map((r) => {
    const tolerance = EGGS_PER_TRAY * r.items
    // Sin carros nunca está «todo en carros»: con fechas de menos de una bandeja la
    // tolerancia superaba lo pedido y el lote quedaba «clasificado» sin un solo carro.
    const fullyClassified = r.orderEggs > 0 && r.cartIds.size > 0 && r.classifiedEggs >= r.orderEggs - tolerance
    const allLoaded = r.cartIds.size > 0 && r.loadedCartIds.size === r.cartIds.size
    return {
      code: r.code,
      lotId: r.lotIds.size === 1 ? [...r.lotIds][0] : null,
      ambiguous: r.lotIds.size > 1,
      isTreated: r.isTreated,
      orderEggs: r.orderEggs,
      classifiedEggs: r.classifiedEggs,
      carts: r.cartIds.size,
      loadedCarts: r.loadedCartIds.size,
      fullyClassified,
      allLoaded,
    }
  })

  const carts_ = orderCartIds.size
  return {
    orderId: order.id,
    status: order.status,
    since,
    lots,
    carts: carts_,
    loadedCarts: loadedCartIds.size,
    started: carts_ > 0,
    allClassified: lots.length > 0 && lots.every((l) => l.fullyClassified),
    allLoaded: carts_ > 0 && loadedCartIds.size === carts_,
    ambiguousCodes: lots.filter((l) => l.ambiguous).map((l) => l.code),
  }
}

/**
 * Qué cambios de estado tocan según el avance (solo hacia adelante):
 *   - orden publicada con al menos un carro → 'in_progress';
 *   - orden con todos sus lotes en carros y todos esos carros en mapas
 *     completados (carro 'loaded') → 'done';
 *   - lote con todos sus huevos de la orden en carros → 'classified';
 *   - lote además con todos sus carros cargados → 'loaded'.
 * @param {object} order
 * @param {ReturnType<typeof orderProgress>} progress
 * @param {object[]} lots filas de incubation_lots ({ id, code, status })
 */
export function planOrderTransitions(order, progress, lots = []) {
  const plan = { order: null, lots: [] }
  if (!order || !progress) return plan

  if (['published', 'in_progress'].includes(order.status) && progress.started) {
    if (progress.allClassified && progress.allLoaded) {
      plan.order = { id: order.id, from: order.status, to: 'done' }
    } else if (order.status === 'published') {
      plan.order = { id: order.id, from: order.status, to: 'in_progress' }
    }
  }

  const byId = new Map((lots || []).map((l) => [l.id, l]))
  for (const row of progress.lots) {
    if (row.ambiguous || !row.lotId || !row.fullyClassified) continue
    const lot = byId.get(row.lotId)
    if (!lot) continue
    const rank = LOT_STATUS_RANK[lot.status]
    if (rank == null) continue
    const to = row.allLoaded ? 'loaded' : 'classified'
    if (rank < LOT_STATUS_RANK[to]) {
      plan.lots.push({ id: lot.id, code: lot.code || row.code, from: lot.status, to })
    }
  }
  return plan
}

/** Export «useIncubationLots»: API pública de este módulo. Henry Stark Desarrollador */
export function useIncubationLots(orgId, userId) {
  const [lots, setLots] = useState([])
  const [arrivals, setArrivals] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    const [l, a, o] = await Promise.all([
      supabase
        .from('incubation_lots')
        .select(
          'id, code, origin, postures, is_treated, expected_arrival_date, status, priority, notes, created_by, created_at, updated_at',
        )
        .eq('org_id', orgId)
        .order('priority', { ascending: false })
        .order('expected_arrival_date', { ascending: true, nullsFirst: false })
        .limit(500),
      supabase
        .from('lot_arrivals')
        .select('id, lot_id, lot_code, arrived_at, received_postures, seal_number, notes, received_by, created_at')
        .eq('org_id', orgId)
        .order('arrived_at', { ascending: false })
        .limit(300),
      supabase
        .from('classification_orders')
        .select('id, status, items, machine_hint, group_count, notes, created_by, published_at, created_at, updated_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    if (l.error) {
      setError(
        missingTable(l.error.message)
          ? 'Faltan las tablas del módulo Datos en Supabase. Ejecute supabase_migration_datos_center.sql.'
          : l.error.message,
      )
    } else {
      setLots(l.data ?? [])
    }
    if (!a.error) setArrivals(a.data ?? [])
    if (!o.error) setOrders(o.data ?? [])
    setLoading(false)
  }, [orgId])

  // Ref para que la suscripción siempre llame a la versión más reciente de loadAll
  // sin necesidad de re-suscribirse cada vez que loadAll cambia de identidad.
  const loadAllRef = useRef(loadAll)
  useEffect(() => {
    loadAllRef.current = loadAll
  }, [loadAll])

  // Carga inicial cuando cambia orgId
  useEffect(() => {
    if (!orgId) return
    loadAll()
  }, [orgId, loadAll])

  // Suscripción Realtime: sólo depende de orgId para evitar
  // crear/destruir el canal cada vez que loadAll cambia.
  useEffect(() => {
    if (!orgId) return
    const ch = supabase
      .channel(uniqueChannel(`incu-lots:${orgId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incubation_lots',
          filter: `org_id=eq.${orgId}`,
        },
        () => loadAllRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lot_arrivals',
          filter: `org_id=eq.${orgId}`,
        },
        () => loadAllRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classification_orders',
          filter: `org_id=eq.${orgId}`,
        },
        () => loadAllRef.current(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orgId])

  /** Normaliza posturas de la UI a [{ productionDate, eggs }] con eggs numérico ≥ 0. */
  const cleanPostures = useCallback((postures) => {
    return (postures || [])
      .map((p) => ({
        productionDate: p.productionDate || null,
        eggs: p.eggs === '' || p.eggs == null ? 0 : Math.max(0, Number(p.eggs) || 0),
      }))
      .filter((p) => p.productionDate && p.eggs > 0)
  }, [])

  const createLot = useCallback(
    async ({ code, origin, postures, isTreated, expectedArrivalDate, priority, notes }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      const cleanCode = String(code || '').trim()
      if (!cleanCode) return { error: 'El código del lote es obligatorio' }
      const cp = cleanPostures(postures)
      if (!cp.length && !isTreated) {
        return {
          error: 'Agregue al menos una fecha de postura con cantidad de huevos',
        }
      }
      const row = {
        org_id: orgId,
        code: cleanCode,
        origin: origin?.trim() || null,
        postures: cp,
        is_treated: !!isTreated,
        expected_arrival_date: expectedArrivalDate || null,
        priority: Number(priority) || 0,
        notes: notes?.trim() || null,
        created_by: userId,
        status: 'planned',
      }
      const { data, error: err } = await supabase.from('incubation_lots').insert(row).select().single()
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      setLots((list) => [data, ...list])
      return { error: null, lot: data }
    },
    [orgId, userId, cleanPostures],
  )

  const updateLot = useCallback(
    async (id, patch) => {
      if (!id) return { error: 'Lote inválido' }
      const dbPatch = { updated_at: new Date().toISOString() }
      if (patch.code !== undefined) dbPatch.code = String(patch.code || '').trim()
      if (patch.origin !== undefined) dbPatch.origin = patch.origin?.trim() || null
      if (patch.postures !== undefined) dbPatch.postures = cleanPostures(patch.postures)
      if (patch.isTreated !== undefined) dbPatch.is_treated = !!patch.isTreated
      if (patch.expectedArrivalDate !== undefined) {
        dbPatch.expected_arrival_date = patch.expectedArrivalDate || null
      }
      if (patch.priority !== undefined) dbPatch.priority = Number(patch.priority) || 0
      if (patch.notes !== undefined) dbPatch.notes = patch.notes?.trim() || null
      if (patch.status !== undefined) dbPatch.status = patch.status

      setLots((list) => list.map((l) => (l.id === id ? { ...l, ...dbPatch } : l)))
      const { error: err } = await supabase.from('incubation_lots').update(dbPatch).eq('id', id)
      if (err) {
        setError(err.message)
        await loadAll()
        return { error: err.message }
      }
      return { error: null }
    },
    [cleanPostures, loadAll],
  )

  const deleteLot = useCallback(
    async (id) => {
      setLots((list) => list.filter((l) => l.id !== id))
      const { error: err } = await supabase.from('incubation_lots').delete().eq('id', id)
      if (err) {
        setError(err.message)
        await loadAll()
        return { error: err.message }
      }
      return { error: null }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [loadAll],
  )

  /**
   * Recepción registra la llegada: fecha automática (arrived_at) + cantidades de
   * huevo por fecha de postura. Marca el lote como 'arrived'.
   */
  const registerArrival = useCallback(
    async ({ lotId, lotCode, receivedPostures, sealNumber, notes, photos = [] }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      const cp = cleanPostures(receivedPostures)
      if (!cp.length) {
        return {
          error: 'Ingrese la cantidad de huevos por fecha de al menos una postura',
        }
      }
      // Fotos de la llegada (camión, precinto, estado del huevo) al bucket de la empresa.
      const photoPaths = []
      for (const [i, file] of photos.filter(Boolean).entries()) {
        let photo = file
        try {
          if (photo.size > 900_000) photo = await compressImage(photo, 1280, 0.7)
        } catch {
          /* usar original */
        }
        const path = `${orgId}/lot-arrivals/${Date.now()}-${i}.jpg`
        const { error: upErr } = await supabase.storage.from('machine-checks').upload(path, photo, {
          contentType: photo.type || 'image/jpeg',
          upsert: false,
        })
        if (upErr) {
          if (photoPaths.length) await supabase.storage.from('machine-checks').remove(photoPaths)
          return { error: `No se pudo subir la foto: ${upErr.message}` }
        }
        photoPaths.push(path)
      }
      const row = {
        org_id: orgId,
        lot_id: lotId || null,
        lot_code: lotCode?.trim() || null,
        received_postures: cp,
        seal_number: sealNumber?.trim() || null,
        notes: notes?.trim() || null,
        received_by: userId,
      }
      if (photoPaths.length) row.photo_paths = photoPaths
      let { data, error: err } = await supabase.from('lot_arrivals').insert(row).select().single()
      if (err && photoPaths.length && /photo_paths/.test(err.message || '')) {
        // Servidor sin la migración 20260929: se guarda la llegada sin la lista de fotos.
        delete row.photo_paths
        ;({ data, error: err } = await supabase.from('lot_arrivals').insert(row).select().single())
      }
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      setArrivals((list) => [data, ...list])
      if (lotId) {
        await supabase
          .from('incubation_lots')
          .update({ status: 'arrived', updated_at: new Date().toISOString() })
          .eq('id', lotId)
          .eq('status', 'planned')
      }
      return { error: null, arrival: data }
    },
    [orgId, userId, cleanPostures],
  )

  /**
   * Deriva la orden de clasificación de los lotes planned/arrived:
   * una entrada por (lote, fecha de postura), ordenada FIFO (fecha más vieja
   * primero). Calcula bandejas y carros por entrada y el nº de grupos de 12.
   */
  const buildClassificationOrder = useCallback(
    (statuses = ['planned', 'arrived']) => {
      const items = []
      for (const lot of lots) {
        if (!statuses.includes(lot.status)) continue
        for (const p of lot.postures || []) {
          const eggs = Number(p?.eggs) || 0
          if (eggs <= 0) continue
          items.push({
            lotId: lot.id,
            code: lot.code,
            origin: lot.origin || null,
            isTreated: !!lot.is_treated,
            productionDate: p.productionDate || null,
            eggs,
            trays: eggs / EGGS_PER_TRAY,
            carts: eggs / EGGS_PER_CART,
          })
        }
      }
      // FIFO: fecha de postura más vieja primero (huevo más viejo se clasifica antes).
      items.sort((a, b) => {
        const da = a.productionDate || '9999-12-31'
        const db = b.productionDate || '9999-12-31'
        return da < db ? -1 : da > db ? 1 : 0
      })
      const totalEggs = items.reduce((s, i) => s + i.eggs, 0)
      const totalCarts = Math.ceil(totalEggs / EGGS_PER_CART)
      const groupCount = Math.ceil(totalCarts / CARTS_PER_MACHINE)
      return {
        items,
        totalEggs,
        totalTrays: totalEggs / EGGS_PER_TRAY,
        totalCarts,
        groupCount,
      }
    },
    [lots],
  )

  /**
   * Publica la orden de clasificación (status published) y notifica a recepción.
   * Marca los lotes involucrados como 'classifying'.
   */
  const publishClassificationOrder = useCallback(
    async ({ items, machineHint, notes } = {}) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      const built = items ? { items } : buildClassificationOrder()
      const list = items || built.items
      if (!list?.length) {
        return {
          error: 'No hay lotes con posturas para clasificar. Registre lotes primero.',
        }
      }
      const totalEggs = list.reduce((s, i) => s + (Number(i.eggs) || 0), 0)
      const totalCarts = Math.ceil(totalEggs / EGGS_PER_CART)
      const groupCount = Math.ceil(totalCarts / CARTS_PER_MACHINE)

      const { data, error: err } = await supabase
        .from('classification_orders')
        .insert({
          org_id: orgId,
          status: 'published',
          items: list,
          machine_hint: machineHint?.trim() || null,
          group_count: groupCount,
          notes: notes?.trim() || null,
          created_by: userId,
          published_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      setOrders((o) => [data, ...o])

      // Marcar lotes de la orden como en clasificación
      const lotIds = [...new Set(list.map((i) => i.lotId).filter(Boolean))]
      if (lotIds.length) {
        await supabase
          .from('incubation_lots')
          .update({
            status: 'classifying',
            updated_at: new Date().toISOString(),
          })
          .in('id', lotIds)
          .in('status', ['planned', 'arrived'])
      }

      // Notificar a recepción / turno
      try {
        const lotCount = lotIds.length
        await supabase.from('notifications').insert({
          org_id: orgId,
          title: 'Orden de clasificación publicada',
          body: `${lotCount} lote${lotCount === 1 ? '' : 's'} · ${totalEggs.toLocaleString('es-CO')} huevos · ${totalCarts} carros (${groupCount} grupo${groupCount === 1 ? '' : 's'} de 12). Clasificar en orden FIFO.`,
          kind: 'classification_order',
          created_by: userId,
        })
      } catch {
        /* la notificación no debe bloquear la publicación */
      }
      return { error: null, order: data }
    },
    [orgId, userId, buildClassificationOrder],
  )

  const cancelOrder = useCallback(async (orderId) => {
    setOrders((o) => o.map((x) => (x.id === orderId ? { ...x, status: 'cancelled' } : x)))
    const { error: err } = await supabase
      .from('classification_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  /**
   * Aplica en la base el plan de planOrderTransitions. Cada cambio va con guarda
   * de estado (`.in('status', …)`): si otro equipo ya lo movió, no se pisa.
   * Devuelve { applied: [...textos], errors: [...textos] } en español; los
   * errores NO se tragan: la pantalla los muestra.
   */
  const applyOrderTransitions = useCallback(
    async (plan) => {
      const applied = []
      const errors = []
      if (!plan) return { applied, errors }
      const now = new Date().toISOString()
      const ORDER_TEXT = { in_progress: 'en clasificación', done: 'terminada' }
      const LOT_TEXT = { classified: 'clasificado', loaded: 'cargado' }
      let needsReload = false

      if (plan.order) {
        const { id, to } = plan.order
        const { data, error: err } = await supabase
          .from('classification_orders')
          .update({ status: to, updated_at: now })
          .eq('id', id)
          .in('status', ORDER_FROM[to] || [])
          .select('id')
        if (err) {
          errors.push(`No se pudo marcar la orden del día como ${ORDER_TEXT[to] || to}: ${err.message}`)
        } else if (data?.length) {
          applied.push(`Orden del día: ${ORDER_TEXT[to] || to}`)
          setOrders((list) => list.map((o) => (o.id === id ? { ...o, status: to, updated_at: now } : o)))
        } else {
          // Otro equipo ya la movió (o la anularon): se relee en vez de suponer.
          needsReload = true
        }
      }

      for (const ch of plan.lots || []) {
        const { data, error: err } = await supabase
          .from('incubation_lots')
          .update({ status: ch.to, updated_at: now })
          .eq('id', ch.id)
          .in('status', LOT_FROM[ch.to] || [])
          .select('id')
        if (err) {
          errors.push(`No se pudo marcar el lote ${ch.code} como ${LOT_TEXT[ch.to] || ch.to}: ${err.message}`)
          continue
        }
        if (!data?.length) {
          needsReload = true
          continue
        }
        applied.push(`Lote ${ch.code}: ${LOT_TEXT[ch.to] || ch.to}`)
        setLots((list) => list.map((l) => (l.id === ch.id ? { ...l, status: ch.to, updated_at: now } : l)))
      }

      if (needsReload) await loadAll()
      return { applied, errors }
    },
    [loadAll],
  )

  /** Órdenes publicadas activas (lo que recepción debe clasificar hoy). */
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status === 'published' || o.status === 'in_progress'),
    [orders],
  )

  return {
    lots,
    arrivals,
    orders,
    activeOrders,
    loading,
    error,
    reload: loadAll,
    createLot,
    updateLot,
    deleteLot,
    registerArrival,
    buildClassificationOrder,
    publishClassificationOrder,
    cancelOrder,
    applyOrderTransitions,
    // constantes de conversión para la UI
    eggsPerTray: EGGS_PER_TRAY,
    traysPerCart: TRAYS_PER_CART,
    cartsPerMachine: CARTS_PER_MACHINE,
    eggsPerCart: EGGS_PER_CART,
  }
}
