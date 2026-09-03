/**
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/geoMap.test.js
 * PROPÓSITO: Pruebas de la matemática geográfica del plano (GPS ⇄ plano).
 * Estas funciones posicionan personas y flota sobre los planos: si se rompen,
 * la gente aparece en el lugar equivocado. Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import { gpsToPlan, planToGps, gpsDeltaMeters } from '../geoMap'

// Origen de referencia: zona rural de Antioquia (aprox. La Fe)
const GEO = { originLat: 6.15, originLng: -75.62, rotationDeg: 0, scale: 1 }

describe('gpsDeltaMeters', () => {
  it('devuelve null sin coordenadas completas', () => {
    expect(gpsDeltaMeters(null, { lat: 1, lng: 1 })).toBeNull()
    expect(gpsDeltaMeters({ lat: 1, lng: 1 }, { lat: null, lng: 2 })).toBeNull()
  })

  it('mide ~111 km por grado de latitud', () => {
    const d = gpsDeltaMeters({ lat: 6, lng: -75 }, { lat: 7, lng: -75 })
    // Cualquier modelo terrestre razonable: 110–112 km por grado
    expect(d.north).toBeGreaterThan(110_000)
    expect(d.north).toBeLessThan(112_000)
    expect(Math.abs(d.east)).toBeLessThan(1)
  })
})

describe('gpsToPlan ⇄ planToGps (ida y vuelta)', () => {
  it('el origen GPS cae en el punto (0,0) del plano', () => {
    const p = gpsToPlan({ lat: GEO.originLat, lng: GEO.originLng }, GEO)
    expect(Math.abs(p.x)).toBeLessThan(0.01)
    expect(Math.abs(p.y)).toBeLessThan(0.01)
  })

  it('convertir a plano y volver a GPS conserva la posición (< 1 cm)', () => {
    const gps = { lat: 6.1512, lng: -75.6187 }
    const plan = gpsToPlan(gps, GEO)
    const back = planToGps(plan, GEO)
    expect(Math.abs(back.lat - gps.lat)).toBeLessThan(1e-7)
    expect(Math.abs(back.lng - gps.lng)).toBeLessThan(1e-7)
  })

  it('la ida y vuelta también funciona con el plano rotado y escalado', () => {
    const geo = { ...GEO, rotationDeg: 37, scale: 2.5 }
    const gps = { lat: 6.1498, lng: -75.6205 }
    const back = planToGps(gpsToPlan(gps, geo), geo)
    expect(Math.abs(back.lat - gps.lat)).toBeLessThan(1e-7)
    expect(Math.abs(back.lng - gps.lng)).toBeLessThan(1e-7)
  })

  it('un desplazamiento al norte reduce Y del plano (norte = arriba con rotación 0)', () => {
    const north = gpsToPlan({ lat: GEO.originLat + 0.001, lng: GEO.originLng }, GEO)
    expect(north.y).toBeLessThan(0)
  })

  it('devuelve null si falta calibración', () => {
    expect(gpsToPlan({ lat: 6, lng: -75 }, {})).toBeNull()
    expect(planToGps({ x: 1, y: 1 }, {})).toBeNull()
  })
})
