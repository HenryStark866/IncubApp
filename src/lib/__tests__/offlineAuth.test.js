/**
 * @vitest-environment node
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/offlineAuth.test.js
 * PROPÓSITO: La entrada sin conexión solo abre con la contraseña correcta, nunca
 *   guarda la contraseña y distingue un fallo de red de unas credenciales malas.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect, beforeEach } from 'vitest'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const {
  authErrorEs,
  hasOfflineLogin,
  isNetworkError,
  offlineSessionFor,
  readStoredSession,
  rememberOfflineLogin,
  sessionStorageKey,
  verifyOfflineLogin,
} = await import('../offlineAuth')

const URL_SB = 'https://pdxlmjlooeqlvvgbosbu.supabase.co'
const user = { id: 'u-1', email: 'ana@incubant.co', user_metadata: { full_name: 'Ana' } }

describe('entrada sin conexión', () => {
  beforeEach(() => store.clear())

  it('abre solo con la misma contraseña y no guarda la contraseña', async () => {
    expect(await rememberOfflineLogin({ email: 'Ana@Incubant.co ', password: 'secreta1', user })).toBe(true)
    expect(hasOfflineLogin('ana@incubant.co')).toBe(true)
    expect([...store.values()].join('')).not.toContain('secreta1')
    expect((await verifyOfflineLogin('ana@incubant.co', 'secreta1'))?.id).toBe('u-1')
    expect(await verifyOfflineLogin('ana@incubant.co', 'otra')).toBeNull()
    expect(await verifyOfflineLogin('nadie@incubant.co', 'secreta1')).toBeNull()
  })

  it('usa la sesión guardada por supabase-js si es de esa persona', () => {
    store.set(sessionStorageKey(URL_SB), JSON.stringify({ access_token: 'tok', refresh_token: 'r', user }))
    expect(readStoredSession(URL_SB)?.access_token).toBe('tok')
    expect(offlineSessionFor(user, URL_SB)).toMatchObject({ access_token: 'tok', offline: true })
    expect(offlineSessionFor({ id: 'u-2' }, URL_SB)).toMatchObject({ access_token: 'offline', offline: true })
  })
})

describe('errores', () => {
  it('distingue red de credenciales', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true)
    expect(isNetworkError({ message: 'Invalid login credentials', status: 400 })).toBe(false)
  })
  it('traduce al español', () => {
    expect(authErrorEs({ message: 'Invalid login credentials' })).toBe('Correo o contraseña incorrectos.')
    expect(authErrorEs(new TypeError('Failed to fetch'))).toMatch(/No hay conexión/)
    expect(authErrorEs({ message: 'User already registered' })).toMatch(/Ya existe una cuenta/)
    expect(authErrorEs({ message: 'email rate limit exceeded' })).toMatch(/muchos intentos/)
  })
})
