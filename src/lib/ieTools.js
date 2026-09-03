/**
 * =============================================================================
 * ARCHIVO: src/lib/ieTools.js
 * PROPÓSITO: Cálculos de ingeniería industrial (OEE proxy, Pareto, takt, scorecard).
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Utilidades de ingeniería industrial y gerencia operativa
 * (cálculos en cliente a partir de datos operativos).
 */

/** OEE proxy: disponibilidad × desempeño × calidad (0–100 cada uno). */
export function computeOeeProxy({ available = 0, total = 0, done = 0, good = 0 }) {
  const A = total > 0 ? clamp((available / total) * 100) : 0
  const P = total > 0 ? clamp((done / total) * 100) : 0
  const Q = total > 0 ? clamp((good / total) * 100) : 100
  const oee = clamp((A / 100) * (P / 100) * (Q / 100) * 100)
  return {
    availability: Math.round(A),
    performance: Math.round(P),
    quality: Math.round(Q),
    oee: Math.round(oee),
    band: oeeBand(oee),
  }
}

function oeeBand(oee) {
  if (oee >= 85) return { label: 'Clase mundial', tone: 'ok' }
  if (oee >= 70) return { label: 'Bueno', tone: 'ok' }
  if (oee >= 50) return { label: 'A mejorar', tone: 'warn' }
  return { label: 'Crítico', tone: 'danger' }
}

/** Export «clamp»: API pública de este módulo. Henry Stark Desarrollador */
export function clamp(n, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(n) || 0))
}

/** Pareto: agrupa por clave y ordena por conteo desc. */
export function pareto(items, keyFn) {
  const map = new Map()
  for (const it of items) {
    const k = keyFn(it) || '—'
    map.set(k, (map.get(k) || 0) + 1)
  }
  const rows = [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
  const total = rows.reduce((s, r) => s + r.count, 0) || 1
  let acc = 0
  return rows.map((r) => {
    acc += r.count
    return {
      ...r,
      pct: Math.round((r.count / total) * 100),
      cumPct: Math.round((acc / total) * 100),
    }
  })
}

/** Score de priorización OT: criticidad × urgencia × (sin asignar). */
export function woPriorityScore(wo) {
  const p = { critical: 40, high: 28, medium: 16, low: 8 }[wo.priority] ?? 12
  const s = { open: 20, in_progress: 12, completed: 0, cancelled: 0 }[wo.status] ?? 10
  const unassigned = wo.assigned_to ? 0 : 15
  const ageDays = wo.created_at
    ? Math.max(0, (Date.now() - new Date(wo.created_at).getTime()) / 86400000)
    : 0
  const age = Math.min(25, Math.round(ageDays * 3))
  return p + s + unassigned + age
}

/** Matriz Eisenhower a partir de score. */
export function eisenhowerQuadrant(score) {
  if (score >= 55) return { id: 'do', label: 'Hacer ya', tone: 'danger' }
  if (score >= 40) return { id: 'schedule', label: 'Planificar', tone: 'warn' }
  if (score >= 25) return { id: 'delegate', label: 'Delegar', tone: 'ok' }
  return { id: 'later', label: 'Monitorear', tone: '' }
}

/** Capacidad / personal: ratio simple. */
export function capacityRatio({ heads = 0, machines = 0, batches = 0 }) {
  const mPerPerson = heads > 0 ? (machines / heads).toFixed(1) : '—'
  const bPerPerson = heads > 0 ? (batches / heads).toFixed(1) : '—'
  let staffing = 'equilibrado'
  let tone = 'ok'
  if (heads === 0) {
    staffing = 'sin datos'
    tone = 'warn'
  } else if (machines / heads > 8) {
    staffing = 'subdotado (equipos)'
    tone = 'danger'
  } else if (machines / heads < 2 && machines > 0) {
    staffing = 'holgado'
    tone = 'ok'
  }
  return { mPerPerson, bPerPerson, staffing, tone }
}

/** Estimación de carga de ronda (minutos). */
export function roundLoadEstimate({ machines = 0, minPerMachine = 4, people = 1 }) {
  const totalMin = machines * minPerMachine
  const p = Math.max(1, people)
  const cycleMin = Math.ceil(totalMin / p)
  const feasible60 = cycleMin <= 55
  return {
    totalMin,
    cycleMin,
    people: p,
    feasible60,
    suggestion: feasible60
      ? 'La ronda cabe en la hora con el personal indicado.'
      : `Se necesitan ~${Math.ceil(totalMin / 55)} personas o reducir ${cycleMin - 55} min de ciclo.`,
  }
}

/** Takt time (segundos por unidad). */
export function taktTime({ availableMin = 60, demandUnits = 1 }) {
  const d = Math.max(1, Number(demandUnits) || 1)
  const sec = ((Number(availableMin) || 0) * 60) / d
  return {
    seconds: Math.round(sec),
    label: sec >= 60 ? `${(sec / 60).toFixed(1)} min/u` : `${Math.round(sec)} s/u`,
  }
}

/** Scorecard 0–100 por perspectiva. */
export function managementScorecard({
  openWO = 0,
  criticalWO = 0,
  members = 0,
  plants = 0,
  activeBatches = 0,
  alertChecks = 0,
  checksToday = 0,
  sensors = 0,
  activeSensors = 0,
}) {
  const ops = clamp(
    100 - criticalWO * 12 - Math.min(40, openWO * 2) - alertChecks * 5 + (activeBatches > 0 ? 8 : 0)
  )
  const people = clamp(members >= 5 ? 70 + Math.min(30, members) : members * 12)
  const quality = clamp(
    checksToday > 0
      ? 100 - (alertChecks / Math.max(1, checksToday)) * 100
      : sensors > 0
        ? 70
        : 55
  )
  const resources = clamp(
    (plants > 0 ? 40 : 10) +
      (activeSensors > 0 ? 30 : 10) +
      (activeBatches > 0 ? 20 : 5) +
      (openWO < 10 ? 10 : 0)
  )
  const overall = Math.round((ops + people + quality + resources) / 4)
  return {
    overall,
    perspectives: [
      {
        id: 'ops',
        label: 'Operación',
        score: Math.round(ops),
        hint: `${openWO} OT · ${criticalWO} prioritarias`,
      },
      {
        id: 'people',
        label: 'Personas',
        score: Math.round(people),
        hint: `${members} en plantilla`,
      },
      {
        id: 'quality',
        label: 'Calidad / control',
        score: Math.round(quality),
        hint: `${alertChecks} alertas en checks`,
      },
      {
        id: 'resources',
        label: 'Recursos',
        score: Math.round(resources),
        hint: `${plants} sedes · ${activeSensors} sensores`,
      },
    ],
  }
}

const storageKey = (orgId, name) => `incubapp_tool_${name}_${orgId || 'x'}`

/** Export «loadToolState»: API pública de este módulo. Henry Stark Desarrollador */
export function loadToolState(orgId, name, fallback) {
  try {
    const raw = localStorage.getItem(storageKey(orgId, name))
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Export «saveToolState»: API pública de este módulo. Henry Stark Desarrollador */
export function saveToolState(orgId, name, value) {
  try {
    localStorage.setItem(storageKey(orgId, name), JSON.stringify(value))
  } catch {
    /* */
  }
}
