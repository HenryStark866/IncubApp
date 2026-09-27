/**
 * src/components/AuthForm.jsx
 * Acceso seguro a IncubApp (CDH Maker), como en el inicio: solo correo y contraseña.
 * - Iniciar sesión / Crear cuenta eligiendo la EMPRESA (queda vinculado y pendiente
 *   de que su empresa apruebe el acceso y le asigne el rol).
 * - Recuperación de contraseña por correo.
 * - Sin internet: quien ya entró una vez en este dispositivo entra con su mismo
 *   correo y contraseña (src/lib/offlineAuth.js). Los errores salen en español.
 * El acceso con Google se retiró el 23-09-2026 a pedido de Henry.
 * Henry Stark Desarrollador
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase, SUPABASE_URL } from '../lib/supabase'
import { buildAuthRedirectUrl, persistPendingSignupContext } from '../lib/authService'
import {
  authErrorEs,
  hasOfflineLogin,
  isNetworkError,
  offlineSessionFor,
  rememberOfflineLogin,
  startOfflineSession,
  verifyOfflineLogin,
} from '../lib/offlineAuth'
import { IncubAppProductLogo, CdhSignature } from './Brand'

const COMPANIES_CACHE = 'incubapp:signup-companies'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function readCachedCompanies() {
  try {
    const list = JSON.parse(localStorage.getItem(COMPANIES_CACHE) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Reintenta solo los fallos de red (no los de credenciales): 3 intentos en total. */
async function withNetworkRetry(fn) {
  let last
  for (const pause of [0, 1200, 2500]) {
    if (pause) await wait(pause)
    try {
      const res = await fn()
      if (res?.error && isNetworkError(res.error)) {
        last = res
        continue
      }
      return res
    } catch (err) {
      if (!isNetworkError(err)) return { error: err }
      last = { error: err }
    }
  }
  return last
}

export default function AuthForm() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companies, setCompanies] = useState(readCachedCompanies)
  const [companiesState, setCompaniesState] = useState('idle') // idle | loading | ok | error
  const [orgId, setOrgId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  // Empresas disponibles para el registro (RPC pública: solo id + nombre).
  const loadCompanies = useCallback(async () => {
    setCompaniesState('loading')
    const res = await withNetworkRetry(() => supabase.rpc('signup_companies'))
    if (res?.error) {
      setCompaniesState('error')
      return
    }
    const list = (res?.data ?? []).filter((c) => c?.id && c?.name)
    setCompanies(list)
    setCompaniesState('ok')
    try {
      localStorage.setItem(COMPANIES_CACHE, JSON.stringify(list))
    } catch {
      /* */
    }
  }, [])

  useEffect(() => {
    if (mode === 'signup' && companiesState === 'idle') loadCompanies()
  }, [mode, companiesState, loadCompanies])

  const go = (next) => {
    setMode(next)
    setMessage(null)
  }

  /** Entrada sin conexión con la huella guardada en este dispositivo. */
  const enterOffline = async () => {
    const user = await verifyOfflineLogin(email, password)
    if (!user) {
      setMessage({
        kind: 'error',
        text: hasOfflineLogin(email)
          ? 'Sin conexión: la contraseña no coincide con la que usaste la última vez en este dispositivo.'
          : 'Sin conexión con el servidor. Para entrar sin internet, esta cuenta debe haber iniciado sesión al menos una vez con internet en este dispositivo.',
      })
      return false
    }
    startOfflineSession(offlineSessionFor(user, SUPABASE_URL))
    return true
  }

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    const cleanEmail = email.trim()

    try {
      if (mode === 'forgot') {
        if (!cleanEmail) {
          setMessage({ kind: 'error', text: 'Por favor ingresa tu correo electrónico.' })
          return
        }
        const { error } = await withNetworkRetry(() =>
          supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: buildAuthRedirectUrl('recovery') })
        )
        setMessage(
          error
            ? { kind: 'error', text: authErrorEs(error) }
            : { kind: 'ok', text: 'Te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada o la carpeta de spam.' }
        )
        return
      }

      if (mode === 'signup') {
        if (!orgId) {
          setMessage({ kind: 'error', text: 'Selecciona la empresa a la que perteneces.' })
          return
        }
        if (password.length < 6) {
          setMessage({ kind: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' })
          return
        }
        persistPendingSignupContext(orgId, fullName)
        const company = companies.find((c) => c.id === orgId)
        const { data, error } = await withNetworkRetry(() =>
          supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: { full_name: fullName.trim(), org_id: orgId },
              emailRedirectTo: buildAuthRedirectUrl('confirm'),
            },
          })
        )
        if (error) {
          setMessage({ kind: 'error', text: authErrorEs(error) })
        } else if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          // Supabase responde «éxito» sin identidades cuando el correo ya existe.
          setMessage({ kind: 'error', text: 'Ya existe una cuenta con ese correo. Inicia sesión o usa «¿Olvidaste tu contraseña?».' })
        } else if (data?.session) {
          await rememberOfflineLogin({ email: cleanEmail, password, user: data.user })
          setMessage({ kind: 'ok', text: `Cuenta creada y vinculada a ${company?.name || 'tu empresa'}. Falta que tu empresa apruebe tu acceso y te asigne el rol.` })
        } else {
          setMessage({
            kind: 'ok',
            text: `Cuenta creada para ${company?.name || 'tu empresa'}. Confirma tu correo con el enlace que te llegó (revisa spam) y espera a que tu empresa apruebe el acceso.`,
          })
        }
        return
      }

      // Iniciar sesión: sin red ni se intenta el servidor.
      if (!online || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        await enterOffline()
        return
      }
      const { data, error } = await withNetworkRetry(() =>
        supabase.auth.signInWithPassword({ email: cleanEmail, password })
      )
      if (error) {
        if (isNetworkError(error)) {
          if (hasOfflineLogin(cleanEmail)) {
            await enterOffline()
          } else {
            setMessage({ kind: 'error', text: `${authErrorEs(error)} Esta cuenta aún no tiene acceso sin conexión en este dispositivo.` })
          }
          return
        }
        setMessage({ kind: 'error', text: authErrorEs(error) })
        return
      }
      if (data?.user) await rememberOfflineLogin({ email: cleanEmail, password, user: data.user })
    } finally {
      setBusy(false)
    }
  }

  const signupReady = mode !== 'signup' || (!!orgId && !!fullName.trim())
  const companyPlaceholder =
    companiesState === 'loading' && !companies.length
      ? 'Cargando empresas…'
      : companies.length
        ? '— Selecciona tu empresa —'
        : companiesState === 'error'
          ? 'No se pudieron cargar las empresas'
          : '— Selecciona tu empresa —'

  return (
    <div className="card auth-card auth-light">
      <div className="auth-wave" aria-hidden="true" />

      <div className="auth-brand">
        <IncubAppProductLogo mark={54} showSlogan={false} light />
      </div>
      <p className="auth-tagline">{mode === 'forgot' ? 'Recuperación de cuenta' : 'Acceso a la plataforma'}</p>

      {!online && (
        <p className="msg" role="status" style={{ background: '#fff8ef', border: '1px solid #f0c58f', color: '#85501b' }}>
          Sin internet. Si ya entraste antes en este dispositivo, entra con tu mismo correo y contraseña: lo que registres se sube solo al volver la señal.
        </p>
      )}

      {mode !== 'forgot' ? (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'tab active' : 'tab'} onClick={() => go('signin')}>
            Iniciar sesión
          </button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'tab active' : 'tab'} onClick={() => go('signup')}>
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

      {mode === 'signup' && (
        <>
          <label>
            Nombre completo
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="Tu nombre completo" required />
          </label>
          <label>
            Empresa
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} required disabled={!companies.length}>
              <option value="">{companyPlaceholder}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {companiesState === 'error' && (
            <p className="msg error" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{companies.length ? 'Sin conexión: se muestran las empresas guardadas.' : 'No hay conexión con el servidor para traer las empresas.'}</span>
              <button type="button" className="ghost small" style={{ width: 'auto', margin: 0 }} onClick={loadCompanies}>
                Reintentar
              </button>
            </p>
          )}
          <p className="hint" style={{ margin: '2px 0 6px' }}>
            Quedarás vinculado a la empresa que elijas; tu líder o gerencia aprueba el acceso. Crear la cuenta necesita internet.
          </p>
        </>
      )}

      <label>
        Correo electrónico
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="tu@empresa.com" required />
      </label>

      {mode !== 'forgot' && (
        <label>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Contraseña</span>
            {mode === 'signin' && (
              <button
                type="button"
                className="ghost small"
                onClick={() => go('forgot')}
                style={{ fontSize: 11, padding: 0, color: '#2563eb', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 500, width: 'auto', margin: 0 }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy && email && password && signupReady) submit()
            }}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            minLength={6}
            required
          />
        </label>
      )}

      {message && (
        <p className={`msg ${message.kind === 'error' ? 'error' : 'ok'}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      <button
        className="primary"
        type="button"
        onClick={submit}
        disabled={busy || !email || (mode !== 'forgot' && !password) || !signupReady || (mode === 'signup' && !online)}
        style={{ marginTop: 8 }}
      >
        {busy ? 'Espera…' : mode === 'signup' ? 'Registrarme' : mode === 'forgot' ? 'Enviar enlace de recuperación' : online ? 'Entrar' : 'Entrar sin conexión'}
      </button>

      {mode === 'forgot' && (
        <button type="button" className="ghost small" onClick={() => go('signin')} style={{ marginTop: 10, alignSelf: 'center' }}>
          ← Volver a Iniciar sesión
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
        <CdhSignature label="by" />
      </div>
    </div>
  )
}
