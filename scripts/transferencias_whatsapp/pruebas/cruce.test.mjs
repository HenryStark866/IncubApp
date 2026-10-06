/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/pruebas/cruce.test.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * ES: Pruebas del cruce de transferencias del WhatsApp. EN: Tests for the WhatsApp transfer cross-check.
 */
import { describe, expect, it } from 'vitest'
import { expandirLotesNacedora } from '../funciones/expandirLotesNacedora.mjs'
import { nacedorasDelSalon } from '../funciones/nacedorasDelSalon.mjs'
import { normalizarTransferencia } from '../funciones/normalizarTransferencia.mjs'
import { compararLotes } from '../funciones/compararLotes.mjs'
import { cruzarConMapas } from '../funciones/cruzarConMapas.mjs'
import { ajustarHoraPorRecargue } from '../funciones/ajustarHoraPorRecargue.mjs'
import { validarRitmoIncubadoras } from '../funciones/validarRitmoIncubadoras.mjs'
import { transferenciasReportadas } from '../datos/transferencias_reportadas.mjs'

describe('lectura del chat / chat parsing', () => {
  it('ES: lotes y carros / EN: lots and carts', () => {
    expect(expandirLotesNacedora('44x3, 43x1')).toEqual([{ lote: '44', carros: 3 }, { lote: '43', carros: 1 }])
    expect(() => expandirLotesNacedora('LT44')).toThrow()
  })
  it('ES: nacedoras por salón / EN: hatchers per room', () => {
    expect(nacedorasDelSalon(3)).toEqual([7, 8, 9])
    expect(() => nacedorasDelSalon(5)).toThrow()
  })
  it('ES: respeta el orden del mensaje / EN: keeps the message order', () => {
    const t = normalizarTransferencia({ reportado: '2026-08-11T12:20', inc: 2, salon: 1, nac: { 3: '42', 2: '46,42', 1: '46,42' }, texto: 'Lote 42 a nacedora 3 Lote 46 y 42 a nacedora 2 Lote 46 y 42 a nacedora 1' })
    expect(t.nacedoras.map((n) => n.codigo)).toEqual(['NAC-03', 'NAC-02', 'NAC-01'])
    expect(t.loteEtiqueta).toBe('42 + 46')
    expect(t.transferidoEn).toBe('2026-08-11T12:20:00-05:00')
  })
  it('ES: todo el dataset es válido y sin claves repetidas / EN: whole dataset valid, unique keys', () => {
    const todas = transferenciasReportadas.map(normalizarTransferencia)
    expect(new Set(todas.map((t) => t.clave)).size).toBe(todas.length)
  })
  it('ES: con las correcciones no queda ningún intervalo imposible / EN: no impossible interval after fixes', () => {
    const todas = transferenciasReportadas.map(normalizarTransferencia)
    expect(validarRitmoIncubadoras(todas).filter((h) => h.problema === 'imposible')).toEqual([])
  })
})

describe('cruce con mapas / map cross-check', () => {
  const mapa = (codigo, inicio, lotes, cargado = inicio) => ({ id: `m-${codigo}-${inicio}`, codigo, inicioCiclo: inicio, cargadoEn: cargado, lotes, descartado: false })
  it('ES: comparación de lotes / EN: lot comparison', () => {
    expect(compararLotes(['43'], ['43', '44']).estado).toBe('coincide')
    expect(compararLotes(['46', '43'], ['43', '44']).estado).toBe('parcial')
    expect(compararLotes(['47'], ['44', '45']).estado).toBe('no_coincide')
  })
  it('ES: detecta incubadoras cruzadas del mismo día / EN: detects same-day swapped setters', () => {
    const mapas = [mapa('INC-24', '2026-09-08T03:00:00Z', ['47']), mapa('INC-10', '2026-09-08T03:05:00Z', ['44', '45'])]
    const [c] = cruzarConMapas([{ clave: 'x', incubadora: 'INC-24', transferidoEn: '2026-09-27T11:11:00Z', lotes: ['44', '45'] }], mapas)
    expect(c.estado).toBe('no_coincide')
    expect(c.candidatos.map((x) => x.incubadora)).toEqual(['INC-10'])
  })
  it('ES: recargue antes del reporte → hora ajustada / EN: reload before report → adjusted time', () => {
    const mapas = [mapa('INC-01', '2026-09-03T03:00:00Z', ['44']), mapa('INC-08', '2026-09-18T03:00:00Z', ['45'], '2026-09-17T20:06:00Z')]
    const t = { clave: 'y', incubadora: 'INC-08', transferidoEn: '2026-09-19T07:44:00-05:00', lotes: ['43'] }
    const [c] = cruzarConMapas([t], mapas)
    expect(c.estado).toBe('recargada_antes_del_reporte')
    expect(ajustarHoraPorRecargue(t, c).transferidoEn).toBe('2026-09-17T19:06:00.000Z')
  })
})
