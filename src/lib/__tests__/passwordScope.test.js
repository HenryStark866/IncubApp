import { describe, expect, it } from 'vitest'
import { canSetPasswordFor } from '../passwordScope'

const m = (role, area = 'general') => ({ role, area })

describe('canSetPasswordFor', () => {
  it('el líder solo maneja a la gente de su área', () => {
    const plant = m('coordinator', 'plant')
    expect(canSetPasswordFor(plant, m('operator'))).toBe(true)
    expect(canSetPasswordFor(plant, m('operator', 'plant'))).toBe(true)
    expect(canSetPasswordFor(plant, m('maintenance_auxiliary', 'maintenance'))).toBe(false)
    expect(canSetPasswordFor(plant, m('maintenance_auxiliary'))).toBe(false)
    expect(canSetPasswordFor(plant, m('driver'))).toBe(false)
    expect(canSetPasswordFor(plant, m('coordinator', 'plant'))).toBe(false)
    expect(canSetPasswordFor(plant, m('management'))).toBe(false)
    const maint = m('coordinator', 'maintenance')
    expect(canSetPasswordFor(maint, m('maintenance_auxiliary'))).toBe(true)
    expect(canSetPasswordFor(maint, m('operator'))).toBe(false)
    expect(canSetPasswordFor(m('coordinator', 'hse'), m('sst_auxiliary', 'sst'))).toBe(true)
    expect(canSetPasswordFor(m('coordinator', 'general'), m('operator'))).toBe(true)
    expect(canSetPasswordFor(m('coordinator', 'general'), m('maintenance_auxiliary', 'maintenance'))).toBe(true)
    expect(canSetPasswordFor(m('coordinator', 'general'), m('coordinator', 'plant'))).toBe(false)
    expect(canSetPasswordFor(m('coordinator', 'general'), m('management'))).toBe(false)
  })
  it('gerencia y administración siguen igual', () => {
    expect(canSetPasswordFor(m('management'), m('coordinator', 'plant'))).toBe(true)
    expect(canSetPasswordFor(m('management'), m('admin'))).toBe(false)
    expect(canSetPasswordFor(m('admin'), m('management'))).toBe(true)
    expect(canSetPasswordFor(m('operator'), m('operator'))).toBe(false)
    expect(canSetPasswordFor(null, m('operator'))).toBe(false)
  })
})
