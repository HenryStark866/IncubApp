/**
 * =============================================================================
 * ARCHIVO: src/components/SupervisorDashboard.jsx
 * PROPÓSITO: Componente UI «SupervisorDashboard»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useMachineChecks, currentSlot } from '../hooks/useMachineChecks'
import { useWorkOrders } from '../hooks/useWorkOrders'
import { useShiftOps } from '../hooks/useShiftOps'
import { useLoads } from '../hooks/useLoads'
import { useHatches } from '../hooks/useHatches'

/**
 * Panel del supervisor de planta (Jhon Piedrahíta). Tablero operativo de una
 * sede de incubación: turno y ronda, OT, tareas del turno que él asigna, y el
 * estado del ciclo de incubación (cargue → transferencia día 18 → nacimiento
 * día 21) con los nacimientos en curso y su cronómetro.
 */

const SHIFT_LABEL = { 1: 'T1 (06–14)', 2: 'T2 (14–22)', 3: 'T3 (22–06)' }
const STATUS_LABEL = { open: 'Abierta', in_progress: 'En ejecución', completed: 'Completada', cancelled: 'Cancelada' }
const MODE_LABEL = { single: 'Sencilla', double: 'Doble' }
const TRANSFER_HOURS = 432 // día 18
const HATCH_HOURS = 504 // día 21

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''
const initials = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDT = (v) => (v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

function cycleAge(cycleStartAt) {
  if (!cycleStartAt) return null
  const ms = Date.now() - new Date(cycleStartAt).getTime()
  if (ms < 0) return null
  const hours = ms / 3_600_000
  return { hours, label: `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h` }
}
function elapsedLabel(fromIso, toMs) {
  if (!fromIso) return '—'
  const ms = (toMs ?? Date.now()) - new Date(fromIso).getTime()
  const min = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

export default function SupervisorDashboard({ orgId, userId, coordinatorName, onNavigate }) {
  const mc = useMachineChecks(orgId, userId, { canSupervise: true })
  const wo = useWorkOrders(orgId, userId)
  const so = useShiftOps(orgId, userId)
  const flow = useLoads(orgId, userId)
  const hatch = useHatches(orgId, userId)

  const [plants, setPlants] = useState([])
  const [rooms, setRooms] = useState([])
  const [machines, setMachines] = useState([])
  const [people, setPeople] = useState({})
  const [plantId, setPlantId] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('created_at'),
      supabase.from('rooms').select('id, plant_id, name, code, type').order('code'),
      supabase.from('machines').select('id, plant_id, room_id, name, code, type, status'),
      supabase.from('organization_members').select('user_id, role, profiles ( full_name, email, phone, avatar_url )').eq('org_id', orgId),
    ]).then(([p, r, m, t]) => {
      // Solo plantas de incubación (las granjas usan prefijo G-)
      setPlants((p.data ?? []).filter((x) => !(x.code?.startsWith('G') || x.name?.startsWith('G-'))))
      setRooms(r.data ?? [])
      setMachines(m.data ?? [])
      const map = {}
      for (const row of t.data ?? []) {
        const pr = row.profiles || {}
        map[row.user_id] = { name: pr.full_name || pr.email || 'Operario', email: pr.email || null, phone: pr.phone || null, avatar: pr.avatar_url || null, role: row.role }
      }
      setPeople(map)
    })
  }, [orgId])

  useEffect(() => {
    if (!plantId && plants.length > 0) setPlantId(plants[0].id)
  }, [plants, plantId])

  const inProgressHatches = useMemo(
    () => hatch.hatches.filter((h) => h.status === 'in_progress' && h.plant_id === plantId),
    [hatch.hatches, plantId]
  )
  useEffect(() => {
    if (inProgressHatches.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [inProgressHatches.length])

  const { hour, shift, shiftDate } = currentSlot()
  const plant = plants.find((p) => p.id === plantId) ?? null
  const roomName = (id) => rooms.find((r) => r.id === id)?.name ?? 'Sala'
  const nameOf = (id) => people[id]?.name ?? '—'

  const plantMachines = useMemo(
    () => machines.filter((m) => m.plant_id === plantId && m.status !== 'decommissioned'),
    [machines, plantId]
  )
  const latestByMachine = useMemo(() => {
    const map = new Map()
    for (const c of mc.checks) if (!map.has(c.machine_id)) map.set(c.machine_id, c)
    return map
  }, [mc.checks])

  const shiftChecks = useMemo(
    () => mc.checks.filter((c) => c.plant_id === plantId && c.shift_date === shiftDate && c.shift_number === shift),
    [mc.checks, plantId, shiftDate, shift]
  )
  const activeOperatorId = shiftChecks[0]?.taken_by ?? null
  const lastTakeAt = shiftChecks[0]?.taken_at ?? null
  const op = activeOperatorId ? people[activeOperatorId] : null

  const doneRound = useMemo(
    () => new Set(mc.checks.filter((c) => c.plant_id === plantId && c.shift_date === shiftDate && c.hour_slot === hour).map((c) => c.machine_id)).size,
    [mc.checks, plantId, shiftDate, hour]
  )
  const totalRound = plantMachines.length
  const pct = totalRound ? Math.round((doneRound / totalRound) * 100) : 0

  const novedades = useMemo(() => {
    let n = 0
    for (const m of plantMachines) {
      const c = latestByMachine.get(m.id)
      if (c && (c.condition === 'fault' || c.condition === 'warning')) n += 1
    }
    return n
  }, [plantMachines, latestByMachine])

  const alertMachines = useMemo(() => {
    const rank = { fault: 0, warning: 1 }
    return plantMachines
      .map((m) => ({ machine: m, check: latestByMachine.get(m.id) }))
      .filter((x) => x.check && (x.check.condition === 'fault' || x.check.condition === 'warning'))
      .sort((a, b) => rank[a.check.condition] - rank[b.check.condition])
  }, [plantMachines, latestByMachine])

  // OT de la sede
  const plantOrders = useMemo(() => wo.orders.filter((o) => o.plant_id === plantId), [wo.orders, plantId])
  const otActive = plantOrders.filter((o) => o.status === 'open' || o.status === 'in_progress')
  const otUnassigned = otActive.filter((o) => o.status === 'open' && !o.assigned_to).length
  const otCritical = otActive.filter((o) => o.priority === 'critical')

  // Actividades del turno de la sede
  const plantActivities = useMemo(() => so.activities.filter((a) => !a.plant_id || a.plant_id === plantId), [so.activities, plantId])
  const actPending = plantActivities.filter((a) => a.status === 'pending')
  const actInProgress = plantActivities.filter((a) => a.status === 'in_progress')

  // Ciclo: cargues activos por lote (no transferidos) de la sede
  const cycleLotes = useMemo(() => {
    const transferred = new Set(flow.transfers.map((t) => t.lote))
    const map = new Map()
    for (const l of flow.loads) {
      if (l.plant_id !== plantId || transferred.has(l.lote)) continue
      const cur = map.get(l.lote) ?? { lote: l.lote, cycleStart: l.cycle_start_at ?? null, loads: 0 }
      cur.loads += 1
      if (l.cycle_start_at && (!cur.cycleStart || new Date(l.cycle_start_at) < new Date(cur.cycleStart))) cur.cycleStart = l.cycle_start_at
      map.set(l.lote, cur)
    }
    return [...map.values()].map((x) => ({ ...x, age: cycleAge(x.cycleStart) }))
  }, [flow.loads, flow.transfers, plantId])
  const readyTransfer = cycleLotes.filter((x) => x.age && x.age.hours >= TRANSFER_HOURS).length

  // Transferencias pendientes de nacimiento (no iniciadas) de la sede
  const startedTransferIds = useMemo(() => new Set(hatch.hatches.map((h) => h.transfer_id).filter(Boolean)), [hatch.hatches])
  const pendingHatch = useMemo(
    () => flow.transfers.filter((t) => t.plant_id === plantId && !startedTransferIds.has(t.id)),
    [flow.transfers, plantId, startedTransferIds]
  )
  const readyHatch = pendingHatch.filter((t) => { const a = cycleAge(t.cycle_start_at); return a && a.hours >= HATCH_HOURS }).length

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>Panel del supervisor de planta</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola{firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} · turno, tareas y ciclo de incubación
          </span>
        </div>
        <span className="pill live"><span className="dot" /> En vivo</span>
      </div>

      {plants.length > 1 && (
        <div className="plant-chips" style={{ marginTop: 10 }}>
          {plants.map((p) => (
            <button key={p.id} className={p.id === plantId ? 'chip active' : 'chip'} onClick={() => setPlantId(p.id)}>{p.name}</button>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className={`kpi-card${pct < 100 && totalRound > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{pct}%</span>
          <span className="kpi-label">Ronda de la hora ({doneRound}/{totalRound})</span>
        </div>
        <div className={`kpi-card${novedades > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{novedades}</span>
          <span className="kpi-label">Máquinas con novedad</span>
        </div>
        <div className={`kpi-card${otUnassigned > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{otActive.length}</span>
          <span className="kpi-label">OT activas ({otUnassigned} sin asignar)</span>
        </div>
        <div className={`kpi-card${actPending.length > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{actPending.length + actInProgress.length}</span>
          <span className="kpi-label">Tareas del turno ({actPending.length} pendientes)</span>
        </div>
        <div className={`kpi-card${readyTransfer > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{readyTransfer}</span>
          <span className="kpi-label">Listos para transferencia</span>
        </div>
        <div className={`kpi-card${readyHatch > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{readyHatch}</span>
          <span className="kpi-label">Listos para nacimiento</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{inProgressHatches.length}</span>
          <span className="kpi-label">Nacimientos en curso</span>
        </div>
      </div>

      {/* Turno · operario · progreso */}
      <div className="mon-topbar" style={{ marginTop: 14 }}>
        <div className="mon-tile mon-shift">
          <span className="mon-label">Turno actual</span>
          <strong>{SHIFT_LABEL[shift]}</strong>
          <span className="hint" style={{ margin: 0 }}>Hora {String(hour).padStart(2, '0')}:00 · última toma {fmtTime(lastTakeAt)}</span>
        </div>
        <div className="mon-tile mon-operator">
          <span className="mon-label">Operario en turno</span>
          {op ? (
            <div className="mon-op">
              {op.avatar ? <img className="mon-avatar" src={op.avatar} alt={op.name} /> : <div className="mon-avatar ph">{initials(op.name)}</div>}
              <div className="mon-op-info">
                <strong>{op.name}</strong>
                <span className="mon-contact">
                  {op.phone && <a href={`tel:${op.phone}`}>📞 {op.phone}</a>}
                  {!op.phone && <span className="hint" style={{ margin: 0 }}>Sin contacto</span>}
                </span>
              </div>
            </div>
          ) : (
            <strong className="hint" style={{ margin: '4px 0 0' }}>Sin registros en este turno todavía</strong>
          )}
        </div>
        <div className="mon-tile mon-progress">
          <span className="mon-label">Avance de la ronda</span>
          <strong>{doneRound}/{totalRound}</strong>
          <div className="mon-bar"><div className="mon-bar-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {(mc.error || wo.error || flow.error || hatch.error) && (
        <p className="msg error">{mc.error || wo.error || flow.error || hatch.error}</p>
      )}

      {/* Nacimientos en curso */}
      {inProgressHatches.length > 0 && (
        <>
          <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Nacimientos en curso</h3>
          <div className="admin-list">
            {inProgressHatches.map((h) => (
              <div key={h.id} className="admin-row compact" style={{ margin: 0 }}>
                <span>🐤</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>Lote {h.lote} · {MODE_LABEL[h.mode] ?? h.mode}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    🏭 {(h.room_ids ?? []).map(roomName).join(' + ') || 'Sin sala'} · ⏱️ {elapsedLabel(h.started_at, now)}
                    {' · '}👥 sexaje {h.sexing_ops ?? 0} · vacuna {h.vaccination_ops ?? 0} · extra {h.extra_ops ?? 0}
                  </span>
                </div>
                <button className="primary small" onClick={() => onNavigate?.('supervision')}>Cerrar jornada</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Ciclo de incubación */}
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Ciclo de incubación</h3>
      {cycleLotes.length === 0 && pendingHatch.length === 0 ? (
        <p className="hint">No hay lotes en incubación en {plant?.name ?? 'esta sede'}.</p>
      ) : (
        <div className="admin-list">
          {cycleLotes.map((x) => {
            const ready = x.age && x.age.hours >= TRANSFER_HOURS
            return (
              <div key={`l-${x.lote}`} className="admin-row compact" style={{ margin: 0 }}>
                <span>🥚</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>Lote {x.lote}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {x.loads} cargue{x.loads === 1 ? '' : 's'}{x.age ? ` · Edad ${x.age.label}` : ''} · en incubadoras
                  </span>
                </div>
                <span className={`pill status ${ready ? 'ok' : 'idle'}`}>{ready ? 'Transferir' : 'Incubando'}</span>
              </div>
            )
          })}
          {pendingHatch.map((t) => {
            const a = cycleAge(t.cycle_start_at)
            const ready = a && a.hours >= HATCH_HOURS
            return (
              <div key={`t-${t.id}`} className="admin-row compact" style={{ margin: 0 }}>
                <span>🐣</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>Lote {t.lote} · {MODE_LABEL[t.mode] ?? t.mode}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    🏭 {(t.room_ids ?? []).map(roomName).join(' + ') || 'Sin sala'} · Transferido {fmtDT(t.transferred_at)}{a ? ` · Edad ${a.label}` : ''}
                  </span>
                </div>
                {ready ? (
                  <button className="primary small" onClick={() => onNavigate?.('supervision')}>Iniciar nacimiento</button>
                ) : (
                  <span className="pill status idle">En nacedoras</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tareas del turno */}
      <div className="admin-section-head" style={{ marginTop: 18 }}>
        <span className="section-title" style={{ margin: 0 }}>Tareas del turno</span>
        <button className="chip ghost" onClick={() => onNavigate?.('supervision')}>+ Asignar tarea</button>
      </div>
      {actPending.length + actInProgress.length === 0 ? (
        <p className="hint">No hay tareas activas en el turno.</p>
      ) : (
        <div className="admin-list">
          {[...actInProgress, ...actPending].slice(0, 8).map((a) => (
            <div key={a.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>{a.status === 'in_progress' ? '🔧' : '📋'}</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{a.title}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  👤 {nameOf(a.assigned_to)}{a.room_id ? ` · 📍 ${roomName(a.room_id)}` : ''}
                </span>
              </div>
              <span className={`pill status ${a.status === 'in_progress' ? '' : 'warn'}`}>{a.status === 'in_progress' ? 'En ejecución' : 'Pendiente'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Requiere atención */}
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Requiere atención {alertMachines.length + otCritical.length > 0 ? `(${alertMachines.length + otCritical.length})` : ''}
      </h3>
      {alertMachines.length === 0 && otCritical.length === 0 ? (
        <p className="hint">Sin novedades críticas. Todo en orden. ✅</p>
      ) : (
        <div className="admin-list">
          {alertMachines.map(({ machine: m, check: c }) => (
            <div key={m.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>{c.condition === 'fault' ? '🔴' : '🟡'}</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{m.name} <span className="hint" style={{ margin: 0 }}>({m.code})</span></strong>
                <span className="hint" style={{ margin: 0 }}>
                  {roomName(m.room_id)} · {fmtTime(c.taken_at)} · {nameOf(c.taken_by)}{c.notes ? ` · ${c.notes}` : ''}
                </span>
              </div>
              <span className={`pill status ${c.condition === 'fault' ? 'off' : 'warn'}`}>{c.condition === 'fault' ? 'Falla' : 'Alerta'}</span>
            </div>
          ))}
          {otCritical.map((o) => (
            <div key={o.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>🛠️</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{o.code} · {o.title}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  OT crítica · {STATUS_LABEL[o.status] ?? o.status}{o.assigned_to ? ` · ${nameOf(o.assigned_to)}` : ' · Sin asignar'}
                </span>
              </div>
              <span className="pill status off">Crítica</span>
            </div>
          ))}
        </div>
      )}

      {/* Accesos rápidos */}
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Accesos rápidos</h3>
      <div className="actions row" style={{ flexWrap: 'wrap' }}>
        <button className="chip ghost" onClick={() => onNavigate?.('supervision')}>👁️ Supervisión</button>
        <button className="chip ghost" onClick={() => onNavigate?.('horarios')}>📅 Horarios</button>
        <button className="chip ghost" onClick={() => onNavigate?.('monitoreo')}>📺 Monitoreo</button>
        <button className="chip ghost" onClick={() => onNavigate?.('mantenimiento')}>🛠️ Mantenimiento</button>
        <button className="chip ghost" onClick={() => onNavigate?.('plantas')}>🗺️ Ver plano de planta</button>
      </div>
    </div>
  )
}
