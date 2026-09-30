/**
 * Puntualidad del turno: compara las marcas de ingreso/salida con el horario
 * del turno asignado y los márgenes que fija el coordinador.
 *
 * Turnos (hora de Colombia, UTC−5 sin horario de verano):
 *   T1 06:00–14:00 · T2 14:00–22:00 · T3 22:00–06:00 (del día siguiente)
 * El turno pertenece a la fecha en que inicia (igual que useMachineChecks).
 *
 * Adherencia por turno (0–100): la llegada vale 50 y la salida 50.
 *   dentro del margen = 50 · fuera del margen = 25 · sin marca = 0
 *
 * Henry Stark Desarrollador
 */

export const SHIFT_WINDOWS = {
  1: { start: '06:00', end: '14:00' },
  2: { start: '14:00', end: '22:00' },
  3: { start: '22:00', end: '06:00' },
}

/** Claves en performance_targets donde el coordinador guarda los márgenes (minutos). */
export const MARGIN_KEYS = { in: 'margin_in_min', out: 'margin_out_min' }

export const DEFAULT_MARGINS = { inMin: 10, outMin: 10 }

/** Una marca se asocia al turno cuyo inicio esté a menos de estas horas. */
const MATCH_WINDOW_MS = 6 * 3600000

/** Pasado este tiempo tras el fin del turno sin salida, la salida cuenta como no marcada. */
const MISSING_OUT_AFTER_MS = 4 * 3600000

const BOGOTA_OFFSET = '-05:00'

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const bogotaYmd = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

export const bogotaHm = (d) =>
  new Date(d).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

export const isMarginKey = (key) => key === MARGIN_KEYS.in || key === MARGIN_KEYS.out

/** Inicio y fin absolutos del turno `shiftNumber` que arranca el día `workDate` (YYYY-MM-DD). */
export function shiftBounds(workDate, shiftNumber) {
  const w = SHIFT_WINDOWS[shiftNumber]
  if (!w || !workDate) return null
  const start = new Date(`${workDate}T${w.start}:00${BOGOTA_OFFSET}`)
  const endDate = shiftNumber === 3 ? addDays(workDate, 1) : workDate
  const end = new Date(`${endDate}T${w.end}:00${BOGOTA_OFFSET}`)
  return { start, end }
}

/**
 * Márgenes que aplican a una persona: los de su usuario pisan los de su rol,
 * y los del rol pisan los globales. Sin metas, los de fábrica.
 */
export function readMargins(targets = [], member = {}) {
  const out = { ...DEFAULT_MARGINS }
  const pick = (key) => {
    const rows = targets.filter((t) => t.labor_key === key && t.active !== false)
    return (
      rows.find((t) => member.id && t.user_id === member.id) ||
      rows.find((t) => !t.user_id && member.role && t.role === member.role) ||
      rows.find((t) => !t.user_id && !t.role)
    )
  }
  const tin = pick(MARGIN_KEYS.in)
  const tout = pick(MARGIN_KEYS.out)
  if (tin && Number.isFinite(Number(tin.expected))) out.inMin = Math.max(0, Number(tin.expected))
  if (tout && Number.isFinite(Number(tout.expected))) out.outMin = Math.max(0, Number(tout.expected))
  return out
}

/**
 * Turno al que corresponde un ingreso: el asignado cuyo inicio quede más cerca
 * (±6 h). Si no hay asignación, el turno estándar más cercano (inferred = true).
 * En empate gana el que ya había empezado: llegar a mitad de turno es llegar tarde.
 */
export function matchShift(inAt, userAssignments = []) {
  const t = new Date(inAt).getTime()
  const day = bogotaYmd(inAt)
  const days = [addDays(day, -1), day, addDays(day, 1)]

  const closest = (cands) => {
    let best = null
    for (const c of cands) {
      const b = shiftBounds(c.date, c.shiftNumber)
      if (!b) continue
      const dist = Math.abs(t - b.start.getTime())
      const better =
        !best || dist < best.dist || (dist === best.dist && b.start.getTime() < best.start.getTime())
      if (better) best = { ...c, ...b, dist }
    }
    return best && best.dist <= MATCH_WINDOW_MS ? best : null
  }

  const assigned = closest(
    userAssignments
      .filter((a) => !a.is_rest && a.shift_number && days.includes(String(a.work_date).slice(0, 10)))
      .map((a) => ({ date: String(a.work_date).slice(0, 10), shiftNumber: Number(a.shift_number) }))
  )
  if (assigned) return { date: assigned.date, shiftNumber: assigned.shiftNumber, start: assigned.start, end: assigned.end, inferred: false }

  const generic = closest(days.flatMap((date) => [1, 2, 3].map((shiftNumber) => ({ date, shiftNumber }))))
  if (!generic) return null
  return { date: generic.date, shiftNumber: generic.shiftNumber, start: generic.start, end: generic.end, inferred: true }
}

/** Empareja las marcas de una persona: cada ingreso con la siguiente salida. */
export function pairPunches(punches = []) {
  const sorted = [...punches]
    .filter((p) => p?.punched_at && (p.punch_type === 'in' || p.punch_type === 'out'))
    .sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at))
  const sessions = []
  let open = null
  for (const p of sorted) {
    if (p.punch_type === 'in') {
      if (open) sessions.push({ inAt: open.punched_at, outAt: null })
      open = p
    } else if (open) {
      sessions.push({ inAt: open.punched_at, outAt: p.punched_at })
      open = null
    }
  }
  if (open) sessions.push({ inAt: open.punched_at, outAt: null })
  return sessions
}

const minutesBetween = (a, b) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60000)

/**
 * Evalúa un turno ya emparejado.
 * inDeltaMin > 0 = llegó tarde; outDeltaMin < 0 = salió antes.
 */
export function evaluateShift({ shift, inAt, outAt, margins = DEFAULT_MARGINS, now = new Date() }) {
  const nowMs = new Date(now).getTime()
  let inStatus = 'absent'
  let inDeltaMin = null
  if (inAt) {
    inDeltaMin = minutesBetween(inAt, shift.start)
    inStatus = inDeltaMin <= margins.inMin ? 'on_time' : 'late'
  }

  let outStatus
  let outDeltaMin = null
  if (outAt) {
    outDeltaMin = minutesBetween(outAt, shift.end)
    outStatus = outDeltaMin >= -margins.outMin ? 'on_time' : 'early'
  } else if (inAt && nowMs < shift.end.getTime() + MISSING_OUT_AFTER_MS) {
    outStatus = 'open'
  } else {
    outStatus = 'missing'
  }

  const pts = { on_time: 50, late: 25, early: 25 }
  const adherence = (pts[inStatus] || 0) + (pts[outStatus] || 0)
  return { inStatus, inDeltaMin, outStatus, outDeltaMin, adherence }
}

/** «12 min tarde», «5 min antes», «a la hora». */
export function describeDelta(min, { lateWord = 'tarde', earlyWord = 'antes' } = {}) {
  if (min == null) return ''
  if (min === 0) return 'a la hora'
  const abs = Math.abs(min)
  const txt = abs >= 60 ? `${Math.floor(abs / 60)} h ${abs % 60 ? `${abs % 60} min` : ''}`.trim() : `${abs} min`
  return `${txt} ${min > 0 ? lateWord : earlyWord}`
}

/** Frase corta para la evidencia del turno. */
export function describeShiftResult(r, { withShift = true } = {}) {
  if (!r) return ''
  const parts = withShift ? [`T${r.shiftNumber}${r.inferred ? ' (inferido)' : ''}`] : []
  if (r.inStatus === 'absent') parts.push('sin ingreso')
  else parts.push(`llegó ${bogotaHm(r.inAt)} (${r.inStatus === 'late' ? describeDelta(r.inDeltaMin) : 'a tiempo'})`)
  if (r.outStatus === 'open') parts.push('en turno')
  else if (r.outStatus === 'missing') {
    if (r.inStatus !== 'absent') parts.push('sin salida')
  }
  else
    parts.push(
      `salió ${bogotaHm(r.outAt)} (${r.outStatus === 'early' ? describeDelta(r.outDeltaMin, { earlyWord: 'antes', lateWord: 'después' }) : 'a tiempo'})`
    )
  return parts.join(' · ')
}

/**
 * Puntualidad de todas las personas en un rango.
 * @param {object} p
 * @param {Array} p.punches attendance_punches (user_id, punch_type, punched_at)
 * @param {Array} p.assignments shift_assignments (user_id, work_date, shift_number, is_rest)
 * @param {(userId: string) => {inMin:number,outMin:number}} [p.marginsFor]
 * @param {Date} [p.now]
 * @param {string} [p.from] YYYY-MM-DD (incluido)
 * @param {string} [p.to] YYYY-MM-DD (incluido)
 * @param {Set<string>} [p.userIds] solo estas personas
 * @returns {Array} un resultado por persona × turno, con `date` = día en que inicia el turno
 *   y `punchTimes` = las marcas (punched_at) que se contaron en ese turno.
 *   Los turnos asignados ya vencidos sin ninguna marca salen como ausencia (adherence 0).
 */
export function buildPunctuality({
  punches = [],
  assignments = [],
  marginsFor = () => DEFAULT_MARGINS,
  now = new Date(),
  from,
  to,
  userIds,
}) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to)
  const allowed = (uid) => uid && (!userIds || userIds.has(uid))

  const punchesBy = new Map()
  for (const p of punches) {
    if (!allowed(p.user_id)) continue
    if (!punchesBy.has(p.user_id)) punchesBy.set(p.user_id, [])
    punchesBy.get(p.user_id).push(p)
  }
  const assignBy = new Map()
  for (const a of assignments) {
    if (!allowed(a.user_id)) continue
    if (!assignBy.has(a.user_id)) assignBy.set(a.user_id, [])
    assignBy.get(a.user_id).push(a)
  }

  const results = new Map()
  for (const [uid, list] of punchesBy) {
    const userAssign = assignBy.get(uid) || []
    for (const s of pairPunches(list)) {
      const shift = matchShift(s.inAt, userAssign)
      if (!shift || !inRange(shift.date)) continue
      const key = `${uid}|${shift.date}|${shift.shiftNumber}`
      const prev = results.get(key)
      // Varias entradas/salidas en el mismo turno: cuenta la primera llegada y la última salida.
      const inAt = prev && new Date(prev.inAt) < new Date(s.inAt) ? prev.inAt : s.inAt
      const outAt =
        prev?.outAt && (!s.outAt || new Date(prev.outAt) > new Date(s.outAt)) ? prev.outAt : s.outAt
      const punchTimes = [...(prev?.punchTimes || []), s.inAt, ...(s.outAt ? [s.outAt] : [])]
      results.set(key, { userId: uid, date: shift.date, shiftNumber: shift.shiftNumber, inferred: shift.inferred, start: shift.start, end: shift.end, inAt, outAt, punchTimes })
    }
  }

  // Ausencias: turnos asignados ya terminados sin ningún ingreso.
  const nowMs = new Date(now).getTime()
  for (const [uid, list] of assignBy) {
    for (const a of list) {
      if (a.is_rest || !a.shift_number) continue
      const date = String(a.work_date).slice(0, 10)
      if (!inRange(date)) continue
      const key = `${uid}|${date}|${Number(a.shift_number)}`
      if (results.has(key)) continue
      const b = shiftBounds(date, Number(a.shift_number))
      if (!b || b.end.getTime() > nowMs) continue
      results.set(key, { userId: uid, date, shiftNumber: Number(a.shift_number), inferred: false, ...b, inAt: null, outAt: null, punchTimes: [] })
    }
  }

  return [...results.values()]
    .map((r) => ({ ...r, ...evaluateShift({ shift: r, inAt: r.inAt, outAt: r.outAt, margins: marginsFor(r.userId), now }), margins: marginsFor(r.userId) }))
    .sort((a, b) => (a.date === b.date ? a.shiftNumber - b.shiftNumber : a.date < b.date ? -1 : 1))
}
