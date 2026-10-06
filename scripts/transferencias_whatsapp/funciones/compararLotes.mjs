/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/compararLotes.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Compara los lotes reportados en el chat con los lotes reales (mapa o cargue).
 * EN: Compares the lots reported in the chat with the real lots (map or load).
 */

/**
 * @param {string[]} reportados ES: lotes del chat. EN: chat lots.
 * @param {string[]} reales ES: lotes del mapa/cargue. EN: map/load lots.
 * @returns {{ estado: 'coincide'|'parcial'|'no_coincide', faltan: string[], sobran: string[] }}
 */
export function compararLotes(reportados, reales) {
  // ES: Conjuntos para comparar sin importar el orden. EN: Sets to compare regardless of order.
  const r = new Set(reportados)
  const b = new Set(reales)
  // ES: Lotes del chat que no estaban en la incubadora. EN: Chat lots not in the setter.
  const faltan = [...r].filter((l) => !b.has(l))
  // ES: Lotes de la incubadora que el chat no menciona (suele ser un carro suelto).
  // EN: Setter lots the chat does not mention (usually a single cart).
  const sobran = [...b].filter((l) => !r.has(l))
  // ES: Todo lo reportado estaba cargado → coincide. EN: Everything reported was loaded → match.
  if (faltan.length === 0) return { estado: 'coincide', faltan, sobran }
  // ES: Algo coincide y algo no → parcial. EN: Some overlap → partial.
  if (faltan.length < r.size) return { estado: 'parcial', faltan, sobran }
  // ES: Nada coincide. EN: Nothing matches.
  return { estado: 'no_coincide', faltan, sobran }
}
