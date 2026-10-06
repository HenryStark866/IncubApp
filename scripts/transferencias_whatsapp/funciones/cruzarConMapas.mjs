/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/cruzarConMapas.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Cruza cada transferencia del chat con los mapas de cargue reales: busca el mapa
 *     del ciclo que se transfirió (misma incubadora, inicio de ciclo 15 a 23 días antes),
 *     compara lotes, detecta incubadoras cruzadas y recargues anteriores al reporte.
 * EN: Cross-checks each chat transfer against the real load maps: finds the map of the
 *     transferred cycle (same setter, cycle start 15 to 23 days before), compares lots,
 *     detects swapped setters and reloads that happened before the report.
 */
import { compararLotes } from './compararLotes.mjs'

// ES: Un día en milisegundos. EN: One day in milliseconds.
const DIA = 86_400_000
// ES: Ventana del ciclo transferido (días entre inicio de ciclo y transferencia).
// EN: Window of the transferred cycle (days between cycle start and transfer).
const MIN_DIAS = 15
const MAX_DIAS = 23

/**
 * @param {object[]} transferencias ES: normalizadas. EN: normalized.
 * @param {object[]} mapas ES: de leerMapasDeCargue. EN: from leerMapasDeCargue.
 * @returns {object[]} ES: un resultado por transferencia. EN: one result per transfer.
 */
export function cruzarConMapas(transferencias, mapas) {
  // ES: Solo mapas que fueron un cargue físico. EN: Only maps that were a physical load.
  const validos = mapas.filter((m) => !m.descartado && m.inicioCiclo)
  // ES: Primera fecha cubierta por la exportación de mapas. EN: First date covered by the export.
  const cubreDesde = Math.min(...validos.map((m) => Date.parse(m.inicioCiclo))) + MIN_DIAS * DIA
  return transferencias.map((t) => {
    // ES: Instante de la transferencia. EN: Transfer instant.
    const en = Date.parse(t.transferidoEn)
    // ES: Días de ciclo de un mapa a la fecha de la transferencia. EN: Cycle days of a map at transfer time.
    const dias = (m) => (en - Date.parse(m.inicioCiclo)) / DIA
    // ES: Mapas cuyo ciclo cae en la ventana. EN: Maps whose cycle falls in the window.
    const enVentana = validos.filter((m) => dias(m) >= MIN_DIAS && dias(m) <= MAX_DIAS)
    // ES: El mapa de la misma incubadora. EN: The same setter's map.
    const propio = enVentana.find((m) => m.codigo === t.incubadora) ?? null
    // ES: Recargue de la misma incubadora antes del reporte (la transferencia fue antes).
    // EN: Same-setter reload before the report (the transfer happened earlier).
    const recargue = validos.find((m) => m.codigo === t.incubadora && Date.parse(m.cargadoEn) < en && dias(m) < MIN_DIAS) ?? null
    // ES: Resultado base. EN: Base result.
    const r = { clave: t.clave, incubadora: t.incubadora, transferidoEn: t.transferidoEn, lotesChat: t.lotes, mapa: null, recargue: null, candidatos: [] }
    // ES: Antes de septiembre no hay mapas exportados para comparar. EN: No exported maps before September.
    if (en < cubreDesde) return { ...r, estado: 'sin_mapa_exportado' }
    // ES: Recargue detectado → la hora reportada no puede ser la real. EN: Reload found → reported time cannot be real.
    if (recargue) r.recargue = { mapa: recargue.id, cargadoEn: recargue.cargadoEn, lotes: recargue.lotes }
    // ES: Sin mapa propio en la ventana. EN: No own map in the window.
    if (!propio) return { ...r, estado: recargue ? 'recargada_antes_del_reporte' : 'sin_mapa_del_ciclo' }
    // ES: Comparación de lotes con el mapa propio. EN: Lot comparison with the own map.
    const cmp = compararLotes(t.lotes, propio.lotes)
    r.mapa = { id: propio.id, inicioCiclo: propio.inicioCiclo, dias: Number(dias(propio).toFixed(1)), lotes: propio.lotes, ...cmp }
    // ES: Si no coincide, ¿qué otra incubadora del mismo ciclo sí tenía esos lotes?
    // EN: If it doesn't match, which other setter of the same cycle had those lots?
    if (cmp.estado !== 'coincide') {
      // ES: Solo incubadoras cargadas el mismo día (±1,5 días): las que se pudieron confundir.
      // EN: Only setters loaded the same day (±1.5 days): the ones that could be mixed up.
      const mismoDia = (m) => Math.abs(Date.parse(m.inicioCiclo) - Date.parse(propio.inicioCiclo)) <= 1.5 * DIA
      r.candidatos = enVentana
        .filter((m) => m.codigo !== t.incubadora && mismoDia(m) && compararLotes(t.lotes, m.lotes).estado === 'coincide')
        .map((m) => ({ incubadora: m.codigo, inicioCiclo: m.inicioCiclo, lotes: m.lotes }))
    }
    return { ...r, estado: cmp.estado }
  })
}
