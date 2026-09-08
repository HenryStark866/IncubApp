/**
 * Reexporta la instantánea del plano — public/planta3d/data/planta.js
 *
 * La geometría (salas, puertas, equipos) es un volcado literal de Supabase,
 * incluidas ya `altura`, `parte_de` (salas en L, plenums) y `wall_heights`
 * (altura manual por muro) — columnas reales desde que el editor 2D ganó la
 * herramienta de plenums y de muro seleccionable. Para una sala vieja que no
 * se ha vuelto a tocar desde el editor, `altura`/`parte_de` siguen null en la
 * base: ahí se conserva lo que ya tenía el snapshot anterior, para no perder
 * el ajuste manual con el que se cargaron a mano antes de existir la columna.
 *
 * Lo que SIGUE sin vivir en la base, se conserva del archivo anterior:
 *
 *   salas    proyectada · medida                      (cava, cotas verificadas)
 *   equipos  ops · foto                                (derivados de la ronda)
 *   nombres  los 9 rótulos con tilde que la base no tiene
 *
 *   node scripts/planta3d-snapshot.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const DEST = 'public/planta3d/data/planta.js'

// ── credenciales ───────────────────────────────────────────────────────────
const env = {}
for (const ruta of ['.env.planta3d', '.env.migrate', '.env.local', '.env']) {
  if (!existsSync(ruta)) continue
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(linea)
    if (!m) continue
    const v = m[2].trim().replace(/^["']|["']$/g, '')
    if (v !== '' && env[m[1]] === undefined) env[m[1]] = v
  }
}
const URL_SB = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SB || !LLAVE) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (revisa .env.planta3d).')
  process.exit(1)
}
const cab = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` }
const traer = async (t, q) => {
  const r = await fetch(`${URL_SB}/rest/v1/${t}?${q}`, { headers: cab })
  if (!r.ok) throw new Error(`${t} ${r.status} ${await r.text()}`)
  return r.json()
}

const viejo = readFileSync(DEST, 'utf8')

// ── lo que solo existe aquí ────────────────────────────────────────────────
const localSalas = new Map()
for (const m of viejo.matchAll(/\{ id: '([0-9a-f-]{36})',[^\n]*?\},?\s*$/gm)) {
  const linea = m[0]
  const extra = {}
  const cap = (re, k, num) => { const x = re.exec(linea); if (x) extra[k] = num ? Number(x[1]) : x[1] }
  cap(/altura: ([0-9.]+)/, 'altura', true)
  cap(/medida: '([^']*)'/, 'medida')
  cap(/parteDe: '([^']*)'/, 'parteDe')
  if (/exterior: true/.test(linea)) extra.exterior = true
  if (/proyectada: true/.test(linea)) extra.proyectada = true
  cap(/ops: '([a-z]+)'/, 'ops')
  const f = /foto: (null|'[^']*')/.exec(linea)
  if (f) extra.foto = f[1] === 'null' ? null : f[1].slice(1, -1)
  const nm = /name: '((?:[^'\\]|\\.)*)'/.exec(linea)
  if (nm) extra._name = nm[1]
  if (Object.keys(extra).length) localSalas.set(m[1], extra)
}

// Rótulos con tilde que la base no trae: se conservan tal cual estaban.
// Salas cuyo nombre en Supabase va sin tilde y se conserva curado aqui. S26 y
// S34 salieron de la lista al eliminarse del plano; S73 y S74 se rehicieron
// como S91 y S92, que ya vienen bien escritas.
const CON_TILDE = new Set(['S32', 'S8', 'S18', 'S22', 'S31', 'S40', 'TUN'])

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? (Math.round(n * 100) / 100) : 0
}
const txt = (v) => (v == null ? 'null' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)

const plants = await traer('plants', 'select=id,name,code,address,city&limit=1')
const planta = plants[0] || {}
const rooms = await traer('rooms', 'select=id,code,name,type,nivel,pos_x,pos_y,width,height,rotation,color,doors,parte_de,altura,wall_heights,points&order=code')
const machines = await traer('machines',
  'select=id,code,name,type,brand,status,room_id,pos_x,pos_y,rotation,width,depth,height&status=neq.decommissioned&order=code')

// ── salas ──────────────────────────────────────────────────────────────────
const lineasSalas = rooms.map((r) => {
  const ex = localSalas.get(r.id) || {}
  const nombre = CON_TILDE.has(r.code) && ex._name ? ex._name : r.name
  const puertas = (r.doors || []).map((d) => {
    const partes = [`x: ${num(d.x)}`, `y: ${num(d.y)}`]
    if (d.rot != null) partes.push(`rot: ${num(d.rot)}`)
    // Las ventanas llevan su propio ancho: las de los comedores son de 2 m y
    // el resto de 1. Sin este campo el 3D las dibujaba todas de 1.
    if (d.w != null) partes.push(`w: ${num(d.w)}`)
    // Alto y antepecho propios: con base 0 y el alto del muro, la ventana es
    // una pared de vidrio entera —la esquina de la oficina.
    if (d.h != null) partes.push(`h: ${num(d.h)}`)
    if (d.base != null) partes.push(`base: ${num(d.base)}`)
    // El muro va escrito, no deducido: así reescalar una sala no le cambia de
    // sitio la puerta.
    if (d.lado) partes.push(`lado: ${txt(d.lado)}`)
    // Sentido de apertura escrito a mano ('adentro' / 'afuera'). Ausente = lo
    // decide la regla del 3D, que es lo normal; escrito, manda y ademas deja la
    // hoja fija frente al repaso que voltea las que estorban.
    if (d.abre) partes.push(`abre: ${txt(d.abre)}`)
    // Hoja de cristal: el frente de la oficina de produccion es una vidriera,
    // no un porton opaco como el resto de corredizas.
    if (d.cristal) partes.push('cristal: true')
    partes.push(`type: ${txt(d.type || 'normal')}`)
    return `{ ${partes.join(', ')} }`
  })
  const campos = [
    `id: ${txt(r.id)}`, `code: ${txt(r.code)}`, `name: ${txt(nombre)}`, `type: ${txt(r.type)}`,
    `x: ${num(r.pos_x)}`, `y: ${num(r.pos_y)}`, `w: ${num(r.width)}`, `h: ${num(r.height)}`,
    `rot: ${num(r.rotation)}`, `color: ${txt(r.color)}`,
    ...(Number(r.nivel) === 2 ? ['nivel: 2'] : []),
  ]
  // altura y parteDe ya son columnas de Supabase (antes solo vivían aquí a
  // mano): mandan si están, y si no se conserva lo que ya había en el
  // snapshot — así una sala vieja sin reeditar no pierde su ajuste manual.
  const altura = r.altura != null ? Number(r.altura) : ex.altura
  const parteDe = r.parte_de || ex.parteDe
  if (altura !== undefined) campos.push(`altura: ${altura}`)
  if (ex.proyectada) campos.push('proyectada: true')
  if (ex.medida) campos.push(`medida: ${txt(ex.medida)}`)
  if (parteDe) campos.push(`parteDe: ${txt(parteDe)}`)
  // Contorno de forma libre, en coordenadas LOCALES de la sala. Lo dibuja el
  // editor 2D y hasta ahora no salia de Supabase: el 3D levantaba el rectangulo
  // envolvente y se comia la forma. Con esto el plenum en L de las nacedoras, y
  // las salas en L de vacunacion y transferencia, se leen como son.
  if (Array.isArray(r.points) && r.points.length > 2) {
    campos.push(`puntos: [${r.points.map((p) => `{ x: ${num(p.x)}, y: ${num(p.y)} }`).join(', ')}]`)
  }
  if (r.wall_heights && Object.keys(r.wall_heights).length) {
    const wh = Object.entries(r.wall_heights)
      .map(([lado, v]) => `${lado}: ${typeof v === 'number' ? v : txt(v)}`)
      .join(', ')
    campos.push(`wallHeights: { ${wh} }`)
  }
  // Lo que no es edificio: corredores exteriores y la plataforma de
  // chillers. Las cotas generales no los cuentan.
  if (ex.exterior) campos.push('exterior: true')
  campos.push(`doors: [${puertas.join(', ')}]`)
  return `    { ${campos.join(', ')} },`
}).join('\n')

// ── equipos ────────────────────────────────────────────────────────────────
let sinPrevio = 0
const lineasMaquinas = machines.map((m) => {
  const ex = localSalas.get(m.id) || {}
  if (ex.ops === undefined) sinPrevio++
  const ops = ex.ops || 'idle'
  const foto = ex.foto === undefined ? `${m.code}.jpg` : ex.foto
  // Las medidas propias solo se escriben si las tiene: sin ellas manda la
  // medida de su tipo, que es lo que ha valido siempre para casi todos.
  const medidas = ['width', 'depth', 'height']
    .map((k, i) => (m[k] == null ? '' : `${'wdh'[i]}: ${num(m[k])}, `))
    .join('')
  return `    { id: ${txt(m.id)}, code: ${txt(m.code)}, name: ${txt(m.name)}, type: ${txt(m.type)}, ` +
    `brand: ${txt(m.brand)}, status: ${txt(m.status)}, room: ${txt(m.room_id)}, ` +
    `x: ${num(m.pos_x)}, y: ${num(m.pos_y)}, rot: ${num(m.rotation)}, ${medidas}ops: ${txt(ops)}, foto: ${txt(foto)} },`
}).join('\n')

// ── se reemplazan solo los dos bloques; el resto del archivo queda igual ────
const reemplazar = (txtFuente, clave, contenido) => {
  const ini = txtFuente.indexOf(clave)
  if (ini < 0) throw new Error(`no encuentro ${clave}`)
  const desde = ini + clave.length
  const fin = txtFuente.indexOf('\n  ],', desde)
  if (fin < 0) throw new Error(`no encuentro el cierre de ${clave}`)
  return txtFuente.slice(0, desde) + '\n' + contenido + txtFuente.slice(fin)
}

const hoy = new Date().toISOString().slice(0, 10)
let nuevo = viejo
nuevo = reemplazar(nuevo, '  rooms: [', lineasSalas)
nuevo = reemplazar(nuevo, '  machines: [', lineasMaquinas)
nuevo = nuevo.replace(/snapshot: '[^']*'/, `snapshot: '${hoy}'`)
nuevo = nuevo.replace(/Instantánea tomada el [0-9-]+/, `Instantánea tomada el ${hoy}`)
if (planta.name) nuevo = nuevo.replace(/nombre: '[^']*'/, `nombre: ${txt(planta.name)}`)

writeFileSync(DEST, nuevo, 'utf8')
console.log(`${rooms.length} salas · ${machines.length} equipos → ${DEST}`)
if (sinPrevio) console.log(`  ${sinPrevio} equipos sin ops/foto previos: quedan en 'idle' con foto por código`)
