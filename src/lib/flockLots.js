/**
 * =============================================================================
 * ARCHIVO: src/lib/flockLots.js
 * PROPÓSITO: Edad de parvada por lote y su traducción a fertilidad estimada,
 *   para alimentar el balance térmico del mapa de cargue (loadMapEngine.js).
 * CÓMO FUNCIONA: cada lote (código "41", "42"…) guarda UNA edad conocida a una
 *   fecha de referencia (flock_lots.age_weeks_at / reference_date). La edad
 *   ACTUAL se deriva sumando las semanas transcurridas — así el coordinador
 *   no vuelve a digitarla cada vez que el lote entra a clasificación.
 * REGLA DE FERTILIDAD (Petersime, "How to correctly load incubators with eggs
 *   from different flocks"): parvada "prime" 30–44 semanas → fertilidad alta;
 *   fuera de ese rango, media o baja según qué tan lejos esté.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

const MS_PER_DAY = 86400000

/** Normaliza un código de lote para usarlo como llave del registro. */
export function normalizeLotCode(v) {
  return String(v ?? '').trim()
}

/**
 * Construye el registro { lotCode -> row } a partir de las filas de flock_lots.
 */
export function buildFlockRegistry(rows = []) {
  const map = {}
  for (const r of rows) {
    const code = normalizeLotCode(r.lot_code ?? r.lotCode)
    if (!code) continue
    map[code] = {
      id: r.id,
      lotCode: code,
      ageWeeksAt: r.age_weeks_at ?? r.ageWeeksAt ?? null,
      referenceDate: r.reference_date ?? r.referenceDate ?? null,
      status: r.status || 'active',
      notes: r.notes || null,
    }
  }
  return map
}

/**
 * Edad ACTUAL de la parvada en semanas, o null si no hay dato / está retirada.
 */
export function currentFlockAgeWeeks(entry, today = new Date()) {
  if (!entry || entry.status === 'retired') return null
  const base = Number(entry.ageWeeksAt)
  if (!Number.isFinite(base) || !entry.referenceDate) return null
  const ref = new Date(`${entry.referenceDate}T00:00:00`)
  if (Number.isNaN(ref.getTime())) return null
  const days = Math.floor((today - ref) / MS_PER_DAY)
  return Math.max(0, base + Math.floor(Math.max(0, days) / 7))
}

/**
 * Nivel de fertilidad según la edad de la parvada (regla Petersime: 30–44
 * semanas = parvada "prime", fertilidad alta).
 */
export function fertilityTierFromAge(weeks) {
  if (weeks == null || !Number.isFinite(weeks)) return null
  if (weeks >= 30 && weeks <= 44) return 'alta'
  if ((weeks >= 24 && weeks < 30) || (weeks > 44 && weeks <= 56)) return 'media'
  return 'baja'
}

export const FERTILITY_LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' }

/** Score numérico 0..1 usado por el motor térmico (mayor = más producción de calor). */
export function fertilityScoreFromTier(tier) {
  if (tier === 'alta') return 1
  if (tier === 'media') return 0.55
  if (tier === 'baja') return 0.15
  return null
}

/**
 * Resumen listo para UI: edad actual, nivel y score de fertilidad de un lote.
 */
export function flockInfoFor(lotCode, registry, today = new Date()) {
  const entry = registry?.[normalizeLotCode(lotCode)]
  if (!entry) return { known: false, retired: false, ageWeeks: null, tier: null, score: null }
  if (entry.status === 'retired') {
    return { known: true, retired: true, ageWeeks: null, tier: null, score: null }
  }
  const ageWeeks = currentFlockAgeWeeks(entry, today)
  const tier = fertilityTierFromAge(ageWeeks)
  return { known: ageWeeks != null, retired: false, ageWeeks, tier, score: fertilityScoreFromTier(tier) }
}
