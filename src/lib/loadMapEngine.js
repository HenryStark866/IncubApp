/**
 * Motor de clasificación por cinta de color y mapa de cargue Petersime (12 carros).
 *
 * MODELO DE DATOS
 *  - Un CARRO es la unidad física que mueve el operario. Tiene número, color libre
 *    (cinta/etiqueta del carro) y uno o VARIOS LOTES dentro (segmentos de bandejas).
 *  - Un CARGUE es un grupo de 12 carros que entra a una máquina Petersime.
 *
 * NORMA DE UBICACIÓN (Petersime · balance térmico)
 * Referencia: Petersime, «How to correctly load incubators with eggs from different flocks».
 *  - Columna CENTRAL de cada compartimento → huevos de MENOR producción de calor
 *    (almacenamiento prolongado / fechas más viejas). Reciben calor indirecto de los vecinos.
 *  - Columna junto al VENTILADOR central (serpentín) → huevos de MAYOR producción de calor
 *    (fechas más nuevas, mayor masa viva).
 *  - Columna junto a la PARED → producción de calor INTERMEDIA.
 *
 * REGLA CRÍTICA: la máquina se carga SIMÉTRICAMENTE — cada zona debe tener el mismo
 * número de carros a lado y lado del ventilador, o la resistencia al aire se
 * desbalancea. Por eso las zonas son COLUMNAS, no lados.
 *
 * Máquina: Petersime belga, 2 compartimentos × (3 fondo + 3 frente) = 12 carros.
 *
 * PONDERACIÓN TÉRMICA DE 3 FACTORES (2026-07-26, pedido explícito de Henry,
 * norma real Petersime «flock fertility, flock age, storage time»):
 *  - FERTILIDAD de la parvada (mayor fertilidad → más calor). Se estima de la
 *    edad de la parvada en semanas (30–44 sem = parvada "prime" = fertilidad
 *    alta) vía el registro flock_lots (src/lib/flockLots.js) — el coordinador
 *    NO vuelve a digitar la edad cada vez que el lote entra a clasificación;
 *    el sistema ya la conoce y la va sumando en el tiempo.
 *  - TIPO DE HUEVO 1–5 como proxy de tamaño/masa (5 = huevo más grande → más
 *    energía de yema → más calor; 1 = más pequeño → menos calor).
 *  - ALMACENAMIENTO: huevo más fresco produce calor antes; huevo muy
 *    almacenado lo difiere → menos calor AHORA (ventana de referencia 10 días).
 * Los tres se combinan en `computeHeatScore()` con pesos ~35/30/35%. Si un
 * carro no tiene dato de alguno de los factores, ese factor simplemente no
 * pesa (se redistribuye entre los que sí hay); si no hay NINGÚN dato, el
 * carro cae al respaldo anterior (orden por fecha) y cualquier carro sin
 * datos suficientes se trata como calor NEUTRO (va a la zona media/paredes
 * por defecto, el lugar más seguro cuando no se sabe).
 */

import {
  normalizeLotCode,
  currentFlockAgeWeeks,
  fertilityTierFromAge,
  fertilityScoreFromTier,
} from './flockLots'

/** Huevos por bandeja (estándar planta) */
export const EGGS_PER_TRAY = 336
/** Bandejas por carro completo */
export const TRAYS_PER_CART = 16
/** Carros por máquina / cargue */
export const CARTS_PER_MACHINE = 12

/** Cintas de color predefinidas → lote habitual (ampliable) */
export const TAPE_COLORS = [
  { id: 'rojo', label: 'Rojo', lotDefault: '41', hex: '#c62828', text: '#fff' },
  { id: 'rosa', label: 'Rosa', lotDefault: '42', hex: '#ec407a', text: '#fff' },
  { id: 'azul', label: 'Azul', lotDefault: '43', hex: '#1565c0', text: '#fff' },
  { id: 'verde', label: 'Verde', lotDefault: '44', hex: '#2e7d32', text: '#fff' },
  { id: 'negro', label: 'Negro', lotDefault: '46', hex: '#212121', text: '#fff' },
  { id: 'amarillo', label: 'Amarillo', lotDefault: '', hex: '#f9a825', text: '#111' },
  { id: 'naranja', label: 'Naranja', lotDefault: '', hex: '#ef6c00', text: '#fff' },
  { id: 'blanco', label: 'Blanco', lotDefault: '', hex: '#f5f5f5', text: '#111' },
  { id: 'otro', label: 'Otro', lotDefault: '', hex: '#78909c', text: '#fff' },
]

/** Color por defecto del carro cuando no se elige uno */
export const DEFAULT_CART_COLOR = '#78909c'

/** Tipos de huevo que maneja la planta (clasificación 1 a 5) */
export const EGG_TYPES = [1, 2, 3, 4, 5]

/** Normaliza el tipo de huevo a 1..5 o null si no aplica */
export function normalizeEggType(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

/**
 * Regla de fechas de la clasificación: el usuario solo dice el DÍA del mes.
 * El huevo nunca es del futuro: si el día es mayor que hoy, es del mes
 * anterior; si es menor o igual, es de este mes. Ej. (hoy 12 jul): 10 → 10 jul,
 * 20 → 20 jun. Devuelve { day, iso, label, monthOffset } o null si ese día no
 * existe en el mes que corresponde (ej. 31 cuando el mes anterior tiene 30).
 */
export function resolvePostureDay(day, base = new Date()) {
  const d = Number(day)
  if (!Number.isInteger(d) || d < 1 || d > 31) return null
  const y = base.getFullYear()
  const m = base.getMonth()
  let date
  let monthOffset
  if (d <= base.getDate()) {
    date = new Date(y, m, d)
    monthOffset = 0
  } else {
    const daysPrevMonth = new Date(y, m, 0).getDate()
    if (d > daysPrevMonth) return null
    date = new Date(y, m - 1, d)
    monthOffset = -1
  }
  return {
    day: d,
    iso: date.toLocaleDateString('sv-SE'),
    label: date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
    monthOffset,
  }
}

export const ZONE = {
  serpentin: 'serpentin',
  centro: 'centro',
  paredes: 'paredes',
}

export const ZONE_LABEL = {
  serpentin: 'Serpentín',
  centro: 'Centro',
  paredes: 'Paredes',
}

export const ZONE_HINT = {
  serpentin: 'Fechas más nuevas · mayor calor · junto al ventilador',
  centro: 'Fechas más viejas · menor calor · columna central',
  paredes: 'Fechas intermedias · calor medio · junto a la pared',
}

/** Color de trazo por zona (imagen y UI) */
export const ZONE_COLOR = {
  centro: '#f5900f',
  paredes: '#35d6e8',
  serpentin: '#7c5cff',
}

/**
 * Layout físico Petersime 12 carros (vista superior).
 * El ventilador central (pulsador) está ENTRE los dos compartimentos.
 *
 *        COMP. IZQUIERDO      ║VENT║      COMP. DERECHO
 *  fondo   1    2    3        ║    ║      10   11   12
 *  frente  4    5    6        ║    ║       7    8    9
 *          │    │    │                     │    │    │
 *        pared cent. vent.               vent. cent. pared
 */
export const MACHINE_SLOTS = [
  // izq fondo
  { pos: 1, compartment: 'left', row: 'fondo', col: 0, band: 'pared', short: 'Izq · Fondo · Pared' },
  { pos: 2, compartment: 'left', row: 'fondo', col: 1, band: 'centro', short: 'Izq · Fondo · Centro' },
  { pos: 3, compartment: 'left', row: 'fondo', col: 2, band: 'ventilador', short: 'Izq · Fondo · Ventilador' },
  // izq frente
  { pos: 4, compartment: 'left', row: 'frente', col: 0, band: 'pared', short: 'Izq · Frente · Pared' },
  { pos: 5, compartment: 'left', row: 'frente', col: 1, band: 'centro', short: 'Izq · Frente · Centro' },
  { pos: 6, compartment: 'left', row: 'frente', col: 2, band: 'ventilador', short: 'Izq · Frente · Ventilador' },
  // der frente (col 0 = el más cercano al ventilador central)
  { pos: 7, compartment: 'right', row: 'frente', col: 0, band: 'ventilador', short: 'Der · Frente · Ventilador' },
  { pos: 8, compartment: 'right', row: 'frente', col: 1, band: 'centro', short: 'Der · Frente · Centro' },
  { pos: 9, compartment: 'right', row: 'frente', col: 2, band: 'pared', short: 'Der · Frente · Pared' },
  // der fondo
  { pos: 10, compartment: 'right', row: 'fondo', col: 0, band: 'ventilador', short: 'Der · Fondo · Ventilador' },
  { pos: 11, compartment: 'right', row: 'fondo', col: 1, band: 'centro', short: 'Der · Fondo · Centro' },
  { pos: 12, compartment: 'right', row: 'fondo', col: 2, band: 'pared', short: 'Der · Fondo · Pared' },
]

/**
 * Posiciones por zona — SIMÉTRICAS (2 carros por lado en cada zona).
 * Cambiar esto rompe el balance de aire de la máquina.
 */
export const ZONE_POSITIONS = {
  // Columna junto a la pared exterior — calor intermedio
  paredes: [1, 4, 9, 12],
  // Columna central de cada compartimento — menor calor (fechas viejas)
  centro: [2, 5, 8, 11],
  // Columna junto al ventilador central — mayor calor (fechas nuevas)
  serpentin: [3, 6, 7, 10],
}

/** Zona a la que pertenece una posición física */
export function zoneOfPosition(pos) {
  for (const [zone, list] of Object.entries(ZONE_POSITIONS)) {
    if (list.includes(pos)) return zone
  }
  return ZONE.centro
}

/** Descripción de ubicación en máquina para el operario */
export function machineLocationLabel(machinePos, zone) {
  const slot = MACHINE_SLOTS.find((s) => s.pos === machinePos)
  const side =
    slot?.compartment === 'left'
      ? 'Compartimento izquierdo'
      : slot?.compartment === 'right'
        ? 'Compartimento derecho'
        : 'Máquina'
  const row = slot?.row === 'fondo' ? 'Fondo' : slot?.row === 'frente' ? 'Frente' : ''
  const zoneL = ZONE_LABEL[zone] || zone || ''
  // Ej: "Pos. 5 · Centro · Comp. izquierdo · Frente"
  return `Pos. ${machinePos} · ${zoneL}${row ? ` · ${side} · ${row}` : side ? ` · ${side}` : ''}`
}

export function machineLocationShort(machinePos, zone) {
  const slot = MACHINE_SLOTS.find((s) => s.pos === machinePos)
  const zoneL = ZONE_LABEL[zone] || zone || ''
  return `Pos.${machinePos} ${zoneL}${slot?.short ? ` (${slot.short})` : ''}`
}

/**
 * Número de carro físico (el que ve el operario en la cinta/etiqueta).
 * Prioridad: cartNumber → cartLabel numérico → cartLabel texto → vacío.
 */
export function cartNumberOf(entry) {
  if (!entry) return ''
  if (entry.cartNumber != null && String(entry.cartNumber).trim() !== '') {
    return String(entry.cartNumber).trim()
  }
  const label = String(entry.cartLabel || entry.cart_label || '').trim()
  if (!label) return ''
  // "C-07", "Carro 12", "7"
  const m = label.match(/(\d+)/)
  if (m) return m[1]
  return label
}

export function formatCartNo(n) {
  if (n == null || n === '') return '—'
  return String(n)
}

export function tapeById(id) {
  return TAPE_COLORS.find((t) => t.id === id) || TAPE_COLORS.find((t) => t.id === 'otro')
}

export function eggsFromTrays(trays) {
  const t = Number(trays) || 0
  return t * EGGS_PER_TRAY
}

export function fullCartEggs() {
  return EGGS_PER_TRAY * TRAYS_PER_CART
}

/** ¿Es un color hex válido (#rgb o #rrggbb)? */
export function isHexColor(v) {
  return typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
}

/** Normaliza cualquier color de carro a hex; acepta id de cinta o hex libre. */
export function normalizeCartColor(v) {
  if (!v) return DEFAULT_CART_COLOR
  const raw = String(v).trim()
  if (isHexColor(raw)) return raw.toLowerCase()
  const tape = TAPE_COLORS.find((t) => t.id === raw.toLowerCase())
  return tape ? tape.hex : DEFAULT_CART_COLOR
}

/**
 * Color de texto legible sobre un fondo hex (luminancia relativa).
 * Evita rótulos blancos sobre amarillo o negros sobre azul oscuro.
 */
export function readableTextOn(hex) {
  const h = normalizeCartColor(hex).replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.5 ? '#111111' : '#ffffff'
}

/* ─── Lotes dentro de un carro ─────────────────────────────── */

/**
 * Normaliza un LOTE (segmento de bandejas) dentro de un carro.
 * Un lote tratado no lleva color de cinta.
 */
export function normalizeLot(raw = {}) {
  const isTreated = !!raw.isTreated || raw.kind === 'tratado'
  const trays = Math.max(0, Math.min(TRAYS_PER_CART, Number(raw.trays) || 0))
  const weightKg =
    raw.weightKg != null
      ? Number(raw.weightKg)
      : raw.weight_kg != null
        ? Number(raw.weight_kg)
        : null

  return {
    id: raw.id || `lot_${Math.random().toString(36).slice(2, 9)}`,
    lot: String(raw.lot || raw.lotNumber || raw.lote || '').trim(),
    isTreated,
    colorPrimary: isTreated ? null : raw.colorPrimary || raw.color_primary || 'rojo',
    colorSecondary: isTreated ? null : raw.colorSecondary || raw.color_secondary || null,
    trays,
    eggs: eggsFromTrays(trays),
    productionDate: raw.productionDate || raw.production_date || null,
    weightKg: Number.isFinite(weightKg) ? weightKg : null,
    eggType: normalizeEggType(raw.eggType ?? raw.egg_type),
  }
}

/**
 * Normaliza un CARRO con uno o varios lotes.
 * Acepta el formato antiguo (un carro = un lote plano) para no perder registros.
 */
export function normalizeCart(raw = {}) {
  const rawLots = Array.isArray(raw.lots) && raw.lots.length ? raw.lots : null

  // Compatibilidad: registro antiguo de un solo lote en el propio carro
  const lots = rawLots
    ? rawLots.map(normalizeLot)
    : [
        normalizeLot({
          lot: raw.lot,
          isTreated: raw.isTreated || raw.kind === 'tratado',
          colorPrimary: raw.colorPrimary || raw.color_primary,
          colorSecondary: raw.colorSecondary || raw.color_secondary,
          trays: raw.trays,
          productionDate: raw.productionDate || raw.production_date,
          weightKg: raw.weightKg ?? raw.weight_kg,
        }),
      ]

  const cartLabel = String(raw.cartLabel || raw.cart_label || '').trim()
  let cartNumber =
    raw.cartNumber != null && String(raw.cartNumber).trim() !== ''
      ? String(raw.cartNumber).trim()
      : raw.cart_number != null && String(raw.cart_number).trim() !== ''
        ? String(raw.cart_number).trim()
        : ''
  if (!cartNumber && cartLabel) {
    const m = cartLabel.match(/(\d+)/)
    cartNumber = m ? m[1] : cartLabel
  }

  const totalTrays = lots.reduce((s, l) => s + l.trays, 0)
  const totalEggs = lots.reduce((s, l) => s + l.eggs, 0)
  const treatedEggs = lots.filter((l) => l.isTreated).reduce((s, l) => s + l.eggs, 0)
  const weightKg = lots.reduce((s, l) => s + (l.weightKg || 0), 0) || null

  // Fecha representativa del carro: la MÁS VIEJA de sus lotes (rige el balance térmico:
  // el huevo con más almacenamiento manda la posición del carro).
  const dates = lots.map((l) => l.productionDate).filter(Boolean).sort()

  const color = normalizeCartColor(
    raw.color || raw.cart_color || raw.cartColor || lots.find((l) => !l.isTreated)?.colorPrimary
  )

  return {
    id: raw.id || null,
    cartLabel,
    cartNumber,
    color,
    colorName: raw.colorName || raw.color_name || null,
    lots,
    lotCount: lots.length,
    isMixed: lots.length > 1,
    isTreated: lots.every((l) => l.isTreated) && lots.length > 0,
    hasTreated: lots.some((l) => l.isTreated),
    trays: totalTrays,
    eggs: totalEggs,
    treatedEggs,
    weightKg,
    productionDate: dates[0] || null,
    latestDate: dates[dates.length - 1] || null,
    dates,
    notes: raw.notes || '',
    classifiedAt: raw.classifiedAt || raw.classified_at || new Date().toISOString(),
    classifiedBy: raw.classifiedBy || raw.classified_by || null,
    status: raw.status || 'available', // available | reserved | loaded
    loadGroup: raw.loadGroup ?? raw.load_group ?? null,
  }
}

/** Alias retrocompatible: el resto del código antiguo llamaba a esto */
export const normalizeTapeEntry = normalizeCart

/** Texto corto de los lotes de un carro: "41, 43 (mitad)" */
export function cartLotsLabel(cart) {
  if (!cart?.lots?.length) return 'sin lote'
  return cart.lots
    .map((l) => {
      const n = l.lot || '?'
      const type = l.eggType ? ` T${l.eggType}` : ''
      if (l.isTreated) return `${n} TRAT.${type}`
      return `${n} (${l.trays}b${type})`
    })
    .join(' + ')
}

export function entryLabel(entry) {
  if (!entry) return '—'
  const cart = cartNumberOf(entry)
  const cartPrefix = cart ? `Carro ${cart} · ` : ''
  const lots = entry.lots?.length ? entry.lots : [entry]
  if (lots.length > 1) {
    return `${cartPrefix}${lots.length} lotes: ${cartLotsLabel(entry)} · ${entry.trays || 0} band.`
  }
  const l = normalizeLot(lots[0] || {})
  const typeSuffix = l.eggType ? ` · Tipo ${l.eggType}` : ''
  if (l.isTreated) return `${cartPrefix}Lote ${l.lot || '?'} · TRATADO${typeSuffix}`
  const t1 = tapeById(l.colorPrimary)
  const t2 = l.colorSecondary ? tapeById(l.colorSecondary) : null
  const colors = t2 ? `${t1.label}/${t2.label}` : t1.label
  return `${cartPrefix}Lote ${l.lot || '?'} · ${colors} · ${l.trays || 0} band.${typeSuffix}`
}

/**
 * Guía operario: solo número de carro → ubicación en máquina.
 * Ordenado por número de carro para lectura rápida en planta.
 */
export function buildOperatorPlacementGuide(map) {
  const rows = []
  for (const s of map?.slots || []) {
    if (!s?.entry) continue
    const e = s.entry
    const cartNo = cartNumberOf(e) || s.cartNo || '—'
    rows.push({
      cartNo,
      color: e.color || DEFAULT_CART_COLOR,
      machinePos: s.machinePos,
      zone: s.zone,
      zoneLabel: ZONE_LABEL[s.zone] || s.zone,
      location: machineLocationLabel(s.machinePos, s.zone),
      locationShort: machineLocationShort(s.machinePos, s.zone),
      lots: e.lots || [],
      lotsLabel: cartLotsLabel(e),
      trays: e.trays || 0,
      eggs: e.eggs || 0,
      productionDate: e.productionDate || '',
      isTreated: !!e.isTreated,
      isMixed: !!e.isMixed,
      heat: e.heat || null,
      heatLabel: heatBreakdownLabel(e.heat),
      cargo: e.isMixed
        ? `${e.lots.length} lotes: ${cartLotsLabel(e)} · ${(e.eggs || 0).toLocaleString('es-CO')} h`
        : e.isTreated
          ? `Lote ${e.lots?.[0]?.lot || '?'} TRATADO`
          : `Lote ${e.lots?.[0]?.lot || '?'} · ${e.trays || 0} band. · ${(e.eggs || 0).toLocaleString('es-CO')} h`,
    })
  }
  rows.sort((a, b) => {
    const na = parseInt(String(a.cartNo).replace(/\D/g, ''), 10)
    const nb = parseInt(String(b.cartNo).replace(/\D/g, ''), 10)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return String(a.cartNo).localeCompare(String(b.cartNo), 'es')
  })
  return rows
}

/**
 * Resume clasificación: lotes, fechas, huevos, carros.
 * Un lote puede repartirse en varios carros y un carro llevar varios lotes.
 */
export function summarizeClassification(entries = []) {
  const carts = entries.map(normalizeCart).filter((c) => c.status !== 'loaded')
  const byLot = new Map()
  const byDate = new Map()
  let totalEggs = 0
  let totalTrays = 0
  let treatedEggs = 0
  let mixedCarts = 0

  for (const cart of carts) {
    totalEggs += cart.eggs
    totalTrays += cart.trays
    treatedEggs += cart.treatedEggs
    if (cart.isMixed) mixedCarts += 1

    for (const l of cart.lots) {
      const lotKey = l.lot || 's/n'
      const lotRow = byLot.get(lotKey) || {
        lot: lotKey,
        eggs: 0,
        trays: 0,
        carts: new Set(),
        treated: 0,
        dates: new Set(),
        colors: new Set(),
        weightKg: 0,
      }
      lotRow.eggs += l.eggs
      lotRow.trays += l.trays
      lotRow.carts.add(cart.id || cart.cartNumber)
      if (l.isTreated) lotRow.treated += l.eggs
      if (l.productionDate) lotRow.dates.add(l.productionDate)
      if (l.colorPrimary) lotRow.colors.add(l.colorPrimary)
      if (l.colorSecondary) lotRow.colors.add(l.colorSecondary)
      if (l.weightKg) lotRow.weightKg += l.weightKg
      byLot.set(lotKey, lotRow)

      const d = l.productionDate || 's/f'
      const dateRow = byDate.get(d) || {
        date: d,
        eggs: 0,
        trays: 0,
        carts: new Set(),
        lots: new Set(),
      }
      dateRow.eggs += l.eggs
      dateRow.trays += l.trays
      dateRow.carts.add(cart.id || cart.cartNumber)
      dateRow.lots.add(lotKey)
      byDate.set(d, dateRow)
    }
  }

  const lots = [...byLot.values()].map((r) => ({
    ...r,
    carts: r.carts.size,
    dates: [...r.dates].sort(),
    colors: [...r.colors],
  }))
  const dates = [...byDate.values()]
    .map((r) => ({ ...r, carts: r.carts.size, lots: [...r.lots] }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return {
    cartCount: carts.length,
    mixedCarts,
    totalEggs,
    totalTrays,
    treatedEggs,
    lots,
    dates,
    machinesNeeded: Math.ceil(carts.length / CARTS_PER_MACHINE),
  }
}

/**
 * Ordena carros por fecha de producción representativa (viejas primero).
 * Sin fecha va al final.
 */
function sortByProductionDate(carts) {
  return [...carts].sort((a, b) => {
    const da = a.productionDate || '9999-99-99'
    const db = b.productionDate || '9999-99-99'
    if (da !== db) return da.localeCompare(db)
    const na = parseInt(String(a.cartNumber).replace(/\D/g, ''), 10) || 0
    const nb = parseInt(String(b.cartNumber).replace(/\D/g, ''), 10) || 0
    return na - nb
  })
}

/**
 * Agrupa los carros disponibles en CARGUES de 12 (FIFO por fecha).
 * Devuelve [{ index, carts, complete }] — `complete` indica si llegó a 12.
 */
export function buildLoadGroups(availableCarts = [], size = CARTS_PER_MACHINE) {
  const sorted = sortByProductionDate(availableCarts.map(normalizeCart))
  const groups = []
  for (let i = 0; i < sorted.length; i += size) {
    const chunk = sorted.slice(i, i + size)
    groups.push({
      index: groups.length,
      carts: chunk,
      complete: chunk.length === size,
      totalEggs: chunk.reduce((s, c) => s + c.eggs, 0),
      totalTrays: chunk.reduce((s, c) => s + c.trays, 0),
    })
  }
  return groups
}

function daysSince(dateStr, today) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((today - d) / 86400000))
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

/**
 * Promedio de un componente entre los lotes de un carro, ponderado por
 * bandejas. Ignora lotes sin dato; si ninguno tiene dato, devuelve null.
 */
function weightedLotScore(lots, scoreFn) {
  let wSum = 0
  let vSum = 0
  for (const l of lots || []) {
    const v = scoreFn(l)
    if (v == null || !Number.isFinite(v)) continue
    const w = Math.max(1, l.trays || 0)
    wSum += w
    vSum += v * w
  }
  return wSum > 0 ? vSum / wSum : null
}

/**
 * Score de producción de calor de un carro (0..1, mayor = más calor) según
 * los TRES factores reales de Petersime: fertilidad de la parvada, tamaño
 * del huevo (tipo 1–5) y tiempo de almacenamiento. Cada factor que no tenga
 * dato simplemente no participa (se redistribuye el peso entre los demás).
 * Devuelve null si el carro no tiene NINGÚN dato utilizable.
 */
export function computeHeatScore(cart, flockRegistry = {}, today = new Date()) {
  const parts = []

  const days = daysSince(cart.productionDate, today)
  if (days != null) {
    parts.push({ key: 'almacenamiento', label: 'Almacenamiento', weight: 0.35, value: clamp01(1 - days / 10) })
  }

  const massScore = weightedLotScore(cart.lots, (l) =>
    l.eggType ? clamp01((l.eggType - 1) / 4) : null
  )
  if (massScore != null) {
    parts.push({ key: 'tipo_huevo', label: 'Tamaño de huevo', weight: 0.3, value: massScore })
  }

  const fertScore = weightedLotScore(cart.lots, (l) => {
    const entry = flockRegistry[normalizeLotCode(l.lot)]
    if (!entry) return null
    const weeks = currentFlockAgeWeeks(entry, today)
    return fertilityScoreFromTier(fertilityTierFromAge(weeks))
  })
  if (fertScore != null) {
    parts.push({ key: 'fertilidad', label: 'Fertilidad de parvada', weight: 0.35, value: fertScore })
  }

  if (!parts.length) return null
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
  const score = parts.reduce((s, p) => s + p.value * (p.weight / totalWeight), 0)
  return { score, breakdown: parts }
}

/** Texto corto de por qué un carro quedó donde quedó (revisión coordinador). */
export function heatBreakdownLabel(heat) {
  if (!heat) return 'Sin datos suficientes de fertilidad/tipo/almacenamiento → zona media por defecto'
  return heat.breakdown.map((p) => `${p.label} ${(p.value * 100).toFixed(0)}%`).join(' · ')
}

/**
 * Ordena carros de MENOR a MAYOR producción de calor combinando fertilidad,
 * tipo de huevo y almacenamiento. Un carro sin datos suficientes se trata
 * como calor NEUTRO (queda hacia la zona media), no como el más frío ni el
 * más caliente — es la posición más segura cuando no se conoce el dato.
 */
function sortByHeatScore(carts, flockRegistry, today = new Date()) {
  const NEUTRAL = 0.5
  const scored = carts.map((c) => ({ cart: c, heat: computeHeatScore(c, flockRegistry, today) }))
  scored.sort((a, b) => {
    const sa = a.heat?.score ?? NEUTRAL
    const sb = b.heat?.score ?? NEUTRAL
    if (sa !== sb) return sa - sb
    const da = a.cart.productionDate || '9999-99-99'
    const db = b.cart.productionDate || '9999-99-99'
    if (da !== db) return da.localeCompare(db)
    const na = parseInt(String(a.cart.cartNumber).replace(/\D/g, ''), 10) || 0
    const nb = parseInt(String(b.cart.cartNumber).replace(/\D/g, ''), 10) || 0
    return na - nb
  })
  return scored.map((s) => ({ ...s.cart, heat: s.heat }))
}

/**
 * Reparte hasta 12 carros (heat-sorted ascendente) en las tres zonas
 * térmicas. Devuelve { oldest, mid, newest, treatedOverflow,
 * treatedForcedToSerpentin } con máx. 4 c/u. (Nombres conservados por
 * compatibilidad: "oldest" = menor calor → centro, "newest" = mayor calor
 * → serpentín — ya no dependen solo de la fecha.)
 *
 * REGLA FIJA (pedido explícito de Henry): un carro que lleve huevo TRATADO
 * —total o parcialmente (`hasTreated`)— va SIEMPRE al CENTRO primero, sin
 * importar su puntaje de calor: el centro recibe calor indirecto de sus
 * vecinos y es la posición más segura para huevo delicado. El centro solo
 * tiene 4 posiciones físicas por cargue; si sobran tratados van a Paredes y,
 * como último recurso (>8 tratados en un mismo cargue de 12), a Serpentín
 * — ambos casos quedan marcados para que `checkLoadBalance` avise antes de
 * aprobar.
 *
 * Garantía de no-pérdida: cada carro de `take` (≤12) se empuja a EXACTAMENTE
 * una zona; como oldest y mid topan en 4 antes de escribir en newest, y
 * take.length ≤ 12, newest nunca puede recibir más de 12-4-4=4 tampoco.
 */
function splitByHeatZones(take) {
  const treated = take.filter((c) => c.hasTreated)
  const rest = take.filter((c) => !c.hasTreated)

  const oldest = [] // centro
  const mid = [] // paredes
  const newest = [] // serpentín
  const treatedOverflow = [] // tratados que no cupieron en el centro
  const treatedForcedToSerpentin = [] // tratados que ni en paredes cupieron

  for (const c of treated) {
    if (oldest.length < 4) oldest.push(c)
    else if (mid.length < 4) {
      mid.push(c)
      treatedOverflow.push(c)
    } else {
      newest.push(c)
      treatedOverflow.push(c)
      treatedForcedToSerpentin.push(c)
    }
  }
  // No tratados: coldest primero, ocupan lo que quede de cada zona en orden
  // centro → paredes → serpentín (equivalente al reparto por tercios previo
  // cuando no hay tratados, porque `rest` ya viene ordenado por calor).
  for (const c of rest) {
    if (oldest.length < 4) oldest.push(c)
    else if (mid.length < 4) mid.push(c)
    else newest.push(c)
  }

  return { oldest, mid, newest, treatedOverflow, treatedForcedToSerpentin }
}

/**
 * Construye un mapa de 12 carros según la norma térmica de Petersime.
 * Si hay menos de 12, rellena vacíos; si hay más, toma los primeros 12 (FIFO por fecha).
 *
 * @param {object[]} availableEntries carros clasificados disponibles
 * @param {{ machineName?: string, machineId?: string, groupIndex?: number,
 *   flockRegistry?: Record<string, object> }} meta flockRegistry es el mapa
 *   lotCode→fila de flock_lots (ver src/lib/flockLots.js buildFlockRegistry)
 *   usado para estimar fertilidad; si se omite, ese factor no pesa.
 */
export function buildLoadMap(availableEntries = [], meta = {}) {
  const free = availableEntries
    .map(normalizeCart)
    .filter((e) => e.status === 'available' || !e.status || e.status === 'reserved')

  const sorted = sortByProductionDate(free) // viejas → nuevas
  const take = sorted.slice(0, CARTS_PER_MACHINE)

  // Asegurar número de carro en cada unidad (el operario se guía por este nº)
  const usedCartNums = new Set()
  for (const e of take) {
    const n = cartNumberOf(e)
    if (n) usedCartNums.add(String(n))
  }
  let autoN = 1
  const withCartNo = take.map((e) => {
    let n = cartNumberOf(e)
    if (!n) {
      while (usedCartNums.has(String(autoN))) autoN++
      n = String(autoN)
      usedCartNums.add(n)
      autoN++
    }
    return { ...e, cartNumber: n, cartLabel: e.cartLabel || `Carro ${n}` }
  })

  const heatSorted = sortByHeatScore(withCartNo, meta.flockRegistry || {})
  const { oldest, mid, newest, treatedOverflow, treatedForcedToSerpentin } =
    splitByHeatZones(heatSorted)

  /**
   * Reparte los carros de una zona sobre sus 4 posiciones físicas.
   * Las posiciones ya están definidas simétricamente (2 por compartimento),
   * así que llenarlas en orden mantiene el balance de aire.
   */
  const pad = (arr, zone) => {
    const out = arr.slice(0, 4)
    while (out.length < 4) out.push(null)
    return out.map((entry, i) => {
      const machinePos = ZONE_POSITIONS[zone][i]
      return {
        zone,
        zonePos: i + 1,
        machinePos,
        location: entry ? machineLocationLabel(machinePos, zone) : null,
        locationShort: entry ? machineLocationShort(machinePos, zone) : null,
        cartNo: entry ? cartNumberOf(entry) : null,
        entry,
      }
    })
  }

  const slots = [
    ...pad(oldest, ZONE.centro),
    ...pad(mid, ZONE.paredes),
    ...pad(newest, ZONE.serpentin),
  ].sort((a, b) => a.machinePos - b.machinePos)

  const usedIds = withCartNo.map((e) => e.id).filter(Boolean)
  const summary = summarizeClassification(withCartNo)
  const placementGuide = buildOperatorPlacementGuide({ slots })
  const balance = checkLoadBalance({
    slots,
    treatedOverflowCount: treatedOverflow.length,
    treatedForcedToSerpentinCount: treatedForcedToSerpentin.length,
  })

  return {
    id: meta.id || null,
    version: 3,
    machineId: meta.machineId || null,
    machineName: meta.machineName || 'Petersime 12 carros',
    plantId: meta.plantId || null,
    groupIndex: meta.groupIndex ?? 0,
    createdAt: new Date().toISOString(),
    status: 'draft', // draft | pending_approval | approved | ordered | completed | rejected
    slots,
    cartIds: usedIds,
    summary,
    placementGuide,
    balance,
    rules: {
      centro: ZONE_HINT.centro,
      serpentin: ZONE_HINT.serpentin,
      paredes: ZONE_HINT.paredes,
      eggsPerTray: EGGS_PER_TRAY,
      traysPerCart: TRAYS_PER_CART,
      cartsPerMachine: CARTS_PER_MACHINE,
      operatorView: 'Solo número de carro → ubicación en máquina',
      source:
        'Petersime · carga balanceada por producción de calor (fertilidad de parvada + tipo de huevo + almacenamiento)',
    },
  }
}

/**
 * Verifica el balance de la máquina antes de aprobar el cargue.
 * Petersime: la máquina debe cargarse simétricamente y COMPLETA.
 */
export function checkLoadBalance(map) {
  const slots = map?.slots || []
  const treatedOverflowCount = map?.treatedOverflowCount || 0
  const treatedForcedToSerpentinCount = map?.treatedForcedToSerpentinCount || 0
  const filled = slots.filter((s) => s.entry)
  const left = filled.filter(
    (s) => MACHINE_SLOTS.find((m) => m.pos === s.machinePos)?.compartment === 'left'
  ).length
  const right = filled.length - left

  const perZone = {}
  for (const z of Object.keys(ZONE_POSITIONS)) {
    const inZone = filled.filter((s) => s.zone === z)
    const zLeft = inZone.filter(
      (s) => MACHINE_SLOTS.find((m) => m.pos === s.machinePos)?.compartment === 'left'
    ).length
    perZone[z] = { total: inZone.length, left: zLeft, right: inZone.length - zLeft }
  }

  const warnings = []
  if (filled.length === 0) {
    warnings.push('No hay carros asignados.')
  } else {
    if (filled.length < CARTS_PER_MACHINE) {
      warnings.push(
        `Máquina incompleta: ${filled.length} de ${CARTS_PER_MACHINE} carros. Petersime desaconseja iniciar un ciclo sin carga completa.`
      )
    }
    if (left !== right) {
      warnings.push(
        `Carga asimétrica: ${left} carro(s) a la izquierda y ${right} a la derecha del ventilador. La resistencia al aire queda desbalanceada.`
      )
    }
    for (const [z, v] of Object.entries(perZone)) {
      if (v.total > 0 && v.left !== v.right) {
        warnings.push(
          `Zona ${ZONE_LABEL[z]}: ${v.left} a la izquierda vs. ${v.right} a la derecha. Debe quedar pareja.`
        )
      }
    }
    if (treatedForcedToSerpentinCount > 0) {
      warnings.push(
        `${treatedForcedToSerpentinCount} carro(s) TRATADO(s) no cupieron en Centro ni Paredes y quedaron en Serpentín (la zona de mayor calor). Reduzca el nº de carros tratados por cargue o revise la ubicación manualmente.`
      )
    } else if (treatedOverflowCount > 0) {
      warnings.push(
        `${treatedOverflowCount} carro(s) TRATADO(s) no cupieron en el Centro (máx. 4) y quedaron en Paredes.`
      )
    }
  }

  return {
    ok: warnings.length === 0,
    filled: filled.length,
    left,
    right,
    perZone,
    treatedOverflowCount,
    treatedForcedToSerpentinCount,
    warnings,
  }
}

/**
 * Genera imagen PNG del mapa (canvas) y devuelve dataURL + Blob.
 * Vista operario: número de carro grande + color del carro + ubicación en máquina.
 */
export function renderLoadMapImage(map, opts = {}) {
  const W = opts.width || 1240
  const H = opts.height || 980
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Fondo
  ctx.fillStyle = '#0b1428'
  ctx.fillRect(0, 0, W, H)

  // Título
  ctx.fillStyle = '#e8eefc'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.fillText('MAPA DE CARGUE — Nº carro → ubicación', 32, 40)
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillStyle = '#8fa3c8'
  ctx.fillText(
    `${map.machineName || 'Incubadora'} · ${new Date(map.createdAt || Date.now()).toLocaleString('es-CO')}`,
    32,
    64
  )
  ctx.fillText(
    'Operario: busque el número del carro y colóquelo en la posición indicada de la máquina.',
    32,
    86
  )

  // Leyenda zonas
  const legend = [
    { z: 'centro', c: ZONE_COLOR.centro, t: 'Centro (fechas viejas)' },
    { z: 'paredes', c: ZONE_COLOR.paredes, t: 'Paredes (intermedias)' },
    { z: 'serpentin', c: ZONE_COLOR.serpentin, t: 'Serpentín (nuevas)' },
  ]
  legend.forEach((L, i) => {
    const x = 32 + i * 230
    ctx.fillStyle = L.c
    ctx.fillRect(x, 100, 16, 16)
    ctx.fillStyle = '#c5d0e6'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(L.t, x + 22, 113)
  })

  // Aviso de balance (Petersime)
  const balance = map.balance || checkLoadBalance(map)
  if (!balance.ok) {
    ctx.fillStyle = '#f0b34a'
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.fillText(`⚠ ${balance.warnings[0]}`, 32, 132)
  } else {
    ctx.fillStyle = '#57d9a3'
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.fillText('✓ Carga balanceada y completa (12/12, simétrica)', 32, 132)
  }

  const topY = 148

  // Dos compartimentos — celdas con CARRO grande
  const drawComp = (title, x0, y0, positions) => {
    const cw = 560
    const ch = 380
    ctx.strokeStyle = '#1c2c52'
    ctx.lineWidth = 2
    ctx.strokeRect(x0, y0, cw, ch)
    ctx.fillStyle = '#8fa3c8'
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillText(title, x0 + 12, y0 + 22)

    const cellW = 160
    const cellH = 140
    const gap = 12
    const startY = y0 + 40

    const grid = [
      [positions[0], positions[1], positions[2]],
      [positions[3], positions[4], positions[5]],
    ]
    const rowLabels = ['Fondo', 'Frente']

    grid.forEach((row, ri) => {
      ctx.fillStyle = '#6d7688'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(rowLabels[ri], x0 + 10, startY + ri * (cellH + gap) - 4)

      row.forEach((pos, ci) => {
        const slot = (map.slots || []).find((s) => s.machinePos === pos)
        const x = x0 + 36 + ci * (cellW + gap)
        const y = startY + ri * (cellH + gap)
        const zone = slot?.zone || zoneOfPosition(pos)
        const border = ZONE_COLOR[zone] || ZONE_COLOR.centro

        ctx.fillStyle = '#101d3a'
        ctx.fillRect(x, y, cellW, cellH)
        ctx.strokeStyle = border
        ctx.lineWidth = 3
        ctx.strokeRect(x, y, cellW, cellH)

        // Ubicación máquina (pequeña)
        ctx.fillStyle = border
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.fillText(`UBICACIÓN Pos. ${pos}`, x + 8, y + 16)
        ctx.fillStyle = '#8fa3c8'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText(ZONE_LABEL[zone] || zone, x + 8, y + 30)

        const e = slot?.entry
        if (!e) {
          ctx.fillStyle = '#4a5568'
          ctx.font = '14px system-ui, sans-serif'
          ctx.fillText('— vacío —', x + 8, y + 80)
          return
        }

        const cartNo = slot.cartNo || cartNumberOf(e) || '?'
        const cartColor = normalizeCartColor(e.color)

        // Banda de color del carro (identificación física inmediata)
        ctx.fillStyle = cartColor
        ctx.fillRect(x + 3, y + 38, cellW - 6, 40)

        // NÚMERO DE CARRO (protagonista) sobre su color
        ctx.fillStyle = readableTextOn(cartColor)
        ctx.font = 'bold 30px system-ui, sans-serif'
        ctx.fillText(`CARRO ${cartNo}`, x + 10, y + 68)

        // Qué lleva (referencia secundaria) — soporta varios lotes
        ctx.fillStyle = '#c5d0e6'
        ctx.font = '11px system-ui, sans-serif'
        const lots = e.lots || []
        if (lots.length > 1) {
          ctx.fillStyle = '#fdc15c'
          ctx.font = 'bold 11px system-ui, sans-serif'
          ctx.fillText(`${lots.length} LOTES EN ESTE CARRO`, x + 8, y + 94)
          ctx.fillStyle = '#c5d0e6'
          ctx.font = '10px system-ui, sans-serif'
          lots.slice(0, 3).forEach((l, li) => {
            const txt = l.isTreated
              ? `• Lote ${l.lot} · TRATADO`
              : `• Lote ${l.lot} · ${l.trays}b · ${l.productionDate || 's/f'}`
            ctx.fillText(txt, x + 8, y + 108 + li * 12)
          })
          if (lots.length > 3) {
            ctx.fillText(`… +${lots.length - 3} más`, x + 8, y + 108 + 3 * 12)
          }
        } else {
          const l = lots[0] || {}
          // Nº de lote metido en el color de su cinta (chip con el número dentro)
          const tape = l.isTreated ? { hex: '#607d8b', text: '#fff' } : tapeById(l.colorPrimary)
          const lotTxt = l.isTreated ? `${l.lot} TRAT.` : String(l.lot || '?')
          ctx.font = 'bold 13px system-ui, sans-serif'
          const chipW = Math.max(34, ctx.measureText(lotTxt).width + 14)
          ctx.fillStyle = tape.hex
          ctx.fillRect(x + 8, y + 84, chipW, 18)
          ctx.fillStyle = tape.text
          ctx.fillText(lotTxt, x + 15, y + 97)
          ctx.fillStyle = '#c5d0e6'
          ctx.font = '11px system-ui, sans-serif'
          ctx.fillText(`Lote · ${l.trays || 0} band.`, x + 8 + chipW + 6, y + 97)

          ctx.fillStyle = '#8fa3c8'
          ctx.font = '11px system-ui, sans-serif'
          ctx.fillText(
            `${(e.eggs || 0).toLocaleString('es-CO')} huevos${e.productionDate ? ` · ${e.productionDate}` : ''}`,
            x + 8,
            y + 116
          )
        }
      })
    })
  }

  drawComp('Compartimento izquierdo', 24, topY, [1, 2, 3, 4, 5, 6])
  drawComp('Compartimento derecho', 616, topY, [10, 11, 12, 7, 8, 9])

  // Eje del ventilador central (referencia de simetría)
  const fanX = 24 + 560 + (616 - 24 - 560) / 2
  ctx.strokeStyle = '#7c5cff'
  ctx.setLineDash([6, 6])
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(fanX, topY)
  ctx.lineTo(fanX, topY + 380)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.save()
  ctx.translate(fanX - 6, topY + 200)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = '#7c5cff'
  ctx.font = 'bold 10px system-ui, sans-serif'
  ctx.fillText('VENTILADOR CENTRAL', -60, 0)
  ctx.restore()

  // Tabla guía rápida: Carro → Ubicación
  const guide = map.placementGuide || buildOperatorPlacementGuide(map)
  const tableTop = topY + 412
  ctx.fillStyle = '#e8eefc'
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillText('Guía rápida para el operario (nº carro → dónde va)', 32, tableTop)

  ctx.fillStyle = '#1c2c52'
  ctx.fillRect(24, tableTop + 12, W - 48, 28)
  ctx.fillStyle = '#8fa3c8'
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.fillText('CARRO', 56, tableTop + 30)
  ctx.fillText('UBICACIÓN EN MÁQUINA', 170, tableTop + 30)
  ctx.fillText('LOTE(S) / CARGA', 560, tableTop + 30)

  let y = tableTop + 48
  const rowH = 24
  guide.slice(0, 12).forEach((r, i) => {
    ctx.fillStyle = i % 2 === 0 ? '#101d3a' : '#0d1830'
    ctx.fillRect(24, y - 15, W - 48, rowH)

    // Punto de color del carro
    const c = normalizeCartColor(r.color)
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(40, y - 4, 7, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillText(String(r.cartNo), 56, y)
    ctx.fillStyle = ZONE_COLOR[r.zone] || '#35d6e8'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(r.locationShort || r.location, 170, y)
    ctx.fillStyle = r.isMixed ? '#fdc15c' : '#c5d0e6'
    ctx.font = r.isMixed ? 'bold 12px system-ui, sans-serif' : '12px system-ui, sans-serif'
    ctx.fillText(r.cargo || '', 560, y)
    y += rowH
  })

  ctx.fillStyle = '#6d7688'
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillText(
    'Solo fíjese en el NÚMERO y COLOR DEL CARRO y la POSICIÓN. No reubicar sin autorización del coordinador.',
    32,
    H - 20
  )

  const dataUrl = canvas.toDataURL('image/png')
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve({ dataUrl, blob, width: W, height: H })
      },
      'image/png',
      0.92
    )
  })
}

/**
 * Descarga el PNG del mapa.
 */
export async function downloadLoadMapImage(map, filename) {
  const { dataUrl, blob } = await renderLoadMapImage(map)
  const a = document.createElement('a')
  if (blob) {
    a.href = URL.createObjectURL(blob)
  } else {
    a.href = dataUrl
  }
  a.download = filename || `mapa-cargue-${Date.now()}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  return { dataUrl, blob }
}

/**
 * Texto de orden de cargue para el operario.
 * Enfoque: número de carro → ubicación (sin distraer con detalles de clasificación).
 */
export function buildLoadOrderText(map) {
  const guide = map.placementGuide || buildOperatorPlacementGuide(map)
  const lines = [
    `ORDEN DE CARGUE — ${map.machineName || 'Petersime'}`,
    `Generado: ${new Date(map.createdAt || Date.now()).toLocaleString('es-CO')}`,
    '',
    'INSTRUCCIÓN AL OPERARIO:',
    '  1) Busque el carro por su NÚMERO (y color de etiqueta).',
    '  2) Colóquelo en la UBICACIÓN de la máquina indicada.',
    '  3) No cambie posiciones sin orden del coordinador.',
    '',
    '──── CARRO  →  UBICACIÓN ────',
  ]
  for (const r of guide) {
    lines.push(`  Carro ${r.cartNo}  →  ${r.location}`)
  }
  if (!guide.length) {
    lines.push('  (sin carros asignados)')
  }
  lines.push('', '──── Referencia de carga (opcional) ────')
  for (const r of guide) {
    lines.push(`  Carro ${r.cartNo}: ${r.cargo}`)
  }

  const balance = map.balance || checkLoadBalance(map)
  if (!balance.ok) {
    lines.push('', '──── AVISOS DE BALANCE (Petersime) ────')
    for (const w of balance.warnings) lines.push(`  ⚠ ${w}`)
  }

  lines.push(
    '',
    `Total: ${(map.summary?.totalEggs || 0).toLocaleString('es-CO')} huevos · ${map.summary?.totalTrays || 0} bandejas · ${guide.length} carros`
  )
  return lines.join('\n')
}
