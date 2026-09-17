/**
 * src/components/ResetPasswordForm.jsx
 * Formulario para establecer una nueva contraseña tras pulsar el enlace
 * de recuperación recibido por correo electrónico (flujo Supabase PASSWORD_RECOVERY).
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { IncubAppProductLogo, CdhSignature } from './Brand'

export default function ResetPasswordForm({ onCompleted }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

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
      setMessage({ kind: 'error', text: error.message || 'No se pudo actualizar la contraseña.' })
    } else {
      setMessage({
        kind: 'ok',
        text: '¡Tu contraseña ha sido actualizada con éxito! Redirigiendo a tu espacio de trabajo…',
      })
      setTimeout(() => {
        // Limpiar fragmento de recovery en la URL
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname)
        }
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          disabled={busy || !password || !confirmPassword}
          style={{ marginTop: 8 }}
        >
          {busy ? 'Actualizando contraseña…' : 'Guardar nueva contraseña'}
        </button>
      </form>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
        <CdhSignature label="by" />
      </div>
    </div>
  )
}
