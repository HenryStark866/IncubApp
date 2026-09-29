/**
 * Tablero del supervisor: el turno de un vistazo y lo que hay que resolver ya,
 * con la acción al lado de cada cosa.
 *  - Semáforo del turno y 4 indicadores que llevan a su sección.
 *  - Pide atención, lo más grave primero: crear la OT de una falla, mandar a
 *    revisar una alerta, recordarle la ronda a alguien, reasignar lo estancado.
 *    Lo que ya vio lo marca «Visto» y deja de estorbar en este turno.
 *  - Ronda del turno: salas × horas en colores; al tocar una celda, sus máquinas.
 *  - Mi equipo: estado de cada persona (tarde, atrasado, sin movimiento) y su detalle.
 *  - Actividades: pendientes / en curso / hechas; asignar y reasignar aquí mismo.
 *  - Producción del día, novedades escritas del equipo, rondas con su FOMAT04 e
 *    informe del turno (FOINC02) en un toque. Se actualiza solo (en vivo).
 * Henry Stark Desarrollador · CDH Maker
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ROLE_LABEL } from '../../../lib/roles'
import { createShiftActivity, reassignShiftActivity } from '../../../hooks/useShiftOps'
import { requestSupervisionView } from '../../../lib/supervisionView'
import { requestWorkOrderFromRound } from '../../../lib/roundActions'
import { openRoundFormat } from '../../../lib/roundFormat'
import { openWorkOrderFormat } from '../../../lib/workOrderSave'
import { openRecordDocument } from '../../../lib/sigRecordDocuments'
import { buildOperationReportHtml, OPERATION_FORMAT } from '../../../lib/operationReport'
import { buildPunctuality, readMargins, shiftBounds } from '../../../lib/shiftPunctuality'
import { SHIFT_WINDOWS, clock, initials, machineHealth, productionDay, shiftTimeLeft } from '../lib/shiftHome'
import {
  activityColumns,
  assigneeOptions,
  attentionFeed,
  buildCheckActivity,
  buildRoundReminder,
  cellDetail,
  personStatusText,
  roundMatrix,
  seenKey,
  shiftStatus,
  teamBoard,
} from '../lib/supervisorHome'
import { Header, Note, ShiftRounds, TabBar } from './ShiftHomeUi'
import { Icon } from './shiftIcons'
import './ShiftForms.css'
import './SupervisorHome.css'

const COND = {
  normal: { label: 'Sin novedad', cls: 'sh-tag-ok' },
  warning: { label: 'Alerta', cls: 'sh-tag-warn' },
  fault: { label: 'Falla', cls: 'sh-tag-fault' },
  off: { label: 'Apagada', cls: 'sh-tag-muted' },
}
const PERSON_TONE = { absent: 'fault', behind: 'warn', idle: 'warn', late: 'warn', expected: 'muted', left: 'muted', ok: 'ok' }
const machineLabel = (m) => [m?.code, m?.name].filter(Boolean).join(' · ')
const hh = (h) => String(h).padStart(2, '0')
const ago = (d, now) => {
  if (!d) return ''
  const m = Math.max(0, Math.round((now - new Date(d)) / 60000))
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim()
}

function readSeen(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'))
  } catch {
    return new Set()
  }
}
function writeSeen(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch {
    /* sin almacenamiento: los vistos duran lo que dure la pantalla */
  }
}

/* ── Hoja inferior ─────────────────────────────────────────────────────── */

function Sheet({ title, sub, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="sh-root sv-sheet-root">
      <div className="sv-sheet-backdrop" onClick={onClose} role="presentation" />
      <section className="sv-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sv-sheet-grip" aria-hidden="true" />
        <header className="sv-sheet-head">
          <div>
            <h2 className="sh-h2">{title}</h2>
            {sub ? <p className="sf-hint">{sub}</p> : null}
          </div>
          <button type="button" className="sh-icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="sv-sheet-body">{children}</div>
      </section>
    </div>,
    document.body
  )
}

/* ── Asignar actividad ─────────────────────────────────────────────────── */

function AssignSheet({ preset, team, catalog, machines, onClose, onSave }) {
  const options = assigneeOptions(team)
  const [title, setTitle] = useState(preset?.title || '')
  const [description, setDescription] = useState(preset?.description || '')
  const [assignee, setAssignee] = useState(preset?.assignedTo || options[0]?.id || '')
  const [machineId, setMachineId] = useState(preset?.machineId || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async () => {
    if (!title.trim()) return setError('Escribe qué hay que hacer.')
    if (!assignee) return setError('Elige a quién.')
    setBusy(true)
    setError(null)
    const m = machines.find((x) => x.id === machineId)
    const res = await onSave({ title, description, assignedTo: assignee, machine: m || null })
    setBusy(false)
    if (res?.error) setError(res.error)
  }

  return (
    <Sheet title={preset?.sheetTitle || 'Asignar actividad'} sub="Le aparece a la persona en su inicio, en «Me asignaron»." onClose={onClose}>
      {catalog.length > 0 && !preset?.title && (
        <div className="sf-pills sv-wrap" role="group" aria-label="Actividades frecuentes">
          {catalog.slice(0, 12).map((c) => (
            <button key={c.id} type="button" aria-pressed={title === c.name} onClick={() => { setTitle(c.name); if (c.description && !description) setDescription(c.description) }}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <label className="sf-field">
        <span>Qué hay que hacer</span>
        <input className="sf-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Lavar bandejas de la nacedora 3" />
      </label>
      <label className="sf-field">
        <span>Detalle (opcional)</span>
        <textarea className="sf-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="sf-field">
        <span>A quién</span>
        {options.length === 0 ? (
          <p className="sf-hint">No hay nadie presente en el turno.</p>
        ) : (
          <div className="sv-people-pick" role="radiogroup" aria-label="Persona">
            {options.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={assignee === p.id} className="sv-pick" onClick={() => setAssignee(p.id)}>
                <span className={`sh-avatar sv-ring-${PERSON_TONE[p.status]}`}>{initials(p.name)}</span>
                <span className="sv-pick-main">
                  <strong>{p.name}</strong>
                  <small>{p.present ? `${p.acts.todo + p.acts.doing} abierta${p.acts.todo + p.acts.doing === 1 ? '' : 's'}` : 'Por llegar'}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!preset?.machineId && (
        <label className="sf-field">
          <span>Máquina (opcional)</span>
          <select className="sf-input" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">Sin máquina</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>{machineLabel(m)}</option>
            ))}
          </select>
        </label>
      )}
      {error ? <p className="sh-note" role="alert">{error}</p> : null}
      <button type="button" className="sh-btn sh-btn-primary" disabled={busy} onClick={save}>
        {Icon.task(20)}{busy ? 'Asignando…' : 'Asignar'}
      </button>
    </Sheet>
  )
}

function ReassignSheet({ activity, team, nameOf, onClose, onSave }) {
  const options = assigneeOptions(team).filter((p) => p.id !== activity.assigned_to)
  const [busy, setBusy] = useState(null)
  return (
    <Sheet title="Reasignar" sub={`«${activity.title}» · ahora con ${nameOf(activity.assigned_to) || 'nadie'}`} onClose={onClose}>
      {options.length === 0 ? (
        <p className="sf-hint">No hay otra persona presente en el turno.</p>
      ) : (
        <div className="sv-people-pick">
          {options.map((p) => (
            <button key={p.id} type="button" className="sv-pick" disabled={!!busy} onClick={async () => { setBusy(p.id); await onSave(p.id); setBusy(null) }}>
              <span className={`sh-avatar sv-ring-${PERSON_TONE[p.status]}`}>{initials(p.name)}</span>
              <span className="sv-pick-main">
                <strong>{p.name}</strong>
                <small>{busy === p.id ? 'Reasignando…' : `${p.acts.todo + p.acts.doing} abiertas · ${personStatusText(p)}`}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

/* ── Detalle de una celda del mapa ─────────────────────────────────────── */

function CellSheet({ cell, orgId, slot, plantId, data, nameOf, onClose }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const list = cellDetail({ machines: data.machines, checks: data.checks, roomId: cell.room.id, shiftDate: slot.shiftDate, shift: slot.shift, hour: cell.hour })
  const done = list.filter((x) => x.check).length
  const open = async () => {
    setBusy(true)
    setMsg(null)
    const { error } = await openRoundFormat({ orgId, shiftDate: slot.shiftDate, shiftNumber: slot.shift, hour: cell.hour, plantId })
    setBusy(false)
    if (error) setMsg(error)
  }
  return (
    <Sheet title={`${cell.room.name} · ${hh(cell.hour)}:00`} sub={`${done} de ${list.length} máquinas reportadas`} onClose={onClose}>
      <ul className="sh-list sv-cell-list">
        {list.map(({ machine, check }) => (
          <li key={machine.id}>
            <div className="sh-row sh-row-static">
              <span className="sh-row-main">
                <span className="sh-row-title">{machine.code || machine.name}</span>
                <span className="sh-row-sub">
                  {check ? [nameOf(check.taken_by), clock(check.taken_at), check.condition !== 'normal' ? check.notes : null].filter(Boolean).join(' · ') : 'Sin reportar en esta hora'}
                </span>
              </span>
              <span className={`sh-tag ${check ? COND[check.condition]?.cls || 'sh-tag-muted' : 'sh-tag-muted'}`}>{check ? COND[check.condition]?.label || check.condition : 'Falta'}</span>
            </div>
          </li>
        ))}
      </ul>
      {msg ? <p className="sh-note">{msg}</p> : null}
      <button type="button" className="sh-btn sh-btn-outline" disabled={busy || !done} onClick={open}>
        {Icon.doc(20)}{busy ? 'Generando…' : 'Ver FOMAT04 de la hora'}
      </button>
    </Sheet>
  )
}

/* ── Detalle de una persona ────────────────────────────────────────────── */

function PersonSheet({ person, minRounds, now, acts, onAssign, onRemind, go, onClose }) {
  const mine = acts.filter((a) => a.assigned_to === person.id && a.status !== 'completed')
  const pct = Math.min(100, Math.round((person.rounds / Math.max(1, minRounds)) * 100))
  const expPct = Math.min(100, Math.round((person.expectedNow / Math.max(1, minRounds)) * 100))
  return (
    <Sheet title={person.name} sub={`${ROLE_LABEL[person.role] || person.role} · ${personStatusText(person)}`} onClose={onClose}>
      <dl className="sv-facts">
        <div><dt>Ingreso</dt><dd>{person.inAt ? clock(person.inAt) : '—'}{person.lateMin ? ` · ${person.lateMin} min tarde` : person.inAt ? ' · a tiempo' : ''}</dd></div>
        <div><dt>Último registro</dt><dd>{person.lastSeen ? `${clock(person.lastSeen)} (${ago(person.lastSeen, now)})` : '—'}</dd></div>
        <div><dt>Fotos en el turno</dt><dd>{person.photos}</dd></div>
        <div><dt>Actividades</dt><dd>{person.acts.doing} en curso · {person.acts.todo} por hacer · {person.acts.done} hechas</dd></div>
      </dl>
      <div className="sf-field">
        <span>Rondas: {person.rounds} de {minRounds} · esperadas a esta hora {person.expectedNow}</span>
        <div className="sv-bar" aria-hidden="true">
          <div className={`sv-bar-fill${person.behind ? ' is-behind' : ''}`} style={{ width: `${pct}%` }} />
          <div className="sv-bar-mark" style={{ left: `${expPct}%` }} />
        </div>
      </div>
      {mine.length > 0 && (
        <ul className="sh-list sv-cell-list">
          {mine.map((a) => (
            <li key={a.id}>
              <div className="sh-row sh-row-static">
                <span className="sh-row-main">
                  <span className="sh-row-title">{a.title}</span>
                  <span className="sh-row-sub">{a.status === 'in_progress' ? `En curso desde ${clock(a.started_at)}` : `Asignada ${ago(a.created_at, now)}`}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="sv-sheet-actions">
        {(person.present || person.status === 'expected') && (
          <button type="button" className="sh-btn sh-btn-primary" onClick={onAssign}>{Icon.task(20)}Asignar actividad</button>
        )}
        {person.behind && (
          <button type="button" className="sh-btn sh-btn-outline" onClick={onRemind}>{Icon.camera(20)}Recordarle la ronda</button>
        )}
        {person.absent && (
          <button type="button" className="sh-btn sh-btn-outline" onClick={() => go('horarios')}>{Icon.clock(20)}Ver horarios</button>
        )}
      </div>
    </Sheet>
  )
}

/* ── Tablero ───────────────────────────────────────────────────────────── */

export default function SupervisorHome({ home, perf, go, orgId, userId }) {
  const { slot, data, loading } = home
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => setNow(new Date()), [data])

  const [plantPick, setPlantPick] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [actTab, setActTab] = useState('todo')
  const [toast, setToast] = useState(null)
  const [busyKey, setBusyKey] = useState(null)
  const [showSeen, setShowSeen] = useState(false)
  const [openReport, setOpenReport] = useState(null)
  const refs = { attention: useRef(null), round: useRef(null), team: useRef(null), acts: useRef(null) }

  const key = seenKey(userId, slot.shiftDate, slot.shift)
  const [seen, setSeen] = useState(() => readSeen(key))
  useEffect(() => setSeen(readSeen(key)), [key])

  const machines = useMemo(() => data?.machines || [], [data])
  const checks = useMemo(() => data?.checks || [], [data])
  const acts = useMemo(() => data?.acts || [], [data])
  const plants = useMemo(() => data?.plants || [], [data])
  const window_ = useMemo(() => shiftBounds(slot.shiftDate, slot.shift), [slot.shiftDate, slot.shift])
  const memberById = useMemo(() => Object.fromEntries((perf.members || []).map((m) => [m.id, m])), [perf.members])
  const nameOf = (id) => memberById[id]?.name || null

  // Planta: la elegida, o donde hay más fotos en el turno, o la primera.
  const plantId = useMemo(() => {
    if (plantPick) return plantPick
    const count = new Map()
    for (const c of checks) if (c.plant_id) count.set(c.plant_id, (count.get(c.plant_id) || 0) + 1)
    const busiest = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return busiest || plants[0]?.id || null
  }, [plantPick, checks, plants])

  const punctuality = useMemo(() => {
    const list = buildPunctuality({
      punches: data?.punches || [],
      assignments: data?.assignments || [],
      marginsFor: (uid) => readMargins(perf.targets || [], memberById[uid] || { id: uid }),
      from: slot.shiftDate,
      to: slot.shiftDate,
      now,
    })
    return new Map(list.filter((r) => r.shiftNumber === slot.shift).map((r) => [r.userId, r]))
  }, [data, perf.targets, memberById, slot.shiftDate, slot.shift, now])

  // Rondas del turno por persona: horas con foto (en vivo) + reportes escritos del turno.
  const roundsByUser = useMemo(() => {
    const hours = new Map()
    for (const c of checks) {
      if (!c.taken_by || !c.photo_path) continue
      if (!hours.has(c.taken_by)) hours.set(c.taken_by, new Set())
      hours.get(c.taken_by).add(Number(c.hour_slot))
    }
    const out = Object.fromEntries([...hours.entries()].map(([u, s]) => [u, s.size]))
    for (const r of perf.rounds || []) {
      if (r.source === 'photos' || r.shift_date !== slot.shiftDate || (r.shift_code && r.shift_code !== `T${slot.shift}`)) continue
      out[r.user_id] = (out[r.user_id] || 0) + 1
    }
    return out
  }, [checks, perf.rounds, slot.shiftDate, slot.shift])

  const inMin = readMargins(perf.targets || [], {}).inMin
  const team = useMemo(
    () =>
      teamBoard({
        members: perf.members || [],
        assignments: data?.assignments || [],
        punches: data?.punches || [],
        checks,
        acts,
        roundsByUser,
        punctualityOf: (uid) => punctuality.get(uid) || null,
        shift: slot.shift,
        shiftDate: slot.shiftDate,
        window: window_,
        minRounds: perf.minRounds,
        inMin,
        now,
      }),
    [perf.members, data, checks, acts, roundsByUser, punctuality, slot.shift, slot.shiftDate, window_, perf.minRounds, inMin, now]
  )

  const matrix = useMemo(
    () => roundMatrix({ machines, rooms: data?.rooms || [], checks, plantId, shiftDate: slot.shiftDate, shift: slot.shift, currentHour: slot.hour }),
    [machines, data, checks, plantId, slot.shiftDate, slot.shift, slot.hour]
  )
  const hourNow = matrix.currentIndex >= 0 ? matrix.byHour[matrix.currentIndex] : null
  const minutesLeft = 60 - now.getMinutes()
  const health = useMemo(() => machineHealth(checks, machines), [checks, machines])
  const feed = useMemo(
    () =>
      attentionFeed({
        machineIssues: health.attention,
        openOrdersByMachine: data?.openOrdersByMachine || new Map(),
        team,
        acts,
        round: hourNow ? { pending: hourNow.total - hourNow.done, minutesLeft, hour: slot.hour } : null,
        now,
      }),
    [health, data, team, acts, hourNow, minutesLeft, slot.hour, now]
  )
  const visible = feed.filter((i) => !seen.has(i.key))
  const hidden = feed.length - visible.length
  const status = shiftStatus(visible)
  const cols = useMemo(() => activityColumns(acts), [acts])
  const production = useMemo(() => productionDay({ loads: data?.loads || [], transfers: data?.transfers || [], hatches: data?.hatches || [] }), [data])
  const written = useMemo(
    () =>
      (perf.rounds || [])
        .filter((r) => r.source !== 'photos' && r.shift_date === slot.shiftDate && (!r.shift_code || r.shift_code === `T${slot.shift}`))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [perf.rounds, slot.shiftDate, slot.shift]
  )

  const say = (text, kind = 'ok') => {
    setToast({ text, kind })
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 4000)
  }
  const refresh = () => {
    home.reload()
    perf.reload?.()
  }
  const scrollTo = (k) => refs[k]?.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  const markSeen = (k) => {
    const next = new Set(seen)
    next.add(k)
    setSeen(next)
    writeSeen(key, next)
  }
  const unseeAll = () => {
    setSeen(new Set())
    writeSeen(key, new Set())
    setShowSeen(false)
  }

  const assign = async ({ title, description, assignedTo, machine }) => {
    const res = await createShiftActivity({
      org_id: orgId,
      plant_id: machine?.plant_id || plantId || null,
      room_id: machine?.room_id || null,
      machine_id: machine?.id || null,
      title,
      description: description?.trim() || null,
      assigned_to: assignedTo,
      assigned_by: userId,
    })
    if (!res.error) {
      setSheet(null)
      say(`Asignada a ${nameOf(assignedTo) || 'la persona'}: le aparece en su inicio.`)
      home.reload()
    }
    return res
  }

  const runAction = async (item) => {
    const a = item.action?.id
    if (a === 'create_ot') {
      setBusyKey(item.key)
      const machine = machines.find((m) => m.id === item.machineId)
      const res = await requestWorkOrderFromRound({ orgId, userId, machine, condition: 'fault', alarmType: item.issue?.notes?.split(' — ')[0] || 'Falla', note: item.issue?.notes })
      setBusyKey(null)
      if (res.error) say(res.error, 'error')
      else {
        say(`OT creada para ${machine?.code || 'la máquina'}: mantenimiento ya la ve.`)
        home.reload()
      }
    } else if (a === 'open_ot') {
      setBusyKey(item.key)
      await openWorkOrderFormat({ order: item.order, machine: machines.find((m) => m.id === item.machineId), nameOf })
      setBusyKey(null)
    } else if (a === 'assign_check') {
      const machine = machines.find((m) => m.id === item.machineId)
      const row = buildCheckActivity({ issue: item.issue, machine, orgId, userId })
      setSheet({ kind: 'assign', preset: { sheetTitle: `Mandar a revisar ${item.issue.code}`, title: row.title, description: row.description, machineId: item.machineId } })
    } else if (a === 'remind') {
      const person = team.people.find((p) => p.id === item.personId)
      if (!person) return
      setBusyKey(item.key)
      const res = await createShiftActivity(buildRoundReminder({ person, hour: slot.hour, orgId, userId }))
      setBusyKey(null)
      if (res.error) say(res.error, 'error')
      else {
        markSeen(item.key)
        say(`Recordatorio enviado a ${person.name}: le aparece en «Me asignaron».`)
        home.reload()
      }
    } else if (a === 'reassign') {
      setSheet({ kind: 'reassign', activity: item.activity })
    } else if (a === 'person') {
      setSheet({ kind: 'person', personId: item.personId })
    } else if (a === 'open_round') {
      requestSupervisionView('ronda')
      go('supervision')
    } else if (a === 'horarios') {
      go('horarios')
    }
  }

  const shiftReport = () => {
    const people = Object.fromEntries((perf.members || []).map((m) => [m.id, { name: m.name, role: m.role }]))
    const machineName = Object.fromEntries(machines.map((m) => [m.id, machineLabel(m)]))
    const inShift = (iso) => iso && window_ && new Date(iso) >= window_.start && new Date(iso) < window_.end
    const html = buildOperationReportHtml({
      assignments: (data?.assignments || []).filter((a) => Number(a.shift_number) === slot.shift),
      checks,
      loads: (data?.loads || []).filter((l) => inShift(l.loaded_at || l.created_at)),
      transfers: (data?.transfers || []).filter((t) => inShift(t.transferred_at || t.created_at)),
      activities: acts,
      people,
      machineName,
      plantName: plants.find((p) => p.id === plantId)?.name,
      desde: slot.shiftDate,
      hasta: slot.shiftDate,
    })
    openRecordDocument({ html, title: `${OPERATION_FORMAT.code} · Turno ${slot.shift} · ${slot.shiftDate}` })
  }

  const person = sheet?.kind === 'person' ? team.people.find((p) => p.id === sheet.personId) : null
  const list = cols[actTab]

  return (
    <>
      <Header
        eyebrow={`Turno ${slot.shift} · ${SHIFT_WINDOWS[slot.shift]?.label || ''} · ${shiftTimeLeft(slot.shift, now)}`}
        title="Tablero del turno"
        chips={
          <>
            <span className={`sh-chip ${home.live ? 'sh-chip-ok' : 'sh-chip-neutral'}`} title={home.live ? 'Se actualiza solo cuando el equipo registra algo' : 'Actualiza con el botón'}>
              <span className={`sh-dot${home.live ? ' sv-live' : ''}`} />
              {home.live ? 'En vivo' : 'Sin conexión en vivo'}{home.updatedAt ? ` · ${clock(home.updatedAt)}` : ''}
            </span>
            {plants.length > 1 &&
              plants.map((p) => (
                <button key={p.id} type="button" className={`sh-chip ${p.id === plantId ? 'sh-chip-warn' : 'sh-chip-neutral'}`} aria-pressed={p.id === plantId} onClick={() => setPlantPick(p.id)}>
                  {p.name}
                </button>
              ))}
          </>
        }
        onRefresh={refresh}
        loading={loading}
      />
      <div className="sh-body">
        <Note error={home.error} />

        <section className={`sh-hero sv-hero sv-hero-${status.tone}`} aria-label="Estado del turno">
          <div className="sh-hero-row">
            <span className="sh-hero-label">Estado del turno</span>
            <button type="button" className="sv-hero-link" onClick={shiftReport} disabled={!data}>{Icon.doc(16)}Informe del turno</button>
          </div>
          <button type="button" className="sv-headline" onClick={() => scrollTo('attention')}>
            <span className={`sv-light sv-light-${status.tone}`} aria-hidden="true" />
            <span>{loading && !data ? 'Cargando el turno…' : status.headline}</span>
          </button>
          <div className="sv-kpis">
            <button type="button" className="sv-kpi" onClick={() => scrollTo('team')}>
              <span className="sv-kpi-label">Equipo</span>
              <span className="sv-kpi-value">{team.present}<small>/{team.total}</small></span>
              <span className={`sv-kpi-sub${team.absent.length ? ' is-bad' : ''}`}>{team.absent.length ? `${team.absent.length} sin llegar` : team.total ? 'completo' : 'sin programar'}</span>
            </button>
            <button type="button" className="sv-kpi" onClick={() => scrollTo('round')}>
              <span className="sv-kpi-label">Ronda {hh(slot.hour)}:00</span>
              <span className="sv-kpi-value">{hourNow?.done ?? 0}<small>/{matrix.total}</small></span>
              <span className={`sv-kpi-sub${hourNow && hourNow.done < hourNow.total && minutesLeft <= 15 ? ' is-bad' : ''}`}>quedan {minutesLeft} min</span>
            </button>
            <button type="button" className="sv-kpi" onClick={() => scrollTo('attention')}>
              <span className="sv-kpi-label">Máquinas</span>
              <span className="sv-kpi-value">{health.fault + health.warning}</span>
              <span className={`sv-kpi-sub${health.fault ? ' is-bad' : ''}`}>{health.fault || health.warning ? `${health.fault} falla · ${health.warning} alerta` : 'sin novedad'}</span>
            </button>
            <button type="button" className="sv-kpi" onClick={() => scrollTo('acts')}>
              <span className="sv-kpi-label">Actividades</span>
              <span className="sv-kpi-value">{cols.todo.length + cols.doing.length}</span>
              <span className="sv-kpi-sub">{cols.done.length} hechas hoy</span>
            </button>
          </div>
        </section>

        <div className="sh-section-head" ref={refs.attention}>
          <h2 className="sh-h2">Pide atención</h2>
          {hidden > 0 ? (
            <button type="button" className="sh-link" onClick={() => setShowSeen((v) => !v)}>{showSeen ? 'Ocultar vistos' : `${hidden} visto${hidden === 1 ? '' : 's'}`}</button>
          ) : (
            <span className="sh-count">{visible.length}</span>
          )}
        </div>
        <div className="sh-card">
          {visible.length === 0 && !showSeen ? (
            <p className="sh-empty sv-calm">{loading && !data ? 'Cargando…' : 'Nada pendiente. Sin fallas sin OT, ausencias ni atrasos en rondas.'}</p>
          ) : (
            <ul className="sh-list">
              {(showSeen ? feed : visible).map((item) => (
                <li key={item.key} className={`sv-item sv-item-${item.tone}${seen.has(item.key) ? ' is-seen' : ''}`}>
                  <span className="sv-item-dot" aria-hidden="true" />
                  <span className="sh-row-main">
                    <span className="sh-row-title">{item.title}</span>
                    <span className="sh-row-sub">{item.sub}</span>
                  </span>
                  <span className="sv-item-actions">
                    {item.action && (
                      <button type="button" className={`sv-act${item.tone === 'fault' ? ' sv-act-strong' : ''}`} disabled={busyKey === item.key} onClick={() => runAction(item)}>
                        {busyKey === item.key ? '…' : item.action.label}
                      </button>
                    )}
                    {!seen.has(item.key) && (
                      <button type="button" className="sv-seen" aria-label={`Marcar como visto: ${item.title}`} title="Visto" onClick={() => markSeen(item.key)}>✓</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {showSeen && hidden > 0 && (
            <button type="button" className="sh-link sv-unsee" onClick={unseeAll}>Volver a mostrar todo</button>
          )}
        </div>

        <div className="sh-section-head" ref={refs.round}>
          <h2 className="sh-h2">Ronda del turno</h2>
          <span className="sh-count">{matrix.rows.length} salas · {matrix.total} máquinas</span>
        </div>
        <div className="sh-card sh-card-pad sv-matrix-card">
          {matrix.rows.length === 0 ? (
            <p className="sh-empty">{loading && !data ? 'Cargando…' : 'Esta planta no tiene salas de ronda con máquinas.'}</p>
          ) : (
            <>
              <div className="sv-matrix" role="grid" aria-label="Máquinas reportadas por sala y hora" style={{ gridTemplateColumns: `minmax(64px, 1.4fr) repeat(${matrix.hours.length}, minmax(0, 1fr))` }}>
                <span className="sv-mx-corner" />
                {matrix.hours.map((h, i) => (
                  <span key={h} className={`sv-mx-hour${i === matrix.currentIndex ? ' is-now' : ''}`}>{h}</span>
                ))}
                {matrix.rows.map((row) => (
                  <MatrixRow key={row.room.id} row={row} onOpen={(cell) => setSheet({ kind: 'cell', cell: { ...cell, room: row.room } })} />
                ))}
                <span className="sv-mx-room sv-mx-total">Total</span>
                {matrix.byHour.map((b) => (
                  <span key={b.hour} className={`sv-mx-sum${b.state === 'current' ? ' is-now' : ''}`}>{b.state === 'future' ? '' : `${b.total ? Math.round((b.done / b.total) * 100) : 0}%`}</span>
                ))}
              </div>
              <div className="sv-legend" aria-hidden="true">
                <span><i className="sv-sw sv-c-ok" />Sin novedad</span>
                <span><i className="sv-sw sv-c-partial" />Incompleta</span>
                <span><i className="sv-sw sv-c-warning" />Alerta</span>
                <span><i className="sv-sw sv-c-fault" />Falla</span>
                <span><i className="sv-sw sv-c-missing" />Sin ronda</span>
              </div>
            </>
          )}
          <button type="button" className="sh-btn sh-btn-outline" onClick={() => runAction({ action: { id: 'open_round' } })}>{Icon.camera(20)}Ir a la ronda</button>
        </div>

        <div className="sh-section-head" ref={refs.team}>
          <h2 className="sh-h2">Mi equipo</h2>
          <span className="sh-count">{team.present} de {team.total} presentes</span>
        </div>
        <div className="sh-card">
          {team.people.length === 0 ? (
            <p className="sh-empty">{perf.loading ? 'Cargando…' : 'Nadie programado en este turno. Asigna el turno en Horarios.'}</p>
          ) : (
            <ul className="sh-list">
              {team.people.map((p) => {
                const tone = PERSON_TONE[p.status]
                return (
                  <li key={p.id}>
                    <button type="button" className="sh-row" onClick={() => setSheet({ kind: 'person', personId: p.id })}>
                      <span className={`sh-avatar sv-ring-${tone}${p.present ? '' : ' sh-avatar-off'}`} aria-hidden="true">{initials(p.name)}</span>
                      <span className="sh-row-main">
                        <span className="sh-row-title">{p.name}</span>
                        <span className={`sh-row-sub sv-sub-${tone}`}>{personStatusText(p)}</span>
                      </span>
                      {p.present || p.left ? (
                        <span className="sv-mini">
                          <span className="sv-mini-num">{p.rounds}/{perf.minRounds}</span>
                          <span className="sv-mini-bar"><i className={p.behind ? 'is-behind' : ''} style={{ width: `${Math.min(100, (p.rounds / Math.max(1, perf.minRounds)) * 100)}%` }} /></span>
                        </span>
                      ) : (
                        <span className={`sh-tag ${p.absent ? 'sh-tag-fault' : 'sh-tag-muted'}`}>{p.absent ? 'Ausente' : 'Por llegar'}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="sh-section-head" ref={refs.acts}>
          <h2 className="sh-h2">Actividades</h2>
          <button type="button" className="sh-link" onClick={() => setSheet({ kind: 'assign' })}>+ Nueva</button>
        </div>
        <div className="sf-seg sv-tabs" role="tablist" aria-label="Actividades por estado">
          {[
            ['todo', 'Pendientes', cols.todo.length],
            ['doing', 'En curso', cols.doing.length],
            ['done', 'Hechas', cols.done.length],
          ].map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={actTab === k} aria-pressed={actTab === k} className="sf-seg-ok" onClick={() => setActTab(k)}>
              {label} {n}
            </button>
          ))}
        </div>
        <div className="sh-card">
          {list.length === 0 ? (
            <p className="sh-empty">{actTab === 'todo' ? 'Nada pendiente.' : actTab === 'doing' ? 'Nadie tiene actividades en curso.' : 'Aún no hay actividades terminadas hoy.'}</p>
          ) : (
            <ul className="sh-list">
              {list.map((a) => {
                const m = machines.find((x) => x.id === a.machine_id)
                return (
                  <li key={a.id}>
                    <div className="sh-row sh-row-static">
                      <span className={`sh-avatar sv-avatar-sm${a.assigned_to ? '' : ' sh-avatar-off'}`} aria-hidden="true">{initials(nameOf(a.assigned_to) || '?')}</span>
                      <span className="sh-row-main">
                        <span className="sh-row-title">{a.title}</span>
                        <span className="sh-row-sub">
                          {[
                            nameOf(a.assigned_to) || 'Sin asignar',
                            m ? m.code || m.name : null,
                            actTab === 'todo' ? `asignada ${ago(a.created_at, now)}` : actTab === 'doing' ? `desde ${clock(a.started_at)}` : `${a.completion === 'partial' ? 'parcial' : 'completa'} ${clock(a.completed_at)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {actTab === 'done' && a.result_note ? <span className="sh-row-sub">«{a.result_note}»</span> : null}
                      </span>
                      {actTab !== 'done' && (
                        <button type="button" className="sv-act" onClick={() => setSheet({ kind: 'reassign', activity: a })}>Reasignar</button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="sh-section-head">
          <h2 className="sh-h2">Producción de hoy</h2>
        </div>
        <div className="sh-grid-3 sh-stats">
          <button type="button" className="sh-card sh-stat sv-stat" onClick={() => { requestSupervisionView('cargue'); go('supervision') }}>
            <span className="sh-tile-label">Cargues</span>
            <span className="sh-stat-num">{production.loads.done}<span className="sh-stat-of"> / {production.loads.done + production.loads.pending}</span></span>
          </button>
          <button type="button" className="sh-card sh-stat sv-stat" onClick={() => { requestSupervisionView('transferencia'); go('supervision') }}>
            <span className="sh-tile-label">Transferencias</span>
            <span className="sh-stat-num">{production.transfers.done}</span>
          </button>
          <button type="button" className="sh-card sh-stat sv-stat" onClick={() => { requestSupervisionView('nacimiento'); go('supervision') }}>
            <span className="sh-tile-label">Nacimientos</span>
            <span className="sh-stat-num">{production.hatches.done}<span className="sh-stat-of"> / {production.hatches.total}</span></span>
          </button>
        </div>

        {written.length > 0 && (
          <>
            <div className="sh-section-head">
              <h2 className="sh-h2">Novedades escritas</h2>
              <span className="sh-count">{written.length}</span>
            </div>
            <div className="sh-card">
              <ul className="sh-list">
                {written.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="sh-row" aria-expanded={openReport === r.id} onClick={() => setOpenReport((v) => (v === r.id ? null : r.id))}>
                      <span className="sh-row-time">{clock(r.created_at)}</span>
                      <span className="sh-row-main">
                        <span className="sh-row-title">{r.title}</span>
                        <span className={`sh-row-sub${openReport === r.id ? ' sv-open' : ' sv-clamp'}`}>{nameOf(r.user_id) || 'Operario'}{r.body ? ` · ${r.body}` : ''}</span>
                      </span>
                      {/entrega/i.test(r.title || '') ? <span className="sh-tag sh-tag-accent">Entrega</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <ShiftRounds orgId={orgId} slot={slot} checks={checks} loading={loading && !data} />

        <div className="sh-grid-2">
          <button type="button" className="sh-btn sh-btn-primary" style={{ fontSize: 15 }} onClick={() => setSheet({ kind: 'assign' })}>
            {Icon.task(20)}Asignar actividad
          </button>
          <button type="button" className="sh-btn sh-btn-outline" style={{ fontSize: 15 }} onClick={shiftReport} disabled={!data}>
            {Icon.doc(20)}Informe del turno
          </button>
        </div>
        <p className="sf-hint sv-foot">El informe del turno sale en el {OPERATION_FORMAT.code} ({OPERATION_FORMAT.name.toLowerCase()}) con asistencia, rondas, novedades y actividades.</p>
      </div>
      <div className="sh-spacer" />
      <TabBar
        go={go}
        items={[
          { label: 'Turno', tab: 'hoy', icon: Icon.clock, current: true },
          { label: 'Planta', tab: 'monitoreo', icon: Icon.plant },
          { label: 'OT', tab: 'mantenimiento', icon: Icon.wrench },
          { label: 'Reportes', tab: 'cumplimiento', icon: Icon.bars },
        ]}
      />

      {toast && (
        <div className={`sv-toast sv-toast-${toast.kind}`} role="status" aria-live="polite">{toast.text}</div>
      )}
      {sheet?.kind === 'assign' && (
        <AssignSheet preset={sheet.preset} team={team} catalog={data?.catalog || []} machines={machines} onClose={() => setSheet(null)} onSave={assign} />
      )}
      {sheet?.kind === 'reassign' && (
        <ReassignSheet
          activity={sheet.activity}
          team={team}
          nameOf={nameOf}
          onClose={() => setSheet(null)}
          onSave={async (uid) => {
            const res = await reassignShiftActivity(sheet.activity.id, uid)
            if (res.error) say(res.error, 'error')
            else {
              setSheet(null)
              say(`«${sheet.activity.title}» ahora es de ${nameOf(uid)}.`)
              home.reload()
            }
          }}
        />
      )}
      {sheet?.kind === 'cell' && data && (
        <CellSheet cell={sheet.cell} orgId={orgId} slot={slot} plantId={plantId} data={data} nameOf={nameOf} onClose={() => setSheet(null)} />
      )}
      {person && (
        <PersonSheet
          person={person}
          minRounds={perf.minRounds}
          now={now}
          acts={acts}
          go={go}
          onClose={() => setSheet(null)}
          onAssign={() => setSheet({ kind: 'assign', preset: { assignedTo: person.id } })}
          onRemind={() => runAction({ key: `behind-${person.id}`, personId: person.id, action: { id: 'remind' } })}
        />
      )}
    </>
  )
}

function MatrixRow({ row, onOpen }) {
  return (
    <>
      <span className="sv-mx-room" title={row.room.name}>{row.room.name}</span>
      {row.cells.map((cell) => {
        const complete = cell.total > 0 && cell.done === cell.total
        const tone =
          cell.state === 'future'
            ? 'future'
            : cell.worst === 'fault'
              ? 'fault'
              : cell.worst === 'warning'
                ? 'warning'
                : complete
                  ? 'ok'
                  : cell.done > 0
                    ? 'partial'
                    : cell.state === 'current'
                      ? 'pending'
                      : 'missing'
        return (
          <button
            key={cell.hour}
            type="button"
            className={`sv-mx-cell sv-c-${tone}${cell.state === 'current' ? ' is-now' : ''}`}
            disabled={cell.state === 'future'}
            onClick={() => onOpen(cell)}
            aria-label={`${row.room.name} ${hh(cell.hour)}:00 · ${cell.done} de ${cell.total}`}
          >
            {cell.state === 'future' ? '' : complete && tone === 'ok' ? '✓' : `${cell.done}/${cell.total}`}
          </button>
        )
      })}
    </>
  )
}
