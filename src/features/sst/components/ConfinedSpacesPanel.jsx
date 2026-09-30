/**
 * Espacios confinados (SST → Espacios confinados), según la Resolución 0491 de 2020:
 * - Los túneles de la planta con su estado: libre, por autorizar, autorizado, gente
 *   adentro o suspendido.
 * - Permiso de entrada: lo diligencia quien va a trabajar; el supervisor de entrada lo
 *   autoriza con la lista completa y una medición de gases aceptable; el vigía registra
 *   entradas y salidas; una medición mala lo suspende y hay que salir.
 * - El programa de gestión y cada permiso se abren como documento imprimible.
 * Henry Stark Desarrollador · 30-09-2026
 */
import { useMemo, useState } from 'react'
import { openRecordDocument } from '../../../lib/sigRecordDocuments'
import { useConfinedSpaces } from '../hooks/useConfinedSpaces'
import {
  CHECKLIST,
  LIMITS,
  PERMIT_STATUS,
  WORK_TYPES,
  canSuperviseEntry,
  checklistComplete,
  permitHtml,
  programHtml,
  programStats,
  readingIssues,
  spaceStatus,
  workTypeLabel,
} from '../lib/confinedSpaces'
import './ConfinedSpacesPanel.css'

const when = (v) =>
  v ? new Date(v).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const clock = (v) => (v ? new Date(v).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '')
const pad = (n) => String(n).padStart(2, '0')
const localInput = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

const SPACE_STATE = {
  closed: { label: 'Libre · sin permiso', tone: 'muted' },
  draft: { label: 'Permiso por autorizar', tone: 'warn' },
  authorized: { label: 'Autorizado · nadie adentro', tone: 'info' },
  occupied: { label: 'Gente adentro', tone: 'info' },
  suspended: { label: 'Suspendido · salir', tone: 'danger' },
}

function Msg({ msg }) {
  if (!msg) return null
  return <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`}>{msg.text}</p>
}

function useAction() {
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const act = async (key, fn, okText) => {
    setBusy(key)
    setMsg(null)
    const r = await fn()
    setBusy(null)
    setMsg(r?.error ? { kind: 'error', text: r.error } : okText ? { kind: 'ok', text: okText } : null)
    return r
  }
  return { busy, msg, act, setMsg }
}

/* ─── Nuevo permiso ─── */

const EMPTY = {
  space_id: '',
  work_type: 'cleaning',
  work_description: '',
  valid_from: '',
  hours: 4,
  supervisor_name: '',
  attendant_name: '',
  entrants: '',
  ventilation: 'Natural por las compuertas',
  communication: 'Voz directa y radio',
  rescue_plan: 'Rescate sin entrada desde la compuerta con arnés y línea de vida; brigada avisada',
}

function PermitForm({ api, spaces, spaceId, onDone }) {
  const [f, setF] = useState(() => ({ ...EMPTY, space_id: spaceId || spaces[0]?.id || '', valid_from: localInput() }))
  const { busy, msg, act } = useAction()
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const submit = async () => {
    const r = await act('new', () => api.createPermit(f))
    if (!r?.error) onDone?.()
  }
  return (
    <div className="ec-form">
      <h4>Nuevo permiso de entrada</h4>
      <div className="two-col">
        <label>
          Espacio
          <select value={f.space_id} onChange={(e) => set({ space_id: e.target.value })}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de trabajo
          <select value={f.work_type} onChange={(e) => set({ work_type: e.target.value })}>
            {WORK_TYPES.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ec-wide">
          Trabajo a realizar
          <textarea
            rows={2}
            value={f.work_description}
            onChange={(e) => set({ work_description: e.target.value })}
            placeholder="Ej. cambio de filtros del túnel y limpieza de la persiana 2"
          />
        </label>
        <label>
          Desde
          <input type="datetime-local" value={f.valid_from} onChange={(e) => set({ valid_from: e.target.value })} />
        </label>
        <label>
          Horas de vigencia (máx. 12)
          <input type="number" min={1} max={12} value={f.hours} onChange={(e) => set({ hours: e.target.value })} />
        </label>
        <label>
          Supervisor de entrada
          <input
            value={f.supervisor_name}
            onChange={(e) => set({ supervisor_name: e.target.value })}
            placeholder="Nombre"
          />
        </label>
        <label>
          Vigía (se queda afuera)
          <input
            value={f.attendant_name}
            onChange={(e) => set({ attendant_name: e.target.value })}
            placeholder="Nombre"
          />
        </label>
        <label className="ec-wide">
          Entrantes (separados por coma)
          <input
            value={f.entrants}
            onChange={(e) => set({ entrants: e.target.value })}
            placeholder="Ana Pérez, Luis Gómez"
          />
        </label>
        <label>
          Ventilación
          <input value={f.ventilation} onChange={(e) => set({ ventilation: e.target.value })} />
        </label>
        <label>
          Comunicación
          <input value={f.communication} onChange={(e) => set({ communication: e.target.value })} />
        </label>
        <label className="ec-wide">
          Plan de rescate
          <input value={f.rescue_plan} onChange={(e) => set({ rescue_plan: e.target.value })} />
        </label>
      </div>
      <div className="actions row" style={{ gap: 8, marginTop: 8 }}>
        <button type="button" className="primary" disabled={busy === 'new'} onClick={submit}>
          {busy === 'new' ? 'Guardando…' : 'Crear permiso'}
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
      <Msg msg={msg} />
    </div>
  )
}

/* ─── Medición de gases ─── */

function ReadingForm({ api, permit }) {
  const [f, setF] = useState({ o2_pct: '', lel_pct: '', co_ppm: '', h2s_ppm: '', hcho_ppm: '', taken_by_name: '' })
  const { busy, msg, act } = useAction()
  const issues = f.o2_pct !== '' && f.lel_pct !== '' ? readingIssues(f) : []
  const save = async () => {
    const r = await act('read', () => api.addReading(permit.id, f))
    if (!r?.error)
      setF({ o2_pct: '', lel_pct: '', co_ppm: '', h2s_ppm: '', hcho_ppm: '', taken_by_name: f.taken_by_name })
  }
  const field = (k, label, ph) => (
    <label>
      {label}
      <input
        inputMode="decimal"
        value={f[k]}
        placeholder={ph}
        onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
      />
    </label>
  )
  return (
    <div className="ec-reading-form">
      <div className="ec-reading-grid">
        {field('o2_pct', 'O₂ %', `${LIMITS.o2Min}–${LIMITS.o2Max}`)}
        {field('lel_pct', 'LIE %', `< ${LIMITS.lelMax}`)}
        {field('co_ppm', 'CO ppm', `≤ ${LIMITS.coMax}`)}
        {field('h2s_ppm', 'H₂S ppm', `≤ ${LIMITS.h2sMax}`)}
        {field('hcho_ppm', 'Formaldehído ppm', `≤ ${LIMITS.hchoMax}`)}
        {field('taken_by_name', 'Midió', 'Nombre')}
      </div>
      {f.o2_pct !== '' && f.lel_pct !== '' && (
        <p className={`ec-verdict ${issues.length ? 'is-bad' : 'is-ok'}`}>
          {issues.length ? `Fuera de límites: ${issues.join(' · ')}. No se puede entrar.` : 'Atmósfera aceptable.'}
        </p>
      )}
      <button type="button" className="ghost small" disabled={busy === 'read'} onClick={save}>
        {busy === 'read' ? 'Guardando…' : 'Registrar medición'}
      </button>
      <Msg msg={msg} />
    </div>
  )
}

/* ─── Un permiso abierto ─── */

function PermitCard({ api, permit, space, readings, entries, supervisor, plantName }) {
  const { busy, msg, act } = useAction()
  const [notes, setNotes] = useState('')
  const st = PERMIT_STATUS[permit.status] || { label: permit.status, tone: 'muted' }
  const inside = entries.filter((e) => !e.exited_at)
  const last = readings[0]
  const lastFresh = last && Date.now() - new Date(last.taken_at).getTime() < 60 * 60000
  const lastOk = last && last.ok !== false && readingIssues(last).length === 0
  const editable = permit.status === 'draft' || permit.status === 'suspended'
  const listOk = checklistComplete(permit.checklist)
  const canAuthorize = supervisor && editable && listOk && lastFresh && lastOk
  const running = permit.status === 'authorized' || permit.status === 'active'
  const expired = new Date(permit.valid_until).getTime() < Date.now()

  const openDoc = () =>
    openRecordDocument({
      html: permitHtml({ permit, space, readings, entries, plantName }),
      title: `Permiso de entrada · ${space?.code || ''}`,
    })

  return (
    <article className={`ec-permit tone-${st.tone}`}>
      {permit.status === 'suspended' && (
        <div className="ec-alarm" role="alert">
          <b>Permiso suspendido: todos afuera.</b> {permit.suspended_reason}
        </div>
      )}
      <header className="ec-permit-head">
        <div>
          <b>
            {space?.code} · {space?.name}
          </b>
          <span>
            {workTypeLabel(permit.work_type)} · {permit.work_description}
          </span>
        </div>
        <span className={`ec-pill tone-${st.tone}`}>{st.label}</span>
      </header>
      <p className="ec-meta">
        Vigencia {when(permit.valid_from)} – {clock(permit.valid_until)}
        {expired && <b className="ec-bad"> · vencido</b>} · Supervisor: {permit.supervisor_name} · Vigía:{' '}
        {permit.attendant_name}
      </p>

      <div className="ec-cols">
        <section>
          <h5>Lista de verificación</h5>
          {CHECKLIST.map((i) => (
            <label key={i.key} className="ec-check">
              <input
                type="checkbox"
                checked={permit.checklist?.[i.key] === true}
                disabled={!editable || busy === `chk-${i.key}`}
                onChange={(e) => act(`chk-${i.key}`, () => api.setChecklist(permit, i.key, e.target.checked))}
              />
              <span>{i.label}</span>
            </label>
          ))}
        </section>

        <section>
          <h5>Medición de gases</h5>
          {last ? (
            <p className={`ec-verdict ${lastOk ? 'is-ok' : 'is-bad'}`}>
              {clock(last.taken_at)} · O₂ {last.o2_pct} % · LIE {last.lel_pct} %
              {last.co_ppm != null ? ` · CO ${last.co_ppm}` : ''}
              {last.h2s_ppm != null ? ` · H₂S ${last.h2s_ppm}` : ''}
              {last.hcho_ppm != null ? ` · HCHO ${last.hcho_ppm}` : ''}
              {lastOk
                ? lastFresh
                  ? ' · aceptable'
                  : ' · tiene más de 60 min: vuelva a medir'
                : ` · ${readingIssues(last).join(' · ')}`}
            </p>
          ) : (
            <p className="hint">Sin mediciones. Mida antes de autorizar.</p>
          )}
          {permit.status !== 'closed' && permit.status !== 'cancelled' && <ReadingForm api={api} permit={permit} />}
        </section>
      </div>

      <section>
        <h5>Entrantes · {inside.length} adentro</h5>
        <div className="ec-people">
          {(permit.entrants || []).map((name) => {
            const e = inside.find((x) => x.person_name.trim().toLowerCase() === name.trim().toLowerCase())
            return (
              <div key={name} className={`ec-person${e ? ' is-in' : ''}`}>
                <span>
                  <b>{name}</b>
                  <small>{e ? `adentro desde ${clock(e.entered_at)}` : 'afuera'}</small>
                </span>
                {e ? (
                  <button
                    type="button"
                    className="ghost small"
                    disabled={busy === `x-${e.id}`}
                    onClick={() => act(`x-${e.id}`, () => api.exit(e.id))}
                  >
                    Registrar salida
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost small"
                    disabled={!running || expired || busy === `in-${name}`}
                    onClick={() => act(`in-${name}`, () => api.enter(permit.id, name))}
                  >
                    Registrar entrada
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className="ec-actions">
        {supervisor && editable && (
          <button
            type="button"
            className="primary small"
            disabled={!canAuthorize || busy === 'auth'}
            title={
              !listOk
                ? 'Complete la lista de verificación'
                : !lastFresh || !lastOk
                  ? 'Falta una medición aceptable de menos de 60 min'
                  : ''
            }
            onClick={() => act('auth', () => api.authorize(permit.id), 'Permiso autorizado: ya pueden entrar')}
          >
            {permit.status === 'suspended' ? 'Reautorizar' : 'Autorizar entrada'}
          </button>
        )}
        {running && (
          <button
            type="button"
            className="ghost danger small"
            disabled={busy === 'stop'}
            onClick={() => act('stop', () => api.suspend(permit.id, notes || 'Detenido por el equipo'))}
          >
            Detener el trabajo
          </button>
        )}
        <button type="button" className="ghost small" onClick={openDoc}>
          Ver permiso (formato)
        </button>
        {supervisor && (
          <>
            <input
              className="ec-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones de cierre"
            />
            <button
              type="button"
              className="ghost small"
              disabled={inside.length > 0 || busy === 'close'}
              title={inside.length ? 'Registre la salida de todos antes de cerrar' : ''}
              onClick={() => act('close', () => api.close(permit.id, notes), 'Permiso cerrado')}
            >
              Cerrar permiso
            </button>
            {permit.status === 'draft' && (
              <button
                type="button"
                className="ghost small"
                disabled={busy === 'cancel'}
                onClick={() => act('cancel', () => api.cancel(permit.id, notes))}
              >
                Cancelar
              </button>
            )}
          </>
        )}
      </div>
      {!supervisor && editable && (
        <p className="hint">Lo autoriza el supervisor de entrada (SST, líder de planta o de mantenimiento).</p>
      )}
      <Msg msg={msg} />
    </article>
  )
}

/* ─── Panel ─── */

export default function ConfinedSpacesPanel({ orgId, role, area, isOmniscient = false, plantName }) {
  const api = useConfinedSpaces({ orgId })
  const supervisor = canSuperviseEntry({ role, area, isOmniscient })
  const [formFor, setFormFor] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const status = useMemo(
    () => spaceStatus({ spaces: api.spaces, permits: api.permits, entries: api.entries }),
    [api.spaces, api.permits, api.entries],
  )
  const byPermit = useMemo(() => {
    const r = {}
    const e = {}
    for (const x of api.readings) (r[x.permit_id] ||= []).push(x)
    for (const x of api.entries) (e[x.permit_id] ||= []).push(x)
    return { r, e }
  }, [api.readings, api.entries])
  const spaceById = useMemo(() => Object.fromEntries(api.spaces.map((s) => [s.id, s])), [api.spaces])
  const open = api.permits.filter((p) => ['draft', 'authorized', 'active', 'suspended'].includes(p.status))
  const history = api.permits.filter((p) => p.status === 'closed' || p.status === 'cancelled').slice(0, 20)

  const openProgram = () =>
    openRecordDocument({
      html: programHtml({ spaces: api.spaces, stats: programStats(api), plantName }),
      title: 'Programa de gestión para trabajo en espacios confinados',
    })

  if (api.missing) {
    return (
      <p className="msg error">
        Esta función necesita actualizar la base de datos del servidor. Pida a soporte correr 7-ACTUALIZAR-APP.
      </p>
    )
  }

  return (
    <div className="ec-root">
      <div className="ec-top">
        <p className="hint" style={{ margin: 0 }}>
          Resolución 0491 de 2020. Nadie entra a un túnel sin permiso autorizado, medición de gases aceptable y vigía
          afuera.
        </p>
        <button type="button" className="ghost small" onClick={openProgram}>
          Programa de gestión (imprimir)
        </button>
      </div>
      {api.error && <p className="msg error">{api.error}</p>}

      <div className="ec-spaces">
        {status.length === 0 && (
          <p className="hint">{api.loading ? 'Cargando…' : 'No hay espacios confinados en el inventario.'}</p>
        )}
        {status.map(({ space, inside, state }) => {
          const s = SPACE_STATE[state]
          return (
            <div key={space.id} className={`ec-space tone-${s.tone}`}>
              <span className="ec-space-code">{space.code}</span>
              <b>{space.name}</b>
              <small>
                {Number(space.width_m)} × {Number(space.length_m)} × {Number(space.height_m)} m
              </small>
              <span className={`ec-pill tone-${s.tone}`}>
                {state === 'occupied' ? `${inside.length} adentro` : s.label}
              </span>
              <button type="button" className="ghost small" onClick={() => setFormFor(space.id)}>
                Nuevo permiso
              </button>
            </div>
          )
        })}
      </div>

      {formFor && (
        <PermitForm key={formFor} api={api} spaces={api.spaces} spaceId={formFor} onDone={() => setFormFor(null)} />
      )}

      <h4 className="ec-h">Permisos abiertos · {open.length}</h4>
      {open.length === 0 ? (
        <p className="hint">No hay permisos abiertos.</p>
      ) : (
        open.map((p) => (
          <PermitCard
            key={p.id}
            api={api}
            permit={p}
            space={spaceById[p.space_id]}
            readings={byPermit.r[p.id] || []}
            entries={byPermit.e[p.id] || []}
            supervisor={supervisor}
            plantName={plantName}
          />
        ))
      )}

      <button type="button" className="ghost small" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? 'Ocultar' : 'Ver'} permisos cerrados ({history.length})
      </button>
      {showHistory && (
        <div className="ec-history">
          {history.map((p) => {
            const space = spaceById[p.space_id]
            return (
              <button
                key={p.id}
                type="button"
                className="ec-history-row"
                onClick={() =>
                  openRecordDocument({
                    html: permitHtml({
                      permit: p,
                      space,
                      readings: byPermit.r[p.id] || [],
                      entries: byPermit.e[p.id] || [],
                      plantName,
                    }),
                    title: `Permiso de entrada · ${space?.code || ''}`,
                  })
                }
              >
                <span>{when(p.valid_from)}</span>
                <span>
                  {space?.code} · {p.work_description}
                </span>
                <span className={`ec-pill tone-${PERMIT_STATUS[p.status]?.tone}`}>
                  {PERMIT_STATUS[p.status]?.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
