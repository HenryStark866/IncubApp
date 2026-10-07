import { describe, it, expect } from 'vitest'
import {
  shiftHomeKind,
  shiftHoursElapsed,
  shiftTimeLeft,
  roundsPace,
  machineHealth,
  sortAssignments,
  assignmentKind,
  productionDay,
  receptionDay,
  teamOnShift,
  initials,
} from './shiftHome'

// Fechas locales (sin zona) para que la prueba no dependa de la zona del equipo.
const at = (hh, mm = 0, day = '2026-09-28') => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)

describe('pantalla de inicio por rol de planta', () => {
  it('cada rol de planta abre su pantalla y el líder de área no', () => {
    expect(shiftHomeKind('operator')).toBe('operator')
    expect(shiftHomeKind('auxiliary')).toBe('operator')
    expect(shiftHomeKind('auxiliary_production')).toBe('production')
    expect(shiftHomeKind('reception_operator')).toBe('reception')
    expect(shiftHomeKind('supervisor')).toBe('supervisor')
    expect(shiftHomeKind('coordinator')).toBeNull()
    expect(shiftHomeKind('management')).toBeNull()
  })
})

describe('tiempo del turno', () => {
  it('cuenta las horas del turno 3 que cruza la medianoche', () => {
    expect(shiftHoursElapsed(3, at(23))).toBe(1)
    expect(shiftHoursElapsed(3, at(2))).toBe(4)
    expect(shiftHoursElapsed(2, at(16, 30))).toBe(2.5)
    expect(shiftHoursElapsed(1, at(5))).toBe(0)
  })

  it('dice cuánto falta del turno', () => {
    expect(shiftTimeLeft(2, at(16, 20))).toBe('quedan 5 h 40 min')
    expect(shiftTimeLeft(2, at(21))).toBe('quedan 1 h')
  })
})

describe('ritmo de rondas', () => {
  it('a mitad del turno se esperan 3 de 6 y avisa quién va atrasado', () => {
    const p = roundsPace({ done: 2, min: 6, shift: 2, now: at(18) })
    expect(p.expectedNow).toBe(3)
    expect(p.behind).toBe(true)
    expect(p.complete).toBe(false)
  })

  it('sugiere la hora de la próxima ronda y no la sugiere al completar', () => {
    expect(roundsPace({ done: 4, min: 6, shift: 2, now: at(16) }).nextAt).toBe('20:00')
    expect(roundsPace({ done: 1, min: 6, shift: 2, now: at(18, 10) }).nextAt).toBe('19:00')
    expect(roundsPace({ done: 6, min: 6, shift: 2, now: at(20) }).nextAt).toBeNull()
  })
})

describe('estado de máquinas del turno', () => {
  const machines = [
    { id: 'm1', code: 'INC-01' },
    { id: 'm2', code: 'INC-07' },
    { id: 'm3', code: 'NAC-04' },
    { id: 'm4', code: 'NAC-05' },
  ]

  it('usa la última ronda de cada máquina y pone las fallas primero', () => {
    const h = machineHealth(
      [
        { machine_id: 'm1', condition: 'fault', taken_at: '2026-09-28T15:00:00Z' },
        { machine_id: 'm1', condition: 'normal', taken_at: '2026-09-28T16:00:00Z' },
        { machine_id: 'm3', condition: 'warning', taken_at: '2026-09-28T16:00:00Z' },
        { machine_id: 'm2', condition: 'fault', taken_at: '2026-09-28T16:00:00Z' },
      ],
      machines
    )
    expect(h.normal).toBe(1)
    expect(h.warning).toBe(1)
    expect(h.fault).toBe(1)
    expect(h.reported).toBe(3)
    expect(h.total).toBe(4)
    expect(h.attention.map((a) => a.code)).toEqual(['INC-07', 'NAC-04'])
  })

  it('una máquina apagada no es alerta', () => {
    const h = machineHealth([{ machine_id: 'm4', condition: 'off', taken_at: 'x' }], machines)
    expect(h.off).toBe(1)
    expect(h.attention).toEqual([])
  })
})

describe('actividades asignadas', () => {
  it('primero lo que está en curso, luego lo pendiente más antiguo; sin cerradas', () => {
    const list = sortAssignments([
      { id: 'a', status: 'pending', created_at: '2026-09-28T15:00:00Z' },
      { id: 'b', status: 'completed', created_at: '2026-09-28T10:00:00Z' },
      { id: 'c', status: 'in_progress', created_at: '2026-09-28T16:00:00Z' },
      { id: 'd', status: 'pending', created_at: '2026-09-28T12:00:00Z' },
    ])
    expect(list.map((a) => a.id)).toEqual(['c', 'd', 'a'])
  })

  it('reconoce calibraciones, cargues y alertas para llevar a su módulo', () => {
    expect(assignmentKind('Calibrar INC-07').tab).toBe('calibracion')
    expect(assignmentKind('Orden de cargue INC-03').tab).toBe('cargue')
    expect(assignmentKind('Revisar humedad NAC-04').icon).toBe('alert')
    expect(assignmentKind('Aseo de sala').icon).toBe('task')
  })
})

describe('producción del día', () => {
  const day = '2026-09-28'
  it('cuenta lo de hoy, arma la línea del día y el siguiente cargue pendiente', () => {
    const p = productionDay({
      day,
      loads: [
        { id: 1, loaded_at: '2026-09-28T08:10:00', lote: 'L-1' },
        { id: 2, loaded_at: '2026-09-27T08:10:00', lote: 'L-0' },
      ],
      transfers: [{ id: 3, transferred_at: '2026-09-28T11:40:00', lote: 'L-9', mode: 'double' }],
      hatches: [{ id: 4, scheduled_at: '2026-09-28T19:00:00', status: 'planned', lote: 'L-5' }],
      loadMaps: [
        { id: 'b', status: 'approved', approved_at: '2026-09-28T12:00:00', machine_name: 'INC-05', payload: { lote: 'L-3' } },
        { id: 'a', status: 'ordered', ordered_at: '2026-09-28T09:00:00', machine_name: 'INC-03', payload: { lote: 'L-2' } },
        { id: 'c', status: 'completed', machine_name: 'INC-01' },
        { id: 'd', status: 'approved', loaded_at: '2026-09-28T10:00:00', machine_name: 'INC-02' },
      ],
    })
    expect(p.loads).toEqual({ done: 1, pending: 2 })
    expect(p.transfers.done).toBe(1)
    expect(p.hatches).toEqual({ done: 0, total: 1 })
    expect(p.next).toMatchObject({ machine: 'INC-03', lote: 'L-2' })
    expect(p.timeline.map((t) => t.state)).toEqual(['done', 'done', 'planned'])
    expect(p.timeline[1].text).toContain('doble')
  })

  it('sin cargues pendientes no inventa uno', () => {
    expect(productionDay({ day }).next).toBeNull()
  })
})

describe('recepción del día', () => {
  const day = '2026-09-28'
  it('muestra esperados de hoy y atrasados, lo recibido hoy y cuál está en puerta', () => {
    const r = receptionDay({
      day,
      lots: [
        { id: 'l1', code: 'L-1', origin: 'Granja A', expected_arrival_date: '2026-09-28', postures: [{ productionDate: '2026-09-25', eggs: 600 }, { productionDate: '2026-09-26', eggs: 400 }] },
        { id: 'l2', code: 'L-2', origin: 'Granja B', expected_arrival_date: '2026-09-28' },
        { id: 'l3', code: 'L-3', origin: 'Granja C', expected_arrival_date: '2026-09-27' },
        { id: 'l4', code: 'L-4', origin: 'Granja D', expected_arrival_date: '2026-09-30' },
        { id: 'l5', code: 'L-5', origin: 'Granja E', expected_arrival_date: '2026-09-26' },
      ],
      arrivals: [
        { lot_id: 'l1', arrived_at: '2026-09-28T09:05:00' },
        { lot_id: 'l5', arrived_at: '2026-09-26T09:05:00' },
      ],
    })
    expect(r.expected.map((l) => l.code)).toEqual(['L-3', 'L-2', 'L-1'])
    expect(r.expected[0].late).toBe(true)
    expect(r.atDoor.code).toBe('L-3')
    expect(r.received).toBe(1)
    expect(r.pending).toBe(2)
    // posturas reales: lista por fecha de postura → 1.000 esperadas
    expect(r.expected.find((l) => l.code === 'L-1').postures).toBe(1000)
  })
})

describe('equipo del supervisor en el turno', () => {
  const members = [
    { id: 'u1', name: 'Ana Operaria', role: 'operator' },
    { id: 'u2', name: 'Luis Auxiliar', role: 'auxiliary' },
    { id: 'u3', name: 'Rosa Recepción', role: 'reception_operator' },
    { id: 'u4', name: 'Líder', role: 'coordinator' },
    { id: 'u5', name: 'Otro turno', role: 'operator' },
  ]
  const assignments = [
    { user_id: 'u1', work_date: '2026-09-28', shift_number: 2 },
    { user_id: 'u2', work_date: '2026-09-28', shift_number: 2 },
    { user_id: 'u3', work_date: '2026-09-28', shift_number: 2 },
    { user_id: 'u5', work_date: '2026-09-28', shift_number: 1 },
  ]
  const attendance = [
    { user_id: 'u1', punch_type: 'in', punched_at: '2026-09-28T13:52:00' },
    { user_id: 'u2', punch_type: 'in', punched_at: '2026-09-28T14:03:00' },
  ]

  it('toma a los programados del turno, marca ausentes y atrasados', () => {
    const t = teamOnShift({
      members,
      assignments,
      attendance,
      roundsByUser: { u1: 4, u2: 1 },
      shift: 2,
      shiftDate: '2026-09-28',
      now: at(18),
    })
    expect(t.people.map((p) => p.id)).toEqual(['u1', 'u2', 'u3'])
    expect(t.present).toBe(2)
    expect(t.absent.map((p) => p.id)).toEqual(['u3'])
    expect(t.behind.map((p) => p.id)).toEqual(['u2'])
  })

  it('sin programación usa a quienes marcaron ingreso', () => {
    const t = teamOnShift({ members, assignments: [], attendance, shift: 2, shiftDate: '2026-09-28', now: at(15) })
    expect(t.people.map((p) => p.id)).toEqual(['u1', 'u2'])
  })
})

describe('iniciales', () => {
  it('usa la primera y la última palabra', () => {
    expect(initials('Ana María López')).toBe('AL')
    expect(initials('Rosa')).toBe('R')
    expect(initials('')).toBe('?')
  })
})
