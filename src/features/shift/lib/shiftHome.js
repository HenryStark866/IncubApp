/**
 * Lógica de las pantallas de inicio de la operación de planta (etapa 1 de la
 * remodelación): operario / auxiliar de turno, auxiliar de producción, operario
 * de recepción y supervisor. Funciones puras: reciben filas de Supabase y
 * devuelven lo que cada pantalla muestra, para poder probarlas sin red.
 * El líder de área (coordinator) NO usa esto: conserva su LeaderDashboard.
 * Henry Stark Desarrollador · CDH Maker
 */

/** Roles que abren estas pantallas en la pestaña «Hoy». */
export const PLANT_SHIFT_HOME_ROLES = [
  'operator',
  'auxiliary',
  'auxiliary_production',
  'reception_operator',
  'supervisor',
]

/** Qué pantalla abre cada rol. */
export function shiftHomeKind(role) {
  if (role === 'supervisor') return 'supervisor'
  if (role === 'auxiliary_production') return 'production'
  if (role === 'reception_operator') return 'reception'
  if (role === 'operator' || role === 'auxiliary') return 'operator'
  return null
}

export const SHIFT_WINDOWS = {
  1: { start: 6, end: 14, label: '06:00 – 14:00' },
  2: { start: 14, end: 22, label: '14:00 – 22:00' },
  3: { start: 22, end: 6, label: '22:00 – 06:00' },
}

const pad = (n) => String(n).padStart(2, '0')

/** «14:05» en la hora del equipo (la planta y sus equipos están en Colombia). */
export function clock(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** YYYY-MM-DD en la hora del equipo. */
export function localDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Horas transcurridas del turno (0..8) a la hora `now`. */
export function shiftHoursElapsed(shift, now = new Date()) {
  const w = SHIFT_WINDOWS[shift]
  if (!w) return 0
  const h = now.getHours() + now.getMinutes() / 60
  const elapsed = shift === 3 ? (h >= 22 ? h - 22 : h + 2) : h - w.start
  return Math.max(0, Math.min(8, elapsed))
}

/** «quedan 5 h 40 min» del turno. */
export function shiftTimeLeft(shift, now = new Date()) {
  const left = Math.max(0, Math.round((8 - shiftHoursElapsed(shift, now)) * 60))
  const h = Math.floor(left / 60)
  const m = left % 60
  if (h && m) return `quedan ${h} h ${m} min`
  if (h) return `quedan ${h} h`
  return `quedan ${m} min`
}

/**
 * Avance de rondas contra el mínimo del turno. `expectedNow` es cuántas
 * deberían ir a esta hora si se reparten parejas en las 8 horas; `behind`
 * avisa al supervisor cuando alguien va por debajo de ese ritmo.
 */
export function roundsPace({ done = 0, min = 6, shift, now = new Date() }) {
  const elapsed = shiftHoursElapsed(shift, now)
  const expectedNow = Math.min(min, Math.floor((elapsed / 8) * min))
  const every = 8 / Math.max(1, min)
  let nextAt = null
  if (done < min) {
    const w = SHIFT_WINDOWS[shift]
    if (w) {
      const target = Math.max(elapsed, done * every)
      const hour = (w.start + Math.ceil(target)) % 24
      nextAt = `${pad(hour)}:00`
    }
  }
  return { done, min, expectedNow, behind: done < expectedNow, complete: done >= min, nextAt }
}

/** Última condición reportada de cada máquina (las filas pueden venir en cualquier orden). */
export function latestConditionByMachine(checks = []) {
  const latest = new Map()
  for (const c of checks) {
    if (!c?.machine_id) continue
    const prev = latest.get(c.machine_id)
    if (!prev || String(c.taken_at || '') > String(prev.taken_at || '')) latest.set(c.machine_id, c)
  }
  return latest
}

/**
 * Estado de las máquinas en el turno según sus rondas: cuántas sin novedad,
 * en alerta, en falla o apagadas, y la lista de las que piden atención
 * (falla primero). Una máquina sin ronda en el turno no cuenta como alerta.
 */
export function machineHealth(checks = [], machines = []) {
  const byId = new Map(machines.map((m) => [m.id, m]))
  const latest = latestConditionByMachine(checks)
  const counts = { normal: 0, warning: 0, fault: 0, off: 0 }
  const attention = []
  for (const [machineId, c] of latest) {
    const cond = c.condition || 'normal'
    if (counts[cond] != null) counts[cond] += 1
    if (cond === 'fault' || cond === 'warning') {
      const m = byId.get(machineId) || {}
      attention.push({
        machineId,
        code: m.code || m.name || 'Máquina',
        condition: cond,
        notes: c.notes || '',
        at: c.taken_at || null,
      })
    }
  }
  attention.sort((a, b) => (a.condition === b.condition ? 0 : a.condition === 'fault' ? -1 : 1))
  return { ...counts, reported: latest.size, total: machines.length, attention }
}

/** Actividades asignadas en orden de urgencia: en curso, luego pendientes más antiguas. */
export function sortAssignments(acts = []) {
  const rank = { in_progress: 0, pending: 1 }
  return [...acts]
    .filter((a) => a && (a.status === 'pending' || a.status === 'in_progress'))
    .sort((a, b) => {
      const r = (rank[a.status] ?? 2) - (rank[b.status] ?? 2)
      if (r) return r
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
}

/** Qué tipo de actividad es, para su ícono y a qué pestaña lleva. */
export function assignmentKind(title = '') {
  const t = String(title).toLowerCase()
  if (/calibr/.test(t)) return { icon: 'calibrate', tab: 'calibracion' }
  if (/cargue|carga|mapa/.test(t)) return { icon: 'load', tab: 'cargue' }
  if (/alarma|alerta|revis|falla|humedad|temperatura/.test(t)) return { icon: 'alert', tab: 'supervision' }
  return { icon: 'task', tab: 'supervision' }
}

const sameDay = (value, day) => !!value && localDate(value) === day

/**
 * Producción del día: cargues, transferencias y nacimientos (hechos y
 * programados), el siguiente cargue pendiente y la línea de tiempo.
 */
export function productionDay({ loads = [], transfers = [], hatches = [], loadMaps = [], day = localDate() }) {
  const loadsToday = loads.filter((l) => sameDay(l.loaded_at || l.created_at, day))
  const transfersToday = transfers.filter((t) => sameDay(t.transferred_at || t.created_at, day))
  const hatchesToday = hatches.filter((h) => sameDay(h.scheduled_at || h.started_at || h.created_at, day))
  const hatchesDone = hatchesToday.filter((h) => h.status === 'completed' || h.ended_at)

  // Mapas aprobados o con orden emitida que aún no se cargan: son los cargues por hacer.
  const pendingMaps = loadMaps
    .filter((m) => (m.status === 'approved' || m.status === 'ordered') && !m.loaded_at)
    .sort((a, b) => String(a.ordered_at || a.approved_at || a.created_at || '').localeCompare(String(b.ordered_at || b.approved_at || b.created_at || '')))
  const next = pendingMaps[0] || null

  const timeline = [
    ...loadsToday.map((l) => ({
      id: `load-${l.id}`,
      at: l.loaded_at || l.created_at,
      text: `Cargue${l.machine_code ? ` ${l.machine_code}` : ''}${l.lote ? ` · Lote ${l.lote}` : ''}`,
      state: 'done',
    })),
    ...transfersToday.map((t) => ({
      id: `transfer-${t.id}`,
      at: t.transferred_at || t.created_at,
      text: `Transferencia${t.lote ? ` · Lote ${t.lote}` : ''}${t.mode ? ` · ${t.mode === 'double' ? 'doble' : 'sencilla'}` : ''}`,
      state: 'done',
    })),
    ...hatchesToday.map((h) => ({
      id: `hatch-${h.id}`,
      at: h.started_at || h.scheduled_at || h.created_at,
      text: `Nacimiento${h.lote ? ` · Lote ${h.lote}` : ''}`,
      state: h.status === 'completed' || h.ended_at ? 'done' : h.status === 'in_progress' ? 'doing' : 'planned',
    })),
  ].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))

  return {
    loads: { done: loadsToday.length, pending: pendingMaps.length },
    transfers: { done: transfersToday.length },
    hatches: { done: hatchesDone.length, total: hatchesToday.length },
    next: next
      ? {
          id: next.id,
          machine: next.machine_name || next.payload?.machineName || 'Máquina por asignar',
          lote: next.payload?.lote || next.payload?.lot || null,
          status: next.status,
        }
      : null,
    timeline,
  }
}

/**
 * Recepción del día: lotes que se esperan hoy (o atrasados sin llegar), los
 * que ya llegaron y el que está «en puerta» (el más próximo sin registrar).
 */
export function receptionDay({ lots = [], arrivals = [], day = localDate() }) {
  const arrivedByLot = new Map()
  for (const a of arrivals) {
    if (!a?.lot_id) continue
    const prev = arrivedByLot.get(a.lot_id)
    if (!prev || String(a.arrived_at || '') > String(prev.arrived_at || '')) arrivedByLot.set(a.lot_id, a)
  }
  const arrivedToday = arrivals.filter((a) => sameDay(a.arrived_at || a.created_at, day))

  const expected = lots
    .filter((l) => l && l.status !== 'cancelled')
    .filter((l) => {
      const exp = String(l.expected_arrival_date || '').slice(0, 10)
      const arrival = arrivedByLot.get(l.id)
      if (arrival) return sameDay(arrival.arrived_at || arrival.created_at, day)
      return !!exp && exp <= day
    })
    .map((l) => {
      const arrival = arrivedByLot.get(l.id) || null
      const exp = String(l.expected_arrival_date || '').slice(0, 10)
      return {
        id: l.id,
        code: l.code || 'Lote',
        origin: l.origin || 'Origen sin registrar',
        postures: Number(l.postures) || null,
        arrival,
        late: !arrival && exp < day,
      }
    })
    .sort((a, b) => Number(!!a.arrival) - Number(!!b.arrival) || Number(b.late) - Number(a.late))

  const atDoor = expected.find((l) => !l.arrival) || null
  return {
    expected,
    atDoor,
    received: arrivedToday.length,
    pending: expected.filter((l) => !l.arrival).length,
  }
}

/**
 * Equipo del supervisor en el turno: quién está programado, quién marcó
 * ingreso, cuántas rondas lleva cada uno contra el ritmo esperado, y quién
 * falta. Sin programación del turno, toma a los turneros que marcaron ingreso.
 */
export function teamOnShift({
  members = [],
  assignments = [],
  attendance = [],
  roundsByUser = {},
  shift,
  shiftDate,
  minRounds = 6,
  now = new Date(),
  shiftRoles = ['operator', 'auxiliary', 'auxiliary_production', 'reception_operator'],
}) {
  const scheduled = new Set(
    assignments
      .filter((a) => !a.is_rest && Number(a.shift_number) === Number(shift) && String(a.work_date || '').slice(0, 10) === shiftDate)
      .map((a) => a.user_id)
  )
  const punchedIn = new Map()
  for (const p of attendance) {
    if (p.punch_type !== 'in') continue
    const prev = punchedIn.get(p.user_id)
    if (!prev || String(p.punched_at) < String(prev.punched_at)) punchedIn.set(p.user_id, p)
  }
  const pace = roundsPace({ done: 0, min: minRounds, shift, now })

  const people = members
    .filter((m) => shiftRoles.includes(m.role))
    .filter((m) => (scheduled.size ? scheduled.has(m.id) : punchedIn.has(m.id)))
    .map((m) => {
      const done = Number(roundsByUser[m.id] || 0)
      const present = punchedIn.has(m.id)
      return {
        id: m.id,
        name: m.name || 'Sin nombre',
        role: m.role,
        present,
        inAt: present ? clock(punchedIn.get(m.id).punched_at) : null,
        rounds: done,
        behind: present && done < pace.expectedNow,
      }
    })
    .sort((a, b) => Number(b.present) - Number(a.present) || a.name.localeCompare(b.name))

  return {
    people,
    present: people.filter((p) => p.present).length,
    total: people.length,
    absent: people.filter((p) => !p.present),
    behind: people.filter((p) => p.behind),
    expectedNow: pace.expectedNow,
  }
}

/** Iniciales para el avatar: «Ana María López» → «AL». */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
