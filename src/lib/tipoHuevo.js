/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/tipoHuevo.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * FECHA / DATE:   06-10-2026
 *
 * ES: Significado del «tipo de huevo» (1 a 5) en Incubant, confirmado por planta el
 *     06-10-2026: el tipo indica la EDAD DEL LOTE de aves, no el tamaño. 1 y 2 = lotes
 *     viejos; 5 = lote muy joven. El huevo de lote viejo es el más grande y el de lote
 *     joven el más pequeño, así que el tamaño (masa → calor en el día 15-18) va al revés
 *     del número. Antes IncubApp tomaba el 5 como «huevo más grande».
 * EN: Meaning of the "egg type" (1 to 5) at Incubant, confirmed by the plant on
 *     2026-10-06: the type is the FLOCK AGE, not the size. 1 and 2 = old flocks;
 *     5 = very young flock. Old-flock eggs are the largest and young-flock eggs the
 *     smallest, so size (mass → heat on days 15-18) runs opposite to the number.
 *     IncubApp used to read 5 as "largest egg".
 * =============================================================================
 */

/** ES: Edad del lote por tipo. EN: Flock age by type. */
export const EDAD_POR_TIPO_HUEVO = {
  1: 'Lote viejo',
  2: 'Lote viejo',
  3: 'Edad media',
  4: 'Lote joven',
  5: 'Lote muy joven',
}

/**
 * ES: Texto corto para mostrar el tipo: «Tipo 5 · muy joven».
 * EN: Short display text for the type: "Tipo 5 · muy joven".
 * @param {number|null|undefined} tipo
 * @returns {string}
 */
export function etiquetaTipoHuevo(tipo) {
  // ES: Sin tipo válido no hay etiqueta. EN: No valid type, no label.
  const edad = EDAD_POR_TIPO_HUEVO[tipo]
  if (!edad) return 'Sin tipo'
  // ES: «Lote viejo» → «viejo». EN: "Lote viejo" → "viejo".
  return `Tipo ${tipo} · ${edad.replace(/^Lote /, '').toLowerCase()}`
}

/**
 * ES: Tamaño relativo del huevo según el tipo (0 = el más pequeño, 1 = el más grande).
 *     Tipo 1 (lote viejo) → 1; tipo 5 (lote muy joven) → 0.
 * EN: Relative egg size from the type (0 = smallest, 1 = largest).
 *     Type 1 (old flock) → 1; type 5 (very young flock) → 0.
 * @param {number|null|undefined} tipo
 * @returns {number|null} ES: null si no hay tipo. EN: null when there is no type.
 */
export function tamanoRelativoPorTipo(tipo) {
  // ES: Solo tipos 1 a 5. EN: Types 1 to 5 only.
  const n = Number(tipo)
  if (!Number.isInteger(n) || n < 1 || n > 5) return null
  // ES: Escala invertida: a menor número, lote más viejo y huevo más grande.
  // EN: Inverted scale: the lower the number, the older the flock and the larger the egg.
  return (5 - n) / 4
}
