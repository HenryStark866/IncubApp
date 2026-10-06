/**
 * Misionales igual a la ventana original (repo_misionales): listas, reglas de
 * validación, registro y PDF. 06-10-2026.
 */
import { describe, expect, it } from 'vitest'
import {
  aspectosForTipo,
  valoresForTipo,
  valoresParaItem,
  aspectosIniciales,
  calcularPorcentaje,
  validarInspeccion,
  avisoVencimiento,
  documentoNoConforme,
  leyendaValores,
} from '../misionalesCatalog'
import { formularioVacio, aRegistro, esFormatoMisional, ubicacionDe } from '../misionales/registro'
import { generarPdfMisional, generarPdfConsolidado } from '../misionales/generarPdfMisional'
import { nombreArchivoPreoperacional } from '../misionales/descargarPdfPreoperacional'

const HOY = new Date(2026, 9, 6)
const FIRMA = 'data:image/png;base64,' + 'A'.repeat(200)

function formMoto(extra = {}) {
  return {
    ...formularioVacio('Moto'),
    placa: 'gsz34f',
    proceso: 'Traslado',
    desde: 'La Planta',
    hasta: 'La Fe',
    marca: 'Yamaha',
    gasolina: 'Lleno',
    linea: 'YBR',
    porte_propiedad: 'Vigente',
    soat: 'Vigente',
    certificado_emision: 'Vigente',
    ...extra,
  }
}

describe('Listas iguales al original', () => {
  it('moto 20, automóvil 24 y camión 102 aspectos', () => {
    expect(aspectosForTipo('Moto')).toHaveLength(20)
    expect(aspectosForTipo('Carro')).toHaveLength(24)
    expect(aspectosForTipo('Camion')).toHaveLength(102)
    expect(aspectosForTipo('Moto')[18]).toMatch(/^Casco/)
  })
  it('valores por tipo y N/A puntual de la moto (5 y 13)', () => {
    expect(valoresForTipo('Camion')).toEqual(['B', 'R', 'M', 'N/A'])
    expect(valoresParaItem('Moto', 5)).toEqual(['B', 'M', 'N/A'])
    expect(valoresParaItem('Moto', 6)).toEqual(['B', 'M'])
    expect(leyendaValores('Moto')).toBe('B = Bien · M = Mal · N/A = No aplica')
  })
  it('arranca todo en B y el % cuenta R=50, M=0, N/A fuera', () => {
    const a = aspectosIniciales('Camion')
    expect(calcularPorcentaje(a)).toBe(100)
    a['1'] = { valor: 'R' }
    a['2'] = { valor: 'M' }
    a['3'] = { valor: 'N/A' }
    expect(calcularPorcentaje(a)).toBe(Math.round((100 * 99.5) / 101))
  })
})

describe('Validación como la ventana', () => {
  const base = { aspectos: aspectosIniciales('Moto'), evidencias: {}, firma: FIRMA, gps: {} }
  it('una moto completa pasa', () => {
    expect(validarInspeccion({ ...formMoto(), ...base, tipo: 'Moto' }, HOY)).toEqual({})
  })
  it('pide campos obligatorios y firma', () => {
    const e = validarInspeccion({ ...formularioVacio('Moto'), ...base, firma: null }, HOY)
    expect(e).toMatchObject({ placa: 'Inválida', proceso: 'Requerido', firma: 'Debes firmar' })
  })
  it('M exige foto y 60 caracteres; R 40', () => {
    const aspectos = { ...aspectosIniciales('Moto'), 2: { valor: 'M' } }
    const e = validarInspeccion({ ...formMoto(), ...base, aspectos, observaciones: 'corto' }, HOY)
    expect(e._global).toMatch(/foto/)
    expect(e.observaciones).toMatch(/60/)
    const ok = validarInspeccion(
      { ...formMoto(), ...base, aspectos, evidencias: { 2: 'data:x' }, observaciones: 'x'.repeat(60) },
      HOY
    )
    expect(ok).toEqual({})
  })
  it('camión: despacho, GPS, vencimientos y documento no conforme', () => {
    const f = { ...formMoto({ tipo: 'Camion', soat: 'Vencido' }), tipo: 'Camion' }
    const e = validarInspeccion({ ...f, aspectos: aspectosIniciales('Camion'), firma: FIRMA, gps: {} }, HOY)
    expect(e).toMatchObject({ kilometraje: 'Solo números', gps: 'GPS obligatorio', tipo_carga: 'Seleccione un tipo de carga' })
    expect(e.soat_venc).toMatch(/SOAT/)
    expect(documentoNoConforme(f, HOY)).toBe(true)
    expect(e.observaciones).toMatch(/40/)
  })
  it('avisa vencimientos a 4 días', () => {
    expect(avisoVencimiento('2026-10-08', HOY)).toEqual({ texto: 'Alerta: vence en 2 día(s)', nivel: 'alerta' })
    expect(avisoVencimiento('2026-10-01', HOY).nivel).toBe('vencido')
    expect(avisoVencimiento('2026-12-01', HOY)).toBeNull()
  })
})

describe('Registro y PDF', () => {
  const aspectos = { ...aspectosIniciales('Camion'), 3: { valor: 'M', label: aspectosForTipo('Camion')[2] } }
  const f = {
    ...formMoto({ tipo: 'Camion' }),
    tipo: 'Camion',
    kilometraje: '45.230',
    numero_interno: 'C-7',
    ciudad: 'Medellín',
    empresa: 'Incubant',
    ubicacion_selector: 'COPIAR_ORIGEN',
    tipo_carga: 'OTRO',
    tipo_carga_otro: 'Bandejas',
    soat_venc: '2027-01-15',
  }
  const reg = aRegistro(f, { aspectos, firma: FIRMA, gps: { lat: 6.2, lng: -75.5, accuracy: 8 }, conductor: 'Ana' })
  it('arma la fila con el formato v2', () => {
    expect(ubicacionDe(f)).toBe('La Planta')
    expect(reg).toMatchObject({ plate: 'GSZ34F', vehicle_type: 'Camion', odometer: '45230', optimal: false, lat: 6.2 })
    expect(reg.formato).toMatchObject({ version: 'misional-v2', ubicacion: 'La Planta', tipo_carga_otro: 'Bandejas' })
    expect(esFormatoMisional(reg)).toBe(true)
  })
  it('genera el PDF de una inspección y el consolidado', () => {
    const row = { ...reg, id: 'x', aspects: aspectos, inspected_at: '2026-10-06T15:00:00Z', compliance_pct: 99 }
    const doc = generarPdfMisional(row)
    const txt = doc.output()
    expect(txt).toContain('FO-SST-063')
    expect(txt).toContain('GSZ34F')
    expect(nombreArchivoPreoperacional(row)).toBe('FO-SST-063_GSZ34F_2026-10-06.pdf')
    const filas = Array.from({ length: 15 }, (_, i) => ({ ...row, id: `r${i}`, inspected_at: `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00Z` }))
    const cons = generarPdfConsolidado(filas).output()
    expect(cons).toContain('15/15')
  })
})
