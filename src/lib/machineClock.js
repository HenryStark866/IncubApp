/**
 * =============================================================================
 * ARCHIVO: src/lib/machineClock.js
 * PROPÓSITO: El reloj del ciclo que muestra la pantalla de cada incubadora («18d 20h 49'»),
 *   leído de los pantallazos del bot de EagleTrax y de las fotos de ronda
 *   (machine_checks.cycle_age_minutes). La máquina es la verdad sobre cuándo empezó su ciclo:
 *     inicio real = hora de la foto − reloj.
 *   Se compara con lo registrado en la app para avisar:
 *     - cargue sin registrar (la pantalla corre un ciclo y la app la tiene vacía);
 *     - inicio que no cuadra (más de 12 h de diferencia);
 *     - día real del ciclo, para pedir la transferencia a tiempo (día 18).
 *   13-10-2026.
 * =============================================================================
 */

const H = 3_600_000
const DAY = 24 * H
/** Una lectura de reloj sirve si es de las últimas 3 horas */
export const CLOCK_FRESH_H = 3
/** Diferencia que se considera «no cuadra» */
export const CLOCK_MISMATCH_H = 12

const ms = (v) => {
  const t = Date.parse(v || '')
  return Number.isNaN(t) ? null : t
}

/** «18d 20h» */
export function clockLabel(minutes) {
  if (minutes == null) return '—'
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  return `${d}d ${h}h`
}

/**
 * Último reloj fresco de cada máquina.
 * @returns {Map<string, { ageMin: number, startAt: number, takenAt: string, day: number }>}
 */
export function latestClocks(checks = [], now = Date.now()) {
  const out = new Map()
  for (const c of checks) {
    const t = ms(c.taken_at)
    const age = Number(c.cycle_age_minutes)
    if (t == null || !Number.isFinite(age) || now - t > CLOCK_FRESH_H * H) continue
    const prev = out.get(c.machine_id)
    if (prev && ms(prev.takenAt) >= t) continue
    const ageNow = age + (now - t) / 60000
    out.set(c.machine_id, { ageMin: Math.round(ageNow), startAt: t - age * 60000, takenAt: c.taken_at, day: ageNow / 1440 })
  }
  return out
}

/**
 * Compara el reloj de la máquina con su estado en la app (computeAllMachineStates).
 * @returns {{ kind: 'sin_registro'|'no_cuadra'|'ok', clock: object, appStart: number|null, diffH: number|null } | null}
 */
export function compareClock(clock, state) {
  if (!clock) return null
  const running = state && ['incubating', 'calib_window', 'transfer_ready'].includes(state.phase)
  // Una pantalla que marca menos de 12 h puede ser una máquina recién vaciada con el reloj
  // corriendo: no se toma como cargue hasta que pase de medio día.
  if (!running) return clock.ageMin >= 12 * 60 && clock.day < 22 ? { kind: 'sin_registro', clock, appStart: null, diffH: null } : null
  const appStart = ms(state.cycle_start_at)
  if (appStart == null) return { kind: 'no_cuadra', clock, appStart: null, diffH: null }
  const diffH = (appStart - clock.startAt) / H
  return Math.abs(diffH) > CLOCK_MISMATCH_H ? { kind: 'no_cuadra', clock, appStart, diffH } : { kind: 'ok', clock, appStart, diffH }
}

export { DAY }
