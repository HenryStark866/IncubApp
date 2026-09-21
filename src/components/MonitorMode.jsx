/**
 * =============================================================================
 * ARCHIVO: src/components/MonitorMode.jsx
 * PROPÃ“SITO: Componente UI Â«MonitorModeÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useMachineChecks, currentSlot } from '../features/maintenance/hooks/useMachineChecks'
import { useShiftOps } from '../features/operations/hooks/useShiftOps'
import { useLoads } from '../features/production/hooks/useLoads'
import { useShiftSchedule } from '../features/operations/hooks/useShiftSchedule'
import { exportOperationReport } from '../lib/operationReport'
import ControlDiarioPanel from './ControlDiarioPanel'
import { conditionOf } from '../lib/machineCondition'

/**
 * Monitoreo â€” tablero en vivo para supervisar la planta.
 * Acceso: owner, admin, supervisor, coordinador.
 * Muestra la ÃšLTIMA foto de cada mÃ¡quina (sin importar la hora), agrupada por
 * sala, junto con el operario en turno y el progreso de la ronda en curso.
 * Se actualiza en tiempo real vÃ­a la suscripciÃ³n Realtime de useMachineChecks.
 */

const MACHINE_TYPE_LABEL = {
  setter: 'Incubadora',
  hatcher: 'Nacedora',
  combo: 'Combinada',
  chiller: 'Chiller',
  compressor: 'Compresor',
  other: 'Otro equipo',
}


const SHIFT_LABEL = { 1: 'T1 (06â€“14)', 2: 'T2 (14â€“22)', 3: 'T3 (22â€“06)' }

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : 'â€”'

const initials = (name) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

/* â”€â”€ Foto con URL firmada (se refresca con `tick` porque expira en 1h) â”€â”€ */
function MonPhoto({ path, getPhotoUrl, tick }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }
    let alive = true
    getPhotoUrl(path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [path, getPhotoUrl, tick])

  if (!path) return <div className="mon-photo placeholder">ðŸ”Œ</div>
  if (!url) return <div className="mon-photo placeholder">ðŸ“·</div>
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Ver foto completa">
      <img className="mon-photo" src={url} alt="Interfaz de la mÃ¡quina" loading="lazy" />
    </a>
  )
}

export default function MonitorMode({ orgId, userId, role }) {
  const canMonitor = ['owner', 'admin', 'supervisor', 'coordinator'].includes(role)
  const mc = useMachineChecks(orgId, userId, { canSupervise: true })
  const so = useShiftOps(orgId, userId)
  const { loads, transfers } = useLoads(orgId, userId)
  const { assignments } = useShiftSchedule(orgId, userId)

  const [plants, setPlants] = useState([])
  const [rooms, setRooms] = useState([])
  const [machines, setMachines] = useState([])
  const [people, setPeople] = useState({})
  const [plantId, setPlantId] = useState(null)
  const [tick, setTick] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [verControlDiario, setVerControlDiario] = useState(false)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('created_at'),
      supabase.from('rooms').select('id, plant_id, name, code, type').order('code'),
      supabase.from('machines').select('id, plant_id, room_id, name, code, type, status'),
      supabase
        .from('organization_members')
        .select('user_id, role, profiles ( id, full_name, email, phone, avatar_url )')
        .eq('org_id', orgId),
    ]).then(([p, r, m, t]) => {
      setPlants(p.data ?? [])
      setRooms(r.data ?? [])
      setMachines(m.data ?? [])
      const map = {}
      for (const row of t.data ?? []) {
        const pr = row.profiles || {}
        map[row.user_id] = {
          name: pr.full_name || pr.email || 'Operario',
          email: pr.email || null,
          phone: pr.phone || null,
          avatar: pr.avatar_url || null,
          role: row.role,
        }
      }
      setPeople(map)
    })
  }, [orgId])

  useEffect(() => {
    if (!plantId && plants.length > 0) setPlantId(plants[0].id)
  }, [plants, plantId])

  // Las URLs firmadas expiran en 1h; refrescamos el tablero cada 45 min.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 45 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const { hour, shift, shiftDate } = currentSlot()

  const plantMachines = useMemo(
    () => machines.filter((m) => m.plant_id === plantId && m.status !== 'decommissioned'),
    [machines, plantId]
  )

  // Ãšltima foto/registro por mÃ¡quina (mc.checks viene ordenado por taken_at desc)
  const latestByMachine = useMemo(() => {
    const map = new Map()
    for (const c of mc.checks) {
      if (!map.has(c.machine_id)) map.set(c.machine_id, c)
    }
    return map
  }, [mc.checks])

  // Operario(s) del turno actual en esta planta
  const shiftChecks = useMemo(
    () =>
      mc.checks.filter(
        (c) => c.plant_id === plantId && c.shift_date === shiftDate && c.shift_number === shift
      ),
    [mc.checks, plantId, shiftDate, shift]
  )
  const activeOperatorId = shiftChecks[0]?.taken_by ?? null
  const lastTakeAt = shiftChecks[0]?.taken_at ?? null
  const otherOperatorIds = useMemo(
    () => [...new Set(shiftChecks.map((c) => c.taken_by))].filter((id) => id !== activeOperatorId),
    [shiftChecks, activeOperatorId]
  )

  // Progreso de la ronda de la hora en curso
  const doneRound = useMemo(
    () =>
      new Set(
        mc.checks
          .filter((c) => c.plant_id === plantId && c.shift_date === shiftDate && c.hour_slot === hour)
          .map((c) => c.machine_id)
      ).size,
    [mc.checks, plantId, shiftDate, hour]
  )
  const totalRound = plantMachines.length
  const pct = totalRound ? Math.round((doneRound / totalRound) * 100) : 0

  // Resumen de estado segÃºn la Ãºltima condiciÃ³n conocida de cada mÃ¡quina
  const summary = useMemo(() => {
    const s = { normal: 0, warning: 0, fault: 0, off: 0, none: 0 }
    for (const m of plantMachines) {
      const c = latestByMachine.get(m.id)
      if (!c) s.none += 1
      else s[c.condition] = (s[c.condition] ?? 0) + 1
    }
    return s
  }, [plantMachines, latestByMachine])

  const machineName = useMemo(() => {
    const map = {}
    for (const m of machines) map[m.id] = `${m.name}${m.code ? ` (${m.code})` : ''}`
    return map
  }, [machines])

  /**
   * Reporte de operaciÃ³n (2026-07-26, pedido de Henry al mover Modo monitoreo
   * a home del lÃ­der de Ã¡rea): consolida turnos, operarios, rondas, cargues
   * y transferencias en un Ãºnico Excel â€” mismo criterio que el export que
   * tenÃ­a el panel-carrusel anterior, mÃ¡s una hoja "Operarios" que reÃºne por
   * persona cuÃ¡ntos turnos/rondas/cargues/transferencias/actividades tuvo.
   */
  const handleExportReport = useCallback(async () => {
    setExporting(true)
    try {
      await exportOperationReport({
        assignments,
        checks: mc.checks,
        loads,
        transfers,
        activities: so.activities,
        people,
        machineName,
      })
    } finally {
      setExporting(false)
    }
  }, [assignments, people, mc.checks, loads, transfers, so.activities, machineName])


  if (!canMonitor) {
    return (
      <div className="card wide">
        <div className="card-head">
          <h2>Monitoreo</h2>
        </div>
        <p className="hint">
          Este mÃ³dulo es solo para administradores, supervisores y coordinadores.
        </p>
      </div>
    )
  }

  const plantRooms = rooms.filter((r) => r.plant_id === plantId)
  const op = activeOperatorId ? people[activeOperatorId] : null

  // Agrupar el muro por sala
  const groups = []
  for (const r of plantRooms) {
    const ms = plantMachines.filter((m) => m.room_id === r.id)
    if (ms.length) groups.push({ room: r, machines: ms })
  }
  const unassigned = plantMachines.filter((m) => !m.room_id)
  if (unassigned.length) groups.push({ room: { id: 'none', name: 'Sin sala asignada' }, machines: unassigned })

  return (
    <div className="card mon">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2>Monitoreo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pill live">
            <span className="dot" /> En vivo
          </span>
          <button
            type="button"
            className="ghost small"
            onClick={handleExportReport}
            disabled={exporting}
            title="Descargar Excel con turnos, operarios, rondas, cargues y transferencias"
          >
            {exporting ? 'â³ Generandoâ€¦' : 'ðŸ“¥ Reporte de operaciÃ³n'}
          </button>
          <button
            type="button"
            className="ghost small"
            onClick={() => setVerControlDiario(true)}
            title="Registros FOINC01 / FONAC01 del SIG, uno por cargue, con las rondas ya diligenciadas"
          >
            ðŸ“‹ Control diario
          </button>
        </div>
      </div>

      {plants.length > 1 && (
        <div className="plant-chips">
          {plants.map((p) => (
            <button
              key={p.id}
              className={p.id === plantId ? 'chip active' : 'chip'}
              onClick={() => setPlantId(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="mon-topbar">
        <div className="mon-tile mon-shift">
          <span className="mon-label">Turno actual</span>
          <strong>{SHIFT_LABEL[shift]}</strong>
          <span className="hint" style={{ margin: 0 }}>
            Hora {String(hour).padStart(2, '0')}:00 Â· Ãºltima toma {fmtTime(lastTakeAt)}
          </span>
        </div>

        <div className="mon-tile mon-operator">
          <span className="mon-label">Operario en turno</span>
          {op ? (
            <div className="mon-op">
              {op.avatar ? (
                <img className="mon-avatar" src={op.avatar} alt={op.name} />
              ) : (
                <div className="mon-avatar ph">{initials(op.name)}</div>
              )}
              <div className="mon-op-info">
                <strong>{op.name}</strong>
                <span className="mon-contact">
                  {op.phone && <a href={`tel:${op.phone}`}>ðŸ“ž {op.phone}</a>}
                  {op.email && <a href={`mailto:${op.email}`}>âœ‰ï¸ {op.email}</a>}
                  {!op.phone && !op.email && <span className="hint" style={{ margin: 0 }}>Sin contacto</span>}
                </span>
                {otherOperatorIds.length > 0 && (
                  <span className="hint" style={{ margin: 0 }}>
                    TambiÃ©n en turno: {otherOperatorIds.map((id) => people[id]?.name).filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <strong className="hint" style={{ margin: '4px 0 0' }}>
              Sin registros en este turno todavÃ­a
            </strong>
          )}
        </div>

        <div className="mon-tile mon-progress">
          <span className="mon-label">Ronda de la hora</span>
          <strong>
            {doneRound}/{totalRound}
          </strong>
          <div className="mon-bar">
            <div className="mon-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="mon-stats">
        <span className="pill status ok">âœ“ {summary.normal} sin novedad</span>
        <span className="pill status warn">â–² {summary.warning} alerta</span>
        <span className="pill status off">âœ• {summary.fault} falla</span>
        <span className="pill status idle">â—§ {summary.off} apagada</span>
        {summary.none > 0 && <span className="pill">â—‹ {summary.none} sin registro</span>}
      </div>

      {mc.error && <p className="msg error">{mc.error}</p>}

      {mc.loading && mc.checks.length === 0 ? (
        <p className="hint">Cargandoâ€¦</p>
      ) : plantMachines.length === 0 ? (
        <p className="hint">Esta planta no tiene mÃ¡quinas activas.</p>
      ) : (
        groups.map((g) => (
          <div key={g.room.id}>
            <p className="component-title">{g.room.name}</p>
            <div className="mon-wall">
              {g.machines.map((m) => {
                const c = latestByMachine.get(m.id)
                const cond = c ? conditionOf(c.condition) : null
                const by = c ? people[c.taken_by]?.name : null
                return (
                  <div key={m.id} className={`mon-cell${c ? ` cond-${c.condition}` : ' empty'}`}>
                    <MonPhoto path={c?.photo_path} getPhotoUrl={mc.getPhotoUrl} tick={tick} />
                    <div className="mon-cell-info">
                      <strong title={m.name}>{m.name}</strong>
                      <span className="mon-cell-meta">
                        {m.code} Â· {MACHINE_TYPE_LABEL[m.type] ?? m.type}
                      </span>
                      {c ? (
                        <>
                          <span className="mon-cell-foot">
                            <span className={`pill status ${cond.cls}`}>{cond.label}</span>
                            <span className="mon-cell-when">
                              {fmtTime(c.taken_at)}
                              {by ? ` Â· ${by}` : ''}
                            </span>
                          </span>
                          {c.notes && <span className="check-notes">{c.notes}</span>}
                        </>
                      ) : (
                        <span className="mon-cell-when">Sin registro aÃºn</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* Actividades del turno reportadas por los operarios */}
      <p className="component-title" style={{ marginTop: 18 }}>Actividades del turno</p>
      {so.activities.filter((a) => !a.plant_id || a.plant_id === plantId).length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Sin actividades registradas.</p>
      ) : (
        <div className="admin-list">
          {so.activities.filter((a) => !a.plant_id || a.plant_id === plantId).slice(0, 8).map((a) => {
            const cls = a.status === 'completed' ? 'ok' : a.status === 'in_progress' ? '' : 'warn'
            const lbl = a.status === 'completed' ? 'Completada' : a.status === 'in_progress' ? 'En ejecuciÃ³n' : 'Pendiente'
            return (
              <div key={a.id} className="admin-row compact" style={{ margin: 0 }}>
                <span>ðŸ§¹</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{a.title}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    ðŸ‘¤ {people[a.assigned_to]?.name ?? 'â€”'}
                    {a.result_qty != null ? ` Â· Cant: ${Number(a.result_qty).toLocaleString('es-CO')}` : ''}
                    {a.status === 'completed' ? ` Â· ${a.completion === 'partial' ? 'Parcial' : 'Completa'}` : ''}
                  </span>
                </div>
                <span className={`pill status ${cls}`}>{lbl}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* MercancÃ­a recibida reportada por los operarios */}
      <p className="component-title" style={{ marginTop: 14 }}>MercancÃ­a recibida</p>
      {so.merchandise.filter((m) => !m.plant_id || m.plant_id === plantId).length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Sin reportes de mercancÃ­a.</p>
      ) : (
        <div className="admin-list">
          {so.merchandise.filter((m) => !m.plant_id || m.plant_id === plantId).slice(0, 8).map((m) => (
            <div key={m.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>ðŸ“¦</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{m.description || 'MercancÃ­a recibida'}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  ðŸ“ {rooms.find((r) => r.id === m.room_id)?.name ?? 'Sin ubicaciÃ³n'} Â· ðŸ‘¤ {people[m.received_by]?.name ?? 'â€”'} Â· {fmtTime(m.received_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {verControlDiario && (
        <ControlDiarioPanel
          machines={plantMachines}
          rooms={rooms}
          people={people}
          onClose={() => setVerControlDiario(false)}
        />
      )}
    </div>
  )
}

