/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/validarRitmoIncubadoras.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Revisa el ritmo de cada incubadora: entre dos transferencias seguidas de la misma
 *     máquina debe haber un ciclo completo (≈ 19 a 26 días con lavado y cargue).
 *     Menos de 16 días es imposible; más de 30 sugiere una transferencia sin reportar.
 * EN: Checks each setter's rhythm: between two consecutive transfers of the same
 *     machine there must be a full cycle (≈ 19 to 26 days incl. washing and loading).
 *     Fewer than 16 days is impossible; more than 30 suggests an unreported transfer.
 */

// ES: Un día en milisegundos. EN: One day in milliseconds.
const DIA = 86_400_000

/**
 * @param {object[]} transferencias ES: normalizadas. EN: normalized.
 * @returns {Array<{ incubadora, desde, hasta, dias, problema }>}
 */
export function validarRitmoIncubadoras(transferencias) {
  // ES: Se agrupan por incubadora. EN: Group by setter.
  const porInc = new Map()
  for (const t of transferencias) porInc.set(t.incubadora, [...(porInc.get(t.incubadora) ?? []), t])
  // ES: Hallazgos. EN: Findings.
  const hallazgos = []
  for (const [incubadora, lista] of porInc) {
    // ES: Orden cronológico. EN: Chronological order.
    lista.sort((a, b) => Date.parse(a.transferidoEn) - Date.parse(b.transferidoEn))
    for (let i = 1; i < lista.length; i += 1) {
      // ES: Días entre esta transferencia y la anterior. EN: Days between this and the previous one.
      const dias = (Date.parse(lista[i].transferidoEn) - Date.parse(lista[i - 1].transferidoEn)) / DIA
      // ES: Clasificación del intervalo. EN: Interval classification.
      const problema = dias < 16 ? 'imposible' : dias > 30 ? 'falta_una' : null
      if (problema) hallazgos.push({ incubadora, desde: lista[i - 1].transferidoEn, hasta: lista[i].transferidoEn, dias: Number(dias.toFixed(1)), problema })
    }
  }
  return hallazgos
}
