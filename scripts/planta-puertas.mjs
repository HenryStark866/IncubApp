/**
 * Da coherencia al ancho y la posición de las puertas.
 *
 * Hoy están casi todas en 1,60 m, que es el ancho de un paso de carros. Una
 * puerta de oficina no mide eso. El ancho sale de por dónde se pasa:
 *
 *   0,70  el cubículo de un W.C.
 *   0,90  puerta de persona: comunica dos sitios por donde solo pasa gente
 *   1,60  paso de carros: si a un lado hay incubación, nacimiento, lavado,
 *         huevo o procesamiento de pollito, por ahí entra un carro
 *   2,60  muelle de carga, que ya lo resuelve el 3D por el tipo `loading`
 *
 * Y la posición: la puerta que está pegada a una esquina se centra en el muro
 * que comparten las dos salas. La que ya está suelta en mitad del muro se
 * respeta —ahí hay una decisión de recorrido— y un par de puertas repartidas
 * por el mismo muro tampoco se toca, que centrarlas las amontonaría.
 *
 *   node scripts/planta-puertas.mjs            muestra lo que cambiaría
 *   node scripts/planta-puertas.mjs aplicar    lo escribe en Supabase
 */
import { existsSync, readFileSync } from 'node:fs'

const PEATONAL = 0.9
const CARROS = 1.6
const r2 = (v) => Math.round(v * 100) / 100

// Salas por donde circulan carros: si una puerta toca una de estas, es paso de
// carros y no de persona.
const DE_CARROS = new Set([
  'incubation', 'hatching', 'washing', 'egg_storage', 'chick_processing',
])

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
  `${U}/rest/v1/rooms?select=id,code,name,type,nivel,pos_x,pos_y,width,height,doors&order=code`, { headers: H }
)).json()).map((r) => ({
  id: r.id, code: r.code, name: r.name, tipo: r.type, nivel: Number(r.nivel) || 1,
  x: +r.pos_x, y: +r.pos_y, w: +r.width, h: +r.height,
  doors: Array.isArray(r.doors) ? r.doors : [],
}))

const esBano = (r) => /^\s*W\.?C\.?\s*$/i.test(r.name || '')
const horizontal = (l) => l === 'arriba' || l === 'abajo'

// Espacios confinados del segundo nivel: cuartos de maquinas y tuneles de aire.
// Sus vanos son escotillas de servicio medidas en campo --70x70, 70x90, 90x90,
// 90x80-- y no salen de ninguna regla. Sin esta excepcion, la regla general las
// veia como <<puerta que toca una nacedora>> y las ensanchaba a paso de carros.
const esConfinado = (r) =>
  /^CUARTO DE M[AAÁ]QUINAS/i.test((r.name || '').trim()) ||
  /^T[UUÚ]NEL\s/i.test((r.name || '').trim())

/** La sala que hay al otro lado de este vano, y el tramo de muro que comparten. */
function alOtroLado(r, d) {
  const a = d.w ?? CARROS
  const l = d.lado || 'arriba'
  const h = horizontal(l)
  const desde = (h ? r.x : r.y) + (h ? d.x : d.y)
  const hasta = desde + a
  const muro = l === 'arriba' ? r.y : l === 'abajo' ? r.y + r.h : l === 'izquierda' ? r.x : r.x + r.w
  let mejor = null
  for (const o of salas) {
    if (o.id === r.id || o.nivel !== r.nivel) continue
    const pega = h
      ? Math.abs((l === 'arriba' ? o.y + o.h : o.y) - muro) < 0.25
      : Math.abs((l === 'izquierda' ? o.x + o.w : o.x) - muro) < 0.25
    if (!pega) continue
    const ini = h ? Math.max(r.x, o.x) : Math.max(r.y, o.y)
    const fin = h ? Math.min(r.x + r.w, o.x + o.w) : Math.min(r.y + r.h, o.y + o.h)
    if (fin - ini < 0.3) continue
    // La que de verdad está enfrente del vano
    if (fin > desde && ini < hasta) return { o, ini, fin }
    if (!mejor) mejor = { o, ini, fin }
  }
  return mejor
}

// Salas que no son de carros por su tipo pero por cuya puerta sí entra algo
// grande. El almacén de la máquina de transferencia es un cuarto técnico, y aun
// así por ahí se mete la máquina: con 0,90 no pasa.
const SIEMPRE_ANCHA = new Set(['S63'])

// Ancho de la puertilla de acceso al plenum. No sale de ninguna regla: es una
// puerta de servicio, deliberadamente estrecha, y la regla general la veria
// como «puerta que toca una nacedora» y la ensancharia a paso de carros.
const PUERTILLA_PLENUM = 0.6

const anchoQueLeToca = (r, vecina, d) => {
  if (d.type === 'loading') return null            // el muelle lo pone el 3D
  if (d.w === PUERTILLA_PLENUM) return PUERTILLA_PLENUM
  if (vecina && esConfinado(vecina)) return d.w ?? PEATONAL
  if (esBano(r) || (vecina && esBano(vecina))) return 0.7
  if (d.type === 'sliding' || d.type === 'open') return CARROS
  if (SIEMPRE_ANCHA.has(r.code) || (vecina && SIEMPRE_ANCHA.has(vecina.code))) return CARROS
  const tocaCarros = DE_CARROS.has(r.tipo) || (vecina && DE_CARROS.has(vecina.tipo))
  return tocaCarros ? CARROS : PEATONAL
}

const cambios = new Map()
const notas = []

for (const r of salas) {
  if (!r.doors.length) continue
  if (esConfinado(r)) continue
  let tocado = false
  const nuevas = r.doors.map((d) => {
    if (d.type === 'window') return d
    // La puertilla del plenum no se toca ni de ancho ni de sitio: va colocada
    // dentro de la franja libre detras de las maquinas, y centrarla en el muro
    // compartido la sacaria de ahi y la dejaria contra la linea de nacedoras.
    if (d.w === PUERTILLA_PLENUM) return d
    const l = d.lado
    if (!l) return d
    const h = horizontal(l)
    const largo = h ? r.w : r.h
    const vec = alOtroLado(r, d)
    let n = { ...d }
    let porQue = []

    // ── Ancho ────────────────────────────────────────────────────────────
    const objetivo = anchoQueLeToca(r, vec?.o, d)
    const actual = d.w ?? CARROS
    if (objetivo != null && Math.abs(objetivo - actual) > 0.01 && objetivo <= largo - 0.1) {
      n.w = objetivo
      porQue.push(`${actual} → ${objetivo} m`)
    }
    const a = n.w ?? CARROS

    // ── Posición ─────────────────────────────────────────────────────────
    // Solo la que está pegada a una esquina, y solo si está sola en ese muro.
    const corre = h ? n.x : n.y
    const abs = (h ? r.x : r.y) + corre
    if (vec) {
      const solas = r.doors.filter((x) => x !== d && x.type !== 'window' && (x.lado || 'arriba') === l)
      const aEsquina = Math.min(abs - vec.ini, vec.fin - (abs + a))
      if (!solas.length && aEsquina < 0.35) {
        const centro = (vec.ini + vec.fin) / 2 - (h ? r.x : r.y)
        const nuevo = r2(Math.max(0.05, Math.min(largo - a - 0.05, centro - a / 2)))
        if (Math.abs(nuevo - corre) > 0.02) {
          if (h) n.x = nuevo; else n.y = nuevo
          porQue.push(`centrada hacia ${vec.o.code}`)
        }
      }
    }
    // El borde perpendicular se recalcula: al cambiar el ancho, una puerta
    // pegada al muro sur o al oriental se descolgaría de él.
    if (l === 'abajo') n.y = r2(r.h - a)
    if (l === 'derecha') n.x = r2(r.w - a)
    if (l === 'arriba') n.y = 0
    if (l === 'izquierda') n.x = 0

    if (porQue.length || n.x !== d.x || n.y !== d.y) {
      tocado = true
      if (porQue.length) {
        notas.push(`  ${r.code.padEnd(7)}${(vec ? '→ ' + vec.o.code : '(sin vecina)').padEnd(12)}${d.type.padEnd(8)}${porQue.join(' · ')}`)
      }
    }
    return n
  })
  if (tocado) cambios.set(r.id, { code: r.code, doors: nuevas })
}

for (const n of notas) console.log(n)
console.log(`\nPuertas ajustadas: ${notas.length} · salas a escribir: ${cambios.size}`)

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
