import { describe, expect, it } from 'vitest'
import { parseQty, parseRemisionOcrText } from '../remisionOcr'

describe('remisión huevos galpón · lectura de la foto', () => {
  it('lee la cantidad completa y las cajas de cada galpón', () => {
    const r = parseRemisionOcrText('201 2240 6\n202  2.340  6\n406 1440')
    expect(r.rows.map((x) => [x.galpon, x.incubable, x.cajas])).toEqual([
      ['201', 2240, 6],
      ['202', 2340, 6],
      ['406', 1440, ''],
    ])
  })

  it('toma el número de remisión y las fechas, y descarta fechas imposibles', () => {
    const r = parseRemisionOcrText('Remisión Huevos Galpón Nº 4854\nFecha Producción 08/10/2026\nFecha Remisión 45/13/2026')
    expect(r.remisionNo).toBe('4854')
    expect(r.fechaProd).toBe('2026-10-08')
    expect(r.fechaRemision).not.toBe('2026-13-45')
  })

  it('no confunde un año con un galpón', () => {
    const r = parseRemisionOcrText('2026 1500 4')
    expect(r.rows).toEqual([])
  })

  it('convierte cantidades escritas con punto de miles', () => {
    expect(parseQty('2.240')).toBe(2240)
    expect(parseQty('30,720')).toBe(30720)
    expect(parseQty(' 12 ')).toBe(12)
    expect(parseQty('')).toBe('')
    expect(parseQty('12030 ✓')).toBe('')
  })
})
