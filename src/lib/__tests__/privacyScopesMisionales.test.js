import { describe, expect, it } from 'vitest'
import { nativeTabsFor } from '../privacyScopes'

describe('Misionales para todos los usuarios', () => {
  it.each([
    'operator',
    'auxiliary',
    'auxiliary_production',
    'reception_operator',
    'barn_operator',
    'technician',
    'supervisor',
    'coordinator',
    'management',
  ])('%s tiene la pestaña misionales', (role) => {
    expect(nativeTabsFor(role, null).has('misionales')).toBe(true)
  })
})
