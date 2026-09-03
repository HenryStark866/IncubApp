// Script: seed_plant_layout.js
// Conecta a Supabase con service_role (bypass RLS), encuentra las plantas activas
// y pobla sus salas con medidas reales.
// Uso: node scripts/seed_plant_layout.js
// NOTA: Pon tu service_role key en la variable de abajo antes de correr.
//       Encuéntrala en Supabase → Settings → API → service_role · secret

const SUPABASE_URL = 'https://pdxlmjlooeqlvvgbosbu.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''  // Lee del entorno

// ── Plano base con medidas reales ──────────────────────────────────────────────
const PLANO_BASE = [
  // Cuarto de vacunas — 6.5 m total dividido: sección A (2 m) + B (4.5 m), ancho 2.5 m
  { code: 'VAC-A',     name: 'Cuarto de Vacunas A',             type: 'technical',        pos_x: 0,    pos_y: 0,    width: 2.5,  height: 2    },
  { code: 'VAC-B',     name: 'Cuarto de Vacunas B',             type: 'technical',        pos_x: 0,    pos_y: 2,    width: 2.5,  height: 4.5  },
  // Sexaje — lado angosto 2.5 m, largo 11 m
  { code: 'SEX',       name: 'Sexaje',                           type: 'chick_processing', pos_x: 0,    pos_y: 6.5,  width: 2.5,  height: 11   },
  // Corredor zona limpia 1 — ancho 1.7 m
  { code: 'COR-L1',   name: 'Corredor Zona Limpia 1',           type: 'hallway',          pos_x: 2.5,  pos_y: 0,    width: 1.7,  height: 50   },
  // Transferencia — 11 m × 4 m (incluye almacén máquina 4 m × 2.5 m)
  { code: 'TRANS',     name: 'Sala de Transferencia',           type: 'chick_processing', pos_x: 4.2,  pos_y: 0,    width: 11,   height: 4    },
  { code: 'ALM-TRANS', name: 'Almacén Máquina Transferencia',  type: 'technical',        pos_x: 4.2,  pos_y: 4,    width: 4,    height: 2.5  },
  // Nacedoras — 11 m × 5.5 m
  { code: 'NAC',       name: 'Nacedoras',                        type: 'hatching',         pos_x: 4.2,  pos_y: 6.5,  width: 11,   height: 5.5  },
  // Vacunación — 11 m × 5.5 m
  { code: 'VAC-OP',   name: 'Vacunación',                       type: 'chick_processing', pos_x: 4.2,  pos_y: 12,   width: 11,   height: 5.5  },
  // Almacén de cajas — 7.5 m × 3.5 m
  { code: 'ALM-CAJ',  name: 'Almacén de Cajas',                 type: 'egg_storage',      pos_x: 4.2,  pos_y: 17.5, width: 7.5,  height: 3.5  },
  // Sala de despacho / almacén pollito — 13.5 m × 6 m
  { code: 'DESP-ALM', name: 'Sala Despacho / Almacén Pollito', type: 'chick_processing', pos_x: 4.2,  pos_y: 21,   width: 13.5, height: 6    },
  // Despacho pollito — 4 m × 3.5 m
  { code: 'DESP-P',   name: 'Despacho Pollito',                 type: 'chick_processing', pos_x: 4.2,  pos_y: 27,   width: 4,    height: 3.5  },
  // Corredor zona limpia 2 — ancho 1.7 m
  { code: 'COR-L2',   name: 'Corredor Zona Limpia 2',           type: 'hallway',          pos_x: 15.2, pos_y: 0,    width: 1.7,  height: 50   },
  // Bloque administración / zona sucia — ancho bloque 8 m
  { code: 'OFI',       name: 'Oficina',                          type: 'office',           pos_x: 21.5, pos_y: 0,    width: 8,    height: 4    },
  { code: 'SAL-TEC1', name: 'Sala Técnica 1',                   type: 'technical',        pos_x: 21.5, pos_y: 4,    width: 8,    height: 15   },
  { code: 'SAL-TEC2', name: 'Sala Técnica 2',                   type: 'technical',        pos_x: 21.5, pos_y: 19,   width: 8,    height: 11   },
]

async function query(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer ?? '',
      ...opts.headers,
    },
    method: opts.method ?? 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

async function main() {
  console.log('🔍 Listando plantas disponibles…')
  const plants = await query('plants?select=id,name,code,org_id&order=created_at')
  
  // Filtrar: excluir granjas (código que empieza en G o nombre que empieza en G-)
  const incubPlants = plants.filter(p => !p.code?.startsWith('G') && !p.name?.startsWith('G-'))
  
  if (incubPlants.length === 0) {
    console.error('❌ No se encontraron plantas de incubación.')
    process.exit(1)
  }

  console.log(`\n✅ Plantas de incubación encontradas (${incubPlants.length}):`)
  incubPlants.forEach((p, i) => console.log(`   ${i + 1}. [${p.code}] ${p.name}  (id: ${p.id})`))

  // Para cada planta de incubación, importar el plano base
  for (const plant of incubPlants) {
    console.log(`\n🏗️  Procesando planta: [${plant.code}] ${plant.name}`)

    // Ver salas existentes
    const existing = await query(`rooms?select=code&plant_id=eq.${plant.id}`)
    const existingCodes = new Set(existing.map(r => r.code))
    console.log(`   Salas existentes: ${existing.length} → ${existing.length > 0 ? [...existingCodes].join(', ') : 'ninguna'}`)

    // Filtrar salas que ya existen (por código)
    const toInsert = PLANO_BASE.filter(r => !existingCodes.has(r.code))
    const skipped  = PLANO_BASE.filter(r =>  existingCodes.has(r.code))

    if (skipped.length > 0) {
      console.log(`   ⚠️  Omitidas (código duplicado): ${skipped.map(r => r.code).join(', ')}`)
    }

    if (toInsert.length === 0) {
      console.log('   ✅ Todas las salas ya estaban. Nada que insertar.')
      continue
    }

    // Construir filas para insertar
    const rows = toInsert.map(r => ({
      plant_id: plant.id,
      org_id: plant.org_id,
      code: r.code,
      name: r.name,
      type: r.type,
      pos_x: r.pos_x,
      pos_y: r.pos_y,
      width: r.width,
      height: r.height,
    }))

    await query('rooms', {
      method: 'POST',
      prefer: 'return=minimal',
      body: rows,
    })

    console.log(`   ✅ Insertadas ${toInsert.length} salas:`)
    toInsert.forEach(r => {
      console.log(`      • [${r.code}] ${r.name} — ${r.width}m × ${r.height}m @ (${r.pos_x}, ${r.pos_y})`)
    })
  }

  console.log('\n🎉 ¡Importación completada! Abre el mapa en la app para ver el resultado.')
  console.log('   Tip: usa "🏗️ Importar plano base" en la app si necesitas reintentar,')
  console.log('        o arrastra las salas para ajustar su posición.')
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message)
  process.exit(1)
})
