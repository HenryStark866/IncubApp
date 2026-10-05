/**
 * Formato impreso del mapa de cargue y normalización de las formas de mapa, con
 * mapas reales de septiembre de 2026 (recortados, sin datos personales).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import mapas from './__fixtures__/mapasCargueSeptiembre2026.json'
import { buildLoadMap } from './loadMapEngine'
import {
  LOAD_MAP_FORMAT,
  LOAD_MAP_STATUS_LABEL,
  buildLoadMapPrintHtml,
  normalizeLoadMapRecord,
  openLoadMapPrint,
} from './loadMapPrint'

const byId = (id) => JSON.parse(JSON.stringify(mapas.find((m) => m.id === id)))
const INC02 = 'lc_mtlvtjqm_kbbxxi' // carros de 3 lotes, regularizado
const INC09 = 'lc_mu077be8_q5ubnz' // 10 carros, 3 avisos, sin placementGuide guardada
const INC11 = 'lc_mubx9tpt_ozyave' // 7 carros mixtos, lote TRATADO

const flattened = (row) => ({
  id: row.id,
  ...row.payload,
  status: row.status,
  machineName: row.machine_name,
  createdAt: row.created_at,
  approvedAt: row.approved_at,
  orderedAt: row.ordered_at,
})

const shape = (m) => ({
  id: m.id,
  status: m.status,
  machineName: m.machineName,
  createdAt: m.createdAt,
  carts: m.slots.map((s) => [s.machinePos, s.zone, s.cartNo, s.entry ? s.entry.lots.map((l) => `${l.lot}:${l.trays}`) : null]),
  balance: m.balance,
  summary: { cartCount: m.summary.cartCount, totalTrays: m.summary.totalTrays, totalEggs: m.summary.totalEggs },
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('normalizeLoadMapRecord', () => {
  for (const id of [INC02, INC09, INC11]) {
    it(`${id}: fila de la base, mapa aplanado, objeto del Centro SIG y payload en texto dan lo mismo`, () => {
      const row = byId(id)
      const base = normalizeLoadMapRecord(row)
      expect(shape(normalizeLoadMapRecord(flattened(row)))).toEqual(shape(base))
      expect(shape(normalizeLoadMapRecord({ ...row, payload: JSON.stringify(row.payload) }))).toEqual(shape(base))
      const sig = normalizeLoadMapRecord({ ...row, ...row.payload, id: `load-map-${row.id}`, rawId: row.id, mapStatus: row.status })
      expect(shape(sig)).toEqual(shape(base))

      expect(base.id).toBe(row.id)
      expect(base.machineName).toBe(row.machine_name)
      expect(base.status).toBe('completed')
      expect(base.createdAt).toBe(row.created_at)
      expect(base.approvedAt).toBe(row.approved_at)
      expect(base.slots.map((s) => s.machinePos)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
      // Lo recalculado coincide con lo que la app guardó en su momento.
      expect(base.summary.totalEggs).toBe(row.payload.summary.totalEggs)
      expect(base.summary.totalTrays).toBe(row.payload.summary.totalTrays)
      expect(base.balance.warnings).toEqual(row.payload.balance.warnings)
      expect(base.placementGuide).toHaveLength(row.payload.slots.filter((s) => s.entry).length)
    })
  }

  it('INC-09: posiciones 7 y 10 vacías y la guía se reconstruye desde las posiciones', () => {
    const m = normalizeLoadMapRecord(byId(INC09))
    expect(m.slots.filter((s) => !s.entry).map((s) => s.machinePos)).toEqual([7, 10])
    expect(m.balance.ok).toBe(false)
    expect(m.balance.left).toBe(6)
    expect(m.balance.right).toBe(4)
    expect(m.placementGuide.map((g) => g.cartNo)).toEqual(['1', '2', '3', '4', '5', '6', '7', '9', '11', '12'])
  })

  it('INC-11: marca los carros mixtos y el lote tratado', () => {
    const m = normalizeLoadMapRecord(byId(INC11))
    const mixed = m.slots.filter((s) => s.entry?.isMixed)
    expect(mixed).toHaveLength(7)
    const treated = m.slots.find((s) => s.entry?.hasTreated)
    expect(treated.machinePos).toBe(2)
    expect(treated.entry.lots.find((l) => l.isTreated).lot).toBe('TRATADO')
    expect(m.summary.treatedEggs).toBe(2688)
  })

  it('acepta el mapa recién armado en memoria por buildLoadMap', () => {
    const carts = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i + 1}`,
      cartNumber: String(i + 1),
      status: 'available',
      color: '#2e7d32',
      lots: [{ lot: String(40 + (i % 4)), trays: 16, eggType: 2, productionDate: `2026-09-${String(10 + (i % 6)).padStart(2, '0')}` }],
    }))
    const built = buildLoadMap(carts, { machineName: 'Inc 5 (INC-05)' })
    built.id = 'lc_prueba'
    const m = normalizeLoadMapRecord(built)
    expect(m.machineName).toBe('Inc 5 (INC-05)')
    expect(m.status).toBe('draft')
    expect(m.slots.map((s) => [s.machinePos, s.zone, s.cartNo])).toEqual(
      built.slots.map((s) => [s.machinePos, s.zone, s.cartNo])
    )
    expect(m.summary.totalEggs).toBe(12 * 16 * 336)
    expect(m.balance.ok).toBe(true)
  })

  it('no revienta con datos vacíos o extraños', () => {
    for (const input of [null, undefined, 'texto', {}, { payload: '{roto' }, { slots: [{ machinePos: 99, entry: {} }, null] }]) {
      const m = normalizeLoadMapRecord(input)
      expect(m.slots).toHaveLength(12)
      expect(m.slots.every((s) => s.entry === null)).toBe(true)
      expect(m.status).toBe('draft')
    }
  })
})

describe('buildLoadMapPrintHtml', () => {
  it('arma la hoja completa con los datos del mapa real', () => {
    const row = byId(INC11)
    const html = buildLoadMapPrintHtml(row, {
      plantName: 'Planta Hispania',
      people: { 'usuario-aprobo': 'Líder de prueba' },
      printedAt: '2026-10-05T15:00:00Z',
    })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('size: letter landscape')
    expect(html).toContain('MAPA DE CARGUE DE INCUBADORA')
    expect(html).toContain(`Código:</strong> ${LOAD_MAP_FORMAT.code}`)
    expect(html).toContain('Planta Hispania')
    expect(html).toContain('Inc 11 (INC-11)')
    expect(html).toContain(INC11)
    expect(html).toContain(LOAD_MAP_STATUS_LABEL.completed)
    expect(html).toContain('Líder de prueba')
    expect(html).toContain('Compartimento izquierdo')
    expect(html).toContain('Compartimento derecho')
    expect(html).toContain('VENTILADOR CENTRAL')
    expect(html).toContain('Guía rápida del operario (N° carro → ubicación)')
    for (const z of ['PAREDES', 'CENTRO', 'SERPENTÍN']) expect(html).toContain(`<span class="zona">${z}</span>`)
    // Una celda por posición, un número de carro por carro y una casilla por fila de la guía.
    expect(html.match(/class="pos /g)).toHaveLength(12)
    expect(html.match(/class="carro-n"/g)).toHaveLength(12)
    expect(html.match(/class="casilla"/g)).toHaveLength(12)
    expect(html).toContain('<span class="trat">TRATADO</span>')
    expect(html).toContain('64.512 huevos')
    expect(html).toContain('Resumen por lote')
    expect(html).toContain('Resumen por fecha de postura')
    expect(html).toContain('19/09/2026')
    expect(html).toContain('Sin advertencias')
    for (const f of ['Clasificó', 'Aprobó', 'Cargó']) expect(html).toContain(`<div class="f-tit">${f}</div>`)
    // Fecha de cargue real (loadedAt) en hora de Colombia.
    expect(html).toContain('21/09/2026, 13:04')
  })

  it('no pide nada a internet (sirve sin conexión)', () => {
    const html = buildLoadMapPrintHtml(byId(INC02))
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/@import|<link\b|<script\b[^>]*\bsrc=/i)
    // La única imagen es el logo del membrete, servido por la misma app.
    expect(html.match(/<img\b[^>]*src="([^"]*)"/g)).toEqual(['<img src="/logo_sig.png"'])
  })

  it('INC-09: casillas vacías marcadas y los tres avisos de balance', () => {
    const html = buildLoadMapPrintHtml(byId(INC09))
    expect(html.match(/class="pos [^"]*vacia"/g)).toHaveLength(2)
    expect(html).toContain('Máquina incompleta: 10 de 12 carros')
    expect(html).toContain('Carga asimétrica: 6 carro(s) a la izquierda y 4 a la derecha')
    expect(html).toContain('DESPAREJO')
    expect(html).toContain('<section class="franja-avisos">')
    expect(html.match(/class="casilla"/g)).toHaveLength(10)
  })

  it('INC-02: anota la regularización y no muestra uuid de usuarios', () => {
    const row = byId(INC02)
    row.payload.approvedBy = '7f727d31-e610-4272-b113-1a1ea1dd31a2'
    row.approved_by = '7f727d31-e610-4272-b113-1a1ea1dd31a2'
    const html = buildLoadMapPrintHtml(row)
    expect(html).toContain('Regularizado')
    expect(html).toContain('Coordinador de ejemplo')
    expect(html).not.toContain('7f727d31-e610-4272-b113-1a1ea1dd31a2')
    // Sin nombre conocido queda la fecha de aprobación.
    expect(html).toMatch(/<span>Aprobó<\/span><b>\d{2}\/\d{2}\/2026, \d{2}:\d{2}<\/b>/)
  })

  it('escapa todo lo que viene de datos', () => {
    const row = byId(INC11)
    row.machine_name = '"><script>alert(1)</script>'
    const slot = row.payload.slots.find((s) => s.entry)
    slot.entry.lots[0].lot = '<img src=x onerror=alert(1)>'
    slot.entry.cartNumber = '<b>7</b>'
    slot.entry.color = 'red;background:url(http://x)'
    row.payload.regularizado = { motivo: "<iframe src='x'>", por: '<b>Coordinador</b>' }
    const html = buildLoadMapPrintHtml(row, { plantName: '<i>Planta</i>', orgName: '<u>Org</u>', people: { 'usuario-aprobo': '<svg onload=x>' } })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>7</b>')
    expect(html).not.toContain('<b>Coordinador</b>')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<svg onload')
    expect(html).not.toContain('<i>Planta</i>')
    expect(html).not.toContain('<u>Org</u>')
    expect(html).not.toContain('url(http://x)')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('un borrador o pendiente avisa que no se debe cargar; un rechazado dice el motivo', () => {
    const draft = buildLoadMapPrintHtml({ ...byId(INC11), status: 'pending_approval' })
    expect(draft).toContain('PENDIENTE DE APROBACIÓN — Este mapa todavía no está aprobado')
    const rejected = buildLoadMapPrintHtml({ ...byId(INC11), status: 'rejected', rejected_reason: 'Faltan <2> carros' })
    expect(rejected).toContain('RECHAZADO — NO USAR ESTA HOJA PARA CARGAR.')
    expect(rejected).toContain('Faltan &lt;2&gt; carros')
    const ready = buildLoadMapPrintHtml(byId(INC11))
    expect(ready).not.toContain('class="aviso-estado"')
    expect(ready).not.toContain('class="franja-avisos"')
  })

  it('sin fecha de cargue deja la línea para escribirla a mano', () => {
    const row = byId(INC11)
    delete row.payload.loadedAt
    delete row.payload.loaded_at
    const html = buildLoadMapPrintHtml(row)
    expect(html).toContain('<span>Fecha de cargue</span><i class="linea"></i>')
  })
})

describe('openLoadMapPrint', () => {
  it('devuelve false sin navegador o si el navegador bloquea la ventana', () => {
    expect(openLoadMapPrint(byId(INC11))).toBe(false)
    vi.stubGlobal('window', { open: () => null })
    expect(openLoadMapPrint(byId(INC11))).toBe(false)
    vi.stubGlobal('window', {
      open: () => {
        throw new Error('bloqueada')
      },
    })
    expect(openLoadMapPrint(byId(INC11))).toBe(false)
  })

  it('escribe la hoja en la ventana nueva y lanza la impresión una sola vez al cargar', () => {
    vi.useFakeTimers()
    let written = ''
    let onLoad = null
    const win = {
      document: {
        readyState: 'loading',
        open: vi.fn(),
        write: (h) => {
          written += h
        },
        close: vi.fn(),
      },
      addEventListener: (ev, fn) => {
        if (ev === 'load') onLoad = fn
      },
      focus: vi.fn(),
      print: vi.fn(),
      opener: {},
    }
    const open = vi.fn(() => win)
    vi.stubGlobal('window', { open })
    expect(openLoadMapPrint(byId(INC11), { plantName: 'Planta' })).toBe(true)
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(written).toContain('Inc 11 (INC-11)')
    expect(win.opener).toBe(null)
    expect(win.print).not.toHaveBeenCalled()
    onLoad()
    vi.advanceTimersByTime(5000)
    expect(win.print).toHaveBeenCalledTimes(1)
  })
})
