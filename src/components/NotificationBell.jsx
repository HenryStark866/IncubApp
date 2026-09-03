/**
 * =============================================================================
 * ARCHIVO: src/components/NotificationBell.jsx
 * PROPÓSITO: Componente UI «NotificationBell»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { useNotifications } from '../hooks/useNotifications'
import { notifIcon } from '../lib/notificationPolicy'

const fmt = (iso) =>
  new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

function BellIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

/**
 * Campana + notificaciones del navegador.
 * Filtra por rol (gerencia no ve OT).
 */
export default function NotificationBell({
  orgId,
  userId,
  role,
  area,
  isOmniscient = false,
  canNotify = false,
}) {
  const nt = useNotifications(orgId, userId, { role, area, isOmniscient })
  const [open, setOpen] = useState(false)
  const seenKey = `notif_seen_${orgId}`
  const [lastSeen, setLastSeen] = useState(() => {
    try {
      return localStorage.getItem(`notif_seen_${orgId}`) || '1970-01-01'
    } catch {
      return '1970-01-01'
    }
  })
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState('general')

  useEffect(() => {
    if (!open) return
    const now = new Date().toISOString()
    setLastSeen(now)
    try {
      localStorage.setItem(seenKey, now)
    } catch {
      /* */
    }
  }, [open, nt.notifications, seenKey])

  const unread = useMemo(
    () =>
      nt.notifications.filter((n) => n.created_at > lastSeen && n.created_by !== userId).length,
    [nt.notifications, lastSeen, userId]
  )

  const send = async () => {
    const { error } = await nt.notify({ title, body, kind })
    if (!error) {
      setTitle('')
      setBody('')
      setComposing(false)
    }
  }

  if (!orgId) return null

  return (
    <>
      {!open && (
        <button className="notif-fab" onClick={() => setOpen(true)} aria-label="Notificaciones">
          <BellIcon />
          {unread > 0 && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <strong style={{ fontSize: 14 }}>Notificaciones</strong>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Cerrar">
              ✕
            </button>
          </div>

          {nt.browserPermission !== 'granted' && nt.browserPermission !== 'unsupported' && (
            <div style={{ padding: '8px 10px 0' }}>
              <button type="button" className="chip ghost" onClick={() => nt.enableBrowserPush()}>
                Activar alertas en este dispositivo
              </button>
            </div>
          )}
          {nt.browserPermission === 'granted' && (
            <p className="hint" style={{ margin: '8px 10px 0', fontSize: 11 }}>
              Alertas del sistema activas
            </p>
          )}

          {canNotify &&
            (composing ? (
              <div className="notif-composer">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="general">General (equipo)</option>
                  <option value="ot">OT / planta (coord. planta)</option>
                  <option value="purchase_order">Orden de compra → gerencia</option>
                  <option value="invoice">Factura → gerencia</option>
                  <option value="quotation">Cotización → gerencia</option>
                  <option value="area_report">Reporte de área → gerencia</option>
                  <option value="leader_request">Solicitud de líder → gerencia</option>
                  <option value="management">Aviso gerencial</option>
                </select>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título"
                  autoFocus
                />
                <input
                  type="text"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Detalle (opcional)"
                />
                <div className="actions row">
                  <button
                    className="primary small"
                    onClick={send}
                    disabled={title.trim().length < 2}
                  >
                    Publicar
                  </button>
                  <button className="ghost small" onClick={() => setComposing(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="chip ghost"
                style={{ margin: '8px 10px 0' }}
                onClick={() => setComposing(true)}
              >
                + Nueva notificación
              </button>
            ))}

          <div className="notif-list">
            {nt.notifications.length === 0 && (
              <p className="hint chat-empty">Sin notificaciones para tu perfil.</p>
            )}
            {nt.notifications.map((n) => (
              <div
                key={n.id}
                className={`notif-item${
                  n.created_at > lastSeen && n.created_by !== userId ? ' unseen' : ''
                }`}
              >
                <span className="notif-ic" aria-hidden="true">
                  {notifIcon(n.kind)}
                </span>
                <div className="notif-main">
                  <strong>{n.title}</strong>
                  {n.body && <span className="notif-body">{n.body}</span>}
                  <span className="notif-time">{fmt(n.created_at)}</span>
                </div>
                {n.created_by === userId && (
                  <button className="chat-del" title="Eliminar" onClick={() => nt.remove(n.id)}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {nt.error && (
            <p className="msg error" style={{ margin: '0 10px 8px' }}>
              {nt.error}
            </p>
          )}
        </div>
      )}
    </>
  )
}
