/**
 * Gestión ambiental: etiquetas y cálculos puros de residuos, medidores y obligaciones.
 * Los usan el módulo Ambiental y el inicio del líder ambiental.
 * Henry Stark Desarrollador
 */
import { dayStart, daysUntil } from '../../sst/lib/sstRecords'

export const WASTE_KINDS = [
  { value: 'organic', label: 'Orgánico / cáscara' },
  { value: 'infertile_egg', label: 'Huevo no fértil' },
  { value: 'recyclable', label: 'Reciclable' },
  { value: 'hazardous', label: 'Peligroso (RESPEL)' },
  { value: 'ordinary', label: 'Ordinario' },
]
export const METERS = [
  { value: 'water', label: 'Agua', unit: 'm³' },
  { value: 'energy', label: 'Energía', unit: 'kWh' },
  { value: 'gas', label: 'Gas', unit: 'm³' },
]
export const OBLIGATION_STATUS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En trámite' },
  { value: 'done', label: 'Cumplida' },
]
export const OBLIGATION_SUGGESTIONS = [
  'Permiso de vertimientos',
  'Informe de aprovechamiento de residuos',
  'Registro de generadores de RESPEL (IDEAM)',
  'Concesión de aguas',
  'Plan de gestión integral de residuos (PGIRS)',
  'Caracterización de vertimientos',
]

const labelIn = (list) => (v) => list.find((x) => x.value === v)?.label || v || ''
export const wasteKindLabel = labelIn(WASTE_KINDS)
export const meterLabel = labelIn(METERS)
export const obligationStatusLabel = labelIn(OBLIGATION_STATUS)
export const meterUnit = (m) => METERS.find((x) => x.value === m)?.unit || ''

const DAY_MS = 86400000

/**
 * Consumo por día de un medidor en una ventana de días [from, to).
 * Cada par de lecturas seguidas del mismo medidor y sede aporta su diferencia y los días
 * entre ellas; cuenta en la ventana si la segunda lectura cae dentro. Así el resultado no
 * depende de cada cuánto se lea. Si la lectura baja (cambio de medidor) ese tramo se omite.
 * Devuelve { perDay, total, days, unit } o null si no hay tramos.
 */
export function meterConsumption(readings = [], meter, from, to) {
  const series = new Map()
  for (const r of readings) {
    if (r.meter !== meter) continue
    const d = dayStart(r.read_on || r.created_at)
    if (!d) continue
    const key = String(r.site || '')
      .trim()
      .toLowerCase()
    if (!series.has(key)) series.set(key, [])
    series.get(key).push({ d, v: Number(r.reading), unit: r.unit })
  }
  let total = 0
  let perDay = 0
  let days = 0
  let unit = meterUnit(meter)
  for (const list of series.values()) {
    list.sort((a, b) => a.d - b.d)
    let siteTotal = 0
    let siteDays = 0
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      if (b.d < from || b.d >= to) continue
      const gap = Math.round((b.d - a.d) / DAY_MS)
      const delta = b.v - a.v
      if (gap <= 0 || !Number.isFinite(delta) || delta < 0) continue
      siteTotal += delta
      siteDays += gap
      if (b.unit) unit = b.unit
    }
    if (!siteDays) continue
    // Varias sedes: el consumo diario de la empresa es la suma del de cada sede.
    total += siteTotal
    perDay += siteTotal / siteDays
    days = Math.max(days, siteDays)
  }
  if (!days) return null
  return { total, days, perDay, unit }
}

/** Consumo de esta semana (últimos 7 días) contra la anterior (8 a 14 días atrás). */
export function weekOverWeek(readings, meter, now = new Date()) {
  const today = dayStart(now)
  const tomorrow = new Date(today.getTime() + DAY_MS)
  const weekAgo = new Date(tomorrow.getTime() - 7 * DAY_MS)
  const twoWeeksAgo = new Date(tomorrow.getTime() - 14 * DAY_MS)
  const current = meterConsumption(readings, meter, weekAgo, tomorrow)
  const previous = meterConsumption(readings, meter, twoWeeksAgo, weekAgo)
  const change = current && previous && previous.perDay > 0 ? current.perDay / previous.perDay - 1 : null
  return { current, previous, change }
}

/** Residuos entregados en el mes de `now`: kg totales y % aprovechado. */
export function wasteOfMonth(waste = [], now = new Date()) {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month = waste.filter((w) => w.status !== 'scheduled' && String(w.recorded_on || '').startsWith(ym))
  const kg = month.reduce((s, w) => s + (Number(w.kg) || 0), 0)
  const recovered = month.filter((w) => w.recovered).reduce((s, w) => s + (Number(w.kg) || 0), 0)
  return { kg, recovered, pct: kg > 0 ? Math.round((recovered / kg) * 100) : null, count: month.length }
}

/** Obligaciones sin cumplir que vencen en `days` días o ya vencieron, la más urgente primero. */
export function obligationsDue(obligations = [], now = new Date(), days = 15) {
  return obligations
    .filter((o) => o.status !== 'done' && o.due_on)
    .map((o) => ({ o, left: daysUntil(o.due_on, now) }))
    .filter((x) => x.left != null && x.left <= days)
    .sort((a, b) => a.left - b.left)
}
