/**
 * Lecturas que el bot de fotos (n8n) dejó en «revisar»: arma, para cada una,
 * la comparación campo por campo entre lo que digitó el turnero y lo que leyó
 * el bot en la foto, y el valor final que el líder va a guardar.
 * Henry Stark Desarrollador · CDH Maker
 */
import { readingFieldsFor } from '../../../lib/machineReadings'

const LEIBLES = ['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count']

const numOrNull = (v) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Por qué quedó en revisar, en palabras del líder. */
export function reasonOf(d) {
  if (d.tipo === 'turnero_vs_foto') return 'El turnero digitó otro valor'
  if (d.tipo === 'lecturas_distintas') return 'El bot no leyó igual las dos veces'
  if (d.tipo === 'fuera_de_rango') return 'El bot leyó un valor imposible'
  return 'Revisar'
}

/**
 * Filas de un campo por lectura: etiqueta, lo del turnero, lo de la foto y el
 * valor con que arranca el campo editable.
 * @param {object} reading fila de machine_check_ai_readings con machine_checks y machines
 */
export function reviewFields(reading) {
  const check = reading?.machine_checks || {}
  const type = reading?.machines?.type
  const valores = reading?.valores || {}
  const discrepancias = Array.isArray(reading?.discrepancias) ? reading.discrepancias : []
  const porCampo = new Map(discrepancias.filter((d) => d.campo).map((d) => [d.campo, d]))

  return readingFieldsFor(type)
    .filter((f) => LEIBLES.includes(f.key))
    .map((f) => {
      const d = porCampo.get(f.key) || null
      const operator = numOrNull(check[f.key])
      let photo = numOrNull(valores[f.key])
      let photoText = null
      if (d?.tipo === 'turnero_vs_foto') photo = numOrNull(d.foto)
      if (d?.tipo === 'lecturas_distintas') {
        photo = null
        photoText = [d.lectura_a, d.lectura_b].map((v) => (v == null ? 'no se ve' : v)).join(' / ')
      }
      if (d?.tipo === 'fuera_de_rango') photoText = `${d.valor} (imposible)`
      return {
        key: f.key,
        label: f.label,
        unit: f.unidad,
        step: f.paso,
        operator,
        photo,
        photoText: photoText ?? (photo == null ? '—' : String(photo)),
        flagged: !!d,
        reason: d ? reasonOf(d) : null,
        initial: operator ?? photo,
      }
    })
}

/** Mensaje de cabecera si la foto parece de otra máquina. */
export function machineMismatch(reading) {
  const d = (reading?.discrepancias || []).find((x) => x.tipo === 'maquina_distinta')
  return d ? `La pantalla de la foto dice máquina ${d.en_pantalla}, pero se registró en ${d.esperada}.` : null
}

/**
 * Lo que se manda a resolver_lectura_bot: solo los campos que cambiaron frente
 * a lo guardado. Devuelve { valores, error }.
 */
export function finalValues(fields, draft) {
  const valores = {}
  for (const f of fields) {
    const raw = draft?.[f.key]
    const v = raw === undefined ? f.initial : numOrNull(raw)
    if (raw !== undefined && raw !== '' && v == null) return { valores: null, error: `${f.label}: no es un número` }
    if (v !== f.operator) valores[f.key] = f.key === 'turn_count' && v != null ? Math.round(v) : v
  }
  return { valores, error: null }
}
