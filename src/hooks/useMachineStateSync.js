/**
 * Sincroniza el estado operativo de máquinas desde la cronología real
 * (cargues, transferencias, nacimientos) — herramienta del coordinador.
 *
 * Henry Stark · CDH Maker
 */

import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  computeAllMachineStates,
  toMachinePatch,
  toOpsStateRow,
  PHASE_LABEL,
} from '../lib/machineOpsState'
import { canManageMachineState } from '../lib/machineCalibration'

export { PHASE_LABEL }

export function useMachineStateSync(orgId, userId, { role } = {}) {
  const [preview, setPreview] = useState([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState(null)
  const [lastResult, setLastResult] = useState(null)

  const canManage = canManageMachineState(role)

  const loadPreview = useCallback(async () => {
    if (!orgId) return { error: 'Sin organización' }
    setLoading(true)
    setError(null)
    try {
      const { data: plants } = await supabase
        .from('plants')
        .select('id, name')
        .eq('org_id', orgId)
      const plantIds = (plants || []).map((p) => p.id)
      if (!plantIds.length) {
        setPreview([])
        setLoading(false)
        return { error: null, rows: [] }
      }

      const [mRes, lRes, tRes, hRes] = await Promise.all([
        supabase
          .from('machines')
          .select('id, plant_id, room_id, name, code, type, status')
          .in('plant_id', plantIds),
        supabase
          .from('setter_loads')
          .select(
            'id, plant_id, machine_id, batch_id, lote, loaded_at, cycle_start_at'
          )
          .eq('org_id', orgId)
          .order('loaded_at', { ascending: true })
          .limit(800),
        supabase
          .from('transfers')
          .select(
            'id, plant_id, batch_id, lote, mode, room_ids, cycle_start_at, transferred_at'
          )
          .eq('org_id', orgId)
          .order('transferred_at', { ascending: true })
          .limit(800),
        supabase
          .from('hatch_events')
          .select(
            'id, plant_id, transfer_id, batch_id, lote, room_ids, status, incubable_eggs, estimated_chicks, started_at, ended_at, scheduled_at, created_at'
          )
          .eq('org_id', orgId)
          .order('created_at', { ascending: true })
          .limit(800),
      ])

      if (mRes.error) throw new Error(mRes.error.message)
      if (lRes.error) throw new Error(lRes.error.message)
      if (tRes.error) throw new Error(tRes.error.message)
      // hatches opcional si tabla vacía / error menor
      const hatches = hRes.error ? [] : hRes.data || []

      // Backfill en memoria: cycle_start = loaded_at
      const loads = (lRes.data || []).map((l) => ({
        ...l,
        cycle_start_at: l.cycle_start_at || l.loaded_at,
      }))

      const map = computeAllMachineStates({
        machines: mRes.data || [],
        loads,
        transfers: tRes.data || [],
        hatches,
      })

      const plantName = Object.fromEntries((plants || []).map((p) => [p.id, p.name]))
      const machineById = Object.fromEntries((mRes.data || []).map((m) => [m.id, m]))

      const rows = [...map.values()].map((s) => {
        const m = machineById[s.machine_id]
        return {
          ...s,
          machine_code: m?.code,
          machine_name: m?.name,
          machine_type: m?.type,
          plant_name: plantName[s.plant_id] || '—',
          phase_label: PHASE_LABEL[s.phase] || s.phase,
          selected: true,
        }
      })

      // Orden: primero con actividad
      rows.sort((a, b) => {
        const rank = (p) =>
          ({ calib_window: 0, transfer_ready: 1, hatching: 2, incubating: 3, in_hatcher: 4, completed: 5, idle: 6 }[
            p
          ] ?? 9)
        return rank(a.phase) - rank(b.phase) || String(a.machine_code).localeCompare(String(b.machine_code))
      })

      setPreview(rows)
      setLoading(false)
      return { error: null, rows }
    } catch (e) {
      const msg = e?.message || String(e)
      setError(msg)
      setLoading(false)
      return { error: msg }
    }
  }, [orgId])

  const setRowSelected = useCallback((machineId, selected) => {
    setPreview((prev) =>
      prev.map((r) => (r.machine_id === machineId ? { ...r, selected } : r))
    )
  }, [])

  const patchPreviewRow = useCallback((machineId, patch) => {
    setPreview((prev) =>
      prev.map((r) => {
        if (r.machine_id !== machineId) return r
        const next = { ...r, ...patch }
        if (patch.phase) next.phase_label = PHASE_LABEL[patch.phase] || patch.phase
        return next
      })
    )
  }, [])

  /**
   * Aplica filas seleccionadas a machine_ops_state + resumen en machines
   * + backfill cycle_start_at en setter_loads.
   */
  const applySelected = useCallback(async () => {
    if (!orgId || !userId) return { error: 'Sesión inválida' }
    if (!canManage) return { error: 'Sin permiso de coordinador' }
    const selected = preview.filter((r) => r.selected)
    if (!selected.length) return { error: 'Seleccione al menos una máquina' }

    setApplying(true)
    setError(null)
    let opsOk = 0
    let machOk = 0
    let loadsFixed = 0
    const errors = []

    try {
      // 1) Backfill cycle_start_at en cargues sin inicio
      const { data: nullCycles } = await supabase
        .from('setter_loads')
        .select('id, loaded_at')
        .eq('org_id', orgId)
        .is('cycle_start_at', null)
        .not('loaded_at', 'is', null)
        .limit(500)
      for (const row of nullCycles || []) {
        const { error: uErr } = await supabase
          .from('setter_loads')
          .update({ cycle_start_at: row.loaded_at })
          .eq('id', row.id)
        if (!uErr) loadsFixed++
      }

      // 2) Upsert estados
      for (const s of selected) {
        const opsRow = toOpsStateRow(orgId, userId, s)
        const { error: oErr } = await supabase
          .from('machine_ops_state')
          .upsert(opsRow, { onConflict: 'machine_id' })
        if (oErr) {
          errors.push(`${s.machine_code || s.machine_id}: ${oErr.message}`)
          continue
        }
        opsOk++

        const patch = toMachinePatch(s)
        // No degradar decommissioned
        const { data: cur } = await supabase
          .from('machines')
          .select('status')
          .eq('id', s.machine_id)
          .maybeSingle()
        if (cur?.status === 'decommissioned') {
          delete patch.status
        }
        const { error: mErr } = await supabase.from('machines').update(patch).eq('id', s.machine_id)
        if (mErr) errors.push(`${s.machine_code} machines: ${mErr.message}`)
        else machOk++
      }

      const detail = {
        at: new Date().toISOString(),
        opsOk,
        machOk,
        loadsFixed,
        errors: errors.slice(0, 12),
        total: selected.length,
      }
      setLastResult(detail)
      setApplying(false)
      return { error: errors.length && !opsOk ? errors[0] : null, ...detail }
    } catch (e) {
      const msg = e?.message || String(e)
      setError(msg)
      setApplying(false)
      return { error: msg }
    }
  }, [orgId, userId, canManage, preview])

  return {
    canManage,
    preview,
    loading,
    applying,
    error,
    lastResult,
    loadPreview,
    setRowSelected,
    patchPreviewRow,
    applySelected,
    setPreview,
  }
}
