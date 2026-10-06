/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/transferenciasPorNacer.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * FECHA / DATE:   06-10-2026
 *
 * ES: Transferencias «listas para nacimiento»: sin nacimiento registrado y de los
 *     últimos días (el pollito nace ~3 días después de la transferencia). Evita que el
 *     histórico importado del WhatsApp (julio a octubre) aparezca como pendiente.
 * EN: Transfers "ready to hatch": without a recorded hatch and from the last few days
 *     (chicks hatch ~3 days after transfer). Keeps the WhatsApp history imported
 *     (July to October) from showing up as pending.
 * =============================================================================
 */

// ES: Un día en milisegundos. EN: One day in milliseconds.
const DIA = 86_400_000

// ES: Días máximos desde la transferencia para seguir esperando el nacimiento.
// EN: Max days since transfer to still be waiting for the hatch.
export const DIAS_MAX_ESPERA_NACIMIENTO = 6

/**
 * @param {object[]} transferencias ES: filas de transfers. EN: transfers rows.
 * @param {Set<string>} usadas ES: ids con nacimiento ya registrado. EN: ids with a recorded hatch.
 * @param {number} [ahora] ES: instante actual (ms). EN: current instant (ms).
 * @param {number} [diasMax] ES: ventana en días. EN: window in days.
 * @returns {object[]}
 */
export function transferenciasPorNacer(transferencias = [], usadas = new Set(), ahora = Date.now(), diasMax = DIAS_MAX_ESPERA_NACIMIENTO) {
  // ES: Límite inferior de la ventana. EN: Window lower bound.
  const desde = ahora - diasMax * DIA
  return transferencias.filter((t) => {
    // ES: Ya tiene nacimiento → no está pendiente. EN: Already hatched → not pending.
    if (usadas.has(t.id)) return false
    // ES: Fecha de la transferencia (o de creación si falta). EN: Transfer date (or creation if missing).
    const en = Date.parse(t.transferred_at || t.created_at || '')
    // ES: Sin fecha válida se muestra para no esconder datos. EN: No valid date → shown, so nothing is hidden.
    if (Number.isNaN(en)) return true
    // ES: Solo las recientes. EN: Only recent ones.
    return en >= desde
  })
}
