/**
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/controlDiario.test.js
 * PROPÓSITO: Fija las reglas del FORMATO CONTROL DIARIO que se llena solo con
 *   las rondas: qué lecturas pide cada tipo de máquina, cómo se normaliza lo que
 *   digita el turnero y con qué fecha entra al formato la ronda de madrugada.
 *   Si esto se rompe, el formato queda con datos corridos de día o con lecturas
 *   que no llegan a machine_checks.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import {
  hasAnyReading,
  hasReadingFields,
  readingFieldsFor,
  readingsFromCheck,
  readingsPayload,
} from '../machineReadings'
import { construirCiclos, fechaLocalDeToma } from '../controlDiarioFormat'

describe('lecturas que pide el formato', () => {
  it('la incubadora pide las once columnas del formato de papel', () => {
    const keys = readingFieldsFor('setter').map((c) => c.key)
    expect(keys).toEqual([
      'temp_ovoscan',
      'temp_air',
      'humidity',
      'co2',
      'turn_count',
      'turn_position',
    ])
  })

  it('la nacedora no pide ovoscan ni volteo: su formato no los tiene', () => {
    expect(readingFieldsFor('hatcher').map((c) => c.key)).toEqual([
      'temp_air',
      'humidity',
      'co2',
    ])
  })

  it('chillers y compresores no tienen formato de control diario', () => {
    expect(hasReadingFields('chiller')).toBe(false)
    expect(hasReadingFields('compressor')).toBe(false)
    expect(hasReadingFields('setter')).toBe(true)
    expect(hasReadingFields('hatcher')).toBe(true)
  })
})

describe('lo que digita el turnero', () => {
  it('lo vacío entra como null, nunca como cadena', () => {
    expect(readingsPayload({})).toEqual({
      temp_ovoscan: null,
      temp_air: null,
      humidity: null,
      co2: null,
      turn_count: null,
      turn_position: null,
    })
    expect(readingsPayload(undefined).temp_air).toBeNull()
  })

  it('acepta coma decimal, que es como se digita en el teclado del celular', () => {
    expect(readingsPayload({ temp_air: '99,8' }).temp_air).toBe(99.8)
    expect(readingsPayload({ co2: '0,55' }).co2).toBe(0.55)
  })

  it('el volteo es entero y la posición se recorta', () => {
    expect(readingsPayload({ turn_count: '30.7' }).turn_count).toBe(31)
    expect(readingsPayload({ turn_position: '  60/60  ' }).turn_position).toBe('60/60')
  })

  it('un texto que no es número no ensucia el registro', () => {
    expect(readingsPayload({ humidity: '--' }).humidity).toBeNull()
  })

  it('distingue una ronda con lecturas de una ronda solo con foto', () => {
    expect(hasAnyReading({})).toBe(false)
    expect(hasAnyReading({ temp_air: '' })).toBe(false)
    expect(hasAnyReading({ temp_air: '99.9' })).toBe(true)
  })

  it('prellena con la última toma de esa máquina', () => {
    const prev = { temp_air: 99.9, humidity: 77.6, co2: null, condition: 'normal' }
    expect(readingsFromCheck(prev)).toEqual({ temp_air: '99.9', humidity: '77.6' })
    expect(readingsFromCheck(null)).toEqual({})
  })
})

describe('la ronda de madrugada va con su fecha real', () => {
  /**
   * El turno 3 va de 22:00 a 05:59 y la app lo rotula con la fecha en que
   * arranca. En el formato la fecha tiene que ser la del reloj, o el día de
   * incubación queda corrido un día.
   */
  // Se construye la hora en la zona de la planta, no en UTC, para que la prueba
  // diga lo mismo corra donde corra.
  const enPlanta = (y, mes, d, h, min) => new Date(y, mes - 1, d, h, min).toISOString()

  it('una toma de las 00:08 pertenece al día siguiente al del turno', () => {
    const toma = { shift_date: '2026-09-02', shift_number: 3, taken_at: enPlanta(2026, 9, 3, 0, 8) }
    expect(fechaLocalDeToma(toma)).toBe('2026-09-03')
    expect(fechaLocalDeToma(toma)).not.toBe(toma.shift_date)
  })

  it('una toma de las 22:30 sigue siendo del mismo día del turno', () => {
    const toma = { shift_date: '2026-09-02', shift_number: 3, taken_at: enPlanta(2026, 9, 2, 22, 30) }
    expect(fechaLocalDeToma(toma)).toBe('2026-09-02')
  })
})

describe('un registro por cargue', () => {
  const cargue = (machine_id, y, mes, d, lote) => ({
    machine_id,
    lote,
    loaded_at: new Date(y, mes - 1, d, 14, 0).toISOString(),
  })

  it('junta en un solo ciclo las varias filas de lote del mismo cargue', () => {
    const ciclos = construirCiclos(
      [
        cargue('inc5', 2026, 8, 23, '45'),
        cargue('inc5', 2026, 8, 23, 'TRATADO'),
        cargue('inc5', 2026, 8, 23, '42'),
      ],
      '2026-09-15'
    )
    expect(ciclos).toHaveLength(1)
    expect(ciclos[0].lotes).toBe('42, 45, TRATADO')
  })

  it('el ciclo llega al día 18 y el nacimiento al 21', () => {
    const [c] = construirCiclos([cargue('inc5', 2026, 8, 23, '45')], '2026-09-15')
    expect(c.cargue).toBe('2026-08-23')
    expect(c.fin).toBe('2026-09-10')        // 23-08 + 18
    expect(c.nacimiento).toBe('2026-09-13') // 23-08 + 21
  })

  it('si la máquina se recarga antes, el ciclo se corta el día anterior', () => {
    const ciclos = construirCiclos(
      [cargue('inc1', 2026, 7, 7, '46'), cargue('inc1', 2026, 7, 15, '44')],
      '2026-09-15'
    )
    const primero = ciclos.find((c) => c.cargue === '2026-07-07')
    expect(primero.fin).toBe('2026-07-14')
  })

  it('marca abierto solo el ciclo que todavía no termina', () => {
    const ciclos = construirCiclos(
      [cargue('inc5', 2026, 8, 23, '45'), cargue('inc5', 2026, 9, 14, '43')],
      '2026-09-15'
    )
    expect(ciclos.find((c) => c.cargue === '2026-09-14').abierto).toBe(true)
    expect(ciclos.find((c) => c.cargue === '2026-08-23').abierto).toBe(false)
  })

  it('no mezcla máquinas: cada cargue queda con la suya', () => {
    const ciclos = construirCiclos(
      [cargue('inc5', 2026, 8, 23, '45'), cargue('inc7', 2026, 8, 23, '46')],
      '2026-09-15'
    )
    expect(ciclos).toHaveLength(2)
    expect(new Set(ciclos.map((c) => c.machineId))).toEqual(new Set(['inc5', 'inc7']))
    expect(ciclos.find((c) => c.machineId === 'inc5').lotes).toBe('45')
  })
})
