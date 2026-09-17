/**
 * src/components/AuthForm.jsx
 * Acceso seguro a IncubApp (CDH Maker):
 * - Iniciar sesión / Registro con correo y contraseña
 * - Acceso y registro directo con Google OAuth
 * - Recuperación y restablecimiento de contraseña vía email
 * - Selección de empresa en registro para vinculación automática
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IncubAppProductLogo, CdhSignature } from './Brand'

export default function AuthForm() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companies, setCompanies] = useState([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  // Empresas disponibles para el registro (RPC pública: solo id + nombre)
  useEffect(() => {
    if (mode !== 'signup' || companies.length) return
    setCompaniesLoading(true)
    supabase
      .rpc('signup_companies')
      .then(({ data, error }) => {
        if (!error) setCompanies(data ?? [])
        setCompaniesLoading(false)
      })
  }, [mode, companies.length])

  const submit = async () => {
    setBusy(true)
    setMessage(null)

    if (mode === 'forgot') {
      if (!email.trim()) {
        setMessage({ kind: 'error', text: 'Por favor ingresa tu correo electrónico.' })
        setBusy(false)
        return
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const redirectTo = `${origin}/#type=recovery`
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      })
      setBusy(false)
      if (error) {
        setMessage({ kind: 'error', text: error.message })
      } else {
        setMessage({
          kind: 'ok',
          text: 'Te hemos enviado un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada o carpeta de spam.',
        })
      }
      return
    }

    if (mode === 'signup') {
      if (!orgId) {
        setMessage({ kind: 'error', text: 'Selecciona la empresa a la que perteneces.' })
        setBusy(false)
        return
      }
      const company = companies.find((c) => c.id === orgId)
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), org_id: orgId } },
      })
      setMessage(
        error
          ? { kind: 'error', text: error.message }
          : {
              kind: 'ok',
              text: `Cuenta creada y vinculada a ${company?.name || 'tu empresa'}. Solo falta que tu empresa apruebe tu acceso y te asigne el rol.`,
            }
      )
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setMessage({ kind: 'error', text: error.message })
    }
    setBusy(false)
  }

  const handleGoogleAuth = async () => {
    setBusy(true)
    setMessage(null)

    if (mode === 'signup' && orgId) {
      try {
        localStorage.setItem('incubapp_pending_org_id', orgId)
        if (fullName.trim()) localStorage.setItem('incubapp_pending_full_name', fullName.trim())
      } catch {}
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      setMessage({ kind: 'error', text: error.message })
      setBusy(false)
    }
  }

  const signupReady = mode !== 'signup' || (!!orgId && !!fullName.trim())

  return (
    <div className="card auth-card auth-light">
      <div className="auth-wave" aria-hidden="true" />

      <div className="auth-brand">
        <IncubAppProductLogo mark={54} showSlogan={false} />
      </div>
      <p className="auth-tagline">
        {mode === 'forgot' ? 'Recuperación de cuenta' : 'Acceso a la plataforma'}
      </p>

      {/* Tabs de modo principal */}
      {mode !== 'forgot' ? (
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'signin'}
            className={mode === 'signin' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('signin')
              setMessage(null)
            }}
          >
            Iniciar sesión
          </button>
          <button
            role="tab"
            aria-selected={mode === 'signup'}
            className={mode === 'signup' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('signup')
              setMessage(null)
            }}
          >
            Crear cuenta
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <p className="hint" style={{ margin: 0, fontSize: 13 }}>
            Ingresa tu correo para recibir un enlace seguro de restablecimiento de contraseña.
          </p>
        </div>
      )}

      {/* Botón de Google OAuth */}
      {mode !== 'forgot' && (
        <>
          <button
            type="button"
            className="google-auth-btn"
            onClick={handleGoogleAuth}
            disabled={busy}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              width: '100%',
              padding: '11px 16px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#1e293b',
              fontWeight: 600,
              fontSize: 14,
              cursor: busy ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'all 0.15s ease',
              marginTop: 6,
              marginBottom: 16,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{mode === 'signup' ? 'Registrarme con Google' : 'Continuar con Google'}</span>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '8px 0 16px',
              color: '#94a3b8',
              fontSize: 12,
            }}
          >
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            <span style={{ padding: '0 10px' }}>o con correo</span>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          </div>
        </>
      )}

      {/* Campos de Signup */}
      {mode === 'signup' && (
        <>
          <label>
            Nombre completo
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder="Tu nombre completo"
              required
            />
          </label>
          <label>
            Empresa
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required>
              <option value="">
                {companiesLoading ? 'Cargando empresas…' : '— Selecciona tu empresa —'}
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="hint" style={{ margin: '2px 0 6px' }}>
            Quedarás vinculado a la empresa que elijas; tu líder o gerencia aprueba el acceso.
          </p>
        </>
      )}

      {/* Correo Electrónico */}
      <label>
        Correo electrónico
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="tu@empresa.com"
          required
        />
      </label>

      {/* Contraseña (solo signin y signup) */}
      {mode !== 'forgot' && (
        <label>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Contraseña</span>
            {mode === 'signin' && (
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  setMode('forgot')
                  setMessage(null)
                }}
                style={{
                  fontSize: 11,
                  padding: 0,
                  color: '#2563eb',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            required
          />
        </label>
      )}

      {message && <p className={`msg ${message.kind === 'error' ? 'error' : 'ok'}`}>{message.text}</p>}

      {/* Botón principal */}
      <button
        className="primary"
        type="button"
        onClick={submit}
        disabled={busy || !email || (mode !== 'forgot' && !password) || !signupReady}
        style={{ marginTop: 8 }}
      >
        {busy
          ? 'Espera…'
          : mode === 'signup'
            ? 'Registrarme'
            : mode === 'forgot'
              ? 'Enviar enlace de recuperación'
              : 'Entrar'}
      </button>

      {/* Volver a signin si está en forgot */}
      {mode === 'forgot' && (
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            setMode('signin')
            setMessage(null)
          }}
          style={{ marginTop: 10, alignSelf: 'center' }}
        >
          ← Volver a Iniciar sesión
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
        <CdhSignature label="by" />
      </div>
    </div>
  )
}
