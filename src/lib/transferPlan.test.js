import { describe, expect, it } from 'vitest'
import {
  buildAllocations,
  cartsFromMap,
  distributeCarts,
  loadTransferred,
  lotsLabel,
  occupiedHatchers,
  pendingSetters,
  unassignedCarts,
} from './transferPlan'

const now = new Date('2026-09-30T12:00:00Z')
const loads = [
  {
    id: 'a',
    machine_id: 'inc7',
    plant_id: 'p',
    lote: '41',
    loaded_at: '2026-09-12T08:00:00Z',
    cycle_start_at: '2026-09-12T08:00:00Z',
    batch_id: 'b41',
  },
  { id: 'b', machine_id: 'inc7', plant_id: 'p', lote: '43', loaded_at: '2026-09-12T08:00:00Z', batch_id: 'b43' },
  { id: 'c', machine_id: 'inc8', plant_id: 'p', lote: '41', loaded_at: '2026-09-25T08:00:00Z' },
]

describe('incubadoras pendientes', () => {
  it('agrupa por incubadora con sus lotes y días', () => {
    const s = pendingSetters({ loads, machines: [{ id: 'inc7', code: 'INC-07' }], now })
    expect(s.map((x) => x.machineId)).toEqual(['inc7', 'inc8'])
    expect(s[0]).toMatchObject({ lots: ['41', '43'], batchId: null })
    expect(Math.round(s[0].days)).toBe(18)
    expect(s[1].batchId).toBe(null)
  })
  it('una transferencia por incubadora no se lleva el mismo lote de otra incubadora', () => {
    const transfers = [{ source_machine_id: 'inc7', lote: '41 + 43', transferred_at: '2026-09-30T06:00:00Z' }]
    expect(pendingSetters({ loads, transfers, now }).map((x) => x.machineId)).toEqual(['inc8'])
  })
  it('las transferencias viejas (por lote) se siguen respetando', () => {
    expect(loadTransferred(loads[2], [{ lote: '41', transferred_at: '2026-09-26T00:00:00Z' }])).toBe(true)
    expect(loadTransferred(loads[2], [{ lote: '41', transferred_at: '2026-09-20T00:00:00Z' }])).toBe(false)
  })
})

describe('carros y reparto', () => {
  const map = {
    payload: {
      slots: [
        {
          machinePos: 2,
          entry: { cartNumber: '1', trays: 16, eggs: 5376, lots: [{ lot: '43', trays: 16, eggs: 5376 }] },
        },
        {
          machinePos: 1,
          entry: {
            cartNumber: '2',
            trays: 16,
            lots: [
              { lot: '41', trays: 8 },
              { lot: '43', trays: 8 },
            ],
          },
        },
        { machinePos: 3, entry: null },
        ...Array.from({ length: 10 }, (_, i) => ({
          machinePos: 4 + i,
          entry: { cartNumber: String(i + 3), trays: 16, lots: [{ lot: '41', trays: 16 }] },
        })),
      ],
    },
  }
  const carts = cartsFromMap(map)
  it('lee los carros del mapa en orden de número', () => {
    expect(carts).toHaveLength(12)
    expect(carts.slice(0, 3).map((c) => c.cartNo)).toEqual(['1', '2', '3'])
    expect(carts[1].lots).toEqual([
      { lot: '41', trays: 8, eggs: 0 },
      { lot: '43', trays: 8, eggs: 0 },
    ])
  })
  it('reparte en bloques seguidos y en el orden del turnero', () => {
    const a = distributeCarts(carts, ['nac3', 'nac1', 'nac2'])
    expect(carts.slice(0, 4).every((c) => a[c.key] === 'nac3')).toBe(true)
    expect(carts.slice(8).every((c) => a[c.key] === 'nac2')).toBe(true)
    const b = distributeCarts(carts, ['x', 'y', 'z', 'w', 'v'])
    expect(['x', 'y', 'z', 'w', 'v'].map((h) => Object.values(b).filter((v) => v === h).length)).toEqual([
      3, 3, 2, 2, 2,
    ])
  })
  it('resume lo que recibe cada nacedora y avisa carros sin nacedora', () => {
    const a = distributeCarts(carts, ['n1', 'n2'])
    const al = buildAllocations({ carts, hatcherIds: ['n1', 'n2'], assignment: a })
    expect(al[0]).toMatchObject({ order: 1, hatcher_id: 'n1', carts: ['1', '2', '3', '4', '5', '6'] })
    expect(al[0].lots).toEqual([
      { lot: '43', trays: 24 },
      { lot: '41', trays: 72 },
    ])
    expect(unassignedCarts(carts, a, ['n1'])).toHaveLength(6)
    expect(buildAllocations({ hatcherIds: ['n1'], lots: ['41'] })[0].lots).toEqual([{ lot: '41', trays: null }])
  })
  it('dos carros con el mismo número no se pisan', () => {
    const dup = cartsFromMap({
      slots: [
        { machinePos: 1, entry: { cartNumber: '5', lots: [{ lot: '41' }] } },
        { machinePos: 2, entry: { cartNumber: '5', lots: [{ lot: '41' }] } },
      ],
    })
    expect(new Set(dup.map((c) => c.key)).size).toBe(2)
  })
  it('etiqueta de lotes y nacedoras ocupadas', () => {
    expect(lotsLabel(['41', ' 43', '41'])).toBe('41 + 43')
    const occ = occupiedHatchers(
      [
        { hatcher_ids: ['n1'], transferred_at: '2026-09-29T00:00:00Z' },
        { hatcher_ids: ['n2'], transferred_at: '2026-09-01T00:00:00Z' },
      ],
      now,
    )
    expect([...occ]).toEqual(['n1'])
  })
})
