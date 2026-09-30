/**
 * SST: etiquetas y reglas puras de incidentes e inspecciones (sin Supabase).
 * Las usan el módulo SST (formularios y listas) y el inicio del líder de SST.
 * Henry Stark Desarrollador
 */

export const INCIDENT_KINDS = [
  { value: 'accident', label: 'Accidente' },
  { value: 'incident', label: 'Incidente' },
  { value: 'near_miss', label: 'Casi accidente' },
  { value: 'unsafe_condition', label: 'Condición insegura' },
]
export const SEVERITIES = [
  { value: 'low', label: 'Leve' },
  { value: 'medium', label: 'Moderada' },
  { value: 'high', label: 'Grave' },
  { value: 'critical', label: 'Muy grave' },
]
export const INCIDENT_STATUS = [
  { value: 'reported', label: 'Reportado' },
  { value: 'investigating', label: 'En investigación' },
  { value: 'closed', label: 'Cerrado' },
]
export const INSPECTION_KINDS = [
  { value: 'epp', label: 'EPP' },
  { value: 'extinguishers', label: 'Extintores' },
  { value: 'first_aid', label: 'Botiquín' },
  { value: 'heights', label: 'Trabajo en alturas' },
  { value: 'housekeeping', label: 'Orden y aseo' },
  { value: 'other', label: 'Otra' },
]
export const INSPECTION_RESULTS = [
  { value: 'conforming', label: 'Conforme' },
  { value: 'findings', label: 'Con hallazgos' },
]

const labelIn = (list) => (v) => list.find((x) => x.value === v)?.label || v || ''
export const incidentKindLabel = labelIn(INCIDENT_KINDS)
export const severityLabel = labelIn(SEVERITIES)
export const incidentStatusLabel = labelIn(INCIDENT_STATUS)
export const inspectionResultLabel = labelIn(INSPECTION_RESULTS)
export const inspectionKindLabel = (i) =>
  i?.kind === 'other' && i?.kind_other ? i.kind_other : labelIn(INSPECTION_KINDS)(i?.kind)

const DAY_MS = 86400000

/** Fecha «AAAA-MM-DD» (o Date) a medianoche local, para comparar días sin líos de zona. */
export function dayStart(value) {
  if (!value) return null
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Días enteros de `now` a `value` (negativo = ya pasó). */
export function daysUntil(value, now = new Date()) {
  const d = dayStart(value)
  if (!d) return null
  return Math.round((d - dayStart(now)) / DAY_MS)
}

/** Lunes y domingo (incluido) de la semana de `now`. */
export function weekBounds(now = new Date()) {
  const start = dayStart(now)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start, end }
}

/** Incidente abierto con acción correctiva pendiente (tiene fecha límite y no se ha cumplido). */
export const actionPending = (i) => i.status !== 'closed' && !i.action_done_at && Boolean(i.action_due)

/** Días completos desde el último accidente (null si no hay ninguno registrado). */
export function daysSinceAccident(incidents = [], now = new Date()) {
  const last = incidents
    .filter((i) => i.kind === 'accident' && i.occurred_at)
    .map((i) => dayStart(new Date(i.occurred_at)))
    .filter(Boolean)
    .sort((a, b) => b - a)[0]
  if (!last) return null
  return Math.max(0, Math.round((dayStart(now) - last) / DAY_MS))
}
