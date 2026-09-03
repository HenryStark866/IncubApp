/**
 * Analítica de cumplimiento: hechos medibles, periodos y agregaciones.
 * Henry Stark Desarrollador
 */
import {
  DEFAULT_MIN_ROUNDS_PER_SHIFT,
  LABOR_KEYS,
  bogotaDate,
  computeComplianceScore,
  defaultTargetsForRole,
  isShiftWorkerRole,
} from './complianceEngine'

export const PERIODS = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'fortnight', label: 'Quincena' },
  { id: 'month', label: 'Mes' },
  { id: 'total', label: 'Total (rango)' },
]

export const GROUP_BY = [
  { id: 'activity', label: 'Actividad' },
  { id: 'area', label: 'Área' },
  { id: 'shift', label: 'Turno' },
  { id: 'user', label: 'Usuario' },
  { id: 'role', label: 'Grupo / rol' },
  { id: 'period', label: 'Periodo' },
]

const LABOR_LABEL = Object.fromEntries(LABOR_KEYS.map((k) => [k.id, k.label]))

export function daysAgoStr(n, from = new Date()) {
  const d = new Date(from)
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

export function periodKey(dateStr, periodId) {
  if (!dateStr) return '—'
  const d = String(dateStr).slice(0, 10)
  if (periodId === 'day' || periodId === 'total') return d
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, day)
  if (periodId === 'week') {
    // ISO-ish week: year-W##
    const onejan = new Date(y, 0, 1)
    const week = Math.ceil(((dt - onejan) / 86400000 + onejan.getDay() + 1) / 7)
    return `${y}-S${String(week).padStart(2, '0')}`
  }
  if (periodId === 'fortnight') {
    const q = day <= 15 ? 'Q1' : 'Q2'
    return `${y}-${String(m).padStart(2, '0')}-${q}`
  }
  if (periodId === 'month') return `${y}-${String(m).padStart(2, '0')}`
  return d
}

export function periodLabel(key, periodId) {
  if (periodId === 'week') return `Semana ${key}`
  if (periodId === 'fortnight') {
    const parts = key.split('-')
    return `${parts[0]}-${parts[1]} ${parts[2] === 'Q1' ? '1ª quincena' : '2ª quincena'}`
  }
  if (periodId === 'month') return key
  return key
}

function targetsFor(member, targets) {
  const byUser = targets.filter((t) => t.user_id === member.id)
  const byRole = targets.filter((t) => !t.user_id && t.role === member.role)
  const global = targets.filter((t) => !t.user_id && !t.role)
  const map = new Map()
  for (const t of [...global, ...byRole, ...byUser]) {
    map.set(t.labor_key, {
      labor_key: t.labor_key,
      label: t.label || LABOR_LABEL[t.labor_key] || t.labor_key,
      expected: Number(t.expected) || 0,
      unit: t.unit || '',
    })
  }
  if (!map.size) {
    for (const t of defaultTargetsForRole(member.role)) map.set(t.labor_key, t)
  } else if (isShiftWorkerRole(member.role) && !map.has('rounds')) {
    map.set('rounds', {
      labor_key: 'rounds',
      label: LABOR_LABEL.rounds,
      expected: DEFAULT_MIN_ROUNDS_PER_SHIFT,
      unit: 'rondas',
    })
  }
  return [...map.values()]
}

/**
 * Construye filas de hecho (medibles y verificables) por usuario × día × actividad.
 */
export function buildFactRows({
  members = [],
  rounds = [],
  labors = [],
  attendance = [],
  targets = [],
  fromDate,
  toDate,
}) {
  const from = fromDate || daysAgoStr(90)
  const to = toDate || bogotaDate()
  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]))
  const userIds = new Set(members.map((m) => m.id))

  // index events by user+date
  const byUserDay = new Map()

  const touch = (uid, day) => {
    const k = `${uid}|${day}`
    if (!byUserDay.has(k)) {
      byUserDay.set(k, {
        userId: uid,
        day,
        rounds: 0,
        labors: 0,
        attIn: 0,
        attOut: 0,
        attTotal: 0,
        shifts: new Set(),
      })
    }
    return byUserDay.get(k)
  }

  for (const r of rounds) {
    if (!r.user_id || !userIds.has(r.user_id)) continue
    const day = String(r.shift_date || r.created_at || '').slice(0, 10)
    if (!day || day < from || day > to) continue
    const cell = touch(r.user_id, day)
    cell.rounds += 1
    if (r.shift_code) cell.shifts.add(r.shift_code)
  }

  for (const l of labors) {
    if (!l.user_id || !userIds.has(l.user_id)) continue
    if (l.success === false) continue
    const day = String(l.shift_date || l.created_at || '').slice(0, 10)
    if (!day || day < from || day > to) continue
    const cell = touch(l.user_id, day)
    cell.labors += Number(l.qty) || 1
  }

  for (const a of attendance) {
    if (!a.user_id || !userIds.has(a.user_id)) continue
    const day = String(a.shift_date || a.punched_at || '').slice(0, 10)
    if (!day || day < from || day > to) continue
    const cell = touch(a.user_id, day)
    cell.attTotal += 1
    if (a.punch_type === 'in') cell.attIn += 1
    if (a.punch_type === 'out') cell.attOut += 1
  }

  const facts = []
  for (const cell of byUserDay.values()) {
    const m = memberMap[cell.userId]
    if (!m) continue
    const tg = targetsFor(m, targets)
    const expRounds = tg.find((t) => t.labor_key === 'rounds')?.expected ?? 0
    const expLabors = tg.find((t) => t.labor_key === 'labors_completed')?.expected ?? 0
    const expAtt = tg.find((t) => t.labor_key === 'attendance_punches')?.expected ?? 2
    const expAdh = tg.find((t) => t.labor_key === 'shift_adherence')?.expected ?? 100

    let adherence = 0
    if (cell.attIn && cell.attOut) adherence = 100
    else if (cell.attIn || cell.attOut) adherence = 50

    const activities = [
      {
        activity: 'rounds',
        label: LABOR_LABEL.rounds || 'Rondas',
        expected: expRounds,
        actual: cell.rounds,
        unit: 'rondas',
      },
      {
        activity: 'labors_completed',
        label: LABOR_LABEL.labors_completed || 'Labores',
        expected: expLabors,
        actual: cell.labors,
        unit: 'unidades',
      },
      {
        activity: 'attendance_punches',
        label: LABOR_LABEL.attendance_punches || 'Asistencia',
        expected: expAtt,
        actual: cell.attTotal,
        unit: 'marcas',
      },
      {
        activity: 'shift_adherence',
        label: LABOR_LABEL.shift_adherence || 'Adherencia',
        expected: expAdh,
        actual: adherence,
        unit: '%',
      },
    ]

    const shiftCode =
      cell.shifts.size === 1
        ? [...cell.shifts][0]
        : cell.shifts.size > 1
          ? [...cell.shifts].sort().join('+')
          : inferShiftFromDate(cell.day)

    for (const a of activities) {
      // Si expected 0 y actual 0, omitir (no medible)
      if (a.expected === 0 && a.actual === 0) continue
      const pct =
        a.expected > 0
          ? Math.round(Math.min(1, a.actual / a.expected) * 1000) / 10
          : a.actual > 0
            ? 100
            : 0
      const ok = a.expected === 0 ? a.actual > 0 : a.actual >= a.expected
      facts.push({
        id: `${cell.userId}|${cell.day}|${a.activity}`,
        date: cell.day,
        userId: m.id,
        userName: m.name || m.id.slice(0, 8),
        role: m.role || '',
        area: m.area || 'general',
        shift: shiftCode,
        activity: a.activity,
        activityLabel: a.label,
        expected: a.expected,
        actual: a.actual,
        unit: a.unit,
        pct,
        ok,
        verifiable: true,
        evidence:
          a.activity === 'attendance_punches'
            ? `${cell.attIn} in / ${cell.attOut} out`
            : a.activity === 'rounds'
              ? `${cell.rounds} reportes`
              : `${a.actual} ${a.unit}`,
      })
    }
  }

  return facts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.userName.localeCompare(b.userName)))
}

function inferShiftFromDate() {
  return 'T?'
}

/**
 * Agrega hechos según dimensión.
 * @returns {{ key: string, label: string, expected: number, actual: number, pct: number, count: number, okCount: number }[]}
 */
export function aggregateFacts(facts, { groupBy = 'activity', period = 'day' } = {}) {
  const map = new Map()

  for (const f of facts) {
    let key
    let label
    switch (groupBy) {
      case 'activity':
        key = f.activity
        label = f.activityLabel
        break
      case 'area':
        key = f.area || 'general'
        label = f.area || 'general'
        break
      case 'shift':
        key = f.shift || 'T?'
        label = f.shift || 'Sin turno'
        break
      case 'user':
        key = f.userId
        label = f.userName
        break
      case 'role':
        key = f.role || 'sin_rol'
        label = f.role || 'sin rol'
        break
      case 'period':
        key = periodKey(f.date, period === 'total' ? 'day' : period)
        label = period === 'total' ? 'Total' : periodLabel(key, period)
        break
      default:
        key = f.activity
        label = f.activityLabel
    }

    if (period !== 'total' && groupBy !== 'period') {
      // filter already applied on facts by date range
    }

    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        expected: 0,
        actual: 0,
        count: 0,
        okCount: 0,
        pctSum: 0,
      })
    }
    const g = map.get(key)
    g.expected += Number(f.expected) || 0
    g.actual += Number(f.actual) || 0
    g.count += 1
    if (f.ok) g.okCount += 1
    g.pctSum += Number(f.pct) || 0
  }

  return [...map.values()]
    .map((g) => ({
      ...g,
      pct:
        g.count > 0
          ? Math.round((g.pctSum / g.count) * 10) / 10
          : g.expected > 0
            ? Math.round(Math.min(1, g.actual / g.expected) * 1000) / 10
            : 0,
      okRate: g.count > 0 ? Math.round((g.okCount / g.count) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
}

/** Serie temporal: cumplimiento promedio por periodo */
export function timeSeries(facts, period = 'day') {
  const map = new Map()
  for (const f of facts) {
    const k = period === 'total' ? 'TOTAL' : periodKey(f.date, period)
    if (!map.has(k)) map.set(k, { key: k, pctSum: 0, n: 0, expected: 0, actual: 0 })
    const g = map.get(k)
    g.pctSum += f.pct
    g.n += 1
    g.expected += f.expected
    g.actual += f.actual
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, g]) => ({
      key,
      label: period === 'total' ? 'Total' : periodLabel(key, period),
      pct: g.n ? Math.round((g.pctSum / g.n) * 10) / 10 : 0,
      expected: g.expected,
      actual: g.actual,
      count: g.n,
    }))
}

/** Export filas planas verificables para Excel/PDF */
export function factsToExportRows(facts) {
  return facts.map((f) => ({
    Fecha: f.date,
    Usuario: f.userName,
    Rol: f.role,
    Área: f.area,
    Turno: f.shift,
    Actividad: f.activityLabel,
    Código_actividad: f.activity,
    Esperado: f.expected,
    Reportado: f.actual,
    Unidad: f.unit,
    Cumplimiento_pct: f.pct,
    Cumple: f.ok ? 'SÍ' : 'NO',
    Evidencia: f.evidence,
    ID_verificable: f.id,
  }))
}

export function aggregatesToExportRows(agg) {
  return agg.map((g) => ({
    Grupo: g.label,
    Clave: g.key,
    Esperado_suma: g.expected,
    Reportado_suma: g.actual,
    Cumplimiento_pct_prom: g.pct,
    Hechos: g.count,
    Hechos_OK: g.okCount,
    Tasa_OK_pct: g.okRate,
  }))
}

/** Score de un usuario en un rango (promedio de facts) */
export function userRangeScore(facts, userId) {
  const mine = facts.filter((f) => f.userId === userId)
  if (!mine.length) return { scorePct: 0, components: [], count: 0 }
  const byAct = new Map()
  for (const f of mine) {
    if (!byAct.has(f.activity)) byAct.set(f.activity, { exp: 0, act: 0, label: f.activityLabel })
    const a = byAct.get(f.activity)
    a.exp += f.expected
    a.act += f.actual
  }
  const components = [...byAct.entries()].map(([key, a]) => ({
    key,
    label: a.label,
    expected: a.exp,
    actual: a.act,
    pct: a.exp > 0 ? Math.round(Math.min(1, a.act / a.exp) * 1000) / 10 : 100,
  }))
  const scored = components.filter((c) => c.expected > 0)
  const scorePct = scored.length
    ? Math.round((scored.reduce((s, c) => s + c.pct, 0) / scored.length) * 10) / 10
    : 100
  return { scorePct, components, count: mine.length }
}
