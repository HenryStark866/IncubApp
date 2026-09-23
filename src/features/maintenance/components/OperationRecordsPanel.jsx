/**
 * =============================================================================
 * ARCHIVO: src/features/maintenance/components/OperationRecordsPanel.jsx
 * PROPÓSITO: Pestaña «Operación» del Centro de Activos y Dossiers SIG: reúne los
 *   registros de producción que la app diligencia —el Reporte de operación
 *   (FOINC02) y el Control diario (FOINC01 / FONAC01)— con el mismo formato
 *   que en Monitoreo.
 * CÓMO FUNCIONA: el reporte se arma para el rango elegido leyendo turnos,
 *   rondas, cargues, transferencias y actividades de ese rango (paginado: las
 *   rondas son miles). El Control diario es el mismo componente de Monitoreo.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import ControlDiarioPanel from '../../../components/ControlDiarioPanel'
import { buildOperationReportHtml, exportOperationReport, exportOperationReportDoc, OPERATION_FORMAT } from '../../../lib/operationReport'
import { openRecordDocument } from '../../../lib/sigRecordDocuments'
import './SigInsights.css'

const hoyIso = () => new Date().toLocaleDateString('sv-SE')
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE')
}
const PRESETS = [
  { id: 'hoy', label: 'Hoy', dias: 0 },
  { id: '7', label: '7 días', dias: 6 },
  { id: '30', label: '30 días', dias: 29 },
]
const PAGE = 1000
const MAX_ROWS = 40000

/** Lee todas las filas del rango en páginas de 1000 (el tope de Supabase por consulta). */
async function allRows(build, onPage) {
  const out = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    onPage?.(out.length)
    if (!data || data.length < PAGE) break
  }
  return out
}

export default function OperationRecordsPanel({ orgId, machines = [], rooms = [], plants = [], people = {} }) {
  const [plantId, setPlantId] = useState(() => plants[0]?.id || '')
  const [desde, setDesde] = useState(haceDias(6))
  const [hasta, setHasta] = useState(hoyIso())
  const [busy, setBusy] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [view, setView] = useState('report')

  const plantMachines = useMemo(() => (plantId ? machines.filter((m) => m.plant_id === plantId) : machines), [machines, plantId])
  const plant = plants.find((p) => p.id === plantId) || null
  const machineName = useMemo(() => {
    const map = {}
    for (const m of machines) map[m.id] = `${m.name}${m.code ? ` (${m.code})` : ''}`
    return map
  }, [machines])

  const preset = PRESETS.find((p) => desde === haceDias(p.dias) && hasta === hoyIso())?.id || null

  const loadData = async () => {
    const ini = `${desde}T00:00:00-05:00`
    const fin = `${hasta}T23:59:59-05:00`
    const ids = new Set(plantMachines.map((m) => m.id))
    const byPlant = (q) => (plantId ? q.eq('plant_id', plantId) : q)
    setBusy('Leyendo turnos…')
    const assignments = await allRows(() => byPlant(supabase.from('shift_assignments').select('user_id, work_date, shift_number, is_rest').eq('org_id', orgId).gte('work_date', desde).lte('work_date', hasta).order('work_date')))
    const checks = await allRows(
      () => byPlant(supabase.from('machine_checks').select('id, machine_id, taken_by, taken_at, shift_number, condition, notes').eq('org_id', orgId).gte('taken_at', ini).lte('taken_at', fin).order('taken_at')),
      (n) => setBusy(`Leyendo rondas… ${n.toLocaleString('es-CO')}`)
    )
    setBusy('Leyendo cargues y transferencias…')
    const [loads, transfers, activities] = await Promise.all([
      allRows(() => byPlant(supabase.from('setter_loads').select('id, machine_id, lote, loaded_at, tape_color, tape_color_name, created_by').eq('org_id', orgId).gte('loaded_at', ini).lte('loaded_at', fin).order('loaded_at'))),
      allRows(() => byPlant(supabase.from('transfers').select('id, lote, mode, weight_diff, transferred_at, created_by').eq('org_id', orgId).gte('transferred_at', ini).lte('transferred_at', fin).order('transferred_at'))),
      allRows(() => byPlant(supabase.from('shift_activities').select('id, assigned_to, status, completed_at, created_at').eq('org_id', orgId).gte('created_at', ini).lte('created_at', fin))),
    ])
    return {
      assignments,
      checks: plantId ? checks.filter((c) => ids.has(c.machine_id) || !c.machine_id) : checks,
      loads,
      transfers,
      activities,
      people,
      machineName,
      plantName: plant?.name,
      desde,
      hasta,
    }
  }

  const run = async (kind) => {
    setAviso(null)
    try {
      const data = await loadData()
      setBusy('Armando el formato…')
      if (kind === 'ver') openRecordDocument({ html: buildOperationReportHtml(data), title: `${OPERATION_FORMAT.code} · Reporte de operación` })
      else if (kind === 'doc') exportOperationReportDoc(data)
      else await exportOperationReport(data)
      setAviso({ tipo: 'bien', txt: `${data.checks.length.toLocaleString('es-CO')} tomas de ronda, ${data.loads.length} cargues, ${data.transfers.length} transferencias y ${data.assignments.length} turnos en el periodo.` })
    } catch (e) {
      setAviso({ tipo: 'mal', txt: `No se pudo armar el reporte: ${e?.message || 'sin respuesta'}` })
    }
    setBusy(null)
  }

  return (
    <div className="si-panel">
      <div className="si-toolbar">
        <div className="si-seg" role="tablist" aria-label="Registros de operación">
          <button type="button" role="tab" aria-selected={view === 'report'} className={view === 'report' ? 'is-on' : ''} onClick={() => setView('report')}>Reporte de operación · FOINC02</button>
          <button type="button" role="tab" aria-selected={view === 'daily'} className={view === 'daily' ? 'is-on' : ''} onClick={() => setView('daily')}>Control diario · FOINC01 / FONAC01</button>
        </div>
        {plants.length > 1 && (
          <label className="si-field">
            <span>Sede</span>
            <select value={plantId} onChange={(e) => setPlantId(e.target.value)}>
              <option value="">Todas</option>
              {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {view === 'report' ? (
        <div className="si-card si-op">
          <div className="si-op-doc" aria-hidden="true">
            <span className="si-op-code">{OPERATION_FORMAT.code}</span>
            <span>v{OPERATION_FORMAT.version}</span>
            <span>{OPERATION_FORMAT.date}</span>
          </div>
          <div className="si-op-body">
            <h3>{OPERATION_FORMAT.name}</h3>
            <p className="si-note">
              Formato del SIG con membrete, logo, código, versión, control de cambios y firmas. Consolida turnos, operarios,
              rondas por máquina, novedades, cargues y transferencias del periodo. Sale en Word para firmar e imprimir o en Excel para filtrar.
            </p>
            <div className="si-toolbar si-toolbar-sub">
              <div className="si-seg si-seg-sm" role="radiogroup" aria-label="Periodo rápido">
                {PRESETS.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={preset === p.id ? 'is-on' : ''} onClick={() => { setDesde(haceDias(p.dias)); setHasta(hoyIso()) }}>{p.label}</button>
                ))}
              </div>
              <label className="si-field"><span>Desde</span><input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
              <label className="si-field"><span>Hasta</span><input type="date" value={hasta} min={desde} max={hoyIso()} onChange={(e) => setHasta(e.target.value)} /></label>
            </div>
            <div className="si-actions si-actions-lg">
              <button type="button" className="si-primary" onClick={() => run('ver')} disabled={!!busy || !orgId}>Ver formato</button>
              <button type="button" onClick={() => run('doc')} disabled={!!busy || !orgId}>📄 Descargar Word</button>
              <button type="button" onClick={() => run('excel')} disabled={!!busy || !orgId}>📊 Excel</button>
            </div>
            {busy && <p className="si-note" role="status"><span className="sig-asset-spinner" aria-hidden="true" /> {busy}</p>}
            {aviso && <p className={aviso.tipo === 'bien' ? 'si-ok' : 'si-warn'} role="status">{aviso.txt}</p>}
          </div>
        </div>
      ) : (
        <ControlDiarioPanel inline machines={plantMachines} rooms={rooms} people={people} />
      )}
    </div>
  )
}
