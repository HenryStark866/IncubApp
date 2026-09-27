/**
 * =============================================================================
 * ARCHIVO: src/lib/offlineAuth.js
 * PROPÓSITO: Entrar a IncubApp sin internet (23-09-2026, pedido de Henry: «debería
 *   funcionar 100% offline») y reconocer los errores de red para no mostrar
 *   «Failed to fetch» en crudo.
 * CÓMO FUNCIONA:
 *   - Cada vez que alguien inicia sesión CON red, se guarda en este dispositivo
 *     una huella de su contraseña (PBKDF2-SHA256, 150 000 vueltas, sal aleatoria),
 *     nunca la contraseña. La sesión de Supabase ya queda guardada por supabase-js.
 *   - Sin red, el mismo correo y la misma contraseña se comprueban contra esa
 *     huella y se abre la sesión guardada: la app trabaja con lo que tiene en el
 *     dispositivo y la cola offline sube todo al volver la señal.
 *   - Solo funciona en un dispositivo donde esa persona ya entró con internet.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

const KEY = 'incubapp:offline-login:v1'
const ITERATIONS = 150000
const MAX_USERS = 8

/** ¿El error es de red (sin conexión, DNS, servidor inalcanzable) y no de credenciales? */
export function isNetworkError(err) {
  if (!err) return false
  const name = String(err.name || '')
  const msg = String(err.message || err || '').toLowerCase()
  if (name === 'AuthRetryableFetchError' || (name === 'TypeError' && /fetch/.test(msg))) return true
  if (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504) return true
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|err_network|err_internet|err_name_not_resolved|timeout|timed out|aborted|unexpected token|is not valid json|syntaxerror/.test(msg)
}

/** Mensajes de Supabase Auth en español, para que nadie vea textos crudos en inglés. */
export function authErrorEs(err) {
  if (!err) return null
  const msg = String(err.message || err).toLowerCase()
  if (/unexpected token|is not valid json|syntaxerror/.test(msg)) {
    return 'No se pudo conectar con el servidor de autenticación (la respuesta del servidor no fue un JSON válido). Revisa que el servidor local de Supabase esté activo.'
  }
  if (isNetworkError(err)) {
    return 'No hay conexión con el servidor. Revisa tu red local o internet; si ya entraste antes en este dispositivo, puedes entrar sin conexión con tu mismo correo y contraseña.'
  }
  if (/invalid login credentials|invalid_credentials/.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/.test(msg)) return 'Tu correo aún no está confirmado. Abre el enlace que te llegó al correo (revisa también spam).'
  if (/user already registered|already been registered|already exists/.test(msg)) return 'Ya existe una cuenta con ese correo. Inicia sesión o usa «¿Olvidaste tu contraseña?».'
  if (/rate limit|too many|security purposes|only request this after/.test(msg)) return 'Se hicieron muchos intentos seguidos desde el servidor de correo. Espera unos minutos y vuelve a intentarlo.'
  if (/password should be at least|weak password|password is too/.test(msg)) return 'La contraseña es muy corta o débil: usa mínimo 6 caracteres (mejor 8, con números).'
  if (/signups not allowed|signup is disabled/.test(msg)) return 'El registro de cuentas nuevas está desactivado en el servidor. Pide al administrador que lo active.'
  if (/invalid email|unable to validate email|email address .* is invalid/.test(msg)) return 'El correo no es válido. Revísalo.'
  if (/database error saving new user/.test(msg)) return 'El servidor no pudo crear la cuenta (error al guardar el usuario). Avísale al administrador.'
  return err.message || String(err)
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? JSON.parse(raw) : {}
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* sin almacenamiento: el modo sin conexión no queda disponible */
  }
}

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (hex) => new Uint8Array((hex.match(/.{2}/g) || []).map((h) => parseInt(h, 16)))
const norm = (email) => String(email || '').trim().toLowerCase()

async function derive(password, saltBytes, iterations = ITERATIONS) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('Este navegador no permite el acceso sin conexión (falta WebCrypto).')
  const key = await subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations }, key, 256)
  return toHex(bits)
}

/** Tras un inicio de sesión con red: deja lista la entrada sin conexión para esa persona. */
export async function rememberOfflineLogin({ email, password, user }) {
  const e = norm(email)
  const userId = user?.id
  if (!e || !password || !userId) return false
  try {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
    const hash = await derive(password, salt)
    const all = readAll()
    all[e] = {
      userId,
      // Lo mínimo para abrir la app sin red: identidad, no permisos (esos vienen de la caché del perfil).
      user: { id: userId, email: user.email || e, user_metadata: { full_name: user.user_metadata?.full_name || null } },
      salt: toHex(salt),
      hash,
      iterations: ITERATIONS,
      savedAt: new Date().toISOString(),
    }
    // Solo las últimas personas que usaron este dispositivo.
    const keep = Object.entries(all)
      .sort((a, b) => String(b[1].savedAt).localeCompare(String(a[1].savedAt)))
      .slice(0, MAX_USERS)
    writeAll(Object.fromEntries(keep))
    return true
  } catch {
    return false
  }
}

/** ¿Hay entrada sin conexión guardada para este correo? */
export function hasOfflineLogin(email) {
  return !!readAll()[norm(email)]
}

/** Comprueba correo + contraseña contra la huella guardada. Devuelve el usuario guardado o null. */
export async function verifyOfflineLogin(email, password) {
  const rec = readAll()[norm(email)]
  if (!rec || !password) return null
  try {
    const hash = await derive(password, fromHex(rec.salt), rec.iterations || ITERATIONS)
    // Comparación sin cortocircuito.
    let diff = hash.length ^ rec.hash.length
    for (let i = 0; i < Math.min(hash.length, rec.hash.length); i++) diff |= hash.charCodeAt(i) ^ rec.hash.charCodeAt(i)
    return diff === 0 ? rec.user || { id: rec.userId, email: norm(email) } : null
  } catch {
    return null
  }
}

/** Olvida la entrada sin conexión (al cerrar sesión a propósito). */
export function forgetOfflineLogin(email) {
  const all = readAll()
  const e = norm(email)
  if (e && all[e]) {
    delete all[e]
    writeAll(all)
  }
}

/** Clave donde supabase-js guarda la sesión: sb-<ref>-auth-token. */
export function sessionStorageKey(supabaseUrl) {
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0]
    return `sb-${ref}-auth-token`
  } catch {
    return null
  }
}

/**
 * La última sesión que guardó supabase-js en este dispositivo, aunque su token ya
 * haya vencido: sin red no se puede renovar, pero sirve para trabajar localmente.
 */
export function readStoredSession(supabaseUrl) {
  const k = sessionStorageKey(supabaseUrl)
  if (!k) return null
  try {
    const raw = localStorage.getItem(k)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const s = parsed?.currentSession || parsed
    return s?.user?.id && s?.access_token ? s : null
  } catch {
    return null
  }
}

/**
 * Sesión para trabajar sin red: la guardada por supabase-js si es de esa persona;
 * si no hay (cerró sesión antes), una local marcada `offline` que no sirve para el
 * servidor. Al volver la red, App pide iniciar sesión de nuevo si hace falta.
 */
export function offlineSessionFor(user, supabaseUrl) {
  const stored = readStoredSession(supabaseUrl)
  if (stored?.user?.id === user?.id) return { ...stored, offline: true }
  return { access_token: 'offline', token_type: 'offline', offline: true, user }
}

/** Marca y lectura del modo sin conexión (lo muestra el aviso y lo quita la reconexión). */
export const OFFLINE_SESSION_EVENT = 'incubapp:offline-session'

export function startOfflineSession(session) {
  try {
    window.dispatchEvent(new CustomEvent(OFFLINE_SESSION_EVENT, { detail: { session } }))
  } catch {
    /* */
  }
}

/* ── Caché de datos que la app necesita para arrancar sin red ───────────── */

const cacheKey = (kind, userId) => `incubapp:cache:${kind}:${userId}`

export function saveBootCache(kind, userId, value) {
  if (!userId) return
  try {
    localStorage.setItem(cacheKey(kind, userId), JSON.stringify({ at: Date.now(), value }))
  } catch {
    /* */
  }
}

export function readBootCache(kind, userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(cacheKey(kind, userId))
    return raw ? JSON.parse(raw)?.value ?? null : null
  } catch {
    return null
  }
}
