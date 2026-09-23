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

const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(rawUrl) || /^https:\/\//i.test(rawUrl)
const keyOk = rawKey.length > 20

export const supabaseConfigError = !urlOk
  ? 'VITE_SUPABASE_URL inválida o vacía en .env (debe ser https://xxxxx.supabase.co)'
  : !keyOk
    ? 'VITE_SUPABASE_KEY inválida o vacía en .env (usa la anon/public key del proyecto)'
    : null

const FALLBACK_URL = 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co'
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0.placeholder'

export const SUPABASE_URL = urlOk ? rawUrl.replace(/\/$/, '') : FALLBACK_URL

/*
 * Ruta de respaldo (23-09-2026): si el navegador no alcanza *.supabase.co —DNS del
 * proveedor, firewall de la planta, bloqueo del operador— la misma petición sale
 * por el dominio de la app (/sb/…), que Vercel reenvía a Supabase (vercel.json).
 * Primero se intenta directo; si falla por red, se reintenta por /sb y se recuerda
 * en la sesión del navegador. Solo aplica a HTTP: el tiempo real (WebSocket) no
 * pasa por el reenvío y la app sigue funcionando sin él.
 */
const PROXY_FLAG = 'incubapp:sb-via-proxy'
let viaProxy = false
try {
  viaProxy = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PROXY_FLAG) === '1'
} catch {
  /* */
}

function proxiedUrl(url) {
  if (typeof window === 'undefined' || !url.startsWith(SUPABASE_URL)) return null
  return `${window.location.origin}/sb${url.slice(SUPABASE_URL.length)}`
}

/** Export «resilientFetch»: fetch de Supabase con ruta de respaldo por el dominio de la app. */
export async function resilientFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null
  const alt = url ? proxiedUrl(url) : null
  if (!alt || import.meta.env.DEV) return fetch(input, init)
  if (viaProxy) {
    try {
      return await fetch(alt, init)
    } catch {
      /* la ruta de respaldo también falló: probar directo */
    }
  }
  // Un firewall que descarta paquetes deja la petición colgada minutos: el intento
  // directo tiene tope de 12 s (salvo subidas de archivos y funciones).
  const upload = /\/storage\/v1\/object\//.test(url) && (init?.method || 'GET') !== 'GET'
  // Las funciones (asesor IA) pueden tardar en responder: tampoco llevan tope.
  const slow = upload || /\/functions\/v1\//.test(url)
  const ctrl = !slow && typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null
  const outer = init?.signal
  if (ctrl && outer) {
    if (outer.aborted) ctrl.abort()
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  try {
    return await fetch(url, ctrl ? { ...init, signal: ctrl.signal } : init)
  } catch (err) {
    if (outer?.aborted) throw err
    const res = await fetch(alt, init)
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
