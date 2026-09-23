/**
 * =============================================================================
 * ARCHIVO: src/lib/operationReport.js
 * PROPÓSITO: «Reporte de operación» (turnos, operarios, rondas, cargues y
 *   transferencias) en el formato del SIG — FOINC02 —, compartido entre
 *   MonitorMode, LeaderOpsMap y el Centro de Activos y Dossiers SIG.
 * CÓMO FUNCIONA: dos salidas con los mismos datos y el mismo código:
 *   - Word (.doc) con el marco del SIG (logo, título, código, versión, fecha),
 *     resumen, tablas, control de cambios y firmas, igual que FOINC01/FONAC01.
 *   - Excel con el membrete corporativo (exportExcel.js), para filtrar.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { exportToExcel } from './exportExcel'
import { escapeHtml, SIG_FORMATS } from './corporateBrand'
import { SIG_LOGO_DATA_URI } from './sigLogo'

export const SHIFT_LABEL = { 1: 'T1 · 06–14 h', 2: 'T2 · 14–22 h', 3: 'T3 · 22–06 h' }
export const OPERATION_FORMAT = SIG_FORMATS.FOINC02

export const fmtDT = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'

const CONDITION_LABEL = { normal: 'Sin novedad', warning: 'Alerta', fault: 'Falla', off: 'Apagada' }
const conditionLabel = (v) => CONDITION_LABEL[v] ?? v

/**
 * @param {object} d
 * @param {object[]} d.assignments turnos (shift_assignments)
 * @param {object[]} d.checks rondas (machine_checks)
 * @param {object[]} d.loads cargues (setter_loads)
 * @param {object[]} d.transfers transferencias
 * @param {object[]} d.activities actividades del turno (shift_activities)
 * @param {Record<string, {name:string, role?:string}>} d.people id de usuario → datos
 * @param {Record<string, string>} d.machineName id de máquina → nombre legible
 */
export function buildOperationReportSheets({
  assignments = [],
  checks = [],
  loads = [],
  transfers = [],
  activities = [],
  people = {},
  machineName = {},
}) {
  const turnosRows = assignments.map((a) => ({
    Fecha: a.work_date,
    Turno: SHIFT_LABEL[a.shift_number] ?? a.shift_number,
    Usuario: people[a.user_id]?.name ?? a.user_id,
    Descanso: a.is_rest ? 'Sí' : 'No',
  }))

  const relevantIds = new Set(
    [
      ...assignments.map((a) => a.user_id),
      ...checks.map((c) => c.taken_by),
      ...loads.map((l) => l.created_by),
      ...transfers.map((t) => t.created_by),
      ...activities.map((a) => a.assigned_to),
    ].filter(Boolean)
  )
  const operariosRows = [...relevantIds]
    .map((id) => ({
      Operario: people[id]?.name ?? id,
      Rol: people[id]?.role ?? '—',
      'Turnos asignados': assignments.filter((a) => a.user_id === id && !a.is_rest).length,
      'Rondas registradas': checks.filter((c) => c.taken_by === id).length,
      'Cargues registrados': loads.filter((l) => l.created_by === id).length,
      'Transferencias registradas': transfers.filter((t) => t.created_by === id).length,
      'Actividades completadas': activities.filter((a) => a.assigned_to === id && a.status === 'completed').length,
    }))
    .sort((a, b) => a.Operario.localeCompare(b.Operario, 'es'))

  const rondasRows = checks.map((c) => ({
    Fecha: fmtDate(c.taken_at),
    Hora: fmtTime(c.taken_at),
    Turno: SHIFT_LABEL[c.shift_number] ?? c.shift_number,
    Máquina: machineName[c.machine_id] || c.machine_id,
    Condición: conditionLabel(c.condition),
    'Tomado por': people[c.taken_by]?.name ?? '—',
    Notas: c.notes || '—',
  }))

  const carguesRows = loads.map((l) => ({
    Fecha: fmtDT(l.loaded_at),
    Lote: l.lote,
    Máquina: machineName[l.machine_id] || l.machine_id,
    'Color cinta': l.tape_color_name || l.tape_color || '—',
    'Registrado por': people[l.created_by]?.name ?? '—',
  }))

  const transRows = transfers.map((t) => ({
    Fecha: fmtDT(t.transferred_at),
    Lote: t.lote,
    Modo: t.mode === 'partial' ? 'Parcial' : 'Completa',
    'Peso Δ kg': t.weight_diff ?? '—',
    'Registrado por': people[t.created_by]?.name ?? '—',
  }))

  return [
    { name: 'Turnos', rows: turnosRows },
    { name: 'Operarios', rows: operariosRows },
    { name: 'Rondas', rows: rondasRows },
    { name: 'Cargues', rows: carguesRows },
    { name: 'Transferencias', rows: transRows },
  ]
}

/** Periodo que cubren los datos, si no se da: de la primera a la última fecha. */
function periodOf(d) {
  const dates = [
    ...d.assignments.map((a) => a.work_date && `${a.work_date}T12:00:00`),
    ...d.checks.map((c) => c.taken_at),
    ...d.loads.map((l) => l.loaded_at),
    ...d.transfers.map((t) => t.transferred_at),
  ]
    .filter(Boolean)
    .map((v) => new Date(v))
    .filter((x) => !Number.isNaN(x.getTime()))
    .sort((a, b) => a - b)
  return dates.length ? { desde: dates[0], hasta: dates[dates.length - 1] } : { desde: null, hasta: null }
}

/** Excel con membrete del SIG y el código FOINC02. */
export async function exportOperationReport(data) {
  const sheets = buildOperationReportSheets(data)
  return exportToExcel('reporte-operacion-sig', sheets, {
    title: OPERATION_FORMAT.name,
    fomatCode: OPERATION_FORMAT.code,
    module: 'Operación',
    plantName: data.plantName,
  })
}

/* ── Word con el marco del SIG ──────────────────────────────────────────── */

const CSS = `
  @page { size: Letter landscape; margin: 1.3cm 1.3cm 1.3cm 1.6cm; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; }
  table { border-collapse: collapse; width: 100%; }
  table.marco td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
  table.marco .titulo { font-size: 13pt; font-weight: 700; text-align: center; }
  table.marco .sub { font-size: 8.5pt; font-weight: 400; display: block; margin-top: 2px; }
  table.marco .etq { font-size: 9.5pt; font-weight: 700; }
  table.marco .val { font-size: 9.5pt; text-align: center; }
  .instruccion { font-size: 9pt; font-style: italic; text-align: justify; margin: 8px 0; }
  table.datos td { border: 1px solid #000; padding: 3px 5px; font-size: 9pt; }
  table.datos td.e { background: #D9D9D9; font-weight: 700; width: 22%; }
  h3 { font-size: 10.5pt; margin: 14px 0 4px; }
  table.fmt th, table.fmt td { border: 1px solid #000; padding: 2px 4px; font-size: 8pt; vertical-align: top; }
  table.fmt th { background: #D9D9D9; font-weight: 700; text-align: center; }
  table.fmt td.n { text-align: center; }
  table.fmt tr.par td { background: #F2F2F2; }
  table.fmt tr.alerta td { background: #FFF2CC; }
  table.fmt tr.falla td { background: #F8D7D7; }
  .nota { font-size: 8pt; font-style: italic; margin: 4px 0 0; }
  table.cambios th, table.cambios td, table.firmas th, table.firmas td { border: 1px solid #000; padding: 3px 5px; font-size: 9.5pt; }
  table.cambios th, table.firmas th { background: #D9D9D9; }
  table.firmas td { text-align: center; height: 0.8cm; }
  .pie { font-size: 7.5pt; color: #595959; text-align: center; margin-top: 10px; }
`

const FIRMAS = [
  ['ELABORÓ', 'Líder de área / supervisor de turno'],
  ['REVISÓ', 'Líder de Planta'],
  ['APROBÓ', 'Asesora del SIG'],
]

const e = (v) => escapeHtml(v == null || v === '' ? '—' : String(v))

function tabla(headers, rows, { vacio = 'Sin registros en el periodo.', clase = () => '' } = {}) {
  if (!rows.length) return `<p class="nota">${e(vacio)}</p>`
  return `<table class="fmt"><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r, i) => `<tr class="${clase(r) || (i % 2 ? 'par' : '')}">${r.cells.map((c) => `<td${typeof c === 'number' ? ' class="n"' : ''}>${e(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`
}

/**
 * HTML del FOINC02 (se descarga como .doc y también se puede ver/imprimir).
 * @param {object} data mismos datos de buildOperationReportSheets + { plantName, desde, hasta } (fechas yyyy-mm-dd)
 */
export function buildOperationReportHtml(data = {}) {
  const d = { assignments: [], checks: [], loads: [], transfers: [], activities: [], people: {}, machineName: {}, ...data }
  const f = OPERATION_FORMAT
  const periodo = data.desde && data.hasta ? { desde: new Date(`${data.desde}T12:00:00`), hasta: new Date(`${data.hasta}T12:00:00`) } : periodOf(d)
  const persona = (id) => d.people[id]?.name || 'No registrado'
  const maquina = (id) => d.machineName[id] || 'No registrada'

  const porCondicion = { normal: 0, warning: 0, fault: 0, off: 0 }
  for (const c of d.checks) porCondicion[c.condition] = (porCondicion[c.condition] || 0) + 1
  const turnosTrabajados = d.assignments.filter((a) => !a.is_rest)
  const actividadesHechas = d.activities.filter((a) => a.status === 'completed' || a.status === 'done')

  // Rondas por máquina: una fila por equipo, no una por toma (son miles).
  const porMaquina = new Map()
  for (const c of d.checks) {
    const k = c.machine_id
    if (!porMaquina.has(k)) porMaquina.set(k, { tomas: 0, normal: 0, warning: 0, fault: 0, off: 0, ultima: null })
    const g = porMaquina.get(k)
    g.tomas += 1
    g[c.condition] = (g[c.condition] || 0) + 1
    if (!g.ultima || c.taken_at > g.ultima) g.ultima = c.taken_at
  }
  const maquinas = [...porMaquina.entries()]
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => maquina(a.id).localeCompare(maquina(b.id), 'es', { numeric: true }))

  const novedades = d.checks
    .filter((c) => c.condition === 'warning' || c.condition === 'fault')
    .sort((a, b) => String(a.taken_at).localeCompare(String(b.taken_at)))

  const operarios = buildOperationReportSheets(d)[1].rows

  const hoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const rango = periodo.desde
    ? `${periodo.desde.toLocaleDateString('es-CO')} a ${periodo.hasta.toLocaleDateString('es-CO')}`
    : 'Sin registros'

  const marco = `<table class="marco">
    <tr>
      <td rowspan="4" style="width:3.4cm;text-align:center"><img src="${SIG_LOGO_DATA_URI}" style="width:3cm" alt="Incubant" /></td>
      <td rowspan="4" class="titulo">${e(f.name)}<span class="sub">SISTEMA INTEGRADO DE GESTIÓN · ${e(f.process)}</span></td>
      <td class="etq" style="width:2.2cm">Código:</td><td class="val" style="width:2.8cm">${e(f.code)}</td>
    </tr>
    <tr><td class="etq">Versión:</td><td class="val">${e(f.version)}</td></tr>
    <tr><td class="etq">Fecha:</td><td class="val">${e(f.date)}</td></tr>
    <tr><td class="etq">Página:</td><td class="val">1 de 1</td></tr>
  </table>`

  const datos = `<table class="datos" style="margin-top:8px">
    <tr><td class="e">Sede / planta</td><td>${e(data.plantName || 'Planta Incubant · Hispania, Antioquia')}</td><td class="e">Periodo reportado</td><td>${e(rango)}</td></tr>
    <tr><td class="e">Emitido</td><td>${e(hoy)} desde IncubApp</td><td class="e">Fuente</td><td>Turnos, rondas, cargues, transferencias y actividades registrados en la app</td></tr>
  </table>`

  const resumen = `<h3>1. Resumen del periodo</h3>
  <table class="datos">
    <tr><td class="e">Turnos trabajados</td><td>${turnosTrabajados.length}</td><td class="e">Operarios con registro</td><td>${operarios.length}</td></tr>
    <tr><td class="e">Tomas de ronda</td><td>${d.checks.length}</td><td class="e">Máquinas con ronda</td><td>${maquinas.length}</td></tr>
    <tr><td class="e">Sin novedad</td><td>${porCondicion.normal || 0}</td><td class="e">Alertas / fallas</td><td>${porCondicion.warning || 0} / ${porCondicion.fault || 0}</td></tr>
    <tr><td class="e">Equipo apagado</td><td>${porCondicion.off || 0}</td><td class="e">Actividades completadas</td><td>${actividadesHechas.length} de ${d.activities.length}</td></tr>
    <tr><td class="e">Cargues</td><td>${d.loads.length}</td><td class="e">Transferencias</td><td>${d.transfers.length}</td></tr>
  </table>`

  const cuerpo = [
    resumen,
    '<h3>2. Operarios</h3>',
    tabla(
      ['Operario', 'Rol', 'Turnos', 'Rondas', 'Cargues', 'Transferencias', 'Actividades completadas'],
      operarios.map((o) => ({ cells: [o.Operario, o.Rol, o['Turnos asignados'], o['Rondas registradas'], o['Cargues registrados'], o['Transferencias registradas'], o['Actividades completadas']] }))
    ),
    '<h3>3. Rondas por máquina</h3>',
    tabla(
      ['Máquina', 'Tomas', 'Sin novedad', 'Alerta', 'Falla', 'Apagada', 'Última toma'],
      maquinas.map((m) => ({ cells: [maquina(m.id), m.tomas, m.normal || 0, m.warning || 0, m.fault || 0, m.off || 0, fmtDT(m.ultima)], m })),
      { clase: (r) => (r.m.fault ? 'falla' : r.m.warning ? 'alerta' : '') }
    ),
    '<h3>4. Novedades reportadas en ronda</h3>',
    tabla(
      ['Fecha', 'Hora', 'Turno', 'Máquina', 'Condición', 'Tomado por', 'Notas'],
      novedades.map((c) => ({ cells: [fmtDate(c.taken_at), fmtTime(c.taken_at), SHIFT_LABEL[c.shift_number] || c.shift_number, maquina(c.machine_id), conditionLabel(c.condition), persona(c.taken_by), c.notes || '—'], c })),
      { vacio: 'Sin alertas ni fallas reportadas en el periodo.', clase: (r) => (r.c.condition === 'fault' ? 'falla' : 'alerta') }
    ),
    '<h3>5. Cargues</h3>',
    tabla(
      ['Fecha y hora', 'Lote', 'Máquina', 'Color de cinta', 'Registrado por'],
      d.loads.slice().sort((a, b) => String(a.loaded_at).localeCompare(String(b.loaded_at))).map((l) => ({ cells: [fmtDT(l.loaded_at), l.lote, maquina(l.machine_id), l.tape_color_name || l.tape_color || '—', persona(l.created_by)] }))
    ),
    '<h3>6. Transferencias</h3>',
    tabla(
      ['Fecha y hora', 'Lote', 'Modo', 'Diferencia de peso (kg)', 'Registrado por'],
      d.transfers.slice().sort((a, b) => String(a.transferred_at).localeCompare(String(b.transferred_at))).map((t) => ({ cells: [fmtDT(t.transferred_at), t.lote, t.mode === 'partial' ? 'Parcial' : 'Completa', t.weight_diff ?? '—', persona(t.created_by)] }))
    ),
  ].join('\n')

  const cierre = `
  <p class="nota">Emitido el ${e(hoy)} con los registros de IncubApp. Cada cifra sale de un registro con fecha, hora y
    responsable en la aplicación; lo que no se registró no aparece. El detalle toma por toma está en el FOINC01/FONAC01 de cada máquina.</p>
  <h3>Control de los cambios</h3>
  <table class="cambios">
    <tr><th style="width:2.6cm">Fecha</th><th>Cambio realizado</th><th style="width:1.8cm">Versión</th></tr>
    <tr><td>${e(f.date)}</td><td>Creación del documento con el formato del SIG (antes era un Excel sin codificación).</td><td>${e(f.version)}</td></tr>
  </table>
  <table class="firmas" style="margin-top:10px">
    <tr>${FIRMAS.map(([t]) => `<th>${t}</th>`).join('')}</tr>
    <tr>${FIRMAS.map(() => '<td></td>').join('')}</tr>
    <tr>${FIRMAS.map(([, c]) => `<td>${e(c)}</td>`).join('')}</tr>
  </table>
  <p class="pie">ANTIOQUEÑA DE INCUBACIÓN S.A.S. · NIT 900.762.687 · Hispania, Antioquia &nbsp;|&nbsp; ${e(f.code)} v${e(f.version)}
    &nbsp;|&nbsp; Documento controlado del SIG — la copia impresa es no controlada</p>`

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /><title>${e(f.code)} ${e(f.name)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>${CSS}</style></head>
<body>${marco}${datos}<p class="instruccion">Consolidado de la operación de la planta de incubación en el periodo: quién trabajó, qué rondas se hicieron
y con qué novedad, y los movimientos de huevo (cargues y transferencias). Conservar mínimo un (1) año — Res. ICA 3650/2014 Art. 6.2.9.</p>
${cuerpo}${cierre}</body></html>`
}

/** Descarga el FOINC02 como documento de Word. */
export function exportOperationReportDoc(data) {
  const html = buildOperationReportHtml(data)
  const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${OPERATION_FORMAT.code} Reporte de operación ${new Date().toLocaleDateString('sv-SE')}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return { ok: true }
}
