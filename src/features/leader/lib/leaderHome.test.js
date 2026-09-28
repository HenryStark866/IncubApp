import { describe, expect, it } from 'vitest'
import {
  environmentalLeaderBoard,
  leaderKind,
  logisticsLeaderBoard,
  maintenanceLeaderBoard,
  plantLeaderBoard,
  sstLeaderBoard,
  veterinaryLeaderBoard,
  hrLeaderBoard,
  accountingLeaderBoard,
  salesLeaderBoard,
} from './leaderHome'

const now = new Date(2026, 8, 28, 15, 40)

describe('leaderKind', () => {
  it('planta por defecto, mantenimiento por su área y el resto después', () => {
    expect(leaderKind('plant')).toBe('plant')
    expect(leaderKind(null)).toBe('plant')
    expect(leaderKind('maintenance')).toBe('maintenance')
    expect(leaderKind('sst')).toBe('sst')
    expect(leaderKind('sales_logistics')).toBe('logistics')
    expect(leaderKind('farm')).toBe('veterinary')
    expect(leaderKind('hr')).toBe('hr')
    expect(leaderKind('management')).toBe(null)
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

describe('veterinaryLeaderBoard', () => {
  it('avisa el resultado no conforme, el nacimiento sin vacuna y la muestra sin resultado', () => {
    const at = (d, h) => new Date(2026, 8, d, h).toISOString()
    const b = veterinaryLeaderBoard({
      now,
      records: [
        {
          id: 'f1',
          kind: 'fertility',
          batch_or_lote: '2381',
          result: '86,9 %',
          result_status: 'fail',
          recorded_at: at(28, 13),
          created_by: 'v1',
        },
        {
          id: 'f2',
          kind: 'fertility',
          batch_or_lote: '2379',
          result: '91.8%',
          result_status: 'ok',
          recorded_at: at(27, 10),
        },
        { id: 'l1', kind: 'wet_tunnel_lab', title: 'Sala 2', result_status: 'pending', recorded_at: at(23, 9) },
        { id: 'v1', kind: 'vaccination', batch_or_lote: '2360', recorded_at: at(28, 11), created_by: 'a1' },
      ],
      hatches: [
        { id: 'h1', lote: '2355', status: 'planned', scheduled_at: at(28, 18) },
        { id: 'h2', lote: '2360', status: 'planned', scheduled_at: at(29, 6) },
      ],
      team: [
        { id: 'v1', name: 'Julián', roleLabel: 'Veterinario' },
        { id: 'a1', name: 'Sofía', roleLabel: 'Aux. de vacunación' },
        { id: 'a2', name: 'Diana', roleLabel: 'Aux. de vacunación' },
      ],
    })
    expect(b.decisions[0]).toMatchObject({ id: 'vet-f1', tone: 'danger' })
    expect(b.decisions.find((d) => d.id === 'hatch-h1').title).toContain('lote 2355 hoy a las 18:00')
    expect(b.decisions.some((d) => d.id === 'hatch-h2')).toBe(false)
    expect(b.decisions.find((d) => d.id === 'lab-l1').title).toContain('sin resultado hace 5 días')
    expect(b.kpis[1].value).toBe('89,4 %')
    expect(b.plan.map((p) => p.state)).toEqual(['Por vacunar', 'Vacunado'])
    expect(b.team[2]).toMatchObject({ name: 'Diana', value: '0 registros hoy' })
  })
})

describe('hrLeaderBoard', () => {
  it('avisa el turno de mañana vacío, quien no marcó y quien llegó tarde', () => {
    const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).toISOString()
    const b = hrLeaderBoard({
      now,
      members: [
        { id: 'u1', name: 'Ana', area: 'plant' },
        { id: 'u2', name: 'Luis', area: 'plant' },
        { id: 'u3', name: 'Marta', area: 'maintenance' },
      ],
      assignments: [
        { user_id: 'u1', work_date: '2026-09-28', shift_number: 2 },
        { user_id: 'u2', work_date: '2026-09-28', shift_number: 2 },
        { user_id: 'u3', work_date: '2026-09-28', shift_number: 1 },
        { user_id: 'u1', work_date: '2026-09-29', shift_number: 1 },
        { user_id: 'u2', work_date: '2026-09-29', shift_number: 2 },
      ],
      punches: [
        { user_id: 'u1', punch_type: 'in', punched_at: at(28, 14, 25) },
        { user_id: 'u3', punch_type: 'in', punched_at: at(28, 5, 55) },
      ],
    })
    expect(b.decisions[0]).toMatchObject({ id: 'empty-3', tone: 'danger' })
    expect(b.decisions.find((d) => d.id === 'missing').detail).toBe('Luis (T2)')
    expect(b.decisions.find((d) => d.id === 'late').detail).toBe('Ana 14:25')
    expect(b.kpis[1].value).toBe('67 %')
    expect(b.team[0]).toMatchObject({ name: 'Planta de incubación', value: '50 %' })
  })
})

describe('accountingLeaderBoard', () => {
  it('pone primero el error de Siesa y cuenta lo que falta exportar', () => {
    const b = accountingLeaderBoard({
      now,
      remittances: [
        { id: 'r1', status: 'dispatched', dispatch_date: '2026-09-26', qty_females: 100, siesa_synced_at: null },
        {
          id: 'r2',
          status: 'delivered',
          dispatch_date: '2026-09-20',
          accounting_exported_at: '2026-09-21',
          accounting_exported_by: 'c1',
          siesa_synced_at: '2026-09-21',
        },
        { id: 'r3', status: 'draft', dispatch_date: '2026-09-27' },
      ],
      syncLog: [
        {
          id: 's1',
          count_total: 14,
          count_synced: 12,
          count_errors: 2,
          created_at: new Date(2026, 8, 28, 14, 30).toISOString(),
        },
      ],
      workOrders: [{ id: 'w', status: 'completed', cost: 1500000, completed_at: new Date(2026, 8, 10).toISOString() }],
      team: [{ id: 'c1', name: 'Camila', roleLabel: 'Aux. de contabilidad' }],
    })
    expect(b.decisions.map((d) => d.id)).toEqual(['siesa-s1', 'not-exported', 'not-synced'])
    expect(b.kpis[3].value).toBe('$ 1.500.000')
    expect(b.team[0].value).toBe('1 en el mes')
  })
})

describe('salesLeaderBoard', () => {
  it('detecta la sobreventa contra el nacimiento proyectado', () => {
    const b = salesLeaderBoard({
      now,
      orders: [
        {
          id: 'o1',
          code: 'P-1',
          status: 'confirmed',
          qty_females: 50000,
          qty_males: 46000,
          delivery_date: '2026-10-01',
          customer_id: 'c1',
        },
        {
          id: 'o2',
          code: 'P-2',
          status: 'requested',
          qty_females: 1000,
          delivery_date: '2026-10-03',
          customer_id: 'c1',
          created_at: '2026-09-27',
        },
      ],
      customers: [
        { id: 'c1', name: 'Granja San José', status: 'active' },
        { id: 'c2', name: 'Pollos El Roble', status: 'prospect' },
      ],
      hatches: [
        { id: 'h', lote: '2355', estimated_chicks: 88500, scheduled_at: new Date(2026, 9, 1, 6).toISOString() },
      ],
    })
    expect(b.decisions[0]).toMatchObject({ id: 'over-2026-10-01', tone: 'danger' })
    expect(b.decisions[0].detail).toContain('faltan 7.500')
    expect(b.decisions.some((d) => d.id === 'req-o2')).toBe(true)
    expect(b.decisions.some((d) => d.id === 'prospects')).toBe(true)
    expect(b.team[0]).toMatchObject({ pct: 100, value: '108 %' })
  })
})
