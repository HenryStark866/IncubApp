/**
 * Aplica supabase_migration_unlock_lo_nuevo.sql si hay SUPABASE_DB_URL
 * o imprime instrucciones para el SQL Editor.
 *
 * Uso:
 *   set SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@...:5432/postgres
 *   node scripts/apply_unlock_sql.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv(file) {
  const p = path.join(root, file)
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1].trim()] = v
  }
  return out
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.migrate'), ...process.env }
const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL
const sqlPath = path.join(root, 'supabase_migration_unlock_lo_nuevo.sql')
const sql = readFileSync(sqlPath, 'utf8')

const dashboard =
  'https://supabase.com/dashboard/project/pdxlmjlooeqlvvgbosbu/sql/new'

if (!dbUrl) {
  console.log('No hay SUPABASE_DB_URL — no se puede aplicar SQL desde aquí.')
  console.log('')
  console.log('Opción A (recomendada):')
  console.log('  1) Abre el SQL Editor:')
  console.log('     ' + dashboard)
  console.log('  2) Pega el contenido de:')
  console.log('     supabase_migration_unlock_lo_nuevo.sql')
  console.log('  3) Run')
  console.log('')
  console.log('Opción B (automático):')
  console.log('  1) Settings → Database → Connection string (URI)')
  console.log('  2) Pégalo en .env.migrate como SUPABASE_DB_URL=...')
  console.log('  3) node scripts/apply_unlock_sql.mjs')
  process.exit(2)
}

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
})

console.log('Conectando a Postgres…')
await client.connect()
try {
  console.log('Ejecutando supabase_migration_unlock_lo_nuevo.sql …')
  const res = await client.query(sql)
  // pg returns array of results for multi-statement in some drivers; handle both
  const rows = Array.isArray(res) ? res[res.length - 1]?.rows : res.rows
  if (rows?.length) {
    console.log('Verificación:')
    console.table(rows)
  }
  console.log('OK — tablas desbloqueadas. Recarga la app (Ctrl+F5).')
} catch (err) {
  console.error('Error al aplicar SQL:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
