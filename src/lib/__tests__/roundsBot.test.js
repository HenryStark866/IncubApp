import { describe, expect, it } from 'vitest'
import { BOT_TAG, botStatus, isBotActive, roundsRequired } from '../roundsBot'

const now = Date.parse('2026-10-12T15:00:00Z')
const c = (h, m, notes = `${BOT_TAG} INC-01`) => ({ machine_id: m, notes, taken_at: new Date(now - h * 3_600_000).toISOString() })

describe('bot de rondas EagleTrax', () => {
  it('con el bot reportando el operario solo debe la ronda de recibir turno; si se cae, vuelven las 6', () => {
    expect(isBotActive([c(0.5, 'a')], now)).toBe(true)
    expect(isBotActive([c(3, 'a')], now)).toBe(false)
    expect(isBotActive([c(0.5, 'a', 'foto del turnero')], now)).toBe(false)
    expect(roundsRequired(6, true)).toBe(1)
    expect(roundsRequired(6, false)).toBe(6)
  })
  it('cuenta las máquinas de la última hora del bot', () => {
    expect(botStatus([c(0.2, 'a'), c(0.3, 'b'), c(2.5, 'c')], now)).toMatchObject({ active: true, machines: 2 })
  })
})
