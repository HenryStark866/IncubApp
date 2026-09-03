import { describe, it, expect } from 'vitest'
import { buildLoadMap, computeHeatScore, ZONE, normalizeCart } from '../loadMapEngine'
import { buildFlockRegistry } from '../flockLots'

function isoDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE')
}

function today() {
  return isoDaysAgo(0)
}

function makeCart({ cartNumber, lotCode, eggType, productionDate }) {
  return {
    id: `cart_${cartNumber}`,
    cartNumber: String(cartNumber),
    cartLabel: `Carro ${cartNumber}`,
    status: 'available',
    lots: [
      {
        id: `lot_${cartNumber}`,
        lot: lotCode,
        trays: 16,
        eggType,
        productionDate,
      },
    ],
  }
}

describe('computeHeatScore (3 factores Petersime: fertilidad + tipo de huevo + almacenamiento)', () => {
  it('returns null when there is no usable data at all', () => {
    const cart = { productionDate: null, lots: [{ trays: 16 }] }
    expect(computeHeatScore(cart, {})).toBeNull()
  })

  it('scores a fresh, high-fertility, large egg (type 5) cart as high heat', () => {
    const registry = buildFlockRegistry([
      { lot_code: '42', age_weeks_at: 37, reference_date: today(), status: 'active' },
    ])
    const cart = makeCart({ cartNumber: 1, lotCode: '42', eggType: 5, productionDate: today() })
    const heat = computeHeatScore(cart, registry)
    expect(heat.score).toBeGreaterThan(0.8)
  })

  it('scores an old-stored, low-fertility, small egg (type 1) cart as low heat', () => {
    const registry = buildFlockRegistry([
      { lot_code: '99', age_weeks_at: 15, reference_date: today(), status: 'active' },
    ])
    const cart = makeCart({ cartNumber: 2, lotCode: '99', eggType: 1, productionDate: isoDaysAgo(9) })
    const heat = computeHeatScore(cart, registry)
    expect(heat.score).toBeLessThan(0.2)
  })

  it('a retired flock lot does not contribute a fertility score (falls back to other factors)', () => {
    const registry = buildFlockRegistry([
      { lot_code: '41', age_weeks_at: null, reference_date: today(), status: 'retired' },
    ])
    const cart = makeCart({ cartNumber: 3, lotCode: '41', eggType: 3, productionDate: today() })
    const heat = computeHeatScore(cart, registry)
    expect(heat.breakdown.some((p) => p.key === 'fertilidad')).toBe(false)
  })
})

describe('buildLoadMap placement using the 3-factor heat score', () => {
  it('places the highest-heat cart near the fan (serpentín) and the lowest-heat cart in the centre', () => {
    const registry = buildFlockRegistry([
      { lot_code: 'HOT', age_weeks_at: 37, reference_date: today(), status: 'active' }, // prime fertility
      { lot_code: 'COLD', age_weeks_at: 15, reference_date: today(), status: 'active' }, // low fertility
    ])
    const carts = [
      makeCart({ cartNumber: 1, lotCode: 'HOT', eggType: 5, productionDate: today() }),
      makeCart({ cartNumber: 2, lotCode: 'COLD', eggType: 1, productionDate: isoDaysAgo(9) }),
      ...Array.from({ length: 10 }, (_, i) =>
        makeCart({ cartNumber: i + 3, lotCode: 'MID', eggType: 3, productionDate: isoDaysAgo(4) })
      ),
    ]
    const map = buildLoadMap(carts, { flockRegistry: registry })
    const hotSlot = map.slots.find((s) => s.entry?.cartNumber === '1')
    const coldSlot = map.slots.find((s) => s.entry?.cartNumber === '2')
    expect(hotSlot.zone).toBe(ZONE.serpentin)
    expect(coldSlot.zone).toBe(ZONE.centro)
    expect(map.balance.ok).toBe(true)
  })
})

function makeTreatedCart(cartNumber, eggType = 5) {
  // Un carro tratado suele venir con máxima producción de calor "aparente"
  // (huevo grande, recién puesto) para probar que la regla de centro gana
  // aunque el puntaje de calor diga lo contrario.
  return {
    id: `cart_t${cartNumber}`,
    cartNumber: String(cartNumber),
    cartLabel: `Carro ${cartNumber}`,
    status: 'available',
    lots: [
      {
        id: `lot_t${cartNumber}`,
        lot: `T${cartNumber}`,
        isTreated: true,
        trays: 16,
        eggType,
        productionDate: null,
      },
    ],
  }
}

describe('carros TRATADOS siempre van al centro (pedido explícito de Henry)', () => {
  it('un único carro tratado con puntaje de calor alto igual queda en el centro', () => {
    const carts = [
      makeTreatedCart(1, 5), // tratado, "caliente" por tipo de huevo — debe ir a Centro igual
      ...Array.from({ length: 11 }, (_, i) =>
        makeCart({ cartNumber: i + 2, lotCode: 'MID', eggType: 1, productionDate: isoDaysAgo(4) })
      ),
    ]
    const map = buildLoadMap(carts)
    const treatedSlot = map.slots.find((s) => s.entry?.cartNumber === '1')
    expect(treatedSlot.zone).toBe(ZONE.centro)
  })

  it('4 carros tratados llenan el centro completo; el 5º pasa a paredes (nunca serpentín)', () => {
    const carts = [
      ...Array.from({ length: 5 }, (_, i) => makeTreatedCart(i + 1)),
      ...Array.from({ length: 7 }, (_, i) =>
        makeCart({ cartNumber: i + 6, lotCode: 'MID', eggType: 3, productionDate: isoDaysAgo(4) })
      ),
    ]
    const map = buildLoadMap(carts)
    const treatedSlots = map.slots.filter((s) => s.entry?.lots?.some((l) => l.isTreated))
    expect(treatedSlots).toHaveLength(5)
    const centroTreated = treatedSlots.filter((s) => s.zone === ZONE.centro)
    const paredesTreated = treatedSlots.filter((s) => s.zone === ZONE.paredes)
    const serpentinTreated = treatedSlots.filter((s) => s.zone === ZONE.serpentin)
    expect(centroTreated).toHaveLength(4)
    expect(paredesTreated).toHaveLength(1)
    expect(serpentinTreated).toHaveLength(0)
    expect(map.balance.treatedOverflowCount).toBe(1)
    expect(map.balance.warnings.some((w) => /TRATADO/.test(w))).toBe(true)
  })

  it('ningún carro se pierde: 12 carros entran siempre 12 al mapa, con cualquier mezcla de tratados', () => {
    const carts = [
      ...Array.from({ length: 9 }, (_, i) => makeTreatedCart(i + 1)),
      ...Array.from({ length: 3 }, (_, i) =>
        makeCart({ cartNumber: i + 10, lotCode: 'MID', eggType: 3, productionDate: isoDaysAgo(4) })
      ),
    ]
    const map = buildLoadMap(carts)
    const filled = map.slots.filter((s) => s.entry)
    expect(filled).toHaveLength(12)
    // Con 9 tratados: 4 en centro, 4 en paredes, 1 forzado a serpentín (último recurso)
    const serpentinTreated = map.slots.filter(
      (s) => s.zone === ZONE.serpentin && s.entry?.lots?.some((l) => l.isTreated)
    )
    expect(serpentinTreated).toHaveLength(1)
    expect(map.balance.treatedForcedToSerpentinCount).toBe(1)
  })

  it('normalizeCart marca hasTreated cuando el carro tiene al menos un lote tratado (mitad y mitad)', () => {
    const cart = normalizeCart({
      id: 'mix1',
      cartNumber: '7',
      lots: [
        { lot: 'A', isTreated: true, trays: 8 },
        { lot: 'B', isTreated: false, colorPrimary: 'rojo', trays: 8, productionDate: today() },
      ],
    })
    expect(cart.hasTreated).toBe(true)
    expect(cart.isTreated).toBe(false) // no está TODO tratado, solo mitad
  })
})
