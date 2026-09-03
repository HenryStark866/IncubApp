/**
 * =============================================================================
 * ARCHIVO: src/hooks/__tests__/incubationLots.test.js
 * PROPÓSITO: Prueba la matemática de conversión del módulo Datos:
 *   huevos → bandejas (÷336) → carros (÷16 bandejas = ÷5376). Si se rompe, la
 *   orden de clasificación y el mapa de cargue calcularían mal los carros.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import { sumEggs, lotTotals, EGGS_PER_CART } from '../useIncubationLots'
import { EGGS_PER_TRAY, TRAYS_PER_CART } from '../../lib/loadMapEngine'

describe('constantes de conversión', () => {
  it('mantiene la norma de la operación: 336 huevos/bandeja, 16 bandejas/carro', () => {
    expect(EGGS_PER_TRAY).toBe(336)
    expect(TRAYS_PER_CART).toBe(16)
    expect(EGGS_PER_CART).toBe(5376) // 336 × 16
  })
})

describe('sumEggs', () => {
  it('suma los huevos de todas las posturas', () => {
    expect(sumEggs([{ productionDate: '2026-07-01', eggs: 1000 }, { productionDate: '2026-07-02', eggs: 500 }])).toBe(1500)
  })
  it('trata valores faltantes como 0 y no rompe con undefined', () => {
    expect(sumEggs(undefined)).toBe(0)
    expect(sumEggs([{ eggs: null }, { eggs: '' }, { eggs: 200 }])).toBe(200)
  })
})

describe('lotTotals', () => {
  it('un carro lleno = 5376 huevos = 16 bandejas = 1 carro', () => {
    const t = lotTotals([{ productionDate: '2026-07-01', eggs: 5376 }])
    expect(t.eggs).toBe(5376)
    expect(t.trays).toBe(16)
    expect(t.carts).toBe(1)
    expect(t.fullCarts).toBe(1)
  })

  it('una bandeja = 336 huevos', () => {
    const t = lotTotals([{ eggs: 336 }])
    expect(t.trays).toBe(1)
  })

  it('redondea hacia arriba los carros físicos (un carro parcial ocupa un carro)', () => {
    // 5377 huevos → poco más de 1 carro → 2 carros físicos
    expect(lotTotals([{ eggs: 5377 }]).fullCarts).toBe(2)
    // 5376 exacto → 1 carro
    expect(lotTotals([{ eggs: 5376 }]).fullCarts).toBe(1)
  })

  it('agrega varias posturas del mismo lote', () => {
    const t = lotTotals([{ eggs: 5376 }, { eggs: 5376 }, { eggs: 5376 }])
    expect(t.eggs).toBe(16128)
    expect(t.carts).toBe(3)
    expect(t.fullCarts).toBe(3)
  })
})
