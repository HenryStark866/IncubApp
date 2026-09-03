/**
 * =============================================================================
 * ARCHIVO: src/hooks/useAccessControl.js
 * PROPÓSITO: Hook «useAccessControl»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  domainById,
  domainsGrantableBy,
  effectiveTabsFor,
  requestableDomainsFor,
} from '../lib/privacyScopes'

/**
 * Control de acceso hermético + grants temporales entre módulos.
 * Requiere tabla `access_grants` (ver supabase_migration_access_grants.sql).
 */
/** Export «useAccessControl»: API pública de este módulo. Henry Stark Desarrollador */
export function useAccessControl({ orgId, userId, role, area, isOmniscient }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [names, setNames] = useState({})

  const load = useCallback(async () => {
    if (!orgId || !userId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('access_grants')
      .select(
        'id, org_id, scope, requester_id, grantor_id, status, reason, decide_note, hours, requested_at, decided_at, expires_at'
      )
      .eq('org_id', orgId)
      .order('requested_at', { ascending: false })
      .limit(200)

    if (err) {
      const missing =
        err.code === '42P01' ||
        /relation .* does not exist/i.test(err.message) ||
        /could not find the table/i.test(err.message)
      setTableMissing(missing)
      setError(missing ? null : err.message)
      setRows([])
      setLoading(false)
      return
    }

    setTableMissing(false)
    setError(null)
    const list = data ?? []
    // Expirar en cliente (y best-effort en servidor)
    const now = Date.now()
    const normalized = []
    for (const r of list) {
      if (
        r.status === 'approved' &&
        r.expires_at &&
        new Date(r.expires_at).getTime() < now
      ) {
        normalized.push({ ...r, status: 'expired' })
        supabase
          .from('access_grants')
          .update({ status: 'expired' })
          .eq('id', r.id)
          .then(() => {})
      } else {
        normalized.push(r)
      }
    }
    setRows(normalized)

    const ids = new Set()
    for (const r of normalized) {
      if (r.requester_id) ids.add(r.requester_id)
      if (r.grantor_id) ids.add(r.grantor_id)
    }
    if (ids.size) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', [...ids])
      const map = {}
      for (const p of profs ?? []) {
        map[p.id] = p.full_name || p.email || p.id.slice(0, 8)
      }
      setNames(map)
    }
    setLoading(false)
  }, [orgId, userId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!orgId || tableMissing) return
    const ch = supabase
      .channel(`access_grants:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'access_grants', filter: `org_id=eq.${orgId}` },
        () => load()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orgId, tableMissing, load])

  const grantableDomains = useMemo(
    () => domainsGrantableBy(role, area),
    [role, area]
  )
  const grantableIds = useMemo(
    () => new Set(grantableDomains.map((d) => d.id)),
    [grantableDomains]
  )

  const myActiveGrants = useMemo(() => {
    const now = Date.now()
    return rows.filter(
      (r) =>
        r.requester_id === userId &&
        r.status === 'approved' &&
        (!r.expires_at || new Date(r.expires_at).getTime() > now)
    )
  }, [rows, userId])

  const grantedScopeIds = useMemo(
    () => [...new Set(myActiveGrants.map((r) => r.scope))],
    [myActiveGrants]
  )

  const tabs = useMemo(
    () =>
      effectiveTabsFor({
        role,
        area,
        isOmniscient,
        grantedScopeIds,
      }),
    [role, area, isOmniscient, grantedScopeIds]
  )

  const pendingForMe = useMemo(
    () =>
      rows.filter((r) => r.status === 'pending' && grantableIds.has(r.scope)),
    [rows, grantableIds]
  )

  const myRequests = useMemo(
    () => rows.filter((r) => r.requester_id === userId),
    [rows, userId]
  )

  const requestable = useMemo(
    () => requestableDomainsFor(role, area, isOmniscient),
    [role, area, isOmniscient]
  )

  const requestAccess = useCallback(
    async ({ scope, reason, hours = 8 }) => {
      if (!orgId || !userId) return { error: 'Sin sesión' }
      if (tableMissing) {
        return {
          error:
            'Falta la tabla access_grants. Ejecuta supabase_migration_access_grants.sql en Supabase.',
        }
      }
      const d = domainById(scope)
      if (!d) return { error: 'Área no válida' }
      // Evitar duplicado pending
      const dup = rows.find(
        (r) =>
          r.requester_id === userId &&
          r.scope === scope &&
          r.status === 'pending'
      )
      if (dup) return { error: 'Ya tienes una solicitud pendiente para este área' }

      const { error: err } = await supabase.from('access_grants').insert({
        org_id: orgId,
        scope,
        requester_id: userId,
        status: 'pending',
        reason: (reason || '').trim() || null,
        hours: Number(hours) || 8,
      })
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [orgId, userId, tableMissing, rows, load]
  )

  const decide = useCallback(
    async (id, { approve, note, hours } = {}) => {
      if (!userId) return { error: 'Sin sesión' }
      const row = rows.find((r) => r.id === id)
      if (!row) return { error: 'Solicitud no encontrada' }
      if (row.status !== 'pending') return { error: 'La solicitud ya fue resuelta' }
      if (!isOmniscient && !grantableIds.has(row.scope)) {
        return { error: 'No eres otorgante de ese módulo' }
      }
      const h = Number(hours || row.hours || 8)
      const expires = new Date(Date.now() + h * 3600 * 1000).toISOString()
      const { error: err } = await supabase
        .from('access_grants')
        .update({
          status: approve ? 'approved' : 'denied',
          grantor_id: userId,
          decide_note: (note || '').trim() || null,
          hours: h,
          decided_at: new Date().toISOString(),
          expires_at: approve ? expires : null,
        })
        .eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [userId, rows, isOmniscient, grantableIds, load]
  )

  const revoke = useCallback(
    async (id) => {
      const row = rows.find((r) => r.id === id)
      if (!row) return { error: 'No encontrada' }
      const can =
        isOmniscient ||
        row.requester_id === userId ||
        grantableIds.has(row.scope)
      if (!can) return { error: 'Sin permiso para revocar' }
      const { error: err } = await supabase
        .from('access_grants')
        .update({
          status: 'revoked',
          decided_at: new Date().toISOString(),
          grantor_id: userId,
        })
        .eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [rows, isOmniscient, userId, grantableIds, load]
  )

  const nameOf = useCallback((id) => names[id] || (id ? id.slice(0, 8) : '—'), [names])

  return {
    loading: !!loading,
    error: error || null,
    tableMissing: !!tableMissing,
    rows: rows || [],
    tabs: tabs || new Set(),
    grantedScopeIds: grantedScopeIds || [],
    myActiveGrants: myActiveGrants || [],
    pendingForMe: pendingForMe || [],
    myRequests: myRequests || [],
    requestable: requestable || [],
    grantableDomains: grantableDomains || [],
    requestAccess,
    decide,
    revoke,
    reload: load,
    nameOf,
    pendingCount: (pendingForMe || []).length,
  }
}
