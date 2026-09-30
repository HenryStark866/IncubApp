// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const lectura = {
  check_id: 'k1',
  valores: { temp_ovoscan: 100, co2: 0.25 },
  discrepancias: [
    { campo: 'temp_air', tipo: 'turnero_vs_foto', turnero: 98.5, foto: 97.8 },
    { campo: 'humidity', tipo: 'lecturas_distintas', lectura_a: 76.9, lectura_b: 79.6 },
  ],
  motivo: 'x',
  procesada_at: '2026-09-29T23:10:00Z',
  machines: { code: 'INC-18', name: 'Inc 18', type: 'setter' },
  machine_checks: {
    taken_at: '2026-09-29T23:05:00Z', shift_date: '2026-09-29', shift_number: 2, hour_slot: 18,
    photo_path: 'org/m/foto.jpg', taken_by: 'u1', temp_ovoscan: 100, temp_air: 98.5, humidity: null, co2: 0.25, turn_count: 386,
  },
}

let filas = [lectura]
const rpc = vi.fn(async () => ({ error: null }))
const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: filas, error: null }) }
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => query,
    rpc: (...a) => rpc(...a),
    storage: { from: () => ({ createSignedUrls: async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://x/${p}` })) }) }) },
  },
}))

const { default: BotReadingsReview } = await import('./BotReadingsReview')

let host, root
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(text))
const type = (input, value) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(async () => {
  filas = [lectura]
  rpc.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<BotReadingsReview orgId="o1" peopleName={{ u1: 'Ana Turnera' }} />))
  await flush()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Lecturas por revisar', () => {
  it('lista la lectura con máquina, franja, motivo y turnero', () => {
    expect(host.textContent).toContain('Lecturas por revisar · 1')
    expect(host.textContent).toContain('INC-18 · T2 18:00 – 18:59')
    expect(host.textContent).toContain('Temp. aire: el turnero digitó otro valor')
    expect(host.textContent).toContain('Ana Turnera')
  })

  it('muestra foto y comparación, y guarda solo lo corregido', async () => {
    await act(async () => button('Revisar').click())
    expect(host.querySelector('img').getAttribute('src')).toBe('https://x/org/m/foto.jpg')
    expect(host.textContent).toContain('76.9 / 79.6')
    await act(async () => button('Usar foto').click())
    await act(async () => type(host.querySelector('#br-k1-humidity'), '76.9'))
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toContain('Guardar 2 correcciones')
    filas = []
    await act(async () => button('Guardar 2 correcciones').click())
    await flush()
    expect(rpc).toHaveBeenCalledWith('resolver_lectura_bot', { p_check_id: 'k1', p_valores: { temp_air: 97.8, humidity: 76.9 }, p_nota: null })
    expect(host.textContent).toContain('INC-18: 2 lecturas corregidas')
    expect(host.textContent).toContain('No quedan lecturas por revisar')
  })

  it('sin cambios confirma como está', async () => {
    await act(async () => button('Revisar').click())
    await act(async () => button('Confirmar como está').click())
    await flush()
    expect(rpc).toHaveBeenCalledWith('resolver_lectura_bot', { p_check_id: 'k1', p_valores: {}, p_nota: null })
  })

  it('no aparece si no hay nada por revisar', async () => {
    act(() => root.unmount())
    filas = []
    root = createRoot(host)
    await act(async () => root.render(<BotReadingsReview orgId="o1" />))
    await flush()
    expect(host.textContent).toBe('')
  })
})
