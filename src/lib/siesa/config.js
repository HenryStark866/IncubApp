/**
 * Configuración Siesa por organización (local + opcional Supabase).
 */

import { supabase } from '../supabase'
import { DEFAULT_SIESA_CONFIG } from './constants'

const LS_KEY = 'incubapp_siesa_config_v1'

function readAllLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

function writeAllLocal(map) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch {
    /* quota */
  }
}

export function getSiesaConfig(orgId) {
  if (!orgId) return { ...DEFAULT_SIESA_CONFIG }
  const all = readAllLocal()
  const saved = all[orgId]
  if (!saved) return { ...DEFAULT_SIESA_CONFIG }
  return {
    ...DEFAULT_SIESA_CONFIG,
    ...saved,
    docTypes: { ...DEFAULT_SIESA_CONFIG.docTypes, ...(saved.docTypes || {}) },
    itemCodes: { ...DEFAULT_SIESA_CONFIG.itemCodes, ...(saved.itemCodes || {}) },
    entities: { ...DEFAULT_SIESA_CONFIG.entities, ...(saved.entities || {}) },
  }
}

export function saveSiesaConfigLocal(orgId, partial) {
  if (!orgId) return getSiesaConfig(orgId)
  const prev = getSiesaConfig(orgId)
  const next = {
    ...prev,
    ...partial,
    docTypes: { ...prev.docTypes, ...(partial.docTypes || {}) },
    itemCodes: { ...prev.itemCodes, ...(partial.itemCodes || {}) },
    entities: { ...prev.entities, ...(partial.entities || {}) },
    updatedAt: new Date().toISOString(),
  }
  const all = readAllLocal()
  all[orgId] = next
  writeAllLocal(all)
  return next
}

/**
 * Intenta persistir en Supabase (tabla org_siesa_config).
 * Si la tabla no existe, se queda solo en localStorage.
 */
export async function loadSiesaConfig(orgId) {
  const local = getSiesaConfig(orgId)
  if (!orgId) return { config: local, source: 'default' }

  try {
    const { data, error } = await supabase
      .from('org_siesa_config')
      .select('config, updated_at')
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) {
      if (/does not exist|schema cache|relation/i.test(error.message || '')) {
        return { config: local, source: 'local' }
      }
      return { config: local, source: 'local', error: error.message }
    }
    if (data?.config && typeof data.config === 'object') {
      const merged = {
        ...DEFAULT_SIESA_CONFIG,
        ...data.config,
        docTypes: { ...DEFAULT_SIESA_CONFIG.docTypes, ...(data.config.docTypes || {}) },
        itemCodes: { ...DEFAULT_SIESA_CONFIG.itemCodes, ...(data.config.itemCodes || {}) },
        entities: { ...DEFAULT_SIESA_CONFIG.entities, ...(data.config.entities || {}) },
        updatedAt: data.updated_at || data.config.updatedAt || null,
      }
      saveSiesaConfigLocal(orgId, merged)
      return { config: merged, source: 'supabase' }
    }
  } catch (e) {
    return { config: local, source: 'local', error: e.message }
  }
  return { config: local, source: 'local' }
}

export async function persistSiesaConfig(orgId, partial) {
  const next = saveSiesaConfigLocal(orgId, partial)
  if (!orgId) return { config: next, source: 'local' }

  // No subir apiKey a logs; sí a tabla si el tenant la gestiona
  const payload = { ...next }
  try {
    const { error } = await supabase.from('org_siesa_config').upsert(
      {
        org_id: orgId,
        config: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )
    if (error) {
      if (/does not exist|schema cache|relation/i.test(error.message || '')) {
        return { config: next, source: 'local' }
      }
      return { config: next, source: 'local', error: error.message }
    }
    return { config: next, source: 'supabase' }
  } catch (e) {
    return { config: next, source: 'local', error: e.message }
  }
}

export function isSiesaReady(config) {
  if (!config?.enabled) return false
  if (!config.companyCode?.trim()) return false
  if (config.mode === 'rest' || config.mode === 'hybrid') {
    return Boolean(config.baseUrl?.trim())
  }
  return true
}
