import { describe, expect, it } from 'vitest'
import { compareClock, latestClocks } from '../machineClock'
import { buildProductionFlow } from '../productionFlow'

const at = (s) => new Date(s).toISOString()
const now = Date.parse('2026-10-12T18:30:00-05:00')

describe('reloj del ciclo de la pantalla', () => {
  it('calcula el inicio real del ciclo y descarta lecturas viejas', () => {
    const c = latestClocks(
      [
        { machine_id: 'm2', taken_at: at('2026-10-12T18:05:00-05:00'), cycle_age_minutes: 18 * 1440 + 20 * 60 + 49 },
        { machine_id: 'm9', taken_at: at('2026-10-12T10:00:00-05:00'), cycle_age_minutes: 100 },
      ],
      now,
    )
    expect(c.has('m9')).toBe(false)
    expect(new Date(c.get('m2').startAt).toISOString()).toBe(at('2026-09-23T21:16:00-05:00'))
  })

  it('casos reales del 12-10: INC-01 cargada sin registro e INC-02 con el día que no cuadra', () => {
    const machines = [
      { id: 'm1', code: 'INC-01', type: 'setter', status: 'active' },
      { id: 'm2', code: 'INC-02', type: 'setter', status: 'active' },
    ]
    const loads = [{ id: 'l2', machine_id: 'm2', lote: '46', loaded_at: at('2026-09-30T19:03:00-05:00'), cycle_start_at: at('2026-09-30T23:00:00-05:00') }]
    const clockChecks = [
      { machine_id: 'm1', taken_at: at('2026-10-12T18:05:00-05:00'), cycle_age_minutes: 16 * 60 + 51 },
      { machine_id: 'm2', taken_at: at('2026-10-12T18:05:00-05:00'), cycle_age_minutes: 18 * 1440 + 20 * 60 + 49 },
    ]
    const f = buildProductionFlow({ now, machines, loads, clockChecks })
    const cargue = f.stages.find((s) => s.id === 'cargue').items.map((i) => i.text)
    expect(cargue.some((t) => /INC-01: su pantalla lleva 0d 17h de ciclo y en la app está vacía/.test(t))).toBe(true)
    expect(cargue.some((t) => /INC-02: la pantalla dice día 18 y la app día 11/.test(t))).toBe(true)
    // La transferencia sale con el día real de la máquina
    const tra = f.stages.find((s) => s.id === 'transferencia').items.map((i) => i.text)
    expect(tra.some((t) => /INC-02: transferir hoy .*según la pantalla/.test(t))).toBe(true)
  })

  it('una máquina vacía con el reloj en pocas horas no se toma como cargue', () => {
    expect(compareClock({ ageMin: 300, day: 0.2, startAt: now }, { phase: 'idle' })).toBeNull()
  })
})
