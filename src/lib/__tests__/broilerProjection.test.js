import { describe, expect, it } from 'vitest'
import { eggsOfLoad, historicalHatchRate, projectBroiler, REFERENCE_HATCH_RATE } from '../broilerProjection'

const DAY = 86_400_000
const NOW = Date.parse('2026-10-12T15:00:00Z')
const iso = (daysFromNow) => new Date(NOW + daysFromNow * DAY).toISOString()

describe('proyección broiler', () => {
  it('usa la tasa real de los nacimientos cerrados y descarta los imposibles', () => {
    const r = historicalHatchRate(
      [
        { incubable_eggs: 10000, actual_chicks: 8500, ended_at: iso(-10) },
        { incubable_eggs: 10000, actual_chicks: 8700, ended_at: iso(-20) },
        { incubable_eggs: 1000, actual_chicks: 5000, ended_at: iso(-5) }, // error de digitación
        { incubable_eggs: 1000, actual_chicks: 900, ended_at: iso(-200) }, // fuera de la ventana
      ],
      { now: NOW },
    )
    expect(r.source).toBe('real')
    expect(r.samples).toBe(2)
    expect(r.rate).toBeCloseTo(0.86, 5)
  })

  it('sin historia usa la referencia y lo dice', () => {
    expect(historicalHatchRate([], { now: NOW })).toMatchObject({ rate: REFERENCE_HATCH_RATE, source: 'referencia' })
  })

  it('toma los huevos del mapa de cargue de esa incubadora o, si no, del lote', () => {
    const load = { machine_id: 'm1', lote: '41 + 43', loaded_at: iso(-5) }
    const maps = [{ machine_id: 'm1', created_at: iso(-6), payload: { slots: [{ entry: { eggs: 5376 } }, { entry: { eggs: 5000 } }] } }]
    expect(eggsOfLoad(load, { maps })).toEqual({ eggs: 10376, source: 'mapa' })
    const lotsByCode = new Map([
      ['41', { code: '41', postures: [{ eggs: 3000 }, { eggs: 2000 }] }],
      ['43', { code: '43', postures: [{ eggs: 1000 }] }],
    ])
    expect(eggsOfLoad(load, { lotsByCode })).toEqual({ eggs: 6000, source: 'lote' })
  })

  it('arma cada ciclo con su etapa, su fecha de nacimiento y lo proyectado', () => {
    const p = projectBroiler({
      now: NOW,
      machines: [{ id: 'm1', code: 'INC-01' }, { id: 'm2', code: 'INC-02' }],
      loads: [
        { id: 'a', machine_id: 'm1', lote: '41', loaded_at: iso(-19) },
        { id: 'a-dup', machine_id: 'm1', lote: '41', loaded_at: iso(-19) }, // repetido
        { id: 'b', machine_id: 'm2', lote: '45', loaded_at: iso(-3) },
      ],
      transfers: [{ id: 't1', source_machine_id: 'm1', lote: '41', transferred_at: iso(-1) }],
      hatches: [
        { id: 'h-old', incubable_eggs: 10000, actual_chicks: 8000, estimated_chicks: 8200, ended_at: iso(-30) },
      ],
      lots: [
        { code: '41', postures: [{ eggs: 10000 }] },
        { code: '45', postures: [{ eggs: 20000 }] },
      ],
    })
    expect(p.rate.rate).toBeCloseTo(0.8)
    expect(p.cycles).toHaveLength(2)
    const [a, b] = p.cycles
    expect(a).toMatchObject({ machine: 'INC-01', stage: 'nacedora', eggs: 10000, projected: 8000, projectedSource: 'tasa-real' })
    expect(b).toMatchObject({ machine: 'INC-02', stage: 'incubando', day: 3, projected: 16000 })
    expect(p.totals.next7).toBe(8000) // b nace en 18 días
    expect(p.totals.next21).toBe(24000)
    expect(p.accuracy).toMatchObject({ samples: 1, estimated: 8200, actual: 8000 })
  })

  it('cuando el nacimiento se cierra manda el dato real', () => {
    const p = projectBroiler({
      now: NOW,
      loads: [{ id: 'a', machine_id: 'm1', lote: '41', loaded_at: iso(-21.5) }],
      transfers: [{ id: 't1', source_machine_id: 'm1', transferred_at: iso(-3) }],
      hatches: [{ id: 'h1', transfer_id: 't1', status: 'completed', incubable_eggs: 9000, estimated_chicks: 7600, actual_chicks: 7800, ended_at: iso(-0.2) }],
    })
    expect(p.cycles[0]).toMatchObject({ stage: 'nacido', actual: 7800, projected: 7600, eggsSource: 'nacimiento' })
    expect(p.totals.cyclesInProcess).toBe(0)
  })
})
