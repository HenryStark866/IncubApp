/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/expandirLotesNacedora.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Convierte el texto corto de una nacedora («44x3,43x1») en una lista de lotes
 *     con su número de carros (null cuando el mensaje no dice cuántos).
 * EN: Turns a hatcher's short text ("44x3,43x1") into a list of lots with their
 *     cart count (null when the message does not say how many).
 */

/**
 * @param {string} texto ES: lotes separados por coma, con «xN» opcional. EN: comma-separated lots, optional "xN".
 * @returns {Array<{ lote: string, carros: number|null }>}
 */
export function expandirLotesNacedora(texto) {
  // ES: Se parte el texto por comas y se descartan vacíos. EN: Split by commas, drop blanks.
  const partes = String(texto ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  // ES: Cada parte es «lote» o «lotexcarros». EN: Each part is "lot" or "lotxcarts".
  return partes.map((parte) => {
    // ES: Lote = dígitos iniciales; carros = dígitos tras la «x». EN: Lot = leading digits; carts = digits after "x".
    const coincide = /^(\d+)(?:x(\d+))?$/i.exec(parte)
    // ES: Formato inválido → error explícito para corregir el dato. EN: Invalid format → explicit error to fix the data.
    if (!coincide) throw new Error(`Lote inválido / invalid lot: «${parte}»`)
    // ES: Se devuelve el lote como texto (así lo guarda la app). EN: Lot returned as text (as the app stores it).
    return { lote: coincide[1], carros: coincide[2] ? Number(coincide[2]) : null }
  })
}
