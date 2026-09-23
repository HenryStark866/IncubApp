/**
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/planCompliance.test.js
 * PROPÓSITO: Fija cómo se cruza el Plan AM con lo registrado. Si esto se rompe,
 *   el cumplimiento mostraría como hecha una actividad que nadie registró (o al
 *   revés), y ese número es el que se lleva a la auditoría.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import {
  activityFamilies,
  computePlanCompliance,
  equipmentCodesOfTask,
  isoWeekOf,
  isoWeekStart,
  normalizeRecords,
  sameActivity,
} from '../planCompliance'

const inc9 = { id: 'm9', code: 'INC-09', name: 'Inc 9', type: 'setter' }
const nac1 = { id: 'n1', code: 'NAC-1', name: 'Nac 1', type: 'hatcher' }
const machinesById = { m9: inc9, n1: nac1 }

const tareaCalibracionNac = {
  code: 'PI-152',
  sede: 'PLANTA INCUBANT',
  system: 'SALON NACEDORAS 1',
  applyingEquipment: 'NAC-001.1, NAC-001.2',
  description: 'VERIFICAR CALIBRACION DE LA NACEDORA',
  evidenceFormat: 'Orden de Trabajo en Mántum / FOMAT01',
  cronograma: { weeks: [30, 31, 32] },
}
const tareaCo2 = {
  code: 'PI-201',
  sede: 'PLANTA INCUBANT',
  system: 'SALA DE INCUBACIÓN 1',
  applyingEquipment: 'INC-001.9',
  description: 'Sensor de CO2 Haga una calibración cero',
  cronograma: { weeks: [30] },
}

describe('semanas ISO', () => {
  it('el lunes de la semana 1 de 2026 es el 29-12-2025', () => {
    const d = isoWeekStart(2026, 1)
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(11)
    expect(d.getDate()).toBe(29)
  })
  it('isoWeekOf e isoWeekStart son inversas', () => {
    for (const w of [1, 10, 27, 38, 52]) expect(isoWeekOf(isoWeekStart(2026, w)).week).toBe(w)
    expect(isoWeekOf(new Date(2026, 8, 23)).week).toBe(39)
  })
})

describe('qué cuenta como la misma actividad', () => {
  it('una calibración de temperatura no cumple una calibración de CO2', () => {
    expect(sameActivity(tareaCo2.description, 'Calibración · INC-09 · Antes de transferencia temperatura humedad')).toBe(false)
  })
  it('una calibración sí cumple «verificar calibración»', () => {
    expect(sameActivity(tareaCalibracionNac.description, 'Calibración · NAC-1 · Antes de transferencia')).toBe(true)
  })
  it('una falla no cumple una inspección preventiva', () => {
    expect(sameActivity('Revisión periódica', 'Pantalla negra después del temblor')).toBe(false)
    expect(activityFamilies('Pantalla negra').has('correctivo')).toBe(true)
  })
  it('lee los códigos de equipo del plan', () => {
    expect(equipmentCodesOfTask({ applyingEquipment: 'INC-001.1, inc-001.10, (por confirmar)' })).toEqual(['INC-001.1', 'INC-001.10'])
  })
})

describe('cumplimiento', () => {
  const now = new Date(2026, 7, 20) // semana 34
  const knownKeys = new Set(['NAC-001.1', 'NAC-001.2', 'INC-001.9'])

  it('marca cumplida, parcial y sin registro sin suponer nada', () => {
    const records = normalizeRecords({
      machinesById,
      workOrders: [
        // semana 30 (20–26 jul): NAC-1 calibrada; NAC-2 no → parcial
        { id: 'w1', machine_id: 'n1', title: 'Calibración · NAC-1 · Antes de transferencia', status: 'completed', completed_at: '2026-07-22T10:00:00-05:00' },
      ],
      mantumRecords: [
        // semana 31: Mántum trae las dos nacedoras → cumplida
        { id: 'mt1', source: 'mantum-ot', code: '030001', date: '2026-07-29T09:00', equipment: ['NAC-001.1', 'NAC-001.2'], activity: 'VERIFICAR CALIBRACION DE LA NACEDORA', finishedAt: '2026-07-29T10:00', executors: ['Juan Carlos Suaza'] },
      ],
    })
    const { rows, totals } = computePlanCompliance({ tasks: [tareaCalibracionNac], records, knownKeys, now, year: 2026 })
    const occ = rows[0].occurrences.map((o) => [o.week, o.status])
    expect(occ).toEqual([[30, 'partial'], [31, 'done'], [32, 'missing']])
    expect(totals.due).toBe(3)
    expect(totals.pct).toBeCloseTo((0.5 + 1 + 0) / 3)
  })

  it('las semanas futuras quedan como programadas y no bajan el porcentaje', () => {
    const { rows, totals } = computePlanCompliance({
      tasks: [{ ...tareaCalibracionNac, cronograma: { weeks: [40, 44] } }],
      records: [],
      knownKeys,
      now,
    })
    expect(rows[0].occurrences.every((o) => o.status === 'upcoming')).toBe(true)
    expect(totals.due).toBe(0)
    expect(totals.pct).toBeNull()
  })

  it('una calibración de temperatura no cumple la tarea de CO2', () => {
    const records = normalizeRecords({
      machinesById,
      calibrations: [{ id: 'c1', machine_id: 'm9', calibrated_at: '2026-07-21T08:00:00-05:00', performed_by: 'u1' }],
    })
    const { rows } = computePlanCompliance({ tasks: [tareaCo2], records, knownKeys, now })
    expect(rows[0].occurrences[0].status).toBe('missing')
  })

  it('la calibración con OT se cuenta una sola vez', () => {
    const records = normalizeRecords({
      machinesById,
      workOrders: [{ id: 'w9', machine_id: 'm9', title: 'Calibración · INC-09', status: 'completed', completed_at: '2026-07-21T09:00:00-05:00' }],
      calibrations: [{ id: 'c9', machine_id: 'm9', work_order_id: 'w9', calibrated_at: '2026-07-21T09:00:00-05:00' }],
    })
    expect(records).toHaveLength(1)
  })
})
