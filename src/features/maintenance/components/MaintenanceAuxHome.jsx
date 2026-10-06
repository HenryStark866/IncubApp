/**
 * Inicio del auxiliar de mantenimiento: lo que le toca del Plan AM esta semana,
 * ejecutarlo con su lista de chequeo y evidencias, reportar los trabajos hechos
 * en el turno y ver lo registrado con su formato del SIG (FOMAT01 / FOMAT04).
 * Las calibraciones se registran en el módulo de calibración (FOMAT08).
 * Usa el estilo de los inicios de planta (ShiftHome.css, prefijo sh-).
 * Henry Stark Desarrollador · CDH Maker
 */
import { useEffect, useMemo, useState } from 'react'
import { useMaintenanceAuxHome } from '../hooks/useMaintenanceAuxHome'
import {
  REPORT_KINDS,
  RESULT_LABEL,
  SPECIALTIES,
  buildPlanOrderRow,
  buildShiftReportRow,
  checklistForReport,
  checklistForTask,
  checklistSummary,
  formatOfOrder,
  machinesForTask,
  planWorkForAux,
  readableText,
  validateWork,
} from '../lib/maintenanceShift'
import { SIG_FORMATS } from '../../../lib/corporateBrand'
import { isoWeekOf } from '../../../lib/planCompliance'
import PlanTaskInstructions from './PlanTaskInstructions'
import { EvidencePicker } from '../../shift/components/ShiftForms'
import { setAssistantContext } from '../../../lib/assistantContext'
import { maintenanceSnapshot } from '../../shift/lib/assistantSnapshots'
import '../../shift/components/ShiftHome.css'
import '../../shift/components/ShiftForms.css'
import './MaintenanceAuxHome.css'

const svg = (children, size = 22) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
const Icon = {
  wrench: (s) => svg(<path d="M14 3l7 7-11 11H3v-7z" />, s),
  check: (s) => svg(<><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></>, s),
  doc: (s) => svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>, s),
  alert: (s) => svg(<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>, s),
  camera: (s) => svg(<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>, s),
  calibrate: (s) => svg(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="4" /></>, s),
  back: (s) => svg(<path d="M15 18l-6-6 6-6" />, s),
  refresh: (s) => svg(<><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>, s),
  plus: (s) => svg(<path d="M12 5v14M5 12h14" />, s),
}

const SHIFT_LABEL = { 1: '06:00 – 14:00', 2: '14:00 – 22:00', 3: '22:00 – 06:00' }
const SEDES = [
  { value: 'PLANTA INCUBANT', label: 'Planta' },
  { value: 'GRANJA LA FE', label: 'Granja La Fe' },
  { value: 'GRANJA LA ESPERANZA', label: 'Granja La Esperanza' },
  { value: '', label: 'Todas las sedes' },
]
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '')
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const machineLabel = (m) => [m?.code, m?.name].filter(Boolean).join(' · ')

/** Hora de inicio «HH:MM» de hoy → Date (si queda en el futuro, era de ayer: turno de noche). */
function startFromTime(value, now = new Date()) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return null
  const [h, m] = value.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  if (d > now) d.setDate(d.getDate() - 1)
  return d
}

/* ── Piezas ─────────────────────────────────────────────────────────────── */

function Checklist({ items, onChange }) {
  const set = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  return (
    <ol className="ma-checklist">
      {items.map((it, i) => (
        <li key={it.id} className={`ma-check ma-check-${it.result || 'none'}`}>
          <span className="ma-check-label">{it.label}</span>
          <div className="sf-seg" role="group" aria-label={it.label}>
            {['ok', 'fail', 'na'].map((r) => (
              <button key={r} type="button" aria-pressed={it.result === r} className={`sf-seg-${r}`} onClick={() => set(i, { result: r })}>
                {RESULT_LABEL[r]}
              </button>
            ))}
          </div>
          {(it.result === 'fail' || it.note) && (
            <input
              className="sf-input"
              type="text"
              value={it.note}
              placeholder={it.result === 'fail' ? '¿Qué encontraste? (obligatorio)' : 'Observación'}
              onChange={(e) => set(i, { note: e.target.value })}
            />
          )}
        </li>
      ))}
    </ol>
  )
}

function WorkFields({ form, setForm, now }) {
  return (
    <div className="sf-grid-2">
      <label className="sf-field">
        <span>Empecé a las</span>
        <input className="sf-input" type="time" value={form.startTime} max={hhmm(now)} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
      </label>
      <label className="sf-field">
        <span>Parada del equipo (min)</span>
        <input className="sf-input" type="number" min="0" inputMode="numeric" value={form.downtime} onChange={(e) => setForm({ ...form, downtime: e.target.value })} />
      </label>
    </div>
  )
}

function Saved({ result, onOpenFormat, onBack }) {
  const fmt = formatOfOrder(result.order)
  return (
    <div className="sh-body">
      <section className={`sh-card sh-card-pad sf-saved${result.offline ? ' sf-saved-offline' : ''}`}>
        <span className="sh-badge sh-badge-accent">{Icon.check(22)}</span>
        <h2 className="sh-h2">{result.offline ? 'Guardado en el teléfono' : 'Trabajo registrado'}</h2>
        <p className="sf-hint">
          {result.offline
            ? 'No hay conexión: la OT y sus evidencias suben solas cuando vuelva la red.'
            : `OT ${result.order.code || ''} cerrada. Su ${fmt} quedó diligenciado con la lista de chequeo y las evidencias.`}
          {result.finding ? ' Se abrió una OT correctiva por lo que quedó No OK.' : ''}
        </p>
        {(result.warnings || []).map((w) => (
          <p key={w} className="sh-note">{w}</p>
        ))}
        {!result.offline && (
          <button type="button" className="sh-btn sh-btn-primary" onClick={() => onOpenFormat(result.order)}>
            {Icon.doc(20)}Ver {fmt}
          </button>
        )}
        <button type="button" className="sh-btn sh-btn-outline" onClick={onBack}>Volver al inicio</button>
      </section>
    </div>
  )
}

function Back({ onBack, eyebrow, title }) {
  return (
    <header className="sh-header">
      <div className="sh-header-top">
        <button type="button" className="sh-icon-btn" onClick={onBack} aria-label="Volver">{Icon.back(20)}</button>
        <p className="sh-eyebrow">{eyebrow}</p>
        <span style={{ width: 40 }} />
      </div>
      <h1 className="sh-title ma-title">{title}</h1>
    </header>
  )
}

/* ── Ejecutar una tarea del plan ───────────────────────────────────────── */

function TaskScreen({ item, api, userId, userName, orgId, go, onBack }) {
  const { task, format } = item
  const now = api.now
  const options = useMemo(() => machinesForTask(task, api.machines), [task, api.machines])
  const [form, setForm] = useState({
    machineId: options.length === 1 ? options[0].id : '',
    startTime: hhmm(new Date(Date.now() - 30 * 60000)),
    downtime: '0',
    notes: '',
  })
  const [checklist, setChecklist] = useState(() => checklistForTask(task))
  const [files, setFiles] = useState([])
  const [openFinding, setOpenFinding] = useState(true)
  const [showSteps, setShowSteps] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const summary = checklistSummary(checklist)

  if (result) return <Saved result={result} onOpenFormat={api.openOrderFormat} onBack={onBack} />

  const save = async () => {
    const problem = validateWork({ checklist, downtimeMinutes: form.downtime })
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    const machine = options.find((m) => m.id === form.machineId) || null
    const row = buildPlanOrderRow({
      task,
      machine,
      checklist,
      notes: form.notes,
      downtimeMinutes: form.downtime,
      startedAt: startFromTime(form.startTime, new Date()),
      completedAt: new Date(),
      orgId,
      userId,
      userName,
      plantId: api.plants[0]?.id || null,
    })
    const res = await api.saveWork({ row, files, openFinding: openFinding && summary.fail > 0 })
    if (res.error) setError(res.error)
    else setResult(res)
  }

  return (
    <>
      <Back onBack={onBack} eyebrow={`Plan AM · ${task.code} · semana ${item.week}`} title={readableText(task.description)} />
      <div className="sh-body">
        <section className="sh-card sh-card-pad ma-facts">
          <dl>
            <div><dt>Sistema</dt><dd>{readableText(task.system)}</dd></div>
            <div><dt>Equipo</dt><dd>{task.equipmentClass}</dd></div>
            <div><dt>Códigos</dt><dd>{task.applyingEquipment || '—'}</dd></div>
            <div><dt>Frecuencia</dt><dd>{task.frequency}</dd></div>
            <div><dt>Sede</dt><dd>{task.sede}</dd></div>
            <div><dt>Formato</dt><dd>{format.code} · {format.name}</dd></div>
          </dl>
          <button type="button" className="sh-link" onClick={() => setShowSteps(true)}>Cómo se hace (PROMAT01)</button>
        </section>

        {format.goTo === 'calibracion' && (
          <section className="sh-card sh-card-pad ma-callout">
            <p>
              Esta tarea es de calibración: las lecturas contra el patrón se registran en <strong>Calibración</strong> y
              llenan el {SIG_FORMATS.FOMAT08.code}. Si solo verificaste sin calibrar, regístrala aquí abajo.
            </p>
            <button type="button" className="sh-btn sh-btn-primary" onClick={() => go('calibracion')}>
              {Icon.calibrate(20)}Registrar calibración
            </button>
          </section>
        )}

        {options.length > 0 && (
          <label className="sf-field">
            <span>Equipo intervenido</span>
            <select className="sf-input" value={form.machineId} onChange={(e) => setForm({ ...form, machineId: e.target.value })}>
              <option value="">{options.length > 1 ? `Todos los de la tarea (${options.length})` : 'Sin elegir'}</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>{machineLabel(m)}</option>
              ))}
            </select>
          </label>
        )}

        <div className="sh-section-head">
          <h2 className="sh-h2">Lista de chequeo</h2>
          <span className="sh-count">{summary.total - summary.pending} de {summary.total}</span>
        </div>
        <Checklist items={checklist} onChange={setChecklist} />
        {summary.fail > 0 && (
          <label className="sf-toggle">
            <input type="checkbox" checked={openFinding} onChange={(e) => setOpenFinding(e.target.checked)} />
            Abrir una OT correctiva por lo que quedó No OK
          </label>
        )}

        <WorkFields form={form} setForm={setForm} now={now} />
        <label className="sf-field">
          <span>Observaciones</span>
          <textarea className="sf-input" rows={3} value={form.notes} placeholder="Repuestos, mediciones, lo que quedó pendiente…" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>

        <div className="sh-section-head"><h2 className="sh-h2">Evidencias</h2><span className="sh-count">{files.length}</span></div>
        <EvidencePicker files={files} onChange={setFiles} />

        {error ? <p className="sh-note" role="alert">{error}</p> : null}
        <button type="button" className="sh-btn sh-btn-primary sf-save" disabled={api.saving} onClick={save}>
          {Icon.check(20)}{api.saving ? 'Guardando…' : `Guardar y llenar ${format.code === 'FOMAT08' ? 'FOMAT01' : format.code}`}
        </button>
      </div>
      {showSteps && <PlanTaskInstructions task={task} onClose={() => setShowSteps(false)} />}
    </>
  )
}

/* ── Reportar un trabajo del turno ─────────────────────────────────────── */

function ReportScreen({ api, userId, userName, orgId, onBack }) {
  const now = api.now
  const [form, setForm] = useState({
    kind: 'corrective',
    title: '',
    description: '',
    machineId: '',
    place: '',
    startTime: hhmm(new Date(Date.now() - 30 * 60000)),
    downtime: '0',
    notes: '',
  })
  const [checklist, setChecklist] = useState(checklistForReport)
  const [files, setFiles] = useState([])
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const kind = REPORT_KINDS.find((k) => k.value === form.kind) || REPORT_KINDS[0]
  const machines = useMemo(() => [...api.machines].sort((a, b) => machineLabel(a).localeCompare(machineLabel(b))), [api.machines])

  if (result) return <Saved result={result} onOpenFormat={api.openOrderFormat} onBack={onBack} />

  const save = async () => {
    const problem = validateWork({ checklist, downtimeMinutes: form.downtime, title: form.title, requireTitle: true })
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    const row = buildShiftReportRow({
      kind: form.kind,
      title: form.title,
      description: form.description,
      machine: machines.find((m) => m.id === form.machineId) || null,
      locationName: form.place,
      checklist,
      notes: form.notes,
      downtimeMinutes: form.downtime,
      startedAt: startFromTime(form.startTime, new Date()),
      completedAt: new Date(),
      orgId,
      userId,
      userName,
      plantId: api.plants[0]?.id || null,
    })
    const res = await api.saveWork({ row, files })
    if (res.error) setError(res.error)
    else setResult(res)
  }

  return (
    <>
      <Back onBack={onBack} eyebrow={`Turno ${api.shift.shiftNumber} · reporte de trabajo`} title="¿Qué hiciste?" />
      <div className="sh-body">
        <label className="sf-field">
          <span>Tipo de trabajo</span>
          <select className="sf-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {REPORT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label} · {k.format}</option>
            ))}
          </select>
        </label>
        <label className="sf-field">
          <span>Trabajo realizado</span>
          <input className="sf-input" type="text" value={form.title} placeholder="Ej.: Cambio de rodamiento del ventilador" onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <div className="sf-grid-2">
          <label className="sf-field">
            <span>Equipo</span>
            <select className="sf-input" value={form.machineId} onChange={(e) => setForm({ ...form, machineId: e.target.value })}>
              <option value="">Otro lugar / sin equipo</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{machineLabel(m)}</option>
              ))}
            </select>
          </label>
          {!form.machineId && (
            <label className="sf-field">
              <span>Lugar</span>
              <input className="sf-input" type="text" value={form.place} placeholder="Ej.: Cuarto de máquinas" onChange={(e) => setForm({ ...form, place: e.target.value })} />
            </label>
          )}
        </div>
        <label className="sf-field">
          <span>Qué pasaba y qué hiciste</span>
          <textarea className="sf-input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>

        <div className="sh-section-head"><h2 className="sh-h2">Cierre</h2></div>
        <Checklist items={checklist} onChange={setChecklist} />
        <WorkFields form={form} setForm={setForm} now={now} />
        <label className="sf-field">
          <span>Observaciones</span>
          <textarea className="sf-input" rows={2} value={form.notes} placeholder="Repuestos usados, pendientes…" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>

        <div className="sh-section-head"><h2 className="sh-h2">Evidencias</h2><span className="sh-count">{files.length}</span></div>
        <EvidencePicker files={files} onChange={setFiles} />

        {error ? <p className="sh-note" role="alert">{error}</p> : null}
        <button type="button" className="sh-btn sh-btn-primary sf-save" disabled={api.saving} onClick={save}>
          {Icon.check(20)}{api.saving ? 'Guardando…' : `Guardar y llenar ${kind.format}`}
        </button>
      </div>
    </>
  )
}

/* ── Inicio ────────────────────────────────────────────────────────────── */

function PlanRow({ item, onOpen }) {
  const { task, format } = item
  return (
    <li>
      <button type="button" className="sh-row" onClick={() => onOpen(item)}>
        <span className={`sh-badge ${item.done ? 'sh-badge-blue' : item.overdue ? 'sh-badge-warn' : 'sh-badge-accent'}`}>
          {format.code === 'FOMAT08' ? Icon.calibrate(18) : format.code === 'FOMAT04' ? Icon.check(18) : Icon.wrench(18)}
        </span>
        <span className="sh-row-main">
          <span className="sh-row-title sf-clamp">{readableText(task.description)}</span>
          <span className="sh-row-sub">
            {[task.code, readableText(task.system), task.equipmentClass, task.frequency].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="ma-tags">
          {item.done ? (
            <span className="sh-tag sh-tag-ok">Cumplida</span>
          ) : item.overdue ? (
            <span className="sh-tag sh-tag-fault">{item.weeksLate > 8 ? '+8 sem.' : `${item.weeksLate} sem.`}</span>
          ) : item.partial ? (
            <span className="sh-tag sh-tag-warn">Parcial</span>
          ) : null}
          <span className="sh-tag sh-tag-muted">{format.code}</span>
        </span>
      </button>
    </li>
  )
}

export default function MaintenanceAuxHome({ orgId, userId, userName, onNavigate, defaultSede = null }) {
  const api = useMaintenanceAuxHome({ orgId, userId, userName })
  const go = (tab) => onNavigate?.(tab)
  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const [screen, setScreen] = useState({ kind: 'home' })
  const [specialty, setSpecialty] = useState('')
  // Con sede asignada (p. ej. auxiliares de G-GRANJA LA FE) abre en el plan de esa sede.
  const [sede, setSede] = useState(defaultSede || 'PLANTA INCUBANT')
  const [query, setQuery] = useState('')
  const [showLate, setShowLate] = useState(false)
  const [showAllLate, setShowAllLate] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [busyFormat, setBusyFormat] = useState(null)

  const work = useMemo(
    () => planWorkForAux(api.compliance?.rows || [], { now: api.now, specialty: specialty || null, sede: sede || null }),
    [api.compliance, api.now, specialty, sede]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return work
    return work.filter((w) => [w.task.code, w.task.description, w.task.system, w.task.equipmentClass, w.task.applyingEquipment].some((v) => String(v || '').toLowerCase().includes(q)))
  }, [work, query])
  const pending = filtered.filter((w) => !w.done)
  const done = filtered.filter((w) => w.done)
  // Esta semana primero; lo atrasado aparte, lo más reciente arriba (lo viejo suele ser anual).
  const thisWeek = pending.filter((w) => !w.overdue)
  const late = pending.filter((w) => w.overdue).sort((a, b) => a.weeksLate - b.weeksLate)
  const week = isoWeekOf(api.now).week
  const weekItems = work.filter((w) => w.thisWeek)
  const weekDone = weekItems.filter((w) => w.done).length
  const weekPending = weekItems.length - weekDone
  const lateAll = work.filter((w) => w.overdue).length

  // Lo que el asistente de voz sabe del turno de mantenimiento.
  useEffect(() => {
    setAssistantContext(
      maintenanceSnapshot({
        nombre: first,
        shift: api.shift,
        thisWeek,
        late,
        weekItems: weekItems.length,
        weekDone,
        assigned: api.assigned,
        doneInShift: api.myShiftOrders.length,
        label: (t) => readableText(t.description),
      })
    )
  })

  const openFormat = async (order) => {
    setBusyFormat(order.id)
    try {
      await api.openOrderFormat(order)
    } finally {
      setBusyFormat(null)
    }
  }
  const home = () => {
    setScreen({ kind: 'home' })
    window.scrollTo?.({ top: 0 })
  }

  if (screen.kind === 'task') {
    return (
      <div className="sh-root ma-root">
        <TaskScreen item={screen.item} api={api} orgId={orgId} userId={userId} userName={userName} go={go} onBack={home} />
      </div>
    )
  }
  if (screen.kind === 'report') {
    return (
      <div className="sh-root ma-root">
        <ReportScreen api={api} orgId={orgId} userId={userId} userName={userName} onBack={home} />
      </div>
    )
  }

  const visibleLate = showAllLate ? late : late.slice(0, 10)
  return (
    <div className="sh-root ma-root">
      <header className="sh-header">
        <div className="sh-header-top">
          <p className="sh-eyebrow">Mantenimiento · Turno {api.shift.shiftNumber} · {SHIFT_LABEL[api.shift.shiftNumber]}</p>
          <button type="button" className="sh-icon-btn" onClick={api.reload} disabled={api.loading} aria-label="Actualizar">
            <span className={api.loading ? 'sh-spin' : undefined} style={{ display: 'inline-flex' }}>{Icon.refresh(20)}</span>
          </button>
        </div>
        <h1 className="sh-title">{first ? `Hola, ${first}` : 'Mi turno de mantenimiento'}</h1>
        <div className="sh-chips">
          <button type="button" className={`sh-chip ${api.assigned.length ? 'sh-chip-warn' : 'sh-chip-ok'}`} onClick={() => go('mantenimiento')}>
            <span className="sh-dot" />{api.assigned.length} OT por atender
          </button>
        </div>
      </header>

      <div className="sh-body">
        {api.warnings.length ? <p className="sh-note">No se pudo cargar {api.warnings.join(', ')}.</p> : null}

        <section className="sh-hero" aria-label="Plan AM de la semana">
          <div className="sh-hero-row">
            <span className="sh-hero-label">Plan AM · semana {week}</span>
            <span>{lateAll ? `${lateAll} atrasada${lateAll === 1 ? '' : 's'}` : 'Sin atrasos'}</span>
          </div>
          <div className="sh-big">
            <span className={`sh-big-num${api.loading && !api.compliance ? ' sh-loading' : ''}`}>{weekPending}</span>
            <span className="sh-big-unit">por hacer de {weekItems.length} esta semana</span>
          </div>
          <div className="sf-progress" aria-hidden="true">
            <div style={{ width: `${weekItems.length ? Math.round((weekDone / weekItems.length) * 100) : 0}%` }} />
          </div>
          <p className="sh-hero-sub">
            Cada tarea se cumple desde su semana del cronograma hasta la siguiente. Al guardarla queda su OT con el formato del SIG y sus evidencias.
          </p>
          <button type="button" className="sh-btn sh-btn-hero" onClick={() => setScreen({ kind: 'report' })}>
            {Icon.plus(22)}Reportar trabajo del turno
          </button>
        </section>

        <div className="sf-filters">
          <div className="sf-pills" role="group" aria-label="Especialidad">
            {['', ...SPECIALTIES].map((s) => (
              <button key={s || 'all'} type="button" aria-pressed={specialty === s} onClick={() => setSpecialty(s)}>
                {s || 'Todas'}
              </button>
            ))}
          </div>
          <div className="sf-grid-2">
            <select className="sf-input" value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
              {SEDES.map((s) => (
                <option key={s.label} value={s.value}>{s.label}</option>
              ))}
            </select>
            <input className="sf-input" type="search" value={query} placeholder="Buscar tarea o equipo" onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <div className="sh-section-head">
          <h2 className="sh-h2">Esta semana</h2>
          <span className="sh-count">{thisWeek.length}</span>
        </div>
        <div className="sh-card">
          {thisWeek.length === 0 ? (
            <p className="sh-empty">
              {api.loading && !api.compliance ? 'Cargando el plan…' : 'Nada pendiente del plan para esta semana con estos filtros.'}
            </p>
          ) : (
            <ul className="sh-list">
              {thisWeek.map((w) => (
                <PlanRow key={w.task.code} item={w} onOpen={(item) => setScreen({ kind: 'task', item })} />
              ))}
            </ul>
          )}
        </div>

        {late.length > 0 && (
          <>
            <div className="sh-section-head">
              <h2 className="sh-h2">Atrasadas</h2>
              <button type="button" className="sh-link" onClick={() => setShowLate((v) => !v)}>
                {showLate ? 'Ocultar' : `Ver ${late.length}`}
              </button>
            </div>
            {showLate && (
              <div className="sh-card">
                <ul className="sh-list">
                  {visibleLate.map((w) => (
                    <PlanRow key={w.task.code} item={w} onOpen={(item) => setScreen({ kind: 'task', item })} />
                  ))}
                  {late.length > visibleLate.length && (
                    <li>
                      <button type="button" className="sh-row" onClick={() => setShowAllLate(true)}>
                        <span className="sh-row-main"><span className="sh-row-title">Ver las {late.length}</span></span>
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="sh-section-head">
          <h2 className="sh-h2">Hecho en mi turno</h2>
          <span className="sh-count">{api.myShiftOrders.length}</span>
        </div>
        <div className="sh-card">
          {api.myShiftOrders.length === 0 ? (
            <p className="sh-empty">Aún no has registrado trabajos en este turno.</p>
          ) : (
            <ul className="sh-list">
              {api.myShiftOrders.map((o) => {
                const fmt = formatOfOrder(o)
                return (
                  <li key={o.id}>
                    <button type="button" className="sh-row" onClick={() => openFormat(o)} disabled={busyFormat === o.id}>
                      <span className="sh-badge sh-badge-blue">{Icon.doc(18)}</span>
                      <span className="sh-row-main">
                        <span className="sh-row-title">{o.title}</span>
                        <span className="sh-row-sub">
                          {clock(o.completed_at)}
                          {o.code ? ` · ${o.code}` : ''}
                          {api.machineById[o.machine_id] ? ` · ${machineLabel(api.machineById[o.machine_id])}` : ''}
                        </span>
                      </span>
                      <span className="sh-tag sh-tag-accent">{busyFormat === o.id ? 'Abriendo…' : `Ver ${fmt}`}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="sh-section-head">
          <h2 className="sh-h2">OT asignadas</h2>
          <span className="sh-count">{api.assigned.length}</span>
        </div>
        <div className="sh-card">
          {api.assigned.length === 0 ? (
            <p className="sh-empty">No tienes órdenes de trabajo pendientes.</p>
          ) : (
            <ul className="sh-list">
              {api.assigned.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <button type="button" className="sh-row" onClick={() => go('mantenimiento')}>
                    <span className={`sh-badge ${o.priority === 'critical' || o.priority === 'high' ? 'sh-badge-warn' : 'sh-badge-accent'}`}>{Icon.alert(18)}</span>
                    <span className="sh-row-main">
                      <span className="sh-row-title">{o.title}</span>
                      <span className="sh-row-sub">
                        {o.code || ''}
                        {api.machineById[o.machine_id] ? ` · ${machineLabel(api.machineById[o.machine_id])}` : o.location_name ? ` · ${o.location_name}` : ''}
                      </span>
                    </span>
                    <span className={`sh-tag ${o.assigned_to === userId ? 'sh-tag-accent' : 'sh-tag-muted'}`}>
                      {o.assigned_to === userId ? (o.status === 'in_progress' ? 'En curso' : 'Asignada') : 'Sin asignar'}
                    </span>
                  </button>
                </li>
              ))}
              {api.assigned.length > 5 && (
                <li>
                  <button type="button" className="sh-row" onClick={() => go('mantenimiento')}>
                    <span className="sh-row-main"><span className="sh-row-title">Ver las {api.assigned.length} en Órdenes de trabajo</span></span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        {done.length > 0 && (
          <>
            <div className="sh-section-head">
              <h2 className="sh-h2">Cumplidas en su periodo</h2>
              <button type="button" className="sh-link" onClick={() => setShowDone((v) => !v)}>
                {showDone ? 'Ocultar' : `Ver ${done.length}`}
              </button>
            </div>
            {showDone && (
              <div className="sh-card">
                <ul className="sh-list">
                  {done.map((w) => (
                    <PlanRow key={w.task.code} item={w} onOpen={(item) => setScreen({ kind: 'task', item })} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="ma-links">
          <button type="button" className="sh-btn sh-btn-outline" onClick={() => go('calibracion')}>{Icon.calibrate(20)}Calibración (FOMAT08)</button>
          <button type="button" className="sh-btn sh-btn-outline" onClick={() => go('mantenimiento')}>{Icon.wrench(20)}Órdenes de trabajo</button>
        </div>
      </div>
    </div>
  )
}
