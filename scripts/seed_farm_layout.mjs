/**
 * =============================================================================
 * SCRIPT: scripts/seed_farm_layout.mjs
 * PROPÓSITO: Crea o restaura la sede de granja "G-GRANJA LA BONITA" con sus
 * módulos de Levante (100) y Producción (200), galpones 101-104 y 201-204,
 * áreas de bioseguridad, vías y silos, y registra sus galpones de 2 pisos
 * (galpon_p1 y galpon_p2) en la tabla machines.
 * =============================================================================
 */

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { PLANO_BASE_GRANJA, GALPONES_BASE_MAQUINAS } from '../src/lib/planoBaseGranja.js'

const envFile = fs.readFileSync('.env.planta3d', 'utf8')
const env = Object.fromEntries(
  envFile
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, key)

const ORG_ID = 'd54fca1e-1878-4967-aee5-330aa2e631cc' // Antioqueña de Incubación SAS

async function run() {
  console.log('--- RESTAURANDO / SEMBRANDO PLANO DE GRANJA ---')

  // 1. Buscar o crear la granja en `plants`
  let { data: farm, error: fErr } = await supabase
    .from('plants')
    .select('*')
    .eq('org_id', ORG_ID)
    .ilike('name', '%G-%')
    .maybeSingle()

  if (!farm) {
    console.log('Creando granja en tabla plants...')
    const { data: newFarm, error: createFarmErr } = await supabase
      .from('plants')
      .insert({
        org_id: ORG_ID,
        name: 'G-GRANJA LA BONITA',
        code: 'G-BONITA',
        city: 'Jericó',
        address: 'Vereda Las Palmas, Sector Granja Matriz',
        status: 'active',
        timezone: 'America/Bogota',
      })
      .select()
      .single()

    if (createFarmErr) {
      console.error('Error al crear granja:', createFarmErr)
      return
    }
    farm = newFarm
  }

  console.log(`Granja activa: ${farm.name} (${farm.id})`)

  // 2. Comprobar o insertar salas / módulos / galpones
  const { data: existingRooms } = await supabase
    .from('rooms')
    .select('id, code, name')
    .eq('plant_id', farm.id)

  const existingCodes = new Set((existingRooms || []).map((r) => r.code))
  console.log(`Salas existentes en la granja: ${existingCodes.size}`)

  const roomsToInsert = PLANO_BASE_GRANJA.filter((r) => !existingCodes.has(r.code)).map((r) => ({
    plant_id: farm.id,
    org_id: ORG_ID,
    code: r.code,
    name: r.name,
    type: r.type,
    pos_x: r.pos_x,
    pos_y: r.pos_y,
    width: r.width,
    height: r.height,
    rotation: 0,
    doors: r.doors || [],
  }))

  if (roomsToInsert.length > 0) {
    console.log(`Insertando ${roomsToInsert.length} salas/módulos/galpones...`)
    const { error: rErr } = await supabase.from('rooms').insert(roomsToInsert)
    if (rErr) {
      console.error('Error insertando salas:', rErr)
    } else {
      console.log('Salas insertadas con éxito.')
    }
  }

  // 3. Traer todas las salas de la granja con sus IDs para vincular galpones (máquinas)
  const { data: allFarmRooms } = await supabase
    .from('rooms')
    .select('id, code, name')
    .eq('plant_id', farm.id)

  const roomByCode = Object.fromEntries((allFarmRooms || []).map((r) => [r.code, r]))

  // 4. Crear equipos de Galpón Piso 1 y Piso 2
  const { data: existingMachines } = await supabase
    .from('machines')
    .select('id, code')
    .eq('plant_id', farm.id)

  const existingMachineCodes = new Set((existingMachines || []).map((m) => m.code))
  const machinesToInsert = []

  for (const g of GALPONES_BASE_MAQUINAS) {
    const room = roomByCode[`G${g.num}`]
    const roomId = room?.id || null

    // Piso 1
    const codeP1 = `G-${g.num}01`
    if (!existingMachineCodes.has(codeP1)) {
      machinesToInsert.push({
        plant_id: farm.id,
        room_id: roomId,
        code: codeP1,
        name: `${g.name} Piso 1`,
        type: 'other',
        brand: 'galpon_p1',
        model: 'Galpón Climatizado P1',
        capacity_eggs: 25000,
        status: 'active',
        installed_at: '2025-01-15',
      })
    }

    // Piso 2
    const codeP2 = `G-${g.num}02`
    if (!existingMachineCodes.has(codeP2)) {
      machinesToInsert.push({
        plant_id: farm.id,
        room_id: roomId,
        code: codeP2,
        name: `${g.name} Piso 2`,
        type: 'other',
        brand: 'galpon_p2',
        model: 'Galpón Climatizado P2',
        capacity_eggs: 25000,
        status: 'active',
        installed_at: '2025-01-15',
      })
    }
  }

  if (machinesToInsert.length > 0) {
    console.log(`Insertando ${machinesToInsert.length} unidades de galpón (piso 1 y piso 2)...`)
    const { error: mErr } = await supabase.from('machines').insert(machinesToInsert)
    if (mErr) {
      console.error('Error insertando máquinas:', mErr)
    } else {
      console.log('Equipos de galpón insertados con éxito.')
    }
  }

  console.log('¡Plano y estructura de la granja restaurados al 100%!')
}

run()
