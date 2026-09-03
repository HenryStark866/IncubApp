/**
 * =============================================================================
 * ARCHIVO: src/hooks/useAdmin.js
 * PROPÓSITO: Hook de administración — plataforma CDH Maker O admin de licencia
 * de una empresa (coordinadores / gerencia / owner / admin org).
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeWorkArea, isPlatformStaffOrgRole } from '../lib/roles'
import { templateSettingsPayload } from '../lib/clientMenuTemplate'

/**
 * @param {boolean|object} opts
 * @param {boolean} [opts.enabled=true]
 * @param {string|null} [opts.orgId] — si se define, modo tenant (solo esa empresa)
 */
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
      const [o, p, m, r, mq, s, wo] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, slug, nit, created_at')
          .eq('id', scopeOrgId)
          .maybeSingle(),
        supabase
          .from('plants')
          .select('id, org_id, name, code, city, status, created_at')
          .eq('org_id', scopeOrgId)
          .order('created_at', { ascending: true }),
        supabase
          .from('organization_members')
          .select('org_id, user_id, role, area, job_title')
          .eq('org_id', scopeOrgId),
        supabase.from('rooms').select('id, plant_id, org_id, name, code, type').eq('org_id', scopeOrgId),
        supabase
          .from('machines')
          .select('id, plant_id, room_id, panel_room_id, code, name, type, status, capacity_eggs'),
        supabase
          .from('sensors')
          .select(
            'id, org_id, machine_id, room_id, code, kind, unit, min_threshold, max_threshold, status'
          )
          .eq('org_id', scopeOrgId),
        supabase
          .from('work_orders')
          .select(
            'id, org_id, plant_id, machine_id, code, title, type, priority, status, created_at'
          )
          .eq('org_id', scopeOrgId)
          .order('created_at', { ascending: false }),
      ])

      const err = o.error || p.error || m.error || r.error || mq.error || s.error || wo.error
      if (err) setError(err.message)

      const orgRow = o.data
      setOrgs(orgRow ? [orgRow] : [])
      setPlants(p.data ?? [])

      // Sin developer ni roles de plataforma
      const mem = (m.data ?? []).filter((x) => !isPlatformStaffOrgRole(x.role))
      setMembers(mem)

      const plantIds = new Set((p.data ?? []).map((x) => x.id))
      setRooms(r.data ?? [])
      setMachines((mq.data ?? []).filter((x) => plantIds.has(x.plant_id)))
      setSensors(s.data ?? [])
      setWorkOrders(wo.data ?? [])

      const userIds = [...new Set(mem.map((x) => x.user_id))]
      if (userIds.length) {
        const u = await supabase
          .from('profiles')
          .select('id, email, full_name, phone, platform_role, is_approved, created_at')
          .in('id', userIds)
          .order('created_at', { ascending: false })
        if (u.error) setError(u.error.message)
        // Ocultar staff CDH Maker / developer
        setUsers(
          (u.data ?? []).filter(
            (row) =>
              row.platform_role !== 'admin' &&
              row.platform_role !== 'developer' &&
              userIds.includes(row.id)
          )
        )
      } else {
        setUsers([])
      }

      // Lecturas de sensores de la org
      const sensorIds = (s.data ?? []).map((x) => x.id)
      if (sensorIds.length) {
        const rd = await supabase
          .from('sensor_readings')
          .select('sensor_id, value, recorded_at')
          .in('sensor_id', sensorIds)
          .order('recorded_at', { ascending: false })
          .limit(500)
        const map = {}
        for (const row of rd.data ?? []) {
          if (!map[row.sensor_id]) {
            map[row.sensor_id] = { value: Number(row.value), recorded_at: row.recorded_at }
          }
        }
        setLatest(map)
      } else {
        setLatest({})
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
        .order('created_at', { ascending: false }),
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
      const msg = typeof err === 'string' ? err : err.message
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
    const { data, error: err } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', email, password, full_name: fullName, approved },
    })
    if (err) return { error: err }
    if (data?.error) return { error: data.error }

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
      return supabase
        .from('organization_members')
        .delete()
        .eq('org_id', scopeOrgId)
        .eq('user_id', userId)
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
    return supabase.from('organization_members').insert({
      org_id: targetOrg,
      user_id: userId,
      role: safeRole,
      area: safeArea,
    })
  })

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
    return supabase
      .from('organization_members')
      .update(patch)
      .eq('org_id', targetOrg)
      .eq('user_id', userId)
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
    return supabase
      .from('organization_members')
      .update(patch)
      .eq('org_id', targetOrg)
      .eq('user_id', userId)
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
    return supabase
      .from('organization_members')
      .delete()
      .eq('org_id', targetOrg)
      .eq('user_id', userId)
      .neq('role', 'developer')
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
