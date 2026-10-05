// @vitest-environment jsdom
/**
 * Pantalla de Clasificación del operario de recepción, con datos SIMULADOS
 * (hooks falsos: nada toca la base). Revisa lo que el operario ve y puede
 * hacer en cada paso: orden del día → registrar carros → mapa → cargar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const state = vi.hoisted(() => ({ api: null, incubation: null, print: null }))

vi.mock('../lib/supabase', () => {
  const chain = () => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => q,
      single: () => Promise.resolve({ data: { name: 'Incubant' }, error: null }),
      then: (ok, ko) => Promise.resolve({ data: [{ id: 'P1', name: 'Planta Norte' }], error: null }).then(ok, ko),
    }
    return q
  }
  return { supabase: { from: () => chain(), channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
})
vi.mock('../lib/loadMapPrint', () => ({
  openLoadMapPrint: (...args) => {
    state.print = args
    return true
  },
}))
vi.mock('../hooks/useLoadClassification', async (original) => ({
  ...(await original()),
  useLoadClassification: () => state.api,
}))
vi.mock('../hooks/useIncubationLots', async (original) => ({
  ...(await original()),
  useIncubationLots: () => state.incubation,
}))
vi.mock('../hooks/useFlockLots', () => ({ useFlockLots: () => ({ registry: {}, rows: [] }) }))

const { default: ClassificationPanel } = await import('./ClassificationPanel')
const { normalizeCart, buildLoadGroups, buildLoadMap } = await import('../lib/loadMapEngine')

/* ── Datos simulados ── */
const hace = (min) => new Date(Date.now() - min * 60000).toISOString()
let n = 0
const carro = (lot = '41', { status = 'available', num } = {}) => {
  n += 1
  return normalizeCart({
    id: `c${n}`,
    cartNumber: String(num ?? n),
    classifiedAt: hace(30),
    status,
    lots: [{ lot, trays: 16, productionDate: '2026-09-28', colorPrimary: 'rojo', eggType: 2 }],
  })
}
const mapaDe = (status, extra = {}) => {
  const carts = Array.from({ length: 12 }, (_, i) => carro('41', { status: 'reserved', num: i + 1 }))
  const m = buildLoadMap(carts, { machineName: 'Petersime 3 (INC-03)', machineId: 'M3', plantId: 'P1' })
  return { ...m, id: `map-${status}`, status, createdAt: hace(60), orderedAt: hace(10), ...extra }
}

function fakeApi(over = {}) {
  const entries = over.entries || []
  const available = entries.filter((e) => e.status === 'available')
  return {
    entries,
    available,
    groups: buildLoadGroups(available),
    maps: [],
    summary: { totalEggs: 0, lots: [] },
    loading: false,
    error: null,
    localMode: false,
    localOnlyEntries: [],
    reload: vi.fn(async () => {}),
    addEntry: vi.fn(async () => ({ error: null })),
    addLotToCart: vi.fn(async () => ({ error: null })),
    removeLotFromCart: vi.fn(async () => ({ error: null })),
    setGroupColor: vi.fn(async () => ({ error: null })),
    removeEntry: vi.fn(async () => ({ error: null })),
    generateMap: vi.fn(async () => ({ error: null, map: { ...mapaDe('pending_approval'), id: 'nuevo' } })),
    completeLoad: vi.fn(async () => ({ error: null })),
    submitMapForApproval: vi.fn(async () => ({ error: null })),
    discardDraftMap: vi.fn(async () => ({ error: null })),
    uploadLocalEntries: vi.fn(async () => ({ error: null, uploaded: 0, skipped: [] })),
    forgetLocalEntry: vi.fn(),
    ...over,
  }
}

const ORDEN = {
  id: 'ord-1',
  status: 'published',
  published_at: hace(120),
  created_at: hace(120),
  group_count: 1,
  items: [
    { lotId: 'L41', code: '41', productionDate: '2026-09-28', eggs: 5376, carts: 1 },
    { lotId: 'L43', code: '43', productionDate: '2026-09-30', eggs: 5376, carts: 1 },
  ],
}
function fakeIncubation(over = {}) {
  return {
    lots: [
      { id: 'L41', code: '41', origin: 'Granja La Palma', status: 'classifying', postures: [{ productionDate: '2026-09-28', eggs: 5376 }] },
      { id: 'L43', code: '43', origin: 'Granja El Roble', status: 'classifying', postures: [{ productionDate: '2026-09-30', eggs: 5376 }] },
    ],
    activeOrders: [],
    loading: false,
    error: null,
    applyOrderTransitions: vi.fn(async () => ({ applied: [], errors: [] })),
    ...over,
  }
}

/* ── Montaje ── */
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host
let root
beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn()
  state.api = fakeApi()
  state.incubation = fakeIncubation()
  state.print = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = async () => {
  await act(async () => root.render(<ClassificationPanel orgId="org" userId="u1" role="reception_operator" />))
  await act(async () => new Promise((r) => setTimeout(r, 0)))
}
const click = (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const button = (texto) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent.replace(/\s+/g, ' ').includes(texto))
const pasoActual = () => host.querySelector('.cls-step.is-current')?.textContent || ''

describe('pantalla de clasificación del operario', () => {
  it('muestra el encabezado y los 4 pasos; sin datos va en «Orden del día» y lo dice sin inventar nada', async () => {
    await render()
    expect(host.textContent).toContain('Clasificación · cargue de carros y mapa de cargue')
    const pasos = [...host.querySelectorAll('.cls-step')].map((b) => b.textContent)
    expect(pasos.join('|')).toMatch(/Orden del día.*Registrar carros.*Mapa de cargue.*Cargar la máquina/)
    expect(pasoActual()).toContain('Orden del día')
    expect(pasoActual()).toContain('Usted va aquí')
    expect(host.textContent).toContain('Gerencia todavía no ha publicado la orden de clasificación')
    expect(host.textContent).not.toContain('Ovoscopia')
  })

  it('«Clasificar» en un lote de la orden abre el registro de carros con ESE lote ya elegido', async () => {
    state.incubation = fakeIncubation({ activeOrders: [ORDEN] })
    await render()
    expect(host.textContent).toContain('Orden de clasificación de hoy')
    expect(host.textContent).toContain('Publicada · todavía sin carros')
    const tarjeta41 = [...host.querySelectorAll('.cls-lot')].find((c) => c.textContent.includes('Lote 41'))
    expect(tarjeta41.textContent).toContain('En clasificación')
    await click([...tarjeta41.querySelectorAll('button')].find((b) => b.textContent === 'Clasificar'))

    expect(host.textContent).toContain('Registrando carros del lote 41')
    expect(host.textContent).toContain('0 de 12 carros')
    // Paso 1 del asistente: elegir el carro 3 y seguir al paso de lotes.
    const tres = [...host.querySelectorAll('.cart-grid button')].find((b) => b.textContent.startsWith('3'))
    await click(tres)
    await click(button('Siguiente'))
    expect(host.textContent).toContain('2 · ¿Cuántos lotes lleva el carro 3?')
    expect(host.textContent).toContain('(1/1)') // el lote 41 ya cuenta como elegido
    const chip41 = [...host.querySelectorAll('button')].find((b) => /Lote 41$/.test(b.textContent.trim()))
    expect(chip41.style.fontWeight).toBe('700')
  })

  it('el primer carro de la orden publicada la pasa a «en clasificación» y un error se muestra (no se traga)', async () => {
    const apply = vi.fn(async () => ({ applied: [], errors: ['No se pudo marcar la orden del día como en clasificación: permiso denegado'] }))
    state.incubation = fakeIncubation({ activeOrders: [ORDEN], applyOrderTransitions: apply })
    state.api = fakeApi({ entries: [carro('41')] })
    await render()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0][0].order).toEqual({ id: 'ord-1', from: 'published', to: 'in_progress' })
    expect(host.textContent).toContain('No se pudo actualizar el estado de la orden o de un lote')
    expect(host.textContent).toContain('permiso denegado')
    expect(pasoActual()).toContain('Registrar carros')
  })

  it('en modo local muestra la franja roja fija con qué hacer y no mueve estados', async () => {
    const apply = vi.fn(async () => ({ applied: [], errors: [] }))
    state.incubation = fakeIncubation({ activeOrders: [ORDEN], applyOrderTransitions: apply })
    const c = carro('41')
    state.api = fakeApi({ entries: [c], localMode: true, localOnlyEntries: [c] })
    await render()
    const franja = host.querySelector('.cls-local-strip')
    expect(franja.textContent).toContain('Sin conexión con la base: los carros se están guardando SOLO en este equipo')
    const ayuda = host.querySelector('.cls-local-help').textContent
    expect(ayuda).toContain('1 carro(s) guardado(s) solo aquí')
    expect(ayuda).toContain('avise a su líder')
    await click(button('Reintentar conexión'))
    expect(state.api.reload).toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })

  it('borrar un carro pide confirmación clara y avisa si la base no lo deja', async () => {
    const c = carro('41', { num: 5 })
    state.api = fakeApi({ entries: [c], removeEntry: vi.fn(async () => ({ error: 'sin permiso' })) })
    await render()
    await click(host.querySelector('[aria-label="Borrar el carro 5"]'))
    expect(state.api.removeEntry).not.toHaveBeenCalled()
    expect(host.textContent).toContain('¿Borrar el carro 5?')
    await click(button('Sí, borrar el carro'))
    expect(state.api.removeEntry).toHaveBeenCalledWith(c.id)
    expect(host.querySelector('.cls-toast').textContent).toContain('No se pudo borrar el carro 5: sin permiso')
  })

  it('con 12 carros genera el mapa y lo envía a aprobación (el operario no aprueba)', async () => {
    const doce = Array.from({ length: 12 }, (_, i) => carro('41', { num: i + 1 }))
    state.api = fakeApi({ entries: doce })
    await render()
    expect(pasoActual()).toContain('Mapa de cargue')
    expect(host.textContent).toContain('12 de 12 carros')
    await click(button('Generar mapa y enviar a aprobación'))
    expect(state.api.generateMap).toHaveBeenCalledWith(expect.objectContaining({ submitForApproval: true, groupIndex: 0 }))
    expect(host.querySelector('.cls-toast').textContent).toContain('Mapa enviado al líder para aprobación')
    expect(button('Aprobar')).toBeUndefined()
    expect(button('Enviar orden')).toBeUndefined()
  })

  it('muestra el estado del mapa en palabras, el motivo del rechazo e imprime con empresa y planta', async () => {
    state.api = fakeApi({
      maps: [mapaDe('pending_approval'), mapaDe('rejected', { rejectedReason: 'Faltan los carros del lote 43' })],
    })
    await render()
    expect(pasoActual()).toContain('Mapa de cargue')
    expect(host.textContent).toContain('Esperando aprobación del líder')
    await click([...host.querySelectorAll('.cls-map-pick')].find((b) => b.textContent.includes('Rechazado')))
    expect(host.textContent).toContain('Motivo del líder: Faltan los carros del lote 43')
    expect(host.querySelector('.petersime-grid')).toBeTruthy()
    await click(button('Imprimir / PDF del mapa'))
    expect(state.print[0].id).toBe('map-rejected')
    expect(state.print[1]).toEqual({ orgName: 'Incubant', plantName: 'Planta Norte' })
  })

  it('con la orden dada guía el cargue carro por carro y completa con controles cómodos (sin datetime-local)', async () => {
    state.api = fakeApi({ maps: [mapaDe('ordered')] })
    await render()
    expect(pasoActual()).toContain('Cargar la máquina')
    expect(host.textContent).toContain('0 de 12 carros ubicados')
    expect(button('faltan 12 carros por ubicar').disabled).toBe(true)
    for (const b of [...host.querySelectorAll('button')].filter((x) => x.textContent === 'Tocar al ubicar')) await click(b)
    expect(host.textContent).toContain('12 de 12 carros ubicados')
    await click(button('✔ Completar cargue'))
    expect(host.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(host.querySelector('input[type="time"]')).toBeTruthy()
    expect(button('Ahora')).toBeTruthy()
    expect(host.textContent).toContain('Petersime 3 (INC-03)')
    await click(button('Confirmar: la máquina quedó cargada'))
    expect(state.api.completeLoad).toHaveBeenCalledTimes(1)
    const [id, extra] = state.api.completeLoad.mock.calls[0]
    expect(id).toBe('map-ordered')
    expect(extra.machineId).toBe('M3')
    expect(extra.cycleStartAt).toBe(extra.loadedAt)
    expect(Date.parse(extra.loadedAt)).toBeLessThanOrEqual(Date.now())
  })
})
