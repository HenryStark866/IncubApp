import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calibrationRecordItem, evidenceRecordHtml, workOrderRecordItem } from '../sigRecordDocuments'

vi.mock('../supabase', () => ({ supabase: { from: vi.fn() } }))
const { supabase } = await import('../supabase')
const { queryRows, loadWarning } = await import('../queryRows')

describe('formatos de OT sin máquina cargada (30-09-2026)', () => {
  it('la OT regularizada de Mántum sin máquina abre su FOMAT01', () => {
    const order = { id: 'w', code: 'REG-a078c02ded26549b', title: 'Tensión correa [Mantum]', status: 'completed', source: 'maintenance_plan' }
    const html = evidenceRecordHtml(workOrderRecordItem({ order, machine: null }))
    expect(html).toContain('REG-a078c02ded26549b')
    expect(html).toContain('FOMAT01')
  })

  it('la falla reportada por sala abre su FOMAT06 y la calibración sin máquina su FOMAT08', () => {
    const inc = evidenceRecordHtml(workOrderRecordItem({ order: { id: 'i', code: 'OT-1', status: 'open', source: 'incident' }, machine: null }))
    expect(inc).toContain('FOMAT06')
    const cal = evidenceRecordHtml(calibrationRecordItem({ calibration: { id: 'c', scope: 'both' }, machine: null }))
    expect(cal).toContain('FOMAT08')
  })
})

describe('consultas de los tableros', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reintenta una vez si la base cortó la consulta por tiempo', async () => {
    const build = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'canceling statement due to statement timeout', code: '57014' } })
      .mockResolvedValueOnce({ data: [{ id: 1 }] })
    expect(await queryRows('work_orders', build, { wait: 0 })).toEqual({ data: [{ id: 1 }] })
    expect(build).toHaveBeenCalledTimes(2)
  })

  it('un error del servidor no se reintenta y queda con el nombre de la tabla', async () => {
    const build = vi.fn().mockResolvedValue({ error: { message: 'column load_maps.loaded_at does not exist' } })
    expect(await queryRows('load_maps', build, { wait: 0 })).toEqual({ data: [], error: 'load_maps: column load_maps.loaded_at does not exist' })
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('el aviso solo aparece si es la conexión', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(loadWarning([])).toBeNull()
    expect(loadWarning(['load_maps: column does not exist'])).toBeNull()
    expect(warn).toHaveBeenCalled()
    expect(loadWarning(['work_orders: Failed to fetch'])).toMatch(/Sin conexión estable/)
    warn.mockRestore()
  })
})
