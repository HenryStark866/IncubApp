/**
 * Organización(es) del usuario — multi-tenant estricto.
 * - Un usuario solo ve orgs donde tiene membership (RLS).
 * - Puede pertenecer a varias empresas (p. ej. SaaS admin o consultor asignado).
 * - La empresa activa se elige y persiste; nunca se mezclan datos entre orgs.
 * Henry Stark Desarrollador · CDH Maker
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ACTIVE_ORG_STORAGE_KEY } from '../lib/platform'
import { readBootCache, saveBootCache } from '../lib/offlineAuth'

function readStoredOrgId() {
  try {
    return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) || null
  } catch {
    return null
  }
}

function writeStoredOrgId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, id)
    else localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY)
  } catch {
    /* */
  }
}

/**
 * @param {string|null|undefined} userId
 */
export function useOrganization(userId) {
  const [memberships, setMemberships] = useState([])
  const [org, setOrg] = useState(null)
  const [role, setRole] = useState(null)
  const [area, setArea] = useState('general')
  const [jobTitle, setJobTitle] = useState(null)
  /** Sede asignada (plants: { id, name, code }). null = toda la empresa. */
  const [site, setSite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const applyMembership = useCallback((row) => {
    if (!row) {
      setOrg(null)
      setRole(null)
      setArea('general')
      setJobTitle(null)
      setSite(null)
      return
    }
    setOrg(row.organizations || null)
    setSite(row.site_id ? row.plants || { id: row.site_id, name: null, code: null } : null)
    setRole(row.role)
    setArea(row.area ?? 'general')
    setJobTitle(row.job_title ?? null)
    if (row.organizations?.id) writeStoredOrgId(row.organizations.id)
  }, [])

  const loadOrg = useCallback(async () => {
    if (!userId) {
      setMemberships([])
      setOrg(null)
      setRole(null)
      setArea('general')
      setJobTitle(null)
      setSite(null)
      setLoading(false)
      return
    }
    // Sin red la app arranca con las empresas guardadas del último ingreso.
    const cached = readBootCache('memberships', userId)
    if (Array.isArray(cached) && cached.length) {
      setMemberships(cached)
      const preferred = readStoredOrgId()
      applyMembership(cached.find((r) => r.org_id === preferred || r.organizations?.id === preferred) || cached[0])
    }
    setLoading(!(Array.isArray(cached) && cached.length))
    try {
      // site_id (sede asignada, migración 20261006): si la columna aún no existe, el
      // primer intento falla y los de respaldo siguen sin sede, como antes.
      const { data, error: err } = await supabase
        .from('organization_members')
        .select(
          'role, area, job_title, org_id, site_id, plants ( id, name, code ), organizations ( id, name, slug, nit, country, timezone, brand_key, settings )'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      if (err) {
        // Fallback si created_at / brand_key / settings no existen
        let retry = await supabase
          .from('organization_members')
          .select(
            'role, area, job_title, org_id, organizations ( id, name, slug, nit, country, timezone, brand_key, settings )'
          )
          .eq('user_id', userId)
        if (retry.error) {
          retry = await supabase
            .from('organization_members')
            .select(
              'role, area, job_title, org_id, organizations ( id, name, slug, nit, country, timezone )'
            )
            .eq('user_id', userId)
        }
        if (retry.error) {
          setError(retry.error.message)
          // Error de red con empresas guardadas: se sigue trabajando con ellas.
          if (!(Array.isArray(cached) && cached.length)) {
            setMemberships([])
            applyMembership(null)
          }
        } else {
          setError(null)
          const rows = retry.data ?? []
          setMemberships(rows)
          saveBootCache('memberships', userId, rows)
          const preferred = readStoredOrgId()
          const pick =
            rows.find((r) => r.org_id === preferred || r.organizations?.id === preferred) ||
            rows[0] ||
            null
          applyMembership(pick)
        }
      } else {
        setError(null)
        const rows = data ?? []
        setMemberships(rows)
        saveBootCache('memberships', userId, rows)
        const preferred = readStoredOrgId()
        const pick =
          rows.find((r) => r.org_id === preferred || r.organizations?.id === preferred) ||
          rows[0] ||
          null
        applyMembership(pick)
      }
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [userId, applyMembership])

  useEffect(() => {
    loadOrg()
  }, [loadOrg])

  /** Cambia de empresa activa (solo si hay membership — aislamiento multi-tenant) */
  const switchOrg = useCallback(
    (orgId) => {
      if (!orgId) return { error: 'Empresa inválida' }
      const row = memberships.find(
        (m) => m.org_id === orgId || m.organizations?.id === orgId
      )
      if (!row) {
        return { error: 'No tienes acceso a esa empresa' }
      }
      applyMembership(row)
      // Avisar a cachés / paneles para recargar con el nuevo org_id
      try {
        window.dispatchEvent(
          new CustomEvent('cdh:org-switched', { detail: { orgId: row.organizations?.id } })
        )
      } catch {
        /* */
      }
      return { error: null }
    },
    [memberships, applyMembership]
  )

  /**
   * Alta de nueva empresa (RPC atómico: org + membership owner).
   * Solo debe usarse en flujos controlados (onboarding SaaS / admin).
   */
  const createOrganization = useCallback(
    async ({ name, slug, nit }) => {
      setError(null)
      const { error: err } = await supabase.rpc('create_organization', {
        p_name: name,
        p_slug: slug,
        p_nit: nit || null,
      })
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadOrg()
      return { error: null }
    },
    [loadOrg]
  )

  return {
    org,
    role,
    area,
    jobTitle,
    site,
    memberships,
    loading,
    error,
    createOrganization,
    switchOrg,
    reload: loadOrg,
  }
}
