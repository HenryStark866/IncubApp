/**
 * Escribe en cada vano el muro donde está, para que deje de deducirse.
 *
 * Hasta ahora el 3D adivinaba el muro por la distancia: la puerta iba al muro
 * más cercano. Eso funciona mientras la sala no cambie de tamaño, pero en
 * cuanto se reescala, una puerta que estaba a 10 cm de un muro y a 0 de otro se
 * pasa sola al de al lado. Así fue como la puerta del pasillo de la oficina
 * terminó dando contra nacedoras 4 en vez de contra el pasillo de zona sucia.
 *
 * Este script fija el muro que cada vano tiene HOY, que ya está revisado. A
 * partir de aquí el muro es un dato del plano y ninguna re-medida lo mueve.
 *
 *   node scripts/planta-fijar-lados.mjs            muestra lo que escribiría
 *   node scripts/planta-fijar-lados.mjs aplicar    lo escribe en Supabase
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

const salas = (await (await fetch(
  `${U}/rest/v1/rooms?select=id,code,name,pos_x,pos_y,width,height,doors&order=code`, { headers: H }
)).json()).map((r) => ({
  id: r.id, code: r.code, name: r.name,
  w: +r.width, h: +r.height,
  doors: Array.isArray(r.doors) ? r.doors : [],
}))

// Misma regla que usa el 3D hoy, copiada al pie de la letra para que lo que se
// congele sea exactamente lo que se está viendo.
const ORDEN = ['arriba', 'abajo', 'izquierda', 'derecha']
const EJE = { arriba: 'H', abajo: 'H', izquierda: 'V', derecha: 'V' }
function ladoActual(r, d) {
  const a = d.w ?? 1.6
  const dist = { arriba: d.y, abajo: r.h - a - d.y, izquierda: d.x, derecha: r.w - a - d.x }
  const m = Math.min(dist.arriba, dist.abajo, dist.izquierda, dist.derecha)
  const empatados = ORDEN.filter((l) => Math.abs(dist[l] - m) < 0.05)
  if (empatados.length === 1) return empatados[0]
  const q = ((Math.round((Number(d.rot) || 0) / 90) * 90) % 360 + 360) % 360
  const eje = q === 0 || q === 180 ? 'H' : 'V'
  return empatados.filter((l) => EJE[l] === eje)[0] || empatados[0]
}

const cambios = []
let yaTenian = 0, total = 0
for (const r of salas) {
  if (!r.doors.length) continue
  let tocado = false
  const nuevas = r.doors.map((d) => {
    total++
    if (d.lado) { yaTenian++; return d }
    tocado = true
    return { ...d, lado: ladoActual(r, d) }
  })
  if (tocado) cambios.push({ id: r.id, code: r.code, doors: nuevas })
}

const cuenta = {}
for (const c of cambios) for (const d of c.doors) cuenta[d.lado] = (cuenta[d.lado] || 0) + 1
console.log(`Vanos: ${total} · ya tenían muro escrito: ${yaTenian} · a fijar: ${total - yaTenian}`)
console.log('Reparto por muro:', Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(' · '))

if (process.argv[2] === 'aplicar') {
  let ok = 0
  for (const c of cambios) {
    const res = await fetch(`${U}/rest/v1/rooms?id=eq.${c.id}`, {
      method: 'PATCH', headers: H, body: JSON.stringify({ doors: c.doors }),
    })
    res.ok ? ok++ : console.warn('  falló', c.code, res.status, await res.text())
  }
  console.log(`\nAplicado a ${ok} salas`)
}
