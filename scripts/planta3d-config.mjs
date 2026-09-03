/**
 * =============================================================================
 * ARCHIVO: scripts/planta3d-config.mjs
 * PROPÓSITO: Generar public/planta3d/config.js con la URL y la clave pública de
 *   Supabase, para que el recorrido 3D pueda leer el plano en vivo.
 * CÓMO FUNCIONA: Corre antes de `vite build` y toma los valores de las MISMAS
 *   variables que usa la app (VITE_SUPABASE_URL / VITE_SUPABASE_KEY), del
 *   entorno o de los .env. Así la clave no queda duplicada a mano en el repo:
 *   el archivo generado está en .gitignore.
 *
 *   La clave que se escribe es la PUBLICABLE (anon), la misma que ya viaja en
 *   el bundle de la app y que el navegador expone de todos modos. NUNCA la
 *   service_role: esa salta la RLS y jamás debe llegar al navegador.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'public', 'planta3d', 'config.js')

function leerEnv(ruta) {
  const vars = {}
  if (!existsSync(ruta)) return vars
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(linea)
    if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return vars
}

// Gana el entorno; si no, el primer .env que traiga el valor con contenido.
const fuentes = [process.env, leerEnv(join(RAIZ, '.env.production')), leerEnv(join(RAIZ, '.env'))]
const de = (clave) => {
  for (const f of fuentes) if (f[clave]) return String(f[clave]).trim().replace(/^["']|["']$/g, '')
  return ''
}

const url = de('VITE_SUPABASE_URL')
const key = de('VITE_SUPABASE_KEY') || de('VITE_SUPABASE_ANON_KEY')

if (/service_role/i.test(key)) {
  console.error('[planta3d] La clave parece ser service_role. Abortando: esa clave no puede llegar al navegador.')
  process.exit(1)
}

const cabecera = '/* Generado por scripts/planta3d-config.mjs — no editar a mano. */\n'

if (!url || !key) {
  // Sin variables no se rompe el build: el recorrido se queda con su
  // instantánea de data/planta.js, que es el respaldo previsto.
  writeFileSync(DESTINO, `${cabecera}window.PLANTA3D_SUPABASE = null\n`, 'utf8')
  console.warn('[planta3d] Sin VITE_SUPABASE_URL/KEY: el recorrido usará la instantánea estática.')
} else {
  writeFileSync(
    DESTINO,
    `${cabecera}window.PLANTA3D_SUPABASE = ${JSON.stringify({ url, key })}\n`,
    'utf8'
  )
  console.log('[planta3d] config.js generado para', url)
}
