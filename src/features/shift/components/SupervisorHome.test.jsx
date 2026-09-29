// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const createShiftActivity = vi.fn(async () => ({ error: null }))
const reassignShiftActivity = vi.fn(async () => ({ error: null }))
vi.mock('../../../hooks/useShiftOps', () => ({ createShiftActivity, reassignShiftActivity }))
const requestWorkOrderFromRound = vi.fn(async () => ({ error: null }))
vi.mock('../../../lib/roundActions', () => ({ requestWorkOrderFromRound }))
const openWorkOrderFormat = vi.fn()
vi.mock('../../../lib/workOrderSave', () => ({ openWorkOrderFormat }))
const openRoundFormat = vi.fn(async () => ({ error: null }))
vi.mock('../../../lib/roundFormat', () => ({ openRoundFormat }))
const openRecordDocument = vi.fn()
vi.mock('../../../lib/sigRecordDocuments', () => ({ openRecordDocument }))
const requestSupervisionView = vi.fn()
vi.mock('../../../lib/supervisionView', () => ({ requestSupervisionView }))

const { default: SupervisorHome } = await import('./SupervisorHome')

// Hora fija de Colombia a mitad del turno 1: la prueba no depende de cuándo ni dónde corra.
process.env.TZ = 'America/Bogota'
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-09-29T10:30:00-05:00'))

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const hour = now.getHours()
const shift = hour >= 6 && hour < 14 ? 1 : hour >= 14 && hour < 22 ? 2 : 3
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString()
const check = (machine_id, condition, taken_by = 'a', notes = null) => ({ id: `c-${machine_id}`, machine_id, plant_id: 'p1', shift_date: ymd, shift_number: shift, hour_slot: hour, taken_by, taken_at: minsAgo(5), condition, notes, photo_path: 'x' })

const data = {
  plants: [{ id: 'p1', name: 'Planta' }],
  rooms: [
    { id: 'r1', plant_id: 'p1', name: 'Incubadoras 1', type: 'incubation' },
    { id: 'r2', plant_id: 'p1', name: 'Nacedoras 1', type: 'hatching' },
  ],
  machines: [
    { id: 'm1', plant_id: 'p1', room_id: 'r1', code: 'INC-1', name: 'Incubadora 1' },
    { id: 'm2', plant_id: 'p1', room_id: 'r1', code: 'INC-2', name: 'Incubadora 2' },
    { id: 'm3', plant_id: 'p1', room_id: 'r2', code: 'NAC-1', name: 'Nacedora 1' },
  ],
  checks: [check('m1', 'fault', 'a', 'Falla de volteo'), check('m2', 'warning', 'a', 'Humedad alta'), check('m3', 'normal', 'a')],
  acts: [
    { id: 't1', title: 'Lavar bandejas', status: 'pending', assigned_to: 'a', created_at: minsAgo(120) },
    { id: 't2', title: 'Revisar agua', status: 'in_progress', assigned_to: 'a', started_at: minsAgo(20), created_at: minsAgo(40) },
  ],
  assignments: [
    { user_id: 'a', work_date: ymd, shift_number: shift },
    { user_id: 'b', work_date: ymd, shift_number: shift },
    { user_id: 'c', work_date: ymd, shift_number: shift },
  ],
  punches: [
    { user_id: 'a', punch_type: 'in', punched_at: minsAgo(30) },
    { user_id: 'c', punch_type: 'in', punched_at: minsAgo(30) },
  ],
  openOrdersByMachine: new Map(),
  workOrders: [],
  catalog: [{ id: 'k1', name: 'Limpieza de sala' }],
  loads: [],
  transfers: [],
  hatches: [],
}
const home = { slot: { hour, shift, shiftDate: ymd }, data, loading: false, error: null, live: true, updatedAt: new Date(), reload: vi.fn() }
const perf = {
  members: [
    { id: 'a', name: 'Ana Ruiz', role: 'operator' },
    { id: 'b', name: 'Beto Gil', role: 'operator' },
    { id: 'c', name: 'Caro Paz', role: 'operator' },
    { id: 's', name: 'Sara', role: 'supervisor' },
  ],
  rounds: [{ id: 'r', user_id: 'c', shift_date: ymd, shift_code: `T${shift}`, title: 'Entrega de turno', body: 'Todo en orden', created_at: minsAgo(3) }],
  targets: [],
  minRounds: 6,
  loading: false,
  reload: vi.fn(),
}
const go = vi.fn()

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host
let root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  vi.clearAllMocks()
  try {
    localStorage.clear()
  } catch {
    /* */
  }
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.querySelectorAll('.sv-sheet-root').forEach((n) => n.remove())
})

const render = () => act(async () => root.render(<SupervisorHome home={home} perf={perf} go={go} orgId="o" userId="s" />))
const click = (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const all = (sel) => [...document.querySelectorAll(sel)]
const byText = (sel, re) => all(sel).find((el) => re.test(el.textContent))
const itemWith = (re) => all('.sv-item').find((el) => re.test(el.textContent))

describe('tablero del supervisor', () => {
  it('semáforo, indicadores y lo que pide atención', async () => {
    await render()
    expect(host.textContent).toContain('1 falla por resolver')
    expect(host.textContent).toContain('En vivo')
    const kpis = all('.sv-kpi').map((k) => k.textContent)
    expect(kpis[0]).toMatch(/2\/3.*sin llegar/)
    expect(kpis[1]).toMatch(/3\/3/)
    expect(kpis[2]).toMatch(/1 falla · 1 alerta/)
    expect(itemWith(/INC-1 en falla sin OT/)).toBeTruthy()
    expect(itemWith(/Beto Gil no ha llegado/)).toBeTruthy()
    expect(itemWith(/«Lavar bandejas» sin iniciar/)).toBeTruthy()
  })

  it('crea la OT de la falla desde el tablero', async () => {
    await render()
    await click(byText('button', /^Crear OT$/))
    expect(requestWorkOrderFromRound).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'o', userId: 's', condition: 'fault', machine: expect.objectContaining({ id: 'm1' }) }))
    expect(document.body.textContent).toContain('OT creada para INC-1')
  })

  it('manda a revisar la alerta a una persona presente', async () => {
    await render()
    await click(itemWith(/INC-2 en alerta/).querySelector('.sv-act'))
    expect(document.body.textContent).toContain('Mandar a revisar INC-2')
    await click(byText('.sv-sheet button', /^Asignar$/))
    expect(createShiftActivity).toHaveBeenCalledWith(expect.objectContaining({ title: 'Revisar INC-2', machine_id: 'm2', assigned_by: 's' }))
  })

  it('marca como visto y lo puede volver a mostrar', async () => {
    await render()
    const before = all('.sv-item').length
    await click(itemWith(/Beto Gil/).querySelector('.sv-seen'))
    expect(all('.sv-item').length).toBe(before - 1)
    await click(byText('button', /1 visto/))
    await click(byText('button', /Volver a mostrar todo/))
    expect(all('.sv-item').length).toBe(before)
  })

  it('reasigna una actividad', async () => {
    await render()
    await click(itemWith(/Lavar bandejas/).querySelector('.sv-act'))
    await click(byText('.sv-pick', /Caro Paz/))
    expect(reassignShiftActivity).toHaveBeenCalledWith('t1', 'c')
  })

  it('mapa de la ronda: la celda muestra sus máquinas y su FOMAT04', async () => {
    await render()
    const now_ = all('.sv-mx-cell.is-now')
    expect(now_.map((c) => c.className.match(/sv-c-(\w+)/)[1])).toEqual(['fault', 'ok'])
    await click(now_[0])
    expect(document.body.textContent).toMatch(/Incubadoras 1 · \d\d:00/)
    expect(document.body.textContent).toContain('Falla de volteo')
    await click(byText('.sv-sheet button', /Ver FOMAT04/))
    expect(openRoundFormat).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'o', hour, shiftNumber: shift }))
  })

  it('el detalle de una persona permite asignarle y recordarle la ronda', async () => {
    await render()
    await click(byText('button.sh-row', /Caro Paz/))
    expect(document.body.textContent).toContain('Recordarle la ronda')
    await click(byText('.sv-sheet button', /Recordarle la ronda/))
    expect(createShiftActivity).toHaveBeenCalledWith(expect.objectContaining({ assigned_to: 'c', title: expect.stringMatching(/Ponerse al día/) }))
  })

  it('actividades por estado, novedades escritas e informe del turno', async () => {
    await render()
    await click(byText('.sv-tabs button', /En curso 1/))
    expect(host.textContent).toContain('Revisar agua')
    expect(host.textContent).toContain('Entrega de turno')
    await click(byText('button', /^Informe del turno$/) || byText('.sv-hero-link', /Informe/))
    expect(openRecordDocument).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/^FOINC02 · Turno/) }))
  })

  it('los indicadores de producción abren su sección', async () => {
    await render()
    await click(byText('.sv-stat', /Cargues/))
    expect(requestSupervisionView).toHaveBeenCalledWith('cargue')
    expect(go).toHaveBeenCalledWith('supervision')
  })
})
