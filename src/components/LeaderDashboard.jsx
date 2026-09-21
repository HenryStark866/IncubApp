/**
 * =============================================================================
 * ARCHIVO: src/components/LeaderDashboard.jsx
 * PROPÃ“SITO: Panel de control (home) predeterminado del lÃ­der de Ã¡rea (coordinator).
 *   Muestra KPIs en tiempo real, acceso rÃ¡pido a mÃ³dulos, mini-mapa de planta
 *   y un feed de actividad reciente del turno. Reemplaza al LeaderOpsMap como
 *   pantalla inicial; el mapa de planta queda accesible desde los botones de acciÃ³n.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useMemo, useState, useEffect } from 'react'
import { usePlants } from '../hooks/usePlants'
import { useRooms } from '../hooks/useRooms'
import { useMachines } from '../hooks/useMachines'
import { useMachineChecks, shiftOfHour, SHIFT_LABEL } from '../hooks/useMachineChecks'
import { useShiftOps } from '../hooks/useShiftOps'
import { useLoads } from '../hooks/useLoads'
import { useEvidence } from '../hooks/useEvidence'
import { useWorkOrders } from '../hooks/useWorkOrders'
import { conditionOf } from '../lib/machineCondition'
import { buildClientNavItems } from '../lib/clientMenuTemplate'
import { canSeePlant3DTour, PLANT_3D_TOUR_URL } from '../lib/roles'
import FloorMap from './FloorMap'
import MachineAssetHub from '../features/maintenance/components/MachineAssetHub'

/** Tabs excluidos del acceso rÃ¡pido: el lÃ­der los ve como resultado, no ejecuta. */
const EXCLUDED_QUICK = new Set([
  'horarios', 'supervision', 'mantenimiento', 'calibracion',
  'asistencia', 'misionales', 'preoperacional', 'hoy',
])

/** Ãconos por tipo de evento del feed */
const FEED_ICONS = {
  Ronda: 'ðŸ”',
  Actividad: 'âš¡',
  Cargue: 'ðŸ“¦',
  Transferencia: 'â†”ï¸',
}

/** Colores semÃ¡nticos de condiciÃ³n de mÃ¡quina */
const CONDITION_COLOR = {
  normal: '#00ff88',
  warning: '#ffaa00',
  fault: '#ff3366',
  off: '#8faeb4',
}

function nowTime() {
  return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function KpiCard({ label, value, icon, color, sub }) {
  return (
    <div className="ldr-kpi-card" style={{ '--kpi-accent': color }}>
      <span className="ldr-kpi-icon" aria-hidden="true">{icon}</span>
      <div className="ldr-kpi-body">
        <span className="ldr-kpi-value">{value ?? 'â€“'}</span>
        <span className="ldr-kpi-label">{label}</span>
        {sub && <span className="ldr-kpi-sub">{sub}</span>}
      </div>
    </div>
  )
}

function QuickCard({ item, onNavigate }) {
  return (
    <button
      type="button"
      className="ldr-quick-card"
      onClick={() => onNavigate?.(item.id)}
      title={item.hint || item.label}
    >
      <span className="ldr-quick-icon" aria-hidden="true">{item.icon || 'ðŸ”¹'}</span>
      <span className="ldr-quick-label">{item.label}</span>
    </button>
  )
}

function FeedItem({ event, peopleName }) {
  const who = peopleName?.[event.personId] || 'Alguien'
  const when = event.when
    ? new Date(event.when).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : ''
  return (
    <div className={`ldr-feed-item kind-${(event.kind || '').toLowerCase()}`}>
      <span className="ldr-feed-dot" aria-hidden="true">{FEED_ICONS[event.kind] || 'â€¢'}</span>
      <div className="ldr-feed-body">
        <span className="ldr-feed-who">{who}</span>
        <span className="ldr-feed-kind">{event.kind}</span>
        {when && <span className="ldr-feed-when">{when}</span>}
      </div>
    </div>
  )
}

function EvidenceCard({ item, getFileUrl, peopleName }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (item.file_path) {
      getFileUrl(item.file_path).then((u) => setUrl(u))
    }
  }, [item.file_path, getFileUrl])

  const uploader = peopleName?.[item.uploaded_by] || 'Operario'
  const dateStr = item.created_at
    ? new Date(item.created_at).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    })
    : ''

  return (
    <div className="ldr-ev-card">
      <div className="ldr-ev-thumb">
        {item.file_type === 'image' && url ? (
          <img src={url} alt={item.file_name} className="ldr-ev-img" />
        ) : (
          <span className="ldr-ev-doc-icon">ðŸ“„</span>
        )}
      </div>
      <div className="ldr-ev-info">
        <span className="ldr-ev-name" title={item.file_name}>{item.file_name}</span>
        <span className="ldr-ev-meta">{uploader} Â· {dateStr}</span>
        {item.note && <span className="ldr-ev-note">"{item.note}"</span>}
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="ldr-ev-link" title="Ver archivo original">
          â†—
        </a>
      )}
    </div>
  )
}

export default function LeaderDashboard({
  orgId,
  userId,
  role,
  area,
  userName,
  orgName,
  onNavigate,
  presence,
  can,
  people = {},
}) {
  const [currentTime] = useState(nowTime)
  const currentShift = shiftOfHour(new Date().getHours())

  const { plants } = usePlants(orgId)
  const activePlantId = plants[0]?.id || null
  const selectedPlant = plants.find((p) => p.id === activePlantId) ?? null

  const roomsApi = useRooms(activePlantId, orgId)
  const machinesApi = useMachines(activePlantId)
  const machines = machinesApi.machines

  const mc = useMachineChecks(orgId, userId, { canSupervise: false })
  const so = useShiftOps(orgId, userId)
  const { loads, transfers } = useLoads(orgId, userId)
  const { evidence, getFileUrl } = useEvidence(orgId, userId)
  const { orders } = useWorkOrders(orgId, userId)

  const latestByMachine = useMemo(() => {
    const map = new Map()
    for (const c of mc.checks) if (!map.has(c.machine_id)) map.set(c.machine_id, c)
    return map
  }, [mc.checks])

  const conditionByMachine = useMemo(() => {
    const map = {}
    for (const m of machines) {
      const c = latestByMachine.get(m.id)
      if (c) map[m.id] = conditionOf(c.condition)
    }
    return map
  }, [machines, latestByMachine])

  const summary = useMemo(() => {
    const s = { normal: 0, warning: 0, fault: 0, off: 0, none: 0 }
    for (const m of machines) {
      const c = latestByMachine.get(m.id)
      if (!c) s.none += 1
      else s[c.condition] = (s[c.condition] ?? 0) + 1
    }
    return s
  }, [machines, latestByMachine])

  const totalMachines = machines.length
  const onlineCount = presence?.onlineCount ?? 0
  const puede3D = canSeePlant3DTour(role)

  const activeOrdersCount = useMemo(() => {
    return orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length
  }, [orders])

  const quickItems = useMemo(() => {
    if (!can) return []
    return buildClientNavItems({ can, role })
      .filter((i) => !EXCLUDED_QUICK.has(i.id))
      .slice(0, 8)
  }, [can, role])

  const recentEvents = useMemo(() => {
    const out = []
    for (const c of mc.checks) {
      out.push({ kind: 'Ronda', personId: c.taken_by, when: c.taken_at })
    }
    for (const a of so.activities) {
      const when = a.completed_at || a.started_at || a.created_at
      out.push({ kind: 'Actividad', personId: a.assigned_to, when })
    }
    for (const l of loads) {
      out.push({ kind: 'Cargue', personId: l.created_by, when: l.loaded_at })
    }
    for (const t of transfers) {
      out.push({ kind: 'Transferencia', personId: t.created_by, when: t.transferred_at })
    }
    return out
      .filter((e) => !!e.when)
      .sort((a, b) => b.when.localeCompare(a.when))
      .slice(0, 12)
  }, [mc.checks, so.activities, loads, transfers])

  const peopleName = useMemo(() => {
    const map = {}
    for (const [id, p] of Object.entries(people)) map[id] = p.name || 'Operario'
    return map
  }, [people])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos dÃ­as' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = userName ? userName.split(' ')[0] : 'LÃ­der'

  return (
    <div className="leader-dash">
      <header className="ldr-header">
        <div className="ldr-header-left">
          <h1 className="ldr-greeting">
            {greeting}, <span className="ldr-name">{firstName}</span>
          </h1>
          <p className="ldr-subtitle">
            {orgName || 'Planta'} Â· Turno {currentShift} Â·{' '}
            <span className="ldr-shift-label">{SHIFT_LABEL?.[currentShift] || `T${currentShift}`}</span>
          </p>
        </div>
        <div className="ldr-header-right">
          <span className="ldr-clock">{currentTime}</span>
          <span className="pill live">
            <span className="dot" />
            En vivo
          </span>
        </div>
      </header>

      <section className="ldr-kpi-grid" aria-label="Indicadores de planta">
        <KpiCard label="Operativas" value={summary.normal} icon="âœ…" color={CONDITION_COLOR.normal} sub={`de ${totalMachines} mÃ¡quinas`} />
        <KpiCard label="En alerta" value={summary.warning} icon="âš ï¸" color={CONDITION_COLOR.warning} />
        <KpiCard label="Con falla" value={summary.fault} icon="ðŸ”´" color={CONDITION_COLOR.fault} />
        <KpiCard label="OTs Activas" value={activeOrdersCount} icon="ðŸ”§" color="#38bdf8" sub="Mantenimiento SIG" />
        <KpiCard label="Evidencias SIG" value={evidence.length} icon="ðŸ“" color="#a78bfa" sub="Adjuntos registrados" />
        <KpiCard label="Personal online" value={onlineCount} icon="ðŸ‘¥" color="var(--accent)" sub="en plataforma" />
      </section>

      {quickItems.length > 0 && (
        <section className="ldr-quick-section" aria-label="Acceso rÃ¡pido">
          <h2 className="ldr-section-title"><span aria-hidden="true">âš¡</span> Acceso RÃ¡pido</h2>
          <div className="ldr-quick-grid">
            {quickItems.map((item) => (
              <QuickCard key={item.id} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      )}

      {/* Evidencias SIG Mantenimiento y ProducciÃ³n */}
      <section className="ldr-evidence-section" aria-label="Evidencias SIG Mantenimiento y ProducciÃ³n">
        <h2 className="ldr-section-title">
          <span aria-hidden="true">ðŸ“¸</span> Evidencias Registradas (SIG Mantenimiento & ProducciÃ³n)
          <span className="ldr-section-sub">{evidence.length} archivos vinculados</span>
        </h2>
        {evidence.length === 0 ? (
          <p className="ldr-feed-empty">No hay evidencias ni adjuntos de mantenimiento/producciÃ³n en esta organizaciÃ³n aÃºn.</p>
        ) : (
          <div className="ldr-ev-grid">
            {evidence.slice(0, 6).map((item) => (
              <EvidenceCard key={item.id} item={item} getFileUrl={getFileUrl} peopleName={peopleName} />
            ))}
          </div>
        )}
      </section>

      <div className="ldr-main-split">
        <section className="ldr-map-section" aria-label="Plano de planta en vivo">
          <h2 className="ldr-section-title">
            <span aria-hidden="true">ðŸ—ºï¸</span> Plano en vivo
            {selectedPlant && <span className="ldr-section-sub">{selectedPlant.name}</span>}
          </h2>
          <div className="ldr-map-frame">
            {roomsApi.loading ? (
              <div className="ldr-map-placeholder">Cargando planoâ€¦</div>
            ) : roomsApi.rooms.length === 0 ? (
              <div className="ldr-map-placeholder">Planta sin plano dibujado aÃºn.</div>
            ) : (
              <FloorMap
                canManage={false}
                canExpand={false}
                roomsApi={roomsApi}
                machines={machines}
                updateMachine={() => { }}
                moveRoom={roomsApi.moveRoom}
                selectedMachineId={null}
                onSelectMachine={() => { }}
                livePeople={[]}
                conditionByMachine={conditionByMachine}
                highlightRoomIds={null}
              />
            )}
          </div>
        </section>

        <section className="ldr-feed-section" aria-label="Actividad reciente">
          <h2 className="ldr-section-title"><span aria-hidden="true">ðŸ“‹</span> Actividad del turno</h2>
          <div className="ldr-feed">
            {recentEvents.length === 0 ? (
              <p className="ldr-feed-empty">Sin actividad registrada en este turno aÃºn.</p>
            ) : (
              recentEvents.map((ev, i) => (
                <FeedItem key={i} event={ev} peopleName={peopleName} />
              ))
            )}
          </div>
        </section>
      </div>


      <section className="ldr-assets-section" style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#fff', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)' }} aria-label="Gestión de Activos SIG">
        <h2 className="ldr-section-title" style={{ marginBottom: '1rem' }}>
          <span aria-hidden="true">🛠️</span> Centro de Activos y Dossiers SIG
        </h2>
        <div style={{ height: '600px', overflow: 'hidden', borderRadius: '0.5rem' }}>
          <MachineAssetHub />
        </div>
      </section>
      <footer className="ldr-actions">
        <button type="button" className="ldr-action-btn ldr-primary" onClick={() => onNavigate?.('mapa-planta')}>
          ðŸ—ºï¸ Plano completo
        </button>
        {puede3D && (
          <button type="button" className="ldr-action-btn ldr-secondary" onClick={() => onNavigate?.('mapa-3d')}>
            ðŸŒ Planta 3D
          </button>
        )}
        {puede3D && (
          <a className="ldr-action-btn ldr-ghost" href={PLANT_3D_TOUR_URL} target="_blank" rel="noopener noreferrer">
            â†—ï¸ 3D aparte
          </a>
        )}
      </footer>
    </div>
  )
}



