/**
 * src/components/ResetPasswordForm.jsx
 * Formulario para establecer una nueva contraseña tras pulsar el enlace
 * de recuperación recibido por correo electrónico (flujo Supabase PASSWORD_RECOVERY).
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authErrorEs } from '../lib/offlineAuth'
import { IncubAppProductLogo, CdhSignature } from './Brand'

export default function ResetPasswordForm({ onCompleted }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  // null = comprobando · true = el enlace abrió sesión · false = enlace usado o vencido
  const [hasSession, setHasSession] = useState(null)

  useEffect(() => {
    let alive = true
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (alive) setHasSession(!!data?.session)
    }
    check()
    // supabase-js abre la sesión del enlace al iniciar: puede llegar un instante después.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (alive && s) setHasSession(true)
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  const clearUrl = () => {
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  const backToLogin = () => {
    clearUrl()
    if (typeof onCompleted === 'function') onCompleted()
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!password) {
      setMessage({ kind: 'error', text: 'Por favor ingresa tu nueva contraseña.' })
      return
    }
    if (password.length < 6) {
      setMessage({ kind: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' })
      return
    }
    if (password !== confirmPassword) {
      setMessage({ kind: 'error', text: 'Las contraseñas no coinciden.' })
      return
    }

    setBusy(true)
    setMessage(null)

    const { error } = await supabase.auth.updateUser({
      password,
    })

    setBusy(false)

    if (error) {
      setMessage({ kind: 'error', text: authErrorEs(error) || 'No se pudo actualizar la contraseña.' })
    } else {
      setMessage({
        kind: 'ok',
        text: '¡Tu contraseña ha sido actualizada con éxito! Redirigiendo a tu espacio de trabajo…',
      })
      setTimeout(() => {
        clearUrl()
        if (typeof onCompleted === 'function') onCompleted()
      }, 1500)
    }
  }

  return (
    <div className="card auth-card auth-light" style={{ maxWidth: 420 }}>
      <div className="auth-wave" aria-hidden="true" />

      <div className="auth-brand">
        <IncubAppProductLogo mark={54} showSlogan={false} />
      </div>
      <p className="auth-tagline">Restablecer Contraseña</p>

      <p className="hint" style={{ textAlign: 'center', marginBottom: 16 }}>
        Ingresa tu nueva contraseña para actualizar el acceso a tu cuenta.
      </p>

      {hasSession === false && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="msg error" style={{ margin: 0 }}>
            Este enlace ya se usó o venció (cada enlace sirve una sola vez y solo el último que llegó al correo).
          </p>
          <button type="button" className="primary" onClick={backToLogin}>
            Pedir un enlace nuevo
          </button>
          <p className="hint" style={{ margin: 0, textAlign: 'center' }}>
            En la pantalla de acceso usa «¿Olvidaste tu contraseña?», o pide a tu líder una contraseña temporal.
          </p>
        </div>
      )}

      {hasSession !== false && <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label>
          Nueva contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
            required
            autoFocus
          />
        </label>

        <label>
          Confirmar nueva contraseña
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repite la nueva contraseña"
            autoComplete="new-password"
            required
          />
        </label>

        {message && (
          <p className={`msg ${message.kind === 'error' ? 'error' : 'ok'}`} style={{ margin: '4px 0' }}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          className="primary"
          disabled={busy || !hasSession || !password || !confirmPassword}
          style={{ marginTop: 8 }}
        >
          {busy ? 'Actualizando contraseña…' : 'Guardar nueva contraseña'}
        </button>
      </form>}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        <CdhSignature label="by" />
      </div>
    </div>
  )
}
