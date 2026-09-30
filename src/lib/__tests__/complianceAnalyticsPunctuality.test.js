import { describe, it, expect } from 'vitest'
import { buildFactRows } from '../complianceAnalytics'

const co = (ymd, hm) => `${ymd}T${hm}:00-05:00`

describe('adherencia al turno en la analítica', () => {
  const members = [{ id: 'a', role: 'operator', name: 'Ana' }]
  const facts = buildFactRows({
    members,
    attendance: [
      { user_id: 'a', punch_type: 'in', punched_at: co('2026-09-27', '22:20'), shift_date: '2026-09-27' },
      { user_id: 'a', punch_type: 'out', punched_at: co('2026-09-28', '06:00'), shift_date: '2026-09-28' },
    ],
    assignments: [{ user_id: 'a', work_date: '2026-09-27', shift_number: 3, is_rest: false }],
    targets: [{ labor_key: 'margin_in_min', expected: 15 }],
    fromDate: '2026-09-20',
    toDate: '2026-09-28',
    now: new Date(co('2026-09-28', '12:00')),
  })

  it('el turno 3 queda completo en el día en que inicia', () => {
    const days = new Set(facts.map((f) => f.date))
    expect([...days]).toEqual(['2026-09-27'])
    const att = facts.find((f) => f.activity === 'attendance_punches')
    expect(att.actual).toBe(2)
  })

  it('la llegada fuera del margen baja la adherencia y queda en la evidencia', () => {
    const adh = facts.find((f) => f.activity === 'shift_adherence')
    expect(adh.actual).toBe(75)
    expect(adh.shift).toBe('T3')
    expect(adh.evidence).toBe('T3 · llegó 22:20 (20 min tarde) · salió 06:00 (a tiempo)')
  })

  it('los márgenes no aparecen como metas de cumplimiento', () => {
    expect(facts.some((f) => f.activity.startsWith('margin_'))).toBe(false)
  })
})
