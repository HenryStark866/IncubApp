/**
 * =============================================================================
 * ARCHIVO: src/lib/accessLog.js
 * PROPÓSITO: Registrar el acceso del usuario a la app + metadatos del dispositivo
 *   en `user_access_log` (consola de desarrollador CDH Maker). Se guarda una vez
 *   por sesión (token) para no duplicar en cada render/recarga.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { supabase } from './supabase'

/** Sesiones ya registradas en esta carga de la app (evita inserts duplicados). */
const loggedKeys = new Set()

/** Deriva navegador y sistema operativo desde el user-agent. */
function parseUserAgent(ua = '') {
  let browser = 'Desconocido'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os = 'Desconocido'
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'
  return { browser, os }
}

/** mobile | tablet | desktop a partir de UA + touch. */
function detectDeviceType() {
  const ua = navigator.userAgent || ''
  const touch = (navigator.maxTouchPoints || 0) > 0
  if (/iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua) && touch)) return 'tablet'
  if (/Mobi|Android|iPhone|iPod/.test(ua)) return 'mobile'
  return 'desktop'
}

/** Metadatos del dispositivo/navegador disponibles en el cliente. */
export function collectDeviceMeta() {
  try {
    const ua = navigator.userAgent || ''
    const { browser, os } = parseUserAgent(ua)
    return {
      user_agent: ua.slice(0, 500),
      browser,
      os,
      device_type: detectDeviceType(),
      platform: navigator.platform || null,
      language: navigator.language || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      screen_w: window.screen?.width || null,
      screen_h: window.screen?.height || null,
      viewport_w: window.innerWidth || null,
      viewport_h: window.innerHeight || null,
      pixel_ratio: window.devicePixelRatio || null,
      device_memory: navigator.deviceMemory ?? null,
      hardware_concurrency: navigator.hardwareConcurrency ?? null,
      max_touch_points: navigator.maxTouchPoints ?? null,
      online: navigator.onLine ?? null,
      app_version: import.meta.env?.VITE_APP_VERSION || null,
      url: (location.href || '').slice(0, 500),
      referrer: (document.referrer || '').slice(0, 500) || null,
    }
  } catch {
    return {}
  }
}

/**
 * Inserta un registro de acceso (una vez por sesión). No bloquea la app si falla.
 */
export async function recordAccess({
  userId,
  orgId,
  role,
  area,
  platformRole,
  eventType = 'session',
} = {}) {
  if (!userId) return
  // Una vez por carga de la app y por usuario: el refresco de token (cada ~hora)
  // NO cuenta como un acceso nuevo, así el registro no se infla.
  const key = userId
  if (loggedKeys.has(key)) return
  loggedKeys.add(key)
  try {
    await supabase.from('user_access_log').insert({
      user_id: userId,
      org_id: orgId || null,
      event_type: eventType,
      role: role || null,
      area: area || null,
      platform_role: platformRole || null,
      ...collectDeviceMeta(),
    })
  } catch {
    // El registro de acceso nunca debe interrumpir el uso de la app.
    loggedKeys.delete(key) // permitir reintento en el próximo montaje
  }
}
