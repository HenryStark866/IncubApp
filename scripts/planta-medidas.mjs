/**
 * Re-medida de la planta con las medidas reales tomadas en sitio.
 *
 * El plano ya tiene la forma y la ubicación correctas —lo confirmó Henry—, así
 * que esto NO re-dibuja nada: solo corrige tamaños. Cada sala se apoya en dos
 * líneas del plano (sus dos bordes), y muchas salas comparten esas líneas:
 * mover una sala mueve a sus vecinas. Por eso no se puede ir sala por sala.
 *
 * Se resuelve el plano entero de una vez, un eje a la vez. Cada medida es una
 * ecuación «entre estas dos líneas hay tantos metros», y se busca el juego de
 * líneas que mejor las satisface todas (mínimos cuadrados). Las salas sin medir
 * conservan su proporción actual, que es lo que evita que el sistema quede
 * indeterminado.
 *
 *   node scripts/planta-medidas.mjs            muestra el resultado
 *   node scripts/planta-medidas.mjs aplicar    lo escribe en Supabase
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// ── Medidas de campo ────────────────────────────────────────────────────────
// Primera tanda: leída con regla 1:75 sobre plano 1:100 → multiplicar por 4/3.
// Lo confirman tres salas medidas después al 1:100: almacenamiento de carros
// (2,3 → 3,07 vs 3,0), nacedoras (8,4 → 11,20 vs 11,3) y lavado nacimiento
// (8,0 → 10,67 vs 10,5).
const F = 4 / 3
const LARGO_1_75 = {
  SI2: 21.5, SI1: 19, TRF: 3, SN1: 8.4, SN2: 8.4, S33: 2, S72: 5, S46: 5,
  TUN: 16.7, LCC: 4.8, S45: 5.8, S48: 3,
}
// Dos pasillos quedan SIN medida a propósito, y los deduce la cadena vecina:
//
//   · Pasillo de zona limpia — se midió 15,5 (→ 20,67), pero por debajo suyo
//     corren los dos filtros, la lavandería, el cuarto frío y el lavado de
//     canastillas, que ya suman 24,3 m sin contar el último. Henry confirmó que
//     el pasillo sí va de punta a punta, así que la medida se quedó corta.
//   · Pasillo en L — los 11,5 no caben en lo que deja libre su banda. Lo más
//     probable es que sean el recorrido de sus dos patas y no su largo a lo
//     largo de la planta.

// Segunda tanda: tomada al 1:100, va tal cual.
const LARGO_1_100 = {
  S28: 4.0,          // comedor zona limpia
  S43: 0.8, S70: 0.8, S44: 2.4,   // W.C. — en zona sucia son tres seguidos
  REP: 2.0,          // almacén de repuestos
  S29: 1.8, S30: 1.8,             // filtros sanitarios zona limpia
  S38: 3.0, S39: 3.0,             // filtros zona sucia
  S31: 2.0, S40: 2.0,             // lavanderías
  S32: 2.0,          // almacén dotación
  S22: 18.5,         // cuarto frío
  S18: 6.4,          // almacén huevo comercial
  S23: 1.6,          // pasillo entre huevo comercial y almacenamiento de carros
  S19: 3.0,          // almacenamiento de carros
  S21: 10.5,         // lavado nacimiento
  S41: 2.5, S42: 2.5,             // ingresos a planta
  REC: 4.0,          // recepción de huevos
  S62: 34.5,         // pasillo zona sucia
  S8: 4.0,           // almacén No 1
  S37: 5.0,          // comedor zona sucia
  S47: 4.0,          // almacenamiento subproducto
  S68: 2.0,          // cava del huevo
}

// Tercera tanda: la más completa, con las DOS dimensiones de cada sala. Manda
// sobre las anteriores. De paso valida la conversión ×4/3: sexaje daba 2,67 y
// se midió 2,50; transferencia daba 4,00 y se midió 4,00; nacedoras 11,20 y se
// midieron 11,00; despacho de pollito 4,00 y 4,00.
const LARGO_FONDO = {
  S67: [6.5, 2.5],   // cuarto de vacunas — va partido en dos, de 2,0 y 4,5
  S33: [2.5, 11],    // sexaje: el lado angosto es el que da al pasillo
  TRF: [4.0, 8.5],   // transferencia, sin contar el almacén de la máquina
  S63: [4.0, 2.5],   // ese almacén, que corona la transferencia
  SN1: [11, 5.5], SN2: [11, 5.5], SN3: [11, 5.5], SN4: [11, 5.5],
  S46: [6.0, 13.5],  // sala de despacho / almacén de pollito
  S48: [4.0, 3.5],   // despacho pollito
  S72: [5.5, 8.5],   // vacunación — los 11 m que midió Henry son con el cuarto
  S45: [7.5, 3.5],   // almacén de cajas
  'TEC-1': [15, 8], S9: [11, 8], S15: [4, 8],
}

const LARGO = {}
for (const [k, v] of Object.entries(LARGO_1_75)) LARGO[k] = +(v * F).toFixed(3)
for (const [k, v] of Object.entries(LARGO_1_100)) LARGO[k] = v
for (const [k, v] of Object.entries(LARGO_FONDO)) LARGO[k] = v[0]

// Fondos. Los de la tercera tanda más los pasillos.
const FONDO = { S25: 2, S23: 2, TUN: 1.5, S16: 1.7, S62: 1.7 }
for (const [k, v] of Object.entries(LARGO_FONDO)) FONDO[k] = v[1]
// La banda de oficinas, salas técnicas, almacén, filtros y comedor de zona
// sucia va toda a 8 m de fondo. La lavandería y el ingreso de zona sucia NO
// entran: van apilados uno sobre otro DENTRO de esa banda, y ponerles 8 m a
// cada uno la duplicaría a 16.
for (const c of ['S8', 'S38', 'S39', 'S37']) FONDO[c] = 8

// Ancho exterior de la planta por zona, de fachada a fachada.
const ANCHO_ZONA = [
  { nombre: 'zona limpia', x: 20, hasta: 31, ancho: 21.5 },
  { nombre: 'de la oficina al comedor de zona sucia', x: 65, hasta: 34.9, ancho: 27 },
  { nombre: 'oriental (hasta la cava)', x: 113, hasta: 29, ancho: 21.5 },
  { nombre: 'punta del despacho', x: 123, hasta: 24, ancho: 17.5 },
]

// Los muros son de 5 cm, así que el largo exterior de 91,5 m deja 91,4 m de
// borde interior a borde interior. Es el amarre más fuerte que hay: obliga a
// toda la cadena a cerrar contra una sola cifra medida de una sola pasada.
const LARGO_TOTAL = 91.4
const MURO = 0.05

// ── Datos de partida ────────────────────────────────────────────────────────
const RESPALDO = '.respaldo/rooms-2026-08-24.json'
if (!existsSync(RESPALDO)) {
  console.error(`No encuentro ${RESPALDO}. Corre primero el respaldo.`)
  process.exit(1)
}
const crudo = JSON.parse(readFileSync(RESPALDO, 'utf8'))
const salas = crudo
  .map((r) => ({
    id: r.id, code: r.code, name: r.name, type: r.type,
    x: +r.pos_x, y: +r.pos_y, w: +r.width, h: +r.height,
    doors: Array.isArray(r.doors) ? r.doors : [],
  }))
  .filter((r) => Number.isFinite(r.x) && r.w > 0 && r.h > 0)

// Los corredores exteriores no son parte del edificio: se re-acomodan al final
// contra la fachada que les toque.
const EXTERIOR = new Set(['S49', 'S50', 'S51', 'S35', 'S35B', 'S36', 'S56B', 'S65', 'S66'])
// La plataforma de chillers está FUERA del edificio, no pegada a él: no es un
// corredor de fachada y no se re-acomoda contra el muro. Solo se encoge con la
// planta —venía dibujada a la escala vieja— conservando su distancia al sur.
const AFUERA = new Set(['S71'])
const interiores = salas.filter((r) => !EXTERIOR.has(r.code) && !AFUERA.has(r.code))

const round3 = (v) => Math.round(v * 1000) / 1000

// ── Motor: resuelve un eje ──────────────────────────────────────────────────
/**
 * @param bordes  para cada sala, [inicio, fin] sobre el eje
 * @param metas   medida objetivo por sala (null si no se midió)
 * @param extra   ecuaciones sueltas: { desde, hasta, valor } en coordenadas viejas
 */
function resolverEje(bordes, metas, extra = [], nombre = '') {
  const TOL = 0.55   // dos bordes a menos de 55 cm son la misma línea del plano
  const orden = [...new Set(bordes.flat().map(round3))].sort((a, b) => a - b)
  let lineas = []
  for (const v of orden) if (!lineas.length || v - lineas[lineas.length - 1] > TOL) lineas.push(v)

  const conMeta = metas.map((m, i) => ({ m, i })).filter((t) => t.m != null)
  const escala = conMeta.length
    ? conMeta.reduce((s, t) => s + t.m, 0) /
      conMeta.reduce((s, t) => s + (bordes[t.i][1] - bordes[t.i][0]), 0)
    : 1

  const PESO_MEDIDA = 1000
  const PESO_FORMA = 0.5
  const MIN = 0.2

  // Se resuelve, y si alguna franja pide un ancho NEGATIVO es que esas dos
  // líneas son en realidad el mismo muro y el plano las trae separadas. En vez
  // de taparlo con un mínimo —que infla la planta y vuelve sordo al sistema,
  // porque por más peso que se le dé a una medida el piso la devuelve—, se
  // fusionan las dos líneas y se vuelve a resolver. El propio ajuste va
  // diciendo dónde sobra un muro.
  const fusionadas = []
  for (let intento = 0; intento < 8; intento++) {
    const aLinea = (v) => {
      let mejor = 0
      for (let i = 1; i < lineas.length; i++) {
        if (Math.abs(lineas[i] - v) < Math.abs(lineas[mejor] - v)) mejor = i
      }
      return mejor
    }
    const N = lineas.length - 1
    const d0 = Array.from({ length: N }, (_, k) => lineas[k + 1] - lineas[k])

    const A = Array.from({ length: N }, () => new Float64Array(N))
    const b = new Float64Array(N)
    const ecuacion = (desde, hasta, valor, peso) => {
      const idx = []
      for (let k = aLinea(desde); k < aLinea(hasta); k++) idx.push(k)
      if (!idx.length) return
      const w2 = peso * peso
      for (const q of idx) {
        for (const r of idx) A[q][r] += w2
        b[q] += w2 * valor
      }
    }

    // El peso va dividido por la medida: se minimiza el error RELATIVO. Con el
    // absoluto, un pasillo de 34 m pesa lo mismo que un W.C. de 0,8 y el ajuste
    // descuadra las salas chicas por salvar las grandes.
    for (const t of conMeta) {
      ecuacion(bordes[t.i][0], bordes[t.i][1], t.m, PESO_MEDIDA / Math.max(1, t.m))
    }
    // Las medidas de una sola pasada —largo total exterior, ancho de zona de
    // fachada a fachada— son las más confiables: una lectura en vez de una
    // cadena de veinte. Por eso llevan peso propio.
    for (const e of extra) {
      ecuacion(e.desde, e.hasta, e.valor, (e.peso ?? 1) * PESO_MEDIDA / Math.max(1, e.valor))
    }
    for (let k = 0; k < N; k++) ecuacion(lineas[k], lineas[k + 1], d0[k] * escala, PESO_FORMA)

    // Gauss-Jordan con pivoteo parcial.
    const a = A.map((f, i) => Float64Array.from([...f, b[i]]))
    for (let c = 0; c < N; c++) {
      let q = c
      for (let r = c + 1; r < N; r++) if (Math.abs(a[r][c]) > Math.abs(a[q][c])) q = r
      ;[a[c], a[q]] = [a[q], a[c]]
      const piv = a[c][c]
      if (Math.abs(piv) < 1e-9) continue
      for (let r = 0; r < N; r++) {
        if (r === c) continue
        const f = a[r][c] / piv
        if (!f) continue
        for (let t2 = c; t2 <= N; t2++) a[r][t2] -= f * a[c][t2]
      }
    }
    const d = Array.from({ length: N }, (_, i) =>
      round3(Math.abs(a[i][i]) < 1e-9 ? d0[i] * escala : a[i][N] / a[i][i])
    )

    // ¿Alguna franja imposible? Se fusiona la peor y se reintenta —salvo que al
    // hacerlo se aniquile una sala que sí tiene medida propia.
    let peor = -1
    for (let k = 0; k < N; k++) {
      if (d[k] >= 0 && d[k] >= MIN) continue
      const aniquila = conMeta.some(
        (t) => aLinea(bordes[t.i][0]) === k && aLinea(bordes[t.i][1]) === k + 1
      )
      if (aniquila) continue
      if (peor < 0 || d[k] < d[peor]) peor = k
    }
    if (peor >= 0) {
      fusionadas.push(`${lineas[peor]}↔${lineas[peor + 1]}`)
      lineas = lineas.filter((_, i) => i !== peor + 1)
      continue
    }

    const pos = [lineas[0]]
    for (let k = 0; k < N; k++) pos.push(round3(pos[k] + Math.max(MIN, d[k])))
    if (fusionadas.length) {
      console.log(`   [${nombre}: muros fusionados por dar ancho negativo — ${fusionadas.join(', ')}]`)
    }
    return { mapear: (v) => pos[aLinea(v)], lineas, pos }
  }
  throw new Error(`${nombre}: no converge tras fusionar ${fusionadas.join(', ')}`)
}

// ── Eje x (largo de la planta) ──────────────────────────────────────────────
const ejeX = resolverEje(
  interiores.map((r) => [r.x, r.x + r.w]),
  interiores.map((r) => LARGO[r.code] ?? null),
  [{ desde: 5, hasta: 126, valor: LARGO_TOTAL, peso: 25 }],
  'largo'
)

// ── Eje y (ancho de la planta) ──────────────────────────────────────────────
// Además de los fondos de pasillo, entra una ecuación por zona: desde la
// fachada norte hasta el muro sur de esa zona hay tantos metros.
const ejeY = resolverEje(
  interiores.map((r) => [r.y, r.y + r.h]),
  interiores.map((r) => FONDO[r.code] ?? null),
  ANCHO_ZONA.map((z) => ({ desde: 6, hasta: z.hasta, valor: z.ancho - 2 * MURO, peso: 25 })),
  'ancho'
)

// ── Resultado ───────────────────────────────────────────────────────────────
const nuevas = salas.map((r) => {
  const nx = ejeX.mapear(r.x), nx2 = ejeX.mapear(r.x + r.w)
  const ny = ejeY.mapear(r.y), ny2 = ejeY.mapear(r.y + r.h)
  return {
    ...r,
    nx: round3(nx), nw: round3(nx2 - nx),
    ny: round3(ny), nh: round3(ny2 - ny),
    metaW: LARGO[r.code] ?? null, metaH: FONDO[r.code] ?? null,
  }
})

const desvios = nuevas.filter((r) => r.metaW != null).map((r) => ({ ...r, e: round3(r.nw - r.metaW) }))
const abs = desvios.map((r) => Math.abs(r.e))
const largoTotal = Math.max(...nuevas.filter((r) => !EXTERIOR.has(r.code)).map((r) => r.nx + r.nw)) - 5

console.log(`LARGO de la planta: ${round3(largoTotal)} m  (antes 121)`)
for (const z of ANCHO_ZONA) {
  const real = round3(ejeY.mapear(z.hasta) - ejeY.mapear(6))
  console.log(`ANCHO zona ${z.nombre.padEnd(42)} objetivo ${round3(z.ancho)}  queda ${real}`)
}
console.log(`\nDesvío contra lo medido — medio ${round3(abs.reduce((a2, b2) => a2 + b2, 0) / abs.length)} m · máximo ${round3(Math.max(...abs))} m`)
console.log('Peores:')
for (const r of desvios.sort((p, q) => Math.abs(q.e) - Math.abs(p.e)).slice(0, 8)) {
  console.log(`  ${String(r.code).padEnd(6)} ${String(r.name).slice(0, 32).padEnd(33)} medido ${String(r.metaW).padStart(6)} queda ${String(r.nw).padStart(6)}  ${r.e > 0 ? '+' : ''}${r.e}`)
}
console.log('\nPasillos (fondo):')
for (const r of nuevas.filter((x) => x.metaH != null)) {
  console.log(`  ${String(r.code).padEnd(6)} ${String(r.name).slice(0, 24).padEnd(25)} objetivo ${round3(r.metaH)}  queda ${r.nh}`)
}

// ── Puertas ─────────────────────────────────────────────────────────────────
// La puerta guarda su posición relativa a la sala, y el 3D deduce en qué muro
// va por la distancia a cada lado. Si se escalara la posición sin más, una
// puerta de esquina podría cambiarse de muro. Así que se fija primero el muro
// que tiene hoy, y solo se re-mapea la coordenada que corre A LO LARGO de ese
// muro — pasándola por el mismo mapa del eje, para que siga enfrentada con la
// puerta de la sala vecina.
const ANCHO_VANO = 1.6
function ladoDe(r, d) {
  const dist = {
    arriba: d.y, abajo: r.h - ANCHO_VANO - d.y,
    izquierda: d.x, derecha: r.w - ANCHO_VANO - d.x,
  }
  return Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0]
}
function moverPuertas(vieja, nueva) {
  return (vieja.doors || []).map((d) => {
    let lado = ladoDe(vieja, d)
    // Si la sala quedó más angosta que el propio vano —los filtros a 1,57 m y
    // los W.C. a 0,80— la puerta no cabe en ese muro, y se pasa al muro largo.
    const cabe = (l) =>
      (l === 'arriba' || l === 'abajo' ? nueva.nw : nueva.nh) >= ANCHO_VANO + 0.2
    if (!cabe(lado)) lado = lado === 'arriba' || lado === 'abajo' ? 'izquierda' : 'arriba'
    const horiz = lado === 'arriba' || lado === 'abajo'
    // Coordenada a lo largo del muro, en absolutas, pasada por el mapa del eje.
    const abs = horiz ? vieja.x + d.x : vieja.y + d.y
    const mapa = horiz ? ejeX : ejeY
    const largo = horiz ? nueva.nw : nueva.nh
    const origen = horiz ? nueva.nx : nueva.ny
    let c = round3(mapa.mapear(abs) - origen)
    c = Math.max(0.1, Math.min(largo - ANCHO_VANO - 0.1, c))
    const perp = lado === 'arriba' || lado === 'izquierda'
      ? 0
      : round3((horiz ? nueva.nh : nueva.nw) - ANCHO_VANO)
    return horiz ? { ...d, x: c, y: perp } : { ...d, x: perp, y: c }
  })
}

// ── Equipos ─────────────────────────────────────────────────────────────────
// Medidas reales tomadas de la máquina, no del plano: no llevan el factor.
const EQUIPO = { setter: { w: 4.0, d: 3.5 }, hatcher: { w: 3.5, d: 1.8 } }

const equipos = JSON.parse(readFileSync('.respaldo/machines-2026-08-24.json', 'utf8'))
const porSala = new Map(nuevas.map((r) => [r.id, r]))
const viejaPorId = new Map(salas.map((r) => [r.id, r]))

/** Reparte los equipos de una sala en filas contra los dos muros largos. */
function acomodar(sala, lista) {
  const dim = EQUIPO[lista[0]?.type] || EQUIPO.setter
  // Se conservan las filas que ya tenía (una o dos), y el orden dentro de cada una.
  const filas = [...new Set(lista.map((m) => +m.pos_y))].sort((a, b) => a - b)
  const salida = []
  filas.forEach((yViejo, iFila) => {
    const enFila = lista.filter((m) => +m.pos_y === yViejo).sort((a, b) => a.pos_x - b.pos_x)
    // Si la sala tiene un cuarto embebido en su esquina (el almacén de
    // repuestos), esa fila arranca después de él.
    const estorbo = nuevas.find(
      (o) => o.id !== sala.id && o.nx >= sala.nx - 0.05 && o.nx + o.nw <= sala.nx + sala.nw + 0.05 &&
             o.ny >= sala.ny - 0.05 && o.ny < sala.ny + sala.nh - 0.05 && o.nh < sala.nh - 0.5
    )
    const desde = estorbo && iFila === 0 ? estorbo.nw : 0
    const libre = sala.nw - desde
    const paso = Math.min(dim.w + 0.25, libre / enFila.length)
    const inicio = desde + Math.max(0, (libre - paso * enFila.length) / 2)
    const y = iFila === 0 ? 0 : round3(sala.nh - dim.d)
    enFila.forEach((m, i) => {
      salida.push({
        id: m.id, code: m.code,
        pos_x: round3(inicio + i * paso),
        pos_y: y,
        rotation: iFila === 0 ? 180 : 0,   // la fila norte mira al sur y viceversa
      })
    })
  })
  return salida
}

const equiposNuevos = []
for (const sala of nuevas) {
  const lista = equipos.filter((m) => m.room_id === sala.id && m.status !== 'decommissioned')
  if (!lista.length) continue
  if (!EQUIPO[lista[0].type]) continue   // chillers y compresores se quedan donde están
  equiposNuevos.push(...acomodar(sala, lista))
}

// Los corredores exteriores no entraron al cálculo, así que sus bordes caen
// fuera del rango de líneas interiores y el mapa los colapsaría a cero. Se
// colocan aparte: conservan su espesor real y se estiran contra la fachada
// nueva que les toca.
const edificio = {
  x0: 5,
  x1: Math.max(...nuevas.filter((r) => !EXTERIOR.has(r.code)).map((r) => r.nx + r.nw)),
  y0: 6,
  y1: Math.max(...nuevas.filter((r) => !EXTERIOR.has(r.code)).map((r) => r.ny + r.nh)),
}
// Lo que va afuera se escala con la planta y se planta pasado el corredor
// exterior, sin pegarse a la fachada.
for (const r of nuevas) {
  if (!AFUERA.has(r.code)) continue
  r.nx = round3(ejeX.mapear(r.x))
  r.nw = round3(ejeX.mapear(r.x + r.w) - r.nx)
  r.nh = r.h
  r.ny = round3(edificio.y1 + 2)   // el corredor exterior mide 2 m
}
for (const r of nuevas) {
  if (!EXTERIOR.has(r.code)) continue
  const horizontal = r.w >= r.h
  const espesor = Math.max(0.8, horizontal ? r.h : r.w)
  // El lado del edificio contra el que corre, según dónde estaba antes.
  if (horizontal) {
    r.nx = round3(Math.max(edificio.x0, Math.min(ejeX.mapear(r.x), edificio.x1 - 2)))
    r.nw = round3(Math.min(edificio.x1, ejeX.mapear(r.x + r.w)) - r.nx)
    if (r.nw < 2) r.nw = round3(edificio.x1 - r.nx)
    r.nh = espesor
    r.ny = round3(r.y < 6 ? edificio.y0 - espesor : ejeY.mapear(r.y))
    if (r.ny + r.nh > edificio.y1 + espesor) r.ny = round3(edificio.y1)
  } else {
    r.ny = round3(Math.max(edificio.y0, Math.min(ejeY.mapear(r.y), edificio.y1 - 2)))
    r.nh = round3(Math.min(edificio.y1, ejeY.mapear(r.y + r.h)) - r.ny)
    if (r.nh < 2) r.nh = round3(edificio.y1 - r.ny)
    r.nw = espesor
    r.nx = round3(r.x < 5 ? edificio.x0 - espesor : ejeX.mapear(r.x))
  }
}

const propuesta = {
  salas: nuevas.map((r) => ({
    id: r.id, code: r.code, name: r.name,
    pos_x: r.nx, pos_y: r.ny, width: r.nw, height: r.nh,
    doors: moverPuertas(viejaPorId.get(r.id), r),
  })),
  equipos: equiposNuevos,
}
writeFileSync('.respaldo/planta-nueva.json', JSON.stringify(propuesta, null, 1), 'utf8')

console.log(`\nEquipos re-acomodados: ${equiposNuevos.length}`)
for (const c of ['SI1', 'SI2', 'SN1', 'SN3']) {
  const s = nuevas.find((r) => r.code === c)
  const e = equiposNuevos.filter((m) => equipos.find((o) => o.id === m.id)?.room_id === s.id)
  if (!e.length) continue
  const dim = EQUIPO[equipos.find((o) => o.id === e[0].id).type]
  const fin = Math.max(...e.map((m) => m.pos_x)) + dim.w
  console.log(`  ${c.padEnd(5)} ${e.length} equipos de ${dim.w}×${dim.d} · ocupan hasta ${round3(fin)} de ${s.nw} m`)
}
console.log(`Puertas re-ubicadas: ${propuesta.salas.reduce((s, r) => s + r.doors.length, 0)}`)
console.log('\nPropuesta guardada en .respaldo/planta-nueva.json')

// ── Aplicar ─────────────────────────────────────────────────────────────────
if (process.argv[2] === 'aplicar') {
  const env = {}
  for (const f of ['.env.planta3d', '.env.migrate']) {
    if (!existsSync(f)) continue
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(l)
      if (m && m[2].trim() && env[m[1]] === undefined) env[m[1]] = m[2].trim()
    }
  }
  const U = env.SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
  const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
  let ok = 0, mal = 0
  for (const s of propuesta.salas) {
    const r = await fetch(`${U}/rest/v1/rooms?id=eq.${s.id}`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ pos_x: s.pos_x, pos_y: s.pos_y, width: s.width, height: s.height, doors: s.doors }),
    })
    r.ok ? ok++ : (mal++, console.warn('sala', s.code, r.status, await r.text()))
  }
  for (const m of propuesta.equipos) {
    const r = await fetch(`${U}/rest/v1/machines?id=eq.${m.id}`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ pos_x: m.pos_x, pos_y: m.pos_y, rotation: m.rotation }),
    })
    r.ok ? ok++ : (mal++, console.warn('equipo', m.code, r.status, await r.text()))
  }
  console.log(`\nAplicado: ${ok} registros · fallidos: ${mal}`)
}
