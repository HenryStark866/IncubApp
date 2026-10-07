/**
 * =============================================================================
 * ARCHIVO: src/hooks/useAdmin.js
 * PROPÓSITO: Hook de administración — plataforma CDH Maker O admin de licencia
 * de una empresa (coordinadores / gerencia / owner / admin org).
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase, createIsolatedAuthClient } from '../lib/supabase'
import { normalizeWorkArea, isPlatformStaffOrgRole } from '../lib/roles'
import { templateSettingsPayload } from '../lib/clientMenuTemplate'
import { queryRows } from '../lib/queryRows'

/**
 * @param {boolean|object} opts
 * @param {boolean} [opts.enabled=true]
 * @param {string|null} [opts.orgId] — si se define, modo tenant (solo esa empresa)
 */
/**
 * La base no da error cuando RLS deja fuera la fila: devuelve 0 filas. Eso es «sin rango»
 * (20261007_jerarquia_usuarios), no un éxito.
 */
async function sinRango(query) {
  const { data, error } = await query
  if (error) return { error }
  if (Array.isArray(data) && data.length === 0)
    return { error: 'No tiene rango para ese cambio: solo puede administrar a personas de menor rango de su área.' }
  return { error: null }
}

/** Mensaje entendible para los errores de la base en Administración (07-10-2026). */
export function mensajeAdmin(msg = '') {
  const m = String(msg || '')
  if (/statement timeout|canceling statement|57014/i.test(m)) return 'La base de datos tardó demasiado en responder. Intente de nuevo en un momento.'
  if (/rango|jerarqu/i.test(m)) return m
  if (/not allowed|row-level security|permission denied|42501|no autorizado/i.test(m))
    return 'No tiene permiso para ese cambio: solo puede administrar a personas de menor rango que usted.'
  if (/duplicate key|already (exists|registered)|ya existe/i.test(m)) return 'Ese usuario o dato ya existe.'
  if (/failed to fetch|network|fetch/i.test(m)) return 'Sin conexión con el servidor. Revise la red e intente de nuevo.'
  return m
}

/** Export «useAdmin»: API pública de este módulo. Henry Stark Desarrollador */
export function useAdmin(opts = true) {
  const enabled = typeof opts === 'boolean' ? opts : opts?.enabled !== false
  const scopeOrgId = typeof opts === 'object' && opts ? opts.orgId || null : null
  const tenantMode = Boolean(scopeOrgId)

  const [users, setUsers] = useState([])
  const [orgs, setOrgs] = useState([])
  const [plants, setPlants] = useState([])
  const [members, setMembers] = useState([])
  const [rooms, setRooms] = useState([])
  const [machines, setMachines] = useState([])
  const [sensors, setSensors] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [latest, setLatest] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)

    if (tenantMode) {
      // ── Solo la empresa de la licencia (coordinadores / gerencia) ──
      // 07-10-2026: cada consulta va por su lado con un reintento si la base tarda
      // (statement timeout). Lo que no carga se nombra en el aviso y lo demás se muestra;
      // máquinas y lecturas se piden solo de las plantas y sensores de la empresa.
      const fallas = []
      const pedir = async (etiqueta, table, build, { critica = true } = {}) => {
        const r = await queryRows(table, build)
        if (r.error) {
          if (critica) fallas.push(etiqueta)
          console.warn(`[IncubApp] Administración · ${etiqueta}:`, r.error)
        }
        return r
      }
      const [o, p, m, r, s, wo] = await Promise.all([
        pedir('empresa', 'organizations', (q) => q.select('id, name, slug, nit, created_at').eq('id', scopeOrgId)),
        pedir('plantas y granjas', 'plants', (q) =>
          q.select('id, org_id, name, code, city, status, created_at').eq('org_id', scopeOrgId).order('created_at', { ascending: true }),
        ),
        pedir('miembros', 'organization_members', (q) => q.select('org_id, user_id, role, area, job_title').eq('org_id', scopeOrgId)),
        pedir('salas', 'rooms', (q) => q.select('id, plant_id, org_id, name, code, type').eq('org_id', scopeOrgId)),
        pedir(
          'sensores',
          'sensors',
          (q) => q.select('id, org_id, machine_id, room_id, code, kind, unit, min_threshold, max_threshold, status').eq('org_id', scopeOrgId),
          { critica: false },
        ),
        pedir(
          'órdenes de trabajo',
          'work_orders',
          (q) =>
            q
              .select('id, org_id, plant_id, machine_id, code, title, type, priority, status, created_at')
              .eq('org_id', scopeOrgId)
              .in('status', ['open', 'in_progress'])
              .order('created_at', { ascending: false })
              .limit(1000),
          { critica: false },
        ),
      ])

      setOrgs(o.data.length ? [o.data[0]] : [])
      setPlants(p.data)
      // Sin developer ni roles de plataforma
      const mem = m.data.filter((x) => !isPlatformStaffOrgRole(x.role))
      setMembers(mem)
      setRooms(r.data)
      setSensors(s.data)
      setWorkOrders(wo.data)

      const plantIds = p.data.map((x) => x.id)
      const userIds = [...new Set(mem.map((x) => x.user_id))]
      const sensorIds = s.data.map((x) => x.id)
      const [mq, u, rd] = await Promise.all([
        plantIds.length
          ? pedir('máquinas', 'machines', (q) =>
              q.select('id, plant_id, room_id, panel_room_id, code, name, type, status, capacity_eggs').in('plant_id', plantIds),
            )
          : { data: [] },
        userIds.length
          ? pedir('usuarios', 'profiles', (q) =>
              q.select('id, email, full_name, phone, platform_role, is_approved, created_at').in('id', userIds).order('created_at', { ascending: false }),
            )
          : { data: [] },
        sensorIds.length
          ? pedir(
              'lecturas de sensores',
              'sensor_readings',
              (q) =>
                q
                  .select('sensor_id, value, recorded_at')
                  .in('sensor_id', sensorIds)
                  .gte('recorded_at', new Date(Date.now() - 2 * 86400000).toISOString())
                  .order('recorded_at', { ascending: false })
                  .limit(500),
              { critica: false },
            )
          : { data: [] },
      ])
      setMachines(mq.data)
      // Ocultar staff CDH Maker / developer
      setUsers(u.data.filter((row) => row.platform_role !== 'admin' && row.platform_role !== 'developer'))
      const map = {}
      for (const row of rd.data) {
        if (!map[row.sensor_id]) map[row.sensor_id] = { value: Number(row.value), recorded_at: row.recorded_at }
      }
      setLatest(map)
      if (fallas.length) {
        setError(
          `No cargó: ${fallas.join(', ')}. La base de datos tardó demasiado o no respondió; lo demás se muestra. Toque «Reintentar» en un momento.`,
        )
      }
      setLoading(false)
      return
    }

    // ── Plataforma CDH Maker (todas las empresas) ──
    const [u, o, p, m, r, mq, s, rd, wo] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, phone, platform_role, is_approved, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('organizations')
        .select('id, name, slug, nit, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('plants')
        .select('id, org_id, name, code, city, status, created_at')
        .order('created_at', { ascending: true }),
      supabase.from('organization_members').select('org_id, user_id, role, area, job_title'),
      supabase.from('rooms').select('id, plant_id, org_id, name, code, type'),
      supabase
        .from('machines')
        .select('id, plant_id, room_id, code, name, type, status, capacity_eggs'),
      supabase
        .from('sensors')
        .select(
          'id, org_id, machine_id, room_id, code, kind, unit, min_threshold, max_threshold, status'
        ),
      supabase
        .from('sensor_readings')
        .select('sensor_id, value, recorded_at')
        .order('recorded_at', { ascending: false })
        .limit(500),
      supabase
        .from('work_orders')
        .select(
          'id, org_id, plant_id, machine_id, code, title, type, priority, status, created_at'
        )
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1000),
    ])
    const err =
      u.error || o.error || p.error || m.error || r.error || mq.error || s.error || rd.error || wo.error
    if (err) setError(err.message)
    setUsers(u.data ?? [])
    setOrgs(o.data ?? [])
    setPlants(p.data ?? [])
    setMembers(m.data ?? [])
    setRooms(r.data ?? [])
    setMachines(mq.data ?? [])
    setSensors(s.data ?? [])
    setWorkOrders(wo.data ?? [])
    const map = {}
    for (const row of rd.data ?? []) {
      if (!map[row.sensor_id]) {
        map[row.sensor_id] = { value: Number(row.value), recorded_at: row.recorded_at }
      }
    }
    setLatest(map)
    setLoading(false)
  }, [enabled, tenantMode, scopeOrgId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!enabled) return
    const channel = supabase
      .channel(tenantMode ? `admin:readings:${scopeOrgId}` : 'admin:readings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings' },
        (payload) => {
          const r = payload.new
          setLatest((prev) => {
            const cur = prev[r.sensor_id]
            if (cur && cur.recorded_at > r.recorded_at) return prev
            return {
              ...prev,
              [r.sensor_id]: { value: Number(r.value), recorded_at: r.recorded_at },
            }
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled, tenantMode, scopeOrgId])

  const wrap = (fn) => async (...args) => {
    setError(null)
    const { error: err } = await fn(...args)
    if (err) {
      const msg = mensajeAdmin(typeof err === 'string' ? err : err.message)
      setError(msg)
      return { error: msg }
    }
    await loadAll()
    return { error: null }
  }

  // ── Usuarios ────────────────────────────────────────────────
  const setUserAccess = wrap(async (userId, { approved, platformRole }) => {
    // En tenant: no se toca platform_role; se usa RPC de org si existe
    if (tenantMode) {
      const orgRpc = await supabase.rpc('org_set_user_approved', {
        p_user: userId,
        p_approved: !!approved,
      })
      if (!orgRpc.error) return { error: null }
      // Sin rango (o a sí mismo): la base lo negó a propósito; no se intenta por otro camino
      if (orgRpc.error.code === '42501' || /rango|propio acceso/i.test(orgRpc.error.message || '')) return { error: orgRpc.error }

      const rpc = await supabase.rpc('admin_set_user_access', {
        p_user: userId,
        p_approved: approved ?? null,
        p_platform_role: null,
      })
      if (!rpc.error) return { error: null }

      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: !!approved })
        .eq('id', userId)
      return { error: error || orgRpc.error || rpc.error }
    }

    return supabase.rpc('admin_set_user_access', {
      p_user: userId,
      p_approved: approved ?? null,
      p_platform_role: platformRole ?? null,
    })
  })

  const updateProfile = wrap((userId, patch) => {
    const safe = { ...patch }
    if (tenantMode) {
      delete safe.platform_role
      delete safe.platformRole
    }
    return supabase.from('profiles').update(safe).eq('id', userId)
  })

  const createUser = wrap(async ({ email, password, fullName, approved }) => {
    let { data, error: err } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', email, password, full_name: fullName, approved },
    })
    // El servidor propio no tiene la función «admin-users» (28-09-2026): la cuenta se
    // crea con el registro normal en un cliente aparte, sin tocar la sesión del admin.
    if (err || !data || data?.error) {
      const created = await createAccountBySignup({ email, password, fullName })
      if (created.error) return { error: created.error }
      data = { user: { id: created.userId } }
      err = null
    }

    // Tenant: asignar de inmediato a la empresa de la licencia
    if (tenantMode && scopeOrgId) {
      const newId = data?.user?.id || data?.id || data?.user_id
      if (newId) {
        const { error: mErr } = await supabase.from('organization_members').insert({
          org_id: scopeOrgId,
          user_id: newId,
          role: 'operator',
          area: null,
        })
        if (mErr) return { error: mErr }
        if (approved !== false) {
          await supabase.from('profiles').update({ is_approved: true }).eq('id', newId)
        }
      }
    }
    return { error: null }
  })

  const deleteUser = wrap(async (userId) => {
    if (tenantMode) {
      // Solo quitar de la empresa (no borrar cuenta global)
      return sinRango(
        supabase.from('organization_members').delete().eq('org_id', scopeOrgId).eq('user_id', userId).select('user_id'),
      )
    }
    const { data, error: err } = await supabase.functions.invoke('admin-users', {
      body: { action: 'delete', user_id: userId },
    })
    if (err) return { error: err }
    if (data?.error) return { error: data.error }
    return { error: null }
  })

  // ── Empresas ────────────────────────────────────────────────
  const createOrg = wrap(async ({ name, slug, nit }) => {
    if (tenantMode) return { error: 'No autorizado: solo puede administrar su empresa.' }
    const base = {
      name: name.trim(),
      slug: slug.trim(),
      nit: nit?.trim() || null,
    }
    const withTemplate = { ...base, settings: templateSettingsPayload() }
    let { error } = await supabase.from('organizations').insert(withTemplate)
    if (error && /settings|column|schema/i.test(error.message || '')) {
      ;({ error } = await supabase.from('organizations').insert(base))
    }
    return { error }
  })
  const updateOrg = wrap((orgId, patch) => {
    if (tenantMode && orgId !== scopeOrgId) {
      return Promise.resolve({ error: { message: 'Solo su empresa' } })
    }
    return supabase.from('organizations').update(patch).eq('id', orgId)
  })
  const deleteOrg = wrap((orgId) => {
    if (tenantMode) return Promise.resolve({ error: { message: 'No autorizado' } })
    return supabase.from('organizations').delete().eq('id', orgId)
  })

  const sanitizeClientRole = (role) => {
    if (role === 'developer' || isPlatformStaffOrgRole(role)) return 'operator'
    return role || 'viewer'
  }

  const addMember = wrap((orgId, userId, role, area = null) => {
    const targetOrg = tenantMode ? scopeOrgId : orgId
    if (tenantMode && orgId && orgId !== scopeOrgId) {
      return Promise.resolve({ error: { message: 'Solo su empresa' } })
    }
    const safeRole = sanitizeClientRole(role)
    // organization_members.area es NOT NULL: siempre un valor válido del enum
    const safeArea =
      safeRole === 'coordinator'
        ? normalizeWorkArea(area) || 'plant'
        : normalizeWorkArea(area) || 'general'
    return supabase.from('organization_members').upsert(
      {
        org_id: targetOrg,
        user_id: userId,
        role: safeRole,
        area: safeArea,
      },
      { onConflict: 'org_id, user_id' }
    )
  })

  /** Contraseña temporal para quien no puede recuperar la suya por correo. */
  const setUserPassword = wrap((userId, password) =>
    supabase.rpc('admin_set_user_password', { p_user_id: userId, p_password: password })
  )

  const saveMember = wrap((orgId, userId, { role, area, jobTitle } = {}) => {
    const targetOrg = tenantMode ? scopeOrgId : orgId
    if (tenantMode && orgId && orgId !== scopeOrgId) {
      return Promise.resolve({ error: { message: 'Solo su empresa' } })
    }
    const safeRole = sanitizeClientRole(role)
    // area NOT NULL en DB: sin área elegida se guarda 'general' (antes null → error 23502)
    const patch = { role: safeRole }
    if (safeRole === 'coordinator') {
      patch.area = normalizeWorkArea(area) || 'plant'
    } else {
      patch.area = normalizeWorkArea(area) || 'general'
    }
    if (jobTitle !== undefined) patch.job_title = jobTitle?.trim() || null
    return sinRango(
      supabase.from('organization_members').update(patch).eq('org_id', targetOrg).eq('user_id', userId).select('user_id'),
    )
  })

  const setMemberRole = wrap((orgId, userId, role, area = null) => {
    const targetOrg = tenantMode ? scopeOrgId : orgId
    const safeRole = sanitizeClientRole(role)
    const patch = { role: safeRole }
    if (safeRole === 'coordinator') {
      patch.area = normalizeWorkArea(area) || 'plant'
    } else {
      patch.area = normalizeWorkArea(area) || 'general'
    }
    return sinRango(
      supabase.from('organization_members').update(patch).eq('org_id', targetOrg).eq('user_id', userId).select('user_id'),
    )
  })

  const setMemberArea = wrap((orgId, userId, area) =>
    supabase
      .from('organization_members')
      .update({ area: normalizeWorkArea(area) || 'general' })
      .eq('org_id', tenantMode ? scopeOrgId : orgId)
      .eq('user_id', userId)
  )

  const removeMember = wrap((orgId, userId) => {
    const targetOrg = tenantMode ? scopeOrgId : orgId
    // No borrar developer
    return sinRango(
      supabase.from('organization_members').delete().eq('org_id', targetOrg).eq('user_id', userId).neq('role', 'developer').select('user_id'),
    )
  })

  const createPlant = wrap(({ orgId, name, code, city }) => {
    const targetOrg = tenantMode ? scopeOrgId : orgId
    return supabase.from('plants').insert({
      org_id: targetOrg,
      name: name.trim(),
      code: code?.trim() || name.trim().slice(0, 3).toUpperCase(),
      city: city?.trim() || null,
    })
  })
  const updatePlant = wrap((plantId, patch) =>
    supabase.from('plants').update(patch).eq('id', plantId)
  )
  const deletePlant = wrap((plantId) => supabase.from('plants').delete().eq('id', plantId))

  const updateRoom = wrap((roomId, patch) => supabase.from('rooms').update(patch).eq('id', roomId))
  const deleteRoom = wrap((roomId) => supabase.from('rooms').delete().eq('id', roomId))
  const deleteMachine = wrap((machineId) => supabase.from('machines').delete().eq('id', machineId))

  return {
    setUserPassword,
    users,
    orgs,
    plants,
    members,
    rooms,
    machines,
    sensors,
    workOrders,
    latest,
    loading,
    error,
    reload: loadAll,
    tenantMode,
    scopeOrgId,
    setUserAccess,
    updateProfile,
    createUser,
    deleteUser,
    createOrg,
    updateOrg,
    deleteOrg,
    addMember,
    saveMember,
    setMemberRole,
    setMemberArea,
    removeMember,
    createPlant,
    updatePlant,
    deletePlant,
    updateRoom,
    deleteRoom,
    deleteMachine,
  }
}

/** Crea la cuenta con el registro normal (sin sesión propia) y devuelve su id. */
async function createAccountBySignup({ email, password, fullName }) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanEmail) return { error: 'Falta el correo' }
  if (!password || password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' }
  const client = createIsolatedAuthClient()
  const { data, error } = await client.auth.signUp({
    email: cleanEmail,
    password,
    options: { data: { full_name: fullName || '' } },
  })
  if (error) return { error: error.message }
  // Correo ya registrado: Supabase responde un usuario «vacío», sin identidades.
  if (!data?.user?.id || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
    return { error: 'Ya existe una cuenta con ese correo. Agrégala a la empresa desde «Rol» o asígnale una contraseña temporal.' }
  }
  await client.auth.signOut().catch(() => {})
  return { userId: data.user.id }
}
