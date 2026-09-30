import { describe, it, expect } from 'vitest'
import {
  activityBuckets,
  attendanceStage,
  buildIncidentOrder,
  pickRoundPlant,
  roundHourStatus,
  shortcutsFor,
  upcomingShifts,
} from './operatorHome'

// Fechas locales (sin zona) para que la prueba no dependa de la zona del equipo.
const at = (hh, mm = 0, day = '2026-09-29') => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
const iso = (...a) => at(...a).toISOString()

describe('asistencia en el inicio', () => {
  const end = at(14)
  it('sin marcas pide el ingreso', () => {
    expect(attendanceStage({ punches: [], isInside: false, shiftEnd: end, now: at(6, 5) }).stage).toBe('in')
  })
  it('adentro: sugiere la salida desde 45 min antes del fin', () => {
    const punches = [{ punch_type: 'in', punched_at: iso(6, 2) }]
    expect(attendanceStage({ punches, isInside: true, shiftEnd: end, now: at(10) })).toMatchObject({ stage: 'inside', suggestOut: false })
    expect(attendanceStage({ punches, isInside: true, shiftEnd: end, now: at(13, 20) })).toMatchObject({ stage: 'inside', suggestOut: true })
  })
  it('después de la salida el turno queda cerrado', () => {
    const punches = [{ punch_type: 'in', punched_at: iso(6, 2) }, { punch_type: 'out', punched_at: iso(14, 3) }]
    const s = attendanceStage({ punches, isInside: false, shiftEnd: end, now: at(14, 10) })
    expect(s.stage).toBe('done')
    expect(s.outPunch.punched_at).toBe(iso(14, 3))
  })
  it('la salida de ayer no cierra el turno de hoy', () => {
    const punches = [{ punch_type: 'out', punched_at: iso(14, 3, '2026-09-28') }]
    expect(attendanceStage({ punches, isInside: false, shiftEnd: end, now: at(6, 1) }).stage).toBe('in')
  })
})

describe('ronda de la hora', () => {
  const rooms = [
    { id: 'r1', plant_id: 'p1', name: 'Incubadoras 1', type: 'incubation' },
    { id: 'r2', plant_id: 'p1', name: 'Nacedoras 1', type: 'hatching' },
  ]
  const machines = [
    { id: 'm1', plant_id: 'p1', room_id: 'r1', code: 'INC-1', type: 'setter' },
    { id: 'm2', plant_id: 'p1', room_id: 'r1', code: 'INC-2', type: 'setter' },
    { id: 'm3', plant_id: 'p1', room_id: 'r2', code: 'NAC-1', type: 'hatcher' },
    { id: 'm4', plant_id: 'p1', room_id: 'r2', code: 'NAC-2', type: 'hatcher', status: 'decommissioned' },
  ]
  const checks = [
    { machine_id: 'm1', plant_id: 'p1', shift_date: '2026-09-29', hour_slot: 9, taken_by: 'u', taken_at: iso(9, 5), condition: 'normal' },
    { machine_id: 'm3', plant_id: 'p1', shift_date: '2026-09-29', hour_slot: 9, taken_by: 'x', taken_at: iso(9, 10), condition: 'fault' },
    { machine_id: 'm2', plant_id: 'p1', shift_date: '2026-09-29', hour_slot: 8, taken_by: 'u', taken_at: iso(8, 10), condition: 'normal' },
  ]

  it('cuenta las máquinas de la ronda en la hora, sala por sala', () => {
    const s = roundHourStatus({ machines, rooms, checks, plantId: 'p1', shiftDate: '2026-09-29', hour: 9, userId: 'u' })
    expect(s).toMatchObject({ total: 3, done: 2, pending: 1, mine: 1, issues: 1, complete: false })
    expect(s.rooms[0]).toMatchObject({ name: 'Incubadoras 1', done: 1, total: 2 })
  })

  it('elige la planta donde la persona está haciendo la ronda', () => {
    const plants = [{ id: 'p0' }, { id: 'p1' }]
    expect(pickRoundPlant({ plants, machines, rooms, checks, userId: 'u' })).toBe('p1')
    expect(pickRoundPlant({ plants, machines, rooms, checks: [], userId: 'u' })).toBe('p1')
  })
})

describe('actividades y turnos', () => {
  it('separa en curso, por hacer y hechas hoy', () => {
    const b = activityBuckets({
      userId: 'u',
      today: '2026-09-29',
      activities: [
        { id: 1, assigned_to: 'u', status: 'pending', created_at: '2026-09-29T08:00' },
        { id: 2, assigned_to: 'u', status: 'in_progress', created_at: '2026-09-29T07:00' },
        { id: 3, assigned_to: 'u', status: 'completed', completed_at: iso(9) },
        { id: 4, assigned_to: 'u', status: 'completed', completed_at: iso(9, 0, '2026-09-28') },
        { id: 5, assigned_to: 'x', status: 'pending' },
      ],
    })
    expect(b.doing.map((a) => a.id)).toEqual([2])
    expect(b.todo.map((a) => a.id)).toEqual([1])
    expect(b.doneToday.map((a) => a.id)).toEqual([3])
  })

  it('próximos turnos con hoy, mañana y descansos', () => {
    const list = upcomingShifts({
      userId: 'u',
      today: '2026-09-29',
      assignments: [
        { user_id: 'u', work_date: '2026-09-28', shift_number: 1 },
        { user_id: 'u', work_date: '2026-09-29', shift_number: 1 },
        { user_id: 'u', work_date: '2026-09-30', shift_number: null, is_rest: true },
        { user_id: 'u', work_date: '2026-10-01', shift_number: 2 },
        { user_id: 'x', work_date: '2026-09-29', shift_number: 3 },
      ],
    })
    expect(list.map((s) => [s.label, s.shiftNumber, s.isRest])).toEqual([
      ['Hoy', 1, false],
      ['Mañana', null, true],
      [list[2].label, 2, false],
    ])
  })
})

describe('novedades', () => {
  it('la falla queda como OT correctiva abierta para mantenimiento', () => {
    const row = buildIncidentOrder({
      type: 'Falla de volteo',
      detail: ' No voltea desde las 8 ',
      machine: { id: 'm1', code: 'INC-1', plant_id: 'p1', room_id: 'r1' },
      priority: 'critical',
      orgId: 'o',
      userId: 'u',
    })
    expect(row).toMatchObject({
      title: 'INC-1 · Falla de volteo',
      type: 'corrective',
      status: 'open',
      source: 'incident',
      priority: 'critical',
      assigned_to: null,
      machine_id: 'm1',
      room_id: 'r1',
      plant_id: 'p1',
    })
    expect(row.description.startsWith('No voltea desde las 8\n')).toBe(true)
  })
})

describe('accesos', () => {
  it('solo los que el rol puede abrir; el auxiliar no ve las secciones de supervisión', () => {
    const can = (t) => ['supervision', 'calibracion', 'monitoreo'].includes(t)
    expect(shortcutsFor({ role: 'operator', can }).map((s) => s.id)).toEqual(['cargue', 'transferencia', 'calibracion', 'mercancia', 'ot', 'monitoreo', 'cumplimiento'])
    expect(shortcutsFor({ role: 'auxiliary', can }).map((s) => s.id)).toEqual(['calibracion', 'monitoreo', 'cumplimiento'])
  })
})
