/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/ajustarHoraPorRecargue.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Si el mapa de cargue real muestra que la incubadora se volvió a cargar ANTES de la
 *     hora del reporte, la transferencia tuvo que ser antes de ese cargue. Se deja una
 *     hora antes del recargue para que la app no tome el huevo nuevo como transferido.
 * EN: If the real load map shows the setter was reloaded BEFORE the report time, the
 *     transfer must have happened before that load. It is set one hour before the
 *     reload so the app does not treat the new eggs as transferred.
 */

/**
 * @param {object} transferencia ES: normalizada. EN: normalized.
 * @param {object|undefined} cruce ES: resultado de cruzarConMapas. EN: cruzarConMapas result.
 * @returns {object} ES: transferencia (ajustada si aplica). EN: transfer (adjusted if needed).
 */
export function ajustarHoraPorRecargue(transferencia, cruce) {
  // ES: Sin recargue no hay nada que ajustar. EN: No reload, nothing to adjust.
  if (!cruce?.recargue?.cargadoEn) return transferencia
  // ES: Una hora antes del recargue. EN: One hour before the reload.
  const ajustada = new Date(Date.parse(cruce.recargue.cargadoEn) - 3_600_000)
  // ES: Solo si queda antes de lo reportado. EN: Only if earlier than reported.
  if (ajustada.getTime() >= Date.parse(transferencia.transferidoEn)) return transferencia
  // ES: Se conserva la fecha reportada para el registro. EN: Keep the reported date for the record.
  return { ...transferencia, transferidoEn: ajustada.toISOString(), horaAjustadaDesde: transferencia.transferidoEn }
}
