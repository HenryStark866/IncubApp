/**
 * =============================================================================
 * ARCHIVO: src/features/maintenance/components/PlanCompliancePanel.jsx
 * PROPÓSITO: Cumplimiento del Plan AM semana a semana: qué actividad programada
 *   tiene registro (OT o calibración de IncubApp, OT o bitácora de Mántum,
 *   ronda) y cuál no. Lo que no tiene registro ofrece el FOMAT01 prellenado con
 *   el plan para diligenciarlo; nunca se marca como hecho sin un registro.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useDeferredValue, useMemo, useState } from 'react'
import {
  complianceBySystem,
  computePlanCompliance,
  equipmentCodesOfTask,
  isoWeekOf,
  OCCURRENCE_STATUS,
  PLAN_YEAR,
} from '../../../lib/planCompliance'
import { blankPlanTaskFormatHtml } from '../../../lib/planTaskBlankFormat'
import { openRecordDocument } from '../../../lib/sigRecordDocuments'
import { exportToExcel } from '../../../lib/exportExcel'
import './SigInsights.css'

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)} %`)
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—')
const SOURCE = { ot: 'OT IncubApp', calibracion: 'Calibración', mantum: 'Mántum', ronda: 'Ronda' }

const STATUS_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'missing', label: 'Con semanas sin registro' },
  { id: 'partial', label: 'Parciales' },
  { id: 'done', label: 'Al día' },
]

function Meter({ value }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value))
  const tone = value == null ? 'muted' : v >= 0.9 ? 'ok' : v >= 0.6 ? 'warn' : 'bad'
  return (
    <span className={`si-meter si-meter-${tone}`} title={pct(value)}>
      <span style={{ width: `${v * 100}%` }} />
    </span>
  )
}

export default function PlanCompliancePanel({ tasks = [], allTasks = [], records = [], loading = false, warnings = [], mantum = null, onOpenTask, onReload }) {
  const firstWeek = useMemo(() => {
    const first = records.find((r) => r.kind !== 'ronda' && r.date.getFullYear() === PLAN_YEAR)
    return first ? isoWeekOf(first.date).week : 1
  }, [records])
  const [fromMode, setFromMode] = useState('records')
  const [statusFilter, setStatusFilter] = useState('missing')
  const [selectedCode, setSelectedCode] = useState(null)
  const [allWeeks, setAllWeeks] = useState(false)
  const nowWeek = isoWeekOf(new Date()).week
  const fromWeek = fromMode === 'year' ? 1 : fromMode === 'quarter' ? Math.max(1, nowWeek - 12) : firstWeek

  const knownKeys = useMemo(() => new Set(allTasks.flatMap(equipmentCodesOfTask)), [allTasks])
  const deferredTasks = useDeferredValue(tasks)
  const result = useMemo(
    () => computePlanCompliance({ tasks: deferredTasks, records, knownKeys, fromWeek }),
    [deferredTasks, records, knownKeys, fromWeek]
  )
  const systems = useMemo(() => complianceBySystem(result.rows).filter((g) => g.due), [result])
  const sources = useMemo(() => {
    const c = {}
    for (const r of records) c[r.kind] = (c[r.kind] || 0) + 1
    return c
  }, [records])

  const rows = useMemo(() => {
    const list = result.rows.filter((r) => r.due || r.upcoming)
    const filtered = statusFilter === 'all' ? list : list.filter((r) => (statusFilter === 'done' ? r.due && r.done === r.due : r[statusFilter] > 0))
    return filtered.sort((a, b) => (a.pct ?? 2) - (b.pct ?? 2) || b.missing - a.missing || String(a.task.code).localeCompare(String(b.task.code)))
  }, [result, statusFilter])

  const selected = rows.find((r) => r.task.code === selectedCode) || result.rows.find((r) => r.task.code === selectedCode) || null

  const openBlank = (row, occurrence) => {
    const missing = occurrence ? row.trackable.filter((c) => !occurrence.hitCodes?.includes(c)) : null
    openRecordDocument({
      html: blankPlanTaskFormatHtml({ task: row.task, occurrence, missingCodes: missing?.length ? missing : null }),
      title: `FOMAT01 para diligenciar · ${row.task.code}${occurrence ? ` · semana ${occurrence.week}` : ''}`,
    })
  }

  const exportExcel = () => {
    const detail = []
    for (const r of result.rows) {
      for (const o of r.occurrences) {
        if (o.status === 'upcoming') continue
        detail.push({
          Tarea: r.task.code,
          Sistema: r.task.system,
          Actividad: r.task.description,
          Frecuencia: r.task.frequency,
          Semana: o.week,
          Desde: fmtDay(o.start),
          Estado: OCCURRENCE_STATUS[o.status].label,
          'Equipos con registro': o.total > 1 ? `${o.covered} de ${o.total}` : o.records.length ? 'Sí' : 'No',
          Registros: o.records.map((x) => `${SOURCE[x.kind] || x.kind} ${x.code || ''} ${fmtDay(x.date)}`.trim()).join(' | ') || 'Sin registro',
        })
      }
    }
    const summary = result.rows.filter((r) => r.due).map((r) => ({
      Tarea: r.task.code,
      Sistema: r.task.system,
      Actividad: r.task.description,
      Frecuencia: r.task.frequency,
      'Semanas programadas': r.due,
      Cumplidas: r.done,
      Parciales: r.partial,
      'Sin registro': r.missing,
      Cumplimiento: pct(r.pct),
    }))
    exportToExcel(`cumplimiento-plan-am-${PLAN_YEAR}`, [
      { name: 'Resumen por tarea', rows: summary },
      { name: 'Semana a semana', rows: detail },
    ], { title: `CUMPLIMIENTO DEL PLAN ANUAL DE MANTENIMIENTO ${PLAN_YEAR} · SEMANAS ${fromWeek} A ${nowWeek}`, fomatCode: 'FOMAT07', module: 'Mantenimiento' })
  }

  const t = result.totals
  return (
    <div className="si-panel">
      <div className="si-toolbar">
        <label className="si-field">
          <span>Periodo evaluado</span>
          <select value={fromMode} onChange={(e) => setFromMode(e.target.value)}>
            <option value="records">Desde el primer registro (semana {firstWeek})</option>
            <option value="quarter">Últimas 12 semanas</option>
            <option value="year">Todo {PLAN_YEAR} (desde la semana 1)</option>
          </select>
        </label>
        <div className="si-seg" role="radiogroup" aria-label="Filtrar tareas">
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={statusFilter === f.id} className={statusFilter === f.id ? 'is-on' : ''} onClick={() => setStatusFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="si-actions">
          <button type="button" onClick={exportExcel} disabled={loading || !t.due}>⬇ Excel</button>
          {onReload && <button type="button" onClick={onReload} disabled={loading}>↻ Actualizar</button>}
        </div>
      </div>

      {loading ? (
        <p className="si-empty"><span className="sig-asset-spinner" aria-hidden="true" /> Cruzando el plan con los registros del último año…</p>
      ) : (
        <>
          <div className="si-kpis">
            <div className="si-kpi si-kpi-hero">
              <small>Cumplimiento semanas {fromWeek}–{nowWeek}</small>
              <strong>{pct(t.pct)}</strong>
              <Meter value={t.pct} />
            </div>
            <div className="si-kpi"><small>Semanas programadas a la fecha</small><strong>{t.due}</strong></div>
            <div className="si-kpi si-tone-ok"><small><i className="si-cell si-cell-done" aria-hidden="true" /> Cumplidas</small><strong>{t.done}</strong></div>
            <div className="si-kpi si-tone-warn"><small><i className="si-cell si-cell-partial" aria-hidden="true" /> Parciales</small><strong>{t.partial}</strong></div>
            <div className="si-kpi si-tone-bad"><small><i className="si-cell si-cell-missing" aria-hidden="true" /> Sin registro</small><strong>{t.missing}</strong></div>
          </div>

          <p className="si-note">
            Fuentes del último año: {sources.ot || 0} OT y {sources.calibracion || 0} calibraciones de IncubApp,{' '}
            {sources.mantum || 0} registros de Mántum{mantum?.generatedAt ? ` (exportación del ${new Date(mantum.generatedAt).toLocaleDateString('es-CO')})` : ''}{' '}
            y {sources.ronda || 0} reportes de ronda. Una semana cuenta como cumplida solo si hay un registro de ese equipo y de esa actividad
            dentro de su ventana; si el registro cubre parte de los equipos, vale en proporción.
            {!sources.mantum && ' Aún no hay OT de Mántum de este periodo: al importar su exportación, lo ejecutado allá se suma aquí.'}
          </p>
          {warnings.length > 0 && <p className="si-warn">No se pudo leer: {warnings.join(' · ')}</p>}

          {systems.length > 0 && (
            <details className="si-systems">
              <summary>Cumplimiento por sistema ({systems.length})</summary>
              <ul>
                {systems.map((g) => (
                  <li key={g.system}>
                    <span className="si-systems-name">{g.system}</span>
                    <Meter value={g.pct} />
                    <b>{pct(g.pct)}</b>
                    <small>{g.done} cumplidas · {g.partial} parciales · {g.missing} sin registro</small>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="si-legend" aria-hidden="true">
            <span><i className="si-cell si-cell-done" /> Cumplida</span>
            <span><i className="si-cell si-cell-partial" /> Parcial</span>
            <span><i className="si-cell si-cell-missing" /> Sin registro</span>
            <span><i className="si-cell si-cell-upcoming" /> Programada</span>
          </div>

          <div className="si-split">
            <div className="si-table-wrap">
              <table className="si-table">
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th>Actividad</th>
                    <th className="si-hide-sm">Frecuencia</th>
                    <th>Semanas</th>
                    <th>Cumpl.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="si-empty">No hay tareas con este filtro.</td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.task.code} className={selectedCode === r.task.code ? 'is-selected' : ''} onClick={() => { setSelectedCode(r.task.code); setAllWeeks(false) }}>
                      <td><button type="button" className="si-code" onClick={() => setSelectedCode(r.task.code)}>{r.task.code}</button></td>
                      <td>
                        <span className="si-activity">{r.task.description}</span>
                        <small className="si-sub">{r.task.system}</small>
                      </td>
                      <td className="si-hide-sm"><small>{r.task.frequency}</small></td>
                      <td>
                        <span className="si-strip" aria-label={`${r.done} cumplidas, ${r.partial} parciales, ${r.missing} sin registro`}>
                          {r.occurrences.map((o) => (
                            <i key={o.week} className={`si-cell si-cell-${o.status === 'upcoming' ? 'upcoming' : o.status}`} title={`Semana ${o.week} · ${OCCURRENCE_STATUS[o.status].label}${o.total > 1 && o.status !== 'upcoming' ? ` · ${o.covered} de ${o.total} equipos` : ''}`} />
                          ))}
                        </span>
                      </td>
                      <td><b className="si-pct">{pct(r.pct)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected && (
              <aside className="si-detail" aria-label={`Detalle de ${selected.task.code}`}>
                <header>
                  <div>
                    <span className="si-kicker">{selected.task.code} · {selected.task.system}</span>
                    <h3>{selected.task.description}</h3>
                    <small>{selected.task.frequency} · {selected.task.responsible} · {selected.trackable.length} equipo(s)</small>
                  </div>
                  <button type="button" className="si-close" aria-label="Cerrar detalle" onClick={() => setSelectedCode(null)}>×</button>
                </header>
                <div className="si-detail-actions">
                  {onOpenTask && <button type="button" onClick={() => onOpenTask(selected.task)}>Cómo se hace</button>}
                  <button type="button" onClick={() => openBlank(selected, null)}>FOMAT01 en blanco</button>
                </div>
                <ol className="si-occ">
                  {selected.occurrences.filter((o) => o.status !== 'upcoming').reverse().slice(0, allWeeks ? undefined : 8).map((o) => (
                    <li key={o.week} className={`si-occ-${o.status}`}>
                      <div className="si-occ-head">
                        <strong>Semana {o.week}</strong>
                        <small>{fmtDay(o.start)} – {fmtDay(new Date(o.end.getTime() - 86_400_000))}</small>
                        <span className={`si-badge si-badge-${o.status}`}>{OCCURRENCE_STATUS[o.status].label}{o.total > 1 ? ` · ${o.covered}/${o.total}` : ''}</span>
                      </div>
                      {o.records.length > 0 && (
                        <ul>
                          {o.records.slice(0, 6).map((x) => (
                            <li key={x.id}>
                              <b>{SOURCE[x.kind] || x.kind}</b> {x.code ? `${x.code} · ` : ''}{fmtDay(x.date)} · {x.title}
                              {x.personName ? ` · ${x.personName}` : ''}
                            </li>
                          ))}
                          {o.records.length > 6 && <li>… y {o.records.length - 6} más</li>}
                        </ul>
                      )}
                      {o.status !== 'done' && (
                        <button type="button" className="si-link" onClick={() => openBlank(selected, o)}>
                          Formato para diligenciar{o.total > 1 && o.covered ? ` (${o.total - o.covered} equipos)` : ''} →
                        </button>
                      )}
                    </li>
                  ))}
                  {!selected.due && <li className="si-empty">Aún no le toca ninguna semana en el periodo evaluado.</li>}
                </ol>
                {selected.due > 8 && (
                  <button type="button" className="si-link" onClick={() => setAllWeeks((v) => !v)}>
                    {allWeeks ? 'Ver solo las 8 más recientes' : `Ver las ${selected.due} semanas`}
                  </button>
                )}
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  )
}
