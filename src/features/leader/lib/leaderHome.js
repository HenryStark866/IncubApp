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
