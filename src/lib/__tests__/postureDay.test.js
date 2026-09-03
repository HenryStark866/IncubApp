/**
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/postureDay.test.js
 * PROPÓSITO: Prueba la regla de fechas del asistente de clasificación: el
 *   usuario solo dice el DÍA del mes y el huevo nunca es del futuro (día mayor
 *   que hoy → mes anterior). Si se rompe, la clasificación registraría fechas
 *   futuras o del mes equivocado y el mapa FIFO ordenaría mal los carros.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import { resolvePostureDay, normalizeEggType, normalizeLot, EGG_TYPES } from '../loadMapEngine'

// Caso del usuario: hoy es 12 de julio de 2026
const BASE = new Date(2026, 6, 12)

describe('resolvePostureDay (hoy 12 jul 2026)', () => {
  it('día menor o igual a hoy → este mes (10 → 10 jul)', () => {
    expect(resolvePostureDay(10, BASE)?.iso).toBe('2026-07-10')
    expect(resolvePostureDay(10, BASE)?.monthOffset).toBe(0)
  })
  it('el mismo día de hoy es válido (12 → 12 jul)', () => {
    expect(resolvePostureDay(12, BASE)?.iso).toBe('2026-07-12')
  })
  it('día mayor que hoy → mes anterior (20 → 20 jun)', () => {
    const r = resolvePostureDay(20, BASE)
    expect(r?.iso).toBe('2026-06-20')
    expect(r?.monthOffset).toBe(-1)
  })
  it('día 31 no existe en junio → null (no se puede elegir)', () => {
    expect(resolvePostureDay(31, BASE)).toBe(null)
  })
  it('nunca devuelve una fecha futura', () => {
    for (let d = 1; d <= 31; d++) {
      const r = resolvePostureDay(d, BASE)
      if (r) expect(r.iso <= '2026-07-12').toBe(true)
    }
  })
  it('borde de mes: hoy 5 mar 2026, día 30 → 30 de febrero no existe → null', () => {
    const marzo = new Date(2026, 2, 5)
    expect(resolvePostureDay(30, marzo)).toBe(null)
    expect(resolvePostureDay(28, marzo)?.iso).toBe('2026-02-28')
    expect(resolvePostureDay(3, marzo)?.iso).toBe('2026-03-03')
  })
  it('cruce de año: hoy 10 ene, día 25 → 25 de diciembre del año anterior', () => {
    const enero = new Date(2026, 0, 10)
    expect(resolvePostureDay(25, enero)?.iso).toBe('2025-12-25')
  })
  it('entradas inválidas → null', () => {
    expect(resolvePostureDay(0, BASE)).toBe(null)
    expect(resolvePostureDay(32, BASE)).toBe(null)
    expect(resolvePostureDay('x', BASE)).toBe(null)
  })
})

describe('tipo de huevo (1 a 5)', () => {
  it('el catálogo es 1..5', () => {
    expect(EGG_TYPES).toEqual([1, 2, 3, 4, 5])
  })
  it('normaliza valores válidos y descarta inválidos', () => {
    expect(normalizeEggType(3)).toBe(3)
    expect(normalizeEggType('5')).toBe(5)
    expect(normalizeEggType(0)).toBe(null)
    expect(normalizeEggType(6)).toBe(null)
    expect(normalizeEggType('')).toBe(null)
  })
  it('normalizeLot conserva el tipo de huevo en el segmento', () => {
    const l = normalizeLot({ lot: '41', trays: 8, productionDate: '2026-07-10', eggType: 4 })
    expect(l.eggType).toBe(4)
    expect(normalizeLot({ lot: '41', trays: 8 }).eggType).toBe(null)
  })
})
