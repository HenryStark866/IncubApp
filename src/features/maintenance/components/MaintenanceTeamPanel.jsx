/**
 * =============================================================================
 * Equipo y sedes de mantenimiento (líder de mantenimiento) · 12-10-2026
 *  - Asigna la sede de cada auxiliar (y con ella su Plan AM).
 *  - Crea OT o actividades en CUALQUIER sede y las asigna a un auxiliar o a sí mismo.
 *  - Ve en vivo dónde está cada uno: su último reporte, su traslado misional
 *    (origen → destino) o la OT que está ejecutando.
 *  - Atiende sus propios trabajos y reporta su lugar de trabajo.
 * Todo queda sincronizado: lo que asigna aparece en el inicio del auxiliar y en
 * «Órdenes de trabajo»; los traslados le llegan a SST.
 * =============================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { canLeadMaintenance, useMaintenanceTeam } from '../hooks/useMaintenanceTeam'
import { LOCATION_STATUS } from '../../../lib/teamLocations'
import { ROLE_LABEL } from '../../../lib/roles'
import WorkLocationReporter from './WorkLocationReporter'
import './MaintenanceTeamPanel.css'

const PRIORITIES = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
]
const TYPES = [
  { value: 'preventive', label: 'Preventivo / actividad programada' },
  { value: 'corrective', label: 'Correctivo' },
  { value: 'inspection', label: 'Inspección' },
]
const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]))
const ago = (v) => {
  const m = Math.round((Date.now() - Date.parse(v || 0)) / 60000)
  if (!Number.isFinite(m) || m < 0) return ''
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}
const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

function AssignForm({ api, team, me, initial, onDone }) {
  const [form, setForm] = useState(() => ({
    plantId: initial?.plantId || api.plants?.[0]?.id || '',
    machineId: '',
    type: 'preventive',
    priority: 'medium',
    title: '',
    description: '',
    scheduledFor: '',
    assignedTo: initial?.assignedTo ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const ref = useRef(null)
  // En el celular el formulario abre arriba de la lista: se lleva a la vista
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const machines = (api.machines || []).filter((m) => m.plant_id === form.plantId)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const res = await api.createAssignedOrder(form)
    setBusy(false)
    if (res.error) setErr(res.error)
    else onDone(res.offline ? 'Sin señal: la OT quedó en cola y sube sola al volver la red.' : `OT ${res.order?.code || ''} creada${form.assignedTo ? ' y asignada' : ''}.`)
  }

  return (
    <form ref={ref} className="mt-card mt-assign" onSubmit={submit}>
      <div className="mt-card-head">
        <h3>➕ Crear y asignar OT / actividad</h3>
        <button type="button" className="ghost small" onClick={() => onDone(null)}>
          Cerrar
        </button>
      </div>
      <div className="mt-form">
        <label>
          Sede
          <select value={form.plantId} onChange={(e) => setForm((f) => ({ ...f, plantId: e.target.value, machineId: '' }))}>
            {(api.plants || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Máquina (opcional)
          <select value={form.machineId} onChange={set('machineId')}>
            <option value="">— Instalaciones generales —</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code ? `${m.code} · ` : ''}
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-span">
          Qué hay que hacer
          <input value={form.title} onChange={set('title')} placeholder="Ej. Lubricar rodamientos de la nacedora 3" required minLength={3} />
        </label>
        <label className="mt-span">
          Detalle (opcional)
          <textarea rows={2} value={form.description} onChange={set('description')} placeholder="Repuestos, herramientas, cuidado especial…" />
        </label>
        <label>
          Tipo
          <select value={form.type} onChange={set('type')}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridad
          <select value={form.priority} onChange={set('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha programada
          <input type="date" value={form.scheduledFor} onChange={set('scheduledFor')} />
        </label>
        <label>
          Asignar a
          <select value={form.assignedTo} onChange={set('assignedTo')}>
            <option value="">Sin asignar (la toma quien la atienda)</option>
            {me && <option value={me.id}>Yo ({me.name})</option>}
            {team
              .filter((p) => !p.isMe)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.site ? ` · ${p.site.name}` : ''}
                </option>
              ))}
          </select>
        </label>
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="mt-actions">
        <button type="submit" className="primary" disabled={busy || form.title.trim().length < 3 || !form.plantId}>
          {busy ? 'Guardando…' : 'Crear OT'}
        </button>
      </div>
    </form>
  )
}

export default function MaintenanceTeamPanel({ orgId, userId, role, area, userName, onNavigate, compact = false }) {
  const api = useMaintenanceTeam({ orgId, userId })
  const [assign, setAssign] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(null)
  const canLead = canLeadMaintenance(role, area)
  const me = useMemo(
    () => api.team.find((p) => p.isMe) || (userId ? { id: userId, name: userName || 'Yo', isMe: true, open: [], inProgress: [] } : null),
    [api.team, userId, userName],
  )
  const myOrders = useMemo(() => [...(me?.inProgress || []), ...(me?.open || [])], [me])
  const others = api.team.filter((p) => !p.isMe)

  const run = async (key, fn, ok) => {
    setBusy(key)
    setMsg(null)
    const res = await fn()
    setBusy(null)
    setMsg(res.error ? { kind: 'error', text: res.error } : ok ? { kind: 'ok', text: ok } : null)
  }

  const trips = (api.trips || []).slice(0, compact ? 4 : 20)

  return (
    <section className={`mt-root${compact ? ' is-compact' : ''}`} aria-label="Equipo y sedes de mantenimiento">
      <header className="mt-head">
        <div>
          <h2>👷 Equipo y sedes de mantenimiento</h2>
          <p>
            {others.length} técnico{others.length === 1 ? '' : 's'} · {api.unassigned.length} OT sin asignar ·{' '}
            {api.team.filter((p) => p.now?.status === 'en_traslado').length} en traslado
          </p>
        </div>
        <div className="mt-head-actions">
          {canLead && (
            <button type="button" className="primary small" onClick={() => setAssign({})}>
              ➕ Crear / asignar OT
            </button>
          )}
          {compact && onNavigate && (
            <button type="button" className="ghost small" onClick={() => onNavigate('equipo-mantenimiento')}>
              Ver todo ›
            </button>
          )}
        </div>
      </header>

      {api.missing && (
        <p className="msg warn">
          Falta aplicar en el servidor la migración 20261012_equipo_mantenimiento_traslados (7-ACTUALIZAR-APP): sin ella no se
          guardan las sedes asignadas ni los lugares de trabajo.
        </p>
      )}
      {api.warning && <p className="msg warn">{api.warning}</p>}
      {msg && <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`}>{msg.text}</p>}

      {assign && (
        <AssignForm
          key={JSON.stringify(assign)}
          api={api}
          team={api.team}
          me={me}
          initial={assign}
          onDone={(text) => {
            setAssign(null)
            if (text) setMsg({ kind: 'ok', text })
          }}
        />
      )}

      <div className="mt-grid">
        <div className="mt-col">
          <section className="mt-card" aria-label="Técnicos">
            <div className="mt-card-head">
              <h3>Dónde está cada uno</h3>
              <span className="mt-dim">{api.loading ? 'Actualizando…' : 'en vivo'}</span>
            </div>
            {others.length === 0 ? (
              <p className="mt-empty">{api.loading ? 'Cargando…' : 'No hay auxiliares de mantenimiento en la empresa.'}</p>
            ) : (
              <ul className="mt-people">
                {others.map((p) => (
                  <li key={p.id} className={`mt-person st-${p.now?.status || 'none'}`}>
                    <span className="mt-av" aria-hidden="true">
                      {initials(p.name)}
                    </span>
                    <div className="mt-person-main">
                      <b>{p.name}</b>
                      <span className="mt-dim">
                        {ROLE_LABEL[p.role] || p.role}
                        {p.isLeader ? ' de mantenimiento' : ''}
                        {p.phone ? ` · ${p.phone}` : ''}
                      </span>
                      <span className="mt-now">
                        {p.now ? (
                          <>
                            <em className={`mt-pill st-${p.now.status}`}>
                              {p.now.kind === 'ot' ? 'Ejecutando OT' : p.now.kind === 'traslado' ? 'Traslado misional' : LOCATION_STATUS[p.now.status]}
                            </em>{' '}
                            {p.now.text} <small className="mt-dim">· {ago(p.now.at)}</small>
                          </>
                        ) : (
                          <span className="mt-dim">Sin reporte de ubicación hoy</span>
                        )}
                      </span>
                      <span className="mt-dim">
                        {p.inProgress.length} en ejecución · {p.open.length} por atender
                      </span>
                    </div>
                    {canLead && (
                      <div className="mt-person-actions">
                        <label className="mt-sr" htmlFor={`site-${p.id}`}>
                          Sede de {p.name}
                        </label>
                        <select
                          id={`site-${p.id}`}
                          value={p.siteId || ''}
                          disabled={busy === `site-${p.id}` || api.noSites}
                          onChange={(e) =>
                            run(`site-${p.id}`, () => api.setMemberSite(p.id, e.target.value), `Sede de ${p.name} actualizada.`)
                          }
                          title="Sede asignada: define su Plan AM y dónde trabaja"
                        >
                          <option value="">Todas las sedes</option>
                          {(api.plants || []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="ghost small" onClick={() => setAssign({ assignedTo: p.id, plantId: p.siteId || undefined })}>
                          Asignar actividad
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!compact && (
            <section className="mt-card" aria-label="OT sin asignar">
              <div className="mt-card-head">
                <h3>OT sin asignar · {api.unassigned.length}</h3>
                {onNavigate && (
                  <button type="button" className="ghost small" onClick={() => onNavigate('mantenimiento')}>
                    Órdenes de trabajo ›
                  </button>
                )}
              </div>
              {api.unassigned.length === 0 ? (
                <p className="mt-empty">Todas las OT abiertas tienen responsable.</p>
              ) : (
                <ul className="mt-orders">
                  {api.unassigned.slice(0, 30).map((o) => (
                    <li key={o.id}>
                      <div>
                        <b>
                          {o.code || 'OT'} · {o.title}
                        </b>
                        <span className="mt-dim">
                          {api.sitesById[o.plant_id]?.name || o.location_name || 'Sin sede'} · prioridad {PRIORITY_LABEL[o.priority] || o.priority}
                        </span>
                      </div>
                      {canLead && (
                        <select
                          value=""
                          disabled={busy === `wo-${o.id}`}
                          onChange={(e) => run(`wo-${o.id}`, () => api.assignOrder(o.id, e.target.value), 'OT asignada.')}
                          aria-label={`Asignar ${o.code || 'OT'}`}
                        >
                          <option value="">Asignar a…</option>
                          {api.team.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.isMe ? `Yo (${p.name})` : p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="mt-col">
          {me && (
            <section className="mt-card" aria-label="Mis trabajos">
              <div className="mt-card-head">
                <h3>🧰 Mis trabajos · {myOrders.length}</h3>
                {onNavigate && (
                  <button type="button" className="ghost small" onClick={() => onNavigate('mantenimiento')} title="Cerrar con resolución, tiempo de parada y evidencias">
                    Cerrar / evidencias ›
                  </button>
                )}
              </div>
              {myOrders.length === 0 ? (
                <p className="mt-empty">No tienes OT asignadas. Puedes asignarte una al crearla.</p>
              ) : (
                <ul className="mt-orders">
                  {myOrders.slice(0, compact ? 4 : 30).map((o) => (
                    <li key={o.id}>
                      <div>
                        <b>
                          {o.code || 'OT'} · {o.title}
                        </b>
                        <span className="mt-dim">
                          {api.sitesById[o.plant_id]?.name || o.location_name || 'Sin sede'} · {o.status === 'in_progress' ? 'en ejecución' : 'por atender'}
                        </span>
                      </div>
                      {o.status === 'open' ? (
                        <button
                          type="button"
                          className="primary small"
                          disabled={busy === `start-${o.id}`}
                          onClick={() => run(`start-${o.id}`, () => api.startOrder(o), 'OT en ejecución: tu lugar de trabajo quedó reportado.')}
                        >
                          Atender
                        </button>
                      ) : (
                        onNavigate && (
                          <button type="button" className="ghost small" onClick={() => onNavigate('mantenimiento')}>
                            Cerrar
                          </button>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {me && (
            <WorkLocationReporter
              plants={api.plants || []}
              myOrders={myOrders}
              defaultSiteId={me.siteId || ''}
              last={me.now}
              onReport={api.report}
              onNavigate={onNavigate}
            />
          )}

          <section className="mt-card" aria-label="Traslados misionales de hoy">
            <div className="mt-card-head">
              <h3>🚗 Traslados misionales (24 h)</h3>
              {onNavigate && (
                <button type="button" className="ghost small" onClick={() => onNavigate('misionales')}>
                  Misionales ›
                </button>
              )}
            </div>
            {trips.length === 0 ? (
              <p className="mt-empty">Nadie ha registrado traslados en las últimas 24 horas.</p>
            ) : (
              <ul className="mt-orders">
                {trips.map((t) => (
                  <li key={t.id}>
                    <div>
                      <b>
                        {t.driver_name || 'Sin nombre'} · {t.origin || '¿origen?'} → {t.destination || '¿destino?'}
                      </b>
                      <span className="mt-dim">
                        {[t.vehicle_type, t.plate].filter(Boolean).join(' ')} · {ago(t.inspected_at)}
                        {t.optimal === false ? ' · ⚠ vehículo no apto' : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
