/**
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/operationReportSig.test.js
 * PROPÓSITO: El Reporte de operación y el FOMAT01 para diligenciar salen con el
 *   marco del SIG (código, versión, fecha) y sin inventar ejecución.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import { buildOperationReportHtml, OPERATION_FORMAT } from '../operationReport'
import { blankPlanTaskFormatHtml } from '../planTaskBlankFormat'
import { SIG_FORMATS } from '../corporateBrand'

describe('FOINC02 · Reporte de operación', () => {
  const html = buildOperationReportHtml({
    checks: [
      { machine_id: 'm1', taken_by: 'u1', taken_at: '2026-09-20T08:00:00-05:00', shift_number: 1, condition: 'normal' },
      { machine_id: 'm1', taken_by: 'u1', taken_at: '2026-09-20T09:00:00-05:00', shift_number: 1, condition: 'fault', notes: 'Alarma de temperatura' },
    ],
    loads: [{ machine_id: 'm1', lote: '45', loaded_at: '2026-09-20T07:00:00-05:00', created_by: 'u1' }],
    people: { u1: { name: 'Operario Uno' } },
    machineName: { m1: 'INC-01' },
    desde: '2026-09-20',
    hasta: '2026-09-20',
  })
  it('lleva el código, la versión y la fecha del catálogo del SIG', () => {
    expect(OPERATION_FORMAT).toBe(SIG_FORMATS.FOINC02)
    expect(html).toContain('Código:</td><td class="val" style="width:2.8cm">FOINC02')
    expect(html).toContain(OPERATION_FORMAT.version)
    expect(html).toContain('data:image')
    expect(html).toContain('Control de los cambios')
  })
  it('resume y lista las novedades con quien las tomó', () => {
    expect(html).toContain('Alarma de temperatura')
    expect(html).toContain('Operario Uno')
    expect(html).toContain('INC-01')
  })
})

describe('FOMAT01 para diligenciar', () => {
  const html = blankPlanTaskFormatHtml({
    task: { code: 'PI-152', description: 'VERIFICAR CALIBRACION DE LA NACEDORA', applyingEquipment: 'NAC-001.1, NAC-001.2', frequency: 'Cada 3 Día(s)' },
    occurrence: { week: 38, start: new Date(2026, 8, 14), end: new Date(2026, 8, 21) },
    missingCodes: ['NAC-001.2'],
  })
  it('trae el plan y deja la ejecución en blanco', () => {
    expect(html).toContain('PI-152')
    expect(html).toContain('NAC-001.2')
    expect(html).toContain('Semana 38')
    expect(html).toContain('FORMATO PARA DILIGENCIAR')
    expect(html).not.toMatch(/Conforme al procedimiento|Ejecutado por \(nombre y cargo\)<\/th><td[^>]*>[^<]/)
  })
})
