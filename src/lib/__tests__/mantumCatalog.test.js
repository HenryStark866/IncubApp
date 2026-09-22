import { describe, it, expect } from 'vitest'
import { resolveMantumKeys, getMantumDataForMachine } from '../../data/mantumCatalog'

describe('mantumCatalog & SIG Dossier Resolver', () => {
  it('resolves Mantum keys for incubators correctly', () => {
    const keys1 = resolveMantumKeys({ code: 'INC-1', name: 'Incubadora 1' })
    expect(keys1).toContain('INC-1')
    expect(keys1).toContain('INC-001.1')
    expect(keys1).toContain('001.1')

    const keys15 = resolveMantumKeys({ code: 'INC-15', name: 'Incubadora 15' })
    expect(keys15).toContain('INC-15')
    expect(keys15).toContain('INC-002.15')
  })

  it('resolves Mantum keys for hatchers correctly', () => {
    const keys = resolveMantumKeys({ code: 'NAC-01', name: 'Nacedora 1' })
    expect(keys).toContain('NAC-1')
    expect(keys).toContain('NAC-001.1')
  })

  it('resolves Mantum keys for chillers and auxiliary equipment', () => {
    const keysChiller = resolveMantumKeys({ code: 'CHILL-01', name: 'Chiller Trane' })
    expect(keysChiller).toContain('005.4')

    const keysCondenser = resolveMantumKeys({ code: 'COND-01', name: 'Condensador' })
    expect(keysCondenser).toContain('001.1')
  })

  it('enriches machine data with images, components, and maintenance plans', () => {
    const enriched = getMantumDataForMachine({
      code: 'INC-001.1',
      name: 'Incubadora 1',
      type: 'setter',
    })

    expect(enriched).toBeDefined()
    expect(enriched.imageUrl).toBeTruthy()
    expect(enriched.imageUrl).toContain('.jpg')
    expect(enriched.components.length).toBeGreaterThan(0)
    expect(enriched.maintenancePlan.length).toBeGreaterThan(0)
  })

  it('completes missing this-year history and AM plan for machines without catalog entries', () => {
    const enriched = getMantumDataForMachine({
      code: 'EQ-NEW-99',
      name: 'Máquina nueva sin registro',
      type: 'equipment',
    })

    expect(enriched).toBeDefined()
    expect(enriched.components.length).toBeGreaterThan(0)
    expect(enriched.maintenancePlan.length).toBeGreaterThan(0)
    expect(enriched.historicalOTs.length).toBeGreaterThan(0)
    expect(enriched.historicalOTs.some((ot) => String(ot.created_at || '').startsWith(String(new Date().getFullYear())))).toBe(true)
  })
})
