/**
 * =============================================================================
 * ARCHIVO: src/components/ChatWidget.jsx
 * PROPÓSITO: Componente UI «ChatWidget»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '../hooks/useChat'
import { ROLE_LABEL } from '../lib/roles'

const fmtTime = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
const fmtWhen = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}
// Etiqueta del separador de día en la conversación
const fmtDay = (iso) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
}
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()
const initials = (name) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

function ChatIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function Avatar({ member }) {
  if (member?.avatar) return <img className="chat-avatar" src={member.avatar} alt="" />
  return <div className="chat-avatar ph">{initials(member?.name)}</div>
}

function MessageList({ list, userId, metaOf, onDelete }) {
  const endRef = useRef(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [list])
  return (
    <div className="chat-messages">
      {list.length === 0 && <p className="hint chat-empty">No hay mensajes todavía. ¡Escribe el primero!</p>}
      {list.map((m, i) => {
        const mine = m.sender_id === userId
        const newDay = i === 0 || !sameDay(m.created_at, list[i - 1].created_at)
        return (
          <Fragment key={m.id}>
            {newDay && (
              <div className="chat-day-sep">
                <span>{fmtDay(m.created_at)}</span>
              </div>
            )}
            <div className={`chat-msg${mine ? ' mine' : ''}`}>
              <div className="chat-bubble">
                <span className="chat-body">{m.body}</span>
                <span className="chat-time">{fmtTime(m.created_at)}</span>
              </div>
              <span className="chat-msg-foot">
                {metaOf(m.sender_id)}
                {mine && <button className="chat-del" title="Eliminar mensaje" onClick={() => onDelete(m.id)}>✕</button>}
              </span>
            </div>
          </Fragment>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

function Composer({ onSend, placeholder }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    const { error } = await onSend(text)
    setBusy(false)
    if (!error) setText('')
  }
  return (
    <div className="chat-composer">
      <textarea
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        placeholder={placeholder}
      />
      <button className="primary small" onClick={send} disabled={busy || !text.trim()}>Enviar</button>
    </div>
  )
}

export default function ChatWidget({ orgId, userId }) {
  const chat = useChat(orgId, userId)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('general')
  const [dmUser, setDmUser] = useState(null)
  // Marca de "visto" POR conversación: { general: iso, [contactId]: iso, default: iso }.
  // Así el punto de no leído queda en el contacto exacto que escribió, no en todo el chat.
  const seenKey = `chat_seen_v2_${orgId}`
  const [seenMap, setSeenMap] = useState(() => {
    try {
      const raw = localStorage.getItem(`chat_seen_v2_${orgId}`)
      if (raw) return JSON.parse(raw)
      // Migración desde la marca global anterior (una sola fecha para todo)
      const legacy = localStorage.getItem(`chat_seen_${orgId}`)
      return { default: legacy || '1970-01-01' }
    } catch { return { default: '1970-01-01' } }
  })
  const seenOf = (key) => seenMap[key] ?? seenMap.default ?? '1970-01-01'

  const nameOf = (id) => chat.members.find((m) => m.id === id)?.name ?? 'Usuario'
  const metaOf = (id) => {
    const m = chat.members.find((x) => x.id === id)
    const name = m?.name ?? 'Usuario'
    const role = m?.role ? ROLE_LABEL[m.role] ?? m.role : null
    return role ? `${name} · ${role}` : name
  }
  const others = chat.members.filter((m) => m.id !== userId)

  const generalMsgs = useMemo(() => chat.messages.filter((m) => m.channel === 'general'), [chat.messages])
  const dmThread = useMemo(() => {
    if (!dmUser) return []
    return chat.messages.filter(
      (m) => m.channel === 'direct' &&
        ((m.sender_id === userId && m.recipient_id === dmUser) || (m.sender_id === dmUser && m.recipient_id === userId))
    )
  }, [chat.messages, dmUser, userId])

  // Marca como vista SOLO la conversación que se está mirando:
  // General abierto → 'general'; un directo abierto → ese contacto.
  useEffect(() => {
    if (!open) return
    const key = view === 'general' ? 'general' : dmUser
    if (!key) return
    setSeenMap((prev) => {
      const next = { ...prev, [key]: new Date().toISOString() }
      try { localStorage.setItem(seenKey, JSON.stringify(next)) } catch { /* almacenamiento no disponible */ }
      return next
    })
  }, [open, view, dmUser, chat.messages, seenKey])

  const unreadGeneral = useMemo(
    () => chat.messages.filter((m) => m.channel === 'general' && m.sender_id !== userId && m.created_at > seenOf('general')).length,
    [chat.messages, userId, seenMap] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const unreadFrom = (uid) =>
    chat.messages.filter((m) => m.channel === 'direct' && m.sender_id === uid && m.recipient_id === userId && m.created_at > seenOf(uid)).length
  const unreadDirects = useMemo(
    () => others.reduce((acc, m) => acc + unreadFrom(m.id), 0),
    [chat.messages, userId, seenMap, others] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const unread = unreadGeneral + unreadDirects

  // Último mensaje directo con cada contacto (para vista previa y orden)
  const lastDm = (uid) => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i]
      if (m.channel === 'direct' &&
        ((m.sender_id === uid && m.recipient_id === userId) || (m.sender_id === userId && m.recipient_id === uid))) return m
    }
    return null
  }
  // Contactos: primero los que tienen mensajes sin leer, luego por conversación más reciente
  const people = useMemo(() => {
    return [...others].sort((a, b) => {
      const ua = unreadFrom(a.id) > 0 ? 1 : 0
      const ub = unreadFrom(b.id) > 0 ? 1 : 0
      if (ua !== ub) return ub - ua
      const ta = lastDm(a.id)?.created_at ?? ''
      const tb = lastDm(b.id)?.created_at ?? ''
      if (ta !== tb) return tb > ta ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  }, [others, chat.messages, seenMap, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!orgId) return null

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Abrir chat">
          <ChatIcon />
          {unread > 0 && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <div className="chat-tabs">
              <button className={view === 'general' ? 'active' : ''} onClick={() => { setView('general'); setDmUser(null) }}>
                General
                {unreadGeneral > 0 && <span className="chat-badge sm">{unreadGeneral > 9 ? '9+' : unreadGeneral}</span>}
              </button>
              <button className={view === 'directs' ? 'active' : ''} onClick={() => setView('directs')}>
                Directos
                {unreadDirects > 0 && <span className="chat-badge sm">{unreadDirects > 9 ? '9+' : unreadDirects}</span>}
              </button>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
          </div>

          {view === 'general' ? (
            <>
              <MessageList list={generalMsgs} userId={userId} metaOf={metaOf} onDelete={chat.deleteMessage} />
              <Composer onSend={(t) => chat.sendMessage({ body: t })} placeholder="Mensaje para todos…" />
            </>
          ) : dmUser ? (
            <>
              <div className="chat-subhead">
                <button className="chat-back" onClick={() => setDmUser(null)} aria-label="Volver">‹</button>
                <Avatar member={chat.members.find((m) => m.id === dmUser)} />
                <strong>{nameOf(dmUser)}</strong>
              </div>
              <MessageList list={dmThread} userId={userId} metaOf={metaOf} onDelete={chat.deleteMessage} />
              <Composer onSend={(t) => chat.sendMessage({ body: t, recipientId: dmUser })} placeholder={`Mensaje a ${nameOf(dmUser).split(' ')[0]}…`} />
            </>
          ) : (
            <div className="chat-people">
              {others.length === 0 ? (
                <p className="hint chat-empty">No hay otros usuarios en tu empresa.</p>
              ) : (
                people.map((m) => {
                  const n = unreadFrom(m.id)
                  const last = lastDm(m.id)
                  return (
                    <button key={m.id} className={`chat-person${n > 0 ? ' unread' : ''}`} onClick={() => setDmUser(m.id)}>
                      <Avatar member={m} />
                      <span className="chat-person-main">
                        <span className="chat-person-name">{m.name}</span>
                        {last && (
                          <span className="chat-person-preview">
                            {last.sender_id === userId ? 'Tú: ' : ''}{last.body}
                          </span>
                        )}
                      </span>
                      <span className="chat-person-side">
                        {last && <span className="chat-person-time">{fmtWhen(last.created_at)}</span>}
                        {n > 0 && <span className="chat-badge sm">{n > 9 ? '9+' : n}</span>}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          )}
          {chat.error && <p className="msg error" style={{ margin: '0 10px 8px' }}>{chat.error}</p>}
        </div>
      )}
    </>
  )
}
