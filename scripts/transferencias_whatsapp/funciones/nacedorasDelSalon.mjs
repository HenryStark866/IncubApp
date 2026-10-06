/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/nacedorasDelSalon.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Números de nacedora de cada salón en la planta de Incubant:
 *     salón 1 → 1, 2, 3 · salón 2 → 4, 5, 6 · salón 3 → 7, 8, 9 · salón 4 → 10, 11, 12.
 * EN: Hatcher numbers of each room at the Incubant plant:
 *     room 1 → 1, 2, 3 · room 2 → 4, 5, 6 · room 3 → 7, 8, 9 · room 4 → 10, 11, 12.
 */

/**
 * @param {number} salon ES: número de salón (1..4). EN: room number (1..4).
 * @returns {number[]} ES: las tres nacedoras del salón. EN: the room's three hatchers.
 */
export function nacedorasDelSalon(salon) {
  // ES: Solo existen cuatro salones de nacedoras. EN: Only four hatcher rooms exist.
  if (!Number.isInteger(salon) || salon < 1 || salon > 4) throw new Error(`Salón inválido / invalid room: ${salon}`)
  // ES: La primera nacedora del salón es 3·(salón−1)+1. EN: The room's first hatcher is 3·(room−1)+1.
  const primera = (salon - 1) * 3 + 1
  // ES: Se devuelven las tres consecutivas. EN: Return the three consecutive ones.
  return [primera, primera + 1, primera + 2]
}
