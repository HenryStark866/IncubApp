/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/misionales/generarPdfPreoperacional.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * FECHA / DATE:   06-10-2026
 *
 * ES: Arma el PDF de una inspección pre-operacional con el formato real del SIG
 *     FOSST22 «LISTA PREOPERACIONAL VEHÍCULOS»: marco con logo, código, versión y
 *     fecha; inspección general; datos del conductor; criterios con B / M / N/A,
 *     observaciones y acción correctiva; cumplimiento; compromisos y firmas.
 * EN: Builds the PDF of a pre-operational inspection in the real SIG form FOSST22
 *     layout: logo frame with code, version and date; general inspection; driver
 *     data; criteria with B / M / N/A, observations and corrective action;
 *     compliance; commitments and signatures.
 * =============================================================================
 */
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { SIG_LOGO_DATA_URI } from '../sigLogo'
import { FOSST22, MANTENIMIENTOS_FOSST22 } from './formatoFosst22'
import { agruparAspectos } from './agruparAspectos'
import { aspectosFosst22 } from '../misionalesCatalog'

// ES: Hoja carta en milímetros y márgenes. EN: Letter sheet in mm and margins.
const ANCHO_HOJA = 215.9
const MARGEN = 12
const ANCHO_UTIL = ANCHO_HOJA - MARGEN * 2
// ES: Estilo común de las tablas del SIG (bordes negros, encabezado gris).
// EN: Common SIG table style (black borders, gray header).
const ESTILO = { font: 'helvetica', fontSize: 7.6, textColor: 0, lineColor: 0, lineWidth: 0.2, cellPadding: 1.2, valign: 'middle' }
const GRIS = [217, 217, 217]

/** ES: «2026-10-06…» → «06/10/2026». EN: ISO date → dd/mm/yyyy. */
export function fechaCorta(valor) {
  if (!valor) return ''
  const s = String(valor)
  // ES: Fecha sola AAAA-MM-DD sin hora: no se pasa por zona horaria. EN: Date-only: no timezone shift.
  const solo = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (solo) return `${solo[3]}/${solo[2]}/${solo[1]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
}

/** ES: Fecha y hora de Bogotá. EN: Bogota date and time. */
function fechaHora(valor) {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' })
}

/** ES: Fecha del punto 17 según el sub-ítem. EN: Item 17 date by sub-item. */
function fechaMantenimiento(sub, mantenimiento = {}) {
  const s = sub.toLowerCase()
  const clave = MANTENIMIENTOS_FOSST22.map(([k]) => k).find((k) => s.includes(k.slice(0, 5)))
  return clave && mantenimiento[clave] ? fechaCorta(mantenimiento[clave]) : ''
}

/** ES: Vencimiento que pide el punto 16. EN: Expiry date item 16 asks for. */
function vencimientoDocumento(sub, row, formato) {
  const s = sub.toLowerCase()
  if (s.includes('conducci')) return fechaCorta(row.license_exp)
  if (s.includes('soat')) return fechaCorta(formato.soat_vence)
  if (s.includes('tecno')) return fechaCorta(formato.tecno_vence)
  return null
}

/**
 * @param {object} row ES: fila de mission_inspections. EN: mission_inspections row.
 * @param {{ orgName?: string }} [opciones]
 * @returns {jsPDF}
 */
export function generarPdfPreoperacional(row, opciones = {}) {
  // ES: Datos adicionales del formato (cédula, turno, vencimientos…). EN: Extra form data.
  const formato = row.formato || {}
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' })
  let y = MARGEN

  // ── ES: Marco del SIG / EN: SIG frame ─────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, fontSize: 8.5 },
    body: [
      [
        { content: '', rowSpan: 3, styles: { cellWidth: 38, minCellHeight: 16 } },
        { content: FOSST22.titulo, rowSpan: 3, styles: { halign: 'center', fontStyle: 'bold', fontSize: 12 } },
        { content: `CÓDIGO: ${FOSST22.codigo}`, styles: { cellWidth: 42, fontStyle: 'bold' } },
      ],
      [{ content: `VERSIÓN: ${FOSST22.version}`, styles: { fontStyle: 'bold' } }],
      [{ content: `FECHA: ${FOSST22.fecha}`, styles: { fontStyle: 'bold' } }],
    ],
    didDrawCell: (c) => {
      // ES: Logo del SIG en la primera celda. EN: SIG logo in the first cell.
      if (c.section === 'body' && c.row.index === 0 && c.column.index === 0) {
        try {
          doc.addImage(SIG_LOGO_DATA_URI, 'PNG', c.cell.x + 2, c.cell.y + 2, 34, (34 * 107) / 278)
        } catch {
          /* ES: sin logo si la imagen falla / EN: no logo if the image fails */
        }
      }
    },
  })
  y = doc.lastAutoTable.finalY + 2

  // ── ES: Inspección general y conductor / EN: General inspection and driver ─
  const titulo = (t) => [{ content: t, colSpan: 6, styles: { fillColor: GRIS, fontStyle: 'bold', halign: 'center' } }]
  const etq = (t) => ({ content: t, styles: { fontStyle: 'bold', fillColor: [242, 242, 242] } })
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: ESTILO,
    columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 22 }, 4: { cellWidth: 30 } },
    body: [
      titulo('INSPECCIÓN GENERAL VEHÍCULO'),
      [etq('PLACA DE VEHÍCULO:'), row.plate || '', etq('MODELO:'), [row.brand, row.model].filter(Boolean).join(' '), etq('FECHA DE INSPECCIÓN:'), fechaCorta(row.inspected_at)],
      titulo('DATOS DEL CONDUCTOR'),
      [etq('Nombre Conductor:'), row.driver_name || '', etq('Licencia No.:'), row.license_num || '', etq('Vencimiento Licencia:'), fechaCorta(row.license_exp)],
      [etq('C.C.'), formato.cedula || '', etq('Categoría:'), formato.categoria || '', etq('Turno de trabajo:'), formato.turno || ''],
    ],
  })
  y = doc.lastAutoTable.finalY + 2

  // ── ES: Criterios / EN: Criteria ───────────────────────────────────────────
  const filas = agruparAspectos(row.aspects || row.aspectos || {}, aspectosFosst22(row.vehicle_type))
  const cuerpo = []
  filas.forEach((f, i) => {
    // ES: Criterio en una sola celda para sus sub-ítems seguidos (como en el papel).
    // EN: One criterion cell spanning its consecutive sub-items (as on paper).
    const primero = i === 0 || filas[i - 1].criterio !== f.criterio
    let span = 1
    if (primero) while (filas[i + span] && filas[i + span].criterio === f.criterio) span += 1
    // ES: Observación + fechas que pide el formato (punto 16 y 17). EN: Observation + required dates.
    const extras = []
    const venc = vencimientoDocumento(f.sub, row, formato)
    if (venc !== null && /^16\./.test(f.criterio)) extras.push(`Fecha vencimiento: ${venc || '—'}`)
    if (/^17\./.test(f.criterio)) extras.push(`Día/Mes/Año: ${fechaMantenimiento(f.sub, formato.mantenimiento) || '—'}`)
    if (f.valor === 'R') extras.push('Regular')
    if (f.obs) extras.push(f.obs)
    const x = (v) => ({ content: f.valor === v ? 'X' : '', styles: { halign: 'center', fontStyle: 'bold' } })
    const fila = []
    if (primero) fila.push({ content: f.criterio, rowSpan: span, colSpan: f.sub ? 1 : 2 })
    if (f.sub || !primero) fila.push(f.sub)
    fila.push(x('B'), x('M'), x('N/A'), extras.join(' · '), f.accion)
    cuerpo.push(fila)
  })
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: ESTILO,
    headStyles: { fillColor: GRIS, textColor: 0, fontStyle: 'bold', halign: 'center', lineColor: 0, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 32 }, 2: { cellWidth: 8 }, 3: { cellWidth: 8 }, 4: { cellWidth: 9 }, 6: { cellWidth: 33 } },
    head: [
      [
        { content: 'CRITERIOS', colSpan: 2, rowSpan: 2 },
        { content: 'ESTADO', colSpan: 3 },
        { content: 'OBSERVACIONES', rowSpan: 2 },
        { content: 'ACCIÓN CORRECTIVA (DD/MM/AAAA)', rowSpan: 2 },
      ],
      ['B', 'M', 'N/A'],
    ],
    body: cuerpo,
  })
  y = doc.lastAutoTable.finalY + 2

  // ── ES: Cumplimiento, compromisos y firmas / EN: Compliance, commitments, signatures ─
  const aprobado = row.optimal === true
  const obsFinal = [`Cumplimiento ${row.compliance_pct ?? '—'} %`, row.observations].filter(Boolean).join(' · ')
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: ESTILO,
    headStyles: { fillColor: GRIS, textColor: 0, fontStyle: 'bold', halign: 'center', lineColor: 0, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 88 }, 1: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 9, halign: 'center' }, 3: { cellWidth: 9, halign: 'center' } },
    head: [[{ content: 'CRITERIOS', rowSpan: 2 }, { content: 'CUMPLIMIENTO', colSpan: 3 }, { content: 'OBSERVACIONES', rowSpan: 2 }], ['SI', 'NO', 'N/A']],
    body: [[
      'Luego de verificado todos los ítems anteriores, se determina el cumplimiento y aprobación del vehículo',
      aprobado ? 'X' : '', aprobado ? '' : 'X', '', obsFinal,
    ]],
  })
  y = doc.lastAutoTable.finalY + 2

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: ESTILO,
    body: [
      [{ content: 'COMPROMISOS PENDIENTES DEL CONDUCTOR (aplica para todos los vehículos)', colSpan: 2, styles: { fillColor: GRIS, fontStyle: 'bold' } }],
      [{ content: formato.compromisos || '', colSpan: 2, styles: { minCellHeight: 12 } }],
      [{ content: 'Firmas de Responsables:', colSpan: 2, styles: { fontStyle: 'bold' } }],
      [
        { content: `Conductor: ${row.driver_name || ''}${formato.cedula ? ` · C.C. ${formato.cedula}` : ''}`, styles: { minCellHeight: 24, valign: 'bottom' } },
        { content: `Responsable de la revisión: ${formato.responsable_revision || ''}`, styles: { minCellHeight: 24, valign: 'bottom' } },
      ],
    ],
    didDrawCell: (c) => {
      // ES: Firma dibujada por el conductor en la app. EN: Signature drawn by the driver in the app.
      if (c.section === 'body' && c.row.index === 3 && c.column.index === 0 && row.signature_data) {
        try {
          doc.addImage(row.signature_data, 'PNG', c.cell.x + 4, c.cell.y + 1, 52, 15)
        } catch {
          /* ES: firma ilegible → se omite / EN: unreadable signature → skipped */
        }
      }
    },
  })
  y = doc.lastAutoTable.finalY + 2

  // ── ES: Datos del registro en IncubApp / EN: IncubApp record data ─────────
  const gps = row.lat != null ? `${Number(row.lat).toFixed(5)}, ${Number(row.lng).toFixed(5)}` : 'sin GPS'
  const trayecto = [row.origin, row.destination].some(Boolean) ? `${row.origin || '?'} a ${row.destination || '?'}` : '—'
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(80)
  doc.text(
    doc.splitTextToSize(
      `Registro IncubApp ${row.id || ''} · ${fechaHora(row.inspected_at)} · Vehículo: ${row.vehicle_type || ''} · Trayecto: ${trayecto} · ` +
        `Proceso: ${row.process || '—'} · Ciudad: ${row.city || '—'} · Kilometraje: ${row.odometer || '—'} · GPS: ${gps}`,
      ANCHO_UTIL
    ),
    MARGEN,
    Math.min(y + 3, 262)
  )

  // ── ES: Pie en todas las páginas / EN: Footer on every page ──────────────
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p)
    doc.setFontSize(6.8)
    doc.setTextColor(90)
    doc.text(
      `${(opciones.orgName || 'ANTIOQUEÑA DE INCUBACIÓN S.A.S.').toUpperCase()} · ${FOSST22.codigo} v${FOSST22.version} · Emitido desde IncubApp — la copia impresa es no controlada · Página ${p} de ${total}`,
      ANCHO_HOJA / 2,
      272,
      { align: 'center' }
    )
  }
  return doc
}
