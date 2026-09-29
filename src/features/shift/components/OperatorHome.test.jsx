// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const punch = vi.fn(async () => ({ error: null }))
let attState = {}
vi.mock('../../../hooks/useAttendance', () => ({
  useAttendance: () => ({
    rows: [],
    isInside: false,
    punctuality: null,
    margins: { inMin: 10, outMin: 10 },
    punch,
    reload: vi.fn(),
    ...attState,
  }),
}))
const startShiftActivity = vi.fn(async () => ({ error: null }))
const completeShiftActivity = vi.fn(async () => ({ error: null }))
vi.mock('../../../hooks/useShiftOps', () => ({ startShiftActivity, completeShiftActivity }))
const saveWorkOrderWithEvidence = vi.fn(async ({ order }) => ({ error: null, order: { ...order, id: 'w1', code: 'OT-0200' }, warnings: [] }))
const openWorkOrderFormat = vi.fn()
vi.mock('../../../lib/workOrderSave', () => ({ saveWorkOrderWithEvidence, openWorkOrderFormat }))
const requestSupervisionView = vi.fn()
vi.mock('../../../lib/supervisionView', () => ({ requestSupervisionView }))

const { default: OperatorHome } = await import('./OperatorHome')

const today = new Date()
const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const hour = today.getHours()
const shift = hour >= 6 && hour < 14 ? 1 : hour >= 14 && hour < 22 ? 2 : 3

const data = {
  plants: [{ id: 'p1', name: 'Planta' }],
  rooms: [{ id: 'r1', plant_id: 'p1', name: 'Incubadoras 1', type: 'incubation' }],
  machines: [
    { id: 'm1', plant_id: 'p1', room_id: 'r1', code: 'INC-1', name: 'Incubadora 1', type: 'setter' },
    { id: 'm2', plant_id: 'p1', room_id: 'r1', code: 'INC-2', name: 'Incubadora 2', type: 'setter' },
  ],
  checks: [{ id: 'c1', machine_id: 'm1', plant_id: 'p1', shift_date: ymd, shift_number: shift, hour_slot: hour, taken_by: 'u', taken_at: new Date().toISOString(), condition: 'fault', notes: 'Falla de volteo' }],
  acts: [
    { id: 'a1', title: 'Lavar bandejas', assigned_to: 'u', status: 'pending', created_at: '2026-01-01T08:00' },
    { id: 'a2', title: 'Revisar nivel de agua', assigned_to: 'u', status: 'in_progress', started_at: new Date().toISOString(), created_at: '2026-01-01T07:00' },
  ],
  assignments: [],
  incidents: [],
  myPhotos: 1,
}
const home = { slot: { hour, shift, shiftDate: ymd }, data, loading: false, error: null, reload: vi.fn() }
const perf = {
  myRoundsToday: [],
  minRounds: 6,
  myScore: { scorePct: 50, eligibleScore: false, minScore: 95 },
  submitRound: vi.fn(async () => ({ error: null })),
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
  attState = {}
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (props = {}) =>
  act(async () => root.render(<OperatorHome home={home} perf={perf} first="Ana" go={go} orgId="o" userId="u" role="operator" userName="Ana" can={() => true} {...props} />))
const click = (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const byText = (sel, re) => [...host.querySelectorAll(sel)].find((el) => re.test(el.textContent))
const setValue = (el, value) =>
  act(() => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })

describe('inicio del operario de turno', () => {
  it('pide el ingreso con selfie y lo marca', async () => {
    await render()
    expect(host.textContent).toContain('Marca tu ingreso')
    const input = host.querySelector('input[type=file][capture=user]')
    const file = new File(['x'], 'selfie.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(punch).toHaveBeenCalledWith({ type: 'in', photoFile: file })
  })

  it('adentro muestra la puntualidad', async () => {
    attState = {
      isInside: true,
      rows: [{ punch_type: 'in', punched_at: new Date().toISOString() }],
      punctuality: { shiftNumber: shift, inStatus: 'late', inDeltaMin: 12, inAt: new Date().toISOString(), outStatus: 'open' },
    }
    await render()
    expect(host.textContent).toMatch(/Llegaste 12 min tarde · tolerancia 10 min/)
  })

  it('muestra la ronda de la hora y la continúa en su módulo', async () => {
    await render()
    expect(host.textContent).toMatch(/1de 2 máquinas · 1 con novedad/)
    await click(byText('button', /Continuar ronda/))
    expect(requestSupervisionView).toHaveBeenCalledWith('ronda')
    expect(go).toHaveBeenCalledWith('supervision')
  })

  it('inicia y termina actividades desde el inicio', async () => {
    await render()
    await click(byText('button', /^Iniciar$/))
    expect(startShiftActivity).toHaveBeenCalledWith('a1')
    await click(byText('button', /^Terminar$/))
    expect(host.textContent).toContain('Revisar nivel de agua')
    await click(byText('button', /Terminar actividad/))
    expect(completeShiftActivity).toHaveBeenCalledWith('o', 'a2', expect.objectContaining({ completion: 'complete' }))
    expect(host.textContent).toContain('Actividad terminada')
  })

  it('reporta una falla como OT para mantenimiento', async () => {
    await render()
    await click(byText('button', /Reportar falla/))
    await click(byText('button', /Falla eléctrica/))
    setValue(host.querySelector('select'), 'm2')
    await click(byText('button', /Reportar a mantenimiento/))
    expect(saveWorkOrderWithEvidence).toHaveBeenCalledTimes(1)
    expect(saveWorkOrderWithEvidence.mock.calls[0][0].order).toMatchObject({ title: 'INC-2 · Falla eléctrica', source: 'incident', status: 'open', machine_id: 'm2' })
    expect(host.textContent).toContain('OT-0200')
    expect(host.textContent).toContain('Ver FOMAT06')
  })

  it('la máquina con falla en la ronda abre el reporte ya lleno', async () => {
    await render()
    await click(byText('button.sh-row', /INC-1/))
    expect(host.querySelector('select').value).toBe('m1')
  })

  it('guarda la entrega de turno como reporte escrito', async () => {
    await render()
    await click(byText('button', /Entrega de turno/))
    setValue(host.querySelector('textarea'), 'INC-2 queda en revisión')
    await click(byText('button', /Guardar reporte/))
    expect(perf.submitRound).toHaveBeenCalledWith({ title: 'Entrega de turno', body: 'INC-2 queda en revisión', shiftCode: `T${shift}` })
  })

  it('el auxiliar de turno no ve la ronda (solo sus actividades)', async () => {
    await render({ role: 'auxiliary' })
    expect(host.textContent).not.toMatch(/Continuar ronda|Empezar ronda/)
    expect(host.textContent).toContain('Me asignaron')
  })
})
