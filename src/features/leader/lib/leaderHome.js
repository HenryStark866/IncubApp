/**
 * Inicio del líder de área (etapa 3): «Necesita tu decisión», cuatro indicadores,
 * el equipo y el plan del día. Funciones puras; los datos llegan de useLeaderHome.
 * El líder no ejecuta: decide, aprueba y reparte. Cada decisión trae su botón.
 * Henry Stark Desarrollador
 */
import { localDate, clock, machineHealth, productionDay, shiftHoursElapsed } from '../../shift/lib/shiftHome'

/** Qué inicio de líder corresponde a su área. Las demás áreas llegan en orden. */
export function leaderKind(area) {
  const a = String(area || '').toLowerCase()
  if (a === 'maintenance') return 'maintenance'
  if (a === 'sst' || a === 'hse') return 'sst'
  if (a === 'veterinary' || a === 'farm') return 'veterinary'
  if (a === 'environmental') return 'environmental'
  if (a === 'logistics' || a === 'sales_logistics') return 'logistics'
  if (!a || a === 'plant' || a === 'general' || a === 'quality') return 'plant'
  return null
}

const TONE_ORDER = { danger: 0, warn: 1, info: 2 }
const byTone = (a, b) => (TONE_ORDER[a.tone] ?? 3) - (TONE_ORDER[b.tone] ?? 3)
const OPEN_WO = new Set(['open', 'in_progress'])
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
const PRIORITY_LABEL = {
  critical: 'crítica',
  high: 'alta',
  medium: 'media',
  low: 'baja',
}
const num = (n) => Number(n || 0).toLocaleString('es-CO')

const eggsOf = (postures) => (Array.isArray(postures) ? postures : []).reduce((s, p) => s + (Number(p?.eggs) || 0), 0)

/** Minutos que faltan para terminar la hora en curso. */
function minutesLeftInHour(now) {
  return 59 - now.getMinutes()
}

/* ─── Planta de incubación ─────────────────────────────── */

export function plantLeaderBoard({
  checks = [],
  machines = [],
  workOrders = [],
  loadMaps = [],
  lots = [],
  arrivals = [],
  loads = [],
  transfers = [],
  hatches = [],
  slot = {},
  now = new Date(),
}) {
  const decisions = []
  const health = machineHealth(checks, machines)
  const openOrders = workOrders.filter((w) => OPEN_WO.has(w.status))
  const openByMachine = new Map()
  for (const w of openOrders) if (w.machine_id && !openByMachine.has(w.machine_id)) openByMachine.set(w.machine_id, w)

  // 1. Máquinas en falla o alerta en este turno.
  for (const m of health.attention) {
    const wo = openByMachine.get(m.machineId)
    const what = m.condition === 'fault' ? 'con falla' : 'en alerta'
    const detail = [m.notes, m.at ? `reportada a las ${clock(m.at)}` : null].filter(Boolean).join(' · ')
    if (!wo) {
      decisions.push({
        id: `machine-${m.machineId}`,
        tone: m.condition === 'fault' ? 'danger' : 'warn',
        title: `${m.code} ${what} · sin orden de trabajo`,
        detail: detail || 'Reportada en la ronda del turno',
        action: {
          kind: 'request-ot',
          label: 'Pedir OT a mantenimiento',
          machineId: m.machineId,
          condition: m.condition,
          note: m.notes,
        },
        secondary: { kind: 'nav', tab: 'supervision', label: 'Ver ronda' },
      })
    } else if (!wo.assigned_to) {
      decisions.push({
        id: `machine-${m.machineId}`,
        tone: m.condition === 'fault' ? 'danger' : 'warn',
        title: `${m.code} ${what} · ${wo.code || 'OT'} sin técnico`,
        detail: detail || 'La orden ya está pedida; falta que mantenimiento la tome',
        action: { kind: 'nav', tab: 'mantenimiento', label: 'Ver la OT' },
      })
    }
  }

  // 2. Mapas de cargue por aprobar o aprobados sin enviar al operario.
  for (const map of loadMaps) {
    const s = map.payload?.summary || {}
    const carts = s.cartCount ? `${s.cartCount} carros` : null
    const eggs = s.totalEggs ? `${num(s.totalEggs)} huevos` : null
    const name = map.machine_name || map.payload?.machineName || 'Petersime'
    if (map.status === 'pending_approval') {
      decisions.push({
        id: `map-${map.id}`,
        tone: 'warn',
        title: `Mapa de cargue ${name} listo para aprobar`,
        detail: [carts, eggs].filter(Boolean).join(' · ') || 'Revise el mapa antes de enviarlo',
        action: { kind: 'nav', tab: 'cargue', label: 'Revisar y aprobar' },
      })
    } else if (map.status === 'approved') {
      decisions.push({
        id: `map-${map.id}`,
        tone: 'info',
        title: `Mapa ${name} aprobado, falta enviar la orden al operario`,
        detail: [carts, eggs].filter(Boolean).join(' · ') || 'Aprobado',
        action: { kind: 'nav', tab: 'cargue', label: 'Enviar orden' },
      })
    }
  }

  // 3. Llegadas de hoy que no cuadran con lo esperado.
  const today = localDate(now)
  const lotById = new Map(lots.map((l) => [l.id, l]))
  for (const a of arrivals) {
    if (localDate(a.arrived_at || a.created_at) !== today) continue
    const lot = lotById.get(a.lot_id)
    const expected = eggsOf(lot?.postures)
    const received = eggsOf(a.received_postures)
    const diff = received - expected
    if (!expected || !diff) continue
    decisions.push({
      id: `arrival-${a.id}`,
      tone: 'warn',
      title: `Llegada lote ${a.lot_code || lot?.code || ''}: ${diff < 0 ? 'faltan' : 'sobran'} ${num(Math.abs(diff))} huevos`,
      detail: `Esperados ${num(expected)} · recibidos ${num(received)}${a.photo_paths?.length ? ` · ${a.photo_paths.length} fotos` : ''}`,
      action: { kind: 'nav', tab: 'recepcion', label: 'Revisar llegada' },
    })
  }

  // 4. La ronda de esta hora se está quedando corta.
  const hourChecks = checks.filter((c) => Number(c.hour_slot) === Number(slot.hour))
  const doneNow = new Set(hourChecks.map((c) => c.machine_id)).size
  const left = minutesLeftInHour(now)
  if (machines.length && doneNow < machines.length && left <= 30) {
    decisions.push({
      id: 'round-now',
      tone: 'info',
      title: `Ronda ${String(slot.hour ?? now.getHours()).padStart(2, '0')}:00 va en ${doneNow} de ${machines.length} máquinas`,
      detail: `Quedan ${left} minutos de la hora`,
      action: { kind: 'nav', tab: 'supervision', label: 'Ver ronda' },
    })
  }

  // Indicadores
  const hoursWithRound = new Set(checks.map((c) => Number(c.hour_slot)).filter((h) => Number.isFinite(h))).size
  const elapsed = Math.max(1, Math.ceil(shiftHoursElapsed(slot.shift, now)))
  const unassigned = openOrders.filter((w) => !w.assigned_to).length
  const day = productionDay({
    loads,
    transfers,
    hatches,
    loadMaps,
    day: today,
  })
  const kpis = [
    {
      label: 'Rondas del turno',
      value: `${hoursWithRound} de ${elapsed}`,
      sub: 'horas del turno con ronda',
      tone: hoursWithRound < elapsed - 1 ? 'warn' : null,
    },
    {
      label: 'Máquinas',
      value: `${health.normal} · ${health.warning} · ${health.fault}`,
      sub: 'sin novedad · en alerta · con falla',
      tone: health.fault ? 'danger' : health.warning ? 'warn' : null,
    },
    {
      label: 'OT abiertas',
      value: String(openOrders.length),
      sub: unassigned ? `${unassigned} sin técnico` : 'todas con técnico',
      tone: unassigned ? 'warn' : null,
    },
    {
      label: 'Cargues de hoy',
      value: `${day.loads.done}`,
      sub: `${day.loads.pending} por cargar · ${day.transfers.done} transferencias`,
      tone: null,
    },
  ]

  const plan = day.timeline.map((t) => ({
    id: t.id,
    at: clock(t.at),
    text: t.text,
    state: t.state === 'done' ? 'Hecho' : t.state === 'doing' ? 'En curso' : 'Pendiente',
    tone: t.state === 'done' ? 'ok' : 'info',
  }))
  if (day.next) {
    plan.push({
      id: `next-${day.next.id}`,
      at: '—',
      text: `Cargue ${day.next.machine}${day.next.lote ? ` · Lote ${day.next.lote}` : ''}`,
      state: day.next.status === 'ordered' ? 'Orden enviada' : 'Por enviar',
      tone: 'warn',
    })
  }

  return { decisions: decisions.sort(byTone), kpis, plan }
}

/* ─── Mantenimiento ───────────────────────────────────── */

const DAY_MS = 86400000

export function maintenanceLeaderBoard({ workOrders = [], machines = [], technicians = [], now = new Date() }) {
  const codeOf = new Map(machines.map((m) => [m.id, m.code || m.name]))
  const label = (w) => [w.code || 'OT', codeOf.get(w.machine_id), w.title].filter(Boolean).join(' · ')
  const open = workOrders.filter((w) => OPEN_WO.has(w.status))
  const decisions = []

  // 1. OT abiertas sin técnico, la más urgente primero.
  const unassigned = open
    .filter((w) => !w.assigned_to)
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    )
  for (const w of unassigned) {
    const urgent = w.priority === 'critical' || w.priority === 'high'
    decisions.push({
      id: `assign-${w.id}`,
      tone: urgent ? 'danger' : 'warn',
      title: `${label(w)} · prioridad ${PRIORITY_LABEL[w.priority] || 'media'}`,
      detail: `Sin técnico · pedida ${w.created_at ? `el ${new Date(w.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} a las ${clock(w.created_at)}` : ''}${w.source === 'round' || /ronda/i.test(w.description || '') ? ' desde la ronda' : ''}`,
      action: { kind: 'assign', label: 'Asignar técnico', orderId: w.id },
    })
  }

  // 2. OT cerradas que esperan el visto bueno del líder (últimos 14 días).
  const toApprove = workOrders.filter(
    (w) => w.status === 'completed' && !w.approved_by && w.completed_at && now - new Date(w.completed_at) < 14 * DAY_MS,
  )
  for (const w of toApprove) {
    decisions.push({
      id: `approve-${w.id}`,
      tone: 'warn',
      title: `${label(w)} · cerrada, espera tu visto bueno`,
      detail:
        [w.resolution, w.downtime_minutes != null ? `parada ${w.downtime_minutes} min` : null]
          .filter(Boolean)
          .join(' · ') || 'Revise el FOMAT01 y apruebe el cierre',
      action: { kind: 'approve', label: 'Aprobar cierre', orderId: w.id },
      secondary: { kind: 'format', label: 'Ver FOMAT01', orderId: w.id },
    })
  }

  // 3. Programadas (preventivos / calibraciones) vencidas o para los próximos 2 días sin técnico.
  for (const w of open) {
    if (!w.scheduled_for || w.assigned_to) continue
    const due = new Date(w.scheduled_for)
    if (due - now > 2 * DAY_MS) continue
    if (decisions.some((d) => d.id === `assign-${w.id}`)) continue
    decisions.push({
      id: `due-${w.id}`,
      tone: due < now ? 'danger' : 'info',
      title: `${label(w)} ${due < now ? 'vencida' : 'vence pronto'}`,
      detail: `Programada para el ${due.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}`,
      action: { kind: 'assign', label: 'Asignar técnico', orderId: w.id },
    })
  }

  // Indicadores
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const closedMonth = workOrders.filter(
    (w) => w.status === 'completed' && w.completed_at && new Date(w.completed_at) >= monthStart,
  )
  const downtime = closedMonth.reduce((s, w) => s + (Number(w.downtime_minutes) || 0), 0)
  const weekEnd = new Date(now.getTime() + 7 * DAY_MS)
  const planned = open.filter((w) => w.scheduled_for && new Date(w.scheduled_for) <= weekEnd)
  const urgentOpen = open.filter((w) => w.priority === 'critical' || w.priority === 'high').length
  const kpis = [
    {
      label: 'OT abiertas',
      value: String(open.length),
      sub: urgentOpen ? `${urgentOpen} de prioridad alta` : 'ninguna de prioridad alta',
      tone: urgentOpen ? 'danger' : null,
    },
    {
      label: 'En ejecución',
      value: String(open.filter((w) => w.status === 'in_progress').length),
      sub: `${unassigned.length} sin técnico`,
      tone: unassigned.length ? 'warn' : null,
    },
    {
      label: 'Cerradas en el mes',
      value: String(closedMonth.length),
      sub: `${toApprove.length} por aprobar`,
      tone: null,
    },
    {
      label: 'Parada del mes',
      value: `${num(downtime)} min`,
      sub: 'registrada al cerrar OT',
      tone: null,
    },
  ]

  // Técnicos: lo que tienen en curso y lo cerrado hoy.
  const today = localDate(now)
  const team = technicians.map((t) => {
    const mine = open.filter((w) => w.assigned_to === t.id)
    const doing = mine.find((w) => w.status === 'in_progress') || mine[0] || null
    const closedToday = workOrders.filter(
      (w) => w.assigned_to === t.id && w.status === 'completed' && localDate(w.completed_at || 0) === today,
    ).length
    return {
      id: t.id,
      name: t.name,
      role: t.roleLabel,
      doing: doing ? label(doing) : 'Libre · puede tomar una OT',
      value: `${mine.length} abiertas · ${closedToday} cerradas hoy`,
      free: !doing,
    }
  })
  team.sort((a, b) => Number(a.free) - Number(b.free) || a.name.localeCompare(b.name))

  const plan = planned
    .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)))
    .slice(0, 8)
    .map((w) => {
      const d = new Date(w.scheduled_for)
      return {
        id: w.id,
        at: d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''),
        text: label(w),
        state:
          w.status === 'in_progress' ? 'En curso' : d < now ? 'Vencida' : w.assigned_to ? 'Asignada' : 'Sin técnico',
        tone: w.status === 'in_progress' ? 'info' : d < now || !w.assigned_to ? 'warn' : 'ok',
      }
    })

  return { decisions: decisions.sort(byTone), kpis, team, plan }
}

/* ─── Preoperacionales de vehículos (SST y logística) ─── */

const hasFindings = (r) => r?.compliant === false
const preopLabel = (r) => [r.vehicle_plate || 'Vehículo', r.driver_name].filter(Boolean).join(' · ')

/** Preoperacional de hoy de cada conductor activo: hecho, con hallazgo o pendiente. */
export function driversPreopToday({ drivers = [], preops = [], now = new Date() }) {
  const today = localDate(now)
  const todays = preops.filter((r) => String(r.inspection_date || r.created_at || '').slice(0, 10) === today)
  return drivers
    .filter((d) => d.active !== false)
    .map((d) => {
      const plate = String(d.plate || '')
        .trim()
        .toUpperCase()
      const r = todays.find(
        (x) =>
          (d.user_id && x.driver_user_id === d.user_id) ||
          (plate &&
            String(x.vehicle_plate || '')
              .trim()
              .toUpperCase() === plate),
      )
      return { driver: d, report: r || null, state: !r ? 'pending' : hasFindings(r) ? 'findings' : 'ok' }
    })
}

/* ─── SST ─────────────────────────────────────────────── */

export function sstLeaderBoard({ preops = [], supplies = [], drivers = [], now = new Date() }) {
  const today = localDate(now)
  const recent = preops.filter((r) => now - new Date(r.inspection_date || r.created_at) < 7 * DAY_MS)
  const decisions = []

  // 1. Preoperacionales con hallazgo sin revisar: el vehículo no debería salir.
  for (const r of recent.filter((x) => hasFindings(x) && x.status !== 'reviewed')) {
    decisions.push({
      id: `preop-${r.id}`,
      tone: 'danger',
      title: `Preoperacional ${preopLabel(r)} con hallazgos`,
      detail: [r.inspection_date ? `del ${String(r.inspection_date).slice(0, 10)}` : null, r.commitments]
        .filter(Boolean)
        .join(' · '),
      action: { kind: 'nav', tab: 'preoperacional', label: 'Revisar' },
    })
  }

  // 2. Dotación / EPP por debajo del mínimo.
  for (const i of supplies.filter((x) => x.min_qty != null && Number(x.qty_on_hand) < Number(x.min_qty))) {
    decisions.push({
      id: `epp-${i.id}`,
      tone: Number(i.qty_on_hand) <= 0 ? 'danger' : 'warn',
      title: `Dotación / EPP bajo el mínimo: ${i.item_name}`,
      detail: `Hay ${num(i.qty_on_hand)} ${i.unit || ''} · mínimo ${num(i.min_qty)}${i.location ? ` · ${i.location}` : ''}`,
      action: { kind: 'nav', tab: 'inventarios', label: 'Ver inventario' },
    })
  }

  // 3. Preoperacionales sin hallazgo esperando el sello de revisión.
  const toReview = recent.filter((x) => !hasFindings(x) && x.status !== 'reviewed')
  if (toReview.length) {
    decisions.push({
      id: 'preop-review',
      tone: 'info',
      title: `${toReview.length} preoperacional${toReview.length === 1 ? '' : 'es'} por revisar`,
      detail: 'Sin hallazgos · falta el sello del líder',
      action: { kind: 'nav', tab: 'preoperacional', label: 'Revisar' },
    })
  }

  const todays = preops.filter((r) => String(r.inspection_date || r.created_at || '').slice(0, 10) === today)
  const lastFinding = preops
    .filter(hasFindings)
    .map((r) => new Date(r.inspection_date || r.created_at))
    .sort((a, b) => b - a)[0]
  const daysClean = lastFinding ? Math.max(0, Math.floor((now - lastFinding) / DAY_MS)) : null
  const low = supplies.filter((x) => x.min_qty != null && Number(x.qty_on_hand) < Number(x.min_qty)).length
  const fleet = driversPreopToday({ drivers, preops, now })
  const kpis = [
    {
      label: 'Preoperacionales hoy',
      value: fleet.length ? `${fleet.filter((f) => f.report).length} de ${fleet.length}` : String(todays.length),
      sub: `${todays.filter(hasFindings).length} con hallazgo`,
      tone: todays.some(hasFindings) ? 'danger' : null,
    },
    {
      label: 'Días sin hallazgos',
      value: daysClean == null ? '—' : String(daysClean),
      sub: 'en preoperacionales',
      tone: null,
    },
    {
      label: 'Por revisar',
      value: String(recent.filter((x) => x.status !== 'reviewed').length),
      sub: 'últimos 7 días',
      tone: null,
    },
    {
      label: 'EPP bajo mínimo',
      value: String(low),
      sub: `${supplies.length} ítems de dotación`,
      tone: low ? 'warn' : null,
    },
  ]
  const team = fleet.map(({ driver, report, state }) => ({
    id: driver.id,
    name: driver.full_name || 'Conductor',
    role: [driver.vehicle, driver.plate].filter(Boolean).join(' · ') || 'Conductor',
    doing:
      state === 'pending'
        ? 'Sin preoperacional hoy'
        : `Preoperacional ${clock(report.created_at) || ''} · ${state === 'ok' ? 'sin hallazgos' : 'con hallazgos'}`,
    value: state === 'pending' ? 'Pendiente' : state === 'ok' ? 'Al día' : 'Hallazgo',
    tone: state === 'ok' ? 'ok' : state === 'pending' ? 'warn' : 'danger',
  }))
  const plan = todays
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => ({
      id: r.id,
      at: clock(r.created_at) || '—',
      text: `Preoperacional ${preopLabel(r)}`,
      state: r.status === 'reviewed' ? 'Revisado' : hasFindings(r) ? 'Con hallazgo' : 'Sin hallazgos',
      tone: hasFindings(r) && r.status !== 'reviewed' ? 'warn' : 'ok',
    }))
  return { decisions: decisions.sort(byTone), kpis, team, plan }
}

/* ─── Gestión ambiental ───────────────────────────────── */

export function environmentalLeaderBoard({ sensors = [], readings = [], now = new Date() }) {
  const latest = new Map()
  for (const r of readings) {
    const prev = latest.get(r.sensor_id)
    if (!prev || String(r.recorded_at) > String(prev.recorded_at)) latest.set(r.sensor_id, r)
  }
  const active = sensors.filter((s) => s.status !== 'inactive' && s.status !== 'retired')
  const out = (s, v) =>
    v != null &&
    ((s.min_threshold != null && v < Number(s.min_threshold)) ||
      (s.max_threshold != null && v > Number(s.max_threshold)))
  const decisions = []
  const rows = active.map((s) => {
    const r = latest.get(s.id) || null
    const v = r ? Number(r.value) : null
    const stale = !r || now - new Date(r.recorded_at) > DAY_MS
    return { s, r, v, stale, out: !stale && out(s, v) }
  })
  for (const x of rows.filter((x) => x.out)) {
    const lo = x.s.min_threshold
    const hi = x.s.max_threshold
    const range =
      lo != null && hi != null
        ? `rango ${num(lo)} a ${num(hi)}`
        : hi != null
          ? `máximo ${num(hi)}`
          : `mínimo ${num(lo)}`
    decisions.push({
      id: `sensor-${x.s.id}`,
      tone: 'warn',
      title: `Sensor ${x.s.code} fuera de rango: ${num(x.v)} ${x.s.unit || ''}`.trim(),
      detail: `${x.s.kind || 'Lectura'} · ${range} · ${clock(x.r.recorded_at)}`,
      action: { kind: 'nav', tab: 'iot', label: 'Ver sensor' },
    })
  }
  for (const x of rows.filter((x) => x.stale)) {
    decisions.push({
      id: `stale-${x.s.id}`,
      tone: 'info',
      title: `Sensor ${x.s.code} sin datos ${x.r ? 'desde hace más de un día' : 'todavía'}`,
      detail: x.r
        ? `Última lectura ${new Date(x.r.recorded_at).toLocaleString('es-CO')}`
        : 'Revise la conexión del equipo',
      action: { kind: 'nav', tab: 'iot', label: 'Revisar' },
    })
  }
  const today = localDate(now)
  const readingsToday = readings.filter((r) => localDate(r.recorded_at) === today)
  const kpis = [
    { label: 'Sensores activos', value: String(active.length), sub: `${sensors.length} registrados`, tone: null },
    {
      label: 'Fuera de rango',
      value: String(rows.filter((x) => x.out).length),
      sub: 'según su última lectura',
      tone: rows.some((x) => x.out) ? 'warn' : null,
    },
    { label: 'Sin datos', value: String(rows.filter((x) => x.stale).length), sub: 'más de 24 horas', tone: null },
    { label: 'Lecturas de hoy', value: num(readingsToday.length), sub: 'todas las sedes', tone: null },
  ]
  const team = rows.map((x) => ({
    id: x.s.id,
    name: x.s.code,
    role: x.s.kind || 'Sensor',
    doing: x.r ? `${num(x.v)} ${x.s.unit || ''} · ${clock(x.r.recorded_at)}` : 'Sin lecturas',
    value: x.out ? 'Fuera de rango' : x.stale ? 'Sin datos' : 'En rango',
    tone: x.out ? 'warn' : x.stale ? 'info' : 'ok',
  }))
  const byId = new Map(sensors.map((s) => [s.id, s]))
  const plan = readingsToday
    .filter((r) => byId.has(r.sensor_id) && out(byId.get(r.sensor_id), Number(r.value)))
    .sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))
    .slice(0, 8)
    .map((r) => {
      const s = byId.get(r.sensor_id)
      return {
        id: `${r.sensor_id}-${r.recorded_at}`,
        at: clock(r.recorded_at),
        text: `${s.code} · ${num(r.value)} ${s.unit || ''}`,
        state: 'Fuera de rango',
        tone: 'warn',
      }
    })
  return { decisions: decisions.sort(byTone), kpis, team, plan }
}

/* ─── Logística ───────────────────────────────────────── */

const routeName = (r) => {
  const c = String(r?.code || r?.name || '').trim()
  return /^ruta\b/i.test(c) ? c : `Ruta ${c}`.trim()
}

export function logisticsLeaderBoard({
  orders = [],
  remittances = [],
  routes = [],
  deliveries = [],
  drivers = [],
  preops = [],
  customers = [],
  now = new Date(),
}) {
  const today = localDate(now)
  const customerName = new Map(customers.map((c) => [c.id, c.name || c.business_name || c.full_name]))
  const withRemittance = new Set(remittances.filter((r) => r.status !== 'cancelled').map((r) => r.order_id))
  const decisions = []

  const fleet = driversPreopToday({ drivers, preops, now })
  for (const f of fleet.filter((x) => x.state === 'findings')) {
    decisions.push({
      id: `preop-${f.report.id}`,
      tone: 'danger',
      title: `${f.report.vehicle_plate || 'Vehículo'} con hallazgos en el preoperacional`,
      detail: `${f.driver.full_name || ''}${f.report.commitments ? ` · ${f.report.commitments}` : ''} · reasigne la ruta si no puede salir`,
      action: { kind: 'nav', tab: 'preoperacional', label: 'Ver preoperacional' },
    })
  }

  const pendingOrders = orders.filter((o) => ['confirmed', 'scheduled'].includes(o.status) && !withRemittance.has(o.id))
  pendingOrders.sort((a, b) => String(a.delivery_date || '9').localeCompare(String(b.delivery_date || '9')))
  for (const o of pendingOrders) {
    const soon = o.delivery_date && String(o.delivery_date) <= localDate(new Date(now.getTime() + DAY_MS))
    decisions.push({
      id: `order-${o.id}`,
      tone: soon ? 'warn' : 'info',
      title: `Pedido ${o.code || ''} ${o.status === 'scheduled' ? 'programado' : 'confirmado'} sin remisión`,
      detail: [
        customerName.get(o.customer_id),
        `${num((Number(o.qty_females) || 0) + (Number(o.qty_males) || 0))} pollitos`,
        o.delivery_date ? `entrega ${o.delivery_date}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      action: { kind: 'nav', tab: 'logistica', label: 'Crear remisión' },
    })
  }

  for (const r of routes.filter((x) => x.status === 'planned' && !x.driver_id)) {
    decisions.push({
      id: `route-${r.id}`,
      tone: 'warn',
      title: `${routeName(r)} sin conductor`,
      detail: r.name || 'Planeada',
      action: { kind: 'nav', tab: 'logistica', label: 'Asignar conductor' },
    })
  }

  for (const d of drivers.filter((x) => x.active !== false && x.on_route)) {
    const mins = d.last_location_at ? Math.round((now - new Date(d.last_location_at)) / 60000) : null
    if (mins != null && mins < 20) continue
    decisions.push({
      id: `gps-${d.id}`,
      tone: 'info',
      title: `Sin ubicación de ${d.full_name || 'conductor'} ${mins == null ? 'desde que salió' : `hace ${mins} min`}`,
      detail: [d.vehicle, d.plate].filter(Boolean).join(' · ') || 'En ruta',
      action: { kind: 'nav', tab: 'logistica', label: 'Ver en el mapa' },
    })
  }

  const dispatchToday = remittances.filter(
    (r) => String(r.dispatch_date || '').slice(0, 10) === today && r.status !== 'cancelled',
  )
  const delivToday = deliveries.filter(
    (d) => localDate(d.arrived_at || d.departed_at || d.created_at) === today && d.operation_type !== 'pickup',
  )
  const kpis = [
    {
      label: 'Despachos hoy',
      value: String(dispatchToday.length),
      sub: `${dispatchToday.filter((r) => r.status === 'delivered').length} entregados`,
      tone: null,
    },
    {
      label: 'Rutas en curso',
      value: String(routes.filter((r) => r.status === 'en_route').length),
      sub: `${drivers.filter((d) => d.on_route).length} en ruta ahora`,
      tone: null,
    },
    {
      label: 'Paradas de hoy',
      value: `${delivToday.filter((d) => d.status === 'arrived').length} de ${delivToday.length}`,
      sub: 'entregas cumplidas',
      tone: null,
    },
    {
      label: 'Preoperacionales',
      value: `${fleet.filter((f) => f.report).length} de ${fleet.length}`,
      sub: `${fleet.filter((f) => f.state === 'findings').length} con hallazgo`,
      tone: fleet.some((f) => f.state === 'findings')
        ? 'danger'
        : fleet.some((f) => f.state === 'pending')
          ? 'warn'
          : null,
    },
  ]
  const routeByDriver = new Map(
    routes.filter((r) => r.status === 'en_route' || r.status === 'planned').map((r) => [r.driver_id, r]),
  )
  const team = fleet.map(({ driver, state }) => {
    const r = routeByDriver.get(driver.id)
    return {
      id: driver.id,
      name: driver.full_name || 'Conductor',
      role: [driver.vehicle, driver.plate].filter(Boolean).join(' · ') || 'Conductor',
      doing: r
        ? `${routeName(r)} · ${r.status === 'en_route' ? 'en ruta' : 'planeada'}`
        : driver.on_route
          ? 'En ruta'
          : 'Sin ruta asignada',
      value: state === 'pending' ? 'Preop. pendiente' : state === 'ok' ? 'Preop. al día' : 'Preop. con hallazgo',
      tone: state === 'ok' ? 'ok' : state === 'pending' ? 'warn' : 'danger',
    }
  })
  const tomorrow = localDate(new Date(now.getTime() + DAY_MS))
  const plan = remittances
    .filter((r) => r.status !== 'cancelled' && [today, tomorrow].includes(String(r.dispatch_date || '').slice(0, 10)))
    .sort((a, b) => String(a.dispatch_date).localeCompare(String(b.dispatch_date)))
    .map((r) => ({
      id: r.id,
      at: String(r.dispatch_date).slice(0, 10) === today ? 'Hoy' : 'Mañ.',
      text: [
        r.code || 'Remisión',
        customerName.get(r.customer_id),
        `${num((Number(r.qty_females) || 0) + (Number(r.qty_males) || 0))} pollitos`,
      ]
        .filter(Boolean)
        .join(' · '),
      state: r.status === 'delivered' ? 'Entregada' : r.status === 'dispatched' ? 'Despachada' : 'Por despachar',
      tone: r.status === 'delivered' ? 'ok' : r.status === 'dispatched' ? 'info' : 'warn',
    }))
  return { decisions: decisions.sort(byTone), kpis, team, plan }
}

/* ─── Sanidad veterinaria ─────────────────────────────── */

const VET_LABEL = {
  vaccination: 'Vacunación',
  medicine: 'Tratamiento',
  fertility: 'Fertilidad',
  wet_tunnel_lab: 'Muestra wet tunnel',
  other_lab: 'Muestra de laboratorio',
}
const LAB_KINDS = new Set(['fertility', 'wet_tunnel_lab', 'other_lab'])
const normLote = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()

/** «91,8 %», «88.5» → 91.8 / 88.5; sin número → null. */
function percentOf(text) {
  const m = String(text || '')
    .replace(',', '.')
    .match(/\d+(\.\d+)?/)
  const n = m ? Number(m[0]) : NaN
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null
}

export function veterinaryLeaderBoard({ records = [], hatches = [], team: members = [], now = new Date() }) {
  const today = localDate(now)
  const recent = records.filter((r) => now - new Date(r.recorded_at || r.created_at) < 30 * DAY_MS)
  const label = (r) =>
    [VET_LABEL[r.kind] || 'Registro', r.batch_or_lote ? `lote ${r.batch_or_lote}` : null, r.site]
      .filter(Boolean)
      .join(' · ')
  const decisions = []

  // 1. Resultados fuera de lo esperado.
  for (const r of recent.filter((x) => x.result_status === 'fail' || x.result_status === 'alert')) {
    decisions.push({
      id: `vet-${r.id}`,
      tone: r.result_status === 'fail' ? 'danger' : 'warn',
      title: `${label(r)}: ${r.result || (r.result_status === 'fail' ? 'resultado no conforme' : 'en alerta')}`,
      detail: [
        r.title,
        r.sample_point,
        new Date(r.recorded_at || r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
      ]
        .filter(Boolean)
        .join(' · '),
      action: { kind: 'nav', tab: 'veterinaria', label: 'Revisar' },
    })
  }

  // 2. Nacimientos de hoy y mañana sin vacunación registrada del lote.
  const vaccinated = new Set(
    records
      .filter((r) => r.kind === 'vaccination' && now - new Date(r.recorded_at || r.created_at) < 3 * DAY_MS)
      .map((r) => normLote(r.batch_or_lote)),
  )
  const tomorrow = localDate(new Date(now.getTime() + DAY_MS))
  const upcoming = hatches
    .filter((h) => h.status !== 'cancelled')
    .map((h) => ({ ...h, when: h.scheduled_at || h.started_at || h.created_at }))
    .filter((h) => [today, tomorrow].includes(localDate(h.when)))
    .sort((a, b) => String(a.when).localeCompare(String(b.when)))
  for (const h of upcoming) {
    if (!h.lote || vaccinated.has(normLote(h.lote))) continue
    decisions.push({
      id: `hatch-${h.id}`,
      tone: localDate(h.when) === today ? 'warn' : 'info',
      title: `Nacimiento lote ${h.lote} ${localDate(h.when) === today ? 'hoy' : 'mañana'} a las ${clock(h.when)} · sin vacunación registrada`,
      detail: 'Confirme biológico, dosis y quién vacuna',
      action: { kind: 'nav', tab: 'veterinaria', label: 'Registrar vacunación' },
    })
  }

  // 3. Muestras de laboratorio que siguen sin resultado.
  for (const r of records.filter(
    (x) => LAB_KINDS.has(x.kind) && (x.result_status === 'pending' || (!x.result_status && !x.result)),
  )) {
    const days = Math.floor((now - new Date(r.recorded_at || r.created_at)) / DAY_MS)
    if (days < 2) continue
    decisions.push({
      id: `lab-${r.id}`,
      tone: days >= 7 ? 'warn' : 'info',
      title: `${label(r)} sin resultado hace ${days} días`,
      detail: [r.title, r.sample_point].filter(Boolean).join(' · ') || 'Enviada al laboratorio',
      action: { kind: 'nav', tab: 'veterinaria', label: 'Registrar resultado' },
    })
  }

  const week = records.filter((r) => now - new Date(r.recorded_at || r.created_at) < 7 * DAY_MS)
  const fert = recent
    .filter((r) => r.kind === 'fertility')
    .map((r) => percentOf(r.result))
    .filter((n) => n != null)
  const avgFert = fert.length ? fert.reduce((a, b) => a + b, 0) / fert.length : null
  const pendingLab = records.filter(
    (x) => LAB_KINDS.has(x.kind) && (x.result_status === 'pending' || (!x.result_status && !x.result)),
  ).length
  const alerts = recent.filter((x) => x.result_status === 'fail' || x.result_status === 'alert').length
  const kpis = [
    {
      label: 'Vacunaciones semana',
      value: String(week.filter((r) => r.kind === 'vaccination').length),
      sub: 'registros de 7 días',
      tone: null,
    },
    {
      label: 'Fertilidad promedio',
      value: avgFert == null ? '—' : `${avgFert.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`,
      sub: fert.length ? `${fert.length} pruebas en 30 días` : 'sin pruebas en 30 días',
      tone: avgFert != null && avgFert < 90 ? 'warn' : null,
    },
    {
      label: 'Muestras sin resultado',
      value: String(pendingLab),
      sub: 'laboratorio y fertilidad',
      tone: pendingLab ? 'warn' : null,
    },
    { label: 'Alertas del mes', value: String(alerts), sub: 'resultados no conformes', tone: alerts ? 'danger' : null },
  ]

  const todays = records.filter((r) => localDate(r.recorded_at || r.created_at) === today)
  const team = members.map((m) => {
    const mine = todays.filter((r) => r.created_by === m.id)
    const last = mine.sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))[0]
    return {
      id: m.id,
      name: m.name,
      role: m.roleLabel,
      doing: last ? `${label(last)} · ${clock(last.recorded_at || last.created_at)}` : 'Sin registros hoy',
      value: `${mine.length} registro${mine.length === 1 ? '' : 's'} hoy`,
      tone: mine.length ? 'ok' : null,
      count: mine.length,
    }
  })
  team.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const plan = upcoming.map((h) => ({
    id: h.id,
    at: `${localDate(h.when) === today ? '' : 'Mañ. '}${clock(h.when)}`,
    text: `Nacimiento lote ${h.lote || '—'}`,
    state: h.lote && vaccinated.has(normLote(h.lote)) ? 'Vacunado' : 'Por vacunar',
    tone: h.lote && vaccinated.has(normLote(h.lote)) ? 'ok' : 'warn',
  }))
  return { decisions: decisions.sort(byTone), kpis, team, plan }
}
