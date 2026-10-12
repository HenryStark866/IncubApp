import { describe, expect, it } from 'vitest'
import { cycleSchedule, isHatchDay, nextHatchDay, roomsLoadStatus } from '../hatchSchedule'

describe('rotación de la planta', () => {
  it('días de nacimiento: lunes, martes, jueves y viernes', () => {
    expect(['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16'].every(isHatchDay)).toBe(true)
    expect(['2026-10-14', '2026-10-17', '2026-10-18'].some(isHatchDay)).toBe(false)
    expect(nextHatchDay('2026-10-14')).toBe('2026-10-15')
    expect(nextHatchDay('2026-10-17')).toBe('2026-10-19')
  })

  it('cargue del domingo en la noche → transfiere el día 18 y nace el lunes de tres semanas después', () => {
    const s = cycleSchedule('2026-09-20T22:00:00-05:00')
    expect(s.transferAt.slice(0, 10)).toBe('2026-10-09')
    expect(s.hatchDate).toBe('2026-10-12')
    expect(s.onSchedule).toBe(true)
  })

  it('cargue del lunes en la noche nace el martes; uno fuera de rotación pasa al siguiente día de nacimiento', () => {
    expect(cycleSchedule('2026-09-21T22:00:00-05:00').hatchDate).toBe('2026-10-13')
    const fuera = cycleSchedule('2026-09-22T22:00:00-05:00')
    expect(fuera.expectedDate).toBe('2026-10-14')
    expect(fuera.hatchDate).toBe('2026-10-15')
    expect(fuera.onSchedule).toBe(false)
  })

  it('lo normal son dos salas por día de nacimiento', () => {
    expect(roomsLoadStatus(2)).toBe('normal')
    expect(roomsLoadStatus(1)).toBe('una')
    expect(roomsLoadStatus(3)).toBe('revisar')
  })
})
