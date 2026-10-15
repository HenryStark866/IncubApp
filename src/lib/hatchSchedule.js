/**
 * =============================================================================
 * ARCHIVO: src/lib/hatchSchedule.js
 * PROPÓSITO: La rotación fija de la planta (12-10-2026, definida por planta):
 *   - Se carga la incubadora (inicio del ciclo, normalmente en la noche).
 *   - Día 18: se transfiere a nacedoras y, DESPUÉS de transferir, se calibran.
 *   - Día 21: nacimiento.
 *   - Los nacimientos son lunes, martes, jueves y viernes. Casi siempre nacen dos
 *     salas de nacedoras completas (lo de dos incubadoras); a veces una sola.
 * 21 días son tres semanas exactas: el cargue cae la noche anterior al día de
 * nacimiento de esa semana (domingo, lunes, miércoles o jueves en la noche).
 * =============================================================================
 */

export const TRANSFER_DAY = 18
export const HATCH_DAY = 21
/** 0 = domingo … 6 = sábado (getDay) */
export const HATCH_WEEKDAYS = [1, 2, 4, 5]
export const HATCH_WEEKDAY_LABEL = 'lunes, martes, jueves y viernes'
/** Salas de nacedoras que nacen un día normal (una por incubadora cargada) */
export const ROOMS_PER_HATCH_DAY = 2

const DAY = 86_400_000
const TZ = 'America/Bogota'
/** El ciclo empieza de noche: el nacimiento se saca en la mañana siguiente al día 21 */
const HATCH_PULL_OFFSET_H = 10

const ms = (v) => {
  const t = typeof v === 'number' ? v : Date.parse(v || '')
  return Number.isNaN(t) ? null : t
}

/** Fecha (YYYY-MM-DD) en Bogotá */
export const dayKey = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ })

/** Día de la semana (0-6) de una fecha YYYY-MM-DD */
export const weekdayOf = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay()

export const isHatchDay = (ymd) => HATCH_WEEKDAYS.includes(weekdayOf(ymd))

/** Primer día de nacimiento en o después de la fecha dada */
export function nextHatchDay(ymd) {
  let t = Date.parse(`${ymd}T12:00:00Z`)
  for (let i = 0; i < 7; i++) {
    const d = new Date(t).toISOString().slice(0, 10)
    if (isHatchDay(d)) return d
    t += DAY
  }
  return ymd
}

/**
 * Calendario de un ciclo a partir de su inicio (o del cargue).
 * @returns {{ transferAt: string, hatchAt: string, hatchDate: string, expectedDate: string, onSchedule: boolean } | null}
 *   expectedDate: el día que da la cuenta de 21 días; hatchDate: el día de nacimiento
 *   real de la planta (el mismo, o el siguiente lunes/martes/jueves/viernes si cayó fuera).
 */
export function cycleSchedule(cycleStart) {
  const start = ms(cycleStart)
  if (start == null) return null
  const transferAt = start + TRANSFER_DAY * DAY
  const pull = start + HATCH_DAY * DAY + HATCH_PULL_OFFSET_H * 3_600_000
  const expectedDate = dayKey(pull)
  const hatchDate = nextHatchDay(expectedDate)
  return {
    transferAt: new Date(transferAt).toISOString(),
    hatchAt: new Date(start + HATCH_DAY * DAY).toISOString(),
    expectedDate,
    hatchDate,
    onSchedule: hatchDate === expectedDate,
  }
}

/** Hora a la que se programa el nacimiento (04:00 del día de nacimiento, Bogotá: la planta saca a las 4 am) */
export function hatchScheduledAt(hatchDate) {
  return new Date(`${hatchDate}T04:00:00-05:00`).toISOString()
}

/**
 * ¿Cuántas salas nacen ese día y cómo se ve contra lo normal?
 * @returns {'normal'|'una'|'revisar'|'vacio'}
 */
export function roomsLoadStatus(rooms) {
  if (!rooms) return 'vacio'
  if (rooms === ROOMS_PER_HATCH_DAY) return 'normal'
  if (rooms === 1) return 'una'
  return 'revisar'
}
