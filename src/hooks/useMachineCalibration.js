/**
 * Calibración de máquinas: OT automáticas + registro con 2 fotos
 * (calibrador + pantalla).
 *
 * Henry Stark Desarrollador · CDH Maker
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/image'
import { isNetworkError, isOnline } from '../lib/network'
import { enqueueInsert, enqueueStorageUpload, enqueueUpdate } from '../lib/offlineQueue'
import {
  CALIB_SOURCE,
  CALIB_REASON,
  CALIB_SCOPE,
  buildCalibDescription,
  buildCalibTitle,
  canManageMachineState,
  canPerformCalibration,
  formatCalibReadings,
  incCalibrationWindow,
  isHatcherType,
  isIncubatorType,
  parseCalibReason,
  validateCalibReadings,
} from '../lib/machineCalibration'

// Fotos de la calibración. Van a wo-evidence (evidencia de la OT); si ese depósito falla
// (el 30-09-2026 el servidor devolvía una página en vez de guardar la foto y la nacedora
// calibrada no se podía registrar), se guardan en machine-checks, el mismo de las rondas.
// El formato FOMAT08, el expediente y el centro de activos ya leen de los dos.
// La fila de evidencia de la OT no frena la calibración si no se puede guardar.
async function uploadWoPhoto(orgId, workOrderId, userId, file, note) {
  const safe = (file.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
  const path = `${orgId}/${workOrderId}/${Date.now()}-${safe}`
  const opts = { contentType: file.type || 'image/jpeg', upsert: false }
  const dup = (e) => /already exists|Duplicate|409/i.test(e?.message || '')
  let bucket = 'wo-evidence'
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, opts)
  if (upErr && !dup(upErr)) {
    const alt = await supabase.storage.from('machine-checks').upload(path, file, opts)
    if (alt.error && !dup(alt.error)) {
      return { error: `No se pudo subir la foto: ${upErr.message}` }
    }
    bucket = 'machine-checks'
  }
  if (bucket === 'wo-evidence') {
    const { error: insErr } = await supabase.from('wo_evidence').insert({
      org_id: orgId,
      work_order_id: workOrderId,
      uploaded_by: userId || null,
      file_path: path,
      file_name: file.name || 'photo.jpg',
      file_type: 'image',
      note: note || null,
    })
    if (insErr) console.warn('[calibración] evidencia de la OT sin registrar:', insErr.message)
  }
  return { error: null, path, bucket }
}

/**
 * Hook de calibración de incubadoras y nacedoras.
 */
export function useMachineCalibration(orgId, userId, { role } = {}) {
  const [orders, setOrders] = useState([])
  const [machines, setMachines] = useState([])
  const [plants, setPlants] = useState([])
  const [reports, setReports] = useState([])
  const [evidenceByWo, setEvidenceByWo] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)

  const canPerform = canPerformCalibration(role)
  const canManage = canManageMachineState(role)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [o, p] = await Promise.all([
      supabase
        .from('work_orders')
        .select(
          'id, code, title, description, type, priority, status, source, machine_id, plant_id, room_id, assigned_to, created_by, created_at, completed_at, resolution'
        )
        .eq('org_id', orgId)
        .eq('source', CALIB_SOURCE)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('name'),
    ])
    // Si la columna source no existe o el filtro falla, intentar por título
    let orderRows = []
    if (o.error) {
      const fallback = await supabase
        .from('work_orders')
        .select(
          'id, code, title, description, type, priority, status, source, machine_id, plant_id, room_id, assigned_to, created_by, created_at, completed_at, resolution'
        )
        .eq('org_id', orgId)
        .ilike('title', 'Calibración%')
        .order('created_at', { ascending: false })
        .limit(200)
      if (fallback.error) setError(fallback.error.message)
      else {
        orderRows = fallback.data ?? []
        setError(null)
      }
    } else {
      orderRows = o.data ?? []
      setError(null)
    }
    setOrders(orderRows)
    const plantList = p.data ?? []
    setPlants(plantList)
    const plantIds = plantList.map((x) => x.id)
    if (plantIds.length) {
      const { data: mData } = await supabase
        .from('machines')
        .select('id, plant_id, room_id, name, code, type, status')
        .in('plant_id', plantIds)
      setMachines(mData ?? [])
    } else {
      setMachines([])
    }

    // Reportes de calibración (tabla dedicada) + evidencias de OT
    let calibRows = []
    const cRes = await supabase
      .from('machine_calibrations')
      .select(
        'id, org_id, plant_id, machine_id, work_order_id, performed_by, scope, reason, temp_machine_f, temp_calibrator_f, temp_delta_f, rh_machine_pct, rh_calibrator_pct, rh_delta_pct, notes, photo_calibrator_path, photo_screen_path, calibrated_at, created_at'
      )
      .eq('org_id', orgId)
      .order('calibrated_at', { ascending: false })
      .limit(150)
    if (!cRes.error) {
      calibRows = cRes.data ?? []
      // Responsable: solo los suyos; líderes: todos
      if (!canManageMachineState(role)) {
        calibRows = calibRows.filter((r) => r.performed_by === userId)
      }
      setReports(calibRows)
    } else {
      setReports([])
    }

    const woIds = [
      ...new Set(
        [
          ...orderRows.map((x) => x.id),
          ...calibRows.map((x) => x.work_order_id).filter(Boolean),
        ].filter(Boolean)
      ),
    ]
    if (woIds.length) {
      const eRes = await supabase
        .from('wo_evidence')
        .select('id, work_order_id, file_path, file_name, file_type, note, uploaded_by, created_at')
        .eq('org_id', orgId)
        .in('work_order_id', woIds.slice(0, 80))
      if (!eRes.error) {
        const map = {}
        for (const e of eRes.data || []) {
          if (!map[e.work_order_id]) map[e.work_order_id] = []
          map[e.work_order_id].push(e)
        }
        setEvidenceByWo(map)
      }
    } else {
      setEvidenceByWo({})
    }

    setLoading(false)
  }, [orgId, userId, role])

  useEffect(() => {
    if (!orgId) return
    loadAll()
    const channel = supabase
      .channel(`calib-wo:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders', filter: `org_id=eq.${orgId}` },
        () => loadAll()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, loadAll])

  /**
   * OT de calibración abierta para la máquina.
   * `sinceIso` acota la búsqueda al ciclo vigente: una OT emitida en un ciclo
   * anterior quedó obsoleta y no debe bloquear la ventana del ciclo actual.
   */
  const openForMachine = useCallback(
    (machineId, sinceIso = null) =>
      orders.find(
        (o) =>
          o.machine_id === machineId &&
          (o.status === 'open' || o.status === 'in_progress') &&
          (!sinceIso || !o.created_at || new Date(o.created_at) >= new Date(sinceIso))
      ),
    [orders]
  )

  /**
   * Crea OT de calibración si no hay una abierta para la máquina (+ razón).
   * Queda sin asignar para que la tome cualquier operario / aux. mantenimiento / líder.
   */
  const ensureCalibrationOrder = useCallback(
    async (machine, reason, extra = '', { cycleStartAt = null } = {}) => {
      if (!orgId || !userId || !machine?.id) return { error: 'Datos incompletos', created: false }
      if (machine.status === 'decommissioned') return { error: null, created: false }

      const existing = openForMachine(machine.id, cycleStartAt)
      if (existing) {
        // Ya hay una abierta de este mismo ciclo: no duplicar
        return { error: null, created: false, id: existing.id, code: existing.code }
      }

      // Doble chequeo en BD (race / otra pestaña)
      let q = supabase
        .from('work_orders')
        .select('id, code')
        .eq('org_id', orgId)
        .eq('machine_id', machine.id)
        .in('status', ['open', 'in_progress'])
        .or(`source.eq.${CALIB_SOURCE},title.ilike.Calibración%`)
      // Una OT de un ciclo anterior no bloquea: esa ventana ya venció
      if (cycleStartAt) q = q.gte('created_at', cycleStartAt)
      const { data: remote } = await q.limit(1)
      if (remote?.length) {
        return { error: null, created: false, id: remote[0].id, code: remote[0].code }
      }

      const row = {
        org_id: orgId,
        plant_id: machine.plant_id || null,
        machine_id: machine.id,
        room_id: machine.room_id || null,
        location_type: 'plant',
        title: buildCalibTitle(machine, reason),
        description: buildCalibDescription(machine, reason, extra),
        type: 'inspection',
        priority: reason === CALIB_REASON.inc_window ? 'high' : 'medium',
        source: CALIB_SOURCE,
        assigned_to: null,
        created_by: userId,
      }

      const { data, error: err } = await supabase
        .from('work_orders')
        .insert(row)
        .select('id, code')
        .single()

      if (err) {
        if (isNetworkError(err.message) || !isOnline()) {
          await enqueueInsert('work_orders', row)
          return { error: null, created: true, offline: true }
        }
        // source puede no estar en check constraint — reintentar sin source si falla
        if (/source|check|constraint|invalid/i.test(err.message || '')) {
          const { source: _s, ...rest } = row
          const retry = await supabase.from('work_orders').insert(rest).select('id, code').single()
          if (retry.error) return { error: retry.error.message, created: false }
          return { error: null, created: true, id: retry.data.id, code: retry.data.code }
        }
        return { error: err.message, created: false }
      }

      // Notificación para planta / mantenimiento
      try {
        await supabase.from('notifications').insert({
          org_id: orgId,
          title: `OT calibración · ${machine.code || machine.name}`,
          body: buildCalibTitle(machine, reason),
          kind: 'ot',
          created_by: userId,
        })
      } catch {
        /* opcional */
      }

      return { error: null, created: true, id: data.id, code: data.code }
    },
    [orgId, userId, openForMachine]
  )

  /** INC en ventana 36–60 h → OT de calibración. */
  const ensureIncWindowOrders = useCallback(async () => {
    if (!orgId || !userId) return { created: 0 }
    setGenerating(true)
    try {
      const { data: loads, error: lErr } = await supabase
        .from('setter_loads')
        .select('id, machine_id, lote, cycle_start_at, loaded_at, plant_id')
        .eq('org_id', orgId)
        .order('loaded_at', { ascending: false })
        .limit(300)
      if (lErr) return { created: 0, error: lErr.message }

      // Solo el cargue más reciente por máquina (ciclo activo)
      const latestByMachine = new Map()
      for (const l of loads || []) {
        if (!l.machine_id) continue
        if (!latestByMachine.has(l.machine_id)) latestByMachine.set(l.machine_id, l)
      }

      let created = 0
      for (const [machineId, load] of latestByMachine) {
        const start = load.cycle_start_at || load.loaded_at
        const win = incCalibrationWindow(start)
        if (!win.inWindow) continue
        const machine = machines.find((m) => m.id === machineId)
        if (!machine || !isIncubatorType(machine.type)) continue
        // Si la máquina ya no está en incubación, saltar
        if (machine.status === 'decommissioned') continue
        const res = await ensureCalibrationOrder(
          machine,
          CALIB_REASON.inc_window,
          `Lote ${load.lote || '—'} · edad ${win.label}`,
          { cycleStartAt: start }
        )
        if (res.created) created++
      }
      if (created > 0) await loadAll()
      return { created }
    } finally {
      setGenerating(false)
    }
  }, [orgId, userId, machines, ensureCalibrationOrder, loadAll])

  /** Nacedoras de unas salas: post-nacimiento o pre-transferencia. */
  const ensureHatcherOrdersForRooms = useCallback(
    async (roomIds, reason, extra = '') => {
      if (!orgId || !userId) return { created: 0 }
      const rooms = (roomIds || []).filter(Boolean)
      if (!rooms.length) return { created: 0 }

      // Preferir máquinas ya cargadas en estado; si aún no, consultar
      let list = machines.filter(
        (m) => rooms.includes(m.room_id) && isHatcherType(m.type) && m.status !== 'decommissioned'
      )
      if (list.length === 0) {
        const { data } = await supabase
          .from('machines')
          .select('id, plant_id, room_id, name, code, type, status')
          .in('room_id', rooms)
        list = (data || []).filter((m) => isHatcherType(m.type) && m.status !== 'decommissioned')
      }

      let created = 0
      for (const machine of list) {
        const res = await ensureCalibrationOrder(machine, reason, extra)
        if (res.created) created++
      }
      if (created > 0) await loadAll()
      return { created }
    },
    [orgId, userId, machines, ensureCalibrationOrder, loadAll]
  )

  /**
   * INC listas para transferir (≥10 d de ciclo, aún sin transferencia del lote):
   * genera OT de calibración en nacedoras de la misma planta (antes de transferir).
   */
  const ensurePreTransferOrders = useCallback(async () => {
    if (!orgId || !userId) return { created: 0 }
    const MIN_TRANSFER_HOURS = 10 * 24
    try {
      const [{ data: loads }, { data: transfers }] = await Promise.all([
        supabase
          .from('setter_loads')
          .select('id, plant_id, machine_id, lote, cycle_start_at, loaded_at, batch_id')
          .eq('org_id', orgId)
          .order('loaded_at', { ascending: false })
          .limit(300),
        supabase.from('transfers').select('lote, batch_id').eq('org_id', orgId).limit(400),
      ])
      const transferredLotes = new Set(
        (transfers || []).map((t) => String(t.lote || '').trim().toLowerCase()).filter(Boolean)
      )
      const plantsNeeding = new Set()
      // Inicio del ciclo más reciente que motiva la transferencia: acota la
      // ventana para que una OT de una transferencia anterior no la bloquee.
      let cycleStartAt = null
      for (const l of loads || []) {
        const start = l.cycle_start_at || l.loaded_at
        if (!start) continue
        const hours = (Date.now() - new Date(start).getTime()) / 3_600_000
        if (hours < MIN_TRANSFER_HOURS) continue
        const key = String(l.lote || '').trim().toLowerCase()
        if (key && transferredLotes.has(key)) continue
        if (l.plant_id) plantsNeeding.add(l.plant_id)
        if (!cycleStartAt || new Date(start) > new Date(cycleStartAt)) cycleStartAt = start
      }
      if (!plantsNeeding.size) return { created: 0 }

      let created = 0
      const hatchers = machines.filter(
        (m) =>
          plantsNeeding.has(m.plant_id) &&
          isHatcherType(m.type) &&
          m.status !== 'decommissioned'
      )
      for (const machine of hatchers) {
        const res = await ensureCalibrationOrder(
          machine,
          CALIB_REASON.pre_transfer,
          'Ventana de transferencia: calibrar nacedora antes de recibir huevo',
          { cycleStartAt }
        )
        if (res.created) created++
      }
      if (created > 0) await loadAll()
      return { created }
    } catch {
      return { created: 0 }
    }
  }, [orgId, userId, machines, ensureCalibrationOrder, loadAll])

  /**
   * Anula las OT de calibración que quedaron abiertas de ciclos ya superados.
   * Sin esto una OT vieja bloquea para siempre la ventana de esa máquina: la
   * comprobación «¿ya hay una abierta?» la encuentra ciclo tras ciclo y nunca
   * se emite la siguiente.
   */
  const expireStaleCalibrationOrders = useCallback(async () => {
    if (!orgId || !userId) return { expired: 0 }
    const CICLO_COMPLETO_MS = 21 * 24 * 3_600_000
    try {
      const [{ data: abiertas }, { data: loads }] = await Promise.all([
        supabase
          .from('work_orders')
          .select('id, code, machine_id, created_at')
          .eq('org_id', orgId)
          .eq('source', CALIB_SOURCE)
          .in('status', ['open', 'in_progress']),
        supabase
          .from('setter_loads')
          .select('machine_id, cycle_start_at, loaded_at')
          .eq('org_id', orgId)
          .order('loaded_at', { ascending: false })
          .limit(300),
      ])
      if (!abiertas?.length) return { expired: 0 }

      const ultimoCiclo = new Map()
      for (const l of loads || []) {
        if (!l.machine_id || ultimoCiclo.has(l.machine_id)) continue
        ultimoCiclo.set(l.machine_id, l.cycle_start_at || l.loaded_at)
      }

      const vencidas = (abiertas || []).filter((o) => {
        if (!o.created_at) return false
        const emitida = new Date(o.created_at).getTime()
        const ciclo = ultimoCiclo.get(o.machine_id)
        // Emitida antes del ciclo vigente → pertenece a un ciclo anterior
        if (ciclo && emitida < new Date(ciclo).getTime()) return true
        // Sin ciclo posterior, pero más vieja que un ciclo completo
        return Date.now() - emitida > CICLO_COMPLETO_MS
      })
      if (!vencidas.length) return { expired: 0 }

      const { error: err } = await supabase
        .from('work_orders')
        .update({
          status: 'cancelled',
          resolution:
            'Ventana de calibración vencida — el ciclo al que correspondía ya terminó. ' +
            'Anulada automáticamente para liberar la emisión de la siguiente ventana.',
          completed_at: new Date().toISOString(),
        })
        .in('id', vencidas.map((o) => o.id))
      if (err) return { expired: 0, error: err.message }

      await loadAll()
      return { expired: vencidas.length, codes: vencidas.map((o) => o.code) }
    } catch (e) {
      return { expired: 0, error: e?.message }
    }
  }, [orgId, userId, loadAll])

  /**
   * Ejecuta calibración de 1 o 2 sensores (T°F / HR%) con 2 fotos.
   * Guarda fila en machine_calibrations + evidencia en OT + cierra OT.
   */
  const submitCalibration = useCallback(
    async ({
      machineId,
      scope = CALIB_SCOPE.both,
      tempMachineF,
      tempCalibratorF,
      rhMachinePct,
      rhCalibratorPct,
      calibratorFile,
      screenFile,
      notes,
      reason,
    }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!machineId) return { error: 'Selecciona la máquina' }
      if (!calibratorFile) return { error: 'Foto del calibrador obligatoria' }
      if (!screenFile) return { error: 'Foto de la pantalla de la máquina obligatoria' }

      const valErr = validateCalibReadings({
        scope,
        tempMachineF,
        tempCalibratorF,
        rhMachinePct,
        rhCalibratorPct,
      })
      if (valErr) return { error: valErr }
      setError(null)

      const machine = machines.find((m) => m.id === machineId)
      if (!machine) return { error: 'Máquina no encontrada' }

      let order = openForMachine(machineId)
      let orderId = order?.id
      const why = reason || CALIB_REASON.manual

      if (!orderId) {
        const res = await ensureCalibrationOrder(machine, why, notes || '')
        if (res.error) return { error: res.error }
        orderId = res.id
        if (!orderId) {
          return {
            error:
              'OT creada en cola offline. Cuando haya red, abra de nuevo y adjunte las fotos a la OT de calibración.',
          }
        }
      }

      const num = (v) => (v === '' || v == null ? null : Number(v))
      const tm = scope === CALIB_SCOPE.humidity ? null : num(tempMachineF)
      const tc = scope === CALIB_SCOPE.humidity ? null : num(tempCalibratorF)
      const hm = scope === CALIB_SCOPE.temperature ? null : num(rhMachinePct)
      const hc = scope === CALIB_SCOPE.temperature ? null : num(rhCalibratorPct)
      const tempDelta = tm != null && tc != null ? Math.round((tc - tm) * 100) / 100 : null
      const rhDelta = hm != null && hc != null ? Math.round((hc - hm) * 100) / 100 : null

      let calPhoto = calibratorFile
      let scrPhoto = screenFile
      try {
        if (calPhoto.size > 900_000) calPhoto = await compressImage(calPhoto, 1280, 0.7)
        if (scrPhoto.size > 900_000) scrPhoto = await compressImage(scrPhoto, 1280, 0.7)
      } catch {
        /* */
      }

      const readingsLine = formatCalibReadings({
        scope,
        temp_machine_f: tm,
        temp_calibrator_f: tc,
        temp_delta_f: tempDelta,
        rh_machine_pct: hm,
        rh_calibrator_pct: hc,
        rh_delta_pct: rhDelta,
      })
      const resolution =
        notes?.trim() ||
        `Calibración ${scope}: ${readingsLine}. Evidencia calibrador + pantalla.`

      if (!isOnline()) {
        const ts = Date.now()
        const pathCal = `${orgId}/${orderId}/${ts}-calibrador.jpg`
        const pathScr = `${orgId}/${orderId}/${ts + 1}-pantalla.jpg`
        await enqueueStorageUpload('wo-evidence', pathCal, calPhoto, calPhoto.type || 'image/jpeg')
        await enqueueInsert('wo_evidence', {
          org_id: orgId,
          work_order_id: orderId,
          uploaded_by: userId,
          file_path: pathCal,
          file_name: 'calibrador.jpg',
          file_type: 'image',
          note: `Foto del calibrador · ${scope}`,
        })
        await enqueueStorageUpload('wo-evidence', pathScr, scrPhoto, scrPhoto.type || 'image/jpeg')
        await enqueueInsert('wo_evidence', {
          org_id: orgId,
          work_order_id: orderId,
          uploaded_by: userId,
          file_path: pathScr,
          file_name: 'pantalla.jpg',
          file_type: 'image',
          note: `Foto de la pantalla · ${scope}`,
        })
        await enqueueInsert('machine_calibrations', {
          org_id: orgId,
          plant_id: machine.plant_id || null,
          machine_id: machineId,
          work_order_id: orderId,
          performed_by: userId,
          scope,
          reason: why,
          temp_machine_f: tm,
          temp_calibrator_f: tc,
          temp_delta_f: tempDelta,
          rh_machine_pct: hm,
          rh_calibrator_pct: hc,
          rh_delta_pct: rhDelta,
          notes: notes?.trim() || null,
          photo_calibrator_path: pathCal,
          photo_screen_path: pathScr,
          calibrated_at: new Date().toISOString(),
        })
        // Solo cerrar OT si se calibraron ambos sensores (o el pendiente único)
        if (scope === CALIB_SCOPE.both) {
          await enqueueUpdate('work_orders', orderId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            resolution,
            assigned_to: userId,
          })
        } else {
          await enqueueUpdate('work_orders', orderId, {
            status: 'in_progress',
            assigned_to: userId,
            started_at: new Date().toISOString(),
            resolution: `${resolution} (sensor parcial; falta el otro)`,
          })
        }
        return { error: null, offline: true, orderId, partial: scope !== CALIB_SCOPE.both }
      }

      const up1 = await uploadWoPhoto(
        orgId,
        orderId,
        userId,
        calPhoto,
        `Foto del calibrador · ${scope}`
      )
      if (up1.error) {
        setError(up1.error)
        return { error: up1.error }
      }
      const up2 = await uploadWoPhoto(
        orgId,
        orderId,
        userId,
        scrPhoto,
        `Foto de la pantalla · ${scope}`
      )
      if (up2.error) {
        setError(up2.error)
        return { error: up2.error }
      }

      const calibRow = {
        org_id: orgId,
        plant_id: machine.plant_id || null,
        machine_id: machineId,
        work_order_id: orderId,
        performed_by: userId,
        scope,
        reason: why,
        temp_machine_f: tm,
        temp_calibrator_f: tc,
        temp_delta_f: tempDelta,
        rh_machine_pct: hm,
        rh_calibrator_pct: hc,
        rh_delta_pct: rhDelta,
        notes: notes?.trim() || null,
        photo_calibrator_path: up1.path || null,
        photo_screen_path: up2.path || null,
        calibrated_at: new Date().toISOString(),
      }

      const { error: cErr } = await supabase.from('machine_calibrations').insert(calibRow)
      if (cErr && !/does not exist|schema cache|relation|PGRST/i.test(cErr.message || '')) {
        // Tabla aún no migrada: no bloquear; queda en OT
        console.warn('machine_calibrations:', cErr.message)
      }

      // ¿Ya hay calibración del otro sensor en esta OT reciente?
      let closeOt = scope === CALIB_SCOPE.both
      if (!closeOt) {
        const { data: prior } = await supabase
          .from('machine_calibrations')
          .select('scope')
          .eq('machine_id', machineId)
          .eq('work_order_id', orderId)
          .order('calibrated_at', { ascending: false })
          .limit(5)
        const scopes = new Set((prior || []).map((p) => p.scope))
        scopes.add(scope)
        if (scopes.has(CALIB_SCOPE.both) || (scopes.has('temperature') && scopes.has('humidity'))) {
          closeOt = true
        }
      }

      const { error: updErr } = await supabase
        .from('work_orders')
        .update(
          closeOt
            ? {
                status: 'completed',
                completed_at: new Date().toISOString(),
                resolution,
                assigned_to: userId,
                started_at: order?.started_at || new Date().toISOString(),
              }
            : {
                status: 'in_progress',
                assigned_to: userId,
                started_at: order?.started_at || new Date().toISOString(),
                resolution: `${resolution} · pendiente el otro sensor`,
              }
        )
        .eq('id', orderId)

      if (updErr) {
        setError(updErr.message)
        return { error: updErr.message }
      }

      // Resumen en machines
      try {
        await supabase
          .from('machines')
          .update({
            last_calib_at: new Date().toISOString(),
            last_calib_scope: scope,
          })
          .eq('id', machineId)
      } catch {
        /* columnas opcionales */
      }

      await loadAll()
      return {
        error: null,
        orderId,
        code: order?.code,
        partial: !closeOt,
        readings: readingsLine,
      }
    },
    [orgId, userId, machines, openForMachine, ensureCalibrationOrder, loadAll]
  )

  const getEvidenceUrl = useCallback(async (path) => {
    if (!path) return null
    const { data, error: err } = await supabase.storage
      .from('wo-evidence')
      .createSignedUrl(path, 3600)
    if (err) {
      const alt = await supabase.storage.from('machine-checks').createSignedUrl(path, 3600)
      return alt.data?.signedUrl ?? null
    }
    return data?.signedUrl ?? null
  }, [])

  const pending = orders.filter((o) => o.status === 'open' || o.status === 'in_progress')
  const completed = orders.filter((o) => o.status === 'completed')

  // Historial para el responsable: sus reportes + OT completadas por él
  const myReports = reports.filter((r) => r.performed_by === userId)
  const historyReports = canManage ? reports : myReports

  return {
    orders,
    pending,
    completed,
    reports: historyReports,
    myReports,
    evidenceByWo,
    machines,
    plants,
    loading,
    error,
    generating,
    canPerform,
    canManage,
    loadAll,
    openForMachine,
    ensureCalibrationOrder,
    ensureIncWindowOrders,
    ensurePreTransferOrders,
    ensureHatcherOrdersForRooms,
    expireStaleCalibrationOrders,
    submitCalibration,
    getEvidenceUrl,
    parseCalibReason,
    formatCalibReadings,
    CALIB_REASON,
    CALIB_SCOPE,
  }
}

/**
 * Barrido de ventanas de calibración sin montar el panel.
 *
 * El panel solo escanea mientras está abierto, y la ventana INC dura 24 h
 * (36–60 h de ciclo): si nadie lo abre en ese lapso, la ventana se pierde.
 * Esta función corre desde la app para que el barrido no dependa de que
 * alguien esté mirando la pantalla.
 */
export async function scanCalibrationWindows({ orgId, userId }) {
  if (!orgId || !userId) return { expired: 0, created: 0 }
  const CICLO_COMPLETO_MS = 21 * 24 * 3_600_000
  let expired = 0
  let created = 0
  try {
    const [{ data: machines }, { data: loads }] = await Promise.all([
      supabase.from('machines').select('id, plant_id, room_id, name, code, type, status'),
      supabase
        .from('setter_loads')
        .select('machine_id, lote, cycle_start_at, loaded_at')
        .eq('org_id', orgId)
        .order('loaded_at', { ascending: false })
        .limit(300),
    ])

    const ultimoCargue = new Map()
    for (const l of loads || []) {
      if (!l.machine_id || ultimoCargue.has(l.machine_id)) continue
      ultimoCargue.set(l.machine_id, l)
    }

    // 1 · liberar las ventanas vencidas de ciclos anteriores
    const { data: abiertas } = await supabase
      .from('work_orders')
      .select('id, machine_id, created_at')
      .eq('org_id', orgId)
      .eq('source', CALIB_SOURCE)
      .in('status', ['open', 'in_progress'])

    const vencidas = (abiertas || []).filter((o) => {
      if (!o.created_at) return false
      const emitida = new Date(o.created_at).getTime()
      const cargue = ultimoCargue.get(o.machine_id)
      const ciclo = cargue?.cycle_start_at || cargue?.loaded_at
      if (ciclo && emitida < new Date(ciclo).getTime()) return true
      return Date.now() - emitida > CICLO_COMPLETO_MS
    })
    if (vencidas.length) {
      const { error } = await supabase
        .from('work_orders')
        .update({
          status: 'cancelled',
          resolution:
            'Ventana de calibración vencida — el ciclo al que correspondía ya terminó. ' +
            'Anulada automáticamente para liberar la emisión de la siguiente ventana.',
          completed_at: new Date().toISOString(),
        })
        .in('id', vencidas.map((o) => o.id))
      if (!error) expired = vencidas.length
    }

    // 2 · emitir la ventana INC del ciclo vigente
    const vigentes = new Set(
      (abiertas || [])
        .filter((o) => !vencidas.some((v) => v.id === o.id))
        .map((o) => o.machine_id)
    )
    for (const [machineId, load] of ultimoCargue) {
      const start = load.cycle_start_at || load.loaded_at
      if (!incCalibrationWindow(start).inWindow) continue
      if (vigentes.has(machineId)) continue
      const machine = (machines || []).find((m) => m.id === machineId)
      if (!machine || !isIncubatorType(machine.type)) continue
      if (machine.status === 'decommissioned') continue

      const { error } = await supabase.from('work_orders').insert({
        org_id: orgId,
        plant_id: machine.plant_id || null,
        machine_id: machine.id,
        room_id: machine.room_id || null,
        location_type: 'plant',
        title: buildCalibTitle(machine, CALIB_REASON.inc_window),
        description: buildCalibDescription(
          machine,
          CALIB_REASON.inc_window,
          `Lote ${load.lote || '—'} · edad ${incCalibrationWindow(start).label}`
        ),
        type: 'inspection',
        priority: 'high',
        source: CALIB_SOURCE,
        assigned_to: null,
        created_by: userId,
      })
      if (!error) created++
    }
  } catch {
    /* el barrido es best-effort: no debe romper la app */
  }
  return { expired, created }
}

/** API estática para disparar OT desde otros hooks (sin montar el panel). */
export async function generateHatcherCalibrationOrders({
  orgId,
  userId,
  roomIds,
  reason,
  extra,
}) {
  if (!orgId || !userId || !roomIds?.length) return { created: 0 }
  const rooms = roomIds.filter(Boolean)
  const { data: machines } = await supabase
    .from('machines')
    .select('id, plant_id, room_id, name, code, type, status')
    .in('room_id', rooms)

  const list = (machines || []).filter(
    (m) => isHatcherType(m.type) && m.status !== 'decommissioned'
  )
  let created = 0
  for (const machine of list) {
    const { data: existing } = await supabase
      .from('work_orders')
      .select('id')
      .eq('org_id', orgId)
      .eq('machine_id', machine.id)
      .in('status', ['open', 'in_progress'])
      .or(`source.eq.${CALIB_SOURCE},title.ilike.Calibración%`)
      .limit(1)
    if (existing?.length) continue

    const row = {
      org_id: orgId,
      plant_id: machine.plant_id || null,
      machine_id: machine.id,
      room_id: machine.room_id || null,
      location_type: 'plant',
      title: buildCalibTitle(machine, reason),
      description: buildCalibDescription(machine, reason, extra || ''),
      type: 'inspection',
      priority: 'medium',
      source: CALIB_SOURCE,
      assigned_to: null,
      created_by: userId,
    }
    const { error } = await supabase.from('work_orders').insert(row)
    if (!error) {
      created++
      try {
        await supabase.from('notifications').insert({
          org_id: orgId,
          title: `OT calibración · ${machine.code || machine.name}`,
          body: buildCalibTitle(machine, reason),
          kind: 'ot',
          created_by: userId,
        })
      } catch {
        /* */
      }
    } else if (/source|check|constraint/i.test(error.message || '')) {
      const { source: _s, ...rest } = row
      const retry = await supabase.from('work_orders').insert(rest)
      if (!retry.error) created++
    }
  }
  return { created }
}
