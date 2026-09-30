import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })) } } }))

const { detectIntent, localAnswer, askAssistant, compactContext } = await import('../voiceAssistant')
const { setAssistantContext } = await import('../assistantContext')

const ctx = {
  rol: 'Operario de turno',
  nombre: 'Ana',
  turno: 'turno 2, de 14:00 a 22:00; quedan 3 h 5 min',
  proximoTurno: 'mañana, turno 2 a las 14:00',
  asistencia: 'ingreso a las 14:05, a tiempo',
  rondas: 'Llevas 3 de 6 rondas del turno. En la ronda de las 18:00 van 1 de 6 máquinas',
  siguiente: 'terminar la ronda de las 18:00 (faltan 5 máquinas)',
  pendientes: ['terminar la ronda de las 18:00 (faltan 5 máquinas)', 'la actividad «Lavar bandejas»'],
  maquinasNovedad: ['INC-1: falla de volteo'],
}

describe('asistente de voz: lo que responde sin internet', () => {
  it('entiende las preguntas de todos los días', () => {
    expect(detectIntent('¿Qué me toca ahora?')).toBe('pendientes')
    expect(detectIntent('cuántas rondas llevo')).toBe('rondas')
    expect(detectIntent('¿A qué hora salgo?')).toBe('turno')
    expect(detectIntent('¿Cómo reporto una falla?')).toBe('como_falla')
    expect(detectIntent('la incubadora no voltea')).toBe('como_falla')
    expect(detectIntent('¿cómo marco la salida?')).toBe('como_asistencia')
    expect(detectIntent('¿Qué máquinas tienen alertas?')).toBe('maquinas')
    expect(detectIntent('¿Cuál es la temperatura ideal de incubación?')).toBeNull()
  })

  it('responde con los datos del turno', () => {
    expect(localAnswer('¿qué me toca?', ctx).text).toBe('Ana, lo primero: terminar la ronda de las 18:00 (faltan 5 máquinas). Después: la actividad «Lavar bandejas».')
    expect(localAnswer('cuántas rondas llevo', ctx).text).toContain('3 de 6')
    expect(localAnswer('¿a qué hora termino?', ctx).text).toContain('de 14:00 a 22:00')
    expect(localAnswer('¿hay máquinas con novedad?', ctx).text).toBe('Con novedad en el turno: INC-1: falla de volteo.')
    expect(localAnswer('¿cómo marco ingreso?', ctx).text).toContain('Ahora: ingreso a las 14:05, a tiempo.')
  })

  it('sin datos del turno no inventa: lo manda a la IA', () => {
    expect(localAnswer('¿qué me toca?', {})).toMatchObject({ sure: false })
  })

  it('el contexto que sale del teléfono va recortado', () => {
    const c = compactContext({ a: 'x'.repeat(900), b: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], c: null, actualizado: 'hoy' })
    expect(c.a).toHaveLength(600)
    expect(c.b).toHaveLength(8)
    expect(c).not.toHaveProperty('c')
    expect(c).not.toHaveProperty('actualizado')
  })
})

describe('asistente de voz: preguntas abiertas', () => {
  beforeEach(() => setAssistantContext(ctx))

  it('lo del turno no sale del teléfono', async () => {
    const fetchImpl = vi.fn()
    expect(await askAssistant({ question: '¿Qué me toca?', fetchImpl })).toMatchObject({ source: 'local' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('lo demás va a la IA con la sesión y el contexto', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ texto: 'Entre 99,5 y 100 °F.' }) }))
    const r = await askAssistant({ question: '¿Temperatura de aire recomendada?', fetchImpl })
    expect(r).toEqual({ text: 'Entre 99,5 y 100 °F.', source: 'ia' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/asistente')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toMatchObject({ pregunta: '¿Temperatura de aire recomendada?', contexto: { rol: 'Operario de turno' } })
  })

  it('si la IA no responde, contesta con el manual local', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    const r = await askAssistant({ question: 'petersime biostreamer temperatura', fetchImpl })
    expect(r.source).toBe('manual')
    expect(r.text.length).toBeGreaterThan(10)
  })
})
