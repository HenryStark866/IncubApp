/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/normalizarTransferencia.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Pasa un registro transcrito del chat a la forma que usa la app: incubadora de
 *     origen, nacedoras en orden con sus lotes y carros, etiqueta de lotes «41 + 43».
 * EN: Turns a transcribed chat record into the shape the app uses: source setter,
 *     ordered hatchers with their lots and carts, lot label "41 + 43".
 */
import { expandirLotesNacedora } from './expandirLotesNacedora.mjs'
import { nacedorasDelSalon } from './nacedorasDelSalon.mjs'
import { codigoMaquina } from './codigoMaquina.mjs'
import { fechaBogota } from './fechaBogota.mjs'

// ES: Bandejas por carro en las incubadoras Petersime (regla del mapa de cargue).
// EN: Trays per cart in the Petersime setters (load-map rule).
export const BANDEJAS_POR_CARRO = 16

/**
 * @param {object} registro ES: elemento de transferenciasReportadas. EN: item of transferenciasReportadas.
 * @returns {object} ES: transferencia normalizada. EN: normalized transfer.
 */
export function normalizarTransferencia(registro) {
  // ES: Nacedoras válidas del salón reportado. EN: Valid hatchers of the reported room.
  const delSalon = nacedorasDelSalon(registro.salon)
  // ES: «todo» = el mismo lote en las tres nacedoras. EN: "todo" = same lot in all three hatchers.
  const entradas = registro.todo
    ? delSalon.map((n) => [n, registro.todo])
    // ES: Si no, se respeta el orden en que el mensaje nombró las nacedoras.
    // EN: Otherwise keep the order in which the message named the hatchers.
    : Object.entries(registro.nac ?? {}).map(([n, t]) => [Number(n), t])
  // ES: Orden del mensaje: Object.entries ordena claves numéricas, así que se usa el texto.
  // EN: Message order: Object.entries sorts numeric keys, so the text order is used.
  const ordenTexto = (n) => {
    // ES: Posición de «#n» / «Nac n» en el texto original; si no aparece, va al final.
    // EN: Position of "#n" / "Nac n" in the original text; if missing, goes last.
    const m = new RegExp(`(?:nac[a-z]*\\s*(?:#|No)?\\s*|nacedora\\s*No\\s*)${n}(?!\\d)`, 'i').exec(registro.texto)
    return m ? m.index : 10_000 + n
  }
  // ES: Se ordenan las nacedoras por su aparición en el mensaje. EN: Sort hatchers by appearance.
  entradas.sort((a, b) => ordenTexto(a[0]) - ordenTexto(b[0]))
  // ES: Cada nacedora debe pertenecer al salón reportado. EN: Each hatcher must belong to the room.
  for (const [n] of entradas) {
    if (!delSalon.includes(n)) throw new Error(`NAC ${n} no es del salón ${registro.salon} (${registro.reportado})`)
  }
  // ES: Se construye el detalle de cada nacedora. EN: Build each hatcher's detail.
  const nacedoras = entradas.map(([n, texto], i) => {
    // ES: Lotes y carros de esta nacedora. EN: Lots and carts of this hatcher.
    const lotes = expandirLotesNacedora(texto)
    // ES: Carros totales solo si el mensaje los dio todos. EN: Total carts only if all were given.
    const carros = lotes.every((l) => l.carros != null) ? lotes.reduce((s, l) => s + l.carros, 0) : null
    return {
      orden: i + 1, // ES: orden del turnero / EN: shift-operator order
      codigo: codigoMaquina('NAC', n), // ES: «NAC-07» / EN: "NAC-07"
      lotes: lotes.map((l) => ({ lot: l.lote, trays: l.carros == null ? null : l.carros * BANDEJAS_POR_CARRO, carros: l.carros })),
      carros, // ES: total de carros / EN: total carts
    }
  })
  // ES: Lotes de toda la transferencia, sin repetir, en orden de aparición. EN: Unique lots in appearance order.
  const lotes = [...new Set(nacedoras.flatMap((n) => n.lotes.map((l) => l.lot)))]
  // ES: Fecha real (si el mensaje habla de otro día) o la del mensaje. EN: Actual date or message date.
  const transferidoEn = fechaBogota(registro.transferido ?? registro.reportado)
  // ES: Clave estable para no duplicar al volver a aplicar. EN: Stable key to avoid duplicates on re-runs.
  const clave = `wa-${transferidoEn.slice(0, 10)}-${codigoMaquina('INC', registro.inc)}-S${registro.salon}`
  return {
    clave,
    incubadora: codigoMaquina('INC', registro.inc),
    salon: registro.salon,
    reportadoEn: fechaBogota(registro.reportado),
    transferidoEn,
    horaEstimada: Boolean(registro.transferido), // ES: hora supuesta (solo se sabía el día) / EN: assumed time (only the day was known)
    reportadoPor: registro.por,
    nacedoras,
    lotes,
    loteEtiqueta: lotes.join(' + '), // ES: como lotsLabel() de la app / EN: like the app's lotsLabel()
    loteInferido: registro.correccion?.campo === 'lote',
    correccion: registro.correccion ?? null,
    texto: registro.texto,
  }
}
