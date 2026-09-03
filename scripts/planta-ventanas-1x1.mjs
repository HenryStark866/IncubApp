/**
 * Deja todas las ventanas de 1 × 1 m, centradas en su muro.
 *
 * Las de la esquina de la oficina iban de piso a techo, y una ventana de 2,9 m
 * de alto no se lee como ventana sino como un boquete: el muro desaparece
 * entero y solo queda el marco. Con 1 × 1 y su antepecho de 1 m, el muro sigue
 * ahí y el vidrio se ve como lo que es. Las de los comedores bajan de 2 m a 1.
 *
 * El muro de cada una no se toca: ya viene escrito en `lado`.
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
const VANO = 1

const salas = await (await fetch(
  `${U}/rest/v1/rooms?select=id,code,name,pos_x,pos_y,width,height,doors&order=code`, { headers: H }
)).json()

let tocadas = 0, ventanas = 0
for (const s of salas) {
  const doors = Array.isArray(s.doors) ? s.doors : []
  if (!doors.some((d) => d.type === 'window')) continue
  const w = +s.width, h = +s.height
  // Cuántas comparten muro: si son varias se reparten a lo largo de él en vez
  // de amontonarse todas en el centro.
  const porMuro = {}
  for (const d of doors) if (d.type === 'window') {
    const l = d.lado || 'arriba'
    ;(porMuro[l] ??= []).push(d)
  }
  const nuevas = doors.map((d) => {
    if (d.type !== 'window') return d
    ventanas++
    const lado = d.lado || 'arriba'
    const grupo = porMuro[lado]
    const i = grupo.indexOf(d)
    const largo = lado === 'arriba' || lado === 'abajo' ? w : h
    const centro = (largo * (i + 1)) / (grupo.length + 1)
    const corre = r2(Math.max(0.05, Math.min(largo - VANO - 0.05, centro - VANO / 2)))
    const pos =
      lado === 'arriba' ? { x: corre, y: 0 } :
      lado === 'abajo' ? { x: corre, y: r2(h - VANO) } :
      lado === 'izquierda' ? { x: 0, y: corre } :
      { x: r2(w - VANO), y: corre }
    const { h: _alto, base: _base, ...resto } = d
    console.log(`  ${s.code.padEnd(6)} muro ${lado.padEnd(11)} ${d.w ?? 1} m` +
      `${d.h ? ` × ${d.h} de alto` : ''}  →  1 × 1 en ${pos.x}, ${pos.y}`)
    return { ...resto, ...pos, w: VANO }
  })
  const res = await fetch(`${U}/rest/v1/rooms?id=eq.${s.id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ doors: nuevas }),
  })
  res.ok ? tocadas++ : console.warn('falló', s.code, await res.text())
}
console.log(`\nVentanas normalizadas: ${ventanas} · salas: ${tocadas}`)
