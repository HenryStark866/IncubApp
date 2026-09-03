/**
 * Manda las ventanas al muro que da al exterior.
 *
 * Una ventana va en el muro que da al exterior, no al pasillo. El muro exterior
 * es el que no tiene sala enfrente, o el que da a un corredor exterior. Si la
 * sala tiene varias, se reparten por igual a lo largo de ese muro.
 *
 * No se tocan las paredes de vidrio de la oficina: esas arrancan del piso, son
 * muro y no ventana, y van donde está el quiebre de la L.
 *
 *   node scripts/planta-vanos.mjs            muestra lo que cambiaría
 *   node scripts/planta-vanos.mjs aplicar    lo escribe en Supabase
 */
import { existsSync, readFileSync } from 'node:fs'

const EXTERIOR = new Set(['S49', 'S50', 'S51', 'S35', 'S35B', 'S36', 'S56B', 'S65', 'S66', 'S71'])
const ANCHO_POR_DEFECTO = 1.6
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

const salas = (await (await fetch(
  `${U}/rest/v1/rooms?select=id,code,name,type,pos_x,pos_y,width,height,doors&order=code`, { headers: H }
)).json()).map((r) => ({
  id: r.id, code: r.code, name: r.name, tipo: r.type,
  x: +r.pos_x, y: +r.pos_y, w: +r.width, h: +r.height,
  doors: Array.isArray(r.doors) ? r.doors : [],
}))

const ancho = (d) => d.w ?? ANCHO_POR_DEFECTO
/** El muro donde cuelga el vano, con el mismo criterio del 3D. */
function ladoDe(r, d) {
  const a = ancho(d)
  const dist = { norte: d.y, sur: r.h - a - d.y, oeste: d.x, este: r.w - a - d.x }
  return Object.entries(dist).sort((p, q) => p[1] - q[1])[0][0]
}
const esHoriz = (l) => l === 'norte' || l === 'sur'

/** Salas que tocan a `r` por el lado `l`, con el tramo compartido. */
function vecinosDe(r, l) {
  return salas.flatMap((o) => {
    if (o.id === r.id) return []
    const pegado =
      l === 'norte' ? Math.abs(o.y + o.h - r.y) < 0.2 :
      l === 'sur' ? Math.abs(o.y - (r.y + r.h)) < 0.2 :
      l === 'oeste' ? Math.abs(o.x + o.w - r.x) < 0.2 :
      Math.abs(o.x - (r.x + r.w)) < 0.2
    if (!pegado) return []
    const ini = esHoriz(l) ? Math.max(r.x, o.x) : Math.max(r.y, o.y)
    const fin = esHoriz(l) ? Math.min(r.x + r.w, o.x + o.w) : Math.min(r.y + r.h, o.y + o.h)
    return fin - ini > 0.3 ? [{ o, ini, fin }] : []
  })
}

const cambios = new Map()   // id de sala → puertas nuevas
const notas = []

for (const r of salas) {
  if (!r.doors.length) continue
  let tocado = false
  const nuevas = r.doors.map((d) => {
    const a = ancho(d)

    // ── Ventanas: al muro exterior ──────────────────────────────────────────
    // Salvo las paredes de vidrio de la oficina, que arrancan del piso: esas
    // son muro, y van donde está el quiebre de la L.
    if (d.type === 'window') {
      if (d.base === 0) return d
      const exterior = ['norte', 'sur', 'oeste', 'este'].filter((l) => {
        const v = vecinosDe(r, l)
        return !v.length || v.every((x) => EXTERIOR.has(x.o.code))
      })
      if (!exterior.length) { notas.push(`${r.code}: no encuentro muro exterior`); return d }
      const actual = ladoDe(r, d)
      if (exterior.includes(actual)) return d
      // El muro exterior más largo, que es el que de verdad da a la fachada.
      const l = exterior.sort((p, q) => (esHoriz(q) ? r.w : r.h) - (esHoriz(p) ? r.w : r.h))[0]
      tocado = true
      // Varias ventanas en el mismo muro se reparten por igual.
      const hermanas = r.doors.filter((x) => x.type === 'window' && x.base !== 0)
      const i = hermanas.indexOf(d)
      const largo = esHoriz(l) ? r.w : r.h
      const centro = (largo * (i + 1)) / (hermanas.length + 1)
      const corre = r2(Math.max(0.05, Math.min(largo - a - 0.05, centro - a / 2)))
      const perp = l === 'norte' || l === 'oeste' ? 0 : r2((esHoriz(l) ? r.h : r.w) - a)
      notas.push(`${r.code}: ventana ${actual} → ${l} (exterior)`)
      return esHoriz(l) ? { ...d, x: corre, y: perp } : { ...d, x: perp, y: corre }
    }

    // Las puertas no se tocan aquí: las dos que había que centrar —la del
    // pasillo de la oficina hacia el de zona sucia y el vano entre las dos
    // salas de incubadoras— se ajustaron una por una, porque centrar por regla
    // general movía quince puertas y varias a muros que no les corresponden.
    return d
  })
  if (tocado) cambios.set(r.id, { code: r.code, doors: nuevas })
}

for (const n of notas) console.log('  ' + n)
console.log(`\nSalas a modificar: ${cambios.size}`)

if (process.argv[2] === 'aplicar') {
  let ok = 0
  for (const [id, v] of cambios) {
    const res = await fetch(`${U}/rest/v1/rooms?id=eq.${id}`, {
      method: 'PATCH', headers: H, body: JSON.stringify({ doors: v.doors }),
    })
    res.ok ? ok++ : console.warn('  falló', v.code, res.status, await res.text())
  }
  console.log(`Aplicado a ${ok} salas`)
}
