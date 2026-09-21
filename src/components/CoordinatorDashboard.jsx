/**
 * =============================================================================
 * ARCHIVO: src/components/CoordinatorDashboard.jsx
 * PROPÓSITO: Componente UI «CoordinatorDashboard»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
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
import { useBatches } from '../hooks/useBatches'
import CoordEngineeringBoard from './CoordEngineeringBoard'
import { conditionOf } from '../lib/machineCondition'

/**
 * Panel del coordinador — tablero personalizado según el ÁREA de trabajo.
 * Un mismo rol `coordinator` puede tener distintas áreas (planta, granja,
 * mantenimiento, calidad, RR. HH.); cada una renderiza su propio dashboard.
 * PLANTA usa el board IE completo; calidad/general usan panel de accesos rápidos.
 * Áreas corporativas se redirigen a su pestaña de módulo.
 */

const AREA_LABEL = {
  plant: 'Coordinación de planta',
  farm: 'Coordinación de granja (veterinario)',
  maintenance: 'Coordinación de mantenimiento',
  quality: 'Coordinación de calidad y producción',
  hr: 'Coordinación de recursos humanos',
  management: 'Gerencia',
  accounting: 'Coordinación de contabilidad',
  sales: 'Coordinación de ventas',
  logistics: 'Coordinación de logística',
  sales_logistics: 'Coordinación ventas/logística (legacy)',
  sst: 'Coordinación SST (seguridad y salud)',
  environmental: 'Coordinación de gestión ambiental',
  veterinary: 'Coordinación de sanidad veterinaria',
  hse: 'Coordinación SST (legacy)',
  general: 'Panel de coordinación',
}

// Áreas corporativas: el App las abre en DepartmentModule; aquí redirigimos si llegan al Panel
const CORPORATE_AREAS = new Set([
  'management',
  'hr',
  'accounting',
  'sales',
  'logistics',
  'sales_logistics',
  'maintenance',
  'sst',
  'environmental',
  'hse',
  'veterinary',
  'farm',
])

const SHIFT_LABEL = { 1: 'T1 (06–14)', 2: 'T2 (14–22)', 3: 'T3 (22–06)' }
const PRIORITY_LABEL = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' }
const STATUS_LABEL = { open: 'Abierta', in_progress: 'En ejecución', completed: 'Completada', cancelled: 'Cancelada' }

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''

/* ══ Router por área ═════════════════════════════════════════ */
export default function CoordinatorDashboard({ orgId, userId, area, coordinatorName, onNavigate }) {
  // Módulos corporativos tienen pestaña propia; si el usuario cae aquí, lo guiamos
  if (CORPORATE_AREAS.has(area)) {
    const tabByArea = {
      management: 'gerencia',
      hr: 'rrhh',
      accounting: 'contabilidad',
      sales: 'ventas',
      logistics: 'logistica',
      sales_logistics: 'ventas',
      maintenance: 'coord_mantenimiento',
      sst: 'sst',
      hse: 'sst',
      environmental: 'ambiental',
      veterinary: 'veterinaria',
      farm: 'veterinaria',
    }
    return (
      <div className="card wide">
        <div className="card-head">
          <h2>{AREA_LABEL[area] ?? 'Coordinación'}</h2>
        </div>
        <p className="hint">
          Tu módulo de área está disponible en la pestaña dedicada de la barra superior.
        </p>
        <div className="actions row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <button className="primary" onClick={() => onNavigate?.(tabByArea[area])}>
            Ir a {AREA_LABEL[area]}
          </button>
          {area === 'maintenance' && (
            <button className="chip ghost" onClick={() => onNavigate?.('mantenimiento')}>
              Órdenes de trabajo
            </button>
          )}
        </div>
      </div>
    )
  }
  if (area === 'plant') {
    return (
      <PlantCoordinatorDashboard
        orgId={orgId}
        userId={userId}
        coordinatorName={coordinatorName}
        onNavigate={onNavigate}
      />
    )
  }
  if (area === 'farm') {
    return (
      <FarmCoordinatorDashboard
        orgId={orgId}
        userId={userId}
        coordinatorName={coordinatorName}
        onNavigate={onNavigate}
      />
    )
  }
  return <AreaPlaceholder area={area} name={coordinatorName} onNavigate={onNavigate} />
}

/* ══ Dashboard: Coordinador de PLANTA (todas las sedes) ══════ */
function PlantCoordinatorDashboard({ orgId, userId, coordinatorName, onNavigate }) {
  const mc = useMachineChecks(orgId, userId, { canSupervise: true })
  const wo = useWorkOrders(orgId, userId)

  const [plants, setPlants] = useState([])
  const [rooms, setRooms] = useState([])
  const [machines, setMachines] = useState([])
  const [people, setPeople] = useState({})
  const [plantId, setPlantId] = useState(null)

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

  const { hour, shift, shiftDate } = currentSlot()
  const plant = plants.find((p) => p.id === plantId) ?? null

  const plantMachines = useMemo(
    () => machines.filter((m) => m.plant_id === plantId && m.status !== 'decommissioned'),
    [machines, plantId]
  )

  // Última condición conocida de cada máquina (mc.checks viene desc por taken_at)
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

  const summary = useMemo(() => {
    const s = { normal: 0, warning: 0, fault: 0, off: 0, none: 0 }
    for (const m of plantMachines) {
      const c = latestByMachine.get(m.id)
      if (!c) s.none += 1
      else s[c.condition] = (s[c.condition] ?? 0) + 1
    }
    return s
  }, [plantMachines, latestByMachine])

  // Máquinas con novedad (falla primero, luego alerta) para actuar
  const alertMachines = useMemo(() => {
    const rank = { fault: 0, warning: 1 }
    return plantMachines
      .map((m) => ({ machine: m, check: latestByMachine.get(m.id) }))
      .filter((x) => x.check && (x.check.condition === 'fault' || x.check.condition === 'warning'))
      .sort((a, b) => rank[a.check.condition] - rank[b.check.condition])
  }, [plantMachines, latestByMachine])

  // OT de la sede seleccionada
  const plantOrders = useMemo(() => wo.orders.filter((o) => o.plant_id === plantId), [wo.orders, plantId])
  const otOpen = plantOrders.filter((o) => o.status === 'open').length
  const otProgress = plantOrders.filter((o) => o.status === 'in_progress').length
  const otCritical = plantOrders.filter((o) => o.priority === 'critical' && (o.status === 'open' || o.status === 'in_progress')).length
  const otUnassigned = plantOrders.filter((o) => o.status === 'open' && !o.assigned_to).length
  const recentOrders = plantOrders.slice(0, 5)

  const roomName = (id) => rooms.find((r) => r.id === id)?.name ?? null
  const machineName = (id) => machines.find((m) => m.id === id)?.name ?? 'Instalaciones'
  const nameOf = (id) => people[id]?.name ?? '—'
  const op = activeOperatorId ? people[activeOperatorId] : null
  const novedades = summary.warning + summary.fault

  return (
    <CoordEngineeringBoard
      orgId={orgId}
      coordinatorName={coordinatorName}
      plant={plant}
      plants={plants}
      plantId={plantId}
      onPlantChange={setPlantId}
      hour={hour}
      shift={shift}
      shiftLabel={SHIFT_LABEL[shift]}
      lastTakeAt={lastTakeAt}
      op={op}
      pct={pct}
      doneRound={doneRound}
      totalRound={totalRound}
      summary={summary}
      novedades={novedades}
      otOpen={otOpen}
      otProgress={otProgress}
      otCritical={otCritical}
      otUnassigned={otUnassigned}
      alertMachines={alertMachines}
      recentOrders={recentOrders}
      plantOrders={plantOrders}
      roomName={roomName}
      machineName={machineName}
      nameOf={nameOf}
      conditionOf={conditionOf}
      fmtTime={fmtTime}
      PRIORITY_LABEL={PRIORITY_LABEL}
      STATUS_LABEL={STATUS_LABEL}
      onNavigate={onNavigate}
      error={mc.error || wo.error}
    />
  )
}

/* ══ Dashboard: Coordinador de GRANJA (ciclo de aves) ═══════ */
function FarmCoordinatorDashboard({ orgId, userId, coordinatorName, onNavigate }) {
  const bt = useBatches(orgId, userId)
  const [farms, setFarms] = useState([])

  useEffect(() => {
    if (!orgId) return
    supabase.from('plants').select('id, name, code').eq('org_id', orgId).then(({ data }) => {
      setFarms((data ?? []).filter((x) => x.code?.startsWith('G') || x.name?.startsWith('G-')))
    })
  }, [orgId])

  const farmName = (id) => farms.find((f) => f.id === id)?.name ?? 'Granja'
  const counts = useMemo(() => {
    const c = { received: 0, levante: 0, production: 0, closed: 0 }
    for (const b of bt.batches) c[b.status] = (c[b.status] ?? 0) + 1
    return c
  }, [bt.batches])
  const pending = bt.batches.filter((b) => b.status === 'received')

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>Panel de coordinación de granja</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola{firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} · levantes y
            producción (post-grading)
          </span>
        </div>
        {counts.received > 0 && <span className="pill status warn">{counts.received} por aprobar</span>}
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className={`kpi-card${counts.received > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{counts.received}</span>
          <span className="kpi-label">Lotes por aprobar</span>
        </div>
        <div className="kpi-card"><span className="kpi-value">{counts.levante}</span><span className="kpi-label">Lotes en levante</span></div>
        <div className="kpi-card"><span className="kpi-value">{counts.production}</span><span className="kpi-label">En producción</span></div>
        <div className="kpi-card"><span className="kpi-value">{bt.batches.length}</span><span className="kpi-label">Lotes totales</span></div>
      </div>

      {bt.error && <p className="msg error">{bt.error}</p>}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Lotes por aprobar {pending.length > 0 ? `(${pending.length})` : ''}
      </h3>
      {pending.length === 0 ? (
        <p className="hint">No hay lotes pendientes de aprobación. ✅</p>
      ) : (
        <div className="admin-list">
          {pending.map((b) => (
            <div key={b.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>🐔</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{b.code} · {farmName(b.farm_id)}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  {(b.hens_received ?? 0).toLocaleString('es-CO')} gallinas · {(b.roosters_received ?? 0).toLocaleString('es-CO')} gallos
                  {b.arrival_date ? ` · Llegada ${new Date(b.arrival_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}` : ''}
                </span>
              </div>
              <button className="primary small" onClick={() => onNavigate?.('produccion')}>Revisar</button>
            </div>
          ))}
        </div>
      )}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Accesos rápidos</h3>
      <div className="actions row" style={{ flexWrap: 'wrap' }}>
        <button className="chip ghost" onClick={() => onNavigate?.('produccion')}>
          Levantes / lotes
        </button>
        <button className="chip ghost" onClick={() => onNavigate?.('granjas')}>🗺️ Planos de granjas</button>
        <button className="chip ghost" onClick={() => onNavigate?.('supervision')}>👁️ Supervisión</button>
      </div>
    </div>
  )
}

/* ══ Panel genérico de coordinación (calidad / general / otras) ═════════════ */
function AreaPlaceholder({ area, name, onNavigate }) {
  const first = firstName(name)
  const links = [
    { tab: 'supervision', label: 'Supervisión', hint: 'Actividades y seguimiento del turno' },
    { tab: 'mantenimiento', label: 'Órdenes de trabajo', hint: 'OT abiertas y críticas' },
    { tab: 'reportes', label: 'Reportes / documentos', hint: 'Enviar informes a gerencia o módulos' },
    { tab: 'asistencia', label: 'Asistencia', hint: 'Ingreso y salida con foto' },
    { tab: 'plantas', label: 'Plantas y planos', hint: 'Layout y máquinas' },
    { tab: 'granjas', label: 'Granjas', hint: 'Sedes de campo' },
    { tab: 'iot', label: 'IoT y bioseguridad', hint: 'Checklists por sede' },
    { tab: 'accesos', label: 'Accesos', hint: 'Permisos temporales entre módulos' },
  ]
  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>{AREA_LABEL[area] ?? 'Panel de coordinación'}</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Hola{first ? `, ${first}` : ''}. Centro de control de tu área con accesos a los módulos
            operativos.
          </p>
        </div>
        <span className="pill role">{AREA_LABEL[area] ?? area}</span>
      </div>
      <div className="exec-kpi-grid" style={{ marginTop: 14 }}>
        <div className="exec-kpi">
          <span className="exec-kpi-value" style={{ fontSize: 16 }}>
            {AREA_LABEL[area]?.split(' ')[0] || 'Coord'}
          </span>
          <span className="exec-kpi-label">Área</span>
        </div>
        <div className="exec-kpi ok">
          <span className="exec-kpi-value">●</span>
          <span className="exec-kpi-label">Sesión activa</span>
        </div>
      </div>
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Accesos rápidos
      </h3>
      <div className="admin-list">
        {links.map((l) => (
          <button
            key={l.tab}
            type="button"
            className="admin-row"
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => onNavigate?.(l.tab)}
          >
            <div className="admin-row-main">
              <strong>{l.label}</strong>
              <span className="hint" style={{ margin: 0 }}>
                {l.hint}
              </span>
            </div>
            <span className="pill">Abrir</span>
          </button>
        ))}
      </div>
    </div>
  )
}
