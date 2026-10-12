import { describe, expect, it } from 'vitest'
import { buildProductionFlow, stagesForRole } from '../productionFlow'

const at = (s) => new Date(s).toISOString()
const machines = [
  { id: 's1', code: 'INC-01', type: 'setter', status: 'active' },
  { id: 's2', code: 'INC-02', type: 'setter', status: 'active' },
  { id: 's3', code: 'INC-03', type: 'setter', status: 'active' },
  { id: 'n1', code: 'NAC-01', type: 'hatcher', status: 'active', room_id: 'r1' },
  { id: 'n2', code: 'NAC-02', type: 'hatcher', status: 'active', room_id: 'r1' },
]

describe('flujo de producción', () => {
  it('domingo: día de clasificar, esta noche se cargan dos incubadoras, transferencia y calibración del día', () => {
    const now = Date.parse('2026-10-11T10:00:00-05:00') // domingo
    const f = buildProductionFlow({
      now,
      machines,
      loads: [
        { id: 'l2', machine_id: 's2', lote: '45', loaded_at: at('2026-09-23T22:00:00-05:00'), cycle_start_at: at('2026-09-23T22:00:00-05:00') }, // día 17,5
        { id: 'l3', machine_id: 's3', lote: '46', loaded_at: at('2026-10-09T22:00:00-05:00'), cycle_start_at: at('2026-10-09T22:00:00-05:00') }, // 1d12h
      ],
      carts: Array.from({ length: 24 }, (_, i) => ({ id: `c${i}`, status: 'available' })),
      maps: [{ id: 'm', status: 'ordered', machine_name: 'INC-01' }],
      remisions: [{ id: 'r', remision_no: '4900', created_at: at('2026-10-11T07:00:00-05:00'), totales: { incubable: 30000 } }],
    })
    expect(f.today).toMatchObject({ weekday: 'domingo', hatchToday: false, classifyToday: true, loadTonight: true, hatchFromTonight: '2026-11-02' })
    const s = Object.fromEntries(f.stages.map((x) => [x.id, x]))
    expect(s.recepcion.items.some((i) => /falta el visto bueno/.test(i.text))).toBe(true)
    expect(s.clasificacion.items[0].text).toMatch(/día de clasificar/)
    expect(s.cargue.items[0].text).toMatch(/Esta noche se cargan 2 incubadoras/)
    expect(s.calib_inc.items[0].text).toMatch(/INC-03: calibrar ahora/)
    expect(s.transferencia.items[0].text).toMatch(/INC-02: se transfiere mañana/)
    expect(f.next.length).toBeGreaterThan(0)
  })

  it('día de nacimiento: la auxiliar de vacunación reporta pollitos y pesos', () => {
    const now = Date.parse('2026-10-13T08:00:00-05:00') // martes
    const f = buildProductionFlow({
      now,
      machines,
      hatches: [{ id: 'h', lote: '43 + 44', status: 'planned', scheduled_at: at('2026-10-13T06:00:00-05:00') }],
    })
    const nac = f.stages.find((x) => x.id === 'nacimiento')
    expect(f.today.hatchToday).toBe(true)
    expect(nac.items[0].text).toMatch(/Nace hoy el lote 43 \+ 44/)
    expect(f.stages.find((x) => x.id === 'clasificacion').items[0].text).toMatch(/no se clasifica/)
  })

  it('cada perfil ve su parte del flujo', () => {
    expect(stagesForRole('reception_operator')).toEqual(['recepcion', 'clasificacion'])
    expect(stagesForRole('vaccination_auxiliary')).toEqual(['nacimiento'])
    expect(stagesForRole('coordinator')).toHaveLength(8)
  })
})
