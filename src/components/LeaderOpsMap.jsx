/**
 * =============================================================================
 * ARCHIVO: src/components/LeaderOpsMap.jsx
 * PROPÓSITO: Home del líder de área — UN solo panel: el plano de la planta a
 *   pantalla completa como simulación en tiempo real (salas + máquinas con su
 *   condición real + personal en vivo por GPS). Todo lo demás vive ENCIMA del
 *   mapa como iconos flotantes semi-transparentes para no robarle espacio:
 *   un dock de herramientas (navegación a cada módulo de datos) a la derecha
 *   y un dock de filtros (persona/actividad/sector/fecha/turno) a la
 *   izquierda, cada uno desplegable con un clic. No hay lista de resultados
 *   ni menú aparte: filtrar cambia directamente lo que se ve en el mapa
 *   (qué sala se resalta, qué condición de máquina se muestra).
 * CÓMO FUNCIONA: reutiliza el FloorMap de solo lectura (canManage=false) con
 *   la misma proyección GPS→plano que ya usa PlantManager (geoMap.js), y el
 *   mismo menú de módulos del cliente (clientMenuTemplate) filtrado para
 *   excluir herramientas de turnos/supervisión/operarios: el líder solo
 *   NECESITA ver datos (producción, rendimiento, estado real), no ejecutar
 *   esas tareas.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePlants } from '../hooks/usePlants'
import { useRooms } from '../hooks/useRooms'
import { useMachines } from '../hooks/useMachines'
import { useMachineChecks, shiftOfHour } from '../hooks/useMachineChecks'
import { useShiftOps } from '../hooks/useShiftOps'
import { useLoads } from '../hooks/useLoads'
import { useShiftSchedule } from '../hooks/useShiftSchedule'
import { readPlantGeo, projectPeopleOnPlan } from '../lib/geoMap'
import { buildClientNavItems } from '../lib/clientMenuTemplate'
import FloorMap from './FloorMap'
import { exportOperationReport, SHIFT_LABEL } from '../lib/operationReport'
import { conditionOf } from '../lib/machineCondition'
import { canSeePlant3DTour, PLANT_3D_TOUR_URL } from '../lib/roles'

/**
 * Tabs que son HERRAMIENTAS PARA HACER (turnos, rondas, OT, calibración,
 * asistencia, misionales): el líder de área de este panel solo necesita ver
 * datos, no ejecutar esas tareas. Editar esta lista ajusta qué iconos flotan.
 */
const EXCLUDED_TOOL_TABS = new Set([
  'horarios',
  'supervision',
  'mantenimiento',
  'calibracion',
  'asistencia',
  'misionales',
  'preoperacional',
  'hoy',
])

const TAB_ICON = {
  informes: '📈',
  'datos-op': '📊',
  huevos: '🥚',
  recepcion: '📥',
  cargue: '🚛',
  cumplimiento: '🏆',
  iot: '🛰️',
  historial: '🕓',
  monitoreo: '🧭',
  gerencia: '🏢',
  panel: '🗂️',
  rrhh: '🧑‍🤝‍🧑',
  contabilidad: '💰',
  ventas: '💵',
  logistica: '🚚',
  veterinaria: '🩺',
  sst: '🦺',
  ambiental: '🌿',
  inventarios: '📦',
  plantas: '🏭',
  granjas: '🌾',
  produccion: '🐣',
  admin: '⚙️',
  reportes: '💬',
  accesos: '🔑',
}
const iconFor = (id) => TAB_ICON[id] || '📁'

const FILTER_DEFS = [
  { key: 'personId', icon: '👤', label: 'Persona' },
  { key: 'kind', icon: '🏷️', label: 'Actividad' },
  { key: 'roomId', icon: '🏭', label: 'Sector' },
  { key: 'date', icon: '📅', label: 'Fecha' },
  { key: 'shift', icon: '🔁', label: 'Turno' },
]
const ACTIVITY_KINDS = ['Ronda', 'Actividad', 'Cargue', 'Transferencia']

/* ── Icono de filtro desplegable: botón discreto que abre un popover con el control real ── */
function FilterIcon({ def, active, value, onChange, options, open, onToggle }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onToggle(null)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open, onToggle])

  return (
    <div className="lom-filter-icon-wrap" ref={ref}>
      <button
        type="button"
        className={`lom-filter-icon${active ? ' active' : ''}${open ? ' open' : ''}`}
        title={def.label}
        onClick={() => onToggle(open ? null : def.key)}
      >
        <span aria-hidden="true">{def.icon}</span>
        {active && <span className="lom-filter-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="lom-filter-popover">
          <span className="lom-filter-popover-title">{def.label}</span>
          {def.key === 'date' ? (
            <input type="date" value={value} onChange={(e) => onChange(e.target.value)} autoFocus />
          ) : (
            <select value={value} onChange={(e) => onChange(e.target.value)} autoFocus>
              <option value="">Todo{def.key === 'kind' ? 'a' : ''}</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

export default function LeaderOpsMap({
  orgId,
  userId,
  role,
  area,
  userName,
  orgName,
  onNavigate,
  presence,
  can,
}) {
  const { plants } = usePlants(orgId)
  const [plantId, setPlantId] = useState(null)
  useEffect(() => {
    if (!plantId && plants.length > 0) setPlantId(plants[0].id)
  }, [plants, plantId])
  const selectedPlant = plants.find((p) => p.id === plantId) ?? null

  const roomsApi = useRooms(plantId, orgId)
  const machinesApi = useMachines(plantId)
  const machines = machinesApi.machines
  const mc = useMachineChecks(orgId, userId, { canSupervise: false })
  const so = useShiftOps(orgId, userId)
  const { loads, transfers } = useLoads(orgId, userId)
  const { assignments } = useShiftSchedule(orgId, userId)
  const [exporting, setExporting] = useState(false)
  const [openFilter, setOpenFilter] = useState(null)

  const [people, setPeople] = useState({})
  useEffect(() => {
    if (!orgId) return
    supabase
      .from('organization_members')
      .select('user_id, role, profiles ( id, full_name, email, avatar_url )')
      .eq('org_id', orgId)
      .then(({ data }) => {
        const map = {}
        for (const row of data ?? []) {
          const pr = row.profiles || {}
          map[row.user_id] = { name: pr.full_name || pr.email || 'Operario', role: row.role }
        }
        setPeople(map)
      })
  }, [orgId])

  const machineName = useMemo(() => {
    const map = {}
    for (const m of machines) map[m.id] = `${m.name}${m.code ? ` (${m.code})` : ''}`
    return map
  }, [machines])

  const machineRoomId = useMemo(() => {
    const map = {}
    for (const m of machines) if (m.room_id) map[m.id] = m.room_id
    return map
  }, [machines])

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

  /* ── Simulación en tiempo real: personal proyectado del GPS al plano ── */
  const plantGeo = useMemo(() => (selectedPlant ? readPlantGeo(selectedPlant) : null), [selectedPlant])
  const livePeopleAll = useMemo(
    () =>
      projectPeopleOnPlan({
        peers: presence?.peers || [],
        geo: plantGeo,
        rooms: roomsApi.rooms,
        currentUserId: userId,
        padMeters: 15,
      }),
    [presence?.peers, plantGeo, roomsApi.rooms, userId]
  )

  /* ── Herramientas flotantes: su menú normal, sin las de turno/supervisión/operario ── */
  const tools = useMemo(() => {
    if (!can) return []
    return buildClientNavItems({ can, role }).filter((i) => !EXCLUDED_TOOL_TABS.has(i.id))
  }, [can, role])

  const handleExport = useCallback(async () => {
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
  }, [assignments, mc.checks, loads, transfers, so.activities, people, machineName])

  /* ── Eventos unificados: alimentan el efecto visual de los filtros sobre el mapa ── */
  const events = useMemo(() => {
    const out = []
    for (const c of mc.checks) {
      out.push({
        kind: 'Ronda',
        personId: c.taken_by,
        machineId: c.machine_id,
        conditionRaw: c.condition,
        roomId: machineRoomId[c.machine_id] || null,
        date: (c.taken_at || '').slice(0, 10),
        shift: c.shift_number,
        when: c.taken_at,
      })
    }
    for (const a of so.activities) {
      const when = a.completed_at || a.started_at || a.created_at
      out.push({
        kind: 'Actividad',
        personId: a.assigned_to,
        machineId: null,
        roomId: a.room_id || null,
        date: (when || '').slice(0, 10),
        shift: when ? shiftOfHour(new Date(when).getHours()) : null,
        when,
      })
    }
    for (const l of loads) {
      out.push({
        kind: 'Cargue',
        personId: l.created_by,
        machineId: l.machine_id || null,
        roomId: machineRoomId[l.machine_id] || null,
        date: (l.loaded_at || '').slice(0, 10),
        shift: l.loaded_at ? shiftOfHour(new Date(l.loaded_at).getHours()) : null,
        when: l.loaded_at,
      })
    }
    for (const t of transfers) {
      out.push({
        kind: 'Transferencia',
        personId: t.created_by,
        machineId: null,
        roomId: t.room_ids?.[0] || null,
        date: (t.transferred_at || '').slice(0, 10),
        shift: t.transferred_at ? shiftOfHour(new Date(t.transferred_at).getHours()) : null,
        when: t.transferred_at,
      })
    }
    return out.sort((a, b) => (b.when || '').localeCompare(a.when || ''))
  }, [mc.checks, so.activities, loads, transfers, machineRoomId])

  const [filters, setFilters] = useState({ personId: '', kind: '', roomId: '', date: '', shift: '' })
  const setFilterValue = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  const hasFilters = !!(filters.personId || filters.kind || filters.roomId || filters.date || filters.shift)
  const clearFilters = () => {
    setFilters({ personId: '', kind: '', roomId: '', date: '', shift: '' })
    setOpenFilter(null)
  }
  // ¿Hay algo, aparte del sector, que deba recalcular la condición mostrada?
  const dataFiltersActive = !!(filters.personId || filters.kind || filters.date || filters.shift)

  const filteredEvents = useMemo(
    () =>
      events.filter((e) => {
        if (filters.personId && e.personId !== filters.personId) return false
        if (filters.kind && e.kind !== filters.kind) return false
        if (filters.date && e.date !== filters.date) return false
        if (filters.shift && String(e.shift) !== String(filters.shift)) return false
        return true
      }),
    [events, filters]
  )

  const livePeople = useMemo(() => {
    if (!filters.personId) return livePeopleAll
    return livePeopleAll.filter((p) => p.userId === filters.personId)
  }, [livePeopleAll, filters.personId])

  /* Sectores/máquinas a resaltar en el plano según los filtros activos */
  const highlightRoomIds = useMemo(() => {
    if (filters.roomId) return new Set([filters.roomId])
    if (!dataFiltersActive) return null
    const set = new Set()
    for (const e of filteredEvents) if (e.roomId) set.add(e.roomId)
    return set.size ? set : null
  }, [filters.roomId, dataFiltersActive, filteredEvents])

  /* Condición de máquina mostrada: última en general, o la que corresponda al filtro (persona/tipo/fecha/turno) */
  const effectiveConditionByMachine = useMemo(() => {
    if (!dataFiltersActive) return conditionByMachine
    const map = {}
    for (const e of filteredEvents) {
      if (e.kind !== 'Ronda' || !e.machineId || map[e.machineId]) continue
      map[e.machineId] = conditionOf(e.conditionRaw)
    }
    return map
  }, [dataFiltersActive, filteredEvents, conditionByMachine])

  const personOptions = useMemo(
    () =>
      Object.entries(people)
        .map(([id, p]) => ({ value: id, label: p.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [people]
  )
  const kindOptions = ACTIVITY_KINDS.map((k) => ({ value: k, label: k }))
  const roomOptions = useMemo(
    () => roomsApi.rooms.map((r) => ({ value: r.id, label: r.name })),
    [roomsApi.rooms]
  )
  const shiftOptions = [1, 2, 3].map((n) => ({ value: String(n), label: SHIFT_LABEL[n] }))
  const optionsFor = (key) =>
    key === 'personId' ? personOptions
    : key === 'kind' ? kindOptions
    : key === 'roomId' ? roomOptions
    : key === 'shift' ? shiftOptions
    : []

  return (
    <div className="card wide leader-ops-map">
      <div className="lom-map-stage">
        {roomsApi.rooms.length === 0 && !roomsApi.loading ? (
          <p className="hint" style={{ padding: 16 }}>
            Esta planta todavía no tiene salas dibujadas en el plano.
          </p>
        ) : (
          <FloorMap
            canManage={false}
            canExpand
            roomsApi={roomsApi}
            machines={machines}
            updateMachine={() => {}}
            selectedMachineId={null}
            onSelectMachine={() => {}}
            livePeople={livePeople}
            conditionByMachine={effectiveConditionByMachine}
            highlightRoomIds={highlightRoomIds}
          />
        )}

        {/* HUD superior: identidad + estado, compacto y semitransparente */}
        <div className="lom-hud-top">
          <div
            className="lom-hud-title"
            title={`Líder de área${area && area !== 'general' ? ` · ${area}` : ''}${orgName ? ` · ${orgName}` : ''}`}
          >
            <strong>{userName ? `${userName.split(' ')[0]} · ` : ''}Planta en vivo</strong>
            <span className="pill live">
              <span className="dot" /> En vivo
            </span>
          </div>
          <div className="lom-hud-status">
            <span className="pill status ok">✓ {summary.normal}</span>
            <span className="pill status warn">▲ {summary.warning}</span>
            <span className="pill status off">✕ {summary.fault}</span>
            <span className="pill status idle">◧ {summary.off}</span>
          </div>
          {plants.length > 1 && (
            <div className="lmp-plant-chips">
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
        </div>

        {/* Dock de filtros — discreto, a la izquierda */}
        <div className="lom-filter-dock" role="group" aria-label="Filtros">
          {FILTER_DEFS.map((def) => (
            <FilterIcon
              key={def.key}
              def={def}
              active={!!filters[def.key]}
              value={filters[def.key]}
              onChange={(v) => setFilterValue(def.key, v)}
              options={optionsFor(def.key)}
              open={openFilter === def.key}
              onToggle={setOpenFilter}
            />
          ))}
          {hasFilters && (
            <button type="button" className="lom-filter-icon lom-filter-clear" title="Limpiar filtros" onClick={clearFilters}>
              ✕
            </button>
          )}
        </div>

        {/* Dock de herramientas — módulos de datos, a la derecha */}
        <div className="lom-tools-dock" role="navigation" aria-label="Módulos de datos">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              className="lom-tool-btn"
              title={t.hint || t.label}
              onClick={() => onNavigate?.(t.id)}
            >
              <span className="lom-tool-icon" aria-hidden="true">
                {iconFor(t.id)}
              </span>
              <span className="lom-tool-label">{t.label}</span>
            </button>
          ))}
          <button
            type="button"
            className="lom-tool-btn"
            title="Descargar Excel con turnos, operarios, rondas, cargues y transferencias"
            onClick={handleExport}
            disabled={exporting}
          >
            <span className="lom-tool-icon" aria-hidden="true">{exporting ? '⏳' : '📥'}</span>
            <span className="lom-tool-label">Reporte de operación</span>
          </button>
          {canSeePlant3DTour(role) && (
            /* Metaverso IncubApp: página aparte, en pestaña nueva. No puede ir
               en un iframe porque la propia CSP pone frame-ancestors 'none'. */
            <a
              className="lom-tool-btn lom-tool-3d"
              href={PLANT_3D_TOUR_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="Planta 3D — recorrido virtual de la planta (abre en otra pestaña)"
            >
              <span className="lom-tool-icon" aria-hidden="true">🕶️</span>
              <span className="lom-tool-label">Planta 3D</span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
