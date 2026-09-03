/**
 * Separa las salas que quedaron ocupando el mismo espacio.
 *
 * Dos salas no pueden pisarse. Cuando pasa, la que se metió encima es la que se
 * movió más recientemente —el resto llevaba días quieto— así que esa es la que
 * cede y la otra no se toca. Se desplaza lo mínimo, por el eje donde el solape
 * es más delgado: si dos salas se pisan 22 m de largo por 0,49 de ancho, lo que
 * sobra son esos 49 cm.
 *
 * Se resuelve de a uno y se vuelve a mirar, porque apartar una sala puede
 * dejarla encima de otra distinta.
 *
 *   node scripts/planta-solapes.mjs            muestra lo que haría
 *   node scripts/planta-solapes.mjs aplicar    lo escribe en Supabase
 */
import { existsSync, readFileSync } from 'node:fs'

const env = {}
for (const f of ['.env.planta3d', '.env.migrate']) {
  if (!existsSync(f)) continue
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(l)
    if (m && m[2].trim() && env[m[1]] === undefined) env[m[1]] = m[2].trim()
  }
}
const U = env.SUPABASE_URL
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
const r2 = (v) => Math.round(v * 100) / 100

const salas = (await (await fetch(
  `${U}/rest/v1/rooms?select=id,code,name,pos_x,pos_y,width,height,updated_at&order=code`, { headers: H }
)).json()).map((r) => ({
  id: r.id, code: r.code, name: r.name, t: Date.parse(r.updated_at),
  x: +r.pos_x, y: +r.pos_y, w: +r.width, h: +r.height,
}))

// Lo de afuera del edificio no entra: los corredores exteriores se solapan
// entre sí por diseño y la plataforma vive fuera del muro.
const FUERA = new Set(['S49','S50','S51','S35','S35B','S36','S56B','S65','S66','S71'])
const dentro = salas.filter((r) => !FUERA.has(r.code))
// Geometria de referencia: la ultima instantanea commiteada, que quedo
// verificada sin solapes. Sirve para saber QUIEN se metio: la sala cuyo borde
// avanzo sobre la otra desde entonces.
globalThis.window = {}
await import('file://' + process.cwd().replace(/\\/g, '/') + '/.ref-planta.js')
const REF = new Map((globalThis.window.PLANTA?.rooms || []).map((r) => [r.code, r]))

const area = (r) => r.w * r.h
const clave = (s) => [s.a.code, s.b.code].sort().join('|')

/** Un cuarto embebido en otro —el W.C. en el comedor— no es un solape. */
function encajada(a, b, ox, oy) {
  return area(a) > area(b)
    ? ox >= b.w - 0.2 && oy >= b.h - 0.2
    : ox >= a.w - 0.2 && oy >= a.h - 0.2
}

function solapes() {
  const out = []
  for (let i = 0; i < dentro.length; i++) for (let j = i + 1; j < dentro.length; j++) {
    const a = dentro[i], b = dentro[j]
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    if (ox > 0.15 && oy > 0.15 && !encajada(a, b, ox, oy)) out.push({ a, b, ox, oy })
  }
  return out
}

const tocadas = new Map()
const bitacora = []
const MIN = 0.5   // ninguna sala se recorta por debajo de medio metro

// Medidas de campo. Si una sala YA tiene el tamano que se midio en sitio, su
// problema no es que haya crecido sino que esta corrida: recortarla la dejaria
// mal medida. Esas se mueven; el resto se recortan.
const MEDIDO_ANCHO = {
  S33: 2.5, S45: 7.5, S47: 4.0, S67: 2.0, S46: 6.0, S18: 6.4, S19: 3.0, S21: 10.5,
  S22: 18.5, S28: 4.0, S62: 34.5, S8: 4.0, S37: 5.0, S68: 2.0, SN1: 11, SN2: 11,
  SN3: 11, SN4: 11, SI1: 25.33, S63: 4.0, S9: 11, 'TEC-1': 15, S15: 4,
}
const MEDIDO_FONDO = {
  S16: 1.7, S62: 1.7, S25: 2, S23: 2, TUN: 1.5, S33: 11, S46: 13.5, S48: 3.5,
  S45: 3.5, S67: 2.5, SN1: 5.5, SN2: 5.5, SN3: 5.5, SN4: 5.5,
  S8: 8, S37: 8, S9: 8, 'TEC-1': 8, S15: 8,
}
const yaMide = (r, eje) => {
  const m = eje === 'ancho' ? MEDIDO_ANCHO[r.code] : MEDIDO_FONDO[r.code]
  return m != null && Math.abs((eje === 'ancho' ? r.w : r.h) - m) <= 0.06
}

// Estos solapes no salen de mover salas sino de agrandarlas: en el plano se
// cambiaron anchos y fondos, y una sala que crece se mete en la vecina. Por eso
// no se aparta la sala —moverla 11 m para despegarla de su vecina no arregla
// nada— sino que se le recorta el borde que se metió. Es el mínimo cambio
// posible, no toca a nadie más y devuelve a la sala al tamaño que tenía antes
// de crecer.
for (let vuelta = 0; vuelta < 60; vuelta++) {
  const lista = solapes()
  if (!lista.length) break
  lista.sort((p, q) => Math.min(q.ox, q.oy) - Math.min(p.ox, p.oy))
  const { a, b, ox, oy } = lista[0]
  const eje = ox <= oy ? 'ancho' : 'fondo'

  // Quien se metio: la sala cuyo borde avanzo mas sobre la otra desde la ultima
  // version buena. Si no hay referencia, manda la que se toco mas tarde.
  const avance = (r, otra) => {
    const v = REF.get(r.code)
    // Una sala que no estaba en la version anterior es nueva: se dibujo dentro
    // de un sitio que ya tenia dueno, asi que la intrusa es ella.
    if (!v) return Infinity
    return eje === 'ancho'
      ? (r.x < otra.x ? (r.x + r.w) - (v.x + v.w) : v.x - r.x)
      : (r.y < otra.y ? (r.y + r.h) - (v.y + v.h) : v.y - r.y)
  }
  const avA = avance(a, b), avB = avance(b, a)
  const intrusa = avA === avB ? (a.t >= b.t ? a : b) : (avA > avB ? a : b)
  const quieta = intrusa === a ? b : a

  const antes = { x: intrusa.x, y: intrusa.y, w: intrusa.w, h: intrusa.h }

  // Si la sala ya mide lo que se midio en sitio, esta corrida y no crecida:
  // se aparta lo justo en vez de recortarla.
  if (yaMide(intrusa, eje)) {
    if (eje === 'ancho') intrusa.x = r2(intrusa.x + (intrusa.x < quieta.x ? -ox : ox))
    else intrusa.y = r2(intrusa.y + (intrusa.y < quieta.y ? -oy : oy))
    tocadas.set(intrusa.id, intrusa)
    bitacora.push(
      `${intrusa.code.padEnd(7)}${intrusa.name.slice(0, 24).padEnd(25)}` +
      `se aparta ${r2(Math.min(ox, oy))} m   (su ${eje} ya es el medido, no se recorta)`)
    continue
  }

  let que
  if (ox <= oy) {
    // Se recorta por el costado que está dentro de la vecina.
    if (intrusa.x < quieta.x) { intrusa.w = r2(intrusa.w - ox); que = 'ancho' }
    else { intrusa.x = r2(intrusa.x + ox); intrusa.w = r2(intrusa.w - ox); que = 'ancho' }
  } else {
    if (intrusa.y < quieta.y) { intrusa.h = r2(intrusa.h - oy); que = 'fondo' }
    else { intrusa.y = r2(intrusa.y + oy); intrusa.h = r2(intrusa.h - oy); que = 'fondo' }
  }
  if (intrusa.w < MIN || intrusa.h < MIN) {
    Object.assign(intrusa, antes)
    bitacora.push(`${intrusa.code.padEnd(7)}NO se toca: recortarla la dejaria por debajo de ${MIN} m`)
    break
  }
  tocadas.set(intrusa.id, intrusa)
  bitacora.push(
    `${intrusa.code.padEnd(7)}${intrusa.name.slice(0, 24).padEnd(25)}` +
    `${que} ${que === 'ancho' ? antes.w : antes.h} -> ${que === 'ancho' ? intrusa.w : intrusa.h}` +
    `   (se metia ${r2(Math.min(ox, oy))} m en ${quieta.code})`)
}

for (const l of bitacora) console.log('  ' + l)
const quedan = solapes()
console.log(`
Salas recortadas: ${tocadas.size} · solapes que quedan: ${quedan.length}`)
for (const q of quedan) console.log(`  --> sigue ${q.a.code} x ${q.b.code}`)

if (process.argv[2] === 'aplicar') {
  let ok = 0
  for (const r of tocadas.values()) {
    const res = await fetch(`${U}/rest/v1/rooms?id=eq.${r.id}`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ pos_x: r.x, pos_y: r.y, width: r.w, height: r.h }),
    })
    res.ok ? ok++ : console.warn('  falló', r.code, await res.text())
  }
  console.log(`Aplicado a ${ok} salas`)
}
