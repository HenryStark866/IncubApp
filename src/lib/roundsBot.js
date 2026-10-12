/**
 * =============================================================================
 * ARCHIVO: src/lib/roundsBot.js
 * PROPÓSITO: Bot de rondas desde EagleTrax (12-10-2026, pedido de planta).
 *   El bot entra al PC de EagleTrax cada hora, toma el pantallazo de cada máquina y lo
 *   sube como ronda (machine_checks con la nota «[bot-eagletrax]»); el lector de fotos
 *   llena temperatura, humedad, CO₂ y volteos como con cualquier foto.
 *   Con el bot reportando, el operario de turno solo hace la ronda de RECIBIR EL TURNO.
 *   Si el bot deja de reportar (PC apagado, EagleTrax cerrado), la exigencia vuelve sola
 *   a las rondas de siempre para que la planta nunca quede sin rondas.
 * =============================================================================
 */

export const BOT_TAG = '[bot-eagletrax]'
/** El bot cuenta como activo si reportó en las últimas 2 horas */
export const BOT_ACTIVE_WINDOW_H = 2
/** Con el bot activo el operario solo debe la ronda de recibir el turno */
export const ROUNDS_WITH_BOT = 1

export const isBotCheck = (c) => String(c?.notes || '').startsWith(BOT_TAG)

/** ¿El bot reportó hace poco? */
export function isBotActive(checks = [], now = Date.now()) {
  const since = now - BOT_ACTIVE_WINDOW_H * 3_600_000
  return checks.some((c) => isBotCheck(c) && Date.parse(c.taken_at || '') >= since)
}

/** Rondas exigidas por turno al operario según si el bot está reportando */
export function roundsRequired(baseRounds, botActive) {
  return botActive ? Math.min(ROUNDS_WITH_BOT, baseRounds) : baseRounds
}

/** Última hora que reportó el bot y cuántas máquinas cubrió */
export function botStatus(checks = [], now = Date.now()) {
  const bot = checks.filter(isBotCheck).sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)))
  if (!bot.length) return { active: false, last: null, machines: 0 }
  const last = bot[0].taken_at
  const hour = Date.parse(last) - 3_600_000
  const machines = new Set(bot.filter((c) => Date.parse(c.taken_at) > hour).map((c) => c.machine_id)).size
  return { active: isBotActive(checks, now), last, machines }
}
