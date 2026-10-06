/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/generarReporteCruce.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Escribe el reporte del cruce (Markdown) con el resumen, los hallazgos y la tabla
 *     completa de transferencias, para que soporte lo pueda revisar sin abrir el código.
 * EN: Writes the cross-check report (Markdown) with the summary, findings and the full
 *     transfer table, so support can review it without opening the code.
 */

// ES: Fecha y hora de Bogotá legibles. EN: Readable Bogota date-time.
const fmt = (iso) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
// ES: Texto de estado del cruce. EN: Cross-check status text.
const ESTADO = {
  coincide: '✅ coincide',
  parcial: '🟡 parcial',
  no_coincide: '🔴 no coincide',
  sin_mapa_exportado: '— (antes de septiembre)',
  sin_mapa_del_ciclo: '— sin mapa del ciclo',
  recargada_antes_del_reporte: '🟠 hora ajustada',
}

/**
 * @param {{ filas: object[], cruces: object[], ritmo: object[], pendientes: object[], faltantes: object[], fecha: string }} p
 * @returns {string}
 */
export function generarReporteCruce({ filas, cruces, ritmo, pendientes, faltantes, fecha }) {
  // ES: Índice de cruces por clave. EN: Cross results by key.
  const porClave = new Map(cruces.map((c) => [c.clave, c]))
  // ES: Conteo por estado. EN: Count per status.
  const conteo = {}
  for (const c of cruces) conteo[c.estado] = (conteo[c.estado] ?? 0) + 1
  // ES: Líneas del documento. EN: Document lines.
  const l = []
  l.push('# Cruce de transferencias del WhatsApp con la información real')
  l.push('')
  l.push(`**Autor:** Henry Taborda — Ing. en desarrollo de software · **Generado:** ${fecha} · **Herramienta:** \`node scripts/transferencias_whatsapp/principal.mjs\``)
  l.push('')
  l.push('> Documento generado automáticamente. Para cambiar algo se corrigen los datos en')
  l.push('> `scripts/transferencias_whatsapp/datos/transferencias_reportadas.mjs` y se vuelve a generar.')
  l.push('> La explicación paso a paso, errores y soluciones están en `docs/Bitacora_Transferencias_WhatsApp.md`.')
  l.push('')
  l.push('## Resumen')
  l.push('')
  l.push(`- Transferencias registradas desde el chat: **${filas.length}** (13-07-2026 a 05-10-2026).`)
  l.push(`- Con mapa de cargue real para comparar (septiembre-octubre): **${cruces.filter((c) => c.estado !== 'sin_mapa_exportado').length}** → ` +
    Object.entries(conteo).filter(([k]) => k !== 'sin_mapa_exportado').map(([k, v]) => `${ESTADO[k] ?? k}: ${v}`).join(' · '))
  l.push(`- Correcciones hechas al transcribir: **${filas.filter((f) => f.correccion).length}**.`)
  l.push(`- Horas ajustadas porque la incubadora se recargó antes del reporte: **${filas.filter((f) => f.horaAjustadaDesde).length}**.`)
  l.push('')
  l.push('## Transferencias que nunca se reportaron')
  l.push('')
  for (const f of faltantes) l.push(`- **${f.fecha}:** ${f.detalle}`)
  for (const r of ritmo) l.push(`- **${r.incubadora}:** pasan ${r.dias} días entre la transferencia del ${fmt(r.desde)} y la del ${fmt(r.hasta)}; le falta una en medio (${r.problema === 'falta_una' ? 'ciclo sin reportar' : 'intervalo imposible'}).`)
  l.push('')
  l.push('## Cargues reales que aún no tienen transferencia (corte: hoy)')
  l.push('')
  l.push('| Incubadora | Inicio de ciclo | Lotes | Días | Estado |')
  l.push('|---|---|---|---|---|')
  for (const p of pendientes) l.push(`| ${p.incubadora} | ${fmt(p.inicioCiclo)} | ${p.lotes.join(', ')} | ${p.dias} | ${p.estado === 'sin_reporte' ? '⚠️ ya debía transferirse' : 'incubando'} |`)
  l.push('')
  l.push('## Detalle de todas las transferencias')
  l.push('')
  l.push('| # | Fecha registrada | Incubadora | Salón → nacedoras (lotes) | Reportó | Cruce con mapa | Notas |')
  l.push('|---|---|---|---|---|---|---|')
  filas.forEach((f, i) => {
    const c = porClave.get(f.clave)
    const nacs = f.nacedoras.map((n) => `${n.codigo.replace('NAC-', 'N')}: ${n.lotes.map((x) => x.carros ? `${x.lot}×${x.carros}` : x.lot).join('/')}`).join(' · ')
    const notas = (f.notasCruce ?? []).join(' — ').replace(/\|/g, '/')
    l.push(`| ${i + 1} | ${fmt(f.transferidoEn)} | ${f.incubadora} | S${f.salon} → ${nacs} | ${f.reportadoPor} | ${f.horaAjustadaDesde ? ESTADO.recargada_antes_del_reporte : ESTADO[c?.estado] ?? c?.estado ?? ''} | ${notas} |`)
  })
  l.push('')
  return l.join('\n')
}
