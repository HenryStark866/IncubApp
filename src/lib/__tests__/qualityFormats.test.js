import { describe, expect, it } from 'vitest'
import { formatoPorId, listaNumeros, estadisticaPesos } from '../qualityFormats'

describe('formatos de calidad', () => {
  it('lee listas de pesos con coma decimal y separadores', () => {
    expect(listaNumeros('62, 58.5 61; 60,5')).toEqual([62, 58.5, 61, 60.5])
    expect(estadisticaPesos([60, 60, 60, 66])).toMatchObject({ promedio: 61.5, uniformidad: 100 })
  })
  it('peso del huevo: promedio y alerta fuera de rango', () => {
    const f = formatoPorId('egg_weight')
    expect(f.calcular({ pesos: '62 60 61 63' })).toMatchObject({ muestra: 4, status: 'ok' })
    expect(f.calcular({ cantidad: '30', pesoTotal: '1350' })).toMatchObject({ results: { promedio: 45 }, status: 'alert' })
    expect(f.calcular({}).error).toBeTruthy()
  })
  it('pérdida de humedad proyectada al día 18', () => {
    const r = formatoPorId('moisture_loss').calcular({ bandejaVacia: '500', pesoCargue: '9500', pesoActual: '8420', dia: '18' })
    expect(r.results.perdidaDia18).toBe(12)
    expect(r.status).toBe('ok')
    expect(formatoPorId('moisture_loss').calcular({ pesoCargue: '100', pesoActual: '120' }).error).toBeTruthy()
  })
  it('ovoscopia: fertilidad y mortalidad temprana', () => {
    const r = formatoPorId('candling').calcular({ revisados: '1000', claros: '120', muertos: '30', contaminados: '4' })
    expect(r.results).toMatchObject({ fertilidad: 88, mortalidadTemprana: 3, contaminados: 0.4 })
    expect(r.status).toBe('watch')
  })
  it('embriodiagnóstico: distribución y mayor causa', () => {
    const r = formatoPorId('breakout').calcular({ cargados: '5000', infertiles: '200', temprana: '80', tardia: '60', contaminados: '10' })
    expect(r.results).toMatchObject({ analizados: 350, infertilesPct: 57.1, contaminadosDeCargados: 0.2 })
    expect(r.resumen).toMatch(/infértiles/)
  })
  it('calidad del pollito: peso y % de segunda', () => {
    const r = formatoPorId('chick_quality').calcular({ pesos: '41 40 42 39', nacidos: '1000', ombligo: '15', patas: '10' })
    expect(r.results).toMatchObject({ promedio: 40.5, segunda: 25, segundaPct: 2.5 })
    expect(r.status).toBe('alert')
  })
})
