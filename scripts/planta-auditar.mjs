/**
 * Repasa la planta 3D entera y canta lo que no cuadra.
 *
 * Doce comprobaciones sobre la instantánea: códigos repetidos, salas de tamaño
 * imposible, solapes, rendijas de pocos centímetros entre salas pegadas, vanos
 * que se salen de su muro o se pisan entre sí, cuartos sin acceso, puertas que
 * no dan a ninguna parte, equipos que se salen de su sala, salas del nivel 2
 * que no se apoyan en la losa, remates que atraviesan la cubierta y paradas del
 * recorrido que apuntan a códigos muertos.
 *
 * Lee `public/planta3d/data/planta.js`, así que primero conviene refrescarla:
 *
 *   node scripts/planta3d-snapshot.mjs
 *   node scripts/planta-auditar.mjs
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
globalThis.window = {}
require(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'planta3d', 'data', 'planta.js'))
const P = globalThis.window.PLANTA
const R = P.rooms
const M = P.machines
const meta = P.meta

const E = meta.alturaEntrepiso || 0
const CAIDA = 1
const maq = (n) => /^CUARTO DE M[AÁ]QUINAS/i.test(n || '')
const tun = (n) => /^T[UÚ]NEL\s/i.test(n || '')
const tunInc = (n) => tun(n) && /INCUBADORAS/i.test(n)
const n2 = (r) => Number(r.nivel) === 2
const cota = (r) => !n2(r) ? 0 : ((maq(r.name) || tunInc(r.name)) ? E - CAIDA : E)
const alto = (r) => maq(r.name) ? CAIDA : (r.altura || (P.tiposSala[r.type] || {}).altura || meta.alturaMuro)
const conMuro = (r) => (P.tiposSala[r.type] || {}).muro !== false
const x1 = (r) => r.x + r.w, y1 = (r) => r.y + r.h
const porId = new Map(R.map((r) => [r.id, r]))
const nom = (r) => r.code + ' ' + (r.name || '').slice(0, 26)

const fallos = []
const avisa = (cat, txt) => fallos.push({ cat, txt })

// -- 1. tamanos y codigos ---------------------------------------------------
const vistos = new Set()
for (const r of R) {
  if (vistos.has(r.code)) avisa('codigo', r.code + ' esta repetido')
  vistos.add(r.code)
  if (!(r.w > 0.05) || !(r.h > 0.05)) avisa('tamano', nom(r) + ' mide ' + r.w + 'x' + r.h)
  if (alto(r) <= 0.05 && conMuro(r)) avisa('altura', nom(r) + ' tiene altura ' + alto(r))
}

// -- 2. solapes en el mismo nivel -------------------------------------------
// Una sala metida DENTRO de otra no es solape (los tuneles van dentro del area
// tecnica). Lo que si lo es: dos salas que se cruzan a medias.
const dentro = (a, b) => a.x >= b.x - 0.02 && x1(a) <= x1(b) + 0.02 && a.y >= b.y - 0.02 && y1(a) <= y1(b) + 0.02

// Contorno real de una sala: su poligono si lo tiene, y si no su rectangulo.
// Comparar rectangulos daba solapes que no existen: la sala de transferencia
// lleva un recorte justo donde pasa el pasillo del tunel, y la de vacunacion
// otro donde termina lavado nacimiento.
const contorno = (r) => Array.isArray(r.puntos) && r.puntos.length > 2
  ? r.puntos.map((p) => ({ x: r.x + p.x, y: r.y + p.y }))
  : [{ x: r.x, y: r.y }, { x: x1(r), y: r.y }, { x: x1(r), y: y1(r) }, { x: r.x, y: y1(r) }]
const enPoligono = (px, py, pol) => {
  let d = false
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const xi = pol[i].x, yi = pol[i].y, xj = pol[j].x, yj = pol[j].y
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) d = !d
  }
  return d
}
// Se pisan de verdad? Se muestrea el rectangulo comun contra los dos contornos.
const sePisanDeVerdad = (a, b, x0, xf, y0, yf) => {
  const pa = contorno(a), pb = contorno(b)
  const n = 9
  let dentroLosDos = 0, total = 0
  for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
    const px = x0 + ((xf - x0) * i) / n, py = y0 + ((yf - y0) * j) / n
    total++
    if (enPoligono(px, py, pa) && enPoligono(px, py, pb)) dentroLosDos++
  }
  return dentroLosDos / total > 0.12
}
for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
  const a = R[i], b = R[j]
  if ((Number(a.nivel) || 1) !== (Number(b.nivel) || 1)) continue
  if (a.parteDe === b.id || b.parteDe === a.id) continue
  // Los salones y tuneles del segundo nivel van EMBEBIDOS en el area tecnica de
  // ambiente controlado: que se pisen en planta es el diseno, no un error.
  if (a.code === 'S86' || b.code === 'S86') continue
  // Una sala PROYECTADA se dibuja donde quedara, y eso suele ser encima de lo
  // que hoy ocupa ese sitio: la cava del huevo va sobre un corredor exterior
  // que existe. Conviven el hoy y el manana a proposito.
  if (a.proyectada || b.proyectada) continue
  const ox = Math.min(x1(a), x1(b)) - Math.max(a.x, b.x)
  const oy = Math.min(y1(a), y1(b)) - Math.max(a.y, b.y)
  if (ox <= 0.06 || oy <= 0.06) continue
  if (dentro(a, b) || dentro(b, a)) continue
  if (!sePisanDeVerdad(a, b, Math.max(a.x, b.x), Math.min(x1(a), x1(b)), Math.max(a.y, b.y), Math.min(y1(a), y1(b)))) continue
  avisa('solape', nom(a) + ' x ' + nom(b) + ' -- ' + ox.toFixed(2) + 'x' + oy.toFixed(2) + ' m (nivel ' + (a.nivel || 1) + ')')
}

// -- 3. vanos fuera de su muro ----------------------------------------------
const ALTO_DEF = { window: 1, loading: 2.8, sliding: 2.9, open: 2.9 }
for (const r of R) {
  const ds = r.doors || []
  for (const d of ds) {
    const l = d.lado || 'arriba'
    const horiz = l === 'arriba' || l === 'abajo'
    const largo = horiz ? r.w : r.h
    const corre = horiz ? d.x : d.y
    const a = d.w != null ? d.w : 1.6
    if (corre < -0.02 || corre + a > largo + 0.02)
      avisa('vano', nom(r) + ' -- vano de ' + a + ' m en "' + l + '" va de ' + corre.toFixed(2) + ' a ' + (corre + a).toFixed(2) + ' sobre un muro de ' + largo + ' m')
    const hv = d.h != null ? d.h : (ALTO_DEF[d.type] || 2.15)
    const base = d.base != null ? d.base : (d.type === 'window' ? 1 : 0)
    if (base + hv > alto(r) + 0.02)
      avisa('vano', nom(r) + ' -- vano de ' + hv + ' m a ' + base + ' llega a ' + (base + hv).toFixed(2) + ' en un muro de ' + alto(r) + ' m')
  }
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
    const p = ds[i], q = ds[j]
    const lp = p.lado || 'arriba', lq = q.lado || 'arriba'
    if (lp !== lq) continue
    const h = lp === 'arriba' || lp === 'abajo'
    const pa = h ? p.x : p.y, qa = h ? q.x : q.y
    const sol = Math.min(pa + (p.w != null ? p.w : 1.6), qa + (q.w != null ? q.w : 1.6)) - Math.max(pa, qa)
    if (sol > 0.02) avisa('vano', nom(r) + ' -- dos vanos se pisan ' + sol.toFixed(2) + ' m en el muro "' + lp + '"')
  }
}

// -- 3b. dos vanos en el mismo hueco ----------------------------------------
// Cuando dos salas vecinas declaran cada una su puerta en el mismo tramo de
// muro, el 3D cuelga DOS hojas en el mismo agujero. Asi estaban el comedor de
// zona sucia y su W.C., y las puertillas del plenum de nacedoras 1 y 2 contra
// las corredizas de transferencia.
const absolutos = []
for (const r of R) for (const d of (r.doors || [])) {
  const l = d.lado || 'arriba'
  const h = l === 'arriba' || l === 'abajo'
  const pos = l === 'arriba' ? r.y : l === 'abajo' ? y1(r) : l === 'izquierda' ? r.x : x1(r)
  const a = d.w != null ? d.w : 1.6
  absolutos.push({ r, eje: h ? 'h' : 'v', pos, de: (h ? r.x : r.y) + (h ? d.x : d.y), a, tipo: d.type })
}
for (let i = 0; i < absolutos.length; i++) for (let j = i + 1; j < absolutos.length; j++) {
  const p = absolutos[i], q = absolutos[j]
  if (p.r.id === q.r.id) continue
  if ((Number(p.r.nivel) || 1) !== (Number(q.r.nivel) || 1)) continue
  if (p.eje !== q.eje || Math.abs(p.pos - q.pos) > 0.3) continue
  const sol = Math.min(p.de + p.a, q.de + q.a) - Math.max(p.de, q.de)
  if (sol > 0.25) avisa('vano', nom(p.r) + ' (' + p.tipo + ') y ' + nom(q.r) + ' (' + q.tipo + ') comparten ' + sol.toFixed(2) + ' m del mismo hueco')
}

// -- 3c. vanos tapados por un equipo ----------------------------------------
// No basta con que la puerta quepa en el muro: delante tiene que quedar sitio
// para pasar. Una incubadora pegada a la jamba deja el vano inservible.
//
// Se mira a los dos lados del muro, no solo dentro de la sala que declara la
// puerta: la corrediza de Almacenamiento de carros daba contra una nacedora
// que esta en la sala de ENFRENTE, y mirando solo la propia no se veia.
const PASO_LIBRE = 0.9
const cajaEquipo = (m) => {
  const r = porId.get(m.room)
  const t = (P.tiposEquipo || {})[m.type] || { w: 1, d: 1 }
  const q = ((Math.round((m.rot || 0) / 90) * 90) % 360 + 360) % 360
  const gira = q === 90 || q === 270
  return { code: m.code, nivel: Number(r.nivel) || 1,
    x0: r.x + m.x, x1: r.x + m.x + (gira ? t.d : t.w),
    y0: r.y + m.y, y1: r.y + m.y + (gira ? t.w : t.d) }
}
const equipos = M.filter((m) => porId.get(m.room)).map(cajaEquipo)
for (const r of R) {
  // El plenum es el vacio entre el cielo del salon y la losa: su puertilla
  // esta a casi tres metros, con las maquinas DEBAJO y no delante. Mirarla en
  // planta la daria siempre por tapada.
  if (r.type === 'plenum') continue
  for (const d of (r.doors || [])) {
    if (d.type === 'window') continue
    const l = d.lado || 'arriba'
    const h = l === 'arriba' || l === 'abajo'
    const a = d.w != null ? d.w : 1.6
    const pos = l === 'arriba' ? r.y : l === 'abajo' ? y1(r) : l === 'izquierda' ? r.x : x1(r)
    const de = (h ? r.x : r.y) + (h ? d.x : d.y)
    // Franja de paso a AMBOS lados del muro
    const z = h
      ? { x0: de, x1: de + a, y0: pos - PASO_LIBRE, y1: pos + PASO_LIBRE }
      : { x0: pos - PASO_LIBRE, x1: pos + PASO_LIBRE, y0: de, y1: de + a }
    for (const m of equipos) {
      if (m.nivel !== (Number(r.nivel) || 1)) continue
      const ox = Math.min(z.x1, m.x1) - Math.max(z.x0, m.x0)
      const oy = Math.min(z.y1, m.y1) - Math.max(z.y0, m.y0)
      if (ox > 0.1 && oy > 0.1)
        avisa('vano', nom(r) + ' -- el vano de "' + l + '" lo tapa ' + m.code + ' (' + ox.toFixed(2) + 'x' + oy.toFixed(2) + ' m)')
    }
  }
}

// (se conserva ademas la comprobacion contra los muebles de la propia sala)
for (const r of R) {
  const eq = M.filter((m) => m.room === r.id).map((m) => {
    const t = (P.tiposEquipo || {})[m.type] || { w: 1, d: 1 }
    const q = ((Math.round((m.rot || 0) / 90) * 90) % 360 + 360) % 360
    const gira = q === 90 || q === 270
    return { code: m.code, x0: m.x, x1: m.x + (gira ? t.d : t.w), y0: m.y, y1: m.y + (gira ? t.w : t.d) }
  })
  if (!eq.length) continue
  for (const d of (r.doors || [])) {
    if (d.type === 'window') continue
    const l = d.lado || 'arriba'
    const h = l === 'arriba' || l === 'abajo'
    const a = d.w != null ? d.w : 1.6
    const z = h
      ? { x0: d.x, x1: d.x + a, y0: l === 'arriba' ? 0 : r.h - PASO_LIBRE, y1: l === 'arriba' ? PASO_LIBRE : r.h }
      : { y0: d.y, y1: d.y + a, x0: l === 'izquierda' ? 0 : r.w - PASO_LIBRE, x1: l === 'izquierda' ? PASO_LIBRE : r.w }
    for (const m of eq) {
      const ox = Math.min(z.x1, m.x1) - Math.max(z.x0, m.x0)
      const oy = Math.min(z.y1, m.y1) - Math.max(z.y0, m.y0)
      if (ox > 0.1 && oy > 0.1) avisa('vano', nom(r) + ' -- el vano de "' + l + '" lo tapa ' + m.code + ' (' + ox.toFixed(2) + 'x' + oy.toFixed(2) + ' m)')
    }
  }
}

// -- 4. accesos -------------------------------------------------------------
const abreHacia = new Set()
for (const r of R) for (const d of (r.doors || [])) {
  if (d.type === 'window') continue
  const l = d.lado || 'arriba'
  const h = l === 'arriba' || l === 'abajo'
  const muro = l === 'arriba' ? r.y : l === 'abajo' ? y1(r) : l === 'izquierda' ? r.x : x1(r)
  const de = (h ? r.x : r.y) + (h ? d.x : d.y), a = de + (d.w != null ? d.w : 1.6)
  for (const o of R) {
    if (o.id === r.id || (Number(o.nivel) || 1) !== (Number(r.nivel) || 1)) continue
    const pega = h
      ? Math.abs((l === 'arriba' ? y1(o) : o.y) - muro) < 0.3
      : Math.abs((l === 'izquierda' ? x1(o) : o.x) - muro) < 0.3
    if (!pega) continue
    const ini = h ? Math.max(r.x, o.x) : Math.max(r.y, o.y)
    const fin = h ? Math.min(x1(r), x1(o)) : Math.min(y1(r), y1(o))
    if (fin > de - 0.05 && ini < a + 0.05) { abreHacia.add(o.id); abreHacia.add(r.id) }
  }
}
// Salas a las que no se entra por una puerta y esta bien: el area tecnica se
// alcanza por la escalera del entrepiso, y los cuartos de maquinas de las
// nacedoras van despejados por arriba —la losa se recorta sobre ellos— y se
// bajan desde el segundo nivel.
const SIN_PUERTA_A_PROPOSITO = new Set(['S86', 'S82', 'S83', 'S84', 'S85'])
const ESCALERA = SIN_PUERTA_A_PROPOSITO
for (const r of R) {
  if (!conMuro(r) || r.exterior) continue
  const propias = (r.doors || []).filter((d) => d.type !== 'window')
  if (propias.length || abreHacia.has(r.id) || ESCALERA.has(r.code)) continue
  avisa('acceso', nom(r) + ' no tiene por donde entrar (nivel ' + (r.nivel || 1) + ')')
}

// Aristas del contorno, para las salas de forma libre: el `lado` que trae la
// puerta lo calcula el editor 2D contra el RECTANGULO ENVOLVENTE, y en una sala
// dibujada a mano el muro real puede estar metros adentro. El 3D ya resuelve la
// puerta contra la arista mas cercana (mundo.js); aqui se hace igual, o el area
// tecnica salia con una puerta "que no da a ninguna parte" que si da.
const aristas = (r) => {
  const p = contorno(r)
  const out = []
  for (let i = 0; i < p.length; i++) {
    const A = p[i], B = p[(i + 1) % p.length]
    if (Math.abs(A.y - B.y) < 0.02 && Math.abs(A.x - B.x) > 0.02)
      out.push({ h: true, pos: (A.y + B.y) / 2, a: Math.min(A.x, B.x), b: Math.max(A.x, B.x) })
    else if (Math.abs(A.x - B.x) < 0.02 && Math.abs(A.y - B.y) > 0.02)
      out.push({ h: false, pos: (A.x + B.x) / 2, a: Math.min(A.y, B.y), b: Math.max(A.y, B.y) })
  }
  return out
}
const aristaDePuerta = (r, d) => {
  if (!Array.isArray(r.puntos) || r.puntos.length < 3) return null
  let mejor = null, dMin = Infinity
  for (const s of (aristas(r) || [])) {
    const along = s.h ? r.x + d.x : r.y + d.y
    if (along < s.a - 0.6 || along > s.b + 0.6) continue
    const dist = Math.abs((s.h ? r.y + d.y : r.x + d.x) - s.pos)
    if (dist < dMin) { dMin = dist; mejor = s }
  }
  return mejor
}

// -- 5. puertas que dan a la nada -------------------------------------------
for (const r of R) {
  if (!conMuro(r)) continue
  for (const d of (r.doors || [])) {
    if (d.type === 'window' || d.type === 'loading') continue
    const ar = aristaDePuerta(r, d)
    const l = ar
      ? (ar.h ? (ar.pos > r.y + r.h / 2 ? 'abajo' : 'arriba') : (ar.pos > r.x + r.w / 2 ? 'derecha' : 'izquierda'))
      : (d.lado || 'arriba')
    const h = l === 'arriba' || l === 'abajo'
    const muro = ar ? ar.pos
      : l === 'arriba' ? r.y : l === 'abajo' ? y1(r) : l === 'izquierda' ? r.x : x1(r)
    const de = (h ? r.x : r.y) + (h ? d.x : d.y), a = de + (d.w != null ? d.w : 1.6)
    const hay = R.some((o) => {
      if (o.id === r.id || (Number(o.nivel) || 1) !== (Number(r.nivel) || 1)) return false
      const pega = h
        ? Math.abs((l === 'arriba' ? y1(o) : o.y) - muro) < 0.3
        : Math.abs((l === 'izquierda' ? x1(o) : o.x) - muro) < 0.3
      if (!pega) return false
      const ini = h ? Math.max(r.x, o.x) : Math.max(r.y, o.y)
      const fin = h ? Math.min(x1(r), x1(o)) : Math.min(y1(r), y1(o))
      return fin > de + 0.05 && ini < a - 0.05
    })
    const anfitriona = R.some((o) => o.id !== r.id && (Number(o.nivel) || 1) === (Number(r.nivel) || 1) && dentro(r, o))
    // A las salas que se alcanzan por la escalera del entrepiso la puerta les da
    // al desembarco, que no es una sala: exigirle vecina de su mismo nivel es
    // pedirle algo que no existe.
    if (!hay && !anfitriona && !ESCALERA.has(r.code)) avisa('puerta', nom(r) + ' -- puerta en "' + l + '" no da a ninguna sala (nivel ' + (r.nivel || 1) + ')')
  }
}

// -- 6. equipos fuera de su sala --------------------------------------------
const TIPO = P.tiposEquipo || {}
for (const m of M) {
  const r = porId.get(m.room)
  if (!r) { avisa('equipo', m.code + ' apunta a una sala que no existe'); continue }
  const t = TIPO[m.type] || { w: 1, d: 1 }
  const rot = ((Math.round((m.rot || 0) / 90) * 90) % 360 + 360) % 360
  const w = (rot === 90 || rot === 270) ? t.d : t.w
  const d = (rot === 90 || rot === 270) ? t.w : t.d
  if (m.x < -0.05 || m.y < -0.05 || m.x + w > r.w + 0.05 || m.y + d > r.h + 0.05)
    avisa('equipo', m.code + ' (' + w + 'x' + d + ') se sale de ' + nom(r) + ' (' + r.w + 'x' + r.h + '): va de ' + m.x + ',' + m.y)
}

// -- 7. nivel 2 sobre el entrepiso ------------------------------------------
const CON = new Set(meta.entrepisoSalas || [])
const losa = R.filter((r) => CON.has(r.code))
const EXTENSION = new Set(['S86'])   // marca de area, no cuarto
for (const r of R.filter(n2)) {
  if (EXTENSION.has(r.code)) continue
  let area = 0
  for (const o of losa) {
    const ox = Math.min(x1(r), x1(o)) - Math.max(r.x, o.x)
    const oy = Math.min(y1(r), y1(o)) - Math.max(r.y, o.y)
    if (ox > 0 && oy > 0) area += ox * oy
  }
  const pct = area / (r.w * r.h)
  if (pct < 0.98) avisa('entrepiso', nom(r) + ' esta en el nivel 2 pero solo el ' + (pct * 100).toFixed(0) + '% cae sobre la losa')
}

// -- 8. altura contra la cubierta -------------------------------------------
const ALERO_F = meta.alturaMuro, ALERO_A = meta.alturaMuroAtras || ALERO_F, CUM = meta.alturaCumbrera || ALERO_F
const yA = meta.fachadaAtrasY, yF = meta.fachadaFrenteY, yC = (yA + yF) / 2
const bajoCubierta = (z) => z <= yC
  ? ALERO_A + (CUM - ALERO_A) * Math.max(0, Math.min(1, (z - yA) / (yC - yA)))
  : CUM + (ALERO_F - CUM) * Math.max(0, Math.min(1, (z - yC) / (yF - yC)))
for (const r of R) {
  if (!conMuro(r) || r.exterior) continue
  const techo = cota(r) + alto(r)
  const libre = Math.min(bajoCubierta(r.y), bajoCubierta(y1(r)))
  // En la planta baja pasarse de la cubierta es un error de datos: el faldon
  // mas bajo mide justo los 2,90 del muro estandar, asi que si algo lo supera
  // es porque trae una altura mal puesta. Apoyado en el entrepiso, en cambio,
  // pasarse es la norma —el area tecnica corre bajo toda la pendiente— y
  // mundo.js recorta cada tramo de muro contra la cubierta. Lo que si importa
  // ahi es cuanta altura libre queda para andar.
  if (cota(r) < 0.01) {
    if (techo > libre + 0.03) avisa('cubierta', nom(r) + ' remata a ' + techo.toFixed(2) + ' y la cubierta ahi esta a ' + libre.toFixed(2))
  } else if (libre - cota(r) < 1.9) {
    avisa('cubierta', nom(r) + ' queda con ' + (libre - cota(r)).toFixed(2) + ' m libres bajo la cubierta: no se pasa de pie por ese extremo')
  }
}

// -- 9. recorrido -----------------------------------------------------------
for (const p of (P.recorrido || [])) {
  const r = R.find((x) => x.code === p.code)
  if (!r) avisa('recorrido', 'la parada "' + p.titulo + '" apunta a ' + p.code + ', que no existe')
  else if (n2(r)) avisa('recorrido', 'la parada "' + p.titulo + '" (' + p.code + ') esta en el nivel 2')
}

// -- 10. rendijas entre salas pegadas ---------------------------------------
const GROSOR = 0.05
for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
  const a = R[i], b = R[j]
  if ((Number(a.nivel) || 1) !== (Number(b.nivel) || 1)) continue
  if (!conMuro(a) || !conMuro(b)) continue
  if (Math.abs(cota(a) - cota(b)) > 0.02) continue
  const casos = [
    [x1(a), b.x, a.y, y1(a), b.y, y1(b)],
    [x1(b), a.x, b.y, y1(b), a.y, y1(a)],
    [y1(a), b.y, a.x, x1(a), b.x, x1(b)],
    [y1(b), a.y, b.x, x1(b), a.x, x1(a)],
  ]
  for (const c of casos) {
    const luz = c[1] - c[0]
    if (luz <= 0.005 || luz > 0.45) continue
    const sol = Math.min(c[3], c[5]) - Math.max(c[2], c[4])
    if (sol < 0.5) continue
    if (Math.abs(luz - GROSOR) < 0.005) continue
    avisa('rendija', nom(a) + ' y ' + nom(b) + ' dejan ' + (luz * 100).toFixed(0) + ' cm a lo largo de ' + sol.toFixed(1) + ' m')
  }
}

// -- informe ----------------------------------------------------------------
const orden = ['codigo', 'tamano', 'altura', 'solape', 'rendija', 'vano', 'puerta', 'acceso', 'equipo', 'entrepiso', 'cubierta', 'recorrido']
console.log('Salas ' + R.length + ' | equipos ' + M.length + ' | nivel 2: ' + R.filter(n2).length + '\n')
let total = 0
for (const c of orden) {
  const g = fallos.filter((f) => f.cat === c)
  if (!g.length) continue
  total += g.length
  console.log('-- ' + c.toUpperCase() + ' (' + g.length + ') ' + '-'.repeat(Math.max(0, 54 - c.length)))
  for (const f of g) console.log('   ' + f.txt)
  console.log()
}
console.log(total ? 'TOTAL: ' + total + ' hallazgos' : 'Sin hallazgos.')
