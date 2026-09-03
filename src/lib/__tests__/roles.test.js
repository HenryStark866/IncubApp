/**
 * =============================================================================
 * ARCHIVO: src/lib/__tests__/roles.test.js
 * PROPÓSITO: Pruebas del modelo de roles/permisos — la columna vertebral de quién
 * ve qué en IncubApp. Cambios aquí afectan la seguridad visual de toda la app.
 * Henry Stark Desarrollador
 * =============================================================================
 */
import { describe, it, expect } from 'vitest'
import {
  ROLE_LABEL,
  ORG_ROLES,
  normalizeWorkArea,
  roleLabel,
  areaLabel,
  roleNeedsArea,
  defaultHomeTab,
  orgRolesGrouped,
  canSupervisePlant,
  canOperatePlantRounds,
  canAssignShiftWork,
} from '../roles'

describe('catálogo de roles', () => {
  it('todo rol asignable tiene etiqueta legible', () => {
    for (const r of ORG_ROLES) {
      expect(ROLE_LABEL[r.value], `falta etiqueta para ${r.value}`).toBeTruthy()
    }
  })

  it('roleLabel y areaLabel degradan con gracia ante valores desconocidos', () => {
    expect(roleLabel('rol_inventado')).toBe('rol_inventado')
    expect(typeof areaLabel('area_inventada')).toBe('string')
  })

  it('normalizeWorkArea: válida pasa, desconocida cae a general, vacía queda null', () => {
    expect(normalizeWorkArea('plant')).toBe('plant')
    expect(normalizeWorkArea('no-existe')).toBe('general')
    expect(normalizeWorkArea(null)).toBeNull() // roles sin área (intencional)
    expect(normalizeWorkArea('Logística')).toBe('logistics') // alias en español
    expect(normalizeWorkArea('ventas')).toBe('sales')
  })

  it('los roles agrupados no repiten valores', () => {
    const seen = new Set()
    for (const { roles } of orgRolesGrouped()) {
      for (const r of roles) {
        expect(seen.has(r.value), `${r.value} duplicado`).toBe(false)
        seen.add(r.value)
      }
    }
  })
})

describe('gates de permisos', () => {
  it('el coordinador requiere área; el operario no', () => {
    expect(roleNeedsArea('coordinator')).toBe(true)
    expect(roleNeedsArea('operator')).toBe(false)
  })

  it('supervisión de planta: supervisor sí, observador no', () => {
    expect(canSupervisePlant('supervisor', 'plant')).toBe(true)
    expect(canSupervisePlant('viewer', 'plant')).toBe(false)
  })

  it('la ronda de planta la opera el turnero, no un cliente', () => {
    expect(canOperatePlantRounds('operator', 'plant')).toBe(true)
    expect(canOperatePlantRounds('customer', null)).toBe(false)
  })

  it('asignar tareas del turno es de supervisión, no de auxiliares', () => {
    expect(canAssignShiftWork('supervisor', 'plant')).toBe(true)
    expect(canAssignShiftWork('auxiliary', 'plant')).toBe(false)
  })
})

describe('defaultHomeTab', () => {
  it('cada rol aterriza en una pestaña definida (string no vacío)', () => {
    for (const r of ORG_ROLES) {
      const tab = defaultHomeTab({ role: r.value, isPlatformAdmin: false })
      expect(typeof tab).toBe('string')
      expect(tab.length).toBeGreaterThan(0)
    }
  })

  it('el admin de plataforma tiene su propio home', () => {
    const tab = defaultHomeTab({ role: 'owner', isPlatformAdmin: true })
    expect(typeof tab).toBe('string')
    expect(tab.length).toBeGreaterThan(0)
  })
})
