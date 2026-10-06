/**
 * ARCHIVO / FILE: src/lib/__tests__/tipoHuevo.test.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * ES: Pruebas del significado del tipo de huevo. EN: Tests for the egg-type meaning.
 */
import { describe, expect, it } from 'vitest'
import { etiquetaTipoHuevo, tamanoRelativoPorTipo } from '../tipoHuevo'

describe('tipoHuevo', () => {
  it('ES: etiquetas por edad / EN: age labels', () => {
    expect(etiquetaTipoHuevo(1)).toBe('Tipo 1 · viejo')
    expect(etiquetaTipoHuevo(5)).toBe('Tipo 5 · muy joven')
    expect(etiquetaTipoHuevo(null)).toBe('Sin tipo')
  })
  it('ES: tamaño invertido (1 = más grande) / EN: inverted size (1 = largest)', () => {
    expect(tamanoRelativoPorTipo(1)).toBe(1)
    expect(tamanoRelativoPorTipo(3)).toBe(0.5)
    expect(tamanoRelativoPorTipo(5)).toBe(0)
    expect(tamanoRelativoPorTipo(7)).toBeNull()
  })
})
