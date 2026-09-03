import { describe, it, expect } from 'vitest'
import {
  summarizeChecks,
  summarizeWorkOrders,
  summarizeCalibrations,
} from '../maintenanceManagementPlan'

describe('maintenanceManagementPlan (cálculos en vivo del plan de gestión)', () => {
  it('summarizeChecks calcula conformidad excluyendo máquinas apagadas', () => {
    const checks = [
      ...Array(4421).fill({ condition: 'normal' }),
      ...Array(1156).fill({ condition: 'off' }),
      ...Array(4).fill({ condition: 'fault' }),
    ]
    const s = summarizeChecks(checks)
    expect(s.total).toBe(5581)
    expect(s.activeTotal).toBe(4425)
    expect(s.conformidadPct).toBeCloseTo(99.9, 1)
  })

  it('summarizeWorkOrders calcula MTTR proxy y relación preventivo/correctivo', () => {
    const orders = [
      { type: 'preventive', status: 'completed', created_at: '2026-07-01T00:00:00Z', completed_at: '2026-07-01T10:00:00Z' },
      { type: 'corrective', status: 'completed', created_at: '2026-07-02T00:00:00Z', completed_at: '2026-07-02T02:00:00Z' },
      { type: 'inspection', status: 'open' },
    ]
    const s = summarizeWorkOrders(orders)
    expect(s.total).toBe(3)
    expect(s.preventive).toBe(1)
    expect(s.corrective).toBe(1)
    expect(s.pcRatioPct).toBeCloseTo(50, 5)
    expect(s.mttrHours).toBeCloseTo(6, 5) // promedio de 10h y 2h
    expect(s.byStatus.open).toBe(1)
  })

  it('summarizeCalibrations marca fuera de tolerancia cuando el delta excede el límite', () => {
    const rows = [
      { machine_id: 'm1', scope: 'both', temp_delta_f: 0.0, rh_delta_pct: -0.1, calibrated_at: '2026-07-22' },
      { machine_id: 'm2', scope: 'both', temp_delta_f: 5.0, rh_delta_pct: 0.3, calibrated_at: '2026-07-15' },
    ]
    const s = summarizeCalibrations(rows, { m1: 'INC-20', m2: 'NAC-10' })
    expect(s.total).toBe(2)
    expect(s.withinTolerance).toBe(1)
    expect(s.rows[0]['Dentro de tolerancia']).toBe('Sí')
    expect(s.rows[1]['Dentro de tolerancia']).toBe('No')
  })
})
