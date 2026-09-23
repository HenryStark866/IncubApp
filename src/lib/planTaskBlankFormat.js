/**
 * =============================================================================
 * ARCHIVO: src/lib/planTaskBlankFormat.js
 * PROPÓSITO: FOMAT01 listo para diligenciar de una actividad del Plan AM que
 *   quedó sin registro en una semana programada.
 * CÓMO FUNCIONA: trae prellenado solo lo que dice el plan (tarea, equipos,
 *   frecuencia, criterio, responsable, semana programada). Fecha, ejecución,
 *   resultado y firmas van en blanco: el formato no afirma que algo se hizo
 *   hasta que quien lo ejecutó lo diligencie y lo firme.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { documentFooterHtml, escapeHtml, letterheadCss, letterheadHtml } from './corporateBrand'

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '')

/**
 * @param {object} p
 * @param {object} p.task tarea del plan (annualMaintenancePlanData.tasks)
 * @param {object} [p.occurrence] { week, start, end } semana programada
 * @param {string[]} [p.missingCodes] equipos de esa semana sin registro
 */
export function blankPlanTaskFormatHtml({ task = {}, occurrence = null, missingCodes = null } = {}) {
  const e = (v) => escapeHtml(v == null || v === '' ? '' : String(v))
  const equipos = missingCodes?.length ? missingCodes.join(', ') : task.applyingEquipment
  const periodo = occurrence
    ? `Semana ${occurrence.week} (${fmtDay(occurrence.start)} – ${fmtDay(new Date(new Date(occurrence.end).getTime() - 86_400_000))})`
    : ''
  const plan = [
    ['Código de tarea del programa', task.code],
    ['Sede', task.sede],
    ['Sistema / zona', task.system],
    ['Clase de equipo', task.equipmentClass],
    ['Equipo(s) (código Mántum)', equipos],
    ['Actividad programada', task.description],
    ['Tipo de mantenimiento', task.type],
    ['Frecuencia programada', task.frequency],
    ['Periodo programado', periodo],
    ['Criterio de aceptación', task.acceptanceCriteria],
    ['Responsable según el plan', task.responsible],
    ['¿Requiere parada?', task.shutdown],
  ]
  const blank = (label, h = 26) => `<tr><th>${e(label)}</th><td style="height:${h}px"></td></tr>`
  const lines = (n) => Array.from({ length: n }, () => '<tr><td style="height:24px"></td><td></td><td></td><td></td><td></td></tr>').join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>FOMAT01 para diligenciar · ${e(task.code)}</title>
<style>${letterheadCss()}
body{font-family:Arial,sans-serif;color:#0b1428;margin:24px}
.aviso{margin:10px 0 14px;padding:8px 10px;border:1.5px dashed #e0740a;background:#fff8ef;font-size:11px;line-height:1.4}
h3{font-size:12px;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.03em}
table.t{width:100%;border-collapse:collapse;font-size:11px}
table.t th,table.t td{border:1px solid #9aa8b8;padding:5px 7px;text-align:left;vertical-align:top}
table.t th{width:32%;background:#f3f6fa}
table.g th{background:#f3f6fa;text-align:center;font-size:10.5px}
@media print{body{margin:0}.aviso{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
${letterheadHtml({ fomatCode: 'FOMAT01', title: 'ORDEN DE TRABAJO DE MANTENIMIENTO', process: 'GESTIÓN DE MANTENIMIENTO', plantName: task.sede })}
<p class="aviso"><strong>FORMATO PARA DILIGENCIAR.</strong> Prellenado con los datos del Plan Anual de Mantenimiento (PRGMAT01 / FOMAT07).
No constituye registro de ejecución hasta que quien realizó la actividad lo diligencie con la fecha real y lo firme.
Si se diligencia después de la fecha de ejecución, anotar «Registro extemporáneo» y la fecha en que se diligencia.</p>
<h3>1. Datos del programa</h3>
<table class="t"><tbody>${plan.map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(v) || '—'}</td></tr>`).join('')}</tbody></table>
<h3>2. Ejecución (diligenciar en campo)</h3>
<table class="t"><tbody>
${blank('N.° de OT (Mántum / IncubApp)')}${blank('Fecha y hora de inicio')}${blank('Fecha y hora de finalización')}
${blank('Fecha en que se diligencia (si es extemporáneo)')}${blank('Tiempo de parada del equipo (h)')}${blank('Ejecutado por (nombre y cargo)')}
</tbody></table>
<h3>3. Actividades ejecutadas</h3>
<table class="t g"><thead><tr><th style="width:26%">Equipo</th><th>Actividad realizada</th><th style="width:20%">Resultado / medición</th><th style="width:12%">¿Conforme? (Sí/No)</th><th style="width:14%">Observación</th></tr></thead>
<tbody>${lines(Math.min(Math.max(String(equipos || '').split(',').length, 4), 14))}</tbody></table>
<h3>4. Repuestos y materiales</h3>
<table class="t g"><thead><tr><th>Código</th><th>Descripción</th><th>Cantidad</th><th>Unidad</th><th>Costo</th></tr></thead><tbody>${lines(3)}</tbody></table>
<h3>5. Hallazgos y recomendaciones</h3>
<table class="t"><tbody><tr><td style="height:70px"></td></tr></tbody></table>
${documentFooterHtml({})}
</body></html>`
}
