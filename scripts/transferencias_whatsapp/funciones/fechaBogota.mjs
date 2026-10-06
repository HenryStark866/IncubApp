/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/fechaBogota.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Convierte «2026-07-14T05:06» (hora local de Bogotá) a un instante absoluto.
 * EN: Converts "2026-07-14T05:06" (Bogota local time) into an absolute instant.
 */

/**
 * @param {string} local ES: fecha y hora sin zona. EN: date-time without zone.
 * @returns {string} ES: ISO con zona -05:00. EN: ISO with -05:00 zone.
 */
export function fechaBogota(local) {
  // ES: Bogotá no tiene horario de verano: siempre -05:00. EN: Bogota has no DST: always -05:00.
  const iso = `${local}:00-05:00`
  // ES: Se valida que la fecha exista. EN: Validate that the date exists.
  if (Number.isNaN(Date.parse(iso))) throw new Error(`Fecha inválida / invalid date: ${local}`)
  // ES: Se devuelve el texto ISO con zona. EN: Return the zoned ISO text.
  return iso
}
