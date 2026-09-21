/**
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/orgModules.test.js
 * PROPÓSITO: Prueba el control de módulos por empresa (lista negra
 *   disabled_menu_ids). Si se rompe, la consola podría apagar módulos núcleo
 *   (dejando inoperante al cliente) o los apagados seguirían visibles.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import {
  CORE_MODULE_IDS,
  buildModuleCatalog,
  disabledModulesSettingsPatch,
  isCoreModule,
  isModuleTabEnabled,
  readDisabledMenuIds,
} from '../orgModules'
import { DEFAULT_CLIENT_TEMPLATE } from '../clientMenuTemplate'

describe('núcleo no desactivable', () => {
  it('incluye las pestañas activas de la plantilla, perfil y admin', () => {
    expect(isCoreModule('hoy')).toBe(true)
    expect(isCoreModule('misionales')).toBe(true)
    expect(isCoreModule('perfil')).toBe(true)
    expect(isCoreModule('admin')).toBe(true)
  })
  it('los módulos operativos sí se pueden apagar', () => {
    expect(isCoreModule('ventas')).toBe(false)
    expect(isCoreModule('iot')).toBe(false)
    expect(isCoreModule('datos-op')).toBe(false)
  })
})

describe('readDisabledMenuIds', () => {
  it('sin settings o sin lista → nada apagado (retrocompatible con orgs viejas)', () => {
    expect(readDisabledMenuIds(null).size).toBe(0)
    expect(readDisabledMenuIds({}).size).toBe(0)
    expect(readDisabledMenuIds({ enabled_menu_ids: ['hoy'] }).size).toBe(0)
  })
  it('ignora módulos núcleo aunque queden en la lista guardada', () => {
    const set = readDisabledMenuIds({ disabled_menu_ids: ['hoy', 'admin', 'ventas'] })
    expect(set.has('ventas')).toBe(true)
    expect(set.has('hoy')).toBe(false)
    expect(set.has('admin')).toBe(false)
  })
})

describe('isModuleTabEnabled', () => {
  it('todo habilitado cuando no hay lista negra', () => {
    expect(isModuleTabEnabled(null, 'ventas')).toBe(true)
    expect(isModuleTabEnabled(new Set(), 'ventas')).toBe(true)
  })
  it('un módulo en la lista negra queda oculto; el resto no', () => {
    const disabled = new Set(['ventas'])
    expect(isModuleTabEnabled(disabled, 'ventas')).toBe(false)
    expect(isModuleTabEnabled(disabled, 'logistica')).toBe(true)
  })
})

describe('disabledModulesSettingsPatch', () => {
  it('filtra módulos núcleo y sella auditoría', () => {
    const patch = disabledModulesSettingsPatch(new Set(['ventas', 'hoy']), { userId: 'u1' })
    expect(patch.disabled_menu_ids).toEqual(['ventas'])
    expect(patch.modules_updated_by).toBe('u1')
    expect(typeof patch.modules_updated_at).toBe('string')
  })
})

describe('buildModuleCatalog', () => {
  it('cubre toda la plantilla y marca los núcleo', () => {
    const catalog = buildModuleCatalog()
    expect(catalog.length).toBe(DEFAULT_CLIENT_TEMPLATE.menu.length)
    const byId = Object.fromEntries(catalog.map((m) => [m.id, m]))
    expect(byId.hoy.core).toBe(true)
    expect(byId.ventas.core).toBe(false)
    // Todo id núcleo del catálogo debe estar en CORE_MODULE_IDS
    for (const m of catalog.filter((x) => x.core)) {
      expect(CORE_MODULE_IDS.has(m.id)).toBe(true)
    }
  })
})
