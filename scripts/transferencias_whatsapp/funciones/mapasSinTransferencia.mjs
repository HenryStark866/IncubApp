/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/mapasSinTransferencia.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Cargues reales (mapas) que no tienen transferencia reportada: los que ya debían
 *     salir (más de 19 días) quedan como «sin reporte»; los demás siguen incubando.
 * EN: Real loads (maps) without a reported transfer: those already due (over 19 days)
 *     are "unreported"; the rest are still incubating.
 */

// ES: Un día en milisegundos. EN: One day in milliseconds.
const DIA = 86_400_000

/**
 * @param {object[]} mapas ES: de leerMapasDeCargue. EN: from leerMapasDeCargue.
 * @param {object[]} transferencias ES: normalizadas. EN: normalized.
 * @param {Date} ahora ES: fecha de corte. EN: cut-off date.
 */
export function mapasSinTransferencia(mapas, transferencias, ahora) {
  return mapas
    // ES: Solo cargues físicos. EN: Physical loads only.
    .filter((m) => !m.descartado && m.inicioCiclo)
    .map((m) => {
      // ES: Inicio del ciclo de este mapa. EN: This map's cycle start.
      const ini = Date.parse(m.inicioCiclo)
      // ES: ¿Alguna transferencia de esa incubadora 15 a 23 días después? EN: Any transfer 15-23 days later?
      const t = transferencias.find((x) => x.incubadora === m.codigo && (Date.parse(x.transferidoEn) - ini) / DIA >= 15 && (Date.parse(x.transferidoEn) - ini) / DIA <= 23)
      // ES: Días de ciclo a la fecha de corte. EN: Cycle days at cut-off.
      const dias = (ahora.getTime() - ini) / DIA
      return { mapa: m.id, incubadora: m.codigo, inicioCiclo: m.inicioCiclo, lotes: m.lotes, dias: Number(dias.toFixed(1)), transferencia: t?.clave ?? null }
    })
    // ES: Se quedan los que no tienen transferencia. EN: Keep the ones without transfer.
    .filter((x) => !x.transferencia)
    // ES: Estado según la edad del huevo. EN: Status by egg age.
    .map((x) => ({ ...x, estado: x.dias >= 19 ? 'sin_reporte' : 'incubando' }))
}
