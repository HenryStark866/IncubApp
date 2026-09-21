/**
 * =============================================================================
 * ARCHIVO: src/components/CoordinatorDashboard.jsx
 * PROPÃ“SITO: Componente UI Â«CoordinatorDashboardÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useMachineChecks, currentSlot } from '../features/maintenance/hooks/useMachineChecks'
import { useWorkOrders } from '../hooks/useWorkOrders'
import { useBatches } from '../features/production/hooks/useBatches'
import CoordEngineeringBoard from './CoordEngineeringBoard'
import { conditionOf } from '../lib/machineCondition'

/**
 * Panel del coordinador â€” tablero personalizado segÃºn el ÃREA de trabajo.
 * Un mismo rol `coordinator` puede tener distintas Ã¡reas (planta, granja,
 * mantenimiento, calidad, RR. HH.); cada una renderiza su propio dashboard.
 * PLANTA usa el board IE completo; calidad/general usan panel de accesos rÃ¡pidos.
 * Ãreas corporativas se redirigen a su pestaÃ±a de mÃ³dulo.
 */

const AREA_LABEL = {
  plant: 'CoordinaciÃ³n de planta',
  farm: 'CoordinaciÃ³n de granja (veterinario)',
  maintenance: 'CoordinaciÃ³n de mantenimiento',
  quality: 'CoordinaciÃ³n de calidad y producciÃ³n',
  hr: 'CoordinaciÃ³n de recursos humanos',
  management: 'Gerencia',
  accounting: 'CoordinaciÃ³n de contabilidad',
  sales: 'CoordinaciÃ³n de ventas',
  logistics: 'CoordinaciÃ³n de logÃ­stica',
  sales_logistics: 'CoordinaciÃ³n ventas/logÃ­stica (legacy)',
  sst: 'CoordinaciÃ³n SST (seguridad y salud)',
  environmental: 'CoordinaciÃ³n de gestiÃ³n ambiental',
  veterinary: 'CoordinaciÃ³n de sanidad veterinaria',
  hse: 'CoordinaciÃ³n SST (legacy)',
  general: 'Panel de coordinaciÃ³n',
}

// Ãreas corporativas: el App las abre en DepartmentModule; aquÃ­ redirigimos si llegan al Panel
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

const SHIFT_LABEL = { 1: 'T1 (06â€“14)', 2: 'T2 (14â€“22)', 3: 'T3 (22â€“06)' }
const PRIORITY_LABEL = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'CrÃ­tica' }
const STATUS_LABEL = { open: 'Abierta', in_progress: 'En ejecuciÃ³n', completed: 'Completada', cancelled: 'Cancelada' }

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : 'â€”'
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''

/* â•â• Router por Ã¡rea â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function CoordinatorDashboard({ orgId, userId, area, coordinatorName, onNavigate }) {
  // MÃ³dulos corporativos tienen pestaÃ±a propia; si el usuario cae aquÃ­, lo guiamos
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
          <h2>{AREA_LABEL[area] ?? 'CoordinaciÃ³n'}</h2>
        </div>
        <p className="hint">
          Tu mÃ³dulo de Ã¡rea estÃ¡ disponible en la pestaÃ±a dedicada de la barra superior.
        </p>
        <div className="actions row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <button className="primary" onClick={() => onNavigate?.(tabByArea[area])}>
            Ir a {AREA_LABEL[area]}
          </button>
          {area === 'maintenance' && (
            <button className="chip ghost" onClick={() => onNavigate?.('mantenimiento')}>
              Ã“rdenes de trabajo
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

/* â•â• Dashboard: Coordinador de PLANTA (todas las sedes) â•â•â•â•â•â• */
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

  // Ãšltima condiciÃ³n conocida de cada mÃ¡quina (mc.checks viene desc por taken_at)
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

  // MÃ¡quinas con novedad (falla primero, luego alerta) para actuar
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
  const nameOf = (id) => people[id]?.name ?? 'â€”'
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

/* â•â• Dashboard: Coordinador de GRANJA (ciclo de aves) â•â•â•â•â•â•â• */
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
          <h2>Panel de coordinaciÃ³n de granja</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola{firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} Â· levantes y
            producciÃ³n (post-grading)
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
        <div className="kpi-card"><span className="kpi-value">{counts.production}</span><span className="kpi-label">En producciÃ³n</span></div>
        <div className="kpi-card"><span className="kpi-value">{bt.batches.length}</span><span className="kpi-label">Lotes totales</span></div>
      </div>

      {bt.error && <p className="msg error">{bt.error}</p>}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Lotes por aprobar {pending.length > 0 ? `(${pending.length})` : ''}
      </h3>
      {pending.length === 0 ? (
        <p className="hint">No hay lotes pendientes de aprobaciÃ³n. âœ…</p>
      ) : (
        <div className="admin-list">
          {pending.map((b) => (
            <div key={b.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>ðŸ”</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{b.code} Â· {farmName(b.farm_id)}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  {(b.hens_received ?? 0).toLocaleString('es-CO')} gallinas Â· {(b.roosters_received ?? 0).toLocaleString('es-CO')} gallos
                  {b.arrival_date ? ` Â· Llegada ${new Date(b.arrival_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}` : ''}
                </span>
              </div>
              <button className="primary small" onClick={() => onNavigate?.('produccion')}>Revisar</button>
            </div>
          ))}
        </div>
      )}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Accesos rÃ¡pidos</h3>
      <div className="actions row" style={{ flexWrap: 'wrap' }}>
        <button className="chip ghost" onClick={() => onNavigate?.('produccion')}>
          Levantes / lotes
        </button>
        <button className="chip ghost" onClick={() => onNavigate?.('granjas')}>ðŸ—ºï¸ Planos de granjas</button>
        <button className="chip ghost" onClick={() => onNavigate?.('supervision')}>ðŸ‘ï¸ SupervisiÃ³n</button>
      </div>
    </div>
  )
}

/* â•â• Panel genÃ©rico de coordinaciÃ³n (calidad / general / otras) â•â•â•â•â•â•â•â•â•â•â•â•â• */
function AreaPlaceholder({ area, name, onNavigate }) {
  const first = firstName(name)
  const links = [
    { tab: 'supervision', label: 'SupervisiÃ³n', hint: 'Actividades y seguimiento del turno' },
    { tab: 'mantenimiento', label: 'Ã“rdenes de trabajo', hint: 'OT abiertas y crÃ­ticas' },
    { tab: 'reportes', label: 'Reportes / documentos', hint: 'Enviar informes a gerencia o mÃ³dulos' },
    { tab: 'asistencia', label: 'Asistencia', hint: 'Ingreso y salida con foto' },
    { tab: 'plantas', label: 'Plantas y planos', hint: 'Layout y mÃ¡quinas' },
    { tab: 'granjas', label: 'Granjas', hint: 'Sedes de campo' },
    { tab: 'iot', label: 'IoT y bioseguridad', hint: 'Checklists por sede' },
    { tab: 'accesos', label: 'Accesos', hint: 'Permisos temporales entre mÃ³dulos' },
  ]
  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>{AREA_LABEL[area] ?? 'Panel de coordinaciÃ³n'}</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Hola{first ? `, ${first}` : ''}. Centro de control de tu Ã¡rea con accesos a los mÃ³dulos
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
          <span className="exec-kpi-label">Ãrea</span>
        </div>
        <div className="exec-kpi ok">
          <span className="exec-kpi-value">â—</span>
          <span className="exec-kpi-label">SesiÃ³n activa</span>
        </div>
      </div>
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Accesos rÃ¡pidos
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

