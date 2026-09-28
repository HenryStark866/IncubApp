import { describe, expect, it } from 'vitest'
import { leaderKind, maintenanceLeaderBoard, plantLeaderBoard } from './leaderHome'

const now = new Date(2026, 8, 28, 15, 40)

describe('leaderKind', () => {
  it('planta por defecto, mantenimiento por su área y el resto después', () => {
    expect(leaderKind('plant')).toBe('plant')
    expect(leaderKind(null)).toBe('plant')
    expect(leaderKind('maintenance')).toBe('maintenance')
    expect(leaderKind('sst')).toBe(null)
  })
})

describe('plantLeaderBoard', () => {
  const machines = [
    { id: 'm1', code: 'INC-19', plant_id: 'p' },
    { id: 'm2', code: 'INC-20', plant_id: 'p' },
  ]
  const slot = { shift: 2, shiftDate: '2026-09-28', hour: 15 }

  it('pide decidir sobre la falla sin OT, el mapa por aprobar y la llegada que no cuadra', () => {
    const b = plantLeaderBoard({
      machines,
      slot,
      now,
      checks: [
        {
          id: 'c1',
          machine_id: 'm1',
          taken_by: 'u',
          taken_at: '2026-09-28T15:12:00',
          hour_slot: 15,
          condition: 'fault',
          notes: 'Falla de volteo',
        },
      ],
      loadMaps: [
        {
          id: 'lm',
          status: 'pending_approval',
          machine_name: 'INC-07',
          payload: { summary: { cartCount: 12, totalEggs: 57600 } },
        },
      ],
      lots: [{ id: 'l1', code: '2381', postures: [{ eggs: 57600 }] }],
      arrivals: [
        {
          id: 'a1',
          lot_id: 'l1',
          lot_code: '2381',
          arrived_at: new Date(2026, 8, 28, 14, 0).toISOString(),
          received_postures: [{ eggs: 56400 }],
        },
      ],
      workOrders: [],
    })
    expect(b.decisions[0]).toMatchObject({
      tone: 'danger',
      action: { kind: 'request-ot', machineId: 'm1' },
    })
    expect(b.decisions.some((d) => d.title.includes('INC-07 listo para aprobar'))).toBe(true)
    expect(b.decisions.some((d) => d.title.includes('faltan 1.200 huevos'))).toBe(true)
    // 20 min para cerrar la hora y 1 de 2 máquinas: avisa de la ronda.
    expect(b.decisions.some((d) => d.id === 'round-now')).toBe(true)
    expect(b.kpis[1].value).toBe('0 · 0 · 1')
  })

  it('con OT ya pedida y sin técnico, manda a ver la OT en vez de pedir otra', () => {
    const b = plantLeaderBoard({
      machines,
      slot,
      now,
      checks: [
        {
          id: 'c1',
          machine_id: 'm1',
          taken_at: '2026-09-28T15:12:00',
          hour_slot: 15,
          condition: 'warning',
        },
      ],
      workOrders: [
        {
          id: 'w',
          code: 'OT-12',
          machine_id: 'm1',
          status: 'open',
          assigned_to: null,
        },
      ],
    })
    const d = b.decisions.find((x) => x.id === 'machine-m1')
    expect(d.action).toMatchObject({ kind: 'nav', tab: 'mantenimiento' })
    expect(d.title).toContain('OT-12 sin técnico')
  })
})

describe('maintenanceLeaderBoard', () => {
  it('ordena OT sin técnico por prioridad y pide aprobar los cierres', () => {
    const b = maintenanceLeaderBoard({
      now,
      machines: [{ id: 'm1', code: 'INC-19' }],
      technicians: [
        { id: 't1', name: 'Daniel', roleLabel: 'Aux. de mantenimiento' },
        { id: 't2', name: 'Camilo', roleLabel: 'Aux. de mantenimiento' },
      ],
      workOrders: [
        {
          id: 'a',
          code: 'OT-1',
          status: 'open',
          priority: 'medium',
          created_at: '2026-09-27T10:00:00Z',
        },
        {
          id: 'b',
          code: 'OT-2',
          machine_id: 'm1',
          status: 'open',
          priority: 'high',
          created_at: '2026-09-28T14:12:00Z',
        },
        {
          id: 'c',
          code: 'OT-3',
          status: 'in_progress',
          priority: 'low',
          assigned_to: 't1',
          created_at: '2026-09-26T10:00:00Z',
        },
        {
          id: 'd',
          code: 'OT-4',
          status: 'completed',
          assigned_to: 't1',
          completed_at: new Date(2026, 8, 28, 11).toISOString(),
          downtime_minutes: 130,
        },
      ],
    })
    const assign = b.decisions.filter((d) => d.action.kind === 'assign')
    expect(assign.map((d) => d.action.orderId)).toEqual(['b', 'a'])
    expect(b.decisions.find((d) => d.action.kind === 'approve').action.orderId).toBe('d')
    expect(b.kpis[3].value).toBe('130 min')
    expect(b.team[0]).toMatchObject({
      name: 'Daniel',
      value: '1 abiertas · 1 cerradas hoy',
    })
    expect(b.team[1].doing).toContain('Libre')
  })
})
