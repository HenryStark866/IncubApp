import { describe, expect, it } from 'vitest'
import { hatchForRecord, hatchPatchFromRecords } from '../hatchFromCounts'

const hatch = { id: 'h', lote: '43 + 44', status: 'planned', scheduled_at: '2026-10-13T06:00:00-05:00' }

describe('el conteo de vacunación cierra el nacimiento', () => {
  it('encuentra el nacimiento del lote', () => {
    expect(hatchForRecord([hatch], { lote: '44', sampled_at: '2026-10-13T10:00:00-05:00' })?.id).toBe('h')
    expect(hatchForRecord([hatch], { lote: '50', sampled_at: '2026-10-13T10:00:00-05:00' })).toBeNull()
  })

  it('con un lote contado queda en curso; con todos, cerrado con machos, hembras y peso', () => {
    const r43 = { kind: 'sexing_count', lote: '43', sampled_at: '2026-10-13T09:00:00-05:00', results: { conteoMac: 15000, conteoHem: 14000 } }
    const p1 = hatchPatchFromRecords(hatch, [r43], { userId: 'u' })
    expect(p1).toMatchObject({ actual_chicks: 29000, status: 'in_progress' })
    const r44 = { kind: 'sexing_count', lote: '44', sampled_at: '2026-10-13T11:00:00-05:00', results: { conteoMac: 12000, conteoHem: 11000 } }
    const peso = { kind: 'chick_quality', lote: '44', sampled_at: '2026-10-13T11:30:00-05:00', results: { promedio: 41.2 } }
    const p2 = hatchPatchFromRecords(hatch, [r43, r44, peso], { userId: 'u' })
    expect(p2).toMatchObject({ actual_chicks: 52000, males_count: 27000, females_count: 25000, status: 'completed', closed_by: 'u', avg_chick_weight_g: 41.2 })
  })
})
