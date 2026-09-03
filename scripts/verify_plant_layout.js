// Verifica las salas recién creadas en Supabase y muestra resumen completo
// La clave service_role salta la RLS: se lee del entorno y NUNCA se escribe aqui.
import { existsSync, readFileSync } from 'node:fs'

const env = {}
for (const ruta of ['.env.planta3d', '.env.migrate', '.env.local', '.env']) {
  if (!existsSync(ruta)) continue
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(linea)
    if (!m) continue
    const v = m[2].trim().replace(/^["']|["']$/g, '')
    if (v !== '' && env[m[1]] === undefined) env[m[1]] = v
  }
}
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (revisa .env.planta3d).')
  process.exit(1)
}

const CODIGOS_NUEVOS = ['VAC-A','VAC-B','SEX','COR-L1','TRANS','ALM-TRANS','NAC','VAC-OP','ALM-CAJ','DESP-ALM','DESP-P','COR-L2','OFI','SAL-TEC1','SAL-TEC2']

async function get(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  })
  return r.json()
}

async function main() {
  // Buscar planta
  const plants = await get('plants?select=id,name,code&order=created_at')
  const p = plants.find(x => !x.code?.startsWith('G') && !x.name?.startsWith('G-'))
  console.log(`\nPlanta: [${p.code}] ${p.name}  (id: ${p.id})\n`)

  // Salas nuevas
  const rooms = await get(`rooms?select=code,name,type,pos_x,pos_y,width,height&plant_id=eq.${p.id}&code=in.(${CODIGOS_NUEVOS.join(',')})&order=pos_y,pos_x`)

  if (rooms.length === 0) {
    console.log('❌ No se encontraron las salas del plano base.')
    return
  }

  console.log(`✅ ${rooms.length} / ${CODIGOS_NUEVOS.length} salas encontradas en BD:\n`)
  console.log('Código       Nombre                               Tipo               Ancho    Alto     X        Y')
  console.log('─'.repeat(104))
  rooms.forEach(r => {
    console.log(
      `${r.code.padEnd(12)} ${r.name.padEnd(36)} ${r.type.padEnd(18)} ${String(r.width).padEnd(8)} ${String(r.height).padEnd(8)} ${String(r.pos_x).padEnd(8)} ${r.pos_y}`
    )
  })

  // Verificar que no falte ninguno
  const found = new Set(rooms.map(r => r.code))
  const missing = CODIGOS_NUEVOS.filter(c => !found.has(c))
  if (missing.length > 0) {
    console.log(`\n⚠️  Faltan en BD: ${missing.join(', ')}`)
  } else {
    console.log('\n🎉 Todas las salas están correctamente en la base de datos.')
    console.log('   Abre la app → Plantas y mapa de piso → clic en "Ajustar" para verlas.')
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) })
