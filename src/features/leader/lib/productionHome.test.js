import { describe, expect, it } from 'vitest'
import { coldRoomGroups, machineStates, productionBoard, teamRecords, lotsOfMap } from './productionHome'
import { leaderKind } from './leaderHome'

const now = new Date('2026-10-06T15:00:00-05:00')
const d = (n, h = 10) => new Date(now.getTime() - n * 86400000 + (h - 15) * 3600000).toISOString()

describe('inicio de producción', () => {
  it('el área «Producción / calidad» abre el inicio de producción', () => {
    expect(leaderKind('quality')).toBe('production')
    expect(leaderKind('plant')).toBe('plant')
  })

  it('cuarto frío desglosable por lote, granja y galpón', () => {
    const data = {
      stock: [
        { id: 's1', batch_id: 'b1', room_id: 'r1', stock_date: '2026-10-05', counts: { incubable: 1000, roto: 10 } },
        { id: 's2', batch_id: 'b1', room_id: 'r2', stock_date: '2026-10-06', counts: { incubable: 500 } },
        { id: 's3', batch_id: 'b2', room_id: 'r1', stock_date: '2026-10-06', counts: { incubable: 0 } },
      ],
      batches: [
        { id: 'b1', code: '47', farm_id: 'f1' },
        { id: 'b2', code: '48', farm_id: 'f1' },
      ],
      farms: [{ id: 'f1', name: 'La Fe' }],
      rooms: [
        { id: 'r1', name: 'Galpón 1' },
        { id: 'r2', name: 'Galpón 2' },
      ],
    }
    const porLote = coldRoomGroups({ ...data, groupBy: 'batch' })
    expect(porLote.groups).toHaveLength(1)
    expect(porLote.groups[0]).toMatchObject({ key: '47', total: 1510 })
    expect(porLote.totals.incubable).toBe(1500)
    expect(coldRoomGroups({ ...data, groupBy: 'barn' }).groups.map((g) => g.key)).toEqual(['La Fe · Galpón 1', 'La Fe · Galpón 2'])
    expect(coldRoomGroups({ ...data, groupBy: 'date' }).groups[0].key).toBe('2026-10-06')
  })

  it('máquinas: día del ciclo, para transferir y nacedora con huevo', () => {
    const machines = [
      { id: 'm1', code: 'INC-01', type: 'setter' },
      { id: 'm2', code: 'INC-02', type: 'setter' },
      { id: 'h1', code: 'NAC-01', type: 'hatcher' },
    ]
    const loads = [
      { machine_id: 'm1', lote: '45', loaded_at: d(18), cycle_start_at: d(18) },
      { machine_id: 'm2', lote: '41', loaded_at: d(20), cycle_start_at: d(20) },
    ]
    const transfers = [{ source_machine_id: 'm2', transferred_at: d(1), hatcher_ids: ['h1'], allocations: [{ hatcher_id: 'h1', lots: [{ lot: '41' }] }], lote: '41' }]
    const s = machineStates({ machines, loads, transfers, now })
    const by = Object.fromEntries(s.map((x) => [x.code, x]))
    expect(by['INC-01']).toMatchObject({ occupied: true, day: 18, dueTransfer: true, lots: ['45'] })
    expect(by['INC-02'].occupied).toBe(false)
    expect(by['NAC-01']).toMatchObject({ occupied: true, lots: ['41'] })
    const board = productionBoard({ states: s, now, maps: [{ id: 'x', status: 'pending_approval', machine_name: 'INC-03', payload: { slots: [{ entry: { lots: [{ lot: '47' }] } }] } }] })
    expect(board.decisions.map((x) => x.id)).toEqual(expect.arrayContaining(['map-x', 'due-m1']))
    expect(board.kpis[2].value).toBe('1 de 2')
  })

  it('lo que registra cada auxiliar del equipo', () => {
    const members = [
      { id: 'u1', name: 'Ana', role: 'reception_operator' },
      { id: 'u2', name: 'Luis', role: 'vaccination_auxiliary' },
      { id: 'u3', name: 'Otro', role: 'driver' },
    ]
    const t = teamRecords({
      members,
      arrivals: [{ received_by: 'u1', arrived_at: d(0), lot_code: '47', received_postures: 1000 }],
      vet: [{ created_by: 'u2', kind: 'vaccination', title: 'Marek', recorded_at: d(1) }],
      tasks: [{ id: 't', assigned_to: 'u2', status: 'pending', title: 'Vacunar', created_at: d(0) }],
    })
    expect(t).toHaveLength(2)
    expect(t[0].records[0].kind).toBe('Recepción de lote')
    expect(t[1]).toMatchObject({ pending: [{ id: 't' }] })
    expect(lotsOfMap({ payload: { slots: [{ entry: { lot: '45' } }, { entry: { lots: [{ lot: '46' }, { lot: '45' }] } }] } })).toEqual(['45', '46'])
  })
})

describe('vacunación en el inicio de producción', () => {
  it('alerta de stock bajo y lote vencido llega como decisión y el consumo al equipo', () => {
    const now = new Date(2026, 9, 7, 10)
    const vaccineProducts = [{ id: 'v1', name: 'Marek', doses_per_vial: 1000, min_doses: 5000, active: true }]
    const vaccineMovements = [
      { id: 'a', product_id: 'v1', kind: 'in', doses: 4000, manufacturer_lot: 'L1', expires_on: '2026-10-01', moved_at: '2026-09-01T10:00:00Z', created_by: 'u2' },
      { id: 'b', product_id: 'v1', kind: 'use', doses: 1000, manufacturer_lot: 'L1', lote: '45', moved_at: '2026-10-06T10:00:00Z', created_by: 'u2' },
    ]
    const { decisions } = productionBoard({ vaccineProducts, vaccineMovements, now })
    const vac = decisions.filter((d) => d.tab === 'vacunacion')
    expect(vac.some((d) => /Stock bajo/.test(d.title))).toBe(true)
    expect(vac.some((d) => d.tone === 'danger' && /vencido/.test(d.title))).toBe(true)
    const t = teamRecords({ members: [{ id: 'u2', name: 'Luis', role: 'vaccination_auxiliary' }], vaccineProducts, vaccineMovements })
    expect(t[0].records.some((r) => r.kind === 'Vacuna · Consumo' && /lote 45/.test(r.text))).toBe(true)
  })
})

describe('recepción con posturas reales (lista por fecha de postura)', () => {
  it('suma received_postures [{ eggs }] para el KPI, la diferencia y el equipo', () => {
    const now = new Date(2026, 9, 7, 12)
    const lots = [{ id: 'L1', code: '47', postures: [{ productionDate: '2026-10-05', eggs: 20000 }, { productionDate: '2026-10-06', eggs: 10000 }] }]
    const arrivals = [{ id: 'a1', lot_id: 'L1', lot_code: '47', received_by: 'u1', arrived_at: new Date(2026, 9, 7, 9).toISOString(), received_postures: [{ productionDate: '2026-10-05', eggs: 19000 }, { productionDate: '2026-10-06', eggs: 9000 }] }]
    const { decisions, kpis } = productionBoard({ lots, arrivals, now })
    expect(kpis[0].value).toBe((28000).toLocaleString('es-CO'))
    expect(decisions.some((d) => /-2\.000 huevos de diferencia/.test(d.title))).toBe(true)
    const t = teamRecords({ members: [{ id: 'u1', name: 'J', role: 'reception_operator' }], arrivals })
    expect(t[0].records[0].text).toMatch(/28\.000 huevos/)
  })
})
