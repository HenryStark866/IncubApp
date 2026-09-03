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

let client
try {
  client = createClient(urlOk ? rawUrl.replace(/\/$/, '') : FALLBACK_URL, keyOk ? rawKey : FALLBACK_KEY, {
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

export const supabase = client
