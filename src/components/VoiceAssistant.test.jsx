// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } } }))
const { default: VoiceAssistant } = await import('./VoiceAssistant')
const { setAssistantContext } = await import('../lib/assistantContext')

// Dictado del navegador simulado: al empezar, «escucha» la frase y termina.
let frase = ''
class FakeRecognition {
  start() {
    setTimeout(() => {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: frase }], { isFinal: true })] })
      this.onend?.()
    }, 0)
  }
  stop() {
    this.onend?.()
  }
  abort() {}
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host
let root
beforeEach(() => {
  window.webkitSpeechRecognition = FakeRecognition
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  setAssistantContext({
    nombre: 'Ana',
    siguiente: 'terminar la ronda de las 10:00 (faltan 2 máquinas)',
    pendientes: ['terminar la ronda de las 10:00 (faltan 2 máquinas)'],
  })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.webkitSpeechRecognition
})

const click = (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('asistente de voz en la app', () => {
  it('se abre, escucha la pregunta y responde con los datos del turno', async () => {
    await act(async () => root.render(<VoiceAssistant role="operator" userName="Ana Ruiz" />))
    await click(host.querySelector('.va-fab'))
    expect(host.textContent).toContain('Hola, Ana')
    frase = '¿Qué me toca ahora?'
    await click(host.querySelector('.va-mic'))
    await act(async () => new Promise((r) => setTimeout(r, 10)))
    const burbujas = [...host.querySelectorAll('.va-msg')].map((b) => b.textContent)
    expect(burbujas[0]).toContain('¿Qué me toca ahora?')
    expect(burbujas[1]).toContain('Ana, lo primero: terminar la ronda de las 10:00')
    expect(burbujas[1]).toContain('Datos de tu turno')
  })

  it('sin dictado en el navegador avisa y deja escribir', async () => {
    delete window.webkitSpeechRecognition
    await act(async () => root.render(<VoiceAssistant role="operator" userName="Ana" />))
    await click(host.querySelector('.va-fab'))
    await click(host.querySelector('.va-mic'))
    expect(host.textContent).toContain('Escribe tu pregunta abajo')
    expect(host.querySelector('.va-form input')).toBeTruthy()
  })
})
