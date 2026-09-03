/**
 * Cuadra los bordes del plano que quedaron desalineados por centímetros.
 *
 * Al guardar con dos decimales, un borde compartido puede partirse: 81,885 se
 * vuelve 81,88 en una sala y 81,89 en la vecina, y en el 3D eso se ve como una
 * luz o un muro montado. No es un problema de geometría sino de redondeo, pero
 * se nota.
 *
 * Los bordes que están a menos de 7 cm son el MISMO muro, así que se llevan
 * todos a un solo valor —la mediana del grupo— y cada sala recalcula su tamaño
 * contra los bordes ya cuadrados. Nada se mueve más de esos 7 cm.
 *
 *   node scripts/planta-cuadrar.mjs            muestra lo que cambiaría
 *   node scripts/planta-cuadrar.mjs aplicar    lo escribe en Supabase
 */
import { existsSync, readFileSync } from 'node:fs'

const TOL = 0.07
const r2 = (v) => Math.round(v * 100) / 100

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

const res = await fetch(`${U}/rest/v1/rooms?select=id,code,name,pos_x,pos_y,width,height&order=code`, { headers: H })
const salas = (await res.json()).map((r) => ({
  id: r.id, code: r.code, name: r.name,
  x: +r.pos_x, y: +r.pos_y, w: +r.width, h: +r.height,
}))

// Medidas de campo. Cuadrar los dos bordes de una sala por separado hace que
// su tamano salga de restarlos, y ahi se pierde: el pasillo de oficinas, que
// mide 1,70, acababa en 1,62 porque su borde sur se iba a un numero limpio y el
// norte no. A una sala que YA mide lo que se midio en sitio se le cuadra la
// posicion pero se le respeta el tamano.
const MEDIDO_ANCHO = {
  S33: 2.5, S45: 7.5, S47: 4.0, S67: 2.0, S46: 6.0, S18: 6.4, S19: 3.0, S21: 10.5,
  S22: 18.5, S28: 4.0, S62: 34.5, S8: 4.0, S37: 5.0, S68: 2.0, SN1: 11, SN2: 11,
  SN3: 11, SN4: 11, S63: 4.0, S9: 11, 'TEC-1': 15, S15: 4,
}
const MEDIDO_FONDO = {
  S16: 1.7, S62: 1.7, S25: 2, S23: 2, TUN: 1.5, S33: 11, S46: 13.5, S48: 3.5,
  S45: 3.5, S67: 2.5, SN1: 5.5, SN2: 5.5, SN3: 5.5, SN4: 5.5,
  S8: 8, S37: 8, S9: 8, 'TEC-1': 8, S15: 8,
}
const esMedida = (code, valor, tabla) => {
  const m = tabla[code]
  return m != null && Math.abs(valor - m) <= 0.06
}

/**
 * El valor al que se lleva todo un grupo de bordes.
 *
 * Antes se tomaba la mediana, y eso arrastraba hacia los decimales que dejó el
 * ajuste de medidas: un muro colocado a mano en 11,00 volvía a 11,07. Ahora
 * gana el número más limpio que le sirva a TODO el grupo —primero un múltiplo
 * de medio metro, luego de diez centímetros— porque así se coloca en el plano.
 * Solo si ninguno le queda a menos de la tolerancia a cada borde del grupo, se
 * cae de vuelta a la mediana.
 */
function representante(g) {
  const min = g[0], max = g[g.length - 1]
  const centro = (min + max) / 2
  const sirve = (v) => g.every((x) => Math.abs(x - v) <= TOL)
  for (const paso of [0.5, 0.1]) {
    const cand = []
    for (let k = Math.floor(min / paso); k <= Math.ceil(max / paso); k++) {
      const v = r2(k * paso)
      if (sirve(v)) cand.push(v)
    }
    if (cand.length) {
      cand.sort((a, b) => Math.abs(a - centro) - Math.abs(b - centro))
      return cand[0]
    }
  }
  return r2(g[Math.floor(g.length / 2)])
}

/** Agrupa los bordes de un eje y devuelve a qué valor va cada uno. */
function cuadrarEje(bordes) {
  const orden = [...new Set(bordes)].sort((a, b) => a - b)
  const grupos = []
  for (const v of orden) {
    const g = grupos[grupos.length - 1]
    // Contra el PRIMERO del grupo, no contra el último: así una fila de bordes
    // separados por 5 cm no se va encadenando y arrastrando medio metro.
    if (g && v - g[0] <= TOL) g.push(v)
    else grupos.push([v])
  }
  const mapa = new Map()
  for (const g of grupos) {
    for (const v of g) mapa.set(v, representante(g))
  }
  return mapa
}

const mapaX = cuadrarEje(salas.flatMap((r) => [r.x, r.x + r.w]))
const mapaY = cuadrarEje(salas.flatMap((r) => [r.y, r.y + r.h]))

const cambios = []
for (const r of salas) {
  const nx = mapaX.get(r.x), nx2 = mapaX.get(r.x + r.w)
  const ny = mapaY.get(r.y), ny2 = mapaY.get(r.y + r.h)
  // Si el tamano ya es el medido, se conserva y solo se mueve la sala.
  const nw = esMedida(r.code, r.w, MEDIDO_ANCHO) ? r2(r.w) : r2(nx2 - nx)
  const nh = esMedida(r.code, r.h, MEDIDO_FONDO) ? r2(r.h) : r2(ny2 - ny)
  if (nx === r2(r.x) && ny === r2(r.y) && nw === r2(r.w) && nh === r2(r.h)) continue
  if (nw <= 0 || nh <= 0) {
    console.error(`  ${r.code} quedaría en ${nw}×${nh} — se deja como está`)
    continue
  }
  cambios.push({ ...r, nx, ny, nw, nh })
}

console.log(`Salas: ${salas.length} · a cuadrar: ${cambios.length}`)
for (const c of cambios) {
  const d = []
  if (c.nx !== r2(c.x)) d.push(`x ${r2(c.x)}→${c.nx}`)
  if (c.ny !== r2(c.y)) d.push(`y ${r2(c.y)}→${c.ny}`)
  if (c.nw !== r2(c.w)) d.push(`ancho ${r2(c.w)}→${c.nw}`)
  if (c.nh !== r2(c.h)) d.push(`fondo ${r2(c.h)}→${c.nh}`)
  console.log(`  ${c.code.padEnd(7)}${c.name.slice(0, 26).padEnd(27)}${d.join(' · ')}`)
}

if (process.argv[2] === 'aplicar') {
  let ok = 0
  for (const c of cambios) {
    const r = await fetch(`${U}/rest/v1/rooms?id=eq.${c.id}`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ pos_x: c.nx, pos_y: c.ny, width: c.nw, height: c.nh }),
    })
    r.ok ? ok++ : console.warn('  falló', c.code, r.status, await r.text())
  }
  console.log(`\nAplicado a ${ok} salas`)
}
