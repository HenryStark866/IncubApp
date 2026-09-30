/**
 * Transferencia de incubadora a nacedoras (30-09-2026).
 * El operario elige la INCUBADORA de origen; los lotes salen solos de lo que se cargó en
 * ella (setter_loads) y los carros de su mapa de cargue (load_maps). Luego toca las
 * nacedoras en el orden que le indica el turnero y los carros se reparten en ese orden.
 * Funciones puras, probadas sin red.
 * Henry Stark Desarrollador
 */

const ms = (v) => {
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}
const DAY = 86400000

/** ¿Este cargue ya salió de su incubadora? */
export function loadTransferred(load, transfers = []) {
  const at = ms(load.loaded_at)
  return transfers.some((t) => {
    if (ms(t.transferred_at) < at) return false
    // Transferencia nueva: por incubadora de origen.
    if (t.source_machine_id) return t.source_machine_id === load.machine_id
    // Transferencias anteriores (por lote, sin incubadora): se respeta el lote.
    return String(t.lote || '').trim() === String(load.lote || '').trim()
  })
}

/**
 * Incubadoras con huevo pendiente de transferir, con sus lotes.
 * @returns {Array<{ machine, machineId, plantId, loads, lots: string[], batchId, cycleStart, loadedAt, days }>}
 */
export function pendingSetters({ loads = [], transfers = [], machines = [], now = new Date() }) {
  const byId = new Map(machines.map((m) => [m.id, m]))
  const groups = new Map()
  for (const l of loads) {
    if (!l.machine_id || loadTransferred(l, transfers)) continue
    const g = groups.get(l.machine_id) || {
      machineId: l.machine_id,
      machine: byId.get(l.machine_id) || null,
      plantId: l.plant_id,
      loads: [],
      lots: [],
      batchIds: new Set(),
      cycleStart: null,
      loadedAt: null,
    }
    g.loads.push(l)
    const lote = String(l.lote || '').trim()
    if (lote && !g.lots.includes(lote)) g.lots.push(lote)
    if (l.batch_id) g.batchIds.add(l.batch_id)
    const start = l.cycle_start_at || l.loaded_at
    if (start && (!g.cycleStart || ms(start) < ms(g.cycleStart))) g.cycleStart = start
    if (l.loaded_at && (!g.loadedAt || ms(l.loaded_at) < ms(g.loadedAt))) g.loadedAt = l.loaded_at
    groups.set(l.machine_id, g)
  }
  return [...groups.values()]
    .map(({ batchIds, ...g }) => ({
      ...g,
      batchId: batchIds.size === 1 ? [...batchIds][0] : null,
      days: g.cycleStart ? (now.getTime() - ms(g.cycleStart)) / DAY : null,
    }))
    .sort((a, b) => ms(a.cycleStart) - ms(b.cycleStart))
}

/**
 * Carros del mapa de cargue de la incubadora (load_maps.payload.slots), en orden de
 * número de carro.
 */
export function cartsFromMap(map) {
  const slots = map?.payload?.slots || map?.slots || []
  const carts = []
  const seen = new Set()
  for (const s of slots) {
    const e = s?.entry
    if (!e) continue
    const lots = (e.lots?.length ? e.lots : [e])
      .map((l) => ({
        lot: String(l.lot ?? l.lote ?? '').trim(),
        trays: Number(l.trays) || 0,
        eggs: Number(l.eggs) || 0,
      }))
      .filter((l) => l.lot)
    const no = String(e.cartNumber ?? s.cartNo ?? '').trim()
    // Dos carros con el mismo número (error de digitación) no deben pisarse al repartir.
    let key = no || `pos-${s.machinePos}`
    if (seen.has(key)) key = `${key}@${s.machinePos ?? carts.length}`
    seen.add(key)
    carts.push({
      key,
      cartNo: no || '?',
      color: e.color || null,
      trays: Number(e.trays) || lots.reduce((a, l) => a + l.trays, 0),
      eggs: Number(e.eggs) || lots.reduce((a, l) => a + l.eggs, 0),
      lots,
      machinePos: s.machinePos ?? null,
    })
  }
  const num = (c) => {
    const n = parseInt(c.cartNo, 10)
    return Number.isNaN(n) ? 999 : n
  }
  return carts.sort((a, b) => num(a) - num(b) || String(a.key).localeCompare(String(b.key)))
}

/**
 * Reparte los carros, en su orden, entre las nacedoras en el orden elegido: bloques
 * seguidos y parejos (12 carros en 3 nacedoras → 4, 4 y 4; en 5 → 3, 3, 2, 2, 2).
 * @returns {Record<string, string>} key del carro → id de la nacedora
 */
export function distributeCarts(carts = [], hatcherIds = []) {
  const out = {}
  const k = hatcherIds.length
  if (!k) return out
  const base = Math.floor(carts.length / k)
  let extra = carts.length % k
  let i = 0
  hatcherIds.forEach((h) => {
    const size = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    for (let j = 0; j < size && i < carts.length; j += 1, i += 1) out[carts[i].key] = h
  })
  return out
}

/** Lo que recibe cada nacedora, en el orden del turnero. */
export function buildAllocations({ carts = [], hatcherIds = [], assignment = {}, lots = [] }) {
  if (!carts.length) {
    // Sin mapa de cargue: cada nacedora recibe la incubadora (sus lotes) en ese orden.
    return hatcherIds.map((id, i) => ({
      order: i + 1,
      hatcher_id: id,
      carts: [],
      lots: lots.map((lot) => ({ lot, trays: null })),
      trays: null,
      eggs: null,
    }))
  }
  return hatcherIds.map((id, i) => {
    const mine = carts.filter((c) => assignment[c.key] === id)
    const lotMap = new Map()
    for (const c of mine) for (const l of c.lots) lotMap.set(l.lot, (lotMap.get(l.lot) || 0) + l.trays)
    return {
      order: i + 1,
      hatcher_id: id,
      carts: mine.map((c) => c.cartNo),
      lots: [...lotMap.entries()].map(([lot, trays]) => ({ lot, trays })),
      trays: mine.reduce((a, c) => a + c.trays, 0),
      eggs: mine.reduce((a, c) => a + c.eggs, 0),
    }
  })
}

/** Carros sin nacedora asignada (no se puede guardar así). */
export const unassignedCarts = (carts = [], assignment = {}, hatcherIds = []) =>
  carts.filter((c) => !hatcherIds.includes(assignment[c.key]))

/** «41 + 43» para el campo lote de la transferencia. */
export const lotsLabel = (lots = []) => [...new Set(lots.map((l) => String(l).trim()).filter(Boolean))].join(' + ')

/** Nacedoras ocupadas: recibieron huevo en los últimos `days` días. */
export function occupiedHatchers(transfers = [], now = new Date(), days = 4) {
  const since = now.getTime() - days * DAY
  const s = new Set()
  for (const t of transfers) if (ms(t.transferred_at) >= since) for (const h of t.hatcher_ids || []) s.add(h)
  return s
}
