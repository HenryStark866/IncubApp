/**
 * =============================================================================
 * ARCHIVO: src/lib/planTaskInstructions.js
 * PROPÓSITO: Instrucciones de ejecución de una actividad del Plan AM, para el
 *   recuadro que se abre al hacer clic en ella en el Centro SIG.
 * DE DÓNDE SALEN: del procedimiento aprobado PROMAT01 v02 (sección 4,
 *   «Procedimiento»: actividad, responsable y registro) y de los datos de la
 *   tarea en el programa PRGMAT01 v03 (frecuencia, parada, responsable,
 *   criterio de aceptación, formato de evidencia, semanas del cronograma).
 * POR QUÉ NO HAY PASOS TÉCNICOS POR TAREA: ni PRGMAT01 ni Mántum los tienen (el
 *   criterio de aceptación figura «Por estandarizar»). Inventarlos para una
 *   máquina real sería peligroso: el recuadro remite al manual del fabricante y
 *   lo dice. Si PROMAT01 cambia de versión, este archivo tiene que cambiar con él.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

export const PROCEDURE_SOURCE = 'PROMAT01 v02 · Procedimiento del proceso de mantenimiento, sección 4'

export const RECORD_RETENTION = 'Los registros se conservan mínimo un año (Res. ICA 3650/2014 Art. 6.2.9 para la planta; Res. ICA 3651/2014 Art. 4.2.13 para las granjas). El soporte primario es Mántum; lo diligenciado en físico se digitaliza al cerrar la orden.'

const EQUIPMENT_CODE = /^([A-Z]{2,4}-?\d+(?:\.\d+)?|\d{3}\.\d+)$/

export function normalizePlanTask(task = {}) {
  return {
    code: task.code || task.plan_code || null,
    activity: task.description || task.activity || task.title || 'Actividad del plan AM',
    type: task.type || null,
    frequency: task.frequency || null,
    specialty: task.specialty || null,
    system: task.system || null,
    equipmentClass: task.equipmentClass || null,
    applyingEquipment: task.applyingEquipment || null,
    sede: task.sede || null,
    responsible: task.responsible || null,
    shutdown: task.shutdown || null,
    duration: task.duration || null,
    acceptanceCriteria: task.acceptanceCriteria || null,
    evidenceFormat: task.evidenceFormat || null,
    isCriticalSecurity: Boolean(task.isCriticalSecurity),
    isBiosecurity: Boolean(task.isBiosecurity),
    weeks: Array.isArray(task.cronograma?.weeks) ? task.cronograma.weeks : [],
  }
}

// Definiciones de la sección 3 de PROMAT01.
function typeNote(task) {
  const kind = `${task.type || ''} ${task.activity || ''}`.toLowerCase()
  if (kind.includes('calibr')) return 'Calibración: comparar la lectura del instrumento contra un patrón trazable y registrar el error y la acción tomada cuando esté fuera de tolerancia.'
  if (kind.includes('predictiv')) return 'Predictiva: se basa en inspecciones técnicas y en el análisis del comportamiento del equipo (termografía, medición de amperaje, megado, análisis de aceite).'
  if (kind.includes('correctiv')) return 'Correctiva: corrige una falla presentada durante la operación; parte de la solicitud de mantenimiento (FOMAT06).'
  return 'Preventiva: actividad programada para prevenir fallas y prolongar la vida útil del equipo.'
}

function shutdownNote(shutdown) {
  const value = String(shutdown || '').trim()
  if (!value) return null
  // Sin \b: en JavaScript la «í» no cuenta como letra y «Sí» nunca casaba con /^sí\b/.
  if (/^s[ií](?![a-záéíóúñ])/i.test(value)) return 'Exige parada: el equipo detenido y sin carga biológica.'
  if (/^no(?![a-záéíóúñ])/i.test(value)) return 'No exige parada del equipo.'
  return `Parada: «${value}» en el programa. Confirmarla con Producción antes de fijar la fecha.`
}

export function planTaskSteps(rawTask = {}) {
  const task = normalizePlanTask(rawTask)
  const weeks = task.weeks.length ? `Semanas del cronograma: ${task.weeks.join(', ')}.` : null
  const criteria = task.acceptanceCriteria
    ? `Criterio de aceptación en el programa: ${task.acceptanceCriteria}.`
    : 'El programa no define criterio de aceptación para esta tarea.'
  const execution = task.evidenceFormat || 'FOMAT01 Orden de Trabajo'
  return [
    {
      title: 'Programar la intervención',
      detail: ['Incluirla en el cronograma mensual y semanal y coordinar la fecha con Producción para no afectar la operación y garantizar la disponibilidad del equipo.', weeks, shutdownNote(task.shutdown)],
      responsible: 'Líder de Planta',
      records: 'FOMAT07 Plan Anual de Mantenimiento',
    },
    {
      title: 'Ejecutar la actividad',
      detail: [
        `${task.activity}: realizar la intervención (limpieza técnica, lubricación, ajustes, calibraciones, reemplazo de componentes, reparaciones y pruebas de funcionamiento, según aplique) siguiendo el manual del fabricante del equipo.`,
        typeNote(task),
        task.isCriticalSecurity ? 'El programa la marca como crítica para la seguridad.' : null,
      ],
      responsible: task.responsible || 'Auxiliar de Mantenimiento',
      records: /calibr/i.test(`${task.type} ${task.activity}`) ? `${execution} · FOMAT08 Calibración de Equipos` : execution,
    },
    {
      title: 'Verificar el funcionamiento',
      detail: ['Comprobar que el equipo opere correctamente después del mantenimiento: parámetros de funcionamiento, seguridad y cumplimiento de las especificaciones técnicas, antes de liberarlo.', criteria],
      responsible: 'Líder de Planta',
      records: 'FOMAT05 Liberación del Equipo',
    },
    {
      title: 'Validar limpieza y bioseguridad',
      detail: [
        'Confirmar que el equipo o el área intervenida cumpla las condiciones de limpieza, desinfección y bioseguridad antes de reiniciar la producción.',
        task.isBiosecurity ? 'El programa la marca como tarea de bioseguridad o de cumplimiento legal.' : null,
      ],
      responsible: 'Calidad / Líder de Planta',
      records: 'Lista de chequeo de bioseguridad (proceso de Bioseguridad)',
    },
    {
      title: 'Registrar la intervención',
      detail: ['Actualizar la hoja de vida del equipo con las actividades realizadas, los repuestos utilizados, los tiempos de intervención, los costos y el responsable.'],
      responsible: 'Auxiliar de Mantenimiento',
      records: 'FOMAT03 Hoja de Vida del Equipo',
    },
    {
      title: 'Liberar el equipo y avisar',
      detail: ['Confirmar que el equipo queda disponible para producción y comunicar la finalización de la intervención al área solicitante.'],
      responsible: 'Líder de Planta / Líder de Producción',
      records: 'FOMAT05 Liberación del Equipo · correo de notificación',
    },
  ].map((step) => ({ ...step, detail: step.detail.filter(Boolean) }))
}

export function equipmentCodesOf(task = {}) {
  const codes = new Set()
  for (const token of String(task.applyingEquipment || '').split(/[\s,;/]+/)) {
    const clean = token.trim().toUpperCase()
    if (EQUIPMENT_CODE.test(clean)) codes.add(clean)
  }
  const fromPlan = String(task.plan_code || '').toUpperCase().match(/^([A-Z]{2,4}-?\d+(?:\.\d+)?|\d{3}\.\d+)-[A-Z]-\d+$/)
  if (fromPlan) codes.add(fromPlan[1])
  return Array.from(codes)
}

export function manualsForTask(task = {}, manuals = [], extraCodes = []) {
  const codes = new Set([
    ...equipmentCodesOf(task),
    ...extraCodes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean),
  ])
  if (!codes.size) return []
  return manuals.filter((manual) => manual?.machineCode && codes.has(String(manual.machineCode).toUpperCase()))
}
