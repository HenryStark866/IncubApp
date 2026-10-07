/**
 * =============================================================================
 * ARCHIVO: src/components/ProfileCard.jsx
 * PROPÓSITO: Componente UI «ProfileCard»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authErrorEs } from '../lib/offlineAuth'
import { getTheme, setTheme } from '../lib/theme'
import { compressImage } from '../lib/image'
import {
  getDevicePermissionState,
  requestGeolocationPermission,
  requestCameraPermission,
  requestNotificationPermission,
  requestMicrophonePermission,
  getBatteryStatus,
  getNetworkStatus,
} from '../lib/devicePermissions'

/* ══ Selector de apariencia (tema claro / oscuro) ════════════ */
function ThemePicker() {
  const [theme, setLocal] = useState(getTheme)
  const pick = (t) => {
    setLocal(t)
    setTheme(t)
  }
  return (
    <div className="theme-toggle" role="group" aria-label="Tema de la aplicación">
      <button
        className={theme === 'light' ? 'theme-opt active' : 'theme-opt'}
        onClick={() => pick('light')}
        aria-pressed={theme === 'light'}
      >
        ☀️ Claro
      </button>
      <button
        className={theme === 'dark' ? 'theme-opt active' : 'theme-opt'}
        onClick={() => pick('dark')}
        aria-pressed={theme === 'dark'}
      >
        🌙 Oscuro
      </button>
    </div>
  )
}

const ROLE_LABEL = {
  owner: 'Desarrollador',
  admin: 'Administrador',
  developer: 'Desarrollador front',
  coordinator: 'Coordinador',
  supervisor: 'Supervisor',
  operator: 'Operario',
  maintenance_auxiliary: 'Auxiliar de mantenimiento',
  auxiliary_production: 'Auxiliar de producción',
  quality_auxiliary: 'Auxiliar de calidad',
  barn_operator: 'Operario galponero',
  reception_operator: 'Operario de recepción',
  auxiliary: 'Auxiliar',
  viewer: 'Observador',
}

const WO_STATUS_LABEL = {
  open: 'Abierta',
  in_progress: 'En ejecución',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const monthStart = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}
const todayStr = () => new Date().toLocaleDateString('sv-SE')

/* ══ Cambio de contraseña ════════════════════════════════════ */
function PasswordForm() {
  const [open, setOpen] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async () => {
    if (pw1.length < 6) return setMsg({ kind: 'error', text: 'Mínimo 6 caracteres' })
    if (pw1 !== pw2) return setMsg({ kind: 'error', text: 'Las contraseñas no coinciden' })
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: authErrorEs(error) })
    else {
      setMsg({ kind: 'ok', text: 'Contraseña actualizada' })
      setPw1('')
      setPw2('')
      setTimeout(() => setOpen(false), 1500)
    }
  }

  if (!open) {
    return (
      <button className="ghost" onClick={() => setOpen(true)}>
        🔒 Cambiar contraseña
      </button>
    )
  }

  return (
    <div className="inline-form compact" style={{ width: '100%' }}>
      <div className="two-col">
        <label>
          Nueva contraseña
          <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" autoFocus />
        </label>
        <label>
          Confirmar contraseña
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy || !pw1 || !pw2}>
          {busy ? 'Guardando…' : 'Actualizar contraseña'}
        </button>
        <button className="ghost" onClick={() => { setOpen(false); setMsg(null) }} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* ══ Foto de perfil: galería o selfie ════════════════════════ */
function AvatarUploader({ avatarUrl, initials, uploadAvatar, removeAvatar }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const pick = async (file) => {
    if (!file) return
    setBusy(true)
    setErr(null)
    const compressed = await compressImage(file, 512, 0.75)
    const { error } = await uploadAvatar(compressed)
    setBusy(false)
    if (error) setErr(error)
  }

  return (
    <div className="avatar-uploader">
      <div className="profile-avatar" aria-hidden="true">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : initials}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      <div className="avatar-actions">
        <button className="ghost small" onClick={() => fileRef.current?.click()} disabled={busy}>Cambiar foto</button>
        {avatarUrl && (
          <button className="ghost small danger" onClick={async () => { setBusy(true); await removeAvatar(); setBusy(false) }} disabled={busy}>
            Quitar
          </button>
        )}
      </div>
      {busy && <span className="hint" style={{ margin: 0 }}>Subiendo…</span>}
      {err && <p className="msg error" style={{ margin: '4px 0 0', textAlign: 'center' }}>{err}</p>}
    </div>
  )
}

/* ══ Panel completo de permisos del dispositivo corporativo ════════════════ */
function DevicePermissionsPanel() {
  const [perms, setPerms] = useState(() => getDevicePermissionState())
  const [battery, setBattery] = useState(null)
  const [network, setNetwork] = useState(null)
  const [busy, setBusy] = useState({})
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setPerms(getDevicePermissionState())
    getBatteryStatus().then(setBattery)
    setNetwork(getNetworkStatus())
  }, [refreshKey])

  const ask = async (key, fn) => {
    setBusy((b) => ({ ...b, [key]: true }))
    await fn()
    setPerms(getDevicePermissionState())
    setBusy((b) => ({ ...b, [key]: false }))
  }

  const statusInfo = (s) => {
    if (s === 'granted') return { icon: '✅', color: 'var(--ok)', label: 'Concedido' }
    if (s === 'denied') return { icon: '❌', color: 'var(--danger)', label: 'Bloqueado' }
    if (s === 'unsupported') return { icon: '⚫', color: 'var(--text-dim)', label: 'No disponible' }
    if (s === 'prompting') return { icon: '⏳', color: 'var(--orange)', label: 'Pendiente' }
    if (s === 'error') return { icon: '⚠️', color: 'var(--orange)', label: 'Error' }
    return { icon: '⚪', color: 'var(--text-dim)', label: 'Sin solicitar' }
  }

  const PERMS = [
    {
      key: 'geo',
      icon: '📍',
      title: 'Ubicación GPS (tiempo real)',
      desc: 'Registra coordenadas exactas del operario. Requerido para asistencia georreferenciada, rondas, trazabilidad en planta y calibración de mapa.',
      fn: requestGeolocationPermission,
    },
    {
      key: 'camera',
      icon: '📸',
      title: 'Cámara',
      desc: 'Captura evidencias fotográficas de OT, máquinas, incidentes y selfie de asistencia biométrica.',
      fn: requestCameraPermission,
    },
    {
      key: 'notifications',
      icon: '🔔',
      title: 'Notificaciones del sistema',
      desc: 'Órdenes de cargue, alertas de mantenimiento, avisos de gerencia y mensajes del equipo en tiempo real.',
      fn: requestNotificationPermission,
    },
    {
      key: 'microphone',
      icon: '🎤',
      title: 'Micrófono',
      desc: 'Registro de incidencias por voz y notas de campo de operarios en campo.',
      fn: requestMicrophonePermission,
    },
  ]

  const batteryColor = battery?.level != null
    ? battery.level > 50 ? 'var(--ok)' : battery.level > 20 ? 'var(--orange)' : 'var(--danger)'
    : 'var(--text-dim)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {PERMS.map(({ key, icon, title, desc, fn }) => {
        const raw = perms?.[key] ?? perms?.results?.[key]
        const st = statusInfo(raw)
        const loading = !!busy[key]
        const isGranted = raw === 'granted'
        const isBlocked = raw === 'denied'
        return (
          <div
            key={key}
            style={{
              background: 'var(--bg-2)',
              border: `1px solid ${st.color}44`,
              borderLeft: `3px solid ${st.color}`,
              borderRadius: 'var(--radius)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <span style={{ fontSize: '1.4rem', lineHeight: 1, marginTop: 2 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem' }}>{title}</strong>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: st.color,
                  background: `${st.color}18`,
                  padding: '2px 7px',
                  borderRadius: 20,
                  border: `1px solid ${st.color}55`,
                }}>
                  {st.icon} {st.label}
                </span>
              </div>
              <p style={{ margin: '4px 0 8px', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                {desc}
              </p>
              <button
                type="button"
                className="ghost small"
                disabled={loading || isGranted}
                onClick={() => ask(key, fn)}
                style={{
                  fontSize: '0.78rem',
                  padding: '4px 10px',
                  opacity: isGranted ? 0.5 : 1,
                  cursor: isGranted ? 'default' : 'pointer',
                }}
              >
                {loading ? 'Solicitando…' : isGranted ? '✅ Activo' : isBlocked ? '🔓 Intentar de nuevo' : 'Solicitar permiso'}
              </button>
              {isBlocked && (
                <p style={{ margin: '6px 0 0', fontSize: '0.73rem', color: 'var(--danger)', lineHeight: 1.4 }}>
                  Bloqueado por el navegador. Toca el 🔒 junto a la URL → Permisos del sitio → Permitir → Recarga la página.
                </p>
              )}
            </div>
          </div>
        )
      })}

      {/* Estado del dispositivo: batería y red */}
      <div style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '12px 14px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 6 }}>🔋 Batería del dispositivo</div>
          {battery?.ok ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 8, background: 'var(--bg-3)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${battery.level}%`, height: '100%', background: batteryColor, transition: 'width 0.4s' }} />
                </div>
                <strong style={{ fontSize: '0.85rem', color: batteryColor, minWidth: 36 }}>{battery.level}%</strong>
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', marginTop: 4 }}>
                {battery.charging ? '⚡ Cargando' : battery.dischargingTime && isFinite(battery.dischargingTime) ? `~${Math.round(battery.dischargingTime / 3600)}h restantes` : 'En uso'}
              </div>
            </>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>No disponible en este navegador</span>
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 6 }}>📶 Conexión de red</div>
          {network && (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.82rem', fontWeight: '600',
                color: network.online ? 'var(--ok)' : 'var(--danger)'
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: network.online ? 'var(--ok)' : 'var(--danger)', display: 'inline-block' }} />
                {network.online ? 'En línea' : 'Sin conexión'}
              </div>
              {network.type && <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', marginTop: 4 }}>
                <strong>{network.type.toUpperCase()}</strong>
                {network.downlink ? ` · ${network.downlink} Mbps` : ''}
                {network.rtt ? ` · ${network.rtt}ms` : ''}
              </div>}
              {network.saveData && <div style={{ fontSize: '0.73rem', color: 'var(--orange)', marginTop: 2 }}>⚠️ Ahorro de datos activo</div>}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        className="ghost small"
        onClick={() => setRefreshKey((k) => k + 1)}
        style={{ alignSelf: 'flex-start', fontSize: '0.78rem' }}
      >
        🔄 Actualizar estado
      </button>
    </div>
  )
}


export default function ProfileCard({ session, org, role, profileApi }) {
  const userId = session.user.id
  // Una sola instancia de useProfile viene desde App (evita canales Realtime duplicados)
  const { profile, loading, saving, live, error, saveProfile, uploadAvatar, removeAvatar } = profileApi

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)

  // Actividad personal
  const [myOrders, setMyOrders] = useState([])
  const [myChecks, setMyChecks] = useState([])
  const [myEvidence, setMyEvidence] = useState(0)
  const [machines, setMachines] = useState([])

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setPhone(profile.phone ?? '')
    } else if (!loading) {
      setFullName(session.user.user_metadata?.full_name ?? '')
    }
  }, [profile, loading, session])

  useEffect(() => {
    if (!userId) return
    const since = monthStart()
    Promise.all([
      supabase
        .from('work_orders')
        .select('id, code, title, status, priority, completed_at, created_at, assigned_to, created_by')
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('machine_checks')
        .select('id, machine_id, shift_date, shift_number, hour_slot, condition, taken_at')
        .eq('taken_by', userId)
        .gte('taken_at', since)
        .order('taken_at', { ascending: false })
        .limit(200),
      supabase
        .from('wo_evidence')
        .select('id', { count: 'exact', head: true })
        .eq('uploaded_by', userId)
        .gte('created_at', since),
      supabase.from('machines').select('id, name, code'),
    ]).then(([o, c, e, m]) => {
      setMyOrders(o.data ?? [])
      setMyChecks(c.data ?? [])
      setMyEvidence(e.count ?? 0)
      setMachines(m.data ?? [])
    })
  }, [userId])

  const stats = useMemo(() => {
    const hoy = todayStr()
    return {
      otActivas: myOrders.filter((o) => o.assigned_to === userId && (o.status === 'open' || o.status === 'in_progress')).length,
      otCompletadasMes: myOrders.filter((o) => o.status === 'completed' && o.completed_at && o.completed_at >= monthStart()).length,
      rondasHoy: myChecks.filter((c) => c.shift_date === hoy).length,
      rondasMes: myChecks.length,
    }
  }, [myOrders, myChecks, userId])

  const recent = useMemo(() => {
    const machineOf = (id) => machines.find((m) => m.id === id)
    const a = myChecks.slice(0, 6).map((c) => ({
      id: `c-${c.id}`,
      when: c.taken_at,
      icon: c.condition === 'fault' ? '🔴' : c.condition === 'warning' ? '🟡' : '🟢',
      text: `Ronda ${String(c.hour_slot).padStart(2, '0')}:00 · ${machineOf(c.machine_id)?.name ?? 'Máquina'} (${machineOf(c.machine_id)?.code ?? '—'})`,
    }))
    const b = myOrders.slice(0, 6).map((o) => ({
      id: `o-${o.id}`,
      when: o.completed_at ?? o.created_at,
      icon: o.status === 'completed' ? '✅' : o.status === 'in_progress' ? '🔧' : '📋',
      text: `${o.code} · ${o.title} — ${WO_STATUS_LABEL[o.status] ?? o.status}`,
    }))
    return [...a, ...b].sort((x, y) => (y.when > x.when ? 1 : -1)).slice(0, 7)
  }, [myChecks, myOrders, machines])

  const onSave = async () => {
    const { error: err } = await saveProfile({ full_name: fullName.trim(), phone: phone.trim() || null })
    if (!err) {
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  const initials = (fullName || session.user.email || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const isPlatformAdmin = profile?.platform_role === 'admin'

  return (
    <div className="card wide profile-card">
      {/* ── Cabecera ── */}
      <div className="profile-hero">
        <AvatarUploader
          avatarUrl={profile?.avatar_url}
          initials={initials}
          uploadAvatar={uploadAvatar}
          removeAvatar={removeAvatar}
        />
        <div className="profile-hero-info">
          <h2>{fullName || 'Sin nombre'}</h2>
          <span className="hint" style={{ margin: 0 }}>
            {session.user.email}
            {phone ? ` · ${phone}` : ''}
          </span>
          <div className="profile-badges">
            {isPlatformAdmin && <span className="pill role">Admin de plataforma CDH Maker</span>}
            {org && (
              <span className="pill status ok">
                {org.name} · {ROLE_LABEL[role] ?? role ?? '—'}
              </span>
            )}
            <span className={live ? 'pill live' : 'pill'}>
              <span className="dot" aria-hidden="true" />
              {live ? 'En vivo' : 'Conectando…'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Mi actividad ── */}
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Mi actividad</h3>
      <div className="kpi-grid">
        <div className={`kpi-card${stats.otActivas > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{stats.otActivas}</span>
          <span className="kpi-label">OT asignadas activas</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{stats.otCompletadasMes}</span>
          <span className="kpi-label">OT completadas (mes)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{stats.rondasHoy}</span>
          <span className="kpi-label">Tomas de ronda hoy</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{stats.rondasMes}</span>
          <span className="kpi-label">Tomas de ronda (mes)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{myEvidence}</span>
          <span className="kpi-label">Evidencias subidas (mes)</span>
        </div>
      </div>

      {/* ── Actividad reciente ── */}
      {recent.length > 0 && (
        <>
          <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Actividad reciente</h3>
          <div className="admin-list">
            {recent.map((r) => (
              <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                <span>{r.icon}</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <span style={{ fontSize: 13 }}>{r.text}</span>
                </div>
                <span className="hint" style={{ margin: 0 }}>{fmtDateTime(r.when)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Datos personales ── */}
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Datos personales</h3>
      {loading ? (
        <p className="hint">Cargando perfil…</p>
      ) : editing ? (
        <div className="inline-form compact">
          <div className="two-col">
            <label>
              Nombre completo
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
            </label>
            <label>
              Teléfono
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 300 000 0000" />
            </label>
          </div>
          <div className="actions row">
            <button className="primary small" onClick={onSave} disabled={saving || !fullName.trim()}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button className="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-row" style={{ marginBottom: 4 }}>
          <div className="admin-row-main" style={{ flex: 1 }}>
            <strong>{fullName || '(sin nombre)'}</strong>
            <span className="hint" style={{ margin: 0 }}>
              {phone || 'Sin teléfono registrado'}
              {profile?.updated_at
                ? ` · Actualizado: ${new Date(profile.updated_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}`
                : ''}
            </span>
          </div>
          <button className="ghost" onClick={() => setEditing(true)}>
            Editar
          </button>
        </div>
      )}

      {error && <p className="msg error">{error}</p>}
      {saved && <p className="msg ok">Perfil guardado</p>}

      {/* ── Permisos del dispositivo corporativo ── */}
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>📱 Permisos del dispositivo</h3>
      <p className="hint" style={{ margin: '0 0 10px', fontSize: '0.8rem' }}>
        Los dispositivos corporativos requieren estos permisos para funcionar correctamente. Concede todos para garantizar la trazabilidad completa.
      </p>
      <DevicePermissionsPanel />

      {/* ── Apariencia ── */}
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Apariencia</h3>
      <ThemePicker />


      {/* ── Seguridad y sesión ── */}
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Seguridad</h3>
      <div className="actions row" style={{ flexWrap: 'wrap' }}>
        <PasswordForm />
        <button className="ghost danger" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
