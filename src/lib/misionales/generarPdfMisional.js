/**
 * Misionales · PDF igual al de la ventana original (repo_misionales):
 *  - generarPdfMisional: una inspección (pdf_template.html, FO-SST-063 v01).
 *  - generarPdfConsolidado: ciclo de 15 inspecciones (pdf_template_multiple.html).
 * Hoja carta, jsPDF + autotable. 06-10-2026.
 */
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { SIG_LOGO_DATA_URI } from '../sigLogo'
import { FORMATO_MISIONAL, VEHICLE_TYPES, aspectosForTipo, valoresForTipo, calcularPorcentaje } from '../misionalesCatalog'
import { cargaTexto } from './registro'

const ANCHO = 215.9
const MARGEN = 12
const ESTILO = { font: 'helvetica', fontSize: 7.6, textColor: [26, 21, 16], lineColor: [180, 170, 160], lineWidth: 0.2, cellPadding: 1.3, valign: 'middle' }
const AMBAR = [245, 156, 0]
const CABECERA = [250, 240, 222]
const VERDE = [40, 160, 100]
const NARANJA = [235, 102, 8]

const NOTA_SEGURIDAD =
  'Inspeccione todos los elementos que apliquen antes de iniciar la operación. Si identifica una condición insegura, detenga la operación, registre el hallazgo, adjunte evidencia cuando corresponda y notifíquelo al jefe inmediato o al responsable de mantenimiento.'

/** dd/mm/aaaa de Bogotá; una fecha sola AAAA-MM-DD no se corre de día */
export function fechaCO(valor) {
  if (!valor) return '—'
  const solo = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor))
  if (solo) return `${solo[3]}/${solo[2]}/${solo[1]}`
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return String(valor)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
}

function horaCO(valor) {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota' })
}

const t = (v) => (v == null || v === '' ? '—' : String(v))
const tituloTipo = (tipo) => VEHICLE_TYPES.find((v) => v.id === tipo)?.titulo || 'Inspección Preoperacional'
/** Mete una imagen en una caja respetando su proporción (centrada) */
function imagenEnCaja(doc, src, x, y, w, h, formato = 'PNG') {
  const p = doc.getImageProperties(src)
  const k = Math.min(w / p.width, h / p.height)
  const iw = p.width * k
  const ih = p.height * k
  doc.addImage(src, formato, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}

const valorDe = (a) => (a && typeof a === 'object' ? a.valor : a) || ''

/** Lista de aspectos de la fila: la guardada en cada aspecto o la del tipo */
function listaDe(row) {
  const asp = row.aspects || {}
  const base = aspectosForTipo(row.vehicle_type)
  const n = Math.max(base.length, ...Object.keys(asp).map(Number).filter(Number.isFinite), 0)
  return Array.from({ length: n }, (_, i) => asp[String(i + 1)]?.label || base[i] || `Aspecto ${i + 1}`)
}

// La letra helvetica del PDF no trae «✓»: se marca con «X» en la columna del valor.
const COLOR_VALOR = { B: VERDE, R: [217, 164, 0], M: NARANJA, 'N/A': [110, 110, 110] }
function marca(v) {
  return v in COLOR_VALOR ? { content: 'X', color: COLOR_VALOR[v] } : { content: '', color: [0, 0, 0] }
}

/** Encabezado con logo, título y control de documento */
function encabezado(doc, titulo, subtitulo, control) {
  autoTable(doc, {
    startY: MARGEN,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, fontSize: 8 },
    body: control.map((c, i) => [
      ...(i === 0
        ? [
            { content: '', rowSpan: control.length, styles: { cellWidth: 40, minCellHeight: 18 } },
            {
              content: `${titulo.toUpperCase()}\n${subtitulo}`,
              rowSpan: control.length,
              styles: { halign: 'center', fontStyle: 'bold', fontSize: 11, textColor: [180, 90, 0] },
            },
          ]
        : []),
      { content: c[0], styles: { cellWidth: 24, fontStyle: 'bold', fillColor: CABECERA } },
      { content: c[1], styles: { cellWidth: 28 } },
    ]),
    didParseCell: (c) => {
      // Subtítulo en letra normal más pequeña
      if (c.section === 'body' && c.column.index === 1 && c.row.index === 0) c.cell.styles.fontSize = 10
    },
    didDrawCell: (c) => {
      if (c.section === 'body' && c.row.index === 0 && c.column.index === 0) {
        try {
          doc.addImage(SIG_LOGO_DATA_URI, 'PNG', c.cell.x + 2, c.cell.y + 3, 36, (36 * 107) / 278)
        } catch {
          /* sin logo */
        }
      }
    },
  })
  // Línea de marca bajo el encabezado
  const y = doc.lastAutoTable.finalY + 1
  doc.setFillColor(...AMBAR)
  doc.rect(MARGEN, y, ANCHO - MARGEN * 2, 0.8, 'F')
  return y + 3
}

function seccion(doc, y, texto) {
  if (y > 255) {
    doc.addPage()
    y = MARGEN
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(180, 90, 0)
  doc.text(texto, MARGEN, y + 3.5)
  doc.setTextColor(0, 0, 0)
  return y + 5.5
}

function tablaDatos(doc, y, filas) {
  const th = (s) => ({ content: s, styles: { fontStyle: 'bold', fillColor: CABECERA } })
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: ESTILO,
    columnStyles: { 0: { cellWidth: 34 }, 2: { cellWidth: 34 } },
    body: filas.map((f) =>
      f.length === 2 ? [th(f[0]), { content: t(f[1]), colSpan: 3 }] : [th(f[0]), t(f[1]), th(f[2]), t(f[3])]
    ),
  })
  return doc.lastAutoTable.finalY + 3
}

/**
 * PDF de una inspección, como pdf_template.html del original.
 * @param {object} row fila de mission_inspections
 * @param {{ evidenciasImgs?: Record<string,string> }} [opc] fotos (dataURL) por número de aspecto
 */
export function generarPdfMisional(row, opc = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' })
  const fx = row.formato || {}
  const tipo = row.vehicle_type || 'Moto'
  const camion = tipo === 'Camion'
  const pct = row.compliance_pct ?? calcularPorcentaje(row.aspects)
  let y = encabezado(doc, tituloTipo(tipo), 'Seguridad y Salud en el Trabajo - Verificación antes de iniciar la operación', [
    ['Código', FORMATO_MISIONAL.codigo],
    ['Versión', FORMATO_MISIONAL.version],
    ['Fecha', fechaCO(row.inspected_at)],
  ])

  // Línea de estado
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, halign: 'center', fontSize: 8 },
    head: [['Tipo', 'Hora', 'Placa', 'Estado del vehículo']],
    headStyles: { fillColor: CABECERA, textColor: [92, 80, 68], fontStyle: 'bold' },
    body: [[tipo, horaCO(row.inspected_at), t(row.plate), `${pct}%`]],
  })
  y = doc.lastAutoTable.finalY + 3

  y = seccion(doc, y, '1. Información general')
  const gps =
    row.lat != null && row.lng != null
      ? `${Number(row.lat).toFixed(6)}, ${Number(row.lng).toFixed(6)}${row.gps_accuracy ? ` (±${Math.round(row.gps_accuracy)} m)` : ''}`
      : '—'
  y = tablaDatos(doc, y, [
    ['Conductor', row.driver_name, 'Placa', row.plate],
    ...(camion
      ? [
          ['Empresa', fx.empresa, 'Ciudad', row.city],
          ['Kilometraje', row.odometer, 'N.º interno', row.internal_number],
          ['Tipo de carga', cargaTexto(fx), 'Lugar de diligenciamiento', fx.ubicacion],
        ]
      : []),
    ['Proceso', row.process, 'Ruta', `${t(row.origin)} - ${t(row.destination)}`],
    ['Marca / Línea', [row.brand, row.line].filter(Boolean).join(' / '), 'Modelo / Motor', [row.model, row.engine].filter(Boolean).join(' / ')],
    ['Combustible / Nivel', row.fuel, 'Ubicación GPS', gps],
  ])

  y = seccion(doc, y, '2. Revisión de documentos')
  y = tablaDatos(doc, y, [
    ['Licencia N.º', [row.license_num, fx.licencia_categoria && `Cat. ${fx.licencia_categoria}`].filter(Boolean).join(' · '), 'Vencimiento', fechaCO(row.license_exp)],
    ['Tarjeta de propiedad', row.property_card, 'SOAT', [row.soat, fx.soat_venc && `vence ${fechaCO(fx.soat_venc)}`].filter(Boolean).join(' · ')],
    [
      'Emisión / Tecnomecánica',
      [row.gas_cert, fx.tecnomecanica_venc && `vence ${fechaCO(fx.tecnomecanica_venc)}`].filter(Boolean).join(' · '),
      'Póliza',
      [row.insurance, fx.poliza_numero && `N.º ${fx.poliza_numero}`, fx.poliza_seguro_venc && `vence ${fechaCO(fx.poliza_seguro_venc)}`]
        .filter(Boolean)
        .join(' · '),
    ],
  ])

  let n = 3
  if (camion && fx.mantenimiento) {
    y = seccion(doc, y, `${n}. Historial de mantenimiento`)
    const mt = fx.mantenimiento
    y = tablaDatos(doc, y, [
      ['Último cambio de aceite', fechaCO(mt.ultimo_cambio_aceite), 'Última sincronización', fechaCO(mt.ultima_sincronizacion)],
      ['Última alineación y balanceo', fechaCO(mt.ultima_alineacion_balanceo), 'Último cambio de llantas', fechaCO(mt.ultimo_cambio_llantas)],
    ])
    n += 1
  }

  // Aspectos con columnas B / R / M / N/A
  const lista = listaDe(row)
  const valores = valoresForTipo(tipo).includes('N/A') ? valoresForTipo(tipo) : [...valoresForTipo(tipo), 'N/A']
  const evid = fx.evidencias || {}
  y = seccion(doc, y, `${n}. Aspectos a revisar (${lista.length})`)
  n += 1
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, fontSize: 7.2, cellPadding: 1 },
    headStyles: { fillColor: CABECERA, textColor: [92, 80, 68], fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, ...Object.fromEntries(valores.map((_, i) => [i + 2, { cellWidth: 10, halign: 'center' }])) },
    head: [['N.º', 'Aspecto / criterio', ...valores]],
    body: lista.map((label, i) => {
      const k = String(i + 1)
      const v = valorDe(row.aspects?.[k])
      return [
        k,
        `${label}${evid[k] ? '   [Evidencia]' : ''}`,
        ...valores.map((col) => {
          const mk = v === col ? marca(col) : { content: '', color: [0, 0, 0] }
          return { content: mk.content, styles: { textColor: mk.color, fontStyle: 'bold' } }
        }),
      ]
    }),
  })
  y = doc.lastAutoTable.finalY + 3

  // Resumen
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, fontSize: 8.5, halign: 'center' },
    headStyles: { fillColor: CABECERA, textColor: [92, 80, 68], fontStyle: 'bold' },
    head: [['Porcentaje de cumplimiento', 'Condiciones óptimas para operación']],
    body: [
      [
        `${pct}%   (B = 100${valores.includes('R') ? ' | R = 50' : ''} | M = 0 | N/A no puntúa)`,
        { content: row.optimal ? 'SÍ' : 'NO', styles: { fontStyle: 'bold', textColor: row.optimal ? VERDE : NARANJA } },
      ],
    ],
  })
  y = doc.lastAutoTable.finalY + 3

  y = seccion(doc, y, `${n}. Observaciones`)
  n += 1
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, minCellHeight: 12, valign: 'top' },
    body: [[row.observations || 'Sin observaciones.']],
  })
  y = doc.lastAutoTable.finalY + 4

  // Firma + nota de seguridad
  if (y > 230) {
    doc.addPage()
    y = MARGEN
  }
  const anchoCol = (ANCHO - MARGEN * 2 - 6) / 2
  doc.setDrawColor(180, 170, 160)
  doc.rect(MARGEN, y, anchoCol, 34)
  if (row.signature_data) {
    try {
      imagenEnCaja(doc, row.signature_data, MARGEN + 8, y + 2, anchoCol - 16, 20)
    } catch {
      /* firma ilegible */
    }
  } else {
    doc.setFontSize(8)
    doc.text('(sin firma)', MARGEN + anchoCol / 2, y + 13, { align: 'center' })
  }
  doc.line(MARGEN + 6, y + 24, MARGEN + anchoCol - 6, y + 24)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('Firma del conductor', MARGEN + anchoCol / 2, y + 28, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text(t(row.driver_name), MARGEN + anchoCol / 2, y + 31.5, { align: 'center' })
  const xN = MARGEN + anchoCol + 6
  doc.setFillColor(255, 248, 235)
  doc.rect(xN, y, anchoCol, 34, 'FD')
  doc.setFontSize(7.5)
  doc.text('Nota de seguridad:', xN + 3, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(NOTA_SEGURIDAD, anchoCol - 6), xN + 3, y + 9)
  y += 40

  // Evidencias fotográficas
  const imgs = Object.entries(opc.evidenciasImgs || {}).filter(([, src]) => src)
  if (imgs.length) {
    if (y > 200) {
      doc.addPage()
      y = MARGEN
    }
    y = seccion(doc, y, `${n}. Evidencias fotográficas`)
    const w = (ANCHO - MARGEN * 2 - 8) / 3
    imgs.forEach(([num, src], i) => {
      const col = i % 3
      if (col === 0 && i > 0) y += w * 0.75 + 9
      if (y + w * 0.75 > 265) {
        doc.addPage()
        y = MARGEN
      }
      const x = MARGEN + col * (w + 4)
      try {
        imagenEnCaja(doc, src, x, y, w, w * 0.75, 'JPEG')
      } catch {
        doc.rect(x, y, w, w * 0.75)
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.text(doc.splitTextToSize(`#${num} ${lista[Number(num) - 1] || ''}`, w), x, y + w * 0.75 + 3)
    })
  }
  return doc
}

/**
 * PDF consolidado de un ciclo (hasta 15 inspecciones del mismo conductor).
 * @param {object[]} filas inspecciones del ciclo (de la más vieja a la más nueva)
 * @param {{ fecha?: string }} [opc]
 */
export function generarPdfConsolidado(filas, opc = {}) {
  const regs = [...filas].sort((a, b) => String(a.inspected_at).localeCompare(String(b.inspected_at)))
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' })
  const primero = regs[0] || {}
  const tipo = primero.vehicle_type || '—'
  const desde = fechaCO(primero.inspected_at)
  const hasta = fechaCO(regs[regs.length - 1]?.inspected_at)
  const anchoHoja = 279.4
  // Encabezado (hoja horizontal)
  autoTable(doc, {
    startY: MARGEN,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, fontSize: 8 },
    body: [
      ['Código', FORMATO_MISIONAL.codigo],
      ['Versión', FORMATO_MISIONAL.version],
      ['Fecha reporte', opc.fecha || fechaCO(new Date().toISOString())],
      ['Inspecciones', `${regs.length}/15`],
    ].map((c, i) => [
      ...(i === 0
        ? [
            { content: '', rowSpan: 4, styles: { cellWidth: 44, minCellHeight: 18 } },
            {
              content: 'INSPECCIONES PREOPERACIONALES\nReporte consolidado - ciclo de hasta 15 inspecciones',
              rowSpan: 4,
              styles: { halign: 'center', fontStyle: 'bold', fontSize: 11, textColor: [180, 90, 0] },
            },
          ]
        : []),
      { content: c[0], styles: { cellWidth: 28, fontStyle: 'bold', fillColor: CABECERA } },
      { content: c[1], styles: { cellWidth: 30 } },
    ]),
    didDrawCell: (c) => {
      if (c.section === 'body' && c.row.index === 0 && c.column.index === 0) {
        try {
          doc.addImage(SIG_LOGO_DATA_URI, 'PNG', c.cell.x + 2, c.cell.y + 3, 40, (40 * 107) / 278)
        } catch {
          /* sin logo */
        }
      }
    },
  })
  let y = doc.lastAutoTable.finalY + 1
  doc.setFillColor(...AMBAR)
  doc.rect(MARGEN, y, anchoHoja - MARGEN * 2, 0.8, 'F')
  y += 3
  y = seccion(doc, y, '1. Identificación del ciclo')
  const th = (s) => ({ content: s, styles: { fontStyle: 'bold', fillColor: CABECERA } })
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: ESTILO,
    body: [
      [th('Conductor'), t(primero.driver_name), th('Placa'), t(primero.plate), th('Tipo'), t(tipo), th('Proceso'), t(primero.process)],
      [
        th('Marca / Línea'),
        [primero.brand, primero.line].filter(Boolean).join(' / ') || '—',
        th('Modelo'),
        t(primero.model),
        th('Período'),
        `${desde} - ${hasta}`,
        th('Último km'),
        tipo === 'Camion' ? t(regs[regs.length - 1]?.odometer) : '—',
      ],
    ],
  })
  y = doc.lastAutoTable.finalY + 3

  y = seccion(doc, y, '2. Matriz consolidada')
  const lista = listaDe(primero)
  const cols = Array.from({ length: 15 }, (_, i) => regs[i])
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, fontSize: 6.4, cellPadding: 0.7 },
    headStyles: { fillColor: CABECERA, textColor: [92, 80, 68], fontStyle: 'bold', halign: 'center', fontSize: 6 },
    columnStyles: {
      ...Object.fromEntries(cols.map((_, i) => [i + 1, { cellWidth: 9.5, halign: 'center' }])),
      16: { cellWidth: 13, halign: 'center' },
    },
    head: [['Aspecto a revisar', ...cols.map((r, i) => (r ? `${i + 1}\n${fechaCO(r.inspected_at).slice(0, 5)}` : `${i + 1}`)), 'Hallazgos']],
    body: [
      ...lista.map((label, i) => {
        const k = String(i + 1)
        let hall = 0
        const celdas = cols.map((r) => {
          if (!r) return ''
          const v = valorDe(r.aspects?.[k])
          if (v === 'M' || v === 'R') hall += 1
          const mk = marca(v)
          return { content: v || '', styles: { textColor: mk.color, fontStyle: 'bold' } }
        })
        return [label, ...celdas, hall ? String(hall) : '—']
      }),
      [
        { content: 'Condiciones óptimas para operación', styles: { fontStyle: 'bold' } },
        ...cols.map((r) =>
          r ? { content: r.optimal ? 'SÍ' : 'NO', styles: { fontStyle: 'bold', textColor: r.optimal ? VERDE : NARANJA } } : ''
        ),
        '',
      ],
    ],
  })
  y = doc.lastAutoTable.finalY + 3

  const conPct = regs.filter((r) => r.compliance_pct != null)
  const prom = conPct.length ? Math.round(conPct.reduce((s, r) => s + Number(r.compliance_pct), 0) / conPct.length) : null
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN },
    theme: 'grid',
    styles: { ...ESTILO, halign: 'center', fontSize: 8 },
    headStyles: { fillColor: CABECERA, textColor: [92, 80, 68], fontStyle: 'bold' },
    head: [['Inspecciones', 'Cumplimiento promedio', 'No óptimas', 'Período', 'Convenciones']],
    body: [[`${regs.length}/15`, prom == null ? '—' : `${prom}%`, String(regs.filter((r) => !r.optimal).length), `${desde} - ${hasta}`, 'B · R · M · N/A']],
  })
  y = doc.lastAutoTable.finalY + 4

  // Firma más reciente del ciclo
  const conFirma = [...regs].reverse().find((r) => r.signature_data)
  if (y > 170) {
    doc.addPage()
    y = MARGEN
  }
  doc.setDrawColor(180, 170, 160)
  doc.rect(MARGEN, y, 90, 30)
  if (conFirma) {
    try {
      imagenEnCaja(doc, conFirma.signature_data, MARGEN + 8, y + 2, 74, 17)
    } catch {
      /* firma ilegible */
    }
  }
  doc.line(MARGEN + 6, y + 21, MARGEN + 84, y + 21)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Firma del conductor', MARGEN + 45, y + 25, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text(t(primero.driver_name), MARGEN + 45, y + 28.5, { align: 'center' })
  return doc
}
