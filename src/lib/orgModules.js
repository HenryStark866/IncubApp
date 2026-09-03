/**
 * =============================================================================
 * ARCHIVO: src/lib/orgModules.js
 * PROPÓSITO: Control por empresa de los módulos del catálogo IncubApp.
 * CÓMO FUNCIONA: La consola de plataforma (CDH Maker) guarda en
 * organizations.settings.disabled_menu_ids la lista de módulos APAGADOS para
 * ese tenant. Se usa lista negra (no blanca) para que los módulos nuevos del
 * producto queden habilitados por defecto en empresas ya creadas.
 * Los módulos base (always) y la administración de la empresa no se pueden
 * apagar: sin ellos la operación diaria del cliente queda inutilizable.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { DEFAULT_CLIENT_TEMPLATE } from './clientMenuTemplate'
import { PRIVACY_DOMAINS } from './privacyScopes'

/** Módulos que NUNCA se pueden apagar por empresa (núcleo del producto). */
export const CORE_MODULE_IDS = new Set([
  ...DEFAULT_CLIENT_TEMPLATE.menu.filter((m) => m.always).map((m) => m.id),
  'perfil',
  // Sin administración el owner del cliente no puede gestionar sus usuarios.
  'admin',
])

/** ¿El módulo es parte del núcleo no desactivable? */
export function isCoreModule(menuId) {
  return CORE_MODULE_IDS.has(menuId)
}

/** Dominios de plataforma que no aplican al catálogo del cliente. */
const PLATFORM_ONLY_DOMAINS = new Set(['design', 'datos'])

/**
 * Catálogo de módulos asignables por empresa, desde la plantilla base.
 * Cada ítem: { id, tab, label, group, hint, core, domains[] } donde domains
 * son los módulos herméticos (privacyScopes) que incluyen esa pestaña.
 */
export function buildModuleCatalog(template = DEFAULT_CLIENT_TEMPLATE) {
  return template.menu.map((m) => {
    const tab = m.tab || m.id
    const domains = PRIVACY_DOMAINS.filter(
      (d) => !PLATFORM_ONLY_DOMAINS.has(d.id) && (d.tabs || []).includes(tab)
    ).map((d) => d.label)
    return {
      id: m.id,
      tab,
      label: m.label,
      group: m.group || 'Operación',
      hint: m.hint || null,
      core: isCoreModule(m.id),
      domains,
    }
  })
}

/** Lee la lista negra de módulos desde organizations.settings. */
export function readDisabledMenuIds(settings) {
  const raw = settings?.disabled_menu_ids
  if (!Array.isArray(raw)) return new Set()
  // Los módulos núcleo jamás se consideran apagados, aunque queden en la lista.
  return new Set(raw.filter((id) => typeof id === 'string' && !isCoreModule(id)))
}

/**
 * ¿La pestaña está habilitada para la empresa?
 * @param {Set<string>|null|undefined} disabledSet — de readDisabledMenuIds
 * @param {string} tab
 */
export function isModuleTabEnabled(disabledSet, tab) {
  if (!disabledSet || disabledSet.size === 0) return true
  return !disabledSet.has(tab)
}

/** Payload de settings a fusionar al guardar la configuración de módulos. */
export function disabledModulesSettingsPatch(disabledIds, { userId } = {}) {
  return {
    disabled_menu_ids: [...disabledIds].filter((id) => !isCoreModule(id)),
    modules_updated_at: new Date().toISOString(),
    modules_updated_by: userId || null,
  }
}
