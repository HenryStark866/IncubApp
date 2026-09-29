import { describe, it, expect } from 'vitest'
import {
  activityColumns,
  assigneeOptions,
  attentionFeed,
  buildCheckActivity,
  buildRoundReminder,
  cellDetail,
  personStatusText,
  roundMatrix,
  shiftHours,
  shiftStatus,
  teamBoard,
} from './supervisorHome'

const at = (hh, mm = 0, day = '2026-09-29') => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
const iso = (...a) => at(...a).toISOString()

describe('horas del turno', () => {
  it('el T3 cruza la medianoche', () => {
    expect(shiftHours(1)).toEqual([6, 7, 8, 9, 10, 11, 12, 13])
    expect(shiftHours(3)).toEqual([22, 23, 0, 1, 2, 3, 4, 5])
  })
})

describe('mapa de la ronda', () => {
  const rooms = [
    { id: 'r1', plant_id: 'p1', name: 'Incubadoras 1', type: 'incubation' },
    { id: 'r2', plant_id: 'p1', name: 'Nacedoras 1', type: 'hatching' },
  ]
  const machines = [
    { id: 'm1', plant_id: 'p1', room_id: 'r1', code: 'INC-1' },
    { id: 'm2', plant_id: 'p1', room_id: 'r1', code: 'INC-2' },
    { id: 'm3', plant_id: 'p1', room_id: 'r2', code: 'NAC-1' },
  ]
  const c = (machine_id, hour, condition, taken_at = iso(hour, 10)) => ({ machine_id, shift_date: '2026-09-29', shift_number: 1, hour_slot: hour, condition, taken_at, taken_by: 'u', photo_path: 'x' })
  const checks = [c('m1', 6, 'normal'), c('m2', 6, 'warning'), c('m3', 6, 'normal'), c('m1', 7, 'fault'), c('m1', 7, 'normal', iso(7, 50))]

  it('cobertura y peor condición por sala y hora', () => {
    const m = roundMatrix({ machines, rooms, checks, plantId: 'p1', shiftDate: '2026-09-29', shift: 1, currentHour: 7 })
    expect(m.total).toBe(3)
    const inc = m.rows.find((r) => r.room.id === 'r1')
    expect(inc.cells[0]).toMatchObject({ hour: 6, done: 2, total: 2, worst: 'warning', state: 'past' })
    // En la hora 7 vale el último registro de la máquina (normal, no la falla anterior).
    expect(inc.cells[1]).toMatchObject({ hour: 7, done: 1, worst: 'normal', state: 'current' })
    expect(inc.cells[2]).toMatchObject({ done: 0, worst: null, state: 'future' })
    expect(m.byHour[0]).toMatchObject({ done: 3, total: 3 })
  })

  it('detalle de la celda: con novedad primero, luego las que faltan', () => {
    const d = cellDetail({ machines, checks, roomId: 'r1', shiftDate: '2026-09-29', shift: 1, hour: 6 })
    expect(d.map((x) => [x.machine.code, x.check?.condition || null])).toEqual([['INC-2', 'warning'], ['INC-1', 'normal']])
  })
})

describe('equipo del turno', () => {
  const window = { start: at(6), end: at(14) }
  const members = [
    { id: 'a', name: 'Ana', role: 'operator' },
    { id: 'b', name: 'Beto', role: 'operator' },
    { id: 'c', name: 'Caro', role: 'operator' },
    { id: 'd', name: 'Dani', role: 'supervisor' },
  ]
  const assignments = ['a', 'b', 'c'].map((user_id) => ({ user_id, work_date: '2026-09-29', shift_number: 1 }))
  const punches = [
    { user_id: 'a', punch_type: 'in', punched_at: iso(5, 58) },
    { user_id: 'c', punch_type: 'in', punched_at: iso(6, 20) },
  ]
  const checks = [{ taken_by: 'c', taken_at: iso(7, 5), photo_path: 'p' }]
  const now = at(10, 30)
  const team = teamBoard({
    members,
    assignments,
    punches,
    checks,
    acts: [{ assigned_to: 'a', status: 'pending' }],
    roundsByUser: { a: 4, c: 1 },
    punctualityOf: (uid) => (uid === 'c' ? { inStatus: 'late', inDeltaMin: 20 } : { inStatus: 'on_time', inDeltaMin: -2 }),
    shift: 1,
    shiftDate: '2026-09-29',
    window,
    now,
  })

  it('ausente, atrasado y sin movimiento, en ese orden', () => {
    expect(team.people.map((p) => [p.name, p.status])).toEqual([
      ['Beto', 'absent'],
      ['Caro', 'behind'],
      ['Ana', 'idle'],
    ])
    expect(team).toMatchObject({ total: 3, present: 2, expectedNow: 3 })
    const caro = team.people.find((p) => p.id === 'c')
    expect(caro).toMatchObject({ lateMin: 20, photos: 1, rounds: 1 })
    expect(personStatusText(caro)).toBe('1 de 3 rondas a esta hora')
  })

  it('antes de la tolerancia nadie cuenta como ausente', () => {
    const early = teamBoard({ members, assignments, punches: [], shift: 1, shiftDate: '2026-09-29', window, now: at(6, 5) })
    expect(early.absent).toHaveLength(0)
    expect(early.people.every((p) => p.status === 'expected')).toBe(true)
  })

  it('a quién asignar: presentes y con menos carga', () => {
    expect(assigneeOptions(team).map((p) => p.name)).toEqual(['Caro', 'Ana'])
  })
})

describe('pide atención', () => {
  const team = {
    people: [
      { id: 'b', name: 'Beto', absent: true },
      { id: 'c', name: 'Caro', behind: true, rounds: 1, expectedNow: 3, lateMin: 20, inAt: iso(6, 20) },
    ],
  }
  const feed = attentionFeed({
    machineIssues: [
      { machineId: 'm1', code: 'INC-1', condition: 'fault', notes: 'No voltea', at: iso(9) },
      { machineId: 'm2', code: 'INC-2', condition: 'fault', notes: '', at: iso(9) },
      { machineId: 'm3', code: 'NAC-1', condition: 'warning', notes: 'Humedad alta', at: iso(9) },
    ],
    openOrdersByMachine: new Map([['m2', { id: 'w', code: 'OT-9', status: 'open' }]]),
    team,
    acts: [{ id: 'x', title: 'Lavar bandejas', status: 'pending', created_at: iso(7) }],
    round: { pending: 2, minutesLeft: 10, hour: 10 },
    now: at(10, 50),
  })

  it('lo más grave primero y cada cosa con su acción', () => {
    expect(feed[0]).toMatchObject({ kind: 'fault_no_ot', action: { id: 'create_ot' } })
    const kinds = feed.map((i) => i.kind)
    expect(kinds).toEqual(expect.arrayContaining(['fault_ot', 'warning', 'absent', 'behind', 'stalled', 'round_closing']))
    expect(feed.find((i) => i.kind === 'warning').action.id).toBe('assign_check')
    expect(feed.find((i) => i.kind === 'behind').action.id).toBe('remind')
    // Caro va atrasada y además llegó tarde: un solo aviso.
    expect(feed.filter((i) => i.personId === 'c')).toHaveLength(1)
    const late = attentionFeed({ team: { people: [{ id: 'd', name: 'Dani', lateMin: 12, inAt: iso(6, 12) }] }, now: at(10) })
    expect(late).toMatchObject([{ kind: 'late', severity: 0 }])
  })

  it('semáforo', () => {
    expect(shiftStatus(feed)).toMatchObject({ tone: 'alert', headline: '2 fallas por resolver' })
    expect(shiftStatus(feed.filter((i) => i.tone !== 'fault'))).toMatchObject({ tone: 'warn' })
    expect(shiftStatus([{ severity: 0, tone: 'info' }])).toMatchObject({ tone: 'ok', headline: 'Todo en orden' })
  })
})

describe('actividades y filas nuevas', () => {
  it('columnas del turno', () => {
    const col = activityColumns(
      [
        { id: 1, status: 'pending', created_at: '1' },
        { id: 2, status: 'in_progress', started_at: '1' },
        { id: 3, status: 'completed', completed_at: iso(9) },
        { id: 4, status: 'completed', completed_at: iso(9, 0, '2026-09-28') },
      ],
      '2026-09-29'
    )
    expect([col.todo.length, col.doing.length, col.done.length]).toEqual([1, 1, 1])
  })

  it('revisión de una alerta y recordatorio de ronda', () => {
    const check = buildCheckActivity({ issue: { machineId: 'm3', code: 'NAC-1', notes: 'Humedad alta' }, machine: { id: 'm3', plant_id: 'p1', room_id: 'r2' }, assignedTo: 'c', orgId: 'o', userId: 's' })
    expect(check).toMatchObject({ title: 'Revisar NAC-1', machine_id: 'm3', assigned_to: 'c', assigned_by: 's', status: 'pending' })
    expect(check.description).toContain('Humedad alta')
    const rem = buildRoundReminder({ person: { id: 'c', rounds: 1, expectedNow: 3 }, hour: 9, orgId: 'o', userId: 's' })
    expect(rem).toMatchObject({ title: 'Ponerse al día con la ronda de las 09:00', assigned_to: 'c' })
  })
})
