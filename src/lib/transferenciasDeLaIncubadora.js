/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/transferenciasDeLaIncubadora.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * FECHA / DATE:   06-10-2026
 *
 * ES: Transferencias que pueden cerrar el cargue de una incubadora. Desde el
 *     30-09-2026 la transferencia guarda la incubadora de origen (source_machine_id) y
 *     el lote es «41 + 43»; antes solo se cruzaba por el texto del lote. Se aceptan las
 *     dos, sin repetir, en orden cronológico.
 * EN: Transfers that may close a setter's load. Since 2026-09-30 a transfer stores
 *     its source setter (source_machine_id) and the lot reads "41 + 43"; before, only
 *     the lot text was matched. Both are accepted, de-duplicated, in time order.
 * =============================================================================
 */

/**
 * @param {{ maquinaId: string, porLote?: object[], porOrigen?: Map<string, object[]> }} p
 *   ES: porLote = transferencias con el mismo lote; porOrigen = por incubadora de origen.
 *   EN: porLote = transfers with the same lot; porOrigen = by source setter.
 * @returns {object[]}
 */
export function transferenciasDeLaIncubadora({ maquinaId, porLote = [], porOrigen = new Map() }) {
  // ES: Unión sin duplicados (por id). EN: Union without duplicates (by id).
  const vistas = new Map()
  for (const t of [...porLote, ...(porOrigen.get(maquinaId) || [])]) vistas.set(t.id ?? t, t)
  // ES: Orden cronológico ascendente. EN: Ascending time order.
  return [...vistas.values()].sort((a, b) => new Date(a.transferred_at || 0) - new Date(b.transferred_at || 0))
}
