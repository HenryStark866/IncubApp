/**
 * =============================================================================
 * ARCHIVO: src/components/MgmtExpertChat.jsx
 * PROPÓSITO: Asesor IA funcional — incubación, Petersime, levantes + Google Workspace.
 * CÓMO FUNCIONA: RAG local + LLM opcional (xAI/OpenAI/Groq) + OAuth Gmail/Calendar/Drive.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useRef, useState } from 'react'
import {
  askAdvisor,
  advisorStatus,
  ADVISOR_SUGGESTIONS,
} from '../lib/advisorEngine'
import {
  connectGoogle,
  clearGoogleToken,
  googleConfigured,
  loadStoredToken,
} from '../lib/googleWorkspace'

/**
 * Asesor conversacional completo para gerencia / dirección.
 */
export default function MgmtExpertChat({ userName = '' }) {
  const first = (userName || '').trim().split(/\s+/)[0]
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(() => advisorStatus())
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [messages, setMessages] = useState(() => [
    {
      role: 'bot',
      text:
        `Hola${first ? `, ${first}` : ''}. Soy tu Asesor de IncubApp: hablo de incubación (setters/nacedoras), buenas prácticas tipo Petersime, levantes y grading, bioseguridad, mantenimiento y gerencia. ` +
        `Si conectas Google puedo leer/redactar correos, agendar en Calendar y crear archivos en Drive (siempre te pido confirmación antes de enviar). ¿En qué te ayudo?`,
    },
  ])
  const endRef = useRef(null)
  const listRef = useRef(null)

  const refreshStatus = () => setStatus(advisorStatus())

  useEffect(() => {
    refreshStatus()
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, pendingConfirm])

  const push = (msg) => setMessages((m) => [...m, msg])

  const onConnectGoogle = async () => {
    setBusy(true)
    try {
      await connectGoogle()
      refreshStatus()
      push({
        role: 'bot',
        text: 'Google conectado. Ya puedes pedir: «revisa mis correos», «agenda reunión mañana 10am», «lista archivos en Drive», «crea una hoja de seguimiento».',
      })
    } catch (e) {
      push({ role: 'bot', text: `No pude conectar Google: ${e.message}`, error: true })
    }
    setBusy(false)
  }

  const onDisconnectGoogle = () => {
    clearGoogleToken()
    refreshStatus()
    push({ role: 'bot', text: 'Google desconectado en este navegador.' })
  }

  const send = async (q) => {
    const question = (q ?? input).trim()
    if (!question || busy) return
    setInput('')
    push({ role: 'user', text: question })
    setBusy(true)
    setPendingConfirm(null)
    try {
      const history = messages.filter((m) => m.role === 'user' || m.role === 'bot')
      const result = await askAdvisor({ userText: question, history })

      if (result.action === 'connect_google') {
        await onConnectGoogle()
        setBusy(false)
        return
      }
      if (result.action === 'disconnect_google') {
        onDisconnectGoogle()
        setBusy(false)
        return
      }
      if (result.type === 'confirm') {
        setPendingConfirm({
          tool: result.tool,
          payload: result.payload,
          title: result.title,
        })
        push({ role: 'bot', text: result.text, confirm: true })
        setBusy(false)
        return
      }
      push({
        role: 'bot',
        text: result.text || 'Listo.',
        mode: result.mode,
        error: result.error,
      })
    } catch (e) {
      push({ role: 'bot', text: `Algo falló: ${e.message}`, error: true })
    }
    setBusy(false)
  }

  const confirmAction = async (ok) => {
    if (!pendingConfirm) return
    if (!ok) {
      push({ role: 'bot', text: 'Cancelado. No envié ni creé nada.' })
      setPendingConfirm(null)
      return
    }
    // Editar payload desde inputs si el usuario cambió campos
    const payload = { ...pendingConfirm.payload }
    if (pendingConfirm.tool === 'gmail_send') {
      const to = document.getElementById('adv-mail-to')?.value?.trim()
      const subject = document.getElementById('adv-mail-subject')?.value?.trim()
      const body = document.getElementById('adv-mail-body')?.value
      if (to) payload.to = to
      if (subject) payload.subject = subject
      if (body != null) payload.body = body
    }
    setBusy(true)
    try {
      const result = await askAdvisor({
        userText: '',
        history: messages,
        executeConfirm: { tool: pendingConfirm.tool, payload },
      })
      push({ role: 'bot', text: result.text || 'Hecho.' })
    } catch (e) {
      push({ role: 'bot', text: e.message, error: true })
    }
    setPendingConfirm(null)
    setBusy(false)
  }

  const googleOn = status.google || Boolean(loadStoredToken()?.access_token)

  return (
    <div className="tool-card full mgmt-chat advisor-full">
      <div className="advisor-head">
        <div>
          <h4 style={{ margin: 0 }}>Asesor IA · IncubApp</h4>
          <p className="tool-desc" style={{ margin: '4px 0 0' }}>
            Incubación · Petersime / buenas prácticas · levantes · gerencia
            {status.llm
              ? ` · Modelo: ${status.llmProvider}`
              : ' · Modo conocimiento local (añade API key para LLM)'}
            {googleOn ? ' · Google conectado' : ''}
          </p>
        </div>
        <div className="advisor-head-actions">
          {googleConfigured() ? (
            googleOn ? (
              <button type="button" className="ghost small" disabled={busy} onClick={onDisconnectGoogle}>
                Desconectar Google
              </button>
            ) : (
              <button type="button" className="primary small" disabled={busy} onClick={onConnectGoogle}>
                Conectar Google
              </button>
            )
          ) : (
            <span className="hint" style={{ margin: 0, fontSize: 11 }}>
              Opcional: VITE_GOOGLE_CLIENT_ID para Gmail/Calendar/Drive
            </span>
          )}
        </div>
      </div>

      <div className="mgmt-chat-suggestions">
        {ADVISOR_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="chip ghost"
            disabled={busy}
            onClick={() => send(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mgmt-chat-log advisor-log" ref={listRef}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mgmt-chat-bubble ${m.role}${m.error ? ' error' : ''}`}
          >
            {formatMsg(m.text)}
          </div>
        ))}
        {busy && (
          <div className="mgmt-chat-bubble bot advisor-typing">Pensando…</div>
        )}
        <div ref={endRef} />
      </div>

      {pendingConfirm && (
        <div className="advisor-confirm">
          <strong>{pendingConfirm.title || 'Confirmar acción'}</strong>
          {pendingConfirm.tool === 'gmail_send' && (
            <div className="advisor-confirm-fields">
              <label>
                Para
                <input
                  id="adv-mail-to"
                  type="email"
                  defaultValue={pendingConfirm.payload?.to || ''}
                  placeholder="correo@empresa.com"
                />
              </label>
              <label>
                Asunto
                <input
                  id="adv-mail-subject"
                  type="text"
                  defaultValue={pendingConfirm.payload?.subject || ''}
                />
              </label>
              <label>
                Cuerpo
                <textarea
                  id="adv-mail-body"
                  rows={5}
                  defaultValue={pendingConfirm.payload?.body || ''}
                />
              </label>
            </div>
          )}
          <div className="actions row" style={{ marginTop: 8, gap: 8 }}>
            <button type="button" className="primary small" disabled={busy} onClick={() => confirmAction(true)}>
              Confirmar
            </button>
            <button type="button" className="ghost small" disabled={busy} onClick={() => confirmAction(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="tool-inline-form advisor-input" style={{ marginBottom: 0 }}>
        <input
          type="text"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta sobre incubación, Petersime, levantes… o pide un correo/agenda"
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
        />
        <button type="button" className="primary small" disabled={busy || !input.trim()} onClick={() => send()}>
          Enviar
        </button>
      </div>
    </div>
  )
}

/** Formatea **negrita** y saltos de línea de forma simple */
function formatMsg(text) {
  if (!text) return null
  const lines = String(text).split('\n')
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>
      }
      return <span key={j}>{part}</span>
    })
    return (
      <span key={i}>
        {parts}
        {i < lines.length - 1 ? <br /> : null}
      </span>
    )
  })
}
