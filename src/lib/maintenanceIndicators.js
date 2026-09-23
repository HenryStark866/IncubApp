/**
 * =============================================================================
 * ARCHIVO: src/lib/maintenanceIndicators.js
 * PROPÓSITO: Indicadores del proceso de mantenimiento (INMAT01) para los
 *   líderes: por persona, por actividad, por máquina, por zona, por sede o en
 *   general, con los mismos registros que alimentan el cumplimiento del Plan AM.
 * CÓMO FUNCIONA: recibe los registros ya normalizados (planCompliance.js) y los
 *   agrupa según la lente. Cada indicador sale de un dato registrado; si el dato
 *   no existe (p. ej. OT sin hora de inicio) no entra al promedio y se dice
 *   cuántos quedaron por fuera. Nada se estima.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { activityFamilies, workOrderTypeLabel } from './planCompliance'

export const LENSES = [
  { id: 'general', label: 'General', hint: 'Todo el proceso' },
  { id: 'persona', label: 'Por persona', hint: 'Quién ejecutó' },
  { id: 'actividad', label: 'Por actividad', hint: 'Qué se hizo' },
  { id: 'maquina', label: 'Por máquina', hint: 'Activo intervenido' },
  { id: 'zona', label: 'Por zona', hint: 'Sala o sistema' },
  { id: 'sede', label: 'Por sede', hint: 'Localidad' },
]

const FAMILY_LABEL = {
  calibracion: 'Calibración',
  limpieza: 'Limpieza',
  lubricacion: 'Lubricación',
  cambio: 'Cambio de partes',
  ajuste: 'Ajuste',
  medicion: 'Medición / análisis',
  prueba: 'Prueba de funcionamiento',
  correctivo: 'Atención de fallas',
  inspeccion: 'Inspección / verificación',
}

export const SOURCE_LABEL = {
  ot: 'OT IncubApp',
  calibracion: 'Calibración IncubApp',
  mantum: 'Mántum',
  ronda: 'Ronda IncubApp',
}

/** Qué se hizo, en una sola etiqueta: la familia más específica. */
export function activityLabel(record) {
  if (record.kind === 'calibracion') return FAMILY_LABEL.calibracion
  const fams = activityFamilies(record.text)
  if (record.type === 'corrective' || fams.has('correctivo')) return FAMILY_LABEL.correctivo
  for (const k of Object.keys(FAMILY_LABEL)) if (k !== 'correctivo' && fams.has(k)) return FAMILY_LABEL[k]
  return record.type ? workOrderTypeLabel(record.type) : 'Otra'
}

/** Correctiva o planeada (preventiva, predictiva, inspección, calibración). */
export function isCorrective(record) {
  if (record.type === 'corrective') return true
  if (['preventive', 'predictive', 'inspection', 'calibration', 'round'].includes(record.type)) return false
  return activityFamilies(record.text).has('correctivo')
}

const hours = (a, b) => {
  if (!a || !b) return null
  const h = (new Date(b) - new Date(a)) / 3_600_000
  return Number.isFinite(h) && h >= 0 ? h : null
}

/**
 * Datos de contexto de cada registro: persona, máquina, zona y sede.
 * @param {object} ctx { machinesById, roomsById, plantsById, people, planIndex }
 */
export function describeRecord(record, { roomsById = {}, plantsById = {}, people = {}, planIndex = new Map() } = {}) {
  const raw = record.raw || {}
  const machine = record.machine
  const keys = [...(record.keys || [])]
  const planCode = keys.find((k) => planIndex.has(k)) || (record.kind === 'mantum' ? keys[0] || null : null)
  const plan = planCode ? planIndex.get(String(planCode).toUpperCase()) : null
  const room = roomsById[machine?.room_id] || roomsById[raw.room_id] || null
  const plant = plantsById[machine?.plant_id] || plantsById[raw.plant_id] || null
  const personName = record.personName || people[record.personId]?.name || null
  const machineLabel = machine?.code || machine?.name || (planCode ? `${planCode}${plan?.equipmentClass ? ` · ${plan.equipmentClass}` : ''}` : null)
  return {
    persona: personName || 'Sin responsable registrado',
    actividad: activityLabel(record),
    maquina: machineLabel || raw.location_name || 'Sin equipo',
    zona: room?.name || raw.location_name || plan?.system || 'Sin zona registrada',
    sede: plant?.name || plan?.sede || (record.kind === 'mantum' ? 'Sin sede en Mántum' : 'Sin sede registrada'),
  }
}

function emptyGroup(key) {
  return {
    key,
    total: 0,
    corrective: 0,
    planned: 0,
    closed: 0,
    open: 0,
    calibrations: 0,
    ttrSum: 0,
    ttrN: 0,
    respSum: 0,
    respN: 0,
    downtimeH: 0,
    cost: 0,
    last: null,
    sources: {},
    records: [],
  }
}

function addTo(g, r) {
  g.total += 1
  const corrective = isCorrective(r)
  if (corrective) g.corrective += 1
  else g.planned += 1
  if (r.closed) g.closed += 1
  else g.open += 1
  if (r.kind === 'calibracion' || /calibr/i.test(r.title || '')) g.calibrations += 1
  const raw = r.raw || {}
  const created = raw.created_at || raw.createdAt || null
  const started = raw.started_at || raw.startedAt || null
  const finished = raw.completed_at || raw.finishedAt || null
  if (corrective) {
    const ttr = hours(started || created, finished)
    if (ttr != null) {
      g.ttrSum += ttr
      g.ttrN += 1
    }
  }
  const resp = hours(created, started)
  if (resp != null) {
    g.respSum += resp
    g.respN += 1
  }
  if (Number(raw.downtime_minutes) > 0) g.downtimeH += Number(raw.downtime_minutes) / 60
  const cost = Number(raw.cost ?? r.cost)
  if (Number.isFinite(cost) && cost > 0) g.cost += cost
  if (!g.last || r.date > g.last) g.last = r.date
  g.sources[r.kind] = (g.sources[r.kind] || 0) + 1
  g.records.push(r)
}

function finish(g) {
  return {
    ...g,
    pctPlanned: g.total ? g.planned / g.total : null,
    pctClosed: g.total ? g.closed / g.total : null,
    mttrH: g.ttrN ? g.ttrSum / g.ttrN : null,
    responseH: g.respN ? g.respSum / g.respN : null,
  }
}

/**
 * Indicadores agrupados por la lente pedida.
 * @param {object} p
 * @param {object[]} p.records registros normalizados (sin rondas: van aparte)
 * @param {string} p.lens id de LENSES
 * @param {Date} [p.from] @param {Date} [p.to]
 * @param {object} p.ctx contexto para describeRecord
 */
export function buildIndicators({ records = [], lens = 'general', from = null, to = null, ctx = {} } = {}) {
  const inRange = records.filter((r) => r.kind !== 'ronda' && (!from || r.date >= from) && (!to || r.date <= to))
  const groups = new Map()
  const overall = emptyGroup('Total')
  for (const r of inRange) {
    addTo(overall, r)
    if (lens === 'general') continue
    const d = describeRecord(r, ctx)
    // Una OT de Mántum puede tener varios ejecutores: cuenta para cada uno.
    const keys = lens === 'persona' && r.people?.length ? r.people : [d[lens]]
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, emptyGroup(key))
      addTo(groups.get(key), r)
    }
  }
  return {
    overall: finish(overall),
    groups: [...groups.values()].map(finish).sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key), 'es')),
    count: inRange.length,
  }
}

/** Serie mensual (planeado vs correctivo) para la tendencia. */
export function monthlySeries(records = [], { from, to } = {}) {
  const start = from ? new Date(from.getFullYear(), from.getMonth(), 1) : null
  const end = to || new Date()
  const map = new Map()
  if (start) {
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      map.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, { planned: 0, corrective: 0 })
    }
  }
  for (const r of records) {
    if (r.kind === 'ronda') continue
    if (from && r.date < from) continue
    if (to && r.date > to) continue
    const k = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`
    if (!map.has(k)) map.set(k, { planned: 0, corrective: 0 })
    map.get(k)[isCorrective(r) ? 'corrective' : 'planned'] += 1
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v }))
}

/**
 * Cumplimiento del plan por máquina (código del plan): de las semanas en que al
 * equipo le tocaba algo, en cuántas quedó registro para él.
 */
export function complianceByEquipment(rows = []) {
  const map = new Map()
  for (const row of rows) {
    for (const o of row.occurrences) {
      if (o.status === 'upcoming') continue
      for (const code of row.trackable) {
        if (!map.has(code)) map.set(code, { code, due: 0, done: 0 })
        const g = map.get(code)
        g.due += 1
        if (o.hitCodes?.includes(code)) g.done += 1
      }
    }
  }
  return map
}

/** Cumplimiento del plan agregado por una clave del equipo (zona o sede del plan). */
export function complianceByPlanField(rows = [], field = 'system') {
  const map = new Map()
  for (const row of rows) {
    const key = row.task[field] || 'Sin dato'
    if (!map.has(key)) map.set(key, { due: 0, score: 0 })
    const g = map.get(key)
    g.due += row.due
    g.score += row.score
  }
  return map
}

/** Filas para el Excel INMAT01 de la lente actual. */
export function indicatorSheetRows(result, lensLabel) {
  const fmtH = (v) => (v == null ? 'Sin dato' : Number(v.toFixed(1)))
  const pct = (v) => (v == null ? 'Sin dato' : `${Math.round(v * 100)}%`)
  return result.groups.map((g) => ({
    [lensLabel]: g.key,
    Registros: g.total,
    Planeadas: g.planned,
    Correctivas: g.corrective,
    '% planeado': pct(g.pctPlanned),
    Cerradas: g.closed,
    Abiertas: g.open,
    Calibraciones: g.calibrations,
    'MTTR (h)': fmtH(g.mttrH),
    'Respuesta (h)': fmtH(g.responseH),
    'Parada (h)': Number(g.downtimeH.toFixed(1)),
    Costo: g.cost,
    'Último registro': g.last ? g.last.toLocaleDateString('es-CO') : '—',
  }))
}

