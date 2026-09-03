/**
 * =============================================================================
 * ARCHIVO: src/lib/theme.js
 * PROPÓSITO: Tema claro/oscuro persistido en el documento.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Tema de la aplicación: claro (predeterminado) u oscuro.
 * Preferencia por usuario/navegador, persistida en localStorage.
 * Se aplica con el atributo data-theme en <html>.
 */
const KEY = 'incubapp_theme'
const LEGACY_KEY = 'incubant_theme'

/** Export «getTheme»: API pública de este módulo. Henry Stark Desarrollador */
export function getTheme() {
  try {
    const v = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    return v === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Export «applyTheme»: API pública de este módulo. Henry Stark Desarrollador */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light')
}

/** Export «setTheme»: API pública de este módulo. Henry Stark Desarrollador */
export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* almacenamiento no disponible: se aplica solo en esta sesión */
  }
  applyTheme(theme)
}

/** Se llama una vez al arrancar la app. */
export function initTheme() {
  applyTheme(getTheme())
}
