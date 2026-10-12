/**
 * =============================================================================
 * ARCHIVO: src/lib/broilerProjection.js
 * PROPÓSITO: Proyección REAL de pollito de engorde (broiler) a partir de lo que la
 *   planta ya registra: cada cargue de incubadora (setter_loads) → su transferencia
 *   a nacedora (transfers) → su nacimiento (hatch_events). 12-10-2026.
 *
 *   - Fecha de nacimiento: inicio del ciclo (o el cargue) + 21 días; transferencia + 18.
 *   - Huevos del cargue: los del nacimiento si ya se registraron; si no, los del mapa
 *     de cargue aprobado de esa incubadora; si no, las posturas del lote.
 *   - Nacimiento esperado: el estimado que anotó el supervisor; si no, huevos × la tasa
 *     de nacimiento REAL de los últimos 90 días (pollitos / huevos de los nacimientos
 *     cerrados). Solo si la planta aún no tiene nacimientos cerrados se usa la
 *     referencia de la industria (83 %) y se avisa en pantalla.
 *   - Cuando el nacimiento se cierra, manda el dato real de pollitos.
 * No consulta nada: recibe filas y devuelve la proyección (la usa useBroilerProjection).
 * =============================================================================
 */

export const INCUBATION_DAYS = 21
export const TRANSFER_DAY = 18
/** Referencia de la industria (huevo incubable → pollito) cuando aún no hay historia */
export const REFERENCE_HATCH_RATE = 0.83
export const RATE_WINDOW_DAYS = 90

const DAY = 86_400_000
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const ms = (v) => {
  const t = Date.parse(v || '')
  return Number.isNaN(t) ? null : t
}
/** Día calendario en Bogotá (YYYY-MM-DD) */
export const dayKey = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const lotKey = (v) => String(v ?? '').trim().toUpperCase()
/** «41 + 43», «Lote 45» → ['41', '43'] / ['45'] */
const lotsOfText = (t) => [...new Set(String(t || '').match(/\d+/g) || [])]

/**
 * Tasa de nacimiento real: pollitos / huevos incubables de los nacimientos cerrados.
 * @returns {{ rate: number, source: 'real'|'referencia', samples: number, eggs: number, chicks: number }}
 */
export function historicalHatchRate(hatches = [], { now = Date.now(), days = RATE_WINDOW_DAYS } = {}) {
  const since = now - days * DAY
  let eggs = 0
  let chicks = 0
  let samples = 0
  for (const h of hatches) {
    const e = num(h.incubable_eggs)
    const c = num(h.actual_chicks)
    const at = ms(h.ended_at) ?? ms(h.started_at) ?? ms(h.created_at)
    // Un nacimiento con más pollitos que huevos es un error de digitación: no cuenta
    if (e <= 0 || c <= 0 || c > e || at == null || at < since) continue
    eggs += e
    chicks += c
    samples += 1
  }
  if (!samples) return { rate: REFERENCE_HATCH_RATE, source: 'referencia', samples: 0, eggs: 0, chicks: 0 }
  return { rate: chicks / eggs, source: 'real', samples, eggs, chicks }
}

/** Huevos de un mapa de cargue (suma de los carros) */
export function eggsOfMap(map) {
  const p = map?.payload || {}
  let eggs = 0
  for (const s of p.slots || []) eggs += num(s?.entry?.eggs)
  if (eggs > 0) return eggs
  return num(p.totalEggs) || num(p.totals?.eggs) || num(p.eggs)
}

/**
 * Huevos de un cargue: mapa aprobado de esa incubadora (de los 5 días previos al cargue)
 * o, si no hay, las posturas del lote repartidas entre los cargues que comparten el lote.
 */
export function eggsOfLoad(load, { maps = [], lotsByCode = new Map(), loadsPerLot = new Map() } = {}) {
  const at = ms(load.loaded_at) ?? ms(load.created_at)
  if (at != null) {
    let best = null
    for (const m of maps) {
      if (!m.machine_id || m.machine_id !== load.machine_id) continue
      const t = ms(m.ordered_at) ?? ms(m.approved_at) ?? ms(m.created_at)
      if (t == null || t > at + DAY || t < at - 5 * DAY) continue
      if (!best || Math.abs(t - at) < Math.abs(best.t - at)) best = { m, t }
    }
    const fromMap = best ? eggsOfMap(best.m) : 0
    if (fromMap > 0) return { eggs: fromMap, source: 'mapa' }
  }
  let eggs = 0
  for (const code of lotsOfText(load.lote)) {
    const lot = lotsByCode.get(lotKey(code))
    if (!lot) continue
    const total = Array.isArray(lot.postures)
      ? lot.postures.reduce((s, x) => s + num(x?.eggs), 0)
      : num(lot.postures)
    eggs += total / Math.max(1, loadsPerLot.get(lotKey(code)) || 1)
  }
  if (eggs > 0) return { eggs: Math.round(eggs), source: 'lote' }
  return { eggs: 0, source: 'sin-dato' }
}

/** Quita cargues repetidos (misma incubadora y mismo instante de cargue) */
function uniqueLoads(loads) {
  const seen = new Map()
  for (const l of loads) {
    const k = `${l.machine_id || ''}|${l.loaded_at || l.created_at || ''}`
    if (!seen.has(k)) seen.set(k, l)
  }
  return [...seen.values()]
}

/**
 * @param {object} p
 * @param {object[]} p.loads      setter_loads
 * @param {object[]} p.transfers  transfers
 * @param {object[]} p.hatches    hatch_events (también los de los últimos 90 días para la tasa)
 * @param {object[]} [p.maps]     load_maps con machine_id y payload
 * @param {object[]} [p.lots]     incubation_lots con code y postures
 * @param {object[]} [p.machines] para el código de la incubadora
 * @param {number}   [p.now]
 * @param {number}   [p.horizonDays] días hacia adelante del calendario
 */
export function projectBroiler({ loads = [], transfers = [], hatches = [], maps = [], lots = [], machines = [], now = Date.now(), horizonDays = 21 } = {}) {
  const rate = historicalHatchRate(hatches, { now })
  const codeOf = new Map(machines.map((m) => [m.id, m.code || m.name || '']))
  const lotsByCode = new Map(lots.map((l) => [lotKey(l.code), l]))
  const unique = uniqueLoads(loads)
  const loadsPerLot = new Map()
  for (const l of unique) for (const c of lotsOfText(l.lote)) loadsPerLot.set(lotKey(c), (loadsPerLot.get(lotKey(c)) || 0) + 1)

  const usedTransfers = new Set()
  const usedHatches = new Set()
  const cycles = []
  const sortedLoads = unique
    .map((l) => ({ l, start: ms(l.cycle_start_at) ?? ms(l.loaded_at) ?? ms(l.created_at) }))
    .filter((x) => x.start != null)
    .sort((a, b) => a.start - b.start)

  for (const { l, start } of sortedLoads) {
    const hatchDue = start + INCUBATION_DAYS * DAY
    // Ciclos ya nacidos hace más de 3 días no son proyección: son historia
    if (hatchDue < now - 3 * DAY) continue
    const lotsOfLoad = lotsOfText(l.lote)
    // Transferencia: la de esa incubadora (desde 30-09) o, antes, la del mismo lote; después del cargue
    const transfer = transfers
      .filter((t) => !usedTransfers.has(t.id))
      .filter((t) => {
        const tt = ms(t.transferred_at) ?? ms(t.created_at)
        if (tt == null || tt < start + 14 * DAY || tt > start + 21 * DAY) return false
        if (t.source_machine_id) return t.source_machine_id === l.machine_id
        return lotsOfText(t.lote).some((c) => lotsOfLoad.includes(c))
      })
      .sort((a, b) => (ms(a.transferred_at) ?? 0) - (ms(b.transferred_at) ?? 0))[0]
    if (transfer) usedTransfers.add(transfer.id)
    const hatch = hatches
      .filter((h) => !usedHatches.has(h.id))
      .find((h) => {
        if (transfer && h.transfer_id) return h.transfer_id === transfer.id
        const ht = ms(h.scheduled_at) ?? ms(h.started_at) ?? ms(h.created_at)
        return ht != null && Math.abs(ht - hatchDue) < 3 * DAY && lotsOfText(h.lote).some((c) => lotsOfLoad.includes(c))
      })
    if (hatch) usedHatches.add(hatch.id)

    const fromLoad = eggsOfLoad(l, { maps, lotsByCode, loadsPerLot })
    const eggs = num(hatch?.incubable_eggs) || fromLoad.eggs
    const eggsSource = num(hatch?.incubable_eggs) ? 'nacimiento' : fromLoad.source
    const actual = hatch && hatch.actual_chicks != null && num(hatch.actual_chicks) > 0 ? num(hatch.actual_chicks) : null
    const estimated = num(hatch?.estimated_chicks) || null
    const projected = estimated ?? Math.round(eggs * rate.rate)
    const hatchAt = ms(hatch?.ended_at) ?? ms(hatch?.started_at) ?? ms(hatch?.scheduled_at) ?? hatchDue

    let stage = 'incubando'
    if (transfer) stage = 'nacedora'
    if (hatch?.status === 'in_progress') stage = 'naciendo'
    if (actual != null || hatch?.status === 'completed') stage = 'nacido'

    cycles.push({
      id: l.id,
      lote: l.lote || '—',
      machineId: l.machine_id,
      machine: codeOf.get(l.machine_id) || '—',
      loadedAt: new Date(start).toISOString(),
      transferDue: new Date(start + TRANSFER_DAY * DAY).toISOString(),
      transferredAt: transfer ? transfer.transferred_at || transfer.created_at : null,
      hatchDue: new Date(hatchDue).toISOString(),
      hatchDate: dayKey(hatchAt),
      day: Math.max(0, Math.min(INCUBATION_DAYS, Math.floor((now - start) / DAY))),
      stage,
      eggs,
      eggsSource,
      projected,
      projectedSource: estimated != null ? 'estimado' : rate.source === 'real' ? 'tasa-real' : 'referencia',
      actual,
      hatchId: hatch?.id || null,
    })
  }

  // Calendario de nacimientos: hoy y los próximos días
  const today = dayKey(now)
  const calendar = []
  for (let i = -3; i <= horizonDays; i++) {
    const d = dayKey(now + i * DAY)
    const list = cycles.filter((c) => c.hatchDate === d)
    if (i < 0 && !list.length) continue
    calendar.push({
      date: d,
      isToday: d === today,
      projected: list.reduce((s, c) => s + c.projected, 0),
      actual: list.some((c) => c.actual != null) ? list.reduce((s, c) => s + (c.actual || 0), 0) : null,
      eggs: list.reduce((s, c) => s + c.eggs, 0),
      cycles: list.length,
    })
  }

  const inRange = (from, to) =>
    cycles.filter((c) => c.hatchDate >= dayKey(now + from * DAY) && c.hatchDate <= dayKey(now + to * DAY) && c.stage !== 'nacido')
  const sum = (list) => list.reduce((s, c) => s + c.projected, 0)
  const week = inRange(0, 6)
  const all = inRange(0, horizonDays)

  // Qué tan bien proyectamos: nacimientos cerrados con estimado previo
  const closed = hatches.filter((h) => num(h.estimated_chicks) > 0 && num(h.actual_chicks) > 0)
  const est = closed.reduce((s, h) => s + num(h.estimated_chicks), 0)
  const act = closed.reduce((s, h) => s + num(h.actual_chicks), 0)

  return {
    rate,
    cycles,
    calendar,
    totals: {
      eggsInProcess: cycles.filter((c) => c.stage !== 'nacido').reduce((s, c) => s + c.eggs, 0),
      cyclesInProcess: cycles.filter((c) => c.stage !== 'nacido').length,
      inSetters: cycles.filter((c) => c.stage === 'incubando').length,
      inHatchers: cycles.filter((c) => c.stage === 'nacedora' || c.stage === 'naciendo').length,
      next7: sum(week),
      next21: sum(all),
      withoutEggs: cycles.filter((c) => c.stage !== 'nacido' && c.eggs <= 0).length,
    },
    accuracy: closed.length ? { samples: closed.length, estimated: est, actual: act, pct: est ? act / est : null } : null,
  }
}
