import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { MODELO, validarEntrada, validarSesion, construirPedido, leerRespuesta, textoHablado } = require('./asistente.cjs')

describe('asistente de voz (n8n)', () => {
  it('valida la pregunta y recorta el contexto sin rechazar', () => {
    expect(validarEntrada({})).toMatchObject({ ok: false, codigo: 400 })
    expect(validarEntrada({ pregunta: 'x'.repeat(700) })).toMatchObject({ ok: false, codigo: 400 })
    const grande = validarEntrada({ pregunta: '  ¿qué me   toca? ', contexto: { rol: 'Operario', resumen: 'r'.repeat(9000), extra: 'e'.repeat(9000) } })
    expect(grande).toMatchObject({ ok: true, pregunta: '¿qué me toca?' })
    expect(grande.contexto.extra).toBeUndefined()
    expect(grande.contextoTexto.length).toBeLessThan(2000)
  })

  it('solo acepta una sesión confirmada por el servidor de cuentas', () => {
    expect(validarSesion({ statusCode: 200, body: { id: 'u1' } })).toEqual({ ok: true, userId: 'u1' })
    expect(validarSesion({ statusCode: 401, body: { msg: 'invalid JWT' } })).toMatchObject({ ok: false, codigo: 401 })
    expect(validarSesion(null)).toMatchObject({ ok: false })
  })

  it('arma el pedido con el contexto al final y el historial alternado', () => {
    const e = validarEntrada({
      pregunta: '¿Cuántas rondas llevo?',
      contexto: { rol: 'Operario de turno', rondas: '3 de 6' },
      historial: [
        { rol: 'asistente', texto: 'Hola' },
        { rol: 'usuario', texto: '¿Qué me toca?' },
        { rol: 'asistente', texto: 'Tu ronda de las 10.' },
        { rol: 'usuario', texto: 'pregunta repetida sin respuesta' },
      ],
    })
    const p = construirPedido(e)
    expect(p).toMatchObject({ model: MODELO, fallbacks: 'default', output_config: { effort: 'low' } })
    expect(p.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(p.messages.at(-1).content).toContain('"rondas":"3 de 6"')
    expect(p.messages.at(-1).content).toContain('¿Cuántas rondas llevo?')
    expect(p.thinking).toBeUndefined()
  })

  it('devuelve texto para leer en voz alta y maneja errores', () => {
    expect(leerRespuesta({ content: [{ type: 'text', text: '**Primero** marca ingreso.\n- Luego la ronda.' }], stop_reason: 'end_turn' })).toMatchObject({
      ok: true,
      texto: 'Primero marca ingreso.\nLuego la ronda.',
    })
    expect(leerRespuesta({ error: { message: 'invalid x-api-key' } })).toMatchObject({ ok: false, codigo: 503 })
    expect(leerRespuesta({ stop_reason: 'refusal', content: [] })).toMatchObject({ ok: true })
    expect(textoHablado('# Título\n\n\n* uno')).toBe('Título\nuno')
  })
})
