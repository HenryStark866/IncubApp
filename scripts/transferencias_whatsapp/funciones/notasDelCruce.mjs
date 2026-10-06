/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/notasDelCruce.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Redacta en español, para el reporte y para la base, lo que encontró el cruce con
 *     los mapas de cargue de una transferencia.
 * EN: Writes in Spanish, for the report and the DB, what the load-map cross-check found
 *     for one transfer.
 */

/**
 * @param {object} cruce ES: resultado de cruzarConMapas. EN: cruzarConMapas result.
 * @param {object} t ES: transferencia (ya ajustada). EN: transfer (already adjusted).
 * @returns {string[]}
 */
export function notasDelCruce(cruce, t) {
  // ES: Notas acumuladas. EN: Accumulated notes.
  const notas = []
  // ES: Corrección manual hecha al transcribir. EN: Manual correction made while transcribing.
  if (t.correccion) notas.push(`Corrección (${t.correccion.campo}, confianza ${t.correccion.confianza}): ${t.correccion.motivo}`)
  // ES: Día dicho en el mensaje, hora supuesta. EN: Day given in the message, assumed time.
  if (t.horaEstimada) notas.push('El mensaje se envió días después («la del lunes/martes/miércoles»): se registra ese día a las 06:00')
  // ES: Hora movida por recargue. EN: Time moved because of a reload.
  if (t.horaAjustadaDesde) notas.push(`Hora ajustada a antes del recargue del ${cruce.recargue.cargadoEn.slice(0, 16).replace('T', ' ')} UTC (mapa ${cruce.recargue.mapa}); reportada ${t.horaAjustadaDesde.slice(0, 16).replace('T', ' ')}`)
  // ES: Resultado contra el mapa del ciclo. EN: Result against the cycle map.
  if (cruce.mapa) {
    const m = cruce.mapa
    if (m.estado === 'coincide') notas.push(`Mapa de cargue ${m.id}: lotes ${m.lotes.join(', ')} · ${m.dias} días de ciclo · coincide${m.sobran.length ? ` (el chat no menciona ${m.sobran.join(', ')})` : ''}`)
    else notas.push(`Mapa de cargue ${m.id} de ${t.incubadora}: lotes ${m.lotes.join(', ')} · el chat reporta ${t.lotes.join(', ')} (no estaban: ${m.faltan.join(', ')})`)
  } else if (cruce.estado === 'sin_mapa_del_ciclo') {
    notas.push('No hay mapa de cargue exportado de ese ciclo')
  }
  // ES: Otra incubadora del mismo ciclo con esos lotes (mapas cruzados). EN: Another setter with those lots.
  if (cruce.candidatos?.length) notas.push(`Esos lotes estaban en el mapa de: ${cruce.candidatos.map((c) => c.incubadora).join(', ')}`)
  return notas
}
