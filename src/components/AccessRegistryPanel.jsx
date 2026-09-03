/**
 * =============================================================================
 * ARCHIVO: src/components/AccessRegistryPanel.jsx
 * PROPÓSITO: Consola de desarrollador (CDH Maker) — bitácora de accesos a la app,
 *   metadatos de dispositivo y de perfil por usuario. Documentado y exportable a
 *   Excel. Solo para admin de plataforma (platform_role='admin').
 * CÓMO FUNCIONA: lee user_access_log + profiles + organization_members (cross-tenant
 *   por RLS de plataforma), agrupa por usuario/dispositivo y exporta con exportToExcel.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportToExcel } from '../lib/exportExcel'

const fmtDT = (v) =>
  v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')
const todayKey = () => new Date().toLocaleDateString('sv-SE')

const EVENT_LABEL = {
  login: 'Inicio de sesión',
  session: 'Apertura de app',
  app_open: 'Apertura de app',
  logout: 'Cierre de sesión',
}

/** Documentación de los campos (requisito: registro documentado). */
const FIELD_DOCS = [
  ['Usuario', 'Persona autenticada (nombre y correo del perfil).'],
  ['Evento', 'Tipo de acceso: inicio de sesión, apertura de app o cierre.'],
  ['Fecha/hora', 'Momento del acceso (zona horaria del visor).'],
  ['Empresa', 'Organización activa del usuario en ese acceso (si aplica).'],
  ['Rol / área', 'Rol y área con los que entró (rol de empresa; platform_role si es staff CDH Maker).'],
  ['Dispositivo', 'Tipo (móvil/tablet/escritorio), navegador y sistema operativo derivados del user-agent.'],
  ['Pantalla / viewport', 'Resolución de pantalla y tamaño de ventana (px) + densidad de píxeles.'],
  ['Hardware', 'Memoria del dispositivo (GB), núcleos lógicos y puntos táctiles reportados por el navegador.'],
  ['Idioma / zona horaria', 'Preferencia de idioma y zona horaria del dispositivo.'],
  ['User-agent', 'Cadena completa del navegador (traza técnica).'],
  ['Versión app', 'Versión de IncubApp con la que se conectó (si está definida).'],
]

export default function AccessRegistryPanel() {
  const [events, setEvents] = useState([])
  const [profiles, setProfiles] = useState([])
  const [members, setMembers] = useState([])
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('accesos')
  const [q, setQ] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [showDocs, setShowDocs] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    const [e, p, m, o] = await Promise.all([
      supabase
        .from('user_access_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase
        .from('profiles')
        .select('id, email, full_name, platform_role, is_approved, created_at'),
      supabase
        .from('organization_members')
        .select('user_id, org_id, role, area'),
      supabase.from('organizations').select('id, name'),
    ])
    if (e.error) {
      setError(
        /does not exist|schema cache|relation|PGRST/i.test(e.error.message || '')
          ? 'Falta la tabla user_access_log. Ejecute supabase_migration_user_access_log.sql.'
          : e.error.message
      )
    } else {
      setEvents(e.data ?? [])
    }
    if (!p.error) setProfiles(p.data ?? [])
    if (!m.error) setMembers(m.data ?? [])
    if (!o.error) setOrgs(o.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const orgName = (id) => orgs.find((o) => o.id === id)?.name || '—'
  const profileOf = (uid) => profiles.find((p) => p.id === uid)
  const nameOf = (uid) => {
    const p = profileOf(uid)
    return p?.full_name || p?.email || uid?.slice(0, 8) || '—'
  }
  const membershipOf = (uid) => members.find((m) => m.user_id === uid)

  // Filtro de eventos
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return events.filter((ev) => {
      if (orgFilter && ev.org_id !== orgFilter) return false
      if (!needle) return true
      const p = profileOf(ev.user_id)
      const hay = `${p?.full_name || ''} ${p?.email || ''} ${ev.browser || ''} ${ev.os || ''} ${ev.device_type || ''}`.toLowerCase()
      return hay.includes(needle)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, q, orgFilter, profiles])

  const kpis = useMemo(() => {
    const users = new Set(events.map((e) => e.user_id))
    const devices = new Set(events.map((e) => e.user_agent || `${e.browser}-${e.os}`))
    const today = events.filter((e) => (e.created_at || '').slice(0, 10) === todayKey())
    return { total: events.length, users: users.size, devices: devices.size, today: today.length }
  }, [events])

  // Agrupado por usuario
  const byUser = useMemo(() => {
    const map = new Map()
    for (const ev of events) {
      const cur = map.get(ev.user_id) || { userId: ev.user_id, count: 0, last: null, devices: new Set(), orgs: new Set() }
      cur.count += 1
      if (!cur.last || ev.created_at > cur.last) cur.last = ev.created_at
      cur.devices.add(`${ev.browser || '?'} · ${ev.os || '?'} · ${ev.device_type || '?'}`)
      if (ev.org_id) cur.orgs.add(ev.org_id)
      map.set(ev.user_id, cur)
    }
    // incluir perfiles sin accesos aún
    for (const p of profiles) {
      if (!map.has(p.id)) map.set(p.id, { userId: p.id, count: 0, last: null, devices: new Set(), orgs: new Set() })
    }
    return [...map.values()].sort((a, b) => (b.last || '').localeCompare(a.last || ''))
  }, [events, profiles])

  // Dispositivos únicos
  const byDevice = useMemo(() => {
    const map = new Map()
    for (const ev of events) {
      const key = ev.user_agent || `${ev.browser}·${ev.os}`
      const cur = map.get(key) || {
        key,
        label: `${ev.browser || '?'} · ${ev.os || '?'} · ${ev.device_type || '?'}`,
        userAgent: ev.user_agent,
        count: 0,
        users: new Set(),
        last: null,
      }
      cur.count += 1
      cur.users.add(ev.user_id)
      if (!cur.last || ev.created_at > cur.last) cur.last = ev.created_at
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [events])

  const exportBook = async () => {
    const accesos = filtered.map((ev) => {
      const mem = membershipOf(ev.user_id)
      return {
        Fecha_hora: fmtDT(ev.created_at),
        Usuario: nameOf(ev.user_id),
        Correo: profileOf(ev.user_id)?.email || '',
        Evento: EVENT_LABEL[ev.event_type] || ev.event_type,
        Empresa: ev.org_id ? orgName(ev.org_id) : '',
        Rol: ev.role || mem?.role || '',
        Area: ev.area || mem?.area || '',
        Platform_role: ev.platform_role || '',
        Dispositivo: ev.device_type || '',
        Navegador: ev.browser || '',
        SO: ev.os || '',
        Pantalla: ev.screen_w ? `${ev.screen_w}x${ev.screen_h}` : '',
        Viewport: ev.viewport_w ? `${ev.viewport_w}x${ev.viewport_h}` : '',
        Densidad: ev.pixel_ratio || '',
        Memoria_GB: ev.device_memory || '',
        Nucleos: ev.hardware_concurrency || '',
        Tactil: ev.max_touch_points || '',
        Idioma: ev.language || '',
        Zona_horaria: ev.timezone || '',
        Online: ev.online == null ? '' : ev.online ? 'sí' : 'no',
        Version_app: ev.app_version || '',
        User_agent: ev.user_agent || '',
        URL: ev.url || '',
      }
    })
    const usuarios = byUser.map((u) => {
      const p = profileOf(u.userId)
      const mem = membershipOf(u.userId)
      return {
        Usuario: nameOf(u.userId),
        Correo: p?.email || '',
        Platform_role: p?.platform_role || '',
        Aprobado: p?.is_approved ? 'sí' : 'no',
        Rol_empresa: mem?.role || '',
        Area: mem?.area || '',
        Empresa: mem?.org_id ? orgName(mem.org_id) : '',
        Accesos: u.count,
        Ultimo_acceso: u.last ? fmtDT(u.last) : '',
        Dispositivos: [...u.devices].join(' | '),
        Perfil_creado: fmtDate(p?.created_at),
      }
    })
    const dispositivos = byDevice.map((d) => ({
      Dispositivo: d.label,
      Accesos: d.count,
      Usuarios: d.users.size,
      Ultimo_uso: d.last ? fmtDT(d.last) : '',
      User_agent: d.userAgent || '',
    }))
    const sheets = [
      { name: 'Accesos', rows: accesos },
      { name: 'Usuarios', rows: usuarios },
      { name: 'Dispositivos', rows: dispositivos },
    ].filter((s) => s.rows.length)
    if (!sheets.length) return
    await exportToExcel('registro-accesos', sheets, {
      title: 'Registro de accesos y dispositivos',
      module: 'Consola desarrollador · CDH Maker',
    })
  }

  const TABS = [
    { id: 'accesos', label: 'Accesos' },
    { id: 'usuarios', label: 'Por usuario' },
    { id: 'dispositivos', label: 'Dispositivos' },
  ]

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>Accesos y dispositivos</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Bitácora de uso de la app por usuario, con metadatos de dispositivo y perfil. Solo consola de
            desarrollador (CDH Maker).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="ghost small" onClick={load} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button type="button" className="chip ghost" onClick={exportBook} disabled={!events.length}>
            ⬇ Exportar Excel
          </button>
        </div>
      </div>

      {error && <p className="msg error" style={{ marginTop: 8 }}>{error}</p>}

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.total)}</span>
          <span className="kpi-label">Accesos registrados</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.users)}</span>
          <span className="kpi-label">Usuarios con acceso</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.devices)}</span>
          <span className="kpi-label">Dispositivos únicos</span>
        </div>
        <div className={`kpi-card${kpis.today ? ' warn' : ''}`}>
          <span className="kpi-value">{num(kpis.today)}</span>
          <span className="kpi-label">Accesos hoy</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 4px' }}>
        <input
          type="search"
          placeholder="Buscar usuario, navegador, SO…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
          <option value="">Todas las empresas</option>
          {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
        </select>
        <button type="button" className="ghost small" onClick={() => setShowDocs((s) => !s)}>
          {showDocs ? 'Ocultar guía' : '¿Qué significa cada dato?'}
        </button>
      </div>

      {showDocs && (
        <div className="card" style={{ margin: '8px 0', padding: '10px 14px', background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
          <ul className="hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {FIELD_DOCS.map(([k, v]) => (
              <li key={k}><strong>{k}:</strong> {v}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="seg" role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`chip${tab === t.id ? ' active' : ' ghost'}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && !events.length ? (
        <p className="hint">Cargando registro…</p>
      ) : tab === 'accesos' ? (
        filtered.length === 0 ? (
          <p className="hint">Sin accesos registrados todavía. Se registran automáticamente al abrir la app.</p>
        ) : (
          <div className="admin-list">
            {filtered.slice(0, 300).map((ev) => (
              <details key={ev.id} className="admin-row" style={{ margin: 0, alignItems: 'flex-start', display: 'block' }}>
                <summary style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', listStyle: 'none' }}>
                  <span>{ev.device_type === 'mobile' ? '📱' : ev.device_type === 'tablet' ? '📲' : '💻'}</span>
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>{nameOf(ev.user_id)}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {fmtDT(ev.created_at)} · {ev.browser || '?'} / {ev.os || '?'}
                      {ev.org_id ? ` · ${orgName(ev.org_id)}` : ''}
                      {ev.role ? ` · ${ev.role}` : ''}
                      {ev.platform_role ? ` · ${ev.platform_role}` : ''}
                    </span>
                  </div>
                  <span className="pill status">{EVENT_LABEL[ev.event_type] || ev.event_type}</span>
                </summary>
                <div className="hint" style={{ margin: '8px 0 4px 34px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 4 }}>
                  <span>Dispositivo: {ev.device_type || '—'}</span>
                  <span>Pantalla: {ev.screen_w ? `${ev.screen_w}×${ev.screen_h}` : '—'} · densidad {ev.pixel_ratio || '—'}</span>
                  <span>Ventana: {ev.viewport_w ? `${ev.viewport_w}×${ev.viewport_h}` : '—'}</span>
                  <span>Memoria: {ev.device_memory ? `${ev.device_memory} GB` : '—'} · {ev.hardware_concurrency || '—'} núcleos</span>
                  <span>Táctil: {ev.max_touch_points ?? '—'}</span>
                  <span>Idioma: {ev.language || '—'} · {ev.timezone || '—'}</span>
                  <span>Online: {ev.online == null ? '—' : ev.online ? 'sí' : 'no'} · v{ev.app_version || '—'}</span>
                  <span style={{ gridColumn: '1 / -1', wordBreak: 'break-all' }}>UA: {ev.user_agent || '—'}</span>
                </div>
              </details>
            ))}
          </div>
        )
      ) : tab === 'usuarios' ? (
        <div className="admin-list">
          {byUser.map((u) => {
            const p = profileOf(u.userId)
            const mem = membershipOf(u.userId)
            return (
              <div key={u.userId} className="admin-row" style={{ margin: 0, alignItems: 'flex-start' }}>
                <span>{p?.platform_role === 'admin' ? '🛠️' : '👤'}</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{nameOf(u.userId)}{p?.platform_role === 'admin' ? ' · CDH Maker' : ''}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {p?.email || '—'}
                    {mem?.role ? ` · ${mem.role}` : ''}
                    {mem?.area ? ` · ${mem.area}` : ''}
                    {mem?.org_id ? ` · ${orgName(mem.org_id)}` : ''}
                    {p ? ` · perfil desde ${fmtDate(p.created_at)}` : ''}
                  </span>
                  <span className="hint" style={{ margin: 0, fontSize: '0.78rem' }}>
                    {[...u.devices].join('  ·  ') || 'Sin dispositivos registrados'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <span className="pill status">{u.count} acceso{u.count === 1 ? '' : 's'}</span>
                  <span className="hint" style={{ margin: 0 }}>{u.last ? fmtDT(u.last) : 'sin acceso'}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="admin-list">
          {byDevice.length === 0 ? (
            <p className="hint">Sin dispositivos registrados.</p>
          ) : (
            byDevice.map((d) => (
              <div key={d.key} className="admin-row compact" style={{ margin: 0 }}>
                <span>🖥️</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{d.label}</strong>
                  <span className="hint" style={{ margin: 0, wordBreak: 'break-all' }}>{d.userAgent || '—'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <span className="pill status">{d.count} · {d.users.size} usuario{d.users.size === 1 ? '' : 's'}</span>
                  <span className="hint" style={{ margin: 0 }}>{d.last ? fmtDT(d.last) : ''}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
