/**
 * Consultas de los tableros de inicio: si una falla por un corte momentáneo o porque
 * la base tardó de más, se reintenta una vez; y el aviso al usuario solo aparece
 * cuando de verdad no hay conexión. Un error del servidor (una columna que cambió,
 * una tabla opcional que falta) no es culpa de la señal del usuario: queda en la
 * consola para soporte y el tablero muestra lo demás sin alarmar (30-09-2026).
 */
import { supabase } from './supabase'
import { isNetworkError, isOnline } from './network'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** ¿Vale la pena reintentar? Corte de red o la base cortó la consulta por tiempo. */
export function isTransientError(message = '', code = '') {
  return isNetworkError(message) || /statement timeout|canceling statement|57014|timed? ?out/i.test(`${message} ${code}`)
}

/**
 * @returns {Promise<{ data: any[], error?: string }>}
 */
export async function queryRows(table, build, { retries = 1, wait = 1500 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await build(supabase.from(table))
    } catch (e) {
      res = { error: { message: e?.message || String(e) } }
    }
    if (!res?.error) return { data: res?.data ?? [] }
    const message = res.error.message || String(res.error)
    if (attempt < retries && isTransientError(message, res.error.code)) {
      await sleep(wait)
      continue
    }
    return { data: [], error: `${table}: ${message}` }
  }
}

/**
 * Texto del aviso del tablero a partir de los errores de las consultas, o null.
 * Solo avisa si no hay conexión o si las fallas fueron de red.
 */
export function loadWarning(errors = [], { source = 'inicio' } = {}) {
  if (!errors?.length) return null
  if (!isOnline() || errors.some((e) => isNetworkError(e))) {
    return 'Sin conexión estable: algunos datos no cargaron. Se actualiza solo al volver la señal.'
  }
  console.warn(`[IncubApp] ${source}: consultas con error (el tablero muestra lo demás)`, errors)
  return null
}
