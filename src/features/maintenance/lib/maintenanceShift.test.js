import { describe, it, expect } from 'vitest'
import annualPlan from '../../../data/annualMaintenancePlanData.json'
import { computePlanCompliance, normalizeRecords } from '../../../lib/planCompliance'
import {
  buildFindingOrderRow,
  buildPlanOrderRow,
  buildShiftReportRow,
  checklistForTask,
  checklistSummary,
  formatForTask,
  formatOfOrder,
  insertDroppingMissingColumns,
  isAuxTask,
  ordersInShift,
  pickColumns,
  planWorkForAux,
  readableText,
  shiftWindowAt,
  taskSpecialty,
  validateWork,
} from './maintenanceShift'

const co = (ymd, hm) => new Date(`${ymd}T${hm}:00-05:00`)
const task = (over = {}) => ({
  code: 'PI-900',
  sede: 'PLANTA INCUBANT',
  system: 'AIRE',
  equipmentClass: 'Chiller',
  applyingEquipment: '005.4',
  description: 'Lubricación de chumaceras',
  type: 'Sistemática',
  frequency: 'Cada 7 Día(s)',
  responsible: 'Auxiliar de Mantenimiento (Mecánica)',
  evidenceFormat: 'Orden de Trabajo en Mántum / FOMAT01',
  cronograma: { weeks: [38, 40, 42] },
  ...over,
})

describe('quién ejecuta y con qué formato', () => {
  it('especialidad y tareas del auxiliar', () => {
    expect(taskSpecialty(task())).toBe('Mecánica')
    expect(taskSpecialty(task({ responsible: 'Téc. eléctrico' }))).toBe('Eléctrica')
    expect(taskSpecialty(task({ responsible: 'Auxiliar de Mantenimiento (Control)' }))).toBe('Control')
    expect(isAuxTask(task())).toBe(true)
    expect(isAuxTask(task({ responsible: 'Laboratorio externo' }))).toBe(false)
    expect(isAuxTask(task({ responsible: 'Operario galponero' }))).toBe(false)
  })

  it('cada tarea llena su formato', () => {
    expect(formatForTask(task())).toMatchObject({ code: 'FOMAT01', woType: 'preventive' })
    expect(formatForTask(task({ description: 'REVISIÓN PERIÓDICA' }))).toMatchObject({ code: 'FOMAT04', woType: 'inspection' })
    expect(formatForTask(task({ evidenceFormat: 'Ronda diaria' }))).toMatchObject({ code: 'FOMAT04' })
    expect(formatForTask(task({ description: 'VERIFICAR CALIBRACION DE LA NACEDORA' }))).toMatchObject({ code: 'FOMAT08', goTo: 'calibracion' })
  })

  it('todas las tareas del plan del auxiliar tienen formato', () => {
    const mine = annualPlan.tasks.filter(isAuxTask)
    expect(mine.length).toBeGreaterThan(200)
    for (const t of mine) expect(['FOMAT01', 'FOMAT04', 'FOMAT08']).toContain(formatForTask(t).code)
  })
})

describe('lista de chequeo', () => {
  it('trae la actividad, lo propio del tipo y el cierre', () => {
    const list = checklistForTask(task({ description: 'Revise y apriete todas las conexiones eléctricas' }))
    const labels = list.map((i) => i.id)
    expect(labels[0]).toBe('actividad')
    expect(labels).toContain('ajuste')
    expect(labels).toContain('electrico')
    expect(labels.slice(-2)).toEqual(['funcionamiento', 'bioseguridad'])
    expect(list.every((i) => i.result === null)).toBe(true)
  })

  it('no deja guardar con puntos sin marcar o un No OK sin explicar', () => {
    const list = checklistForTask(task())
    expect(validateWork({ checklist: list })).toMatch(/Falta marcar/)
    const marked = list.map((i) => ({ ...i, result: 'ok' }))
    expect(validateWork({ checklist: marked, downtimeMinutes: 0 })).toBeNull()
    marked[1] = { ...marked[1], result: 'fail' }
    expect(validateWork({ checklist: marked })).toMatch(/Explica/)
    marked[1].note = 'Chumacera con juego'
    expect(validateWork({ checklist: marked, downtimeMinutes: -3 })).toMatch(/minutos/)
    expect(checklistSummary(marked)).toMatchObject({ ok: marked.length - 1, fail: 1, pending: 0 })
  })
})

describe('plan AM de la semana', () => {
  const now = co('2026-09-29', '09:00') // semana ISO 40
  const tasks = [
    task({ code: 'PI-901', cronograma: { weeks: [40] } }),
    task({ code: 'PI-902', cronograma: { weeks: [38, 44] }, isCriticalSecurity: true }),
    task({ code: 'PI-903', cronograma: { weeks: [40] }, responsible: 'Laboratorio externo' }),
    task({ code: 'PI-904', cronograma: { weeks: [41] } }),
    task({ code: 'PI-905', cronograma: { weeks: [39, 40] } }),
  ]
  const records = normalizeRecords({
    workOrders: [{ id: 'w1', title: 'PI-905 · Lubricación de chumaceras', status: 'completed', completed_at: co('2026-09-28', '10:00').toISOString() }],
  })
  const { rows } = computePlanCompliance({ tasks, records, now, year: 2026 })

  it('muestra lo de esta semana y lo atrasado; lo cumplido va al final', () => {
    const work = planWorkForAux(rows, { now })
    expect(work.map((w) => w.task.code)).toEqual(['PI-902', 'PI-901', 'PI-905'])
    expect(work[0]).toMatchObject({ overdue: true, weeksLate: 2, thisWeek: false })
    expect(work[1]).toMatchObject({ overdue: false, done: false, thisWeek: true })
    expect(work[2]).toMatchObject({ done: true })
  })

  it('filtra por especialidad', () => {
    expect(planWorkForAux(rows, { now, specialty: 'Eléctrica' })).toHaveLength(0)
  })

  it('la OT del plan cuenta en el cumplimiento', () => {
    const row = buildPlanOrderRow({
      task: tasks[0],
      checklist: [{ id: 'actividad', label: 'Lubricación de chumaceras', result: 'ok', note: '' }],
      notes: 'Sin novedad',
      orgId: 'o',
      userId: 'u',
      userName: 'Ana',
      completedAt: co('2026-09-29', '08:30'),
      now,
    })
    expect(row).toMatchObject({ status: 'completed', type: 'preventive', maintenance_plan_code: 'PI-901', format_code: 'FOMAT01', source: 'plan_am', downtime_minutes: 0, assigned_to: 'u' })
    expect(row.title.startsWith('PI-901 · ')).toBe(true)
    expect(row.resolution).toBe('Sin novedad\n\n[OK] Lubricación de chumaceras')
    // Aunque la base no tenga maintenance_plan_code, el código en el título basta.
    const base = pickColumns(row)
    expect(base.maintenance_plan_code).toBeUndefined()
    const recs = normalizeRecords({ workOrders: [{ ...base, id: 'x' }] })
    const res = computePlanCompliance({ tasks: [tasks[0]], records: recs, now, year: 2026 })
    expect(res.rows[0].done).toBe(1)
  })
})

describe('reporte del turno y hallazgos', () => {
  it('el reporte queda como OT cerrada con su formato', () => {
    const row = buildShiftReportRow({ kind: 'inspection', title: 'Revisión bomba', orgId: 'o', userId: 'u', downtimeMinutes: '15', now: co('2026-09-29', '10:00') })
    expect(row).toMatchObject({ type: 'inspection', format_code: 'FOMAT04', status: 'completed', downtime_minutes: 15, source: 'shift_report' })
    expect(formatOfOrder({ type: 'inspection', checklist: [{}] })).toBe('FOMAT04')
    expect(formatOfOrder({ type: 'corrective' })).toBe('FOMAT01')
  })

  it('lo que quedó No OK abre una OT correctiva', () => {
    const parent = { title: 'PI-901 · Lubricación', machine_id: 'm1', plant_id: 'p1', location_type: 'plant' }
    expect(buildFindingOrderRow({ parent, checklist: [{ result: 'ok' }], orgId: 'o', userId: 'u' })).toBeNull()
    const f = buildFindingOrderRow({ parent, checklist: [{ label: 'Chumacera', result: 'fail', note: 'juego axial' }], orgId: 'o', userId: 'u' })
    expect(f).toMatchObject({ type: 'corrective', status: 'open', priority: 'high', machine_id: 'm1', description: '• Chumacera: juego axial' })
  })
})

describe('turno', () => {
  it('el T3 de madrugada pertenece al día anterior', () => {
    expect(shiftWindowAt(co('2026-09-29', '03:00'))).toMatchObject({ shiftNumber: 3, date: '2026-09-28' })
    expect(shiftWindowAt(co('2026-09-29', '15:00'))).toMatchObject({ shiftNumber: 2, date: '2026-09-29' })
  })

  it('lista lo que la persona cerró en su turno', () => {
    const w = shiftWindowAt(co('2026-09-29', '10:00'))
    const orders = [
      { id: 1, status: 'completed', assigned_to: 'u', completed_at: co('2026-09-29', '07:00').toISOString() },
      { id: 2, status: 'completed', assigned_to: 'u', completed_at: co('2026-09-29', '05:00').toISOString() },
      { id: 3, status: 'completed', assigned_to: 'x', completed_at: co('2026-09-29', '08:00').toISOString() },
      { id: 4, status: 'open', assigned_to: 'u', completed_at: null },
    ]
    expect(ordersInShift(orders, 'u', w).map((o) => o.id)).toEqual([1])
  })
})

describe('guardado tolerante', () => {
  it('quita las columnas que la base no tiene y reintenta', async () => {
    const calls = []
    const client = {
      from: () => ({
        insert: async (row) => {
          calls.push(Object.keys(row))
          if ('checklist' in row) return { error: { message: "Could not find the 'checklist' column of 'work_orders' in the schema cache" } }
          if ('format_code' in row) return { error: { message: 'column "format_code" of relation "work_orders" does not exist' } }
          return { error: null }
        },
      }),
    }
    const res = await insertDroppingMissingColumns(client, 'work_orders', { id: 1, checklist: [], format_code: 'FOMAT01' })
    expect(res).toEqual({ error: null, dropped: ['checklist', 'format_code'] })
    expect(calls).toHaveLength(3)
  })

  it('otros errores no se esconden', async () => {
    const client = { from: () => ({ insert: async () => ({ error: { message: 'permission denied' } }) }) }
    expect(await insertDroppingMissingColumns(client, 't', { a: 1 })).toEqual({ error: 'permission denied', dropped: [] })
  })
})

describe('texto del plan', () => {
  it('pasa a minúsculas lo que viene todo en mayúsculas', () => {
    expect(readableText('REVISIÓN  PERIÓDICA')).toBe('Revisión periódica')
    expect(readableText('Lubricación de chumaceras')).toBe('Lubricación de chumaceras')
  })
})
