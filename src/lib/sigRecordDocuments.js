/**
 * =============================================================================
 * ARCHIVO: src/lib/sigRecordDocuments.js
 * PROPÓSITO: Formatos SIG diligenciados con lo que ya está registrado en IncubApp
 *   (rondas → FOMAT04, calibraciones → FOMAT08, órdenes de trabajo → FOMAT01 y
 *   registros de producción) y la forma de abrirlos en una pestaña nueva.
 * POR QUÉ ASÍ:
 *   - Cada documento se llena solo con datos de la base. Si un campo no se
 *     registró, dice «No registrado»: un formato con datos supuestos sería una
 *     evidencia falsa en una auditoría del SIG.
 *   - Se muestran en un visor dentro de la app, cargados como Blob y no como URL
 *     data:: Chrome no deja que un enlace navegue a data: en una pestaña (queda en
 *     blanco), que es por lo que los «Ver ↗» de Evidencias en Registros no abrían
 *     nada hasta el 22-09-2026.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { escapeHtml, footerHtml, letterheadCss, letterheadHtml } from './corporateBrand'

const CONDITION_LABEL = { normal: 'Normal', warning: 'Alerta', fault: 'Falla', off: 'Apagada' }
const SCOPE_LABEL = { temperature: 'Temperatura', humidity: 'Humedad relativa', both: 'Temperatura y humedad' }
const REASON_LABEL = { inc_window: 'Ventana de incubación', post_hatch: 'Después del nacimiento', pre_transfer: 'Antes de la transferencia', manual: 'Manual' }
const STATUS_LABEL = { open: 'Abierta', pending: 'Pendiente', in_progress: 'En curso', completed: 'Cerrada', cancelled: 'Cancelada' }
const RECORD_KINDS = new Set(['round', 'calibration', 'work-order', 'production'])

const AUTO_NOTE = 'Formato diligenciado automáticamente con el registro guardado en IncubApp. Lo que no se registró en campo aparece como «No registrado».'

function text(value) {
  return escapeHtml(value == null || value === '' ? 'No registrado' : value)
}

export function formatDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-CO')
}

function fieldsTable(rows) {
  const body = rows.map(([label, value]) => `<tr><th style="width:32%">${escapeHtml(label)}</th><td>${text(value)}</td></tr>`).join('')
  return `<table class="corp-table"><tbody>${body}</tbody></table>`
}

function listTable(headers, rows, empty = 'Sin registros.') {
  if (!rows.length) return `<p class="record-empty">${escapeHtml(empty)}</p>`
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${text(cell)}</td>`).join('')}</tr>`).join('')
  return `<table class="corp-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function photosBlock(photos = []) {
  const valid = photos.filter((photo) => photo?.url)
  if (!valid.length) return ''
  const figures = valid.map((photo) => `<figure><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.label || 'Foto')}"><figcaption>${escapeHtml(photo.label || '')}</figcaption></figure>`).join('')
  return `<h2>Fotos del registro</h2><div class="record-photos">${figures}</div><p class="record-hint">Las fotos se ven mientras su enlace firmado siga vigente (una hora desde que se abrió el Centro SIG).</p>`
}

function documentHtml({ meta, title, body }) {
  const css = `${letterheadCss()} h2{font-size:12px;color:#0b1428;margin:16px 0 4px} .record-note{margin-top:14px;padding:9px;border:1px solid #e0740a;background:#fff8ef;font-size:10.5px} .record-empty,.record-hint{color:#64748b;font-style:italic;font-size:10.5px} .record-photos{display:flex;flex-wrap:wrap;gap:8px} .record-photos figure{margin:0} .record-photos img{max-width:220px;max-height:165px;border:1px solid #cbd5e1} .record-photos figcaption{font-size:10px;color:#475569}`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${letterheadHtml(meta)}${body}<p class="record-note">${escapeHtml(AUTO_NOTE)}</p>${footerHtml({})}</body></html>`
}

const machineLabel = (machine = {}) => [machine.code, machine.name].filter(Boolean).join(' · ')

export function roundRecordHtml(round = {}) {
  const items = round.items || []
  const reports = round.reports || []
  const flagged = items.filter((item) => item.condition === 'warning' || item.condition === 'fault').length
  const body = [
    fieldsTable([
      ['Fecha del turno', round.shiftDate],
      ['Turno', round.shiftCode],
      ['Franja horaria', round.hourSlot],
      ['Equipos inspeccionados', items.length ? String(items.length) : null],
      ['Con alerta o falla', items.length ? String(flagged) : null],
    ]),
    '<h2>Resultado por equipo</h2>',
    listTable(['Equipo', 'Condición', 'Observaciones', 'Hora', 'Registró', 'Foto'], items.map((item) => [
      item.machine?.code || item.machine?.name || item.machine_id,
      CONDITION_LABEL[item.condition] || item.condition,
      item.notes,
      formatDateTime(item.taken_at),
      item.takenByName,
      item.photo_path ? (item.url ? 'Adjunta' : 'Adjunta, no se pudo abrir') : 'Sin foto',
    ]), 'La ronda no tiene equipos reportados.'),
    reports.length ? '<h2>Reportes de la ronda</h2>' : '',
    reports.length ? listTable(['Título', 'Detalle', 'Reportó', 'Hora'], reports.map((report) => [report.title, report.body, report.authorName, formatDateTime(report.created_at)])) : '',
    photosBlock(items.map((item) => ({ url: item.url, label: item.machine?.code || item.machine?.name || 'Equipo' }))),
  ].join('')
  return documentHtml({ meta: { fomatCode: 'FOMAT04' }, title: `FOMAT04 · ${round.file_name || 'Ronda'}`, body })
}

export function calibrationRecordHtml(item = {}) {
  const calibration = item.calibration || {}
  const readings = []
  if (calibration.scope !== 'humidity') readings.push(['Temperatura (°F)', calibration.temp_machine_f, calibration.temp_calibrator_f, calibration.temp_delta_f])
  if (calibration.scope !== 'temperature') readings.push(['Humedad relativa (%)', calibration.rh_machine_pct, calibration.rh_calibrator_pct, calibration.rh_delta_pct])
  const body = [
    fieldsTable([
      ['Equipo', machineLabel(item.machine)],
      ['Fecha y hora', formatDateTime(calibration.calibrated_at || item.created_at)],
      ['Alcance', SCOPE_LABEL[calibration.scope] || calibration.scope],
      ['Motivo', REASON_LABEL[calibration.reason] || calibration.reason],
      ['Orden de trabajo asociada', item.workOrderCode],
      ['Realizó', item.performedByName],
    ]),
    '<h2>Lecturas: pantalla del equipo contra el patrón</h2>',
    listTable(['Variable', 'Pantalla del equipo', 'Calibrador (patrón)', 'Diferencia'], readings.map((row) => row.map((cell) => (cell == null ? null : String(cell))))),
    fieldsTable([['Observaciones', calibration.notes]]),
    photosBlock((item.items || []).map((photo) => ({ url: photo.url, label: photo.file_name }))),
  ].join('')
  return documentHtml({ meta: { fomatCode: 'FOMAT08' }, title: `FOMAT08 · ${item.file_name || 'Calibración'}`, body })
}

export function workOrderRecordHtml(item = {}) {
  const order = item.order || {}
  const files = item.orderFiles || []
  const isImage = (file) => file.file_type === 'image' || /\.(png|jpe?g|webp|gif)$/i.test(file.file_name || '')
  const body = [
    fieldsTable([
      ['Orden de trabajo', order.code || item.workOrderCode],
      ['Título', order.title || item.workOrderTitle],
      ['Equipo', machineLabel(item.orderMachine)],
      ['Estado', STATUS_LABEL[order.status] || order.status],
      ['Prioridad', order.priority],
      ['Creada', formatDateTime(order.created_at)],
      ['Inicio', formatDateTime(order.started_at)],
      ['Cierre', formatDateTime(order.completed_at)],
      ['Solicitó', item.orderPeople?.createdBy],
      ['Responsable', item.orderPeople?.assignedTo || order.technician_name],
      ['Descripción', order.description],
      ['Resolución / cierre', order.resolution],
    ]),
    '<h2>Evidencias adjuntas</h2>',
    listTable(['Archivo', 'Nota', 'Subió', 'Fecha'], files.map((file) => [file.file_name, file.note, file.uploadedByName, formatDateTime(file.created_at)])),
    photosBlock(files.filter(isImage).map((file) => ({ url: file.url, label: file.file_name }))),
  ].join('')
  return documentHtml({ meta: { fomatCode: 'FOMAT01' }, title: `FOMAT01 · ${order.code || item.workOrderCode || 'OT'}`, body })
}

export function productionRecordHtml(item = {}) {
  const body = [
    fieldsTable(item.recordFields || [['Registro', item.note]]),
    photosBlock((item.items || []).map((photo) => ({ url: photo.url, label: photo.file_name }))),
  ].join('')
  return documentHtml({
    // Producción no tiene código de formato propio en el SIG: el membrete lo dice en vez de inventar uno.
    meta: { code: 'Registro operativo', version: '—', date: '—', process: item.recordProcess || 'PRODUCCIÓN · PLANTA DE INCUBACIÓN', title: item.recordTitle || 'REGISTRO DE PRODUCCIÓN' },
    title: item.file_name || 'Registro de producción',
    body,
  })
}

/** Evidencias cuyo formato se arma con los datos del registro (no con un archivo subido). */
export function evidenceHasRecordDocument(item) {
  if (!item || !RECORD_KINDS.has(item.kind)) return false
  if (item.kind === 'calibration') return Boolean(item.calibration)
  if (item.kind === 'work-order') return Boolean(item.order)
  return true
}

export function evidenceRecordHtml(item) {
  if (!evidenceHasRecordDocument(item)) return null
  if (item.kind === 'round') return roundRecordHtml(item)
  if (item.kind === 'calibration') return calibrationRecordHtml(item)
  if (item.kind === 'work-order') return workOrderRecordHtml(item)
  return productionRecordHtml(item)
}

// ── Registros sueltos ───────────────────────────────────────────────────────
// El dossier de la máquina, el feed del líder y las OT de Mantenimiento listan los
// registros uno por uno. Estas funciones los dejan con la misma forma que arma el
// Centro SIG, para que openEvidenceFormat saque el mismo formato desde cualquier lista.

const ACTIVITY_STATUS = { pending: 'Pendiente', assigned: 'Asignada', in_progress: 'En curso', done: 'Terminada', completed: 'Terminada', cancelled: 'Cancelada' }

function shiftCodeOf(value) {
  if (value == null || value === '') return null
  return String(value).startsWith('T') ? String(value) : `T${value}`
}

/** Chequeo de un equipo en una ronda: su línea del FOMAT04. */
export function singleCheckRound({ check = {}, machine = null, takenByName = null, photoUrl = null } = {}) {
  const shiftCode = shiftCodeOf(check.shift_number)
  return {
    id: `check-${check.id}`,
    kind: 'round',
    formatCode: 'FOMAT04',
    file_name: `Ronda ${check.shift_date || 'sin fecha'} · ${shiftCode || 'turno sin registrar'} · ${check.hour_slot || 'franja sin registrar'} · ${machine?.code || machine?.name || 'Equipo'}`,
    created_at: check.taken_at || null,
    shiftDate: check.shift_date || null,
    shiftCode,
    hourSlot: check.hour_slot || null,
    items: [{ ...check, machine, takenByName, url: photoUrl }],
    reports: [],
  }
}

/** Calibración con sus lecturas: FOMAT08. Solo entran las fotos que sí se pudieron abrir. */
export function calibrationRecordItem({ calibration = {}, machine = null, performedByName = null, workOrderCode = null, photos = [] } = {}) {
  return {
    id: `calibration-${calibration.id}`,
    kind: 'calibration',
    formatCode: 'FOMAT08',
    file_name: `Calibración ${machine?.code || machine?.name || 'de máquina'}`,
    created_at: calibration.calibrated_at || null,
    calibration,
    machine,
    performedByName,
    workOrderCode,
    items: photos.filter((photo) => photo?.url),
  }
}

/** Orden de trabajo con sus archivos de evidencia: FOMAT01. */
export function workOrderRecordItem({ order = {}, files = [], machine = null, createdBy = null, assignedTo = null } = {}) {
  return {
    id: `work-order-${order.id}`,
    kind: 'work-order',
    formatCode: 'FOMAT01',
    file_name: `OT ${order.code || 'sin código'}`,
    created_at: order.completed_at || order.created_at || null,
    workOrderCode: order.code || null,
    workOrderTitle: order.title || null,
    order,
    orderFiles: files,
    orderMachine: machine,
    orderPeople: { createdBy, assignedTo: assignedTo || order.technician_name || null },
  }
}

/** Actividad asignada en el turno. No tiene formato propio en el SIG: sale como registro operativo. */
export function shiftActivityRecordItem({ activity = {}, machine = null, people = {}, photoUrl = null } = {}) {
  const name = (userId) => (userId ? people[userId] || 'No registrado' : null)
  return {
    id: `shift-activity-${activity.id}`,
    kind: 'production',
    formatCode: 'REGISTRO · ACTIVIDAD DEL TURNO',
    file_name: `Actividad del turno · ${activity.title || 'sin título'}`,
    created_at: activity.completed_at || activity.started_at || activity.created_at || null,
    recordTitle: 'REGISTRO DE ACTIVIDAD DEL TURNO',
    recordProcess: 'OPERACIÓN DE PLANTA · ACTIVIDADES DEL TURNO',
    recordFields: [
      ['Actividad', activity.title],
      ['Descripción', activity.description],
      ['Equipo', machine ? machineLabel(machine) : null],
      ['Estado', ACTIVITY_STATUS[activity.status] || activity.status],
      ['Asignada a', name(activity.assigned_to)],
      ['Asignó', name(activity.assigned_by)],
      ['Inicio', formatDateTime(activity.started_at)],
      ['Fin', formatDateTime(activity.completed_at)],
      ['Cantidad reportada', activity.result_qty != null ? String(activity.result_qty) : null],
      ['Resultado / observación', activity.result_note || activity.completion],
      ['Foto', activity.photo_path ? (photoUrl ? 'Adjunta' : 'Adjunta, no se pudo abrir') : 'Sin foto'],
    ],
    items: photoUrl ? [{ url: photoUrl, file_name: 'Foto de la actividad' }] : [],
  }
}

/** Hay formato que abrir: armado desde el registro o el archivo diligenciado que se subió. */
export function hasEvidenceFormat(item) {
  return evidenceHasRecordDocument(item) || Boolean(item?.formatUrl || item?.url)
}

export function dataUrlToBlob(url) {
  const comma = url.indexOf(',')
  const meta = url.slice(5, comma)
  const payload = url.slice(comma + 1)
  const type = meta.split(';')[0] || 'text/plain'
  if (/;base64/i.test(meta)) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type })
  }
  return new Blob([decodeURIComponent(payload)], { type: /charset/i.test(meta) ? `${type};charset=utf-8` : type })
}

const VIEWER_ID = 'sig-record-viewer'
const VIEWABLE = /\.(pdf|png|jpe?g|webp|gif|html?)($|[?#])/i

function fileNameFor(title) {
  const base = String(title || 'formato-diligenciado').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${base || 'formato-diligenciado'}.html`
}

// El formato se muestra dentro de la app. Depender de una ventana nueva no sirve: el
// panel de navegador de Claude, varias apps instaladas (PWA) y algunos celulares las
// bloquean, y el clic parecía no hacer nada (22-09-2026). Desde el visor se puede abrir
// en otra pestaña, imprimir o descargar.
function showRecordViewer({ source, temporary, printable, title = 'Formato diligenciado' }) {
  document.getElementById(VIEWER_ID)?.dispatchEvent(new Event('sig-close'))
  const overlay = document.createElement('div')
  overlay.id = VIEWER_ID
  overlay.className = 'sig-record-viewer'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', title)
  const safeTitle = escapeHtml(title)
  const safeSource = escapeHtml(source)
  overlay.innerHTML = `<div class="sig-record-viewer__panel">`
    + `<header class="sig-record-viewer__head"><strong title="${safeTitle}">${safeTitle}</strong><nav>`
    + `<a href="${safeSource}" target="_blank" rel="noopener">Abrir en pestaña nueva ↗</a>`
    + (printable ? '<button type="button" data-action="print">Imprimir</button>' : '')
    + (temporary ? `<a href="${safeSource}" download="${escapeHtml(fileNameFor(title))}">Descargar</a>` : '')
    + '<button type="button" data-action="close" aria-label="Cerrar formato">×</button>'
    + `</nav></header><iframe title="${safeTitle}" src="${safeSource}"></iframe></div>`

  const onKey = (event) => { if (event.key === 'Escape') close() }
  function close() {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
    if (temporary) setTimeout(() => URL.revokeObjectURL(source), 60000)
  }
  overlay.addEventListener('sig-close', close)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) return close()
    const action = event.target.closest?.('[data-action]')?.getAttribute('data-action')
    if (action === 'close') close()
    if (action === 'print') overlay.querySelector('iframe')?.contentWindow?.print()
  })
  document.addEventListener('keydown', onKey)
  document.body.appendChild(overlay)
  overlay.querySelector('[data-action="close"]')?.focus()
  return true
}

export function openRecordDocument({ html, url, title } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (html) {
    const source = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    return showRecordViewer({ source, temporary: true, printable: true, title })
  }
  if (!url) return false
  const target = String(url)
  if (target.startsWith('data:')) {
    const blob = dataUrlToBlob(target)
    return showRecordViewer({ source: URL.createObjectURL(blob), temporary: true, printable: /html/i.test(blob.type), title })
  }
  if (VIEWABLE.test(target)) return showRecordViewer({ source: target, temporary: false, printable: false, title })
  // Word, Excel y demás no se ven en un navegador: se abren aparte y el navegador los descarga.
  const opened = window.open(target, '_blank')
  if (opened) {
    opened.opener = null
    return true
  }
  const link = document.createElement('a')
  link.href = target
  link.rel = 'noopener'
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
  return true
}

export function openEvidenceFormat(item) {
  const title = [item?.formatCode, item?.file_name].filter(Boolean).join(' · ') || 'Formato diligenciado'
  const html = evidenceRecordHtml(item)
  return html ? openRecordDocument({ html, title }) : openRecordDocument({ url: item?.formatUrl || item?.url, title })
}
