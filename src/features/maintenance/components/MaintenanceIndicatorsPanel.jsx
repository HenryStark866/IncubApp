/**
 * =============================================================================
 * ARCHIVO: src/features/maintenance/components/MaintenanceIndicatorsPanel.jsx
 * PROPÓSITO: Indicadores de mantenimiento (INMAT01) para líderes: en general,
 *   por persona, por actividad, por máquina, por zona o por sede, sobre el
 *   último año de registros (IncubApp + Mántum) y el cumplimiento del Plan AM.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useMemo, useState } from 'react'
import {
  buildIndicators,
  complianceByEquipment,
  complianceByPlanField,
  describeRecord,
  indicatorSheetRows,
  isCorrective,
  LENSES,
  monthlySeries,
} from '../../../lib/maintenanceIndicators'
import { computePlanCompliance, equipmentCodesOfTask, isoWeekOf, planEquipmentIndex, PLAN_YEAR } from '../../../lib/planCompliance'
import { exportToExcel } from '../../../lib/exportExcel'
import './SigInsights.css'

const RANGES = [
  { id: '12m', label: '12 meses', days: 365 },
  { id: '90d', label: '90 días', days: 90 },
  { id: '30d', label: '30 días', days: 30 },
  { id: 'year', label: `Año ${PLAN_YEAR}` },
]

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)} %`)
const hrs = (v) => (v == null ? '—' : v < 1 ? `${Math.round(v * 60)} min` : `${v.toFixed(1)} h`)
const money = (v) => (v ? v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }) : '—')
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const SOURCE = { ot: 'OT IncubApp', calibracion: 'Calibración', mantum: 'Mántum', ronda: 'Ronda' }

function rangeDates(id) {
  const to = new Date()
  const r = RANGES.find((x) => x.id === id)
  if (id === 'year') return { from: new Date(PLAN_YEAR, 0, 1), to }
  const from = new Date()
  from.setDate(from.getDate() - (r?.days || 365))
  from.setHours(0, 0, 0, 0)
  return { from, to }
}

function Trend({ series }) {
  const max = Math.max(1, ...series.map((m) => m.planned + m.corrective))
  const [hover, setHover] = useState(null)
  return (
    <figure className="si-trend">
      <figcaption>
        <strong>Registros por mes</strong>
        <span className="si-trend-legend">
          <span><i className="si-dot si-dot-planned" /> Planeado</span>
          <span><i className="si-dot si-dot-corrective" /> Correctivo</span>
        </span>
      </figcaption>
      <div className="si-trend-plot" role="img" aria-label="Registros por mes, planeado y correctivo">
        {series.map((m) => {
          const [y, mo] = m.month.split('-')
          const total = m.planned + m.corrective
          return (
            <div
              key={m.month}
              className="si-trend-col"
              onMouseEnter={() => setHover(m.month)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(m.month)}
              onBlur={() => setHover(null)}
              tabIndex={0}
            >
              <div className="si-trend-bar" style={{ height: `${(total / max) * 100}%` }}>
                {m.corrective > 0 && <span className="si-seg-corrective" style={{ flexGrow: m.corrective }} />}
                {m.planned > 0 && <span className="si-seg-planned" style={{ flexGrow: m.planned }} />}
              </div>
              <small>{MONTHS[Number(mo) - 1]}{mo === '01' ? ` ${y.slice(2)}` : ''}</small>
              {hover === m.month && (
                <span className="si-tip" role="tooltip">
                  <b>{MONTHS[Number(mo) - 1]} {y}</b>
                  <span>Planeado: {m.planned}</span>
                  <span>Correctivo: {m.corrective}</span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </figure>
  )
}

export default function MaintenanceIndicatorsPanel({ records = [], tasks = [], people = {}, roomsById = {}, plantsById = {}, loading = false, warnings = [], onReload }) {
  const [lens, setLens] = useState('general')
  const [rangeId, setRangeId] = useState('12m')
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const { from, to } = useMemo(() => rangeDates(rangeId), [rangeId])

  const planIndex = useMemo(() => planEquipmentIndex(tasks), [tasks])
  const ctx = useMemo(() => ({ roomsById, plantsById, people, planIndex }), [roomsById, plantsById, people, planIndex])
  const result = useMemo(() => buildIndicators({ records, lens, from, to, ctx }), [records, lens, from, to, ctx])
  const series = useMemo(() => monthlySeries(records, { from, to }), [records, from, to])
  const rounds = useMemo(() => records.filter((r) => r.kind === 'ronda' && r.date >= from && r.date <= to).length, [records, from, to])

  // Cumplimiento del plan en el mismo periodo (semanas del año del plan).
  const fromWeek = from.getFullYear() < PLAN_YEAR ? 1 : isoWeekOf(from).week
  const compliance = useMemo(() => {
    const knownKeys = new Set(tasks.flatMap(equipmentCodesOfTask))
    return computePlanCompliance({ tasks, records, knownKeys, fromWeek })
  }, [tasks, records, fromWeek])
  const byEquipment = useMemo(() => complianceByEquipment(compliance.rows), [compliance])
  const bySystem = useMemo(() => complianceByPlanField(compliance.rows, 'system'), [compliance])
  const bySede = useMemo(() => complianceByPlanField(compliance.rows, 'sede'), [compliance])

  const planFor = (g) => {
    if (lens === 'zona') {
      const s = bySystem.get(g.key)
      return s?.due ? s.score / s.due : null
    }
    if (lens === 'sede') {
      const s = bySede.get(g.key)
      return s?.due ? s.score / s.due : null
    }
    if (lens === 'maquina') {
      const code = [...(g.records[0]?.keys || [])].find((k) => byEquipment.has(k))
      const s = code ? byEquipment.get(code) : null
      return s?.due ? s.done / s.due : null
    }
    return undefined
  }

  const lensInfo = LENSES.find((l) => l.id === lens)
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? result.groups.filter((g) => String(g.key).toLowerCase().includes(q)) : result.groups
  }, [result, query])
  const maxTotal = Math.max(1, ...groups.map((g) => g.total))
  const o = result.overall
  const showPlan = ['zona', 'sede', 'maquina'].includes(lens)

  const exportExcel = () => {
    const sheets = [
      {
        name: 'General',
        rows: [
          { Indicador: 'Cumplimiento del Plan AM', Valor: pct(compliance.totals.pct), Detalle: `${compliance.totals.due} semanas programadas · ${compliance.totals.missing} sin registro` },
          { Indicador: 'Registros de mantenimiento', Valor: o.total, Detalle: `${o.planned} planeados · ${o.corrective} correctivos` },
          { Indicador: '% mantenimiento planeado', Valor: pct(o.pctPlanned), Detalle: 'Planeado / total' },
          { Indicador: 'Cierre de OT', Valor: pct(o.pctClosed), Detalle: `${o.open} abiertas (backlog)` },
          { Indicador: 'MTTR correctivo', Valor: hrs(o.mttrH), Detalle: `${o.ttrN} correctivos con hora de inicio y cierre` },
          { Indicador: 'Tiempo de respuesta', Valor: hrs(o.responseH), Detalle: `${o.respN} OT con hora de creación e inicio` },
          { Indicador: 'Horas de parada', Valor: Number(o.downtimeH.toFixed(1)), Detalle: 'Registradas en las OT' },
          { Indicador: 'Calibraciones', Valor: o.calibrations, Detalle: '' },
          { Indicador: 'Rondas reportadas', Valor: rounds, Detalle: '' },
        ],
      },
    ]
    if (lens !== 'general') sheets.push({ name: lensInfo.label.replace('Por ', ''), rows: indicatorSheetRows(result, lensInfo.label.replace('Por ', '')) })
    exportToExcel(`indicadores-mantenimiento-${rangeId}`, sheets, {
      title: `INDICADORES DEL PROCESO DE MANTENIMIENTO · ${from.toLocaleDateString('es-CO')} A ${to.toLocaleDateString('es-CO')}`,
      fomatCode: 'INMAT01',
      module: 'Mantenimiento',
    })
  }

  return (
    <div className="si-panel">
      <div className="si-toolbar">
        <div className="si-seg" role="tablist" aria-label="Ver indicadores">
          {LENSES.map((l) => (
            <button key={l.id} type="button" role="tab" aria-selected={lens === l.id} className={lens === l.id ? 'is-on' : ''} title={l.hint} onClick={() => { setLens(l.id); setOpenKey(null); setQuery('') }}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="si-seg si-seg-sm" role="radiogroup" aria-label="Periodo">
          {RANGES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={rangeId === r.id} className={rangeId === r.id ? 'is-on' : ''} onClick={() => setRangeId(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="si-actions">
          <button type="button" onClick={exportExcel} disabled={loading}>⬇ INMAT01</button>
          {onReload && <button type="button" onClick={onReload} disabled={loading}>↻</button>}
        </div>
      </div>

      {loading ? (
        <p className="si-empty"><span className="sig-asset-spinner" aria-hidden="true" /> Calculando indicadores…</p>
      ) : (
        <>
          <div className="si-kpis">
            <div className="si-kpi si-kpi-hero">
              <small>Cumplimiento Plan AM · semanas {fromWeek}–{isoWeekOf(new Date()).week}</small>
              <strong>{pct(compliance.totals.pct)}</strong>
              <span className="si-sub">{compliance.totals.due} semanas programadas · {compliance.totals.missing} sin registro</span>
            </div>
            <div className="si-kpi"><small>Registros</small><strong>{o.total}</strong><span className="si-sub">{o.planned} planeados · {o.corrective} correctivos</span></div>
            <div className="si-kpi"><small>% planeado</small><strong>{pct(o.pctPlanned)}</strong><span className="si-sub">meta de referencia ≥ 80 %</span></div>
            <div className="si-kpi"><small>Backlog</small><strong>{o.open}</strong><span className="si-sub">OT abiertas</span></div>
            <div className="si-kpi"><small>MTTR correctivo</small><strong>{hrs(o.mttrH)}</strong><span className="si-sub">{o.ttrN} con tiempos</span></div>
            <div className="si-kpi"><small>Respuesta</small><strong>{hrs(o.responseH)}</strong><span className="si-sub">creación → inicio</span></div>
            <div className="si-kpi"><small>Calibraciones</small><strong>{o.calibrations}</strong><span className="si-sub">{rounds} rondas reportadas</span></div>
            <div className="si-kpi"><small>Parada · costo</small><strong>{o.downtimeH ? `${o.downtimeH.toFixed(1)} h` : '—'}</strong><span className="si-sub">{money(o.cost)}</span></div>
          </div>
          {warnings.length > 0 && <p className="si-warn">No se pudo leer: {warnings.join(' · ')}</p>}

          {lens === 'general' ? (
            <>
              <Trend series={series} />
              <p className="si-note">
                Planeado = preventivo, predictivo, inspección y calibración; correctivo = atención de fallas. Los promedios
                (MTTR, respuesta) solo usan las OT que tienen las dos horas registradas: el número de la tarjeta dice cuántas.
                Elige una lente arriba para verlo por persona, actividad, máquina, zona o sede.
              </p>
            </>
          ) : (
            <>
              <div className="si-toolbar si-toolbar-sub">
                <input className="si-search" type="search" placeholder={`Buscar ${lensInfo.label.replace('Por ', '').toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar en la lista" />
                <small>{groups.length} {groups.length === 1 ? 'grupo' : 'grupos'} · {result.count} registros</small>
              </div>
              <div className="si-table-wrap">
                <table className="si-table si-table-ind">
                  <thead>
                    <tr>
                      <th>{lensInfo.label.replace('Por ', '')}</th>
                      <th>Registros</th>
                      <th className="si-hide-sm">Planeado</th>
                      <th className="si-hide-sm">Correctivo</th>
                      <th className="si-hide-sm">Abiertas</th>
                      <th className="si-hide-md">MTTR</th>
                      <th className="si-hide-md">Respuesta</th>
                      {showPlan && <th>Plan AM</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.length === 0 && <tr><td colSpan={8} className="si-empty">Sin registros en este periodo.</td></tr>}
                    {groups.map((g) => {
                      const plan = showPlan ? planFor(g) : undefined
                      const open = openKey === g.key
                      return [
                        <tr key={g.key} className={open ? 'is-selected' : ''} onClick={() => setOpenKey(open ? null : g.key)}>
                          <td>
                            <button type="button" className="si-rowbtn" aria-expanded={open}>{open ? '▾' : '▸'} {g.key}</button>
                          </td>
                          <td>
                            <span className="si-bar" title={`${g.planned} planeados · ${g.corrective} correctivos`}>
                              <span className="si-seg-planned" style={{ width: `${(g.planned / maxTotal) * 100}%` }} />
                              <span className="si-seg-corrective" style={{ width: `${(g.corrective / maxTotal) * 100}%` }} />
                            </span>
                            <b>{g.total}</b>
                          </td>
                          <td className="si-hide-sm">{g.planned} <small>({pct(g.pctPlanned)})</small></td>
                          <td className="si-hide-sm">{g.corrective}</td>
                          <td className="si-hide-sm">{g.open || '—'}</td>
                          <td className="si-hide-md">{hrs(g.mttrH)}</td>
                          <td className="si-hide-md">{hrs(g.responseH)}</td>
                          {showPlan && <td><b className="si-pct">{plan === undefined || plan === null ? '—' : pct(plan)}</b></td>}
                        </tr>,
                        open && (
                          <tr key={`${g.key}-detail`} className="si-subrow">
                            <td colSpan={showPlan ? 8 : 7}>
                              <ul className="si-reclist">
                                {g.records.slice().sort((a, b) => b.date - a.date).slice(0, 12).map((r) => {
                                  const d = describeRecord(r, ctx)
                                  return (
                                    <li key={r.id}>
                                      <span className={`si-badge ${isCorrective(r) ? 'si-badge-missing' : 'si-badge-done'}`}>{isCorrective(r) ? 'Correctivo' : 'Planeado'}</span>
                                      <b>{r.date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })}</b>
                                      <span>{r.title}</span>
                                      <small>{SOURCE[r.kind] || r.kind}{r.code ? ` ${r.code}` : ''} · {lens === 'persona' ? d.maquina : d.persona}</small>
                                    </li>
                                  )
                                })}
                                {g.records.length > 12 && <li><small>… y {g.records.length - 12} más (en el Excel INMAT01)</small></li>}
                              </ul>
                            </td>
                          </tr>
                        ),
                      ]
                    })}
                  </tbody>
                </table>
              </div>
              <p className="si-legend" aria-hidden="true">
                <span><i className="si-dot si-dot-planned" /> Planeado</span>
                <span><i className="si-dot si-dot-corrective" /> Correctivo</span>
                {showPlan && <span>Plan AM = semanas programadas con registro en el periodo</span>}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
