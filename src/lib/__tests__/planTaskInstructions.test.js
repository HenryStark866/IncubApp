import { describe, it, expect } from 'vitest'
import { equipmentCodesOf, manualsForTask, planTaskSteps } from '../planTaskInstructions'

const TAREA_PRGMAT01 = {
  code: 'PI-001',
  description: 'REVISIÓN PERIÓDICA',
  type: 'Sistemática',
  frequency: 'Cada 31 Día(s)',
  shutdown: 'Por confirmar',
  responsible: 'Auxiliar de Mantenimiento (Control)',
  acceptanceCriteria: 'Por estandarizar — ver ficha de la tarea en Mántum (Planes de Mantenimiento)',
  evidenceFormat: 'Orden de Trabajo en Mántum / FOMAT01',
  applyingEquipment: 'AS-001.2',
  cronograma: { weeks: [2, 6, 10] },
}

describe('instrucciones de ejecución del Plan AM (PROMAT01 v02)', () => {
  it('sigue las actividades del procedimiento aprobado con los datos de la tarea', () => {
    const steps = planTaskSteps(TAREA_PRGMAT01)

    expect(steps.map((step) => step.title)).toEqual([
      'Programar la intervención',
      'Ejecutar la actividad',
      'Verificar el funcionamiento',
      'Validar limpieza y bioseguridad',
      'Registrar la intervención',
      'Liberar el equipo y avisar',
    ])
    const text = JSON.stringify(steps)
    expect(text).toContain('Semanas del cronograma: 2, 6, 10.')
    expect(text).toContain('«Por confirmar»')
    expect(text).toContain('Por estandarizar')
    expect(steps[1].responsible).toBe('Auxiliar de Mantenimiento (Control)')
    expect(steps[1].records).toBe('Orden de Trabajo en Mántum / FOMAT01')
  })

  it('explica en qué consisten las predictivas y las calibraciones', () => {
    const predictiva = JSON.stringify(planTaskSteps({ activity: 'Medición de amperaje del motor', type: 'Predictiva' }))
    const calibracion = planTaskSteps({ activity: 'Calibración de sensores', type: 'Calibración' })

    expect(predictiva).toContain('termografía')
    expect(JSON.stringify(calibracion)).toContain('patrón trazable')
    expect(calibracion[1].records).toContain('FOMAT08')
  })

  it('la parada «Sí» exige el equipo detenido y sin carga biológica', () => {
    const [programar] = planTaskSteps({ activity: 'Lavado de serpentín', shutdown: 'Sí' })

    expect(programar.detail).toContain('Exige parada: el equipo detenido y sin carga biológica.')
  })

  it('encuentra el manual del fabricante por el código del equipo o del plan', () => {
    const manuals = [
      { id: 'm1', machineCode: '005.4', file_name: '005.4__chiller.pdf' },
      { id: 'm2', machineCode: 'INC-001.1', file_name: 'INC-001.1__biostreamer.pdf' },
    ]

    expect(equipmentCodesOf({ plan_code: '005.4-C-001' })).toEqual(['005.4'])
    expect(manualsForTask({ plan_code: '005.4-C-001' }, manuals).map((manual) => manual.id)).toEqual(['m1'])
    expect(manualsForTask({ applyingEquipment: 'INC-001.1, INC-001.2' }, manuals).map((manual) => manual.id)).toEqual(['m2'])
    expect(manualsForTask({ activity: 'Revisión general' }, manuals, ['inc-001.1']).map((manual) => manual.id)).toEqual(['m2'])
    expect(manualsForTask({ applyingEquipment: 'Todas las salas' }, manuals)).toEqual([])
  })
})
