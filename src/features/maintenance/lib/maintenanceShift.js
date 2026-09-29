/**
 * Turno del auxiliar de mantenimiento: qué le toca del Plan AM esta semana,
 * qué formato llena cada trabajo y cómo queda registrado.
 *
 * Todo trabajo (del plan o reportado en el turno) queda como una OT cerrada en
 * work_orders, con sus fotos en wo_evidence. De ahí sale su formato del SIG:
 *   FOMAT01 Orden de trabajo · FOMAT04 Lista de chequeo de inspección.
 * Las calibraciones van al módulo de calibración, que llena el FOMAT08.
 * La OT lleva el código de la tarea (PI-001…) para que el cumplimiento del plan
 * (lib/planCompliance) la cuente en su semana.
 *
 * Henry Stark Desarrollador
 */
import { resolveMantumKeys } from '../../../data/mantumCatalog'
import { activityFamilies, equipmentCodesOfTask, isoWeekOf, subjectsOf } from '../../../lib/planCompliance'
import { SIG_FORMATS } from '../../../lib/corporateBrand'
import { shiftBounds } from '../../../lib/shiftPunctuality'

export const SPECIALTIES = ['Mecánica', 'Eléctrica', 'Control', 'General']

/** Especialidad del auxiliar que ejecuta la tarea, según el responsable del plan. */
export function taskSpecialty(task = {}) {
  const r = String(task.responsible || '')
  if (/mec[aá]nica/i.test(r)) return 'Mecánica'
  if (/el[eé]ctric/i.test(r)) return 'Eléctrica'
  if (/control|electr[oó]nic/i.test(r)) return 'Control'
  return 'General'
}

/** Tareas del plan que ejecuta mantenimiento (no el laboratorio, el proveedor ni el galponero). */
export function isAuxTask(task = {}) {
  const r = String(task.responsible || '')
  if (/laboratorio|proveedor|galponero/i.test(r)) return false
  return /mantenimiento|mant\.|t[eé]c\./i.test(r)
}

const INSPECTION_TEXT = /revis|inspecc|verific|chequeo|controle|aseg[uú]rese|probar|comprob/i

/**
 * Formato que llena la tarea al ejecutarse.
 * @returns {{ code: 'FOMAT01'|'FOMAT04'|'FOMAT08', name: string, woType: string, goTo?: string }}
 */
export function formatForTask(task = {}) {
  const text = `${task.description || ''} ${task.type || ''}`
  if (/calibr/i.test(text)) {
    return { code: 'FOMAT08', name: SIG_FORMATS.FOMAT08.name, woType: 'preventive', goTo: 'calibracion' }
  }
  if (/ronda/i.test(task.evidenceFormat || '') || INSPECTION_TEXT.test(task.description || '')) {
    return { code: 'FOMAT04', name: SIG_FORMATS.FOMAT04.name, woType: 'inspection' }
  }
  return { code: 'FOMAT01', name: SIG_FORMATS.FOMAT01.name, woType: 'preventive' }
}

/** Formato de una OT ya guardada: el que quedó anotado o el que se deduce de su tipo. */
export function formatOfOrder(order = {}) {
  if (order.format_code) return order.format_code
  if (order.type === 'inspection' && Array.isArray(order.checklist) && order.checklist.length) return 'FOMAT04'
  return 'FOMAT01'
}

const FAMILY_ITEMS = {
  limpieza: 'Limpieza y desinfección del equipo o del área',
  lubricacion: 'Puntos lubricados con el lubricante indicado',
  ajuste: 'Ajuste y apriete verificados (pernos, tornillos, conexiones)',
  cambio: 'Repuesto o componente cambiado (anotar referencia)',
  medicion: 'Mediciones tomadas y anotadas en observaciones',
  prueba: 'Prueba de funcionamiento realizada',
  inspeccion: 'Sin daños, fugas, ruidos ni vibraciones anormales',
}
const SUBJECT_ITEMS = {
  electrico: 'Conexiones eléctricas firmes, sin recalentamiento ni cables dañados',
  motor: 'Motor y transmisión sin ruido, calentamiento ni desgaste anormal',
  agua: 'Sin fugas de agua; niveles y presión normales',
  aire: 'Filtros y ductos limpios, flujo de aire normal',
}

/**
 * Lista de chequeo de la tarea: la actividad del plan, lo propio de su tipo y
 * el cierre (funcionamiento y bioseguridad). Cada punto: OK / No OK / No aplica.
 */
export function checklistForTask(task = {}) {
  const text = `${task.description || ''} ${task.equipmentClass || ''}`
  const items = [{ id: 'actividad', label: task.description || 'Actividad del plan AM' }]
  const seen = new Set()
  for (const fam of activityFamilies(task.description || '')) {
    if (FAMILY_ITEMS[fam] && !seen.has(FAMILY_ITEMS[fam])) {
      seen.add(FAMILY_ITEMS[fam])
      items.push({ id: fam, label: FAMILY_ITEMS[fam] })
    }
  }
  for (const subj of subjectsOf(text)) {
    if (SUBJECT_ITEMS[subj] && !seen.has(SUBJECT_ITEMS[subj])) {
      seen.add(SUBJECT_ITEMS[subj])
      items.push({ id: subj, label: SUBJECT_ITEMS[subj] })
    }
  }
  items.push({ id: 'funcionamiento', label: 'Funcionamiento verificado después de la intervención' })
  items.push({ id: 'bioseguridad', label: 'Área limpia y en condiciones de bioseguridad' })
  return items.map((it) => ({ ...it, result: null, note: '' }))
}

/** Lista de chequeo para un trabajo reportado en el turno (sin tarea del plan). */
export function checklistForReport() {
  return [
    { id: 'funcionamiento', label: 'Funcionamiento verificado después de la intervención', result: null, note: '' },
    { id: 'bioseguridad', label: 'Área limpia y en condiciones de bioseguridad', result: null, note: '' },
  ]
}

export const RESULT_LABEL = { ok: 'OK', fail: 'No OK', na: 'No aplica' }

export function checklistSummary(checklist = []) {
  const s = { ok: 0, fail: 0, na: 0, pending: 0, total: checklist.length }
  for (const it of checklist) {
    if (it.result === 'ok') s.ok += 1
    else if (it.result === 'fail') s.fail += 1
    else if (it.result === 'na') s.na += 1
    else s.pending += 1
  }
  return s
}

/** El texto del chequeo, para la resolución de la OT (queda aunque falte la columna checklist). */
export function checklistText(checklist = []) {
  return checklist
    .filter((it) => it.result)
    .map((it) => `${it.result === 'ok' ? '[OK]' : it.result === 'fail' ? '[NO OK]' : '[N/A]'} ${it.label}${it.note ? `: ${it.note}` : ''}`)
    .join('\n')
}

/* ── Plan AM de la semana ─────────────────────────────────────────────── */

/** Ventana del cronograma abierta hoy (la tarea se puede cumplir hasta la siguiente semana programada). */
export function currentOccurrence(row, now = new Date()) {
  return (row?.occurrences || []).find((o) => o.status !== 'upcoming' && o.start <= now && now < o.end) || null
}

/**
 * Trabajo del plan para el auxiliar: una entrada por tarea con ventana abierta.
 * @param {object[]} rows salida de computePlanCompliance(...).rows
 * @returns {Array<{ task, occurrence, done, overdue, specialty, format, week }>}
 *   Pendientes primero (atrasadas, críticas, luego por sistema); las cumplidas al final.
 */
export function planWorkForAux(rows = [], { now = new Date(), specialty = null, sede = null } = {}) {
  const thisWeek = isoWeekOf(now).week
  const out = []
  for (const row of rows) {
    const task = row.task
    if (!isAuxTask(task)) continue
    if (sede && task.sede !== sede) continue
    const sp = taskSpecialty(task)
    if (specialty && sp !== specialty) continue
    const occ = currentOccurrence(row, now)
    if (!occ) continue
    const done = occ.status === 'done'
    out.push({
      task,
      occurrence: occ,
      done,
      partial: occ.status === 'partial',
      thisWeek: occ.week === thisWeek,
      overdue: !done && occ.week < thisWeek,
      weeksLate: !done ? Math.max(0, thisWeek - occ.week) : 0,
      specialty: sp,
      format: formatForTask(task),
      week: occ.week,
    })
  }
  const critical = (t) => (t.isCriticalSecurity || t.isBiosecurity ? 0 : 1)
  return out.sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      Number(b.overdue) - Number(a.overdue) ||
      critical(a.task) - critical(b.task) ||
      String(a.task.system || '').localeCompare(String(b.task.system || '')) ||
      String(a.task.code || '').localeCompare(String(b.task.code || ''))
  )
}

/** «REVISIÓN PERIÓDICA» → «Revisión periódica» (el plan viene de Mántum en mayúsculas). */
export function readableText(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ')
  if (!t || /[a-záéíóúñ]/.test(t)) return t
  const lower = t.toLocaleLowerCase('es')
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1)
}

/** Máquinas de la app que corresponden a los equipos de la tarea (por claves Mántum). */
export function machinesForTask(task = {}, machines = []) {
  const codes = new Set(equipmentCodesOfTask(task))
  if (!codes.size) return []
  return machines.filter((m) => resolveMantumKeys(m).some((k) => codes.has(k)))
}

/* ── Turno ────────────────────────────────────────────────────────────── */

const bogotaParts = (d) => {
  const date = new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const hour = Number(new Date(d).toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false })) % 24
  return { date, hour }
}

/** Turno en curso (hora de Colombia): { shiftNumber, date, start, end }. El T3 de madrugada es del día anterior. */
export function shiftWindowAt(now = new Date()) {
  const { date, hour } = bogotaParts(now)
  const shiftNumber = hour >= 6 && hour < 14 ? 1 : hour >= 14 && hour < 22 ? 2 : 3
  let workDate = date
  if (shiftNumber === 3 && hour < 6) {
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    workDate = d.toISOString().slice(0, 10)
  }
  return { shiftNumber, date: workDate, ...shiftBounds(workDate, shiftNumber) }
}

/** OT que la persona cerró dentro del turno. */
export function ordersInShift(orders = [], userId, window) {
  if (!window) return []
  return orders
    .filter((o) => o.status === 'completed' && o.completed_at)
    .filter((o) => o.assigned_to === userId || (!o.assigned_to && o.created_by === userId))
    .filter((o) => {
      const t = new Date(o.completed_at)
      return t >= window.start && t < window.end
    })
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
}

/* ── OT del trabajo ───────────────────────────────────────────────────── */

const clean = (s) => String(s ?? '').trim()
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function baseOrder({ id, orgId, userId, userName, machine, plantId, startedAt, completedAt, downtimeMinutes, notes, checklist, now }) {
  const bogotaDate = new Date(completedAt || now).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const summary = checklistText(checklist)
  return {
    id,
    org_id: orgId,
    plant_id: machine?.plant_id || plantId || null,
    machine_id: machine?.id || null,
    location_type: 'plant',
    priority: 'medium',
    status: 'completed',
    assigned_to: userId,
    created_by: userId,
    started_at: startedAt ? new Date(startedAt).toISOString() : null,
    completed_at: new Date(completedAt || now).toISOString(),
    downtime_minutes: downtimeMinutes === '' || downtimeMinutes == null ? 0 : Math.max(0, Number(downtimeMinutes) || 0),
    resolution: [clean(notes), summary].filter(Boolean).join('\n\n') || null,
    // Columnas que pueden no existir en todas las instalaciones (se descartan si faltan):
    technician_name: userName || null,
    operational_date: bogotaDate,
    checklist: checklist.length ? checklist : null,
  }
}

/**
 * OT cerrada por la ejecución de una tarea del Plan AM.
 * El título empieza con el código de la tarea: así el cumplimiento del plan la
 * encuentra aunque falte la columna maintenance_plan_code.
 */
export function buildPlanOrderRow({ task, machine = null, checklist = [], notes = '', downtimeMinutes = 0, startedAt = null, completedAt = null, id, orgId, userId, userName, plantId = null, now = new Date() }) {
  const fmt = formatForTask(task)
  const equipos = machine ? [machine.code, machine.name].filter(Boolean).join(' · ') : clean(task.applyingEquipment)
  return {
    ...baseOrder({ id, orgId, userId, userName, machine, plantId, startedAt, completedAt, downtimeMinutes, notes, checklist, now }),
    location_type: task.sede && !/PLANTA/i.test(task.sede) ? 'farm' : 'plant',
    location_name: task.sede && !/PLANTA/i.test(task.sede) ? task.sede : null,
    title: cut(`${task.code} · ${clean(task.description)}`, 160),
    description: [
      `Plan AM ${task.code} · ${fmt.code} ${fmt.name}`,
      [task.system, task.equipmentClass].filter(Boolean).join(' · '),
      equipos ? `Equipo(s): ${equipos}` : null,
      task.frequency ? `Frecuencia: ${task.frequency}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    type: fmt.woType,
    source: 'plan_am',
    maintenance_plan_code: task.code,
    format_code: fmt.code,
  }
}

export const REPORT_KINDS = [
  { value: 'corrective', label: 'Correctivo (reparé una falla)', format: 'FOMAT01' },
  { value: 'preventive', label: 'Preventivo fuera del plan', format: 'FOMAT01' },
  { value: 'inspection', label: 'Inspección / revisión', format: 'FOMAT04' },
]

/** OT cerrada por un trabajo que el auxiliar reporta en su turno. */
export function buildShiftReportRow({ kind = 'corrective', title, description = '', machine = null, locationName = '', checklist = [], notes = '', downtimeMinutes = 0, startedAt = null, completedAt = null, id, orgId, userId, userName, plantId = null, now = new Date() }) {
  const k = REPORT_KINDS.find((r) => r.value === kind) || REPORT_KINDS[0]
  return {
    ...baseOrder({ id, orgId, userId, userName, machine, plantId, startedAt, completedAt, downtimeMinutes, notes, checklist, now }),
    location_type: machine || !clean(locationName) ? 'plant' : 'other',
    location_name: machine ? null : clean(locationName) || null,
    title: cut(clean(title) || 'Trabajo de mantenimiento', 160),
    description: clean(description) || null,
    type: k.value,
    source: 'shift_report',
    format_code: k.format,
  }
}

/** Validación antes de guardar: devuelve el primer problema o null. */
export function validateWork({ checklist = [], downtimeMinutes, title, requireTitle = false }) {
  if (requireTitle && !clean(title)) return 'Escribe qué trabajo hiciste.'
  const s = checklistSummary(checklist)
  if (s.pending) return `Falta marcar ${s.pending} punto${s.pending === 1 ? '' : 's'} de la lista de chequeo.`
  const failNoNote = checklist.find((it) => it.result === 'fail' && !clean(it.note))
  if (failNoNote) return `Explica qué encontraste en «${failNoNote.label}» (quedó No OK).`
  if (downtimeMinutes !== '' && downtimeMinutes != null && (Number.isNaN(Number(downtimeMinutes)) || Number(downtimeMinutes) < 0)) {
    return 'El tiempo de parada es en minutos (0 si el equipo no paró).'
  }
  return null
}

/** OT correctiva abierta por lo que quedó No OK en una ejecución (solicitud de mantenimiento). */
export function buildFindingOrderRow({ parent, checklist = [], orgId, userId }) {
  const fails = checklist.filter((it) => it.result === 'fail')
  if (!fails.length) return null
  return {
    org_id: orgId,
    plant_id: parent.plant_id || null,
    machine_id: parent.machine_id || null,
    location_type: parent.location_type || 'plant',
    location_name: parent.location_name || null,
    title: cut(`Hallazgo en ${parent.title}`, 160),
    description: fails.map((it) => `• ${it.label}: ${it.note}`).join('\n'),
    type: 'corrective',
    priority: 'high',
    status: 'open',
    source: 'plan_finding',
    assigned_to: null,
    created_by: userId,
  }
}

/* ── Guardado tolerante a columnas faltantes (vive en lib/workOrderSave) ── */
export { BASE_ORDER_COLUMNS, insertDroppingMissingColumns, pickColumns } from '../../../lib/workOrderSave'
