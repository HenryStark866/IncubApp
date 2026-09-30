import { describe, expect, it } from 'vitest'
import {
  CHECKLIST,
  canSuperviseEntry,
  checklistComplete,
  permitHtml,
  programHtml,
  programStats,
  readingIssues,
  readingOk,
  spaceStatus,
} from './confinedSpaces'

const tunnels = [
  {
    id: 's1',
    code: 'S78',
    name: 'TUNEL INCUBADORAS No 2',
    width_m: 29,
    length_m: 4,
    height_m: 1.9,
    hazards: ['Atmósfera'],
    controls: ['LOTO'],
  },
  { id: 's2', code: 'S80', name: 'TUNEL NACEDORAS No2', width_m: 4, length_m: 4.4, height_m: 1.95 },
]

describe('mediciones de gases (mismos límites que la base)', () => {
  it('acepta aire normal y rechaza lo que está fuera', () => {
    expect(readingOk({ o2_pct: 20.9, lel_pct: 0, co_ppm: 2, h2s_ppm: 0 })).toBe(true)
    expect(readingOk({ o2_pct: '19,5'.replace(',', '.'), lel_pct: '9.9' })).toBe(true)
    expect(readingIssues({ o2_pct: 19.4, lel_pct: 0 })).toEqual(['Oxígeno bajo (19.4 %)'])
    expect(readingIssues({ o2_pct: 23.6, lel_pct: 0 })[0]).toContain('Oxígeno alto')
    expect(readingIssues({ o2_pct: 20.9, lel_pct: 10 })[0]).toContain('LIE')
    expect(readingIssues({ o2_pct: 20.9, lel_pct: 0, co_ppm: 26 })).toEqual(['CO 26 ppm'])
    expect(readingIssues({ o2_pct: 20.9, lel_pct: 0, hcho_ppm: 0.4 })).toEqual(['Formaldehído 0.4 ppm'])
    expect(readingIssues({ lel_pct: 0 })).toEqual(['Falta el oxígeno'])
  })
})

describe('permiso', () => {
  it('la lista está completa solo con todo confirmado', () => {
    const all = Object.fromEntries(CHECKLIST.map((i) => [i.key, true]))
    expect(checklistComplete(all)).toBe(true)
    expect(checklistComplete({ ...all, rescue: false })).toBe(false)
    expect(checklistComplete(null)).toBe(false)
  })
  it('supervisor de entrada: SST, líderes de planta y mantenimiento, gerencia', () => {
    expect(canSuperviseEntry({ role: 'coordinator', area: 'hse' })).toBe(true)
    expect(canSuperviseEntry({ role: 'coordinator', area: 'maintenance' })).toBe(true)
    expect(canSuperviseEntry({ role: 'sst_auxiliary' })).toBe(true)
    expect(canSuperviseEntry({ role: 'coordinator', area: 'sales' })).toBe(false)
    expect(canSuperviseEntry({ role: 'operator' })).toBe(false)
  })
  it('estado de cada túnel según permisos y gente adentro', () => {
    const permits = [
      { id: 'p1', space_id: 's1', status: 'active' },
      { id: 'p2', space_id: 's2', status: 'suspended' },
      { id: 'p3', space_id: 's2', status: 'closed' },
    ]
    const entries = [
      { permit_id: 'p1', person_name: 'Ana', exited_at: null },
      { permit_id: 'p1', person_name: 'Luis', exited_at: '2026-09-30T10:00:00Z' },
    ]
    const st = spaceStatus({ spaces: tunnels, permits, entries })
    expect(st[0]).toMatchObject({ state: 'occupied' })
    expect(st[0].inside.map((e) => e.person_name)).toEqual(['Ana'])
    expect(st[1].state).toBe('suspended')
    expect(spaceStatus({ spaces: tunnels })[0].state).toBe('closed')
  })
})

describe('documentos', () => {
  it('el programa trae el inventario real, el marco legal y los límites', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    const stats = programStats({
      now,
      permits: [
        { status: 'closed', created_at: '2026-09-01' },
        { status: 'closed', suspended_reason: 'x', created_at: '2026-08-01' },
      ],
      readings: [{ taken_at: '2026-09-01', o2_pct: 18, lel_pct: 0, ok: false }],
    })
    expect(stats).toMatchObject({ permits: 2, closed: 2, suspended: 1, readings: 1, badReadings: 1 })
    const html = programHtml({ spaces: tunnels, stats })
    expect(html).toContain('Resolución 0491 de 2020')
    expect(html).toContain('S78')
    expect(html).toContain('S80')
    expect(html).toContain('2 espacios')
    expect(html).toContain('19.5 % y 23.5 %')
    expect(html).toContain('Responsable del SG-SST')
  })
  it('el permiso escapa lo escrito por el usuario', () => {
    const html = permitHtml({
      permit: { work_description: '<script>x</script>', entrants: ['Ana'], checklist: {}, status: 'draft' },
      space: tunnels[0],
      readings: [{ taken_at: '2026-09-30T10:00:00Z', o2_pct: 20.9, lel_pct: 0 }],
    })
    expect(html).not.toContain('<script>x')
    expect(html).toContain('Aceptable')
  })
})
