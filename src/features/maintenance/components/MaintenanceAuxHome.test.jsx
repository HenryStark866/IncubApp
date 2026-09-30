// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import annualPlan from '../../../data/annualMaintenancePlanData.json'
import { computePlanCompliance } from '../../../lib/planCompliance'

const now = new Date('2026-09-29T09:00:00-05:00')
const saveWork = vi.fn(async ({ row }) => ({ error: null, order: { ...row, code: 'OT-0101' }, warnings: [] }))
const openOrderFormat = vi.fn()

vi.mock('../hooks/useMaintenanceAuxHome', () => ({
  useMaintenanceAuxHome: () => ({
    loading: false,
    warnings: [],
    now,
    shift: { shiftNumber: 1, date: '2026-09-29', start: new Date('2026-09-29T06:00:00-05:00'), end: new Date('2026-09-29T14:00:00-05:00') },
    machines: [{ id: 'm1', code: '005.4', name: 'Chiller', plant_id: 'p1' }],
    plants: [{ id: 'p1', name: 'Planta' }],
    compliance: computePlanCompliance({ tasks: annualPlan.tasks, records: [], now }),
    myShiftOrders: [{ id: 'w1', title: 'PI-001 · REVISIÓN PERIÓDICA', code: 'OT-0100', status: 'completed', completed_at: '2026-09-29T12:10:00Z', type: 'inspection', checklist: [{}] }],
    assigned: [],
    machineById: {},
    openOrderFormat,
    saveWork,
    saving: false,
    reload: vi.fn(),
  }),
}))

const { default: MaintenanceAuxHome } = await import('./MaintenanceAuxHome')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host
let root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  saveWork.mockClear()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const click = (el) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const byText = (sel, re) => [...host.querySelectorAll(sel)].find((el) => re.test(el.textContent))
const type = (el, value) =>
  act(() => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })

describe('inicio del auxiliar de mantenimiento', () => {
  it('muestra el plan de la semana, lo hecho en el turno y abre el formato', async () => {
    await act(async () => root.render(<MaintenanceAuxHome orgId="o" userId="u" userName="Ana Pérez" onNavigate={() => {}} />))
    expect(host.textContent).toContain('Hola, Ana')
    expect(host.textContent).toContain('Plan AM · semana 40')
    expect(host.textContent).toContain('Esta semana')
    expect(host.querySelectorAll('.sh-list li').length).toBeGreaterThan(1)
    const done = byText('button.sh-row', /OT-0100/)
    expect(done.textContent).toContain('Ver FOMAT04')
    click(done)
    expect(openOrderFormat).toHaveBeenCalled()
  })

  it('ejecuta una tarea: pide la lista de chequeo completa y guarda la OT', async () => {
    await act(async () => root.render(<MaintenanceAuxHome orgId="o" userId="u" userName="Ana" onNavigate={() => {}} />))
    const first = host.querySelector('.sh-list button.sh-row')
    const code = first.querySelector('.sh-row-sub').textContent.split(' · ')[0]
    click(first)
    expect(host.textContent).toContain('Lista de chequeo')
    const save = byText('button', /Guardar y llenar/)
    click(save)
    expect(host.textContent).toMatch(/Falta marcar/)
    expect(saveWork).not.toHaveBeenCalled()

    for (const b of host.querySelectorAll('.sf-seg-ok')) click(b)
    await act(async () => save.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(saveWork).toHaveBeenCalledTimes(1)
    const { row } = saveWork.mock.calls[0][0]
    expect(row.title.startsWith(`${code} · `)).toBe(true)
    expect(row.status).toBe('completed')
    expect(host.textContent).toContain('Trabajo registrado')
  })

  it('reporta un trabajo del turno con su formato', async () => {
    await act(async () => root.render(<MaintenanceAuxHome orgId="o" userId="u" userName="Ana" onNavigate={() => {}} />))
    click(byText('button', /Reportar trabajo del turno/))
    expect(host.textContent).toContain('¿Qué hiciste?')
    type(host.querySelector('input[placeholder^="Ej.: Cambio"]'), 'Cambio de rodamiento')
    for (const b of host.querySelectorAll('.sf-seg-ok')) click(b)
    await act(async () => byText('button', /Guardar y llenar FOMAT01/).dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(saveWork).toHaveBeenCalledTimes(1)
    expect(saveWork.mock.calls[0][0].row).toMatchObject({ title: 'Cambio de rodamiento', type: 'corrective', source: 'shift_report' })
  })
})
