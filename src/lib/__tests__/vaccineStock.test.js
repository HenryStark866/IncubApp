import { describe, expect, it } from 'vitest'
import { stockByProduct, loteSugerido, consumoPorLote, pendientesVacunacion } from '../vaccineStock'
import { formatoPorId, formatosDe } from '../qualityFormats'

const now = new Date(2026, 9, 7, 10)
const products = [{ id: 'p1', name: 'Marek HVT', doses_per_vial: 2000, min_doses: 10000, active: true }]
const movements = [
  { product_id: 'p1', kind: 'in', doses: 20000, manufacturer_lot: 'A1', expires_on: '2026-10-15', moved_at: '2026-10-01T10:00:00' },
  { product_id: 'p1', kind: 'in', doses: 10000, manufacturer_lot: 'B2', expires_on: '2027-03-01', moved_at: '2026-10-02T10:00:00' },
  { product_id: 'p1', kind: 'use', doses: 16000, vials: 8, manufacturer_lot: 'A1', lote: '47', chicks: 15800, moved_at: '2026-10-06T08:00:00' },
  { product_id: 'p1', kind: 'discard', doses: 500, manufacturer_lot: 'A1', moved_at: '2026-10-06T09:00:00' },
]

describe('inventario de vacunas', () => {
  it('saldo por vacuna y por lote del fabricante, con alertas', () => {
    const [s] = stockByProduct({ products, movements, now })
    expect(s.doses).toBe(13500)
    expect(s.lots.map((l) => [l.lot, l.doses])).toEqual([
      ['A1', 3500],
      ['B2', 10000],
    ])
    expect(s.alerts.map((a) => a.text).join(' ')).toMatch(/Lote A1 vence en 8/)
    expect(loteSugerido(s)).toBe('A1')
  })
  it('stock bajo y consumo por lote de pollito', () => {
    const [s] = stockByProduct({ products, movements: [...movements, { product_id: 'p1', kind: 'use', doses: 5000, manufacturer_lot: 'B2', lote: '48', moved_at: '2026-10-07T08:00:00' }], now })
    expect(s.alerts.some((a) => /Stock bajo/.test(a.text))).toBe(true)
    const c = consumoPorLote({ movements, products })
    expect(c[0]).toMatchObject({ lote: '47', doses: 16000, chicks: 15800, dosisPorPollito: 1.01 })
    // Dos vacunas al mismo lote: los pollitos no se suman
    const dos = consumoPorLote({
      products: [...products, { id: 'p2', name: 'Gumboro' }],
      movements: [...movements, { product_id: 'p2', kind: 'use', doses: 16000, lote: '47', chicks: 15800, moved_at: '2026-10-06T08:10:00' }],
    })
    expect(dos[0]).toMatchObject({ lote: '47', doses: 32000, chicks: 15800, dosisPorPollito: 1.01, vacunas: ['Marek HVT', 'Gumboro'] })
  })
  it('formatos del auxiliar de vacunación como en papel', () => {
    expect(formatosDe('vacunacion').map((f) => f.id)).toEqual(['nitrogen_fridge', 'sexing_count', 'navel_quality'])
    const pr = formatoPorId('nitrogen_fridge').calcular({ tempNevera: '2,3', tanque1: '36', tanque2: '41', relleno1: 'si' })
    expect(pr.status).toBe('ok')
    expect(pr.resumen).toMatch(/relleno tanque 1/)
    expect(formatoPorId('sexing_count').calcular({ sexajeMac: '7', sexajeHem: '3', conteoMac: '0', conteoHem: '1' }).resumen).toBe('Sexaje: 7 M / 3 H · Conteo: 0 M / 1 H')
    const o = formatoPorId('navel_quality').calcular({ nII: '31', nIII: '2', abdomen: '1', actividad: '1' })
    expect(o.results).toMatchObject({ nI: 67, nIIIPct: 2, abdomen: 1 })
  })
})

describe('pendientesVacunacion', () => {
  const now = new Date('2026-10-07T15:00:00Z')
  it('marca el PR06-1 del día y los lotes nacidos sin formatos', () => {
    const r = pendientesVacunacion({
      now,
      formats: [
        { kind: 'nitrogen_fridge', sampled_at: '2026-10-07T12:00:00Z' },
        { kind: 'sexing_count', lote: '45', sampled_at: '2026-10-06T12:00:00Z' },
      ],
      hatches: [
        { lote: '45 + 47', ended_at: '2026-10-06T10:00:00Z', actual_chicks: 30000 },
        { lote: '50', scheduled_at: '2026-10-09T10:00:00Z' },
      ],
    })
    expect(r.nitrogenoHoy).toBeTruthy()
    expect(r.lotes.map((l) => l.lote).sort()).toEqual(['45', '47'])
    const l45 = r.lotes.find((l) => l.lote === '45')
    expect(l45.sexaje).toBe(true)
    expect(l45.ombligo).toBe(false)
  })
  it('sin control de hoy devuelve null', () => {
    const r = pendientesVacunacion({ now, formats: [{ kind: 'nitrogen_fridge', sampled_at: '2026-10-06T12:00:00Z' }] })
    expect(r.nitrogenoHoy).toBeNull()
  })
})
