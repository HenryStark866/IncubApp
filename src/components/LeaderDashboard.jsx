/**
 * =============================================================================
 * ARCHIVO: src/components/LeaderDashboard.jsx
 * PROPÓSITO: Panel de control (home) predeterminado del líder de área (coordinator).
 *   Muestra KPIs en tiempo real, acceso rápido a módulos, mini-mapa de planta
 *   y un feed de actividad reciente del turno. Reemplaza al LeaderOpsMap como
 *   pantalla inicial; el mapa de planta queda accesible desde los botones de acción.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { lazy, Suspense, useCallback, useMemo, useState, useEffect } from 'react'
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
import { supabase } from '../lib/supabase'
import FloorMap from './FloorMap'
import { buildProductionEvidence } from '../features/maintenance/lib/productionEvidence'
import {
  evidenceHasRecordDocument,
  openEvidenceFormat,
  shiftActivityRecordItem,
  singleCheckRound,
  workOrderRecordItem,
} from '../lib/sigRecordDocuments'

// El Centro de Activos SIG trae el historial Mantum (~7 MB): se carga aparte para que
// indicadores y feed del turno se vean de inmediato, sobre todo por el túnel.
const MachineAssetHub = lazy(() => import('../features/maintenance/components/MachineAssetHub'))
// Etapa 3: decisiones, equipo y plan del día del líder según su área (va encima de lo que ya había).
const LeaderAreaHome = lazy(() => import('../features/leader/components/LeaderAreaHome'))

/** Tabs excluidos del acceso rápido: el líder los ve como resultado, no ejecuta. */
const EXCLUDED_QUICK = new Set([
  'horarios',
  'supervision',
  'mantenimiento',
  'calibracion',
  'asistencia',
  'misionales',
  'preoperacional',
  'hoy',
])

/** Ãconos por tipo de evento del feed */
const FEED_ICONS = {
  Ronda: '◉',
  Actividad: '⚡',
  Mantenimiento: '🔧',
  Cargue: '📦',
  Transferencia: '[Transferencia]',
}

/** Colores semánticos de condición de máquina */
const CONDITION_COLOR = {
  normal: '#00ff88',
  warning: '#ffaa00',
  fault: '#ff3366',
  off: '#8faeb4',
}

function nowTime() {
  return new Date().toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function KpiCard({ label, value, icon, color, sub }) {
  return (
    <div className="ldr-kpi-card" style={{ '--kpi-accent': color }}>
      <span className="ldr-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="ldr-kpi-body">
        <span className="ldr-kpi-value">{value ?? '–'}</span>
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
      <span className="ldr-quick-icon" aria-hidden="true">
        {item.icon || '🔹'}
      </span>
      <span className="ldr-quick-label">{item.label}</span>
    </button>
  )
}

function FeedItem({ event, peopleName, getPhotoUrl, onOpenFormat }) {
  const [photoUrl, setPhotoUrl] = useState(null)
  const who = peopleName?.[event.personId] || 'Operario registrado'
  const when = event.when
    ? new Date(event.when).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  useEffect(() => {
    let active = true
    if (!event.photoPath) {
      setPhotoUrl(null)
      return undefined
    }
    getPhotoUrl(event.photoPath).then((url) => {
      if (active) setPhotoUrl(url)
    })
    return () => {
      active = false
    }
  }, [event.photoPath, getPhotoUrl])

  return (
    <div className={`ldr-feed-item kind-${(event.kind || '').toLowerCase()}`}>
      <span className="ldr-feed-dot" aria-hidden="true">
        {FEED_ICONS[event.kind] || '•'}
      </span>
      <div className="ldr-feed-body">
        <span className="ldr-feed-who">{who}</span>
        {event.kind !== 'Ronda' && <span className="ldr-feed-kind">{event.kind}</span>}
        {event.detail && (
          <span className="ldr-feed-detail" title={event.detail}>
            {event.detail}
          </span>
        )}
        {event.report && (
          <span className="ldr-feed-report" title={event.report}>
            {event.report}
          </span>
        )}
        {when && <span className="ldr-feed-when">{when}</span>}
      </div>
      <div className="ldr-feed-actions">
        {event.kind === 'Ronda' &&
          (photoUrl ? (
            <a className="ldr-feed-view" href={photoUrl} target="_blank" rel="noopener noreferrer">
              VER
            </a>
          ) : (
            <span className="ldr-feed-view is-empty">Sin foto</span>
          ))}
        {event.source && onOpenFormat && (
          <a
            className="ldr-feed-view ldr-feed-format"
            href="#formato"
            title="Abrir el formato diligenciado de este registro"
            onClick={(clickEvent) => {
              clickEvent.preventDefault()
              onOpenFormat(event)
            }}
          >
            FORMATO
          </a>
        )}
      </div>
    </div>
  )
}

function EvidenceCard({ item, getFileUrl, peopleName }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (item.url) {
      setUrl(item.url)
    } else if (item.file_path) {
      getFileUrl(item.file_path).then((u) => setUrl(u))
    } else {
      setUrl(null)
    }
  }, [item.file_path, item.url, getFileUrl])

  const uploader = peopleName?.[item.uploaded_by] || 'Operario'
  const dateStr = item.created_at
    ? new Date(item.created_at).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <div className="ldr-ev-card">
      <div className="ldr-ev-thumb">
        {item.file_type === 'image' && url ? (
          <img src={url} alt={item.file_name} className="ldr-ev-img" />
        ) : (
          <span className="ldr-ev-doc-icon">📄</span>
        )}
      </div>
      <div className="ldr-ev-info">
        <span className="ldr-ev-name" title={item.file_name}>
          {item.file_name}
        </span>
        <span className="ldr-ev-meta">
          {uploader} · {dateStr}
        </span>
        {item.note && <span className="ldr-ev-note">"{item.note}"</span>}
      </div>
      {evidenceHasRecordDocument(item) && (
        <a
          href="#formato"
          className="ldr-ev-link ldr-ev-format"
          title="Abrir el formato diligenciado"
          onClick={(event) => {
            event.preventDefault()
            openEvidenceFormat(item)
          }}
        >
          Formato
        </a>
      )}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="ldr-ev-link" title="Ver archivo original">
          ↗
        </a>
      )}
    </div>
  )
}

export default function LeaderDashboard({
  orgId,
  userId,
  role,
  developerMode = false,
  area,
  userName,
  orgName,
  onNavigate,
  presence,
  can,
  people = {},
}) {
  const [currentTime, setCurrentTime] = useState(nowTime)
  const [directory, setDirectory] = useState({})
  const currentShift = shiftOfHour(new Date().getHours())

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(nowTime()), 1000)
    return () => window.clearInterval(timer)
  }, [])

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
  const [sigEvidence, setSigEvidence] = useState([])
  const handleSigEvidenceLoaded = useCallback((items) => setSigEvidence(items), [])
  const dashboardEvidence = (sigEvidence.length > 0 ? sigEvidence : evidence).filter((item) => item.kind !== 'round')

  useEffect(() => {
    let active = true
    if (!orgId) return undefined
    supabase
      .from('organization_members')
      .select('user_id, profiles ( full_name, email )')
      .eq('org_id', orgId)
      .then(({ data }) => {
        if (!active) return
        const names = Object.fromEntries(
          (data || []).map((row) => [
            row.user_id,
            row.profiles?.full_name || row.profiles?.email || 'Operario registrado',
          ]),
        )
        setDirectory(names)
      })
    return () => {
      active = false
    }
  }, [orgId])

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
      out.push({
        kind: 'Ronda',
        personId: c.taken_by,
        when: c.taken_at,
        photoPath: c.photo_path,
        source: c,
        detail: `Ronda ${c.hour_slot || '—'} · Turno ${c.shift_number || '—'} · ${c.shift_date || 'sin fecha'}`,
        report: c.notes || 'Sin novedad reportada',
      })
    }
    for (const a of so.activities) {
      const when = a.completed_at || a.started_at || a.created_at
      out.push({
        kind: 'Actividad',
        personId: a.assigned_to,
        when,
        source: a,
        detail: a.title || a.description || 'Actividad de turno',
        report: a.result_note || a.completion || a.status || 'Reportada',
      })
    }
    // Un cargue programado para más adelante todavía no tiene registro que abrir.
    const happened = (value) => Boolean(value) && new Date(value).getTime() <= Date.now()
    for (const l of loads) {
      out.push({
        kind: 'Cargue',
        personId: l.created_by,
        when: l.loaded_at,
        detail: `Lote ${l.lote || '—'}${l.tape_color_name ? ` · Cinta ${l.tape_color_name}` : ''}`,
        source: happened(l.loaded_at) ? l : null,
      })
    }
    for (const t of transfers) {
      out.push({
        kind: 'Transferencia',
        personId: t.created_by,
        when: t.transferred_at,
        detail: `Lote ${t.lote || '—'}`,
        source: happened(t.transferred_at) ? t : null,
      })
    }
    for (const o of orders) {
      const when = o.completed_at || o.started_at || o.created_at
      out.push({
        kind: 'Mantenimiento',
        personId: o.assigned_to || o.created_by,
        when,
        source: o,
        detail: `${o.code || 'OT'} · ${o.title || 'Actividad de mantenimiento'}`,
        report: o.resolution || o.status || 'Registrada',
      })
    }
    return out
      .filter((e) => !!e.when)
      .sort((a, b) => b.when.localeCompare(a.when))
      .slice(0, 12)
  }, [mc.checks, so.activities, loads, transfers, orders])

  const peopleName = useMemo(() => {
    const map = { ...directory }
    for (const [id, p] of Object.entries(people)) map[id] = p.name || 'Operario'
    return map
  }, [directory, people])

  // Cada actividad del feed abre su formato diligenciado con lo que guarda la base:
  // ronda → FOMAT04, OT → FOMAT01, cargue / transferencia / actividad → registro operativo.
  const machinesById = useMemo(() => Object.fromEntries(machines.map((m) => [m.id, m])), [machines])
  const getCheckPhotoUrl = mc.getPhotoUrl
  const openFeedFormat = useCallback(
    async (ev) => {
      const row = ev.source || {}
      const photo = async (path) => (path ? getCheckPhotoUrl(path) : null)
      try {
        if (ev.kind === 'Ronda') {
          openEvidenceFormat(
            singleCheckRound({
              check: row,
              machine: machinesById[row.machine_id] || null,
              takenByName: peopleName[row.taken_by] || null,
              photoUrl: await photo(row.photo_path),
            }),
          )
        } else if (ev.kind === 'Actividad') {
          openEvidenceFormat(
            shiftActivityRecordItem({
              activity: row,
              machine: machinesById[row.machine_id] || null,
              people: peopleName,
              photoUrl: await photo(row.photo_path),
            }),
          )
        } else if (ev.kind === 'Cargue' || ev.kind === 'Transferencia') {
          const url = await photo(row.photo_path)
          const [record] = buildProductionEvidence({
            loads: ev.kind === 'Cargue' ? [row] : [],
            transfers: ev.kind === 'Transferencia' ? [row] : [],
            machines: machinesById,
            people: peopleName,
            photoUrls: new Map(url ? [[row.photo_path, url]] : []),
          })
          if (record) openEvidenceFormat(record)
        } else if (ev.kind === 'Mantenimiento') {
          const files = await Promise.all(
            evidence
              .filter((file) => file.work_order_id === row.id)
              .map(async (file) => ({
                ...file,
                url: await getFileUrl(file.file_path),
                uploadedByName: peopleName[file.uploaded_by] || null,
              })),
          )
          openEvidenceFormat(
            workOrderRecordItem({
              order: row,
              files,
              machine: machinesById[row.machine_id] || null,
              createdBy: peopleName[row.created_by] || null,
              assignedTo: peopleName[row.assigned_to] || null,
            }),
          )
        }
      } catch (error) {
        console.warn('Tablero del líder: no se pudo abrir el formato del registro.', error)
      }
    },
    [getCheckPhotoUrl, machinesById, peopleName, evidence, getFileUrl],
  )

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = userName ? userName.split(' ')[0] : 'Líder'

  return (
    <div className="leader-dash">
      <header className="ldr-header">
        <div className="ldr-header-left">
          <h1 className="ldr-greeting">
            {greeting}, <span className="ldr-name">{firstName}</span>
          </h1>
          <p className="ldr-subtitle">
            {orgName || 'Planta'} · Turno {currentShift} ·{' '}
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

      <Suspense fallback={null}>
        <LeaderAreaHome
          orgId={orgId}
          userId={userId}
          role={role}
          area={area}
          userName={userName}
          onNavigate={onNavigate}
          peopleName={peopleName}
        />
      </Suspense>

      <section className="ldr-kpi-grid" aria-label="Indicadores de planta">
        <KpiCard
          label="Operativas"
          value={summary.normal}
          icon="✅"
          color={CONDITION_COLOR.normal}
          sub={`de ${totalMachines} máquinas`}
        />
        <KpiCard label="En alerta" value={summary.warning} icon="!" color={CONDITION_COLOR.warning} />
        <KpiCard label="Con falla" value={summary.fault} icon="🔴" color={CONDITION_COLOR.fault} />
        <KpiCard label="OTs Activas" value={activeOrdersCount} icon="🔧" color="#38bdf8" sub="Mantenimiento SIG" />
        <KpiCard
          label="Evidencias SIG"
          value={dashboardEvidence.length}
          icon="SIG"
          color="#a78bfa"
          sub="Registros vinculados"
        />
        <KpiCard label="Personal online" value={onlineCount} icon="👥" color="var(--accent)" sub="en plataforma" />
      </section>

      {quickItems.length > 0 && (
        <section className="ldr-quick-section" aria-label="Acceso rápido">
          <h2 className="ldr-section-title">
            <span aria-hidden="true">⚡</span> Acceso Rápido
          </h2>
          <div className="ldr-quick-grid">
            {quickItems.map((item) => (
              <QuickCard key={item.id} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      )}

      {/* Evidencias SIG Mantenimiento y Producción */}
      <section className="ldr-evidence-section" aria-label="Evidencias SIG Mantenimiento y Producción">
        <h2 className="ldr-section-title">
          <span aria-hidden="true">📸</span> Evidencias Registradas (SIG Mantenimiento & Producción)
          <span className="ldr-section-sub">{dashboardEvidence.length} registros vinculados</span>
        </h2>
        {dashboardEvidence.length === 0 ? (
          <p className="ldr-feed-empty">
            No hay evidencias ni adjuntos de mantenimiento/producción en esta organización aún.
          </p>
        ) : (
          <div className="ldr-ev-grid">
            {dashboardEvidence.slice(0, 8).map((item) => (
              <EvidenceCard key={item.id} item={item} getFileUrl={getFileUrl} peopleName={peopleName} />
            ))}
          </div>
        )}
      </section>

      <div className={`ldr-main-split${developerMode ? '' : ' ldr-main-split-3d'}`}>
        {developerMode ? (
          <section className="ldr-map-section" aria-label="Plano de planta en vivo">
            <h2 className="ldr-section-title">
              <span aria-hidden="true">Plano</span> Plano en vivo
              {selectedPlant && <span className="ldr-section-sub">{selectedPlant.name}</span>}
            </h2>
            <div className="ldr-map-frame">
              {roomsApi.loading ? (
                <div className="ldr-map-placeholder">Cargando plano…</div>
              ) : roomsApi.rooms.length === 0 ? (
                <div className="ldr-map-placeholder">Planta sin plano dibujado aún.</div>
              ) : (
                <FloorMap
                  canManage={false}
                  canExpand={false}
                  roomsApi={roomsApi}
                  machines={machines}
                  updateMachine={() => {}}
                  moveRoom={roomsApi.moveRoom}
                  selectedMachineId={null}
                  onSelectMachine={() => {}}
                  livePeople={[]}
                  conditionByMachine={conditionByMachine}
                  highlightRoomIds={null}
                />
              )}
            </div>
          </section>
        ) : puede3D ? (
          <section className="ldr-map-section ldr-map-section-3d" aria-label="Planta 3D en vivo">
            <h2 className="ldr-section-title">
              <span aria-hidden="true">3D</span> Planta 3D en vivo
              {selectedPlant && <span className="ldr-section-sub">{selectedPlant.name}</span>}
            </h2>
            <div className="ldr-map-frame ldr-map-frame-3d">
              <iframe className="ldr-tour-3d" src={PLANT_3D_TOUR_URL} title="Planta 3D en vivo" allow="fullscreen" />
            </div>
          </section>
        ) : null}

        <section className="ldr-feed-section" aria-label="Actividad reciente">
          <h2 className="ldr-section-title">
            <span aria-hidden="true">📋</span> Actividad del turno
          </h2>
          <div className="ldr-feed">
            {recentEvents.length === 0 ? (
              <p className="ldr-feed-empty">Sin actividad registrada en este turno aún.</p>
            ) : (
              recentEvents.map((ev, i) => (
                <FeedItem
                  key={i}
                  event={ev}
                  peopleName={peopleName}
                  getPhotoUrl={mc.getPhotoUrl}
                  onOpenFormat={openFeedFormat}
                />
              ))
            )}
          </div>
        </section>
      </div>

      <section className="ldr-assets-section" aria-label="Gestión de Activos SIG">
        <h2 className="ldr-section-title">
          <span aria-hidden="true">🛠️</span> Centro de Activos y Dossiers SIG
        </h2>
        <div className="ldr-assets-frame">
          <Suspense fallback={<p className="ldr-feed-empty">Cargando Centro de Activos…</p>}>
            <MachineAssetHub orgId={orgId} onEvidenceLoaded={handleSigEvidenceLoaded} />
          </Suspense>
        </div>
      </section>
      <footer className="ldr-actions">
        {puede3D && (
          <a className="ldr-action-btn ldr-ghost" href={PLANT_3D_TOUR_URL} target="_blank" rel="noopener noreferrer">
            3D aparte
          </a>
        )}
      </footer>
    </div>
  )
}
