/**
 * Cliente HTTP hacia API REST Siesa / middleware de integración.
 * Las credenciales viven en la config del tenant.
 */

import { SIESA_INTEGRATION_VERSION } from './constants'

const TIMEOUT_MS = 25000

async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/**
 * Prueba de conectividad (health / ping del middleware).
 */
export async function testSiesaConnection(config) {
  if (!config?.baseUrl?.trim()) {
    return { ok: false, error: 'Falta la URL base del API Siesa / middleware.' }
  }
  const base = config.baseUrl.replace(/\/$/, '')
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-IncubApp-Integration': SIESA_INTEGRATION_VERSION,
  }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
    headers['X-Api-Key'] = config.apiKey
  }

  const candidates = [`${base}/health`, `${base}/api/health`, `${base}/ping`, base]

  let lastError = null
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', headers }, 12000)
      if (res.ok || res.status === 401 || res.status === 403) {
        return {
          ok: res.ok || res.status === 401 || res.status === 403,
          status: res.status,
          url,
          message: res.ok
            ? 'Conexión respondió correctamente.'
            : `Endpoint alcanzable (HTTP ${res.status}). Revisa credenciales si es 401/403.`,
        }
      }
      lastError = `HTTP ${res.status} en ${url}`
    } catch (e) {
      lastError = e.name === 'AbortError' ? 'Tiempo de espera agotado' : e.message
    }
  }
  return { ok: false, error: lastError || 'No se pudo contactar el endpoint' }
}

/**
 * Envía un lote de documentos mapeados al API.
 * Contrato esperado del middleware:
 *   POST {base}/api/siesa/documents  body: { companyCode, documents: [...] }
 * También acepta POST {base}/documents
 */
export async function pushDocumentsToSiesa(config, documents) {
  if (!config?.baseUrl?.trim()) {
    return { ok: false, error: 'URL base no configurada', results: [] }
  }
  if (!documents?.length) {
    return { ok: true, results: [], message: 'Sin documentos' }
  }

  const base = config.baseUrl.replace(/\/$/, '')
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-IncubApp-Integration': SIESA_INTEGRATION_VERSION,
    'X-Siesa-Company': config.companyCode || '',
  }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
    headers['X-Api-Key'] = config.apiKey
  }

  const body = {
    companyCode: config.companyCode,
    co: config.co,
    un: config.un,
    source: 'IncubApp',
    version: SIESA_INTEGRATION_VERSION,
    documents,
  }

  const paths = [`${base}/api/siesa/documents`, `${base}/siesa/documents`, `${base}/documents`]

  let lastError = null
  for (const url of paths) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = { raw: text }
      }
      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          url,
          results: json?.results || documents.map((d) => ({
            externalId: d.externalId,
            status: 'synced',
            remoteId: json?.id || null,
          })),
          raw: json,
        }
      }
      // 404 → probar siguiente path
      if (res.status === 404) {
        lastError = `HTTP 404 en ${url}`
        continue
      }
      return {
        ok: false,
        status: res.status,
        url,
        error: json?.message || json?.error || text || `HTTP ${res.status}`,
        results: [],
      }
    } catch (e) {
      lastError = e.name === 'AbortError' ? 'Timeout' : e.message
    }
  }
  return { ok: false, error: lastError || 'No se pudo enviar a Siesa', results: [] }
}
