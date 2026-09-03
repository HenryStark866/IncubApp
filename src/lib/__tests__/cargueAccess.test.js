/**
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/cargueAccess.test.js
 * PROPÓSITO: Fija la regla «el módulo Cargue está habilitado para todos los
 *   perfiles de la empresa» (pedido 2026-07-12), con la única excepción del
 *   cliente externo del portal comercial. Si se rompe, algún rol perdería la
 *   pestaña Cargue o el cliente externo vería operación interna.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import { effectiveTabsFor } from '../privacyScopes'
import { DEFAULT_CLIENT_TEMPLATE } from '../clientMenuTemplate'

const rolesConCargue = [
  ['operator', 'general'],
  ['auxiliary', 'general'],
  ['auxiliary_production', 'general'],
  ['reception_operator', 'general'],
  ['supervisor', 'general'],
  ['coordinator', 'plant'],
  ['coordinator', 'hr'],
  ['management', null],
  ['hr_auxiliary', 'hr'],
  ['driver', 'logistics'],
  ['barn_operator', 'farm'],
  ['plant_veterinarian', 'veterinary'],
]

describe('módulo Cargue habilitado para todos', () => {
  it.each(rolesConCargue)('el rol %s (área %s) ve la pestaña cargue', (role, area) => {
    const tabs = effectiveTabsFor({ role, area, isOmniscient: false, grantedScopeIds: [] })
    expect(tabs.has('cargue')).toBe(true)
  })

  it('el cliente externo del portal NO ve cargue', () => {
    const tabs = effectiveTabsFor({ role: 'customer', area: null, isOmniscient: false, grantedScopeIds: [] })
    expect(tabs.has('cargue')).toBe(false)
  })

  it('la plantilla marca cargue como ítem always (menú de todos)', () => {
    const item = DEFAULT_CLIENT_TEMPLATE.menu.find((m) => m.id === 'cargue')
    expect(item?.always).toBe(true)
  })
})
