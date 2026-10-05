/**
 * Imagen PNG del mapa de cargue con mapas REALES de septiembre de 2026 (recortados y
 * sin datos personales: src/lib/__fixtures__/mapasCargueSeptiembre2026.json).
 *
 * Las PNG de septiembre que quedaron en el bucket (1200×500, fondo blanco, el título
 * y un solo renglón «6 · paredes · 45 12 · centro · TRATADO …» sin grilla) no salieron
 * de renderLoadMapImage: este dibujo es de 1240 px de ancho, con fondo oscuro y la
 * grilla de 12 posiciones. Lo que sí fallaba aquí: con la fila tal como viene de la
 * base (payload anidado) dibujaba las 12 posiciones «— vacío —», «Incubadora» y la
 * fecha de hoy; sin `createdAt` (objeto del Centro SIG) también ponía la fecha de hoy;
 * el texto no se recortaba a su casilla y solo mostraba el primer aviso de balance.
 * Se prueba con un lienzo simulado que registra cada llamada.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import mapas from './__fixtures__/mapasCargueSeptiembre2026.json'
import {
  LOAD_MAP_IMAGE_VERSION,
  isCurrentLoadMapImagePath,
  loadMapImageFileName,
  renderLoadMapImage,
} from './loadMapEngine'

const CELL_W = 160
const CELL_H = 140

/** Lienzo que registra cada llamada; measureText aproxima el ancho por el tamaño de letra. */
function recordingCanvas() {
  const calls = []
  const state = { font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 }
  const px = () => Number((/(\d+(?:\.\d+)?)px/.exec(state.font) || [])[1] || 10)
  const ctx = new Proxy(state, {
    get(target, prop) {
      // La negrita mide más (en Windows, «CARRO 12» en negrita de 30 px no cabe en 140 px).
      if (prop === 'measureText') return (s) => ({ width: String(s).length * px() * (/bold/.test(target.font) ? 0.68 : 0.56) })
      if (prop in target) return target[prop]
      return (...args) => calls.push({ op: prop, args, font: target.font })
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    },
  })
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,AAAA',
    toBlob: (cb) => cb({ size: 4, type: 'image/png' }),
  }
  return { canvas, calls }
}

function widthOf(call) {
  const px = Number((/(\d+(?:\.\d+)?)px/.exec(call.font) || [])[1] || 10)
  return String(call.args[0]).length * px * (/bold/.test(call.font) ? 0.68 : 0.56)
}

async function draw(map) {
  const { canvas, calls } = recordingCanvas()
  vi.stubGlobal('document', { createElement: () => canvas })
  const result = await renderLoadMapImage(map)
  const texts = calls.filter((c) => c.op === 'fillText')
  const cells = calls.filter((c) => c.op === 'strokeRect' && c.args[2] === CELL_W && c.args[3] === CELL_H)
  return { result, calls, texts, cells, strings: texts.map((t) => String(t.args[0])) }
}

/** La fila como la arma useLoadClassification (payload aplanado). */
const flattened = (row) => ({
  id: row.id,
  ...row.payload,
  status: row.status,
  machineName: row.machine_name,
  createdAt: row.created_at,
})

/** El objeto del Centro SIG: id con prefijo, rawId y sin createdAt. */
const sigObject = (row) => ({ ...row, ...row.payload, id: `load-map-${row.id}`, rawId: row.id, createdAt: undefined })

const filledOf = (row) => row.payload.slots.filter((s) => s.entry)
const bogotaDate = (iso) =>
  new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderLoadMapImage con mapas reales de septiembre', () => {
  for (const row of mapas) {
    describe(`${row.machine_name} (${row.id})`, () => {
      it('dibuja las 12 posiciones con el número de cada carro, también con la fila cruda de la base', async () => {
        for (const shape of [row, flattened(row), sigObject(row)]) {
          const { result, texts, cells, strings } = await draw(shape)
          expect(result.width).toBe(1240)
          expect(result.version).toBe(LOAD_MAP_IMAGE_VERSION)
          expect(cells).toHaveLength(12)

          const carros = strings.filter((s) => /^CARRO /.test(s)).map((s) => s.replace('CARRO ', ''))
          expect(carros.sort()).toEqual(filledOf(row).map((s) => String(s.cartNo)).sort())
          expect(strings.filter((s) => s === '— vacío —')).toHaveLength(12 - filledOf(row).length)
          expect(strings.some((s) => s.includes('TRATADO TRATADO') || s.includes('TRATADO TRAT.'))).toBe(false)

          // Nombre de la máquina y fecha de creación del mapa, no «Incubadora» ni la fecha de hoy.
          const subtitle = strings[1]
          expect(subtitle).toContain(row.machine_name)
          expect(subtitle).toContain(bogotaDate(row.created_at))
          expect(subtitle).toContain(`ID ${row.id}`)

          // Nada se sale del lienzo.
          for (const t of texts) {
            if (t.args[0] === 'VENTILADOR CENTRAL') continue // va rotado sobre el eje
            expect(t.args[1] + widthOf(t)).toBeLessThanOrEqual(result.width)
            expect(t.args[2]).toBeLessThanOrEqual(result.height)
          }
        }
      })

      it('la fila cruda y el mapa aplanado dan el mismo dibujo', async () => {
        const a = await draw(row)
        const b = await draw(flattened(row))
        expect(a.strings).toEqual(b.strings)
        expect(a.result.height).toBe(b.result.height)
      })

      it('ningún texto de una casilla se monta sobre la casilla vecina', async () => {
        const { texts, cells } = await draw(row)
        for (const t of texts) {
          const [, x, y] = t.args
          const cell = cells.find((c) => x >= c.args[0] && x <= c.args[0] + CELL_W && y >= c.args[1] && y <= c.args[1] + CELL_H)
          if (!cell) continue
          expect(x + widthOf(t)).toBeLessThanOrEqual(cell.args[0] + CELL_W)
          expect(y).toBeLessThanOrEqual(cell.args[1] + CELL_H)
        }
      })
    })
  }

  it('INC-09 (10 carros) muestra los tres avisos de balance, no solo el primero', async () => {
    const row = mapas.find((m) => m.id === 'lc_mu077be8_q5ubnz')
    const { strings } = await draw(row)
    const warnings = strings.filter((s) => s.startsWith('⚠ '))
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toContain('Máquina incompleta: 10 de 12')
    expect(warnings[1]).toContain('Carga asimétrica')
    expect(warnings[2]).toContain('Zona Serpentín')
  })

  it('acepta el payload como texto JSON', async () => {
    const row = mapas[0]
    const a = await draw({ ...row, payload: JSON.stringify(row.payload) })
    const b = await draw(row)
    expect(a.strings).toEqual(b.strings)
  })

  it('recorta lotes de nombre largo y resume los carros de más de 3 lotes', async () => {
    const row = JSON.parse(JSON.stringify(mapas[0]))
    const slot = row.payload.slots.find((s) => s.entry)
    slot.entry.lots = [
      { lot: 'LOTE-DE-NOMBRE-MUY-LARGO-0123456789-ABCDEFGHIJ', trays: 4, productionDate: '2026-08-30' },
      { lot: '45', trays: 4, productionDate: '2026-08-31' },
      { lot: '46', trays: 4, productionDate: '2026-09-01' },
      { lot: '47', trays: 2, productionDate: '2026-09-01' },
      { lot: 'TRATADO', isTreated: true, trays: 2, productionDate: '2026-09-01' },
    ]
    const { texts, cells, strings } = await draw(row)
    expect(strings).toContain('5 LOTES EN ESTE CARRO')
    expect(strings).toContain('… +3 lotes más')
    expect(strings.some((s) => s.startsWith('• Lote LOTE-DE-NOMBRE') && s.endsWith('…'))).toBe(true)
    for (const t of texts) {
      const cell = cells.find(
        (c) => t.args[1] >= c.args[0] && t.args[1] <= c.args[0] + CELL_W && t.args[2] >= c.args[1] && t.args[2] <= c.args[1] + CELL_H
      )
      if (cell) expect(t.args[1] + widthOf(t)).toBeLessThanOrEqual(cell.args[0] + CELL_W)
    }
  })

  it('un mapa sin datos no revienta: 12 posiciones vacías y el aviso de que no hay carros', async () => {
    const { cells, strings } = await draw(null)
    expect(cells).toHaveLength(12)
    expect(strings.filter((s) => s === '— vacío —')).toHaveLength(12)
    expect(strings).toContain('⚠ No hay carros asignados.')
  })
})

describe('ruta versionada de la imagen', () => {
  it('distingue las imágenes del dibujo actual de las viejas', () => {
    const name = loadMapImageFileName('lc_mubx9tpt_ozyave')
    expect(name).toBe(`lc_mubx9tpt_ozyave.v${LOAD_MAP_IMAGE_VERSION}.png`)
    expect(isCurrentLoadMapImagePath(`org/load-maps/${name}`)).toBe(true)
    // Las de septiembre (sin versión en el nombre) se deben volver a generar.
    expect(isCurrentLoadMapImagePath('org/load-maps/lc_mubx9tpt_ozyave.png')).toBe(false)
    expect(isCurrentLoadMapImagePath(null)).toBe(false)
  })
})
