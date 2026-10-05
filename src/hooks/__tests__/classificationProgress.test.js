/**
 * =============================================================================
 * ARCHIVO: src/hooks/__tests__/classificationProgress.test.js
 * PROPÓSITO: Prueba el avance REAL de la orden de clasificación contra los
 *   carros registrados y los cambios de estado que se derivan (orden
 *   published → in_progress → done; lote → classified → loaded), y el paso en
 *   que va el operario de recepción. Si se rompe, la pantalla marcaría la orden
 *   como terminada sin estarlo o movería lotes que no son.
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import { orderProgress, planOrderTransitions, LOT_STATUS_RANK } from '../useIncubationLots'
import { deriveClassificationStep, isStaleOpenMap, STALE_MAP_DAYS } from '../useLoadClassification'
import { normalizeCart, buildLoadGroups, EGGS_PER_TRAY, CARTS_PER_MACHINE } from '../../lib/loadMapEngine'

const PUBLICADA = '2026-10-05T11:00:00.000Z'

/** Orden de gerencia: lote 41 (2 fechas, 2 carros llenos) y lote 43 (1 carro). */
const orden = (status = 'published') => ({
  id: 'ord-1',
  status,
  published_at: PUBLICADA,
  created_at: PUBLICADA,
  items: [
    { lotId: 'L41', code: '41', productionDate: '2026-09-28', eggs: 5376 },
    { lotId: 'L41', code: '41', productionDate: '2026-09-29', eggs: 5376 },
    { lotId: 'L43', code: '43', productionDate: '2026-09-30', eggs: 5376 },
  ],
})

const lotes = (s41 = 'classifying', s43 = 'classifying') => [
  { id: 'L41', code: '41', status: s41 },
  { id: 'L43', code: '43', status: s43 },
]

let n = 0
const carro = (lot, trays = 16, { status = 'available', at = '2026-10-05T12:00:00.000Z', date = '2026-09-28' } = {}) =>
  normalizeCart({
    id: `c${++n}`,
    cartNumber: String(n),
    classifiedAt: at,
    status,
    lots: (Array.isArray(lot) ? lot : [{ lot, trays }]).map((l) => ({ productionDate: date, ...l })),
  })

describe('orderProgress', () => {
  it('sin carros: la orden no ha empezado y ningún lote está completo', () => {
    const p = orderProgress(orden(), [])
    expect(p.started).toBe(false)
    expect(p.carts).toBe(0)
    expect(p.allClassified).toBe(false)
    expect(p.lots.map((l) => [l.code, l.orderEggs])).toEqual([
      ['41', 10752],
      ['43', 5376],
    ])
  })

  it('cuenta solo los carros registrados DESPUÉS de publicar la orden', () => {
    const viejo = carro('41', 16, { at: '2026-10-04T10:00:00.000Z' })
    const nuevo = carro('41', 16)
    const p = orderProgress(orden(), [viejo, nuevo])
    expect(p.carts).toBe(1)
    expect(p.lots.find((l) => l.code === '41').classifiedEggs).toBe(5376)
  })

  it('cruza por código sin importar mayúsculas ni espacios y reparte carros con varios lotes', () => {
    const mixto = carro([
      { lot: ' 41 ', trays: 8 },
      { lot: '43', trays: 8 },
    ])
    const p = orderProgress(orden(), [mixto])
    expect(p.lots.find((l) => l.code === '41').classifiedEggs).toBe(8 * EGGS_PER_TRAY)
    expect(p.lots.find((l) => l.code === '43').classifiedEggs).toBe(8 * EGGS_PER_TRAY)
    expect(p.carts).toBe(1)
  })

  it('un lote está «todo en carros» con tolerancia de una bandeja por fecha', () => {
    // 41 pide 10.752 huevos (2 fechas); 31 bandejas = 10.416 → falta 1 bandeja: dentro de la tolerancia (2×336).
    const p = orderProgress(orden(), [carro('41', 16), carro('41', 15)])
    expect(p.lots.find((l) => l.code === '41').fullyClassified).toBe(true)
    // 29 bandejas = 9.744 → faltan 3 bandejas: NO está completo.
    const q = orderProgress(orden(), [carro('41', 16), carro('41', 13)])
    expect(q.lots.find((l) => l.code === '41').fullyClassified).toBe(false)
  })

  it('marca como ambiguo un código repetido por dos lotes distintos', () => {
    const o = orden()
    o.items.push({ lotId: 'OTRO', code: '43', productionDate: '2026-10-01', eggs: 336 })
    const p = orderProgress(o, [carro('43')])
    const fila = p.lots.find((l) => l.code === '43')
    expect(fila.ambiguous).toBe(true)
    expect(fila.lotId).toBeNull()
    expect(p.ambiguousCodes).toEqual(['43'])
  })

  it('devuelve null sin orden o sin renglones', () => {
    expect(orderProgress(null, [])).toBeNull()
    expect(orderProgress({ id: 'x', items: [] }, [])).toBeNull()
  })
})

describe('planOrderTransitions', () => {
  it('primer carro de una orden publicada → la orden pasa a «in_progress»', () => {
    const o = orden('published')
    const plan = planOrderTransitions(o, orderProgress(o, [carro('41')]), lotes())
    expect(plan.order).toEqual({ id: 'ord-1', from: 'published', to: 'in_progress' })
    expect(plan.lots).toEqual([])
  })

  it('sin carros no cambia nada', () => {
    const o = orden('published')
    const plan = planOrderTransitions(o, orderProgress(o, []), lotes())
    expect(plan).toEqual({ order: null, lots: [] })
  })

  it('un lote con fechas de menos de una bandeja NO queda «classified» sin carros', () => {
    // 2 fechas de 300 huevos: la tolerancia (2×336) supera lo pedido (600).
    const o = {
      id: 'ord-chico',
      status: 'published',
      published_at: PUBLICADA,
      items: [
        { lotId: 'LCH', code: 'CH', productionDate: '2026-09-28', eggs: 300 },
        { lotId: 'LCH', code: 'CH', productionDate: '2026-09-29', eggs: 300 },
      ],
    }
    const p = orderProgress(o, [])
    expect(p.lots[0].fullyClassified).toBe(false)
    expect(p.allClassified).toBe(false)
    expect(planOrderTransitions(o, p, [{ id: 'LCH', code: 'CH', status: 'arrived' }])).toEqual({ order: null, lots: [] })
  })

  it('lote con todos sus huevos en carros → «classified» (sin tocar los demás)', () => {
    const o = orden('in_progress')
    const plan = planOrderTransitions(o, orderProgress(o, [carro('43')]), lotes())
    expect(plan.order).toBeNull()
    expect(plan.lots).toEqual([{ id: 'L43', code: '43', from: 'classifying', to: 'classified' }])
  })

  it('lote clasificado y con todos sus carros cargados → «loaded»; orden completa y cargada → «done»', () => {
    const o = orden('in_progress')
    const cargados = [carro('41', 16, { status: 'loaded' }), carro('41', 16, { status: 'loaded' }), carro('43', 16, { status: 'loaded' })]
    const plan = planOrderTransitions(o, orderProgress(o, cargados), lotes('classified', 'classifying'))
    expect(plan.order).toEqual({ id: 'ord-1', from: 'in_progress', to: 'done' })
    expect(plan.lots).toEqual([
      { id: 'L41', code: '41', from: 'classified', to: 'loaded' },
      { id: 'L43', code: '43', from: 'classifying', to: 'loaded' },
    ])
  })

  it('NO termina la orden si falta clasificar un lote aunque lo registrado ya esté cargado', () => {
    const o = orden('in_progress')
    const plan = planOrderTransitions(o, orderProgress(o, [carro('43', 16, { status: 'loaded' })]), lotes())
    expect(plan.order).toBeNull()
    expect(plan.lots).toEqual([{ id: 'L43', code: '43', from: 'classifying', to: 'loaded' }])
  })

  it('NO devuelve estados hacia atrás (un lote cerrado o ya cargado se queda)', () => {
    const o = orden('in_progress')
    const plan = planOrderTransitions(o, orderProgress(o, [carro('43')]), lotes('classifying', 'closed'))
    expect(plan.lots).toEqual([])
    expect(LOT_STATUS_RANK.closed).toBeGreaterThan(LOT_STATUS_RANK.loaded)
  })

  it('no mueve lotes de código ambiguo ni órdenes anuladas', () => {
    const o = orden('in_progress')
    o.items.push({ lotId: 'OTRO', code: '43', productionDate: '2026-10-01', eggs: 336 })
    const plan = planOrderTransitions(o, orderProgress(o, [carro('43')]), [...lotes(), { id: 'OTRO', code: '43', status: 'classifying' }])
    expect(plan.lots).toEqual([])
    const anulada = orden('cancelled')
    expect(planOrderTransitions(anulada, orderProgress(anulada, [carro('41')]), lotes()).order).toBeNull()
  })
})

describe('deriveClassificationStep', () => {
  const ahora = new Date('2026-10-05T15:00:00.000Z')
  const mapa = (status, createdAt = '2026-10-05T13:00:00.000Z') => ({ id: status, status, createdAt })
  const doce = Array.from({ length: CARTS_PER_MACHINE }, () => carro('41'))

  it('sin nada → «Orden del día»', () => {
    expect(deriveClassificationStep({}, ahora)).toBe('orden')
  })
  it('con carros en la cola o la orden empezada → «Registrar carros»', () => {
    expect(deriveClassificationStep({ available: [carro('41')] }, ahora)).toBe('carros')
    expect(deriveClassificationStep({ orderStarted: true }, ahora)).toBe('carros')
  })
  it('con un cargue completo de 12 o un mapa esperando al líder → «Mapa de cargue»', () => {
    expect(deriveClassificationStep({ available: doce, groups: buildLoadGroups(doce) }, ahora)).toBe('mapa')
    expect(deriveClassificationStep({ maps: [mapa('pending_approval')] }, ahora)).toBe('mapa')
    expect(deriveClassificationStep({ maps: [mapa('approved')] }, ahora)).toBe('mapa')
  })
  it('con la orden de cargue dada → «Cargar la máquina» (manda sobre lo demás)', () => {
    expect(deriveClassificationStep({ maps: [mapa('pending_approval'), mapa('ordered')], available: doce }, ahora)).toBe('cargar')
  })
  it('los mapas cerrados no cuentan y un borrador viejo tampoco atasca al operario', () => {
    expect(deriveClassificationStep({ maps: [mapa('completed'), mapa('rejected')] }, ahora)).toBe('orden')
    const viejo = mapa('draft', '2026-07-11T21:17:15.054Z')
    expect(isStaleOpenMap(viejo, ahora)).toBe(true)
    expect(deriveClassificationStep({ maps: [viejo] }, ahora)).toBe('orden')
    expect(isStaleOpenMap(mapa('draft'), ahora)).toBe(false)
    expect(isStaleOpenMap(mapa('completed', '2026-07-11T21:17:15.054Z'), ahora)).toBe(false)
    expect(STALE_MAP_DAYS).toBe(7)
  })
})
