import { escapeHtml, footerHtml, letterheadCss, letterheadHtml } from './corporateBrand'

const MAINTENANCE_RESPONSIBLE = 'Henry Camilo Taborda Galeano'

function value(value) {
    return escapeHtml(value == null || value === '' ? 'No registrado' : value)
}

export function buildMaintenanceRecordHtml({ machineCode, activity, description, feedback, date, code, status = 'Registrada', technician, approver, origin }) {
    const rows = [
        ['Fecha de ejecución', date || 'Histórico Mantum'],
        ['Equipo / código', machineCode || 'No registrado'],
        ['Orden de trabajo', code || 'Registro histórico Mantum'],
        ['Actividad realizada', activity || 'No registrada'],
        ['Descripción / indicaciones Mantum', description || activity || 'No registrada'],
        // Sin rellenos: un «actividad registrada» por defecto parecería un cierre que nadie escribió.
        ['Comentarios y resultado', feedback || 'No registrado'],
        ['Estado', status],
        ['Técnico que ejecutó', technician || 'No registrado'],
        ['Aprobó', approver || 'No registrado'],
    ]
    const table = rows.map(([label, content]) => `<tr><th>${value(label)}</th><td>${value(content)}</td></tr>`).join('')
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>FOMAT01 ${value(code)}</title><style>${letterheadCss()} .record-table{width:100%;border-collapse:collapse;margin-top:16px;font-family:Arial,sans-serif;font-size:11px}.record-table th,.record-table td{border:1px solid #b8c3d0;padding:8px;text-align:left;vertical-align:top}.record-table th{width:29%;background:#f3f6fa;color:#0b1428}.record-note{margin-top:16px;padding:10px;border:1px solid #e0740a;background:#fff8ef;font-size:11px}</style></head><body>${letterheadHtml({ fomatCode: 'FOMAT01', title: 'ORDEN DE TRABAJO DE MANTENIMIENTO · REGISTRO HISTÓRICO', process: 'GESTIÓN DE MANTENIMIENTO' })}<table class="record-table"><tbody>${table}</tbody></table><p class="record-note">${value(origin || 'Registro reconstruido desde la actividad histórica de Mántum.')} Responsable actual del proceso de mantenimiento: ${MAINTENANCE_RESPONSIBLE}.</p>${footerHtml({})}</body></html>`
}

export function maintenanceRecordUrl(data) {
    return `data:text/html;charset=utf-8,${encodeURIComponent(buildMaintenanceRecordHtml(data))}`
}
