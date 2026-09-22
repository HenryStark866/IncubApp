import { describe, it, expect, vi, afterEach } from 'vitest'
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marca lo programado del año sin registro de ejecución, en vez de inventar OT cerradas', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T12:00:00-05:00'))
    const enriched = getMantumDataForMachine({
      code: 'EQ-NEW-99',
      name: 'Máquina nueva sin registro',
      type: 'equipment',
    })

    expect(enriched).toBeDefined()
    expect(enriched.components.length).toBeGreaterThan(0)
    expect(enriched.maintenancePlan.length).toBeGreaterThan(0)

    const thisYear = enriched.historicalOTs.filter((ot) => String(ot.created_at || '').startsWith('2026'))
    expect(thisYear.length).toBe(5)
    expect(thisYear.every((ot) => ot.sin_registro === true)).toBe(true)
    expect(thisYear.every((ot) => ot.status === 'Programada · sin registro de ejecución')).toBe(true)
    expect(thisYear.every((ot) => !ot.completed_at && !ot.technician && !ot.cost && !ot.feedback)).toBe(true)
    expect(thisYear.every((ot) => new Date(ot.created_at) <= new Date('2026-09-22T12:00:00-05:00'))).toBe(true)
  })

  it('las incubadoras suman calibraciones programadas, también sin registro', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T12:00:00-05:00'))
    const enriched = getMantumDataForMachine({ code: 'INC-99', name: 'Incubadora 99', type: 'setter' })
    const calibrations = enriched.historicalOTs.filter((ot) => ot.type === 'Calibración' && ot.sin_registro)

    expect(calibrations.map((ot) => ot.code)).toEqual(['INC-99-CALP-2026-05', 'INC-99-CALP-2026-07', 'INC-99-CALP-2026-09'])
    expect(enriched.historicalOTs.some((ot) => ot.approver === 'Metrología Externa')).toBe(false)
  })
})
