/**
 * ARCHIVO / FILE: src/lib/__tests__/transferenciasImportadas.test.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * ES: Pruebas de los ayudantes para transferencias importadas del WhatsApp.
 * EN: Tests for the helpers handling transfers imported from WhatsApp.
 */
import { describe, expect, it } from 'vitest'
import { transferenciasPorNacer } from '../transferenciasPorNacer'
import { esTransferenciaImportada, etiquetaOrigenTransferencia, fotoDeTransferencia } from '../origenTransferencia'
import { transferenciasDeLaIncubadora } from '../transferenciasDeLaIncubadora'
import { computeAllMachineStates } from '../machineOpsState'

const ahora = Date.parse('2026-10-06T17:00:00Z')

describe('transferenciasPorNacer', () => {
  it('ES: solo recientes y sin nacimiento / EN: only recent and not hatched', () => {
    const t = [
      { id: 'a', transferred_at: '2026-10-05T22:00:00Z' }, // ES: reciente / EN: recent
      { id: 'b', transferred_at: '2026-07-14T10:00:00Z' }, // ES: histórico importado / EN: imported history
      { id: 'c', transferred_at: '2026-10-03T18:00:00Z' }, // ES: ya nació / EN: already hatched
      { id: 'd' }, // ES: sin fecha → se muestra / EN: no date → shown
    ]
    expect(transferenciasPorNacer(t, new Set(['c']), ahora).map((x) => x.id)).toEqual(['a', 'd'])
  })
})

describe('origenTransferencia', () => {
  const importada = { origen: { clave: 'wa-x', fuente: 'whatsapp:Transferencias', reportado_por: 'Germán (planta)' }, photo_path: 'importado/whatsapp' }
  it('ES: reconoce importadas / EN: recognizes imports', () => {
    expect(esTransferenciaImportada(importada)).toBe(true)
    expect(esTransferenciaImportada({ photo_path: 'org/x.jpg' })).toBe(false)
  })
  it('ES: etiqueta y foto / EN: label and photo', () => {
    expect(etiquetaOrigenTransferencia(importada)).toBe('💬 WhatsApp · Germán (planta)')
    expect(etiquetaOrigenTransferencia({})).toBeNull()
    expect(fotoDeTransferencia(importada)).toBeNull()
    expect(fotoDeTransferencia({ photo_path: 'org/transfers/1.jpg' })).toBe('org/transfers/1.jpg')
  })
})

describe('transferenciasDeLaIncubadora', () => {
  it('ES: une por lote y por origen sin repetir / EN: merges by lot and source without repeats', () => {
    const a = { id: 'a', transferred_at: '2026-09-02T00:00:00Z' }
    const b = { id: 'b', transferred_at: '2026-09-01T00:00:00Z' }
    const r = transferenciasDeLaIncubadora({ maquinaId: 'm1', porLote: [a], porOrigen: new Map([['m1', [a, b]]]) })
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('computeAllMachineStates con transferencia por incubadora', () => {
  it('ES: «43 + 44» desde la INC cierra el cargue «43 y 44» / EN: per-setter transfer closes the load', () => {
    const machines = [{ id: 'inc1', type: 'setter', plant_id: 'p' }]
    const loads = [{ id: 'l1', machine_id: 'inc1', lote: '43 y 44', loaded_at: '2026-09-16T20:00:00Z', cycle_start_at: '2026-09-17T03:00:00Z' }]
    const transfers = [{ id: 't1', lote: '43 + 44', source_machine_id: 'inc1', transferred_at: '2026-10-05T22:00:00Z', room_ids: [] }]
    const estado = computeAllMachineStates({ machines, loads, transfers, hatches: [], now: ahora }).get('inc1')
    expect(estado.last_transfer_id ?? estado.timeline.find((x) => x.kind === 'transfer')?.id).toBe('t1')
  })
})
