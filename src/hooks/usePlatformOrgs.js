/**
 * Lista de empresas (tenants) para admin de plataforma IncubApp / CDH Maker.
 * Solo RLS is_platform_admin. Henry Stark · CDH Maker
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEV_TENANT_KEY = 'incubapp_platform_dev_tenant'

export function readDevTenantId() {
  try {
    return sessionStorage.getItem(DEV_TENANT_KEY) || null
  } catch {
    return null
  }
}

export function writeDevTenantId(id) {
  try {
    if (id) sessionStorage.setItem(DEV_TENANT_KEY, id)
    else sessionStorage.removeItem(DEV_TENANT_KEY)
  } catch {
    /* */
  }
}

/** @param {boolean} enabled */
export function usePlatformOrgs(enabled) {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(!!enabled)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!enabled) {
      setOrgs([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('organizations')
      .select('id, name, slug, nit, brand_key, created_at')
      .order('name', { ascending: true })
    if (err) {
      setError(err.message)
      setOrgs([])
    } else {
      setError(null)
      setOrgs(data ?? [])
    }
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    load()
  }, [load])

  // Refrescar lista al volver a la pestaña (tras crear empresa en Administración)
  useEffect(() => {
    if (!enabled) return
    const refresh = () => load()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh()
    })
    return () => {
      window.removeEventListener('focus', refresh)
    }
  }, [enabled, load])

  return { orgs, loading, error, reload: load }
}
