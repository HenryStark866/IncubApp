/**
 * =============================================================================
 * ARCHIVO: src/lib/planCompliance.js
 * PROPÓSITO: Cruza el Plan Anual de Mantenimiento (PRGMAT01 / FOMAT07) con lo
 *   que de verdad quedó registrado —órdenes de trabajo, calibraciones y
 *   reportes de ronda— y dice, semana programada por semana programada, qué
 *   actividad tiene registro y cuál no.
 * CÓMO FUNCIONA: cada semana del cronograma de una tarea abre una ventana que
 *   va hasta la siguiente semana programada. Un registro cuenta para esa
 *   ventana si cae dentro de ella, es del mismo equipo (códigos Mántum del plan
 *   contra las claves de la máquina) y trata de lo mismo (familias de actividad
 *   y, si ambas lo dicen, el mismo objeto: CO2 no es temperatura). Nada se
 *   supone: lo que no tiene registro sale «sin registro».
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { resolveMantumKeys } from '../data/mantumCatalog'

export const PLAN_YEAR = 2026

export const OCCURRENCE_STATUS = {
  done: { label: 'Cumplida', tone: 'ok' },
  partial: { label: 'Parcial', tone: 'warn' },
  missing: { label: 'Sin registro', tone: 'bad' },
  upcoming: { label: 'Programada', tone: 'muted' },
}

/* ── semanas ISO ────────────────────────────────────────────────────────── */

/** Lunes 00:00 (hora local) de la semana ISO `week` del año `year`. */
export function isoWeekStart(year, week) {
  const jan4 = new Date(year, 0, 4)
  const dow = (jan4.getDay() + 6) % 7
  const monday = new Date(year, 0, 4 - dow)
  monday.setDate(monday.getDate() + (week - 1) * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

/** Semana ISO de una fecha: { year, week }. */
export function isoWeekOf(value) {
  const date = value instanceof Date ? value : new Date(value)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7) }
}

/* ── texto: familias de actividad y objeto ──────────────────────────────── */

const strip = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Qué se hace. «Inspección» es la más genérica: solo manda si no hay otra. */
const ACTIVITY_FAMILIES = [
  ['calibracion', /calibr|contraste de (temperatura|humedad)/],
  ['limpieza', /limpi|lava|desinfec|aseo|sanitiz|purg/],
  ['lubricacion', /lubric|engras|aceit|grasa/],
  ['cambio', /cambi|reempla|sustitu|renov/],
  ['ajuste', /ajust|apret|tension|alinea|nivela/],
  ['medicion', /medi[rc]|termogra|vibraci|megg?u|aislamiento|amperaj|voltaj|analisis/],
  ['prueba', /prueba|arranque|simulacro|test\b/],
  ['correctivo', /falla|dano|danad|repar|alarma|fuga|pantalla negra|no enciende|averi/],
  ['inspeccion', /inspecc|revis|verific|chequeo|checklist|ronda|control/],
]

/** Sobre qué se hace: si los dos lo dicen, tiene que coincidir. */
const SUBJECTS = [
  ['co2', /\bc[o0]\s?2\b|di[oó]xido/],
  ['temperatura', /temperat|\bt°|termom|termostat/],
  ['humedad', /humed|\bhr\b/],
  ['agua', /\bagua|tanque|bomba|hidr/],
  ['aire', /\baire|ventila|extract|filtro de aire|ducto/],
  ['motor', /motor|rodamient|correa|polea|ventilador/],
  ['electrico', /electr|tablero|breaker|contactor|cable|bateri/],
  ['volteo', /volteo|bandej|carro/],
]

// Los mismos textos se evalúan cientos de veces (288 tareas × cada registro): se memorizan.
const famMemo = new Map()
const subMemo = new Map()
const MEMO_MAX = 20000

export function activityFamilies(text) {
  const key = String(text || '')
  let hit = famMemo.get(key)
  if (!hit) {
    const t = strip(key)
    hit = new Set(ACTIVITY_FAMILIES.filter(([, re]) => re.test(t)).map(([k]) => k))
    if (famMemo.size > MEMO_MAX) famMemo.clear()
    famMemo.set(key, hit)
  }
  return hit
}

export function subjectsOf(text) {
  const key = String(text || '')
  let hit = subMemo.get(key)
  if (!hit) {
    const t = strip(key)
    hit = new Set(SUBJECTS.filter(([, re]) => re.test(t)).map(([k]) => k))
    if (subMemo.size > MEMO_MAX) subMemo.clear()
    subMemo.set(key, hit)
  }
  return hit
}

const intersects = (a, b) => {
  for (const x of a) if (b.has(x)) return true
  return false
}

/** ¿El registro trata de lo mismo que la tarea? */
export function sameActivity(taskText, recordText) {
  const tf = activityFamilies(taskText)
  const rf = activityFamilies(recordText)
  const specific = (s) => new Set([...s].filter((k) => k !== 'inspeccion'))
  const ts = specific(tf)
  const rs = specific(rf)
  const familyOk = ts.size ? intersects(ts, rs) : tf.has('inspeccion') && rf.size > 0 && !rf.has('correctivo')
  if (!familyOk) return false
  const tsub = subjectsOf(taskText)
  const rsub = subjectsOf(recordText)
  return !tsub.size || !rsub.size || intersects(tsub, rsub)
}

/* ── plan ───────────────────────────────────────────────────────────────── */

/** Códigos de equipo del plan («INC-001.1, INC-001.10») en mayúsculas. */
export function equipmentCodesOfTask(task = {}) {
  return String(task.applyingEquipment || '')
    .split(/[,;]/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s && !s.startsWith('('))
}

/** Tareas que se evidencian con la ronda de la app y no con una OT. */
export const isRoundTask = (task = {}) => /ronda/i.test(task.evidenceFormat || '')

/* ── registros ──────────────────────────────────────────────────────────── */

const WO_TYPE = {
  preventive: 'Preventivo',
  corrective: 'Correctivo',
  inspection: 'Inspección',
  predictive: 'Predictivo',
}

export function workOrderTypeLabel(type) {
  return WO_TYPE[String(type || '').toLowerCase()] || (type ? String(type) : 'Sin tipo')
}

/** «Correctiva Programada», «Predictiva, Sistemática»… → tipo de la app. */
export function mantumType(text) {
  const t = strip(text)
  if (!t) return null
  if (/correct/.test(t)) return 'corrective'
  if (/predict/.test(t)) return 'predictive'
  if (/sistemat|prevent|rutin/.test(t)) return 'preventive'
  return null
}

const toDate = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Todo lo que cuenta como evidencia de ejecución, con una sola forma.
 * La fecha es la de ejecución: cierre, inicio o, en último caso, creación.
 * @returns {Array<{id,kind,date,machineId,machine,keys:Set,text,title,planCode,personId,code,type,status,raw}>}
 */
export function normalizeRecords({ workOrders = [], calibrations = [], roundReports = [], mantumRecords = [], machinesById = {} } = {}) {
  const keysCache = new Map()
  const keysOf = (machine) => {
    if (!machine) return new Set()
    if (!keysCache.has(machine.id)) keysCache.set(machine.id, new Set(resolveMantumKeys(machine)))
    return keysCache.get(machine.id)
  }
  const out = []
  for (const wo of workOrders) {
    if (String(wo.status || '').toLowerCase() === 'cancelled') continue
    const date = toDate(wo.completed_at) || toDate(wo.started_at) || toDate(wo.created_at)
    if (!date) continue
    const machine = machinesById[wo.machine_id] || null
    out.push({
      id: `wo-${wo.id}`,
      kind: 'ot',
      date,
      machineId: wo.machine_id || null,
      machine,
      keys: keysOf(machine),
      text: [wo.title, wo.description, wo.resolution].filter(Boolean).join(' · '),
      title: wo.title || wo.code || 'Orden de trabajo',
      planCode: String(wo.maintenance_plan_code || '').toUpperCase() || null,
      personId: wo.assigned_to || wo.created_by || null,
      code: wo.code || null,
      type: String(wo.type || '').toLowerCase() || null,
      status: String(wo.status || '').toLowerCase() || null,
      closed: String(wo.status || '').toLowerCase() === 'completed' || !!wo.completed_at,
      raw: wo,
    })
  }
  const woIds = new Set(workOrders.map((w) => w.id))
  for (const c of calibrations) {
    const date = toDate(c.calibrated_at) || toDate(c.created_at)
    if (!date) continue
    // Si la calibración ya tiene su OT, la OT la representa: no se cuenta dos veces.
    if (c.work_order_id && woIds.has(c.work_order_id)) continue
    const machine = machinesById[c.machine_id] || null
    out.push({
      id: `cal-${c.id}`,
      kind: 'calibracion',
      date,
      machineId: c.machine_id || null,
      machine,
      keys: keysOf(machine),
      text: `Calibración de sensores de temperatura y humedad ${c.notes || ''}`,
      title: `Calibración ${machine?.code || ''}`.trim(),
      planCode: null,
      personId: c.performed_by || null,
      code: null,
      type: 'calibration',
      status: 'completed',
      closed: true,
      raw: c,
    })
  }
  // Lo ejecutado en Mántum (scripts/importar_mantum_reciente.py): sus códigos de equipo son
  // los mismos del plan, así que el cruce es directo.
  for (const m of mantumRecords) {
    const date = toDate(m.date)
    if (!date) continue
    const kindLabel = m.source === 'mantum-bitacora' ? 'Bitácora Mántum' : 'OT Mántum'
    out.push({
      id: m.id,
      kind: 'mantum',
      date,
      machineId: null,
      machine: null,
      keys: new Set((m.equipment || []).map((c) => String(c).toUpperCase())),
      text: [m.activity, m.description, m.feedback, m.maintenanceType].filter(Boolean).join(' · '),
      title: [m.code || kindLabel, m.activity].filter(Boolean).join(' · '),
      activityName: m.activity || null,
      planCode: null,
      personId: null,
      personName: (m.executors || []).filter(Boolean).join(', ') || m.registeredBy || null,
      people: (m.executors || []).filter(Boolean),
      code: m.code || null,
      type: mantumType(m.maintenanceType),
      status: m.status ? String(m.status).toLowerCase() : 'completed',
      closed: !!m.finishedAt || m.source === 'mantum-bitacora' || /cerrad|finaliz/i.test(m.status || ''),
      cost: typeof m.cost === 'number' ? m.cost : null,
      entities: m.entities || '',
      source: kindLabel,
      raw: m,
    })
  }
  for (const r of roundReports) {
    const date = toDate(r.created_at) || toDate(r.shift_date ? `${r.shift_date}T12:00:00` : null)
    if (!date) continue
    out.push({
      id: `round-${r.id}`,
      kind: 'ronda',
      date,
      machineId: null,
      machine: null,
      keys: new Set(),
      text: `Ronda de verificación ${r.title || ''}`,
      title: r.title || `Ronda ${r.shift_code || ''}`.trim(),
      planCode: null,
      personId: r.user_id || null,
      code: null,
      type: 'round',
      status: 'completed',
      closed: true,
      raw: r,
    })
  }
  return out.sort((a, b) => a.date - b.date)
}

/* ── cumplimiento ───────────────────────────────────────────────────────── */

function taskMatchesRecord(task, record, taskCodes) {
  const code = String(task.code || '').toUpperCase()
  if (record.planCode && record.planCode === code) return { ok: true, codes: [] }
  if (code && strip(record.text).includes(strip(code))) return { ok: true, codes: [] }
  if (record.kind === 'ronda') return { ok: isRoundTask(task) && task.sede === 'PLANTA INCUBANT', codes: [] }
  if (!record.keys.size) return { ok: false }
  const codes = taskCodes.filter((c) => record.keys.has(c))
  if (!codes.length) return { ok: false }
  // Mismo nombre de actividad que en Mántum: el plan se armó con esos nombres.
  if (record.activityName) {
    const wanted = strip(task.description).trim()
    const names = record.activityName.split(/,\s+/).map((n) => strip(n.replace(/^[^|]*\|\s*/, '')).trim())
    if (names.includes(wanted)) return { ok: true, codes }
  }
  const text = `${task.description || ''} ${task.equipmentClass || ''}`
  return sameActivity(text, record.text) ? { ok: true, codes } : { ok: false }
}

/**
 * Cumplimiento del plan.
 * @param {object} p
 * @param {object[]} p.tasks tareas del plan (annualMaintenancePlanData.tasks)
 * @param {object[]} p.records salida de normalizeRecords
 * @param {Set<string>} [p.knownKeys] claves de todas las máquinas de la app: dice qué equipos del plan se pueden seguir
 * @param {Date} [p.now]
 * @param {number} [p.year]
 * @param {number} [p.fromWeek] primera semana que se evalúa
 */
export function computePlanCompliance({ tasks = [], records = [], knownKeys = new Set(), now = new Date(), year = PLAN_YEAR, fromWeek = 1 } = {}) {
  const yearEnd = new Date(year + 1, 0, 1)
  const rows = []
  const totals = { due: 0, done: 0, partial: 0, missing: 0, upcoming: 0, score: 0 }
  // Índice por código de equipo; los registros sin equipo se prueban contra todas las tareas.
  const byKey = new Map()
  const loose = []
  for (const r of records) {
    if (!r.keys?.size) {
      loose.push(r)
      continue
    }
    if (r.planCode) loose.push(r)
    for (const k of r.keys) {
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(r)
    }
  }
  // Texto con código de tarea («PI-152») también cuenta aunque el equipo no case.
  for (const r of records) if (r.keys?.size && !r.planCode && /\b[A-Z]{2}-\d{3}\b/.test(r.text || '')) loose.push(r)

  for (const task of tasks) {
    const weeks = [...new Set(task.cronograma?.weeks || [])].filter((w) => w >= 1 && w <= 53).sort((a, b) => a - b)
    const taskCodes = equipmentCodesOfTask(task)
    const trackable = taskCodes.filter((c) => knownKeys.has(c))
    const pool = new Set(loose)
    for (const c of taskCodes) for (const r of byKey.get(c) || []) pool.add(r)
    const candidates = [...pool].filter((r) => taskMatchesRecord(task, r, taskCodes).ok).sort((a, b) => a.date - b.date)
    const occurrences = []
    const row = { task, trackable, occurrences, due: 0, done: 0, partial: 0, missing: 0, upcoming: 0, score: 0, records: [] }

    weeks.forEach((week, i) => {
      if (week < fromWeek) return
      const start = isoWeekStart(year, week)
      const end = i + 1 < weeks.length ? isoWeekStart(year, weeks[i + 1]) : yearEnd
      if (start > now) {
        occurrences.push({ week, start, end, status: 'upcoming', records: [], hitCodes: [], covered: 0, total: trackable.length })
        row.upcoming += 1
        return
      }
      const inWindow = candidates.filter((r) => r.date >= start && r.date < end)
      let fraction = 0
      let hitCodes = []
      if (inWindow.length) {
        const hit = new Set()
        let general = false
        for (const r of inWindow) {
          const codes = taskMatchesRecord(task, r, taskCodes).codes || []
          if (!codes.length) general = true
          for (const c of codes) hit.add(c)
        }
        // Un registro sin equipo (código de tarea, ronda) cubre la tarea completa.
        hitCodes = general ? [...trackable] : trackable.filter((c) => hit.has(c))
        fraction = trackable.length > 1 && !general ? hitCodes.length / trackable.length : 1
        if (trackable.length > 1 && !general && !hitCodes.length) fraction = 1
      }
      const status = !inWindow.length ? 'missing' : fraction >= 1 ? 'done' : 'partial'
      occurrences.push({ week, start, end, status, records: inWindow, hitCodes, covered: hitCodes.length, total: trackable.length, fraction })
      row.due += 1
      row[status] += 1
      row.score += fraction
      for (const r of inWindow) row.records.push(r)
    })

    row.pct = row.due ? row.score / row.due : null
    rows.push(row)
    totals.due += row.due
    totals.done += row.done
    totals.partial += row.partial
    totals.missing += row.missing
    totals.upcoming += row.upcoming
    totals.score += row.score
  }
  totals.pct = totals.due ? totals.score / totals.due : null
  return { rows, totals }
}

/** Claves Mántum de todas las máquinas de la app. */
export function knownKeysOf(machines = []) {
  const keys = new Set()
  for (const m of machines) for (const k of resolveMantumKeys(m)) keys.add(k)
  return keys
}

/** Primera semana del año con algún registro: desde ahí hay datos digitales. */
export function firstRecordWeek(records = [], year = PLAN_YEAR) {
  const first = records.find((r) => r.date.getFullYear() === year)
  return first ? isoWeekOf(first.date).week : null
}

/** Agrupa las filas del cumplimiento por sistema del plan. */
export function complianceBySystem(rows = []) {
  const map = new Map()
  for (const r of rows) {
    const key = r.task.system || 'Sin sistema'
    if (!map.has(key)) map.set(key, { system: key, tasks: 0, due: 0, done: 0, partial: 0, missing: 0, score: 0 })
    const g = map.get(key)
    g.tasks += 1
    g.due += r.due
    g.done += r.done
    g.partial += r.partial
    g.missing += r.missing
    g.score += r.score
  }
  return [...map.values()]
    .map((g) => ({ ...g, pct: g.due ? g.score / g.due : null }))
    .sort((a, b) => (a.pct ?? 2) - (b.pct ?? 2) || b.due - a.due)
}

/** Código de equipo → dónde está y qué es, según el plan (sistema = zona, sede = localidad). */
export function planEquipmentIndex(tasks = []) {
  const map = new Map()
  for (const t of tasks) {
    for (const code of equipmentCodesOfTask(t)) {
      if (!map.has(code)) map.set(code, { code, system: t.system || null, sede: t.sede || null, equipmentClass: t.equipmentClass || null })
    }
  }
  return map
}
