/**
 * Motor de cumplimiento y elegibilidad de bonos.
 *
 * Reglas de negocio IncubApp:
 * - Indicadores = esperado (coordinador) vs reportado (operario).
 * - Bono de cumplimiento: ≥ 95 % de labores exitosas + adherencia al turno.
 * - Elegibilidad: mínimo 90 días de uso continuo de la app.
 * - Turneros: mínimo 6 reportes de ronda por turno (salvo meta distinta del coord).
 * - El fondo del bono NO sale de nómina/caja de la empresa operadora:
 *   se financia con ingresos de infraestructura como servicio (clientes y
 *   empresas hermanas a las que se les administra el software y sus BD).
 *
 * Henry Stark Desarrollador
 */

/** Días de uso continuo mínimos para entrar al plan de bonos */
export const BONUS_MIN_CONTINUOUS_DAYS = 90

/** % mínimo de cumplimiento para cobrar bono */
export const BONUS_MIN_SCORE_PCT = 95

/** Rondas mínimas por turno para operarios de turno (default) */
export const DEFAULT_MIN_ROUNDS_PER_SHIFT = 6

/** Claves de labor estándar que el coordinador puede metear */
export const LABOR_KEYS = [
  {
    id: 'rounds',
    label: 'Reportes de ronda por turno',
    unit: 'rondas',
    defaultExpected: DEFAULT_MIN_ROUNDS_PER_SHIFT,
    roles: ['operator', 'auxiliary', 'auxiliary_production', 'reception_operator'],
  },
  {
    id: 'shift_adherence',
    label: 'Adherencia al turno (ingreso/salida a tiempo)',
    unit: '%',
    defaultExpected: 100,
    roles: ['*'],
  },
  {
    id: 'labors_completed',
    label: 'Labores / actividades completadas con éxito',
    unit: 'unidades',
    defaultExpected: 1,
    roles: ['*'],
  },
  {
    id: 'attendance_punches',
    label: 'Marcas de asistencia con selfie válida',
    unit: 'marcas',
    defaultExpected: 2,
    roles: ['*'],
  },
  {
    id: 'reports_sent',
    label: 'Reportes / documentos enviados',
    unit: 'docs',
    defaultExpected: 0,
    roles: ['*'],
  },
]

export const BONUS_FUND_NOTE =
  'El bono de cumplimiento no se paga con fondos de nómina de la planta. Se financia con la venta de infraestructura como servicio a clientes y empresas hermanas (administración del software y bases de datos), cuando el programa de bonos esté activo tras la maduración de la red.'

/**
 * Actualiza y devuelve el rastro de uso continuo (días con al menos una acción).
 * Si se salta un día calendario (Bogotá), la racha se reinicia en 1.
 */
export function touchUsageStreak(prev, now = new Date()) {
  const today = bogotaDate(now)
  const last = prev?.lastActiveDate || null
  let continuous = Number(prev?.continuousDays) || 0
  let totalActiveDays = Number(prev?.totalActiveDays) || 0
  const firstActiveDate = prev?.firstActiveDate || today

  if (last === today) {
    return {
      firstActiveDate,
      lastActiveDate: today,
      continuousDays: continuous || 1,
      totalActiveDays: totalActiveDays || 1,
    }
  }

  if (!last) {
    return {
      firstActiveDate: today,
      lastActiveDate: today,
      continuousDays: 1,
      totalActiveDays: 1,
    }
  }

  const gap = daysBetween(last, today)
  if (gap === 1) {
    continuous += 1
    totalActiveDays += 1
  } else {
    // Hueco: reinicia racha continua
    continuous = 1
    totalActiveDays += 1
  }

  return {
    firstActiveDate,
    lastActiveDate: today,
    continuousDays: continuous,
    totalActiveDays,
  }
}

export function bogotaDate(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function daysBetween(a, b) {
  // a,b YYYY-MM-DD
  const da = new Date(`${a}T12:00:00`)
  const db = new Date(`${b}T12:00:00`)
  return Math.round((db - da) / 86400000)
}

/**
 * Calcula score de un usuario en un periodo.
 * @returns {{
 *   scorePct: number,
 *   components: Array,
 *   eligibleDays: boolean,
 *   eligibleScore: boolean,
 *   bonusEligible: boolean,
 *   continuousDays: number,
 *   daysToEligibility: number,
 * }}
 */
export function computeComplianceScore({
  targets = [],
  reported = {},
  role,
  usage,
  periodLabel = 'periodo',
}) {
  const applicable = targets.length
    ? targets
    : LABOR_KEYS.filter(
        (k) => k.roles.includes('*') || k.roles.includes(role)
      ).map((k) => ({
        labor_key: k.id,
        label: k.label,
        expected: k.defaultExpected,
        unit: k.unit,
      }))

  const components = applicable.map((t) => {
    const key = t.labor_key || t.id
    const expected = Number(t.expected ?? t.target_value ?? 0)
    const actual = Number(reported[key] ?? reported[t.id] ?? 0)
    // Si expected es 0, no penaliza (meta opcional)
    let ratio = 1
    if (expected > 0) {
      ratio = Math.min(1, actual / expected)
    }
    const pct = Math.round(ratio * 1000) / 10
    return {
      key,
      label: t.label || LABOR_KEYS.find((x) => x.id === key)?.label || key,
      expected,
      actual,
      unit: t.unit || LABOR_KEYS.find((x) => x.id === key)?.unit || '',
      pct,
      ok: expected === 0 || actual >= expected,
    }
  })

  // Promedio de componentes con expected > 0; si no hay, 100
  const scored = components.filter((c) => c.expected > 0)
  const scorePct = scored.length
    ? Math.round((scored.reduce((s, c) => s + c.pct, 0) / scored.length) * 10) / 10
    : 100

  const continuousDays = Number(usage?.continuousDays) || 0
  const eligibleDays = continuousDays >= BONUS_MIN_CONTINUOUS_DAYS
  const eligibleScore = scorePct >= BONUS_MIN_SCORE_PCT
  const bonusEligible = eligibleDays && eligibleScore

  return {
    scorePct,
    components,
    eligibleDays,
    eligibleScore,
    bonusEligible,
    continuousDays,
    daysToEligibility: Math.max(0, BONUS_MIN_CONTINUOUS_DAYS - continuousDays),
    periodLabel,
    minScore: BONUS_MIN_SCORE_PCT,
    minDays: BONUS_MIN_CONTINUOUS_DAYS,
  }
}

/** Roles considerados turneros (rondas obligatorias) */
export function isShiftWorkerRole(role) {
  return ['operator', 'auxiliary', 'auxiliary_production', 'reception_operator', 'barn_operator'].includes(
    role
  )
}

export function defaultTargetsForRole(role) {
  return LABOR_KEYS.filter((k) => k.roles.includes('*') || k.roles.includes(role)).map((k) => ({
    labor_key: k.id,
    label: k.label,
    expected: k.defaultExpected,
    unit: k.unit,
  }))
}
