/**
 * Cliente Supabase — nunca tumba la app al importar.
 * Henry Stark Desarrollador
 */
import { createClient } from '@supabase/supabase-js'

function clean(v) {
  if (v == null) return ''
  return String(v).trim().replace(/^["']|["']$/g, '')
}

const rawUrl = clean(import.meta.env.VITE_SUPABASE_URL)
const rawKey = clean(import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)

const urlOk = rawUrl === '/' || /^https?:\/\//i.test(rawUrl)
const keyOk = rawKey.length > 20

const FALLBACK_URL = 'http://localhost:8000'
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMjY4Mzg0LCJleHAiOjE5NDc5NDgzODR9.UyVjG0WzdpjFapougBPaZbdh_tk653_YmrdYaf7QYuo'

export const supabaseConfigError = !urlOk
  ? 'VITE_SUPABASE_URL inválida o vacía en .env (debe ser http://localhost:8000 o https://xxxxx.supabase.co)'
  : !keyOk
    ? 'VITE_SUPABASE_KEY inválida o vacía en .env (usa la anon/public key del proyecto)'
    : null

function resolveSupabaseUrl() {
  // Proyecto en la nube de Supabase: se usa tal cual, sea cual sea el dominio de la app.
  if (urlOk && /\.supabase\.co\/?$/i.test(rawUrl)) return rawUrl.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    // Servidor propio (túnel, incubapp.cdhmaker.com o red local): la app y la API
    // salen por el mismo nginx, así que el origen de la página es el de Supabase.
    const { origin, hostname, port, protocol } = window.location
    // Si se accede vía túnel (ngrok / cloudflare) o directo por puerto 80 / 443 / producción
    if (hostname.includes('ngrok') || hostname.includes('trycloudflare.com') || protocol === 'https:' || !port || port === '80') {
      return origin
    }
    // Si se accede por Vite dev server (puerto 3000 o 5173) en la máquina o red
    if (port === '3000' || port === '5173') {
      return `${protocol}//${hostname}:8000`
    }
    if (baseIncludesLocalhost(rawUrl) && hostname && !['localhost', '127.0.0.1'].includes(hostname)) {
      return `${protocol}//${hostname}:8000`
    }
  }
  return urlOk ? rawUrl.replace(/\/$/, '') : FALLBACK_URL
}

function baseIncludesLocalhost(u) {
  return u && (u.includes('localhost:8000') || u.includes('127.0.0.1:8000'))
}

export const SUPABASE_URL = resolveSupabaseUrl()

/*
 * Ruta de respaldo: si el navegador no alcanza *.supabase.co —DNS del
 * proveedor, firewall de la planta, bloqueo del operador— la misma petición sale
 * por el dominio de la app (/sb/…), que Vercel reenvía a Supabase (vercel.json).
 * NOTA: Es EXCLUSIVA para la nube de Supabase; en servidores locales o túneles ngrok
 * las peticiones van directas.
 */
const PROXY_FLAG = 'incubapp:sb-via-proxy'
let viaProxy = false
try {
  if (typeof sessionStorage !== 'undefined') {
    // Si la URL del servidor no es la nube de Supabase, eliminar bandera residual
    if (!SUPABASE_URL.includes('.supabase.co')) {
      sessionStorage.removeItem(PROXY_FLAG)
    } else {
      viaProxy = sessionStorage.getItem(PROXY_FLAG) === '1'
    }
  }
} catch {
  /* */
}

function proxiedUrl(url) {
  // Solo aplicar proxy /sb/ si el backend es la nube oficial de Supabase
  if (typeof window === 'undefined' || !url || !SUPABASE_URL.includes('.supabase.co')) return null
  if (!url.startsWith(SUPABASE_URL)) return null
  return `${window.location.origin}/sb${url.slice(SUPABASE_URL.length)}`
}

// Cortes cortos del internet de la planta (el túnel se reconecta solo en 10-30 s):
// las lecturas (GET/HEAD) se reintentan en silencio antes de mostrar un error.
const RETRY_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524, 530])
const RETRY_WAITS = [1000, 3000, 6000, 10000]
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/** Export «resilientFetch»: fetch de Supabase con reintentos ante cortes cortos de la red. */
export async function resilientFetch(input, init) {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD'
  for (let attempt = 0; ; attempt++) {
    const last = !idempotent || attempt >= RETRY_WAITS.length || init?.signal?.aborted
    try {
      const res = await fetchOnce(input, init)
      if (last || !RETRY_STATUS.has(res.status)) return res
    } catch (err) {
      if (last) throw err
    }
    await pause(RETRY_WAITS[attempt])
  }
}

/** Un intento: bypass de ngrok y protección contra respuestas HTML. */
async function fetchOnce(input, init) {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ? input.url : null

  // Inyectar header para saltar advertencia de ngrok
  const customHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : {}))
  if (!customHeaders.has('ngrok-skip-browser-warning')) {
    customHeaders.set('ngrok-skip-browser-warning', '69420')
  }

  // Si estamos en el navegador y la URL apunta a localhost:8000 pero estamos en ngrok o puerto 80
  if (typeof window !== 'undefined' && url) {
    const origin = window.location.origin
    const isDevPort = window.location.port === '3000' || window.location.port === '5173'
    if (url.startsWith('http://localhost:8000') && !isDevPort) {
      url = `${origin}${url.slice('http://localhost:8000'.length)}`
    }
  }

  const effectiveInit = { ...init, headers: customHeaders }
  const effectiveInput = url || input

  const alt = url ? proxiedUrl(url) : null
  const tryFetch = async (targetUrl, targetInit) => {
    const res = await fetch(targetUrl, targetInit)
    const ct = res.headers.get('content-type') || ''
    // Si el servidor devolvió HTML (página 502/404 de nginx o advertencia ngrok), devolver JSON seguro para evitar SyntaxError
    if (ct.includes('text/html')) {
      const isBadGateway = res.status === 502
      const isNotFound = res.status === 404
      const isNgrok = res.headers.has('ngrok-error-code') || (await res.clone().text().catch(() => '')).includes('ngrok')
      const msg = isBadGateway
        ? 'Se cortó la conexión con el servidor. Se actualiza solo al volver la señal.'
        : isNgrok
          ? 'Advertencia de ngrok detectada. Abre el enlace en el navegador y confirma para continuar.'
          : isNotFound
            ? 'Ruta no encontrada en el servidor (404).'
            : res.status === 413
              ? 'El archivo es demasiado grande para el servidor (HTTP 413).'
              : `Respuesta no válida del servidor (HTTP ${res.status}). Intenta de nuevo en unos momentos.`
      return new Response(
        JSON.stringify({
          error: res.status >= 400 ? `http_${res.status}` : 'invalid_response',
          message: msg,
        }),
        {
          status: res.status >= 400 ? res.status : 503,
          statusText: res.statusText || 'Service Error',
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    return res
  }

  if (!alt || import.meta.env.DEV) return tryFetch(effectiveInput, effectiveInit)
  if (viaProxy) {
    try {
      return await tryFetch(alt, effectiveInit)
    } catch {
      /* la ruta de respaldo también falló: probar directo */
    }
  }

  const upload = /\/storage\/v1\/object\//.test(url) && (init?.method || 'GET') !== 'GET'
  const slow = upload || /\/functions\/v1\//.test(url)
  const ctrl = !slow && typeof AbortController !== 'undefined' ? new AbortController() : null
  // Recuperar contraseña o confirmar cuenta espera a que el servidor envíe el correo:
  // con 12 s el intento se cortaba y se mostraba como «sin conexión».
  const mail = /\/auth\/v1\/(recover|otp|resend|signup|magiclink)/.test(url)
  const timer = ctrl ? setTimeout(() => ctrl.abort(), mail ? 45000 : 12000) : null
  const outer = init?.signal
  if (ctrl && outer) {
    if (outer.aborted) ctrl.abort()
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  try {
    return await tryFetch(effectiveInput, ctrl ? { ...effectiveInit, signal: ctrl.signal } : effectiveInit)
  } catch (err) {
    if (outer?.aborted) throw err
    if (!alt) throw err
    const res = await tryFetch(alt, effectiveInit)
    viaProxy = true
    try {
      sessionStorage.setItem(PROXY_FLAG, '1')
    } catch {
      /* */
    }
    return res
  } finally {
    if (timer) clearTimeout(timer)
  }
}

let client
try {
  client = createClient(SUPABASE_URL, keyOk ? rawKey : FALLBACK_KEY, {
    global: { fetch: resilientFetch },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  })
} catch (e) {
  console.error('createClient failed:', e)
  client = createClient(FALLBACK_URL, FALLBACK_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/*
 * Cerrar sesión sin red: supabase-js avisa al servidor antes de borrar la sesión
 * local y, si no hay red, devuelve el error sin cerrar nada. Aquí, si falla, se
 * borra la sesión del dispositivo igual y se avisa a App (evento de abajo).
 */
export const SIGNED_OUT_EVENT = 'incubapp:signed-out'
try {
  const originalSignOut = client.auth.signOut.bind(client.auth)
  client.auth.signOut = async (options) => {
    let res
    try {
      res = await originalSignOut(options)
    } catch (err) {
      res = { error: err }
    }
    if (res?.error && typeof localStorage !== 'undefined') {
      try {
        const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
        localStorage.removeItem(`sb-${ref}-auth-token`)
      } catch {
        /* */
      }
    }
    try {
      window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT))
    } catch {
      /* */
    }
    return { error: null }
  }
} catch {
  /* cliente de respaldo sin auth */
}

export const supabase = client

/**
 * Cliente aparte que no guarda sesión: sirve para crear la cuenta de otra persona
 * (Administración → Crear usuario) sin cerrar la sesión del administrador.
 */
export function createIsolatedAuthClient() {
  return createClient(SUPABASE_URL, keyOk ? rawKey : FALLBACK_KEY, {
    global: { fetch: resilientFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'incubapp-admin-signup' },
  })
}
