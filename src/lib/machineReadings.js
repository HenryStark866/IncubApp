/**
 * =============================================================================
 * ARCHIVO: src/lib/machineReadings.js
 * PROPÓSITO: Lecturas de pantalla que la ronda captura para el FORMATO CONTROL
 *   DIARIO de incubadoras y nacedoras (temperatura, humedad, CO2, volteo).
 * CÓMO FUNCIONA: define qué campos pide cada tipo de máquina, normaliza lo que
 *   digita el turnero y arma el objeto que va a machine_checks. Todo es opcional:
 *   la ronda sigue siendo válida con la foto sola.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/** Campos del formato, en el orden en que aparecen en la hoja de papel. */
const CAMPOS = {
  temp_ovoscan: { label: 'Temp. ovoscan', unidad: '°F', paso: '0.1', tipo: 'numero' },
  temp_air: { label: 'Temp. aire', unidad: '°F', paso: '0.1', tipo: 'numero' },
  humidity: { label: 'Humedad relativa', unidad: '', paso: '0.1', tipo: 'numero' },
  co2: { label: 'CO₂', unidad: '%', paso: '0.01', tipo: 'numero' },
  turn_count: { label: 'Volteo · número', unidad: '', paso: '1', tipo: 'entero' },
  turn_position: { label: 'Volteo · posición', unidad: '', tipo: 'texto' },
}

const POR_TIPO = {
  setter: ['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count', 'turn_position'],
  hatcher: ['temp_air', 'humidity', 'co2'],
}

/** Export «readingFieldsFor»: campos que pide el formato de ese tipo de máquina. */
export function readingFieldsFor(machineType) {
  return (POR_TIPO[machineType] || []).map((key) => ({ key, ...CAMPOS[key] }))
}

/** Export «hasReadingFields»: si el tipo de máquina tiene formato de control diario. */
export function hasReadingFields(machineType) {
  return (POR_TIPO[machineType] || []).length > 0
}

const aNumero = (v) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Export «readingsPayload»: deja el objeto listo para insertar en machine_checks.
 * Devuelve `null` en lo que no se digitó, nunca `undefined` ni cadenas vacías.
 */
export function readingsPayload(readings) {
  const r = readings || {}
  return {
    temp_ovoscan: aNumero(r.temp_ovoscan),
    temp_air: aNumero(r.temp_air),
    humidity: aNumero(r.humidity),
    co2: aNumero(r.co2),
    turn_count: aNumero(r.turn_count) == null ? null : Math.round(aNumero(r.turn_count)),
    turn_position: r.turn_position ? String(r.turn_position).trim().slice(0, 40) : null,
  }
}

/** Export «hasAnyReading»: si el turnero alcanzó a digitar algo. */
export function hasAnyReading(readings) {
  const p = readingsPayload(readings)
  return Object.values(p).some((v) => v != null)
}

/** Export «readingsFromCheck»: prellenado con la última lectura de esa máquina. */
export function readingsFromCheck(check) {
  if (!check) return {}
  const out = {}
  for (const key of Object.keys(CAMPOS)) {
    if (check[key] != null) out[key] = String(check[key])
  }
  return out
}

/** Export «READING_COLUMNS»: columnas a pedir en los select de machine_checks. */
export const READING_COLUMNS = Object.keys(CAMPOS)
