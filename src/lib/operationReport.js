/**
 * =============================================================================
 * ARCHIVO: src/lib/operationReport.js
 * PROPÓSITO: Construye y descarga el Excel "Reporte de operación" (turnos,
 *   operarios, rondas, cargues y transferencias), compartido entre MonitorMode
 *   y LeaderOpsMap. Usa el mismo exportador con membrete corporativo que el
 *   resto de la app (exportExcel.js) — antes reimplementaba el libro a mano
 *   con la librería xlsx directamente, duplicando esa lógica sin el membrete.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { exportToExcel } from './exportExcel'

export const SHIFT_LABEL = { 1: 'T1 · 06–14 h', 2: 'T2 · 14–22 h', 3: 'T3 · 22–06 h' }

export const fmtDT = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'

const CONDITION_LABEL = { normal: 'Sin novedad', warning: 'Alerta', fault: 'Falla', off: 'Apagada' }
const conditionLabel = (v) => CONDITION_LABEL[v] ?? v

/**
 * @param {object} d
 * @param {object[]} d.assignments turnos (shift_assignments)
 * @param {object[]} d.checks rondas (machine_checks)
 * @param {object[]} d.loads cargues (setter_loads)
 * @param {object[]} d.transfers transferencias
 * @param {object[]} d.activities actividades del turno (shift_ops)
 * @param {Record<string, {name:string, role?:string}>} d.people id de usuario → datos
 * @param {Record<string, string>} d.machineName id de máquina → nombre legible
 */
function buildOperationReportSheets({
  assignments = [],
  checks = [],
  loads = [],
  transfers = [],
  activities = [],
  people = {},
  machineName = {},
}) {
  const turnosRows = assignments.map((a) => ({
    Fecha: a.work_date,
    Turno: SHIFT_LABEL[a.shift_number] ?? a.shift_number,
    Usuario: people[a.user_id]?.name ?? a.user_id,
    Descanso: a.is_rest ? 'Sí' : 'No',
  }))

  const relevantIds = new Set(
    [
      ...assignments.map((a) => a.user_id),
      ...checks.map((c) => c.taken_by),
      ...loads.map((l) => l.created_by),
      ...transfers.map((t) => t.created_by),
      ...activities.map((a) => a.assigned_to),
    ].filter(Boolean)
  )
  const operariosRows = [...relevantIds]
    .map((id) => ({
      Operario: people[id]?.name ?? id,
      Rol: people[id]?.role ?? '—',
      'Turnos asignados': assignments.filter((a) => a.user_id === id && !a.is_rest).length,
      'Rondas registradas': checks.filter((c) => c.taken_by === id).length,
      'Cargues registrados': loads.filter((l) => l.created_by === id).length,
      'Transferencias registradas': transfers.filter((t) => t.created_by === id).length,
      'Actividades completadas': activities.filter((a) => a.assigned_to === id && a.status === 'completed').length,
    }))
    .sort((a, b) => a.Operario.localeCompare(b.Operario, 'es'))

  const rondasRows = checks.map((c) => ({
    Fecha: fmtDate(c.taken_at),
    Hora: fmtTime(c.taken_at),
    Turno: SHIFT_LABEL[c.shift_number] ?? c.shift_number,
    Máquina: machineName[c.machine_id] || c.machine_id,
    Condición: conditionLabel(c.condition),
    'Tomado por': people[c.taken_by]?.name ?? '—',
    Notas: c.notes || '—',
  }))

  const carguesRows = loads.map((l) => ({
    Fecha: fmtDT(l.loaded_at),
    Lote: l.lote,
    Máquina: machineName[l.machine_id] || l.machine_id,
    'Color cinta': l.tape_color_name || l.tape_color || '—',
    'Registrado por': people[l.created_by]?.name ?? '—',
  }))

  const transRows = transfers.map((t) => ({
    Fecha: fmtDT(t.transferred_at),
    Lote: t.lote,
    Modo: t.mode === 'partial' ? 'Parcial' : 'Completa',
    'Peso Δ kg': t.weight_diff ?? '—',
    'Registrado por': people[t.created_by]?.name ?? '—',
  }))

  return [
    { name: 'Turnos', rows: turnosRows },
    { name: 'Operarios', rows: operariosRows },
    { name: 'Rondas', rows: rondasRows },
    { name: 'Cargues', rows: carguesRows },
    { name: 'Transferencias', rows: transRows },
  ]
}

/** Construye y descarga el Excel con membrete corporativo en un solo paso. */
export async function exportOperationReport(data) {
  const sheets = buildOperationReportSheets(data)
  return exportToExcel('reporte-operacion-sig', sheets, {
    title: 'REPORTE CONSOLIDADO DE OPERACIÓN Y RONDAS',
    fomatCode: 'FOMAT04',
    module: 'Operación',
  })
}

