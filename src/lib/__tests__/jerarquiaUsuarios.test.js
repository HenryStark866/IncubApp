import { describe, expect, it } from 'vitest'
import { canManageMember, canGrantRole } from '../passwordScope'

const gerente = { role: 'management', area: 'management' }
const lider = { role: 'coordinator', area: 'maintenance' }

describe('jerarquía para administrar personas', () => {
  it('gerencia administra a todos menos dueño, admin y otra gerencia', () => {
    expect(canManageMember(gerente, { role: 'coordinator', area: 'plant' })).toBe(true)
    expect(canManageMember(gerente, { role: 'operator', area: 'plant' })).toBe(true)
    expect(canManageMember(gerente, { role: 'management', area: 'management' })).toBe(false)
    expect(canManageMember(gerente, { role: 'owner' })).toBe(false)
  })
  it('el líder solo a la gente de su área y al recién creado sin cargo', () => {
    expect(canManageMember(lider, { role: 'maintenance_auxiliary', area: 'maintenance' })).toBe(true)
    expect(canManageMember(lider, { role: 'operator', area: null })).toBe(true)
    expect(canManageMember(lider, { role: 'operator', area: 'general' })).toBe(true)
    expect(canManageMember(lider, { role: 'operator', area: 'plant' })).toBe(false)
    expect(canManageMember(lider, { role: 'management', area: 'management' })).toBe(false)
    expect(canManageMember(lider, { role: 'coordinator', area: 'maintenance' })).toBe(false)
  })
  it('nadie asigna un cargo por encima del suyo', () => {
    expect(canGrantRole(lider, 'maintenance_auxiliary')).toBe(true)
    expect(canGrantRole(lider, 'coordinator')).toBe(false)
    expect(canGrantRole(lider, 'management')).toBe(false)
    expect(canGrantRole(gerente, 'coordinator')).toBe(true)
    expect(canGrantRole(gerente, 'owner')).toBe(false)
    expect(canGrantRole({ role: 'owner' }, 'admin')).toBe(true)
    expect(canGrantRole({ role: 'owner' }, 'developer')).toBe(false)
  })
})
