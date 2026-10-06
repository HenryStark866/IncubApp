/**
 * Plan AM y manuales de una sede: qué toca esta semana, el plan completo por sistema
 * (cada actividad abre su instructivo: pasos PROMAT01 + pasos técnicos del manual) y
 * los manuales e instructivos para ver o descargar.
 * Lo usan el líder de granja (sede fija), los auxiliares y el líder de mantenimiento.
 * Usa el estilo de los inicios (ShiftHome.css, prefijo sh-) más PlanAmCenter.css (pa-).
 * Henry Stark Desarrollador
 */
import { useMemo, useState } from 'react'
import annualPlan from '../../../data/annualMaintenancePlanData.json'
import { isoWeekOf } from '../../../lib/planCompliance'
import { manualKind, manualsForSede, manualTitle } from '../../../lib/planManuals'
import PlanTaskInstructions from './PlanTaskInstructions'
import '../../shift/components/ShiftHome.css'
import './PlanAmCenter.css'

export const PLAN_SEDES = [
  { value: 'GRANJA LA FE', label: 'Granja La Fe' },
  { value: 'PLANTA INCUBANT', label: 'Planta Incubant' },
  { value: 'GRANJA LA ESPERANZA', label: 'Granja La Esperanza' },
]

const FREQ_ORDER = ['Única', 'Diaria', 'Semanal', 'Mensual', 'Trimestral', 'Semestral', 'Anual', 'Por vacío', 'Por ciclo']
const freqRank = (f = '') => {
  const i = FREQ_ORDER.findIndex((k) => f.startsWith(k))
  return i === -1 ? FREQ_ORDER.length : i
}
const freqGroup = (f = '') => FREQ_ORDER.find((k) => f.startsWith(k)) || 'Otra'
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** «RECOLECCIÓN DE HUEVO» → «Recolección de huevo». */
const titleCase = (s) => String(s || '').toLowerCase().replace(/^\S/, (c) => c.toUpperCase())

function TaskRow({ task, onOpen, note }) {
  return (
    <li>
      <button type="button" className="sh-row" onClick={() => onOpen(task)}>
        <span className="pa-code">{task.code}</span>
        <span className="sh-row-main">
          <span className="sh-row-title">{task.description}</span>
          <span className="sh-row-sub">
            {task.frequency} · {task.responsible}
            {note ? ` · ${note}` : ''}
          </span>
          <span className="pa-badges">
            {task.isCriticalSecurity && <span className="pa-badge pa-badge-crit">Crítica</span>}
            {/bioseguridad|legal/i.test(task.type) && <span className="pa-badge pa-badge-bio">{task.type}</span>}
            {task.manual && task.manual !== '—' && <span className="pa-badge">{task.manual}</span>}
          </span>
        </span>
        <span className="sh-tag sh-tag-accent">Ver cómo ›</span>
      </button>
    </li>
  )
}

function Section({ title, count, children }) {
  return (
    <>
      <div className="sh-section-head">
        <h2 className="sh-h2">{title}</h2>
        {count != null && <span className="sh-count">{count}</span>}
      </div>
      {children}
    </>
  )
}

export default function PlanAmCenter({ sede: initialSede = 'GRANJA LA FE', lockSede = false, embedded = false, now = new Date() }) {
  const [sede, setSede] = useState(initialSede)
  const [view, setView] = useState('semana')
  const [query, setQuery] = useState('')
  const [freq, setFreq] = useState('')
  const [open, setOpen] = useState(null)

  const tasks = useMemo(() => (annualPlan.tasks || []).filter((t) => t.sede === sede), [sede])
  const week = isoWeekOf(now).week
  const manuals = useMemo(() => manualsForSede(sede), [sede])

  const thisWeek = useMemo(() => tasks.filter((t) => (t.cronograma?.weeks || []).includes(week)), [tasks, week])
  const nextWeek = useMemo(() => tasks.filter((t) => (t.cronograma?.weeks || []).includes(week + 1)), [tasks, week])
  const daily = useMemo(() => tasks.filter((t) => /^Diaria/.test(t.frequency)), [tasks])
  const startsAt = tasks.find((t) => t.cronograma?.vigenteDesdeSemana)?.cronograma.vigenteDesdeSemana

  const freqs = useMemo(() => [...new Set(tasks.map((t) => freqGroup(t.frequency)))].sort((a, b) => freqRank(a) - freqRank(b)), [tasks])
  const filtered = useMemo(() => {
    const q = norm(query)
    return tasks.filter(
      (t) =>
        (!freq || freqGroup(t.frequency) === freq) &&
        (!q || norm([t.code, t.description, t.equipmentClass, t.system, t.responsible].join(' ')).includes(q))
    )
  }, [tasks, query, freq])
  const bySystem = useMemo(() => {
    const map = new Map()
    for (const t of filtered) {
      if (!map.has(t.system)) map.set(t.system, [])
      map.get(t.system).push(t)
    }
    for (const list of map.values()) list.sort((a, b) => freqRank(a.frequency) - freqRank(b.frequency) || a.code.localeCompare(b.code))
    return [...map.entries()]
  }, [filtered])

  const sedeLabel = PLAN_SEDES.find((s) => s.value === sede)?.label || titleCase(sede)
  const views = [
    ['semana', 'Esta semana'],
    ['plan', 'Plan completo'],
    ['manuales', 'Manuales e instructivos'],
  ]

  const body = (
    <>
      <div className="pa-toolbar">
        <div className="pa-tabs" role="tablist" aria-label="Plan AM">
          {views.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'pa-tab pa-tab-on' : 'pa-tab'} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        {!lockSede && (
          <select className="pa-select" value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
            {PLAN_SEDES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )}
      </div>

      {tasks.length === 0 && <p className="sh-empty">No hay actividades del Plan AM para {sedeLabel}.</p>}

      {tasks.length > 0 && view === 'semana' && (
        <>
          <Section title={`Semana ${week}`} count={`${thisWeek.length} actividades`}>
            <div className="sh-card">
              {thisWeek.length ? (
                <ul className="sh-list">{thisWeek.map((t) => <TaskRow key={t.code} task={t} onOpen={setOpen} />)}</ul>
              ) : (
                <p className="sh-empty">
                  {startsAt && week < startsAt
                    ? `El plan de ${sedeLabel} empieza a regir en la semana ${startsAt}.`
                    : 'No hay actividades programadas esta semana.'}
                </p>
              )}
            </div>
          </Section>
          {nextWeek.length > 0 && (
            <Section title={`Próxima semana (${week + 1})`} count={`${nextWeek.length} actividades`}>
              <div className="sh-card">
                <ul className="sh-list">{nextWeek.map((t) => <TaskRow key={t.code} task={t} onOpen={setOpen} />)}</ul>
              </div>
            </Section>
          )}
          {daily.length > 0 && (
            <Section title="Rondas diarias" count={`${daily.length} revisiones`}>
              <div className="sh-card">
                <ul className="sh-list">{daily.map((t) => <TaskRow key={t.code} task={t} onOpen={setOpen} />)}</ul>
              </div>
            </Section>
          )}
          <p className="pa-hint">Toca una actividad para ver cómo se hace, quién la hace, qué se registra y el manual del equipo.</p>
        </>
      )}

      {tasks.length > 0 && view === 'plan' && (
        <>
          <div className="pa-filters">
            <input className="pa-search" type="search" placeholder="Buscar: chumacera, banda, LF-162, tablero…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar actividad" />
            <div className="sh-chips">
              <button type="button" className={`sh-chip ${freq ? 'sh-chip-neutral' : 'sh-chip-ok'}`} onClick={() => setFreq('')}>Todas ({tasks.length})</button>
              {freqs.map((f) => (
                <button key={f} type="button" className={`sh-chip ${freq === f ? 'sh-chip-ok' : 'sh-chip-neutral'}`} onClick={() => setFreq(freq === f ? '' : f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {bySystem.length === 0 && <p className="sh-empty">Nada coincide con la búsqueda.</p>}
          {bySystem.map(([system, list]) => (
            <details key={system} className="sh-card pa-system" open={Boolean(query || freq) || bySystem.length === 1}>
              <summary>
                <span>{titleCase(system)}</span>
                <span className="sh-count">{list.length}</span>
              </summary>
              <ul className="sh-list">{list.map((t) => <TaskRow key={t.code} task={t} onOpen={setOpen} />)}</ul>
            </details>
          ))}
        </>
      )}

      {view === 'manuales' && (
        <Section title="Manuales e instructivos" count={`${manuals.length} documentos`}>
          <div className="sh-card">
            {manuals.length ? (
              <ul className="sh-list">
                {manuals.map((m) => (
                  <li key={m.id} className="pa-doc">
                    <span className={`pa-doc-kind pa-doc-${manualKind(m).toLowerCase()}`}>{manualKind(m)}</span>
                    <span className="sh-row-main">
                      <span className="sh-row-title">{manualTitle(m)}</span>
                      <span className="sh-row-sub">{m.file_type === 'spreadsheet' ? 'Excel' : 'Word'}</span>
                    </span>
                    <a className="pa-doc-btn" href={m.url} download={m.file_name}>Descargar</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sh-empty">Aún no hay manuales propios cargados para {sedeLabel}.</p>
            )}
          </div>
          <p className="pa-hint">Los documentos se abren en Word o Excel. Cada actividad del plan también trae su manual dentro de «Ver cómo».</p>
        </Section>
      )}

      {open && <PlanTaskInstructions task={open} onClose={() => setOpen(null)} />}
    </>
  )

  if (embedded) return <div className="pa-embedded">{body}</div>
  return (
    <div className="sh-root pa-root">
      <header className="sh-header">
        <p className="sh-eyebrow">Plan AM · {sedeLabel}</p>
        <h1 className="sh-title">Plan de mantenimiento</h1>
        <div className="sh-chips">
          <span className="sh-chip sh-chip-neutral">{tasks.length} actividades</span>
          <span className="sh-chip sh-chip-warn">{thisWeek.length} esta semana</span>
          <span className="sh-chip sh-chip-neutral">{manuals.length} documentos</span>
        </div>
      </header>
      <div className="sh-body">{body}</div>
    </div>
  )
}
