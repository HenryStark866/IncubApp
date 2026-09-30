/**
 * Inicio del operario de turno (y del auxiliar de turno): su turno completo en
 * una pantalla.
 *  - Asistencia: marca el ingreso y la salida con selfie aquí mismo y ve si llegó a tiempo.
 *  - Ronda de la hora: cuántas máquinas faltan sala por sala y «Continuar ronda».
 *  - Me asignaron: inicia y termina sus actividades con foto sin salir del inicio.
 *  - Novedades: reporta una falla o incidencia con foto (OT para mantenimiento,
 *    FOMAT06) y escribe la novedad o la entrega de turno (cuenta como ronda).
 *  - Hecho hoy, rondas con su FOMAT04, próximo turno, cumplimiento y accesos
 *    a cargue, transferencia, calibración, mercancía, OT y máquinas.
 * Henry Stark Desarrollador · CDH Maker
 */
import { useMemo, useRef, useState } from 'react'
import { useAttendance } from '../../../hooks/useAttendance'
import { completeShiftActivity, startShiftActivity } from '../../../hooks/useShiftOps'
import { requestSupervisionView } from '../../../lib/supervisionView'
import { openWorkOrderFormat, saveWorkOrderWithEvidence } from '../../../lib/workOrderSave'
import { workOrderFormatCode } from '../../../lib/sigRecordDocuments'
import { SHIFT_WINDOWS as PUNCT_WINDOWS, describeDelta, shiftBounds } from '../../../lib/shiftPunctuality'
import { SHIFT_WINDOWS, clock, machineHealth, roundsPace, shiftTimeLeft } from '../lib/shiftHome'
import {
  INCIDENT_PRIORITIES,
  INCIDENT_TYPES,
  WRITTEN_REPORTS,
  activityBuckets,
  attendanceStage,
  buildIncidentOrder,
  pickRoundPlant,
  roundHourStatus,
  shortcutsFor,
  upcomingShifts,
} from '../lib/operatorHome'
import { Header, Note, ShiftRounds, TabBar } from './ShiftHomeUi'
import { EvidencePicker, Segmented } from './ShiftForms'
import { Icon } from './shiftIcons'
import './ShiftForms.css'
import './OperatorHome.css'

const machineLabel = (m) => [m?.code, m?.name].filter(Boolean).join(' · ')

function Back({ onBack, eyebrow, title }) {
  return (
    <header className="sh-header">
      <div className="sh-header-top">
        <button type="button" className="sh-icon-btn" onClick={onBack} aria-label="Volver">{Icon.back(20)}</button>
        <p className="sh-eyebrow">{eyebrow}</p>
        <span style={{ width: 40 }} />
      </div>
      <h1 className="sh-title op-title">{title}</h1>
    </header>
  )
}

function Done({ title, text, warnings = [], action, onBack }) {
  return (
    <div className="sh-body">
      <section className="sh-card sh-card-pad sf-saved">
        <span className="sh-badge sh-badge-accent">{Icon.task(22)}</span>
        <h2 className="sh-h2">{title}</h2>
        <p className="sf-hint">{text}</p>
        {warnings.map((w) => (
          <p key={w} className="sh-note">{w}</p>
        ))}
        {action}
        <button type="button" className="sh-btn sh-btn-outline" onClick={onBack}>Volver al inicio</button>
      </section>
    </div>
  )
}

/* ── Asistencia ────────────────────────────────────────────────────────── */

function AttendanceCard({ att, stage, slot }) {
  const input = useRef(null)
  const [type, setType] = useState('in')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const p = att.punctuality

  const ask = (t) => {
    setType(t)
    setMsg(null)
    input.current?.click()
  }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMsg({ kind: 'info', text: 'Tomando la ubicación GPS y guardando…' })
    const res = await att.punch({ type, photoFile: file })
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else setMsg({ kind: 'ok', text: `${type === 'in' ? 'Ingreso' : 'Salida'} marcado${res.local ? ' en el teléfono (se sube al volver la red)' : ''}.` })
  }

  const w = PUNCT_WINDOWS[slot.shift]
  const late = p && (p.inStatus === 'late' || p.outStatus === 'early')
  // «12 min tarde» / «a tiempo» al llegar; al cerrar el turno, también la salida.
  const arrival = p ? (p.inStatus === 'late' ? `Llegaste ${describeDelta(p.inDeltaMin)}` : 'Llegaste a tiempo') : null
  const leaving = p?.outAt ? (p.outStatus === 'early' ? `saliste ${describeDelta(p.outDeltaMin, { earlyWord: 'antes', lateWord: 'después' })}` : 'saliste a tiempo') : null

  return (
    <section className={`sh-card sh-card-pad op-att op-att-${stage.stage}${late ? ' op-att-late' : ''}`} aria-label="Asistencia">
      <input ref={input} type="file" accept="image/*" capture="user" hidden onChange={onFile} />
      {stage.stage === 'in' ? (
        <>
          <div className="op-att-head">
            <span className="sh-badge sh-badge-warn">{Icon.selfie(20)}</span>
            <div>
              <p className="op-att-title">Marca tu ingreso</p>
              <p className="sf-hint">Turno {slot.shift} empieza a las {w.start}. Tolerancia {att.margins.inMin} min. Selfie y GPS obligatorios.</p>
            </div>
          </div>
          <button type="button" className="sh-btn sh-btn-primary" disabled={busy} onClick={() => ask('in')}>
            {Icon.selfie(20)}{busy ? 'Marcando…' : 'Selfie y marcar ingreso'}
          </button>
        </>
      ) : stage.stage === 'inside' ? (
        <>
          <div className="op-att-head">
            <span className={`sh-badge ${late ? 'sh-badge-warn' : 'sh-badge-blue'}`}>{Icon.clock(20)}</span>
            <div>
              <p className="op-att-title">Ingreso {clock(stage.inPunch?.punched_at)}</p>
              <p className="sf-hint">
                {arrival || 'Adentro'} · tolerancia {att.margins.inMin} min{stage.inPunch?.site_name ? ` · ${stage.inPunch.site_name}` : ''}
              </p>
            </div>
            {!stage.suggestOut && (
              <button type="button" className="sh-link op-att-out" disabled={busy} onClick={() => ask('out')}>Marcar salida</button>
            )}
          </div>
          {stage.suggestOut && (
            <button type="button" className="sh-btn sh-btn-primary" disabled={busy} onClick={() => ask('out')}>
              {Icon.exit(20)}{busy ? 'Marcando…' : `Selfie y marcar salida (${w.end})`}
            </button>
          )}
        </>
      ) : (
        <div className="op-att-head">
          <span className={`sh-badge ${late ? 'sh-badge-warn' : 'sh-badge-blue'}`}>{Icon.exit(20)}</span>
          <div>
            <p className="op-att-title">Turno cerrado · salida {clock(stage.outPunch?.punched_at)}</p>
            <p className="sf-hint">{arrival ? [arrival, leaving].filter(Boolean).join(' · ') : 'Ingreso y salida registrados.'}</p>
          </div>
          <button type="button" className="sh-link op-att-out" disabled={busy} onClick={() => ask('in')}>Nuevo ingreso</button>
        </div>
      )}
      {msg ? <p className={msg.kind === 'error' ? 'sh-note' : 'sf-hint'} role="status">{msg.text}</p> : null}
    </section>
  )
}

/* ── Terminar una actividad ────────────────────────────────────────────── */

function ActivityScreen({ act, orgId, machines, onBack, onSaved }) {
  const [completion, setCompletion] = useState('complete')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const machine = machines.find((m) => m.id === act.machine_id)

  if (result) {
    return (
      <Done
        title={result.offline ? 'Guardada en el teléfono' : 'Actividad terminada'}
        text={result.offline ? 'Sin conexión: se cierra sola cuando vuelva la señal.' : 'Quedó registrada con su evidencia; el supervisor ya la ve.'}
        onBack={onBack}
      />
    )
  }

  const save = async () => {
    if (completion === 'partial' && !note.trim()) {
      setError('Si quedó parcial, explica qué faltó.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await completeShiftActivity(orgId, act.id, { completion, resultQty: qty, resultNote: note, file: files[0] || null })
    setBusy(false)
    if (res.error) setError(res.error)
    else {
      setResult(res)
      onSaved()
    }
  }

  return (
    <>
      <Back onBack={onBack} eyebrow="Actividad asignada" title={act.title || 'Actividad'} />
      <div className="sh-body">
        {act.description || machine ? (
          <section className="sh-card sh-card-pad">
            {act.description ? <p className="op-text">{act.description}</p> : null}
            {machine ? <p className="sf-hint">Equipo: {machineLabel(machine)}</p> : null}
            {act.started_at ? <p className="sf-hint">Iniciada a las {clock(act.started_at)}</p> : null}
          </section>
        ) : null}
        <div className="sf-field">
          <span>¿Cómo quedó?</span>
          <Segmented
            label="Resultado"
            value={completion}
            onChange={setCompletion}
            options={[
              { value: 'complete', label: 'Completa', tone: 'ok' },
              { value: 'partial', label: 'Parcial', tone: 'fail' },
            ]}
          />
        </div>
        <label className="sf-field">
          <span>Cantidad (si aplica)</span>
          <input className="sf-input" type="number" min="0" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="sf-field">
          <span>{completion === 'partial' ? 'Qué faltó y por qué' : 'Observación'}</span>
          <textarea className="sf-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <EvidencePicker files={files} onChange={setFiles} accept="image/*" capture="environment" multiple={false} addLabel="Foto" hint="Una foto de cómo quedó el trabajo." />
        {error ? <p className="sh-note" role="alert">{error}</p> : null}
        <button type="button" className="sh-btn sh-btn-primary sf-save" disabled={busy} onClick={save}>
          {Icon.task(20)}{busy ? 'Guardando…' : 'Terminar actividad'}
        </button>
      </div>
    </>
  )
}

/* ── Reportar falla o incidencia ───────────────────────────────────────── */

function IncidentScreen({ orgId, userId, data, preset, onBack, onSaved }) {
  const machines = useMemo(() => [...(data?.machines || [])].filter((m) => m.status !== 'decommissioned').sort((a, b) => machineLabel(a).localeCompare(machineLabel(b))), [data])
  const rooms = data?.rooms || []
  const [form, setForm] = useState({
    machineId: preset?.machineId || '',
    roomId: '',
    type: preset?.type || '',
    detail: preset?.detail || '',
    priority: preset?.condition === 'warning' ? 'medium' : 'high',
  })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  if (result) {
    const fmt = workOrderFormatCode(result.order)
    return (
      <Done
        title={result.offline ? 'Guardada en el teléfono' : 'Novedad reportada'}
        text={
          result.offline
            ? 'Sin conexión: la OT y la foto suben solas cuando vuelva la señal.'
            : `Quedó como OT ${result.order.code || ''} para mantenimiento y el supervisor.`
        }
        warnings={result.warnings}
        action={
          !result.offline && (
            <button type="button" className="sh-btn sh-btn-primary" onClick={() => openWorkOrderFormat({ order: result.order, machine: machines.find((m) => m.id === result.order.machine_id) })}>
              {Icon.doc(20)}Ver {fmt}
            </button>
          )
        }
        onBack={onBack}
      />
    )
  }

  const save = async () => {
    if (!form.type) {
      setError('Elige qué pasa.')
      return
    }
    if (!form.machineId && !form.roomId) {
      setError('Elige la máquina o la sala.')
      return
    }
    setBusy(true)
    setError(null)
    const order = buildIncidentOrder({
      type: form.type,
      detail: form.detail,
      machine: machines.find((m) => m.id === form.machineId) || null,
      room: rooms.find((r) => r.id === form.roomId) || null,
      plantId: data?.plants?.[0]?.id || null,
      priority: form.priority,
      orgId,
      userId,
    })
    const res = await saveWorkOrderWithEvidence({ orgId, userId, order, files, evidenceNote: 'Foto de la novedad' })
    setBusy(false)
    if (res.error) setError(res.error)
    else {
      setResult(res)
      onSaved()
    }
  }

  return (
    <>
      <Back onBack={onBack} eyebrow="Reportar novedad" title="¿Qué pasa?" />
      <div className="sh-body">
        <div className="sf-pills op-wrap" role="group" aria-label="Tipo de novedad">
          {INCIDENT_TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={form.type === t} onClick={() => setForm({ ...form, type: t })}>{t}</button>
          ))}
        </div>
        <label className="sf-field">
          <span>Máquina</span>
          <select className="sf-input" value={form.machineId} onChange={(e) => setForm({ ...form, machineId: e.target.value, roomId: '' })}>
            <option value="">Sin máquina (elegir sala)</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>{machineLabel(m)}</option>
            ))}
          </select>
        </label>
        {!form.machineId && (
          <label className="sf-field">
            <span>Sala</span>
            <select className="sf-input" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
              <option value="">Elegir sala</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="sf-field">
          <span>Detalle</span>
          <textarea className="sf-input" rows={3} value={form.detail} placeholder="Qué viste, desde cuándo, qué hiciste…" onChange={(e) => setForm({ ...form, detail: e.target.value })} />
        </label>
        <label className="sf-field">
          <span>Urgencia</span>
          <select className="sf-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {INCIDENT_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <EvidencePicker files={files} onChange={setFiles} accept="image/*" capture="environment" addLabel="Foto" hint="La foto va adjunta a la OT y sale en la solicitud de mantenimiento (FOMAT06)." />
        {error ? <p className="sh-note" role="alert">{error}</p> : null}
        <button type="button" className="sh-btn sh-btn-primary sf-save" disabled={busy} onClick={save}>
          {Icon.alert(20)}{busy ? 'Enviando…' : 'Reportar a mantenimiento'}
        </button>
      </div>
    </>
  )
}

/* ── Reporte escrito / entrega de turno ────────────────────────────────── */

function WrittenReportScreen({ perf, slot, preset = 'novedad', onBack }) {
  const [kind, setKind] = useState(preset)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const k = WRITTEN_REPORTS.find((r) => r.id === kind) || WRITTEN_REPORTS[0]

  if (result) {
    return <Done title="Reporte guardado" text={`«${k.title}» quedó en el turno ${slot.shift}${result.local ? ' (en el teléfono, se sube al volver la red)' : ''}. Cuenta como reporte de ronda.`} onBack={onBack} />
  }

  const save = async () => {
    if (!body.trim()) {
      setError('Escribe el reporte.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await perf.submitRound({ title: k.title, body, shiftCode: `T${slot.shift}` })
    setBusy(false)
    if (res.error) setError(res.error)
    else setResult(res)
  }

  return (
    <>
      <Back onBack={onBack} eyebrow={`Turno ${slot.shift} · reporte escrito`} title={k.title} />
      <div className="sh-body">
        <div className="sf-pills" role="group" aria-label="Tipo de reporte">
          {WRITTEN_REPORTS.map((r) => (
            <button key={r.id} type="button" aria-pressed={kind === r.id} onClick={() => setKind(r.id)}>{r.title}</button>
          ))}
        </div>
        <label className="sf-field">
          <span>{k.hint}</span>
          <textarea className="sf-input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {error ? <p className="sh-note" role="alert">{error}</p> : null}
        <button type="button" className="sh-btn sh-btn-primary sf-save" disabled={busy} onClick={save}>
          {Icon.pen(20)}{busy ? 'Guardando…' : 'Guardar reporte'}
        </button>
      </div>
    </>
  )
}

/* ── Inicio ────────────────────────────────────────────────────────────── */

export default function OperatorHome({ home, perf, first, go, orgId, userId, role, userName, can }) {
  const { slot, data, loading } = home
  const att = useAttendance({ orgId, userId, userName })
  const [screen, setScreen] = useState({ kind: 'home' })
  const [busyAct, setBusyAct] = useState(null)
  const [actMsg, setActMsg] = useState(null)
  const [openingId, setOpeningId] = useState(null)
  const isAux = role === 'auxiliary'

  const now = new Date()
  const shiftEnd = shiftBounds(slot.shiftDate, slot.shift)?.end || null
  const stage = attendanceStage({ punches: att.rows, isInside: att.isInside, shiftEnd, now })
  const machines = useMemo(() => data?.machines || [], [data])
  const rooms = useMemo(() => data?.rooms || [], [data])
  const checks = useMemo(() => data?.checks || [], [data])
  const plantId = useMemo(() => pickRoundPlant({ plants: data?.plants || [], machines, rooms, checks, userId }), [data, machines, rooms, checks, userId])
  const round = useMemo(
    () => roundHourStatus({ machines, rooms, checks, plantId, shiftDate: slot.shiftDate, hour: slot.hour, userId }),
    [machines, rooms, checks, plantId, slot.shiftDate, slot.hour, userId]
  )
  const done = perf.myRoundsToday.length
  const pace = roundsPace({ done, min: perf.minRounds, shift: slot.shift })
  const acts = useMemo(() => activityBuckets({ activities: data?.acts || [], userId }), [data, userId])
  const health = machineHealth(checks, machines)
  const shifts = useMemo(() => upcomingShifts({ assignments: data?.assignments || [], userId }), [data, userId])
  const nextShift = shifts.find((s) => !(s.label === 'Hoy' && s.shiftNumber === slot.shift)) || null
  const writtenToday = perf.myRoundsToday.filter((r) => r.source !== 'photos')
  const shortcuts = shortcutsFor({ role, can })
  const score = perf.myScore

  const home_ = () => {
    setScreen({ kind: 'home' })
    window.scrollTo?.({ top: 0 })
  }
  const reloadAll = () => {
    home.reload()
    perf.reload?.()
    att.reload?.()
  }
  const openShortcut = (s) => {
    if (s.view) requestSupervisionView(s.view)
    go(s.tab)
  }
  const continueRound = () => {
    requestSupervisionView('ronda')
    go('supervision')
  }
  const startAct = async (a) => {
    setBusyAct(a.id)
    setActMsg(null)
    const res = await startShiftActivity(a.id)
    setBusyAct(null)
    if (res.error) setActMsg(res.error)
    else home.reload()
  }
  const openIncident = async (o) => {
    setOpeningId(o.id)
    try {
      await openWorkOrderFormat({ order: o, machine: machines.find((m) => m.id === o.machine_id) })
    } finally {
      setOpeningId(null)
    }
  }

  if (screen.kind === 'activity') {
    return <ActivityScreen act={screen.act} orgId={orgId} machines={machines} onBack={home_} onSaved={home.reload} />
  }
  if (screen.kind === 'incident') {
    return <IncidentScreen orgId={orgId} userId={userId} data={data} preset={screen.preset} onBack={home_} onSaved={home.reload} />
  }
  if (screen.kind === 'report') {
    return <WrittenReportScreen perf={perf} slot={slot} preset={screen.preset} onBack={home_} />
  }

  const pendingActs = [...acts.doing, ...acts.todo]

  return (
    <>
      <Header
        eyebrow={`Turno ${slot.shift} · ${SHIFT_WINDOWS[slot.shift]?.label || ''} · ${shiftTimeLeft(slot.shift)}`}
        title={first ? `Hola, ${first}` : 'Mi turno'}
        chips={
          <>
            {!isAux && (
              <button type="button" className={`sh-chip ${pace.complete ? 'sh-chip-ok' : pace.behind ? 'sh-chip-warn' : 'sh-chip-neutral'}`} onClick={() => go('cumplimiento')}>
                Rondas {done} de {perf.minRounds}
              </button>
            )}
            {pendingActs.length > 0 && <span className="sh-chip sh-chip-neutral">{pendingActs.length} actividad{pendingActs.length === 1 ? '' : 'es'}</span>}
          </>
        }
        onRefresh={reloadAll}
        loading={loading}
      />
      <div className="sh-body">
        <Note error={home.error} />
        <div className="op-cols">
          <div className="op-col">
          <AttendanceCard att={att} stage={stage} slot={slot} />

          {!isAux && (
            <section className="sh-hero" aria-label="Ronda de la hora">
              <div className="sh-hero-row">
                <span className="sh-hero-label">Ronda {String(slot.hour).padStart(2, '0')}:00</span>
                <span>{round.complete ? 'Completa' : `quedan ${60 - now.getMinutes()} min`}</span>
              </div>
              <div className="sh-big">
                <span className={`sh-big-num${loading && !data ? ' sh-loading' : ''}`}>{round.done}</span>
                <span className="sh-big-unit">de {round.total} máquinas{round.issues ? ` · ${round.issues} con novedad` : ''}</span>
              </div>
              <div className="sf-progress" aria-hidden="true">
                <div style={{ width: `${round.total ? Math.round((round.done / round.total) * 100) : 0}%` }} />
              </div>
              {round.rooms.length > 0 && (
                <div className="op-rooms">
                  {round.rooms.map((r) => (
                    <span key={r.id} className={`op-room${r.done === r.total ? ' op-room-done' : ''}`}>{r.name} {r.done}/{r.total}</span>
                  ))}
                </div>
              )}
              <p className="sh-hero-sub">
                {[
                  pace.complete ? 'Mínimo de rondas cumplido' : pace.nextAt ? `Próxima ronda sugerida ${pace.nextAt}` : null,
                  data ? `${data.myPhotos} foto${data.myPhotos === 1 ? '' : 's'} tuya${data.myPhotos === 1 ? '' : 's'} en el turno` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {health.normal + health.warning + health.fault + health.off > 0 && (
                <div className="op-health" aria-label="Estado de las máquinas en el turno">
                  <span className="op-health-ok">{health.normal} ok</span>
                  {health.warning > 0 && <span className="op-health-warn">{health.warning} en alerta</span>}
                  {health.fault > 0 && <span className="op-health-fault">{health.fault} en falla</span>}
                  {health.off > 0 && <span>{health.off} apagada{health.off === 1 ? '' : 's'}</span>}
                </div>
              )}
              <button type="button" className="sh-btn sh-btn-hero" onClick={continueRound}>
                {Icon.camera(22)}{round.done ? 'Continuar ronda' : 'Empezar ronda'}
              </button>
            </section>
          )}

          <div className="sh-section-head">
            <h2 className="sh-h2">Me asignaron</h2>
            <span className="sh-count">{pendingActs.length} pendiente{pendingActs.length === 1 ? '' : 's'}</span>
          </div>
          {actMsg ? <p className="sh-note">{actMsg}</p> : null}
          <div className="sh-card">
            {pendingActs.length === 0 ? (
              <p className="sh-empty">{loading && !data ? 'Cargando…' : 'Nada asignado por ahora.'}</p>
            ) : (
              <ul className="sh-list">
                {pendingActs.map((a) => {
                  const doing = a.status === 'in_progress'
                  const m = machines.find((x) => x.id === a.machine_id)
                  return (
                    <li key={a.id} className="op-act">
                      <div className="sh-row sh-row-static">
                        <span className={`sh-badge ${doing ? 'sh-badge-accent' : 'sh-badge-warn'}`}>{Icon.task(18)}</span>
                        <span className="sh-row-main">
                          <span className="sh-row-title">{a.title || 'Actividad'}</span>
                          <span className="sh-row-sub">
                            {[m ? machineLabel(m) : null, doing ? (a.started_at ? `en curso desde ${clock(a.started_at)}` : 'en curso') : a.description].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {doing ? (
                          <button type="button" className="op-act-btn op-act-btn-primary" onClick={() => setScreen({ kind: 'activity', act: a })}>Terminar</button>
                        ) : (
                          <button type="button" className="op-act-btn" disabled={busyAct === a.id} onClick={() => startAct(a)}>
                            {busyAct === a.id ? '…' : 'Iniciar'}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {health.attention.length > 0 && (
            <>
              <div className="sh-section-head">
                <h2 className="sh-h2">Máquinas con novedad</h2>
                <span className="sh-count">{health.attention.length}</span>
              </div>
              <div className="sh-card">
                <ul className="sh-list">
                  {health.attention.slice(0, 4).map((x) => (
                    <li key={x.machineId}>
                      <button
                        type="button"
                        className="sh-row"
                        onClick={() => setScreen({ kind: 'incident', preset: { machineId: x.machineId, condition: x.condition, detail: x.notes } })}
                      >
                        <span className={`sh-badge ${x.condition === 'fault' ? 'sh-badge-warn' : 'sh-badge-accent'}`}>{Icon.alert(18)}</span>
                        <span className="sh-row-main">
                          <span className="sh-row-title">{x.code}</span>
                          <span className="sh-row-sub">{x.notes || (x.condition === 'fault' ? 'Falla' : 'Alerta')} · {clock(x.at)}</span>
                        </span>
                        <span className={`sh-tag ${x.condition === 'fault' ? 'sh-tag-fault' : 'sh-tag-warn'}`}>Pedir OT</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <div className="op-actions">
            <button type="button" className="sh-card op-action" onClick={() => setScreen({ kind: 'incident' })}>
              <span className="sh-badge sh-badge-warn">{Icon.alert(20)}</span>
              <span><strong>Reportar falla</strong><small>OT para mantenimiento</small></span>
            </button>
            <button type="button" className="sh-card op-action" onClick={() => setScreen({ kind: 'report', preset: 'novedad' })}>
              <span className="sh-badge sh-badge-blue">{Icon.pen(20)}</span>
              <span><strong>Escribir novedad</strong><small>Cuenta como reporte de ronda</small></span>
            </button>
            <button type="button" className="sh-card op-action" onClick={() => setScreen({ kind: 'report', preset: 'entrega' })}>
              <span className="sh-badge sh-badge-accent">{Icon.exit(20)}</span>
              <span><strong>Entrega de turno</strong><small>Lo que recibe el siguiente</small></span>
            </button>
          </div>
          </div>
          <div className="op-col">
          <div className="sh-grid-2">
            <button type="button" className="sh-card sh-tile" onClick={() => go('cumplimiento')}>
              <span className="sh-tile-label">Cumplimiento de hoy</span>
              <span className="sh-tile-value">
                {Math.round(score.scorePct)} %
                <span className={score.eligibleScore ? 'sh-tag-ok' : 'sh-tag-muted'} style={{ fontWeight: 500 }}>
                  {score.eligibleScore ? `· en meta (${score.minScore} %)` : `· meta ${score.minScore} %`}
                </span>
              </span>
            </button>
            <button type="button" className="sh-card sh-tile" onClick={() => (can('horarios') ? go('horarios') : null)}>
              <span className="sh-tile-label">Próximo turno</span>
              <span className="sh-tile-value">
                {nextShift
                  ? nextShift.isRest
                    ? `${nextShift.label} · descanso`
                    : `${nextShift.label} · T${nextShift.shiftNumber} ${SHIFT_WINDOWS[nextShift.shiftNumber]?.label.split(' – ')[0] || ''}`
                  : 'Sin programar'}
              </span>
            </button>
          </div>

          {shortcuts.length > 0 && (
            <>
              <div className="sh-section-head">
                <h2 className="sh-h2">Otros registros</h2>
              </div>
              <div className="op-shortcuts">
                {shortcuts.map((s) => (
                  <button key={s.id} type="button" className="sh-card op-shortcut" onClick={() => openShortcut(s)}>
                    {(Icon[s.icon] || Icon.grid)(22)}
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {(acts.doneToday.length > 0 || (data?.incidents || []).length > 0 || writtenToday.length > 0) && (
            <>
              <div className="sh-section-head">
                <h2 className="sh-h2">Hecho hoy</h2>
                <span className="sh-count">{acts.doneToday.length + (data?.incidents || []).length + writtenToday.length}</span>
              </div>
              <div className="sh-card">
                <ul className="sh-list">
                  {acts.doneToday.map((a) => (
                    <li key={`a-${a.id}`}>
                      <div className="sh-row sh-row-static">
                        <span className="sh-row-time">{clock(a.completed_at)}</span>
                        <span className="sh-row-main">
                          <span className="sh-row-title">{a.title}</span>
                          {a.result_note ? <span className="sh-row-sub">{a.result_note}</span> : null}
                        </span>
                        <span className={`sh-tag ${a.completion === 'partial' ? 'sh-tag-warn' : 'sh-tag-ok'}`}>{a.completion === 'partial' ? 'Parcial' : 'Hecha'}</span>
                      </div>
                    </li>
                  ))}
                  {(data?.incidents || []).map((o) => (
                    <li key={`o-${o.id}`}>
                      <button type="button" className="sh-row" onClick={() => openIncident(o)} disabled={openingId === o.id}>
                        <span className="sh-row-time">{clock(o.created_at)}</span>
                        <span className="sh-row-main">
                          <span className="sh-row-title">{o.title}</span>
                          <span className="sh-row-sub">{o.code || 'OT'} · {o.status === 'completed' ? 'atendida' : o.status === 'in_progress' ? 'en atención' : 'por atender'}</span>
                        </span>
                        <span className="sh-tag sh-tag-accent">{openingId === o.id ? 'Abriendo…' : `Ver ${workOrderFormatCode(o)}`}</span>
                      </button>
                    </li>
                  ))}
                  {writtenToday.map((r) => (
                    <li key={`r-${r.id}`}>
                      <div className="sh-row sh-row-static">
                        <span className="sh-row-time">{clock(r.created_at)}</span>
                        <span className="sh-row-main">
                          <span className="sh-row-title">{r.title}</span>
                          {r.body ? <span className="sh-row-sub op-clamp">{r.body}</span> : null}
                        </span>
                        <span className="sh-tag sh-tag-muted">Reporte</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {!isAux && <ShiftRounds orgId={orgId} slot={slot} checks={checks} onlyUser={userId} loading={loading && !data} />}
          </div>
        </div>
      </div>
      <div className="sh-spacer" />
      <TabBar
        go={(t) => {
          if (t !== 'supervision') return go(t)
          requestSupervisionView(isAux ? 'actividades' : 'ronda')
          go('supervision')
        }}
        items={[
          { label: 'Mi turno', tab: 'hoy', icon: Icon.clock, current: true },
          isAux ? { label: 'Actividades', tab: 'supervision', icon: Icon.task } : { label: 'Ronda', tab: 'supervision', icon: Icon.camera },
          { label: 'Cumplimiento', tab: 'cumplimiento', icon: Icon.bars },
          { label: 'Yo', tab: 'perfil', icon: Icon.user },
        ]}
      />
    </>
  )
}
