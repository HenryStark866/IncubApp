/**
 * =============================================================================
 * ARCHIVO: scripts/planta3d-fotos.mjs
 * PROPÓSITO: Actualizar las fotos que se ven en las pantallas de los equipos
 *   del recorrido 3D (public/planta3d/). Baja, para cada equipo de PLANTA
 *   INCUBANT, la ÚLTIMA foto de ronda registrada en IncubApp y la guarda como
 *   public/planta3d/fotos/<CÓDIGO>.jpg.
 * CÓMO FUNCIONA: Node puro, sin dependencias. Es RE-EJECUTABLE: cada corrida
 *   trae la ronda más reciente, así que basta volver a correrlo (y desplegar)
 *   para que las pantallas queden al día.
 *
 *     npm run planta3d:fotos
 *
 *   Necesita la clave service_role de Supabase en .env.planta3d (o en
 *   .env.migrate, que también se acepta). Los .env están en .gitignore: la
 *   clave NUNCA se versiona. No reduce las imágenes y no hace falta: la
 *   compresión de src/lib/image.js ya deja las fotos de ronda en 40–100 KB.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'public', 'planta3d', 'fotos')
const ENVS = [join(RAIZ, '.env.planta3d'), join(RAIZ, '.env.migrate')]

const PLANTA = 'ea0d6e60-928a-4e47-84f9-504bf217136b' // PLANTA INCUBANT
const BUCKET = 'machine-checks'

// ── Credenciales ────────────────────────────────────────────────────────────
function leerEnv(ruta) {
  const vars = {}
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(linea)
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return vars
}

// Gana el PRIMER archivo que traiga la variable con valor. Importa el orden y
// que los vacíos no cuenten: .env.migrate conserva su línea
// `SUPABASE_SERVICE_ROLE_KEY=` en blanco de la plantilla, y al leerse de último
// pisaba con vacío la clave buena de .env.planta3d.
const env = {}
for (const ruta of ENVS) {
  if (!existsSync(ruta)) continue
  for (const [k, v] of Object.entries(leerEnv(ruta))) {
    if (v !== '' && env[k] === undefined) env[k] = v
  }
}

const URL_BASE = (env.SUPABASE_URL || '').replace(/\/+$/, '')
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !LLAVE) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  console.error(`Cree ${ENVS[0]} con esas dos variables.`)
  console.error('La clave está en Supabase → Settings → API → service_role · secret.')
  process.exit(1)
}

const cabeceras = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` }

async function api(ruta) {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: cabeceras })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${ruta}\n${await r.text()}`)
  return r.json()
}

// ── 1. Equipos de la planta ─────────────────────────────────────────────────
const equipos = await api(`machines?plant_id=eq.${PLANTA}&select=id,code&order=code`)
console.log(`Equipos en la planta: ${equipos.length}`)

// ── 2. Última foto de cada uno ──────────────────────────────────────────────
// Se piden las rondas de más reciente a más antigua y se toma la primera que
// aparezca por equipo, que es justo la última registrada.
const ids = equipos.map((e) => e.id).join(',')
const rondas = await api(
  `machine_checks?machine_id=in.(${ids})&photo_path=not.is.null` +
    '&select=machine_id,photo_path,taken_at&order=taken_at.desc'
)

const ultima = new Map()
for (const r of rondas) if (!ultima.has(r.machine_id)) ultima.set(r.machine_id, r)

// ── 3. Descarga ─────────────────────────────────────────────────────────────
mkdirSync(DESTINO, { recursive: true })

let bajadas = 0
let bytes = 0
const sinFoto = []
const fallaron = []

for (const eq of equipos) {
  const r = ultima.get(eq.id)
  if (!r) {
    sinFoto.push(eq.code)
    continue
  }
  try {
    const ruta = r.photo_path.split('/').map(encodeURIComponent).join('/')
    const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${ruta}`, {
      headers: cabeceras,
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(join(DESTINO, `${eq.code}.jpg`), buf)
    bytes += buf.length
    bajadas++
    const fecha = String(r.taken_at).slice(0, 16).replace('T', ' ')
    console.log(`  ${eq.code}  ${String(Math.round(buf.length / 1024)).padStart(4)} KB   ronda ${fecha}`)
  } catch (e) {
    fallaron.push(`${eq.code}: ${e.message}`)
  }
}

console.log(`\nListo: ${bajadas} fotos en public/planta3d/fotos (${(bytes / 1048576).toFixed(1)} MB)`)
if (sinFoto.length) console.log(`Sin foto de ronda todavía: ${sinFoto.join(', ')}`)
if (fallaron.length) {
  console.log('\nNo se pudieron bajar:')
  for (const f of fallaron) console.log(`  ${f}`)
  process.exitCode = 1
}
