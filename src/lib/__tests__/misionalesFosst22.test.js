/**
 * ARCHIVO / FILE: src/lib/__tests__/misionalesFosst22.test.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * ES: Pruebas del formato FOSST22 y su PDF. EN: Tests for the FOSST22 form and its PDF.
 */
import { describe, expect, it } from 'vitest'
import { agruparAspectos } from '../misionales/agruparAspectos'
import { generarPdfPreoperacional, fechaCorta } from '../misionales/generarPdfPreoperacional'
import { nombreArchivoPreoperacional } from '../misionales/descargarPdfPreoperacional'
import { aspectosForTipo, valoresForTipo } from '../misionalesCatalog'

const lista = aspectosForTipo('Carro')
const aspects = Object.fromEntries(lista.map((l, i) => [String(i + 1), { valor: i === 4 ? 'M' : 'B', label: l, ...(i === 4 ? { obs: 'Fuga', accion: '08/10/2026' } : {}) }]))
const fila = {
  id: 'mi_1', inspected_at: '2026-10-06T19:10:00Z', plate: 'ABC123', vehicle_type: 'Carro', driver_name: 'Prueba',
  license_exp: '2027-05-30', compliance_pct: 98, optimal: true, aspects,
  formato: { cedula: '123', soat_vence: '2027-01-15', mantenimiento: { aceite: '2026-09-20' } },
}

describe('FOSST22', () => {
  it('ES: agrupa como el formato / EN: groups like the form', () => {
    const f = agruparAspectos(aspects, lista)
    expect(f[0].criterio).toMatch(/^1\. ESTADO DE LLANTAS/)
    expect(f[0].sub).toMatch(/Delanteras/)
    expect(f[4]).toMatchObject({ valor: 'M', obs: 'Fuga', accion: '08/10/2026' })
  })
  it('ES: camión con B / M / N/A como el formato / EN: truck grades like the form', () => {
    expect(valoresForTipo('Camion')).toEqual(['B', 'M', 'N/A'])
  })
  it('ES: el PDF lleva encabezado, placa y fechas / EN: PDF has header, plate and dates', () => {
    const doc = generarPdfPreoperacional(fila, { orgName: 'Incubant' })
    const texto = doc.output()
    expect(texto).toContain('FOSST22')
    expect(texto).toContain('LISTA PREOPERACIONAL VEH')
    expect(texto).toContain('ABC123')
    expect(texto).toContain('15/01/2027')
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })
  it('ES: moto también genera PDF / EN: motorcycle PDF works too', () => {
    const doc = generarPdfPreoperacional({ ...fila, vehicle_type: 'Moto', aspects: { 1: { valor: 'B' } } })
    expect(doc.output()).toContain('Estado de llantas')
  })
  it('ES: nombre de archivo y fechas / EN: file name and dates', () => {
    expect(nombreArchivoPreoperacional(fila)).toBe('FOSST22_ABC123_2026-10-06.pdf')
    expect(fechaCorta('2027-05-30')).toBe('30/05/2027')
  })
})
