/**
 * Acceso a la app (sin sitio de marketing).
 * Registro: el usuario elige su EMPRESA y queda vinculado de una vez
 * (rol mínimo, pendiente de aprobación del admin de su empresa o de plataforma).
 * Tras login, App redirige según perfil y organización.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { IncubAppProductLogo, CdhSignature } from './Brand'

export default function AuthForm() {
  const [mode, setMode] = useState('signin')
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

    if (mode === 'signup') {
      if (!orgId) {
        setMessage({ kind: 'error', text: 'Selecciona la empresa a la que perteneces.' })
        setBusy(false)
        return
      }
      const company = companies.find((c) => c.id === orgId)
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, org_id: orgId } },
      })
      setMessage(
        error
          ? { kind: 'error', text: error.message }
          : {
              kind: 'ok',
              text: `Cuenta creada y vinculada a ${company?.name || 'tu empresa'}. Solo falta que tu empresa (o la plataforma) apruebe tu acceso y te asigne el rol.`,
            }
      )
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage({ kind: 'error', text: error.message })
    }
    setBusy(false)
  }

  const signupReady = mode !== 'signup' || (!!orgId && !!fullName.trim())

  return (
    <div className="card auth-card auth-light">
      <div className="auth-wave" aria-hidden="true" />

      <div className="auth-brand">
        <IncubAppProductLogo mark={54} showSlogan={false} />
      </div>
      <p className="auth-tagline">Acceso</p>

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'signin'}
          className={mode === 'signin' ? 'tab active' : 'tab'}
          onClick={() => setMode('signin')}
        >
          Iniciar sesión
        </button>
        <button
          role="tab"
          aria-selected={mode === 'signup'}
          className={mode === 'signup' ? 'tab active' : 'tab'}
          onClick={() => setMode('signup')}
        >
          Crear cuenta
        </button>
      </div>

      {mode === 'signup' && (
        <>
          <label>
            Nombre completo
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              placeholder="Tu nombre"
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
            Quedarás vinculado a la empresa que elijas; tu líder o gerencia aprueba el acceso y te
            asigna el rol.
          </p>
        </>
      )}

      <label>
        Correo
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="tu@empresa.com"
        />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder="••••••••"
        />
      </label>

      {message && <p className={`msg ${message.kind === 'error' ? 'error' : 'ok'}`}>{message.text}</p>}

      <button
        className="primary"
        type="button"
        onClick={submit}
        disabled={busy || !email || !password || !signupReady}
      >
        {busy ? 'Espera…' : mode === 'signup' ? 'Registrarme' : 'Entrar'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <CdhSignature label="by" />
      </div>
    </div>
  )
}
