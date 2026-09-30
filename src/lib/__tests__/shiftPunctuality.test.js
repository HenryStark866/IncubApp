import { describe, it, expect } from 'vitest'
import {
  buildPunctuality,
  describeDelta,
  describeShiftResult,
  evaluateShift,
  matchShift,
  pairPunches,
  readMargins,
  shiftBounds,
} from '../shiftPunctuality'

// Horas de Colombia (UTC−5) para que la prueba no dependa de la zona del equipo.
const co = (ymd, hm) => `${ymd}T${hm}:00-05:00`
const punch = (user_id, punch_type, ymd, hm) => ({ user_id, punch_type, punched_at: co(ymd, hm) })

describe('horario de los turnos', () => {
  it('el turno 3 termina a las 06:00 del día siguiente', () => {
    const b = shiftBounds('2026-09-28', 3)
    expect(b.start.toISOString()).toBe('2026-09-29T03:00:00.000Z')
    expect(b.end.toISOString()).toBe('2026-09-29T11:00:00.000Z')
  })
})

describe('márgenes', () => {
  const targets = [
    { labor_key: 'margin_in_min', expected: 15 },
    { labor_key: 'margin_in_min', expected: 5, role: 'operator' },
    { labor_key: 'margin_out_min', expected: 0, user_id: 'u1' },
  ]
  it('usuario > rol > global > fábrica', () => {
    expect(readMargins(targets, { id: 'u1', role: 'operator' })).toEqual({ inMin: 5, outMin: 0 })
    expect(readMargins(targets, { id: 'u2', role: 'supervisor' })).toEqual({ inMin: 15, outMin: 10 })
    expect(readMargins([], { id: 'u3' })).toEqual({ inMin: 10, outMin: 10 })
  })
})

describe('asociar la marca al turno', () => {
  it('usa el turno asignado aunque la marca sea antes de medianoche', () => {
    const s = matchShift(co('2026-09-28', '21:50'), [
      { work_date: '2026-09-28', shift_number: 3, is_rest: false },
    ])
    expect(s).toMatchObject({ date: '2026-09-28', shiftNumber: 3, inferred: false })
  })
  it('sin asignación infiere el turno más cercano; a mitad de turno cuenta como tarde', () => {
    expect(matchShift(co('2026-09-28', '05:52'), [])).toMatchObject({ date: '2026-09-28', shiftNumber: 1, inferred: true })
    expect(matchShift(co('2026-09-28', '10:00'), [])).toMatchObject({ shiftNumber: 1 })
  })
})

describe('emparejar ingresos y salidas', () => {
  it('cada ingreso con la siguiente salida; salidas sueltas se ignoran', () => {
    const s = pairPunches([
      punch('u', 'out', '2026-09-28', '05:00'),
      punch('u', 'in', '2026-09-28', '06:00'),
      punch('u', 'out', '2026-09-28', '14:00'),
      punch('u', 'in', '2026-09-29', '06:00'),
    ])
    expect(s).toHaveLength(2)
    expect(s[1].outAt).toBeNull()
  })
})

describe('evaluar el turno', () => {
  const shift = shiftBounds('2026-09-28', 1)
  const margins = { inMin: 10, outMin: 10 }
  const later = new Date(co('2026-09-29', '12:00'))

  it('dentro del margen = 100', () => {
    const r = evaluateShift({ shift, inAt: co('2026-09-28', '06:08'), outAt: co('2026-09-28', '13:55'), margins, now: later })
    expect(r).toMatchObject({ inStatus: 'on_time', inDeltaMin: 8, outStatus: 'on_time', outDeltaMin: -5, adherence: 100 })
  })
  it('tarde y salida anticipada = 50', () => {
    const r = evaluateShift({ shift, inAt: co('2026-09-28', '06:25'), outAt: co('2026-09-28', '13:30'), margins, now: later })
    expect(r).toMatchObject({ inStatus: 'late', inDeltaMin: 25, outStatus: 'early', outDeltaMin: -30, adherence: 50 })
  })
  it('en turno todavía no pierde la salida; horas después sí', () => {
    const during = new Date(co('2026-09-28', '10:00'))
    expect(evaluateShift({ shift, inAt: co('2026-09-28', '06:00'), outAt: null, margins, now: during })).toMatchObject({ outStatus: 'open', adherence: 50 })
    expect(evaluateShift({ shift, inAt: co('2026-09-28', '06:00'), outAt: null, margins, now: later })).toMatchObject({ outStatus: 'missing', adherence: 50 })
  })
})

describe('puntualidad del equipo', () => {
  it('el turno 3 queda en el día en que inicia y las ausencias se cuentan', () => {
    const rows = buildPunctuality({
      punches: [punch('a', 'in', '2026-09-27', '22:15'), punch('a', 'out', '2026-09-28', '06:02')],
      assignments: [
        { user_id: 'a', work_date: '2026-09-27', shift_number: 3, is_rest: false },
        { user_id: 'b', work_date: '2026-09-27', shift_number: 1, is_rest: false },
        { user_id: 'b', work_date: '2026-09-28', shift_number: null, is_rest: true },
        { user_id: 'b', work_date: '2026-09-30', shift_number: 1, is_rest: false },
      ],
      now: new Date(co('2026-09-28', '12:00')),
    })
    expect(rows).toHaveLength(2)
    const a = rows.find((r) => r.userId === 'a')
    expect(a).toMatchObject({ date: '2026-09-27', shiftNumber: 3, inStatus: 'late', inDeltaMin: 15, outStatus: 'on_time', adherence: 75 })
    expect(describeShiftResult(a)).toBe('T3 · llegó 22:15 (15 min tarde) · salió 06:02 (a tiempo)')
    const b = rows.find((r) => r.userId === 'b')
    expect(b).toMatchObject({ date: '2026-09-27', inStatus: 'absent', adherence: 0 })
    expect(describeShiftResult(b)).toBe('T1 · sin ingreso')
  })
  it('varias entradas en el mismo turno: primera llegada y última salida', () => {
    const rows = buildPunctuality({
      punches: [
        punch('a', 'in', '2026-09-28', '06:05'),
        punch('a', 'out', '2026-09-28', '09:00'),
        punch('a', 'in', '2026-09-28', '09:30'),
        punch('a', 'out', '2026-09-28', '14:01'),
      ],
      now: new Date(co('2026-09-29', '12:00')),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ inDeltaMin: 5, outDeltaMin: 1, adherence: 100, inferred: true })
  })
})

describe('textos', () => {
  it('describe minutos y horas', () => {
    expect(describeDelta(0)).toBe('a la hora')
    expect(describeDelta(12)).toBe('12 min tarde')
    expect(describeDelta(-75)).toBe('1 h 15 min antes')
    expect(describeDelta(120)).toBe('2 h tarde')
  })
})
