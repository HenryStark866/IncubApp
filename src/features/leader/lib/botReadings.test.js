import { describe, expect, it } from 'vitest'
import { finalValues, machineMismatch, reviewFields } from './botReadings'

const reading = (over = {}) => ({
  machines: { type: 'setter', code: 'INC-18' },
  machine_checks: { temp_ovoscan: 100, temp_air: 98.5, humidity: null, co2: 0.24, turn_count: 336 },
  valores: { temp_ovoscan: 100, temp_air: 97.8, co2: 0.25, turn_count: 386 },
  discrepancias: [
    { campo: 'temp_air', tipo: 'turnero_vs_foto', turnero: 98.5, foto: 97.8 },
    { campo: 'humidity', tipo: 'lecturas_distintas', lectura_a: 76.9, lectura_b: 79.6 },
  ],
  ...over,
})

describe('revisión de lecturas del bot', () => {
  it('compara turnero y foto campo por campo', () => {
    const f = Object.fromEntries(reviewFields(reading()).map((x) => [x.key, x]))
    expect(Object.keys(f)).toEqual(['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count'])
    expect(f.temp_air).toMatchObject({ operator: 98.5, photo: 97.8, flagged: true, initial: 98.5 })
    expect(f.humidity).toMatchObject({ operator: null, photo: null, photoText: '76.9 / 79.6', initial: null })
    expect(f.co2.flagged).toBe(false)
  })

  it('en nacedoras solo muestra aire, humedad y CO₂', () => {
    const keys = reviewFields(reading({ machines: { type: 'hatcher' } })).map((x) => x.key)
    expect(keys).toEqual(['temp_air', 'humidity', 'co2'])
  })

  it('solo manda lo que el líder cambió', () => {
    const fields = reviewFields(reading())
    expect(finalValues(fields, {}).valores).toEqual({})
    expect(finalValues(fields, { temp_air: '97,8', humidity: '76.9' }).valores).toEqual({ temp_air: 97.8, humidity: 76.9 })
    expect(finalValues(fields, { co2: '' }).valores).toEqual({ co2: null })
    expect(finalValues(fields, { turn_count: 'abc' }).error).toMatch(/Volteo/)
  })

  it('avisa si la foto es de otra máquina', () => {
    const r = reading({ discrepancias: [{ tipo: 'maquina_distinta', esperada: 'INC-18', en_pantalla: 19 }] })
    expect(machineMismatch(r)).toMatch(/máquina 19.*INC-18/)
    expect(machineMismatch(reading())).toBeNull()
  })
})
