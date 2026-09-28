import { describe, expect, it } from 'vitest'
import {
  environmentalLeaderBoard,
  leaderKind,
  logisticsLeaderBoard,
  maintenanceLeaderBoard,
  plantLeaderBoard,
  sstLeaderBoard,
} from './leaderHome'

const now = new Date(2026, 8, 28, 15, 40)

describe('leaderKind', () => {
  it('planta por defecto, mantenimiento por su área y el resto después', () => {
    expect(leaderKind('plant')).toBe('plant')
    expect(leaderKind(null)).toBe('plant')
    expect(leaderKind('maintenance')).toBe('maintenance')
    expect(leaderKind('sst')).toBe('sst')
    expect(leaderKind('sales_logistics')).toBe('logistics')
    expect(leaderKind('hr')).toBe(null)
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

describe('sstLeaderBoard', () => {
  it('pone primero el preoperacional con hallazgos y avisa el EPP bajo el mínimo', () => {
    const b = sstLeaderBoard({
      now,
      preops: [
        {
          id: 'p1',
          vehicle_plate: 'TKM-432',
          driver_name: 'Óscar',
          inspection_date: '2026-09-28',
          compliant: false,
          status: 'submitted',
          created_at: new Date(2026, 8, 28, 6, 10).toISOString(),
        },
        {
          id: 'p2',
          vehicle_plate: 'TKL-118',
          driver_name: 'Wilson',
          inspection_date: '2026-09-28',
          compliant: true,
          status: 'submitted',
          created_at: new Date(2026, 8, 28, 6, 2).toISOString(),
        },
      ],
      supplies: [
        { id: 'e1', item_name: 'Guantes de nitrilo', unit: 'pares', qty_on_hand: 3, min_qty: 20 },
        { id: 'e2', item_name: 'Botas', unit: 'pares', qty_on_hand: 30, min_qty: 10 },
      ],
      drivers: [
        { id: 'd1', full_name: 'Óscar', plate: 'TKM-432' },
        { id: 'd2', full_name: 'Wilson', plate: 'tkl-118' },
        { id: 'd3', full_name: 'Andrés', plate: 'TKL-205' },
      ],
    })
    expect(b.decisions[0]).toMatchObject({ tone: 'danger', id: 'preop-p1' })
    expect(b.decisions.some((d) => d.id === 'epp-e1')).toBe(true)
    expect(b.decisions.some((d) => d.id === 'epp-e2')).toBe(false)
    expect(b.decisions.find((d) => d.id === 'preop-review').title).toBe('1 preoperacional por revisar')
    expect(b.kpis[0]).toMatchObject({ value: '2 de 3', tone: 'danger' })
    expect(b.team.map((t) => t.value)).toEqual(['Hallazgo', 'Al día', 'Pendiente'])
  })
})

describe('environmentalLeaderBoard', () => {
  it('marca el sensor fuera de rango y el que no reporta', () => {
    const b = environmentalLeaderBoard({
      now,
      sensors: [
        { id: 's1', code: 'CO2-RES', kind: 'CO₂', unit: 'ppm', min_threshold: null, max_threshold: 1000 },
        { id: 's2', code: 'AGUA-1', kind: 'Caudal', unit: 'm³', min_threshold: 0, max_threshold: 60 },
        { id: 's3', code: 'TEMP-3', kind: 'Temperatura', unit: '°C' },
      ],
      readings: [
        { sensor_id: 's1', value: 1450, recorded_at: new Date(2026, 8, 28, 12).toISOString() },
        { sensor_id: 's1', value: 900, recorded_at: new Date(2026, 8, 28, 9).toISOString() },
        { sensor_id: 's2', value: 42, recorded_at: new Date(2026, 8, 28, 14).toISOString() },
      ],
    })
    expect(b.decisions[0].title).toBe('Sensor CO2-RES fuera de rango: 1.450 ppm')
    expect(b.decisions.some((d) => d.id === 'stale-s3')).toBe(true)
    expect(b.kpis.map((k) => k.value)).toEqual(['3', '1', '1', '3'])
    expect(b.plan).toHaveLength(1)
  })
})

describe('logisticsLeaderBoard', () => {
  it('pide remisión para pedidos confirmados, conductor para la ruta y avisa el hallazgo', () => {
    const b = logisticsLeaderBoard({
      now,
      orders: [
        {
          id: 'o1',
          code: 'P-3318',
          customer_id: 'c1',
          status: 'confirmed',
          qty_females: 6000,
          qty_males: 6000,
          delivery_date: '2026-09-29',
        },
        { id: 'o2', code: 'P-3319', customer_id: 'c1', status: 'confirmed', delivery_date: '2026-09-29' },
      ],
      remittances: [
        {
          id: 'r1',
          code: 'R-1',
          order_id: 'o2',
          customer_id: 'c1',
          dispatch_date: '2026-09-28',
          status: 'dispatched',
          qty_females: 100,
        },
      ],
      routes: [{ id: 'rt', code: 'Ruta 4', status: 'planned', driver_id: null }],
      drivers: [
        {
          id: 'd1',
          full_name: 'Wilson',
          plate: 'TKL-118',
          on_route: true,
          last_location_at: new Date(2026, 8, 28, 15, 0).toISOString(),
        },
      ],
      preops: [
        {
          id: 'p1',
          vehicle_plate: 'TKL-118',
          inspection_date: '2026-09-28',
          compliant: false,
          created_at: new Date(2026, 8, 28, 6).toISOString(),
        },
      ],
      customers: [{ id: 'c1', name: 'Granja San José' }],
    })
    expect(b.decisions[0].id).toBe('preop-p1')
    const order = b.decisions.find((d) => d.id === 'order-o1')
    expect(order).toMatchObject({ tone: 'warn' })
    expect(order.detail).toContain('Granja San José · 12.000 pollitos')
    expect(b.decisions.some((d) => d.id === 'order-o2')).toBe(false)
    expect(b.decisions.some((d) => d.id === 'route-rt')).toBe(true)
    expect(b.decisions.find((d) => d.id === 'gps-d1').title).toContain('hace 40 min')
    expect(b.plan[0]).toMatchObject({ at: 'Hoy', state: 'Despachada' })
  })
})
