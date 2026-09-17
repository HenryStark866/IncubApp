/**
 * scripts/restore_all_profiles.mjs
 * Restaura y activa todas las cuentas y perfiles en Supabase:
 * 1. Confirma emails pendientes en auth.users
 * 2. Activa is_approved = true en public.profiles
 * 3. Restablece la membresía activa en organization_members para Antioqueña de Incubación SAS
 */

import { readFileSync } from 'fs'

const dotenv = readFileSync('.env.planta3d', 'utf8')
const env = {}
dotenv.split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (m) env[m[1]] = (m[2] || '').trim()
})

const url = env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

const ORG_INCUBANT = 'd54fca1e-1878-4967-aee5-330aa2e631cc' // Antioqueña de Incubación SAS

async function run() {
  console.log('🔄 Iniciando recuperación y activación de todas las cuentas…\n')

  // 1. Obtener todos los usuarios de Auth
  const authRes = await fetch(`${url}/auth/v1/admin/users?per_page=100`, { headers })
  const authData = await authRes.json()
  const users = authData.users || []
  console.log(`📋 Total de usuarios en auth.users: ${users.length}`)

  // Confirmar correos pendientes si los hay
  for (const u of users) {
    if (!u.email_confirmed_at) {
      console.log(`✉️ Confirmando email para ${u.email} (${u.id})…`)
      await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ email_confirm: true }),
      })
    }
  }

  // 2. Activar todos los perfiles en public.profiles: is_approved = true
  console.log('\n🟢 Activando y aprobando perfiles en public.profiles…')
  for (const u of users) {
    const profRes = await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, { headers })
    const prof = await profRes.json()
    if (prof && prof.length > 0) {
      await fetch(`${url}/rest/v1/profiles?id=eq.${u.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_approved: true }),
      })
      console.log(` ✅ Perfil aprobado: ${u.email} (${prof[0].full_name || 'Sin nombre'})`)
    } else {
      // Si no tiene perfil, crearlo
      const fullName = u.user_metadata?.full_name || u.email.split('@')[0]
      await fetch(`${url}/rest/v1/profiles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: u.id,
          email: u.email,
          full_name: fullName,
          is_approved: true,
          platform_role: 'user',
        }),
      })
      console.log(` ➕ Perfil creado y aprobado: ${u.email}`)
    }
  }

  // 3. Vincular y habilitar en organization_members
  console.log('\n🏢 Habilitando membresías en Antioqueña de Incubación SAS…')
  const memRes = await fetch(`${url}/rest/v1/organization_members?org_id=eq.${ORG_INCUBANT}`, { headers })
  const existingMems = await memRes.json()
  const existingUserIds = new Set((existingMems || []).map((m) => m.user_id))

  const ROLE_MAPPINGS = {
    'henrytaborda57@gmail.com': { role: 'admin', area: 'general' },
    'coordinador.planta@incubant.co': { role: 'coordinator', area: 'plant' },
    'logistica@incubant.co': { role: 'operator', area: 'logistics' },
    'aux.produccion@incubant.co': { role: 'operator', area: 'plant' },
    'sanprogramador8@gmail.com': { role: 'operator', area: 'general' },
    'jhonpiedrahita117@gmail.com': { role: 'supervisor', area: 'general' },
    'cdhmaker8@gmail.com': { role: 'supervisor', area: 'general' },
    'cdhmaker@gmail.com': { role: 'reception_operator', area: 'general' },
    'camilocorjara@gmail.com': { role: 'operator', area: 'general' },
    'sebastianatehortuaarboleda@gmail.com': { role: 'operator', area: 'general' },
    'davidcifuentesarteaga6@gmail.com': { role: 'operator', area: 'general' },
    'davidcifuentesartega6@gmail.com': { role: 'reception_operator', area: 'general' },
    'henrycamilotabordagaleano@pascualbravo.edu.co': { role: 'coordinator', area: 'general' },
    'juancarlossuaza29@gmail.com': { role: 'operator', area: 'general' },
    'cortesjuan1203@gmail.com': { role: 'operator', area: 'general' },
    'ft3497965@gmail.com': { role: 'operator', area: 'general' },
    'germanarangoholgui@gmail.com': { role: 'operator', area: 'general' },
  }

  for (const u of users) {
    const mapping = ROLE_MAPPINGS[u.email] || { role: 'operator', area: 'general' }
    if (!existingUserIds.has(u.id)) {
      console.log(` ➕ Asignando membresía a ${u.email} (Rol: ${mapping.role}, Área: ${mapping.area})…`)
      const addRes = await fetch(`${url}/rest/v1/organization_members`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          org_id: ORG_INCUBANT,
          user_id: u.id,
          role: mapping.role,
          area: mapping.area,
        }),
      })
      if (!addRes.ok) {
        console.error(`  ❌ Error asignando a ${u.email}:`, await addRes.text())
      } else {
        console.log(`  ✅ Membresía asignada con éxito`)
      }
    } else {
      console.log(` ℹ️ Ya tiene membresía: ${u.email}`)
    }
  }

  console.log('\n🎉 Todos los perfiles han sido restaurados, aprobados y habilitados exitosamente.')
}

run().catch(console.error)
