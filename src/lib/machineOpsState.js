/**
 * Cálculo del estado operativo de máquinas a partir de la cronología real
 * (setter_loads → transfers → hatch_events), desde la fecha más antigua.
 *
 * Henry Stark · CDH Maker
 */

import { transferenciasDeLaIncubadora } from './transferenciasDeLaIncubadora'
import {
  INC_CALIB_MAX_HOURS,
  INC_CALIB_MIN_HOURS,
  isHatcherType,
  isIncubatorType,
} from './machineCalibration'

export const MACHINE_PHASE = {
  idle: 'idle',
  incubating: 'incubating',
  calib_window: 'calib_window',
  transfer_ready: 'transfer_ready',
  in_hatcher: 'in_hatcher',
  hatching: 'hatching',
  completed: 'completed',
  unknown: 'unknown',
}

export const PHASE_LABEL = {
  idle: 'Vacía / en espera',
  incubating: 'En incubación',
  calib_window: 'Ventana de calibración INC',
  transfer_ready: 'Lista para transferencia',
  in_hatcher: 'En nacedora',
  hatching: 'Nacimiento en curso',
  completed: 'Nacimiento cerrado',
  unknown: 'Sin datos',
}

/** Horas típicas de transferencia (~18 d) y nacimiento (~21 d) */
export const TRANSFER_READY_HOURS = 432 // 18 d
export const HATCH_READY_HOURS = 504 // 21 d
export const MIN_TRANSFER_DAYS_HOURS = 10 * 24

export function ageHoursFrom(iso, nowMs = Date.now()) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const h = (nowMs - t) / 3_600_000
  return h < 0 ? 0 : h
}

export function ageLabel(hours) {
  if (hours == null || !Number.isFinite(hours)) return '—'
  const d = Math.floor(hours / 24)
  const h = Math.floor(hours % 24)
  return `${d}d ${h}h`
}

function loteKey(lote) {
  return String(lote || '')
    .trim()
    .toLowerCase()
}

/**
 * Construye timeline y estado actual por máquina.
 *
 * @param {{
 *   machines: object[],
 *   loads: object[],
 *   transfers: object[],
 *   hatches: object[],
 *   now?: number,
 * }} input
 * @returns {Map<string, object>} machineId → estado calculado
 */
export function computeAllMachineStates({ machines, loads, transfers, hatches, now = Date.now() }) {
  const result = new Map()

  // Orden cronológico ascendente (más antiguo primero)
  const loadsAsc = [...(loads || [])].sort(
    (a, b) =>
      new Date(a.cycle_start_at || a.loaded_at || 0) -
      new Date(b.cycle_start_at || b.loaded_at || 0)
  )
  const transfersAsc = [...(transfers || [])].sort(
    (a, b) => new Date(a.transferred_at || 0) - new Date(b.transferred_at || 0)
  )
  const hatchesAsc = [...(hatches || [])].sort(
    (a, b) =>
      new Date(a.started_at || a.scheduled_at || a.created_at || 0) -
      new Date(b.started_at || b.scheduled_at || b.created_at || 0)
  )

  // Transferencias por lote
  // ES: …y por incubadora de origen (06-10-2026, transferencias por incubadora e importadas).
  // EN: …and by source setter (2026-10-06, per-setter and imported transfers).
  const transfersBySource = new Map()
  for (const t of transfersAsc) {
    if (!t.source_machine_id) continue
    if (!transfersBySource.has(t.source_machine_id)) transfersBySource.set(t.source_machine_id, [])
    transfersBySource.get(t.source_machine_id).push(t)
  }
  const transfersByLote = new Map()
  for (const t of transfersAsc) {
    const k = loteKey(t.lote)
    if (!k) continue
    if (!transfersByLote.has(k)) transfersByLote.set(k, [])
    transfersByLote.get(k).push(t)
  }

  // Nacimientos por lote / transfer_id
  const hatchesByLote = new Map()
  const hatchesByTransfer = new Map()
  for (const h of hatchesAsc) {
    const k = loteKey(h.lote)
    if (k) {
      if (!hatchesByLote.has(k)) hatchesByLote.set(k, [])
      hatchesByLote.get(k).push(h)
    }
    if (h.transfer_id) {
      if (!hatchesByTransfer.has(h.transfer_id)) hatchesByTransfer.set(h.transfer_id, [])
      hatchesByTransfer.get(h.transfer_id).push(h)
    }
  }

  // Último cargue por máquina (más reciente por fecha de ciclo)
  const latestLoadByMachine = new Map()
  for (const l of loadsAsc) {
    if (!l.machine_id) continue
    latestLoadByMachine.set(l.machine_id, l)
  }

  // Nacedoras: ocupación por room desde transferencias recientes no cerradas
  const latestTransferTouchingRoom = new Map() // roomId → transfer
  for (const t of transfersAsc) {
    for (const rid of t.room_ids || []) {
      latestTransferTouchingRoom.set(rid, t)
    }
  }

  for (const m of machines || []) {
    if (m.status === 'decommissioned') {
      result.set(m.id, emptyState(m, 'idle', now))
      continue
    }

    if (isIncubatorType(m.type)) {
      result.set(m.id, computeSetterState(m, latestLoadByMachine.get(m.id), transfersByLote, now, transfersBySource))
      continue
    }

    if (isHatcherType(m.type) && m.type !== 'combo') {
      result.set(
        m.id,
        computeHatcherState(
          m,
          latestTransferTouchingRoom.get(m.room_id),
          hatchesByLote,
          hatchesByTransfer,
          now
        )
      )
      continue
    }

    // combo: priorizar cargue de setter si hay; si no, hatcher por sala
    const load = latestLoadByMachine.get(m.id)
    if (load) {
      result.set(m.id, computeSetterState(m, load, transfersByLote, now, transfersBySource))
    } else {
      result.set(
        m.id,
        computeHatcherState(
          m,
          latestTransferTouchingRoom.get(m.room_id),
          hatchesByLote,
          hatchesByTransfer,
          now
        )
      )
    }
  }

  return result
}

function emptyState(m, phase = 'idle', now = Date.now()) {
  return {
    machine_id: m.id,
    plant_id: m.plant_id || null,
    room_id: m.room_id || null,
    phase,
    machine_status: phase === 'idle' ? 'idle' : 'active',
    lote: null,
    batch_id: null,
    cycle_start_at: null,
    loaded_at: null,
    age_hours: null,
    age_label: '—',
    last_load_id: null,
    last_transfer_id: null,
    last_hatch_id: null,
    incubable_eggs: null,
    estimated_chicks: null,
    calib_due: false,
    calib_reason: null,
    timeline: [],
    computed_at: new Date(now).toISOString(),
    notes: null,
  }
}

function computeSetterState(m, load, transfersByLote, now, transfersBySource = new Map()) {
  if (!load) return emptyState(m, 'idle', now)

  const cycleStart = load.cycle_start_at || load.loaded_at
  const hours = ageHoursFrom(cycleStart, now)
  const k = loteKey(load.lote)
  // ES: Por lote (antiguas) y por incubadora de origen (nuevas e importadas).
  // EN: By lot (old ones) and by source setter (new and imported ones).
  const transfers = transferenciasDeLaIncubadora({
    maquinaId: m.id,
    porLote: k ? transfersByLote.get(k) || [] : [],
    porOrigen: transfersBySource,
  })
  // ¿Este cargue ya fue transferido? (lote transferido después del cargue)
  const transferred = transfers.find(
    (t) =>
      !load.loaded_at ||
      new Date(t.transferred_at || 0) >= new Date(load.loaded_at || cycleStart || 0)
  )

  const timeline = [
    {
      kind: 'load',
      at: load.loaded_at || cycleStart,
      label: `Cargue lote ${load.lote || '—'}`,
      id: load.id,
    },
  ]
  if (transferred) {
    timeline.push({
      kind: 'transfer',
      at: transferred.transferred_at,
      label: `Transferido (${transferred.mode || 'single'})`,
      id: transferred.id,
    })
  }

  let phase = MACHINE_PHASE.incubating
  let calibDue = false
  let calibReason = null

  if (transferred) {
    phase = MACHINE_PHASE.completed
  } else if (hours != null && hours >= TRANSFER_READY_HOURS) {
    phase = MACHINE_PHASE.transfer_ready
  } else if (hours != null && hours >= INC_CALIB_MIN_HOURS && hours < INC_CALIB_MAX_HOURS) {
    phase = MACHINE_PHASE.calib_window
    calibDue = true
    calibReason = 'inc_window'
  } else if (hours != null && hours >= MIN_TRANSFER_DAYS_HOURS) {
    phase = MACHINE_PHASE.incubating
  }

  return {
    machine_id: m.id,
    plant_id: m.plant_id || load.plant_id || null,
    room_id: m.room_id || null,
    phase,
    machine_status: phase === MACHINE_PHASE.completed || phase === MACHINE_PHASE.idle ? 'idle' : 'active',
    lote: load.lote || null,
    batch_id: load.batch_id || null,
    cycle_start_at: cycleStart || null,
    loaded_at: load.loaded_at || null,
    age_hours: hours != null ? Math.round(hours * 100) / 100 : null,
    age_label: ageLabel(hours),
    last_load_id: load.id,
    last_transfer_id: transferred?.id || null,
    last_hatch_id: null,
    incubable_eggs: null,
    estimated_chicks: null,
    calib_due: calibDue,
    calib_reason: calibReason,
    timeline,
    computed_at: new Date(now).toISOString(),
    notes: transferred
      ? 'Lote transferido: incubadora liberada'
      : hours != null && hours >= TRANSFER_READY_HOURS
        ? 'Listo para transferencia a nacedora'
        : null,
  }
}

function computeHatcherState(m, transfer, hatchesByLote, hatchesByTransfer, now) {
  if (!transfer) return emptyState(m, 'idle', now)

  const cycleStart = transfer.cycle_start_at || transfer.transferred_at
  const hours = ageHoursFrom(cycleStart, now)
  const k = loteKey(transfer.lote)
  const byTransfer = hatchesByTransfer.get(transfer.id) || []
  const byLote = k ? hatchesByLote.get(k) || [] : []
  const hatch =
    byTransfer[byTransfer.length - 1] ||
    byLote.filter((h) => h.status !== 'cancelled').slice(-1)[0] ||
    null

  const timeline = [
    {
      kind: 'transfer',
      at: transfer.transferred_at,
      label: `Transferencia lote ${transfer.lote || '—'}`,
      id: transfer.id,
    },
  ]

  let phase = MACHINE_PHASE.in_hatcher
  let calibDue = true
  let calibReason = 'pre_transfer' // post recepción en nacedora → calibrar

  if (hatch) {
    timeline.push({
      kind: 'hatch',
      at: hatch.started_at || hatch.scheduled_at,
      label: `Nacimiento ${hatch.status}`,
      id: hatch.id,
    })
    if (hatch.status === 'in_progress') {
      phase = MACHINE_PHASE.hatching
      calibDue = false
    } else if (hatch.status === 'completed') {
      phase = MACHINE_PHASE.completed
      calibDue = true
      calibReason = 'post_hatch'
    } else if (hatch.status === 'planned') {
      phase = MACHINE_PHASE.in_hatcher
    }
  } else if (hours != null && hours >= HATCH_READY_HOURS) {
    phase = MACHINE_PHASE.in_hatcher
  }

  return {
    machine_id: m.id,
    plant_id: m.plant_id || transfer.plant_id || null,
    room_id: m.room_id || null,
    phase,
    machine_status:
      phase === MACHINE_PHASE.completed || phase === MACHINE_PHASE.idle ? 'idle' : 'active',
    lote: transfer.lote || null,
    batch_id: transfer.batch_id || null,
    cycle_start_at: cycleStart || null,
    loaded_at: transfer.transferred_at || null,
    age_hours: hours != null ? Math.round(hours * 100) / 100 : null,
    age_label: ageLabel(hours),
    last_load_id: null,
    last_transfer_id: transfer.id,
    last_hatch_id: hatch?.id || null,
    incubable_eggs: hatch?.incubable_eggs ?? null,
    estimated_chicks: hatch?.estimated_chicks ?? null,
    calib_due: calibDue,
    calib_reason: calibReason,
    timeline,
    computed_at: new Date(now).toISOString(),
    notes:
      phase === MACHINE_PHASE.completed
        ? 'Nacimiento cerrado: calibrar nacedora antes del próximo uso'
        : null,
  }
}

/** Fila lista para upsert en machine_ops_state */
export function toOpsStateRow(orgId, userId, state) {
  return {
    machine_id: state.machine_id,
    org_id: orgId,
    plant_id: state.plant_id,
    room_id: state.room_id,
    phase: state.phase,
    machine_status: state.machine_status,
    lote: state.lote,
    batch_id: state.batch_id,
    cycle_start_at: state.cycle_start_at,
    loaded_at: state.loaded_at,
    age_hours: state.age_hours,
    age_label: state.age_label,
    last_load_id: state.last_load_id,
    last_transfer_id: state.last_transfer_id,
    last_hatch_id: state.last_hatch_id,
    incubable_eggs: state.incubable_eggs,
    estimated_chicks: state.estimated_chicks,
    calib_due: !!state.calib_due,
    calib_reason: state.calib_reason,
    timeline: state.timeline || [],
    computed_at: state.computed_at || new Date().toISOString(),
    computed_by: userId,
    notes: state.notes,
    updated_at: new Date().toISOString(),
  }
}

/** Patch opcional sobre machines (resumen) */
export function toMachinePatch(state) {
  return {
    current_lote: state.lote,
    current_phase: state.phase,
    cycle_start_at: state.cycle_start_at,
    ops_synced_at: new Date().toISOString(),
    // No forzar decommissioned; solo active/idle si el estado actual lo permite
    ...(state.machine_status === 'active' || state.machine_status === 'idle'
      ? { status: state.machine_status }
      : {}),
  }
}
