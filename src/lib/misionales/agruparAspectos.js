/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/misionales/agruparAspectos.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Convierte los aspectos guardados en la inspección en las filas del formato
 *     FOSST22: criterio (agrupado como en el papel), sub-ítem, calificación,
 *     observación y acción correctiva.
 * EN: Turns the inspection's stored aspects into FOSST22 rows: criterion (grouped
 *     as on paper), sub-item, grade, observation and corrective action.
 * =============================================================================
 */
import { CRITERIOS_FOSST22 } from './formatoFosst22'

/**
 * @param {Record<string, {valor:string,label:string,obs?:string,accion?:string}|string>} aspectos
 * @param {string[]} lista ES: etiquetas del catálogo en orden. EN: catalog labels in order.
 * @returns {Array<{criterio:string, sub:string, valor:string, obs:string, accion:string}>}
 */
export function agruparAspectos(aspectos = {}, lista = []) {
  return lista.map((etiqueta, i) => {
    // ES: Lo guardado para este aspecto (objeto nuevo o letra suelta antigua).
    // EN: What was stored for this aspect (new object or old bare letter).
    const guardado = aspectos[String(i + 1)]
    const dato = typeof guardado === 'object' && guardado ? guardado : { valor: guardado || '' }
    // ES: «7. Luces - Altas» → número 7, sub «Altas». EN: "7. Luces - Altas" → number 7, sub "Altas".
    const m = /^(\d+)\.\s*([^-]+?)(?:\s+-\s+(.+))?$/.exec(etiqueta)
    const numero = m ? Number(m[1]) : null
    return {
      criterio: numero && CRITERIOS_FOSST22[numero] ? CRITERIOS_FOSST22[numero] : `${i + 1}. ${etiqueta}`,
      sub: m && m[3] ? m[3] : '',
      valor: dato.valor || '',
      obs: dato.obs || '',
      accion: dato.accion || '',
    }
  })
}
