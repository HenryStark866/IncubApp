/**
 * Asistente de voz: botón de micrófono flotante (abajo a la izquierda) y panel de
 * conversación. Se toca el micrófono, se habla, y la respuesta se muestra y se lee
 * en voz alta. También se puede escribir. Lógica en lib/voiceAssistant.js.
 * Henry Stark Desarrollador · CDH Maker
 */
import { useEffect, useRef, useState } from 'react'
import { askAssistant, canSpeak, speak, speechRecognitionCtor, stopSpeaking } from '../lib/voiceAssistant'
import './VoiceAssistant.css'

const SUGERENCIAS = {
  operator: ['¿Qué me toca ahora?', '¿Cuántas rondas llevo?', '¿Cómo reporto una falla?', '¿A qué hora termina mi turno?'],
  auxiliary: ['¿Qué me toca ahora?', '¿Cómo termino una actividad?', '¿A qué hora termina mi turno?'],
  supervisor: ['¿Qué pide atención?', '¿Cómo va la ronda?', '¿Qué me toca ahora?'],
  maintenance_auxiliary: ['¿Qué me toca del plan esta semana?', '¿Cómo reporto una falla?', '¿Qué formato llena cada trabajo?'],
}
const DEFAULT_SUGERENCIAS = ['¿Qué me toca ahora?', '¿Cómo reporto una falla?', '¿Qué formato llena cada registro?']

const LEER_KEY = 'incubapp:asistente-voz-leer'
const readLeer = () => {
  try {
    return localStorage.getItem(LEER_KEY) !== 'no'
  } catch {
    return true
  }
}

const Mic = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
  </svg>
)

export default function VoiceAssistant({ role, userName }) {
  const [open, setOpen] = useState(false)
  const [estado, setEstado] = useState('listo') // listo | escuchando | pensando | hablando
  const [parcial, setParcial] = useState('')
  const [texto, setTexto] = useState('')
  const [mensajes, setMensajes] = useState([])
  const [leer, setLeer] = useState(readLeer)
  const [aviso, setAviso] = useState(null)
  const recRef = useRef(null)
  const listRef = useRef(null)
  const Ctor = speechRecognitionCtor()
  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const sugerencias = SUGERENCIAS[role] || DEFAULT_SUGERENCIAS

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes, estado])

  useEffect(() => {
    if (!open) {
      recRef.current?.abort?.()
      stopSpeaking()
      setEstado('listo')
    }
  }, [open])

  useEffect(() => () => {
    recRef.current?.abort?.()
    stopSpeaking()
  }, [])

  const preguntar = async (pregunta) => {
    const q = String(pregunta || '').trim()
    if (!q) return
    setAviso(null)
    setTexto('')
    setParcial('')
    const historial = mensajes.map((m) => ({ rol: m.de === 'yo' ? 'usuario' : 'asistente', texto: m.texto }))
    setMensajes((m) => [...m, { de: 'yo', texto: q }])
    setEstado('pensando')
    const r = await askAssistant({ question: q, history: historial })
    setMensajes((m) => [...m, { de: 'bot', texto: r.text, source: r.source }])
    if (leer && canSpeak()) {
      await speak(r.text, { onStart: () => setEstado('hablando') })
    }
    setEstado('listo')
  }

  const escuchar = () => {
    if (estado === 'escuchando') {
      recRef.current?.stop?.()
      return
    }
    if (!Ctor) {
      setAviso('Este navegador no permite dictar. Escribe tu pregunta abajo.')
      return
    }
    stopSpeaking()
    const rec = new Ctor()
    rec.lang = 'es-CO'
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    let final = ''
    rec.onresult = (e) => {
      let interino = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interino += t
      }
      setParcial(final || interino)
    }
    rec.onerror = (e) => {
      setEstado('listo')
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setAviso('Da permiso al micrófono para hablarle al asistente.')
      else if (e.error === 'no-speech') setAviso('No te escuché. Toca el micrófono y habla cerca del teléfono.')
      else if (e.error === 'network') setAviso('El dictado necesita internet. Escribe tu pregunta abajo.')
    }
    rec.onend = () => {
      recRef.current = null
      const dicho = final.trim()
      if (dicho) preguntar(dicho)
      else setEstado((s) => (s === 'escuchando' ? 'listo' : s))
    }
    recRef.current = rec
    setAviso(null)
    setParcial('')
    setEstado('escuchando')
    try {
      rec.start()
    } catch {
      setEstado('listo')
    }
  }

  const cambiarLeer = () => {
    const v = !leer
    setLeer(v)
    if (!v) stopSpeaking()
    try {
      localStorage.setItem(LEER_KEY, v ? 'si' : 'no')
    } catch {
      /* preferencia solo en esta sesión */
    }
  }

  const ESTADO_TXT = {
    listo: Ctor ? 'Toca el micrófono y pregunta' : 'Escribe tu pregunta',
    escuchando: 'Te escucho…',
    pensando: 'Pensando…',
    hablando: 'Respondiendo…',
  }

  return (
    <>
      <button
        type="button"
        className={`va-fab${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar asistente de voz' : 'Abrir asistente de voz'}
        aria-expanded={open}
      >
        <Mic size={24} />
      </button>

      {open && (
        <section className="va-panel" role="dialog" aria-label="Asistente de voz">
          <header className="va-head">
            <div>
              <strong>Asistente</strong>
              <span>{first ? `Hola, ${first}` : 'Pregúntame por tu turno'}</span>
            </div>
            <button type="button" className="va-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
          </header>

          <div className="va-list" ref={listRef} aria-live="polite">
            {mensajes.length === 0 && (
              <div className="va-empty">
                <p>Pregúntame qué te toca, cómo va tu turno o cómo hacer algo en la app.</p>
                <div className="va-chips">
                  {sugerencias.map((s) => (
                    <button key={s} type="button" onClick={() => preguntar(s)} disabled={estado === 'pensando'}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`va-msg va-msg-${m.de}`}>
                <p>{m.texto}</p>
                {m.de === 'bot' && (
                  <div className="va-msg-foot">
                    <span>{m.source === 'ia' ? 'IA' : m.source === 'manual' ? 'Manual sin conexión' : 'Datos de tu turno'}</span>
                    {canSpeak() && <button type="button" onClick={() => speak(m.texto, { onStart: () => setEstado('hablando'), onEnd: () => setEstado('listo') })}>Repetir</button>}
                  </div>
                )}
              </div>
            ))}
            {(estado === 'escuchando' || estado === 'pensando') && (
              <div className="va-msg va-msg-yo va-msg-draft">
                <p>{estado === 'escuchando' ? parcial || '…' : '…'}</p>
              </div>
            )}
          </div>

          {aviso ? <p className="va-aviso" role="status">{aviso}</p> : null}

          <div className="va-controls">
            <button
              type="button"
              className={`va-mic va-mic-${estado}`}
              onClick={estado === 'hablando' ? () => { stopSpeaking(); setEstado('listo') } : escuchar}
              disabled={estado === 'pensando'}
              aria-label={estado === 'escuchando' ? 'Dejar de escuchar' : estado === 'hablando' ? 'Callar' : 'Hablar'}
            >
              {estado === 'hablando' ? <span className="va-stop" aria-hidden="true" /> : <Mic size={30} />}
            </button>
            <span className="va-estado">{ESTADO_TXT[estado]}</span>
            {canSpeak() && (
              <label className="va-leer">
                <input type="checkbox" checked={leer} onChange={cambiarLeer} /> Leer en voz alta
              </label>
            )}
          </div>

          <form
            className="va-form"
            onSubmit={(e) => {
              e.preventDefault()
              preguntar(texto)
            }}
          >
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="O escribe tu pregunta"
              aria-label="Escribe tu pregunta"
              maxLength={500}
            />
            <button type="submit" disabled={!texto.trim() || estado === 'pensando'}>Enviar</button>
          </form>
        </section>
      )}
    </>
  )
}
