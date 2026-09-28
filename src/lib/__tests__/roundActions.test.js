import { describe, it, expect } from 'vitest'
import { roundFinishSummary, minutesLeftInHour } from '../roundActions'
import { readingDelta } from '../../components/MachineCalibrationPanel'

describe('resumen antes de terminar la ronda', () => {
  const plantMachines = [
    { id: 'a', code: 'INC-01' }, { id: 'b', code: 'INC-19' }, { id: 'c', code: 'NAC-04' },
    { id: 'd', code: 'NAC-06' }, { id: 'e', code: 'CH-02' },
  ]
  it('cuenta fotos, apagadas, novedades (falla primero) y lo que quedará apagado', () => {
    const s = roundFinishSummary({
      plantMachines,
      checksNow: [
        { machine_id: 'a', condition: 'normal', taken_by: 'u1' },
        { machine_id: 'c', condition: 'warning', notes: 'humedad baja', taken_by: 'u2' },
        { machine_id: 'b', condition: 'fault', notes: 'volteo', taken_by: 'u1' },
        { machine_id: 'e', condition: 'off', taken_by: 'u1' },
      ],
    })
    expect(s.total).toBe(5)
    expect(s.withPhoto).toBe(3)
    expect(s.off).toBe(1)
    expect(s.issues.map((i) => i.code)).toEqual(['INC-19', 'NAC-04'])
    expect(s.pending.map((p) => p.code)).toEqual(['NAC-06'])
    expect(s.people).toBe(2)
  })

  it('minutos que quedan de la hora', () => {
    expect(minutesLeftInHour(new Date('2026-09-28T15:22:00'))).toBe(38)
  })
})

describe('calibración: diferencia máquina − patrón en vivo', () => {
  it('redondea a una décima con signo y acepta coma decimal', () => {
    expect(readingDelta('99.5', '99.8')).toBe('−0.3')
    expect(readingDelta('55', '54')).toBe('+1.0')
    expect(readingDelta('99,7', '99.7')).toBe('0.0')
    expect(readingDelta('', '99')).toBeNull()
  })
})
