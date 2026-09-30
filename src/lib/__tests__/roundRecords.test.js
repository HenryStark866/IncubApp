import { describe, it, expect } from 'vitest'
import {
  groupChecksIntoRounds,
  hourSlotLabel,
  photoRoundsByUser,
  roundMachines,
  roundsForCompliance,
} from '../roundRecords'
import { roundRecordHtml } from '../sigRecordDocuments'

const base = { shift_date: '2026-09-28', shift_number: 2, plant_id: 'p1' }
const machinesById = {
  m1: { id: 'm1', code: 'INC-01', type: 'setter' },
  m2: { id: 'm2', code: 'INC-02', type: 'setter' },
  m3: { id: 'm3', code: 'NAC-01', type: 'hatcher' },
  m4: { id: 'm4', code: 'NAC-02', type: 'hatcher' },
}

describe('una ronda es una hora del turno en la planta', () => {
  const checks = [
    { ...base, id: 1, machine_id: 'm1', hour_slot: 15, taken_by: 'ana', taken_at: '2026-09-28T15:05:00', condition: 'normal', photo_path: 'a.jpg', temp_air: 99.5, humidity: 55 },
    { ...base, id: 2, machine_id: 'm2', hour_slot: 15, taken_by: 'luis', taken_at: '2026-09-28T15:20:00', condition: 'warning', photo_path: 'b.jpg', notes: 'Humedad baja' },
    { ...base, id: 3, machine_id: 'm3', hour_slot: 15, taken_by: 'ana', taken_at: '2026-09-28T15:40:00', condition: 'off', photo_path: null, notes: 'Apagada — no reportada al terminar la ronda' },
    { ...base, id: 4, machine_id: 'm1', hour_slot: 16, taken_by: 'ana', taken_at: '2026-09-28T16:05:00', condition: 'normal', photo_path: 'c.jpg' },
  ]

  it('junta todas las fotos de la hora (de varias personas) en una sola ronda', () => {
    const rounds = groupChecksIntoRounds(checks, {
      machinesById,
      nameOf: (id) => ({ ana: 'Ana López', luis: 'Luis Salazar' })[id],
      urlOf: (p) => `https://firmada/${p}`,
      expectedByPlant: { p1: ['m1', 'm2', 'm3', 'm4'] },
    })
    expect(rounds).toHaveLength(2)
    const r15 = rounds.find((r) => r.hour === 15)
    expect(r15.items.map((i) => i.machine.code)).toEqual(['INC-01', 'INC-02', 'NAC-01', 'NAC-02'])
    expect(r15.photos).toBe(2)
    expect(r15.off).toBe(1)
    expect(r15.unreported).toBe(1)
    expect(r15.takenBy.sort()).toEqual(['ana', 'luis'])
    expect(r15.hourSlot).toBe('15:00 – 15:59')
    expect(r15.formatCode).toBe('FOMAT04')
  })

  it('el FOMAT04 de la ronda trae fotos, lecturas, apagadas sin foto y las que no se reportaron', () => {
    const [r15] = groupChecksIntoRounds(checks.filter((c) => c.hour_slot === 15), {
      machinesById,
      nameOf: (id) => ({ ana: 'Ana López', luis: 'Luis Salazar' })[id],
      urlOf: (p) => `https://firmada/${p}`,
      expectedByPlant: { p1: ['m1', 'm2', 'm3', 'm4'] },
    })
    const html = roundRecordHtml(r15)
    expect(html).toContain('FOMAT04')
    expect(html).toContain('https://firmada/a.jpg')
    expect(html).toContain('https://firmada/b.jpg')
    expect(html).toContain('Temp. aire 99.5 °F')
    expect(html).toContain('No aplica (apagada)')
    expect(html).toContain('Sin reportar')
    expect(html).toContain('Ana López, Luis Salazar')
  })

  it('si una máquina se reportó dos veces en la hora vale el último registro', () => {
    const [r] = groupChecksIntoRounds([
      { ...base, machine_id: 'm1', hour_slot: 9, taken_at: '2026-09-28T09:10:00', condition: 'fault', photo_path: 'x.jpg' },
      { ...base, machine_id: 'm1', hour_slot: 9, taken_at: '2026-09-28T09:30:00', condition: 'normal', photo_path: 'y.jpg' },
    ], { machinesById })
    expect(r.items).toHaveLength(1)
    expect(r.items[0].condition).toBe('normal')
  })

  it('rotula la franja horaria', () => {
    expect(hourSlotLabel(7)).toBe('07:00 – 07:59')
    expect(hourSlotLabel(null)).toBeNull()
  })
})

describe('las fotos cuentan como ronda en el cumplimiento', () => {
  const checks = [
    { ...base, machine_id: 'm1', hour_slot: 15, taken_by: 'ana', taken_at: '2026-09-28T15:05:00', condition: 'normal', photo_path: 'a.jpg' },
    { ...base, machine_id: 'm2', hour_slot: 15, taken_by: 'ana', taken_at: '2026-09-28T15:10:00', condition: 'normal', photo_path: 'b.jpg' },
    { ...base, machine_id: 'm3', hour_slot: 15, taken_by: 'luis', taken_at: '2026-09-28T15:12:00', condition: 'normal', photo_path: 'c.jpg' },
    { ...base, machine_id: 'm1', hour_slot: 16, taken_by: 'ana', taken_at: '2026-09-28T16:05:00', condition: 'normal', photo_path: 'd.jpg' },
    // Cerrar la ronda marcando apagadas sin recorrerla no cuenta.
    { ...base, machine_id: 'm4', hour_slot: 17, taken_by: 'pedro', taken_at: '2026-09-28T17:50:00', condition: 'off', photo_path: null },
  ]

  it('cada persona suma una ronda por cada hora en que tomó fotos', () => {
    const rounds = photoRoundsByUser(checks)
    const count = (u) => rounds.filter((r) => r.user_id === u).length
    expect(count('ana')).toBe(2)
    expect(count('luis')).toBe(1)
    expect(count('pedro')).toBe(0)
    expect(rounds.find((r) => r.user_id === 'ana' && r.hour_slot === 15).photos).toBe(2)
  })

  it('un reporte escrito de la misma hora no cuenta doble; uno de otra hora sí suma', () => {
    const photo = photoRoundsByUser(checks)
    const reports = [
      { id: 'r1', user_id: 'ana', shift_date: '2026-09-28', created_at: '2026-09-28T15:30:00' },
      { id: 'r2', user_id: 'ana', shift_date: '2026-09-28', created_at: '2026-09-28T19:30:00' },
    ]
    const all = roundsForCompliance(reports, photo)
    expect(all.filter((r) => r.user_id === 'ana')).toHaveLength(3)
  })
})

describe('máquinas que cubre la ronda', () => {
  it('solo salas de ronda con equipos activos; el chiller cuenta en la sala de su tablero', () => {
    const { machines, rooms } = roundMachines({
      plantId: 'p1',
      rooms: [
        { id: 'sala-inc', plant_id: 'p1', type: 'incubation' },
        { id: 'tecnica', plant_id: 'p1', type: 'technical' },
        { id: 'bodega', plant_id: 'p1', type: 'storage' },
        { id: 'exterior', plant_id: 'p1', type: 'outdoor' },
      ],
      machines: [
        { id: 'm1', plant_id: 'p1', room_id: 'sala-inc' },
        { id: 'chiller', plant_id: 'p1', room_id: 'exterior', panel_room_id: 'tecnica' },
        { id: 'viejo', plant_id: 'p1', room_id: 'sala-inc', status: 'decommissioned' },
        { id: 'estante', plant_id: 'p1', room_id: 'bodega' },
        { id: 'otra', plant_id: 'p2', room_id: 'sala-inc' },
      ],
    })
    expect(machines.map((m) => m.id).sort()).toEqual(['chiller', 'm1'])
    expect(rooms.map((r) => r.id).sort()).toEqual(['sala-inc', 'tecnica'])
  })
})
