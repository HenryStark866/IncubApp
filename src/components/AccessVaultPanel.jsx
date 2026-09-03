/**
 * Accesos herméticos — robusto ante tabla faltante, loading y roles vacíos.
 * Henry Stark Desarrollador
 */
import { useEffect, useState } from 'react'
import {
  GRANT_DURATIONS,
  domainById,
  domainsMemberOf,
  primarySiloLabel,
} from '../lib/privacyScopes'
import { ROLE_LABEL, areaLabel } from '../lib/roles'

const STATUS_LABEL = {
  pending: 'Pendiente',
  approved: 'Activo',
  denied: 'Denegado',
  revoked: 'Revocado',
  expired: 'Expirado',
}

const DURATIONS = GRANT_DURATIONS?.length
  ? GRANT_DURATIONS
  : [
      { hours: 2, label: '2 horas' },
      { hours: 8, label: '8 horas (turno)' },
      { hours: 24, label: '24 horas' },
      { hours: 72, label: '3 días' },
      { hours: 168, label: '7 días' },
    ]

/**
 * Panel de módulos herméticos: solicitar acceso temporal y aprobar/denegar.
 */
export default function AccessVaultPanel({
  access,
  role,
  area,
  isOmniscient,
  userName,
}) {
  const requestable = access?.requestable || []
  const myActiveGrants = access?.myActiveGrants || []
  const pendingForMe = access?.pendingForMe || []
  const myRequests = access?.myRequests || []
  const grantableDomains = access?.grantableDomains || []
  const nameOf = typeof access?.nameOf === 'function' ? access.nameOf : (id) => (id ? String(id).slice(0, 8) : '—')

  const [scope, setScope] = useState(() => requestable[0]?.id || '')
  const [reason, setReason] = useState('')
  const [hours, setHours] = useState(8)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [decideHours, setDecideHours] = useState({})

  // Sincronizar scope cuando cargan los dominios solicitables
  useEffect(() => {
    if (!scope && requestable[0]?.id) setScope(requestable[0].id)
    if (scope && requestable.length && !requestable.some((d) => d.id === scope)) {
      setScope(requestable[0]?.id || '')
    }
  }, [requestable, scope])

  const silo = primarySiloLabel(role, area)
  const mine = domainsMemberOf(role, area) || []

  if (!access) {
    return (
      <div className="card wide">
        <h2>Accesos herméticos</h2>
        <p className="hint">Cargando permisos…</p>
      </div>
    )
  }

  if (access.loading) {
    return (
      <div className="card wide">
        <div className="card-head">
          <h2 style={{ margin: 0 }}>Accesos herméticos</h2>
        </div>
        <p className="hint">Cargando solicitudes y grants…</p>
      </div>
    )
  }

  const submit = async () => {
    if (!scope) {
      setMsg({ kind: 'error', text: 'Elige un módulo.' })
      return
    }
    if (!reason.trim() || reason.trim().length < 5) {
      setMsg({ kind: 'error', text: 'Escribe un motivo (mín. 5 caracteres).' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await access.requestAccess({ scope, reason, hours })
      if (error) setMsg({ kind: 'error', text: error })
      else {
        setMsg({
          kind: 'ok',
          text: 'Solicitud enviada. El responsable del módulo debe aprobarla.',
        })
        setReason('')
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e?.message || 'No se pudo enviar' })
    }
    setBusy(false)
  }

  const onDecide = async (id, approve) => {
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await access.decide(id, {
        approve,
        hours: decideHours[id] || 8,
      })
      if (error) setMsg({ kind: 'error', text: error })
      else setMsg({ kind: 'ok', text: approve ? 'Acceso concedido.' : 'Solicitud denegada.' })
    } catch (e) {
      setMsg({ kind: 'error', text: e?.message || 'Error al decidir' })
    }
    setBusy(false)
  }

  const onRevoke = async (id) => {
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await access.revoke(id)
      if (error) setMsg({ kind: 'error', text: error })
      else setMsg({ kind: 'ok', text: 'Acceso revocado.' })
    } catch (e) {
      setMsg({ kind: 'error', text: e?.message || 'Error al revocar' })
    }
    setBusy(false)
  }

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>Accesos herméticos</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Cada perfil solo ve su módulo. El acceso a otro módulo requiere solicitud y aprobación
            temporal del responsable de ese módulo.
            {isOmniscient ? ' · Tú (plataforma) ves todo sin restricción.' : ''}
          </p>
        </div>
        <span className="pill role">{ROLE_LABEL[role] ?? role ?? '—'}</span>
      </div>

      {access.tableMissing && (
        <p className="msg warn" style={{ marginTop: 12 }}>
          La tabla <strong>access_grants</strong> no está en Supabase. Ejecuta{' '}
          <strong>supabase_migration_access_grants.sql</strong> para solicitudes en la nube. Mientras
          tanto solo ves tus módulos nativos.
        </p>
      )}

      {access.error && (
        <p className="msg error" style={{ marginTop: 10 }}>
          {access.error}
        </p>
      )}
      {msg && (
        <p className={`msg ${msg.kind}`} style={{ marginTop: 10 }}>
          {msg.text}
        </p>
      )}

      <div className="exec-split" style={{ marginTop: 14 }}>
        <section className="exec-panel">
          <div className="exec-panel-head">
            <h3 className="exec-group-title">Tu módulo nativo</h3>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>
            <strong>{userName || 'Usuario'}</strong>
            <span className="hint" style={{ display: 'block', margin: '4px 0 0' }}>
              {silo}
              {area ? ` · ${areaLabel(area)}` : ''}
            </span>
          </p>
          {isOmniscient ? (
            <p className="exec-empty ok">Vista omnisciente de plataforma: todos los módulos.</p>
          ) : mine.length === 0 ? (
            <p className="exec-empty">
              Solo Hoy, Accesos, Reportes, Asistencia, Cumplimiento y Perfil hasta que te asignen un
              rol de área.
            </p>
          ) : (
            <div className="exec-list">
              {mine.map((d) => (
                <div key={d.id} className="exec-list-item">
                  <div className="exec-list-main">
                    <strong>{d.label}</strong>
                    <span>{d.description}</span>
                  </div>
                  <span className="pill status ok">Tuyo</span>
                </div>
              ))}
            </div>
          )}
          {myActiveGrants.length > 0 && (
            <>
              <h3 className="exec-group-title" style={{ marginTop: 16 }}>
                Accesos temporales activos
              </h3>
              <div className="exec-list">
                {myActiveGrants.map((g) => {
                  const d = domainById(g.scope)
                  return (
                    <div key={g.id} className="exec-list-item">
                      <div className="exec-list-main">
                        <strong>{d?.label || g.scope}</strong>
                        <span>
                          Hasta{' '}
                          {g.expires_at
                            ? new Date(g.expires_at).toLocaleString('es-CO', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                          {g.grantor_id ? ` · por ${nameOf(g.grantor_id)}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ghost small"
                        disabled={busy}
                        onClick={() => onRevoke(g.id)}
                      >
                        Devolver
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <section className="exec-panel">
          <div className="exec-panel-head">
            <h3 className="exec-group-title">Solicitar acceso a otro módulo</h3>
          </div>
          {isOmniscient ? (
            <p className="exec-empty ok">No necesitas solicitar: ya ves todos los módulos.</p>
          ) : requestable.length === 0 ? (
            <p className="exec-empty">No hay más áreas solicitables para tu perfil.</p>
          ) : (
            <div
              className="inline-form"
              style={{ margin: 0, padding: 0, border: 'none', background: 'transparent' }}
            >
              <label>
                Área / módulo
                <select value={scope} onChange={(e) => setScope(e.target.value)}>
                  {!scope && <option value="">— Elegir —</option>}
                  {requestable.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Duración pedida
                <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                  {DURATIONS.map((d) => (
                    <option key={d.hours} value={d.hours}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Motivo (lo ve el responsable del módulo)
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej. Revisión de fallas de la semana para junta de gerencia"
                />
              </label>
              {scope && domainById(scope) && (
                <p className="hint" style={{ margin: '0 0 8px' }}>
                  {domainById(scope).description}
                </p>
              )}
              <button
                type="button"
                className="primary"
                disabled={busy || !scope || access.tableMissing}
                onClick={submit}
              >
                {busy ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          )}
        </section>
      </div>

      <h3 className="section-title" style={{ margin: '20px 0 8px' }}>
        Solicitudes hacia tu módulo
        {pendingForMe.length > 0 ? ` (${pendingForMe.length})` : ''}
      </h3>
      {pendingForMe.length === 0 ? (
        <p className="hint">
          {grantableDomains.length === 0
            ? 'Tu perfil no otorga accesos de módulo (solo operas dentro del tuyo).'
            : 'Nadie ha pedido acceso a tus áreas por ahora.'}
        </p>
      ) : (
        <div className="admin-list">
          {pendingForMe.map((r) => {
            const d = domainById(r.scope)
            return (
              <div key={r.id} className="admin-row" style={{ flexWrap: 'wrap' }}>
                <div className="admin-row-main" style={{ flex: 1, minWidth: 200 }}>
                  <strong>
                    {nameOf(r.requester_id)} → {d?.label || r.scope}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {r.reason || 'Sin motivo escrito'}
                    {' · '}
                    {r.requested_at
                      ? new Date(r.requested_at).toLocaleString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                    {' · pide '}
                    {r.hours || 8}h
                  </span>
                </div>
                <div
                  className="admin-row-actions"
                  style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <select
                    value={decideHours[r.id] ?? r.hours ?? 8}
                    onChange={(e) =>
                      setDecideHours((h) => ({ ...h, [r.id]: Number(e.target.value) }))
                    }
                    title="Duración del grant"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.hours} value={d.hours}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="primary small"
                    disabled={busy}
                    onClick={() => onDecide(r.id, true)}
                  >
                    Permitir
                  </button>
                  <button
                    type="button"
                    className="ghost small danger"
                    disabled={busy}
                    onClick={() => onDecide(r.id, false)}
                  >
                    Denegar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <h3 className="section-title" style={{ margin: '20px 0 8px' }}>
        Tus solicitudes
      </h3>
      {myRequests.length === 0 ? (
        <p className="hint">Aún no has solicitado acceso a otros módulos.</p>
      ) : (
        <div className="admin-list">
          {myRequests.slice(0, 15).map((r) => {
            const d = domainById(r.scope)
            const st = r.status || 'pending'
            return (
              <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{d?.label || r.scope}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {STATUS_LABEL[st] || st}
                    {r.expires_at && st === 'approved'
                      ? ` · hasta ${new Date(r.expires_at).toLocaleString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                    {r.grantor_id ? ` · ${nameOf(r.grantor_id)}` : ''}
                  </span>
                </div>
                <span
                  className={`pill status ${
                    st === 'approved'
                      ? 'ok'
                      : st === 'pending'
                        ? 'warn'
                        : st === 'denied'
                          ? 'off'
                          : ''
                  }`}
                >
                  {STATUS_LABEL[st] || st}
                </span>
                {(st === 'pending' || st === 'approved') && (
                  <button
                    type="button"
                    className="ghost small"
                    disabled={busy}
                    onClick={() => onRevoke(r.id)}
                  >
                    {st === 'pending' ? 'Cancelar' : 'Devolver'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="hint" style={{ marginTop: 16, fontSize: 12 }}>
        Regla: el gerente no ve el panel ni los datos del coordinador (ni al revés) salvo acceso
        temporal aprobado. El único perfil omnisciente es el administrador de plataforma.
      </p>
    </div>
  )
}
