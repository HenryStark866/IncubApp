/**
 * =============================================================================
 * ARCHIVO: src/components/WorkspaceNav.jsx
 * PROPÓSITO: Componente UI «WorkspaceNav»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/roles'
import { compressImage } from '../lib/image'
import { getTheme, setTheme } from '../lib/theme'

function initials(name, email) {
  const n = (name || '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }
  return (email || '?').slice(0, 2).toUpperCase()
}

/**
 * Navegación tipo red privada:
 *  - Un solo «Menú» de módulos
 *  - Chip de perfil con mini-menú (foto, perfil, tema, cerrar sesión)
 */
export default function WorkspaceNav({
  tab,
  onNavigate,
  items,
  profile,
  role,
  orgName,
  onlineCount = 0,
  online = true,
  pendingOffline = 0,
  uploadAvatar,
  removeAvatar,
  /** Líder de área (2026-07-26): su navegación vive en los iconos flotantes
   * del plano en vivo (LeaderOpsMap); el menú clásico ahí solo estorba. */
  hideMenu = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [q, setQ] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoErr, setPhotoErr] = useState(null)
  const [theme, setThemeLocal] = useState(getTheme)
  const menuBtnRef = useRef(null)
  const menuPanelRef = useRef(null)
  const profileBtnRef = useRef(null)
  const profileMenuRef = useRef(null)
  const fileRef = useRef(null)

  const flat = useMemo(() => items.filter(Boolean), [items])

  const groups = useMemo(() => {
    const map = new Map()
    for (const item of flat) {
      if (item.id === 'perfil') continue
      const g = item.group || (item.id === 'hoy' ? 'Inicio' : 'Más')
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(item)
    }
    const order = [
      'Administración del servicio',
      'Ingeniería del servicio',
      'Plataforma IncubApp',
      'Desarrollo',
      'CDH Maker',
      'Inicio',
      'Cliente',
      'Cliente · Inicio',
      'Cliente · Dirección',
      'Cliente · Comunicación',
      'Cliente · Comercial',
      'Cliente · Operación',
      'Cliente · Instalaciones',
      'Cliente · Sanidad',
      'Cliente · Cumplimiento',
      'Cliente · Recursos',
      'Cliente · Personalizados',
      'Dirección',
      'Comunicación',
      'Comercial',
      'Operación',
      'Instalaciones',
      'Sanidad',
      'Cumplimiento',
      'Recursos',
      'Sistema',
      'Personalizados',
      'Más',
    ]
    return [...map.entries()]
      .filter(([, list]) => list.length > 0)
      .sort((a, b) => {
        const ia = order.indexOf(a[0])
        const ib = order.indexOf(b[0])
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
  }, [flat])

  const filteredGroups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map(([name, list]) => [
        name,
        list.filter(
          (i) =>
            i.label.toLowerCase().includes(needle) ||
            (i.hint && i.hint.toLowerCase().includes(needle))
        ),
      ])
      .filter(([, list]) => list.length > 0)
  }, [groups, q])

  const currentLabel = useMemo(() => {
    const hit = flat.find((i) => i.id === tab || (i.match && i.match(tab)))
    return hit?.label || null
  }, [flat, tab])

  // Cerrar al tocar fuera — con retraso para no capturar el mismo toque que abrió
  // (bug típico en móvil: el menú se abre y se cierra al instante).
  useEffect(() => {
    if (!menuOpen && !profileOpen) return
    let active = true
    const onDoc = (e) => {
      if (!active) return
      const t = e.target
      if (!(t instanceof Node)) return
      if (menuOpen) {
        const insidePanel = menuPanelRef.current?.contains(t)
        const insideBtn = menuBtnRef.current?.contains(t)
        if (!insidePanel && !insideBtn) setMenuOpen(false)
      }
      if (profileOpen) {
        const insideMenu = profileMenuRef.current?.contains(t)
        const insideBtn = profileBtnRef.current?.contains(t)
        if (!insideMenu && !insideBtn) setProfileOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setProfileOpen(false)
      }
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDoc, true)
      document.addEventListener('keydown', onKey)
    }, 80)
    return () => {
      active = false
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, profileOpen])

  // Bloquear scroll del body con menú abierto (móvil)
  useEffect(() => {
    if (!menuOpen && !profileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen, profileOpen])

  const go = (id) => {
    onNavigate(id)
    setMenuOpen(false)
    setProfileOpen(false)
    setQ('')
  }

  const pickTheme = (t) => {
    setThemeLocal(t)
    setTheme(t)
  }

  const onPickPhoto = async (file) => {
    if (!file || !uploadAvatar) return
    setPhotoBusy(true)
    setPhotoErr(null)
    try {
      const compressed = await compressImage(file, 512, 0.75)
      const { error } = await uploadAvatar(compressed)
      if (error) setPhotoErr(error)
    } catch (e) {
      setPhotoErr(e.message || 'No se pudo subir la foto')
    }
    setPhotoBusy(false)
  }

  const onRemovePhoto = async () => {
    if (!removeAvatar) return
    setPhotoBusy(true)
    setPhotoErr(null)
    const { error } = await removeAvatar()
    if (error) setPhotoErr(error)
    setPhotoBusy(false)
  }

  const signOut = async () => {
    setProfileOpen(false)
    await supabase.auth.signOut()
  }

  const name = profile?.full_name || profile?.email || 'Mi perfil'
  const first = (profile?.full_name || '').trim().split(/\s+/)[0] || name
  const av = profile?.avatar_url
  const roleName = ROLE_LABEL[role] ?? role ?? ''
  const email = profile?.email || ''

  const menuPanel =
    !hideMenu &&
    menuOpen &&
    createPortal(
      <div
        className="ws-menu-overlay"
        role="presentation"
        onClick={(e) => {
          // Cerrar solo si se toca el fondo (no el panel)
          if (e.target === e.currentTarget) setMenuOpen(false)
        }}
      >
        <div
          id="ws-main-menu"
          className="ws-menu-panel"
          ref={menuPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="ws-menu-panel-head">
            <div>
              <strong>Menú</strong>
              {orgName && <span className="ws-menu-org">{orgName}</span>}
            </div>
            <button
              type="button"
              className="ws-menu-close"
              onClick={() => setMenuOpen(false)}
            >
              Cerrar
            </button>
          </div>
          <label className="ws-menu-search">
            <span className="sr-only">Buscar</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar sección…"
              enterKeyHint="search"
              autoComplete="off"
              // autoFocus rompe el viewport en iOS / Android al abrir el teclado
            />
          </label>
          <div className="ws-menu-scroll">
            {filteredGroups.length === 0 ? (
              <p className="ws-menu-empty">Sin resultados</p>
            ) : (
              filteredGroups.map(([groupName, list]) => (
                <section key={groupName} className="ws-menu-group">
                  <h4>{groupName}</h4>
                  <div className="ws-menu-grid">
                    {list.map((item) => {
                      const on = tab === item.id || (item.match && item.match(tab))
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`ws-menu-card${on ? ' active' : ''}`}
                          onClick={() => go(item.id)}
                        >
                          <span className="ws-menu-card-title">{item.label}</span>
                          {item.hint && (
                            <span className="ws-menu-card-hint">{item.hint}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>,
      document.body
    )

  const profileMenu =
    profileOpen &&
    createPortal(
      <div
        className="ws-profile-overlay"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) setProfileOpen(false)
        }}
      >
        <div
          className="ws-profile-menu"
          ref={profileMenuRef}
          role="menu"
          aria-label="Menú de perfil"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="ws-profile-menu-hero">
            <div className="ws-profile-menu-av">
              {av ? (
                <img src={av} alt="" />
              ) : (
                initials(profile?.full_name, email)
              )}
            </div>
            <div className="ws-profile-menu-meta">
              <strong>{name}</strong>
              {email && <span>{email}</span>}
              {roleName && <em>{roleName}</em>}
              {orgName && <span className="ws-profile-menu-org">{orgName}</span>}
            </div>
          </div>

          {photoErr && <p className="msg error ws-profile-msg">{photoErr}</p>}
          {photoBusy && <p className="hint ws-profile-msg">Actualizando foto…</p>}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              onPickPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />

          <div className="ws-profile-menu-list">
            <button type="button" role="menuitem" onClick={() => go('perfil')}>
              <span className="ws-pmi-title">Ver mi perfil</span>
              <span className="ws-pmi-hint">Actividad, datos y preferencias</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={photoBusy || !uploadAvatar}
              onClick={() => fileRef.current?.click()}
            >
              <span className="ws-pmi-title">Cambiar foto</span>
              <span className="ws-pmi-hint">Galería o cámara</span>
            </button>
            {av && (
              <button
                type="button"
                role="menuitem"
                disabled={photoBusy || !removeAvatar}
                onClick={onRemovePhoto}
              >
                <span className="ws-pmi-title">Quitar foto</span>
                <span className="ws-pmi-hint">Volver a iniciales</span>
              </button>
            )}
          </div>

          <div className="ws-profile-theme">
            <span>Apariencia</span>
            <div className="ws-profile-theme-opts">
              <button
                type="button"
                className={theme === 'light' ? 'active' : ''}
                onClick={() => pickTheme('light')}
              >
                Claro
              </button>
              <button
                type="button"
                className={theme === 'dark' ? 'active' : ''}
                onClick={() => pickTheme('dark')}
              >
                Oscuro
              </button>
            </div>
          </div>

          <div className="ws-profile-menu-list danger-zone">
            <button type="button" role="menuitem" className="danger" onClick={signOut}>
              <span className="ws-pmi-title">Cerrar sesión</span>
              <span className="ws-pmi-hint">Salir de este dispositivo</span>
            </button>
          </div>
        </div>
      </div>,
      document.body
    )

  return (
    <div className="ws-social-bar">
      <div className="ws-social-meta">
        {!online && <span className="ws-meta-chip offline">Sin conexión</span>}
        {online && onlineCount > 0 && (
          <span className="ws-meta-chip live" title="Personas en línea">
            <span className="dot" />
            {onlineCount}
          </span>
        )}
        {online && pendingOffline > 0 && (
          <span className="ws-meta-chip sync">{pendingOffline} sync</span>
        )}
        {currentLabel && tab !== 'perfil' && tab !== 'hoy' && (
          <span className="ws-meta-chip section">{currentLabel}</span>
        )}
      </div>

      <div className="ws-social-actions">
        {flat.some((i) => i.id === 'hoy') && (
          <button
            type="button"
            className={`ws-icon-btn${tab === 'hoy' ? ' active' : ''}`}
            onClick={() => go('hoy')}
            title="Hoy"
          >
            Hoy
          </button>
        )}

        {!hideMenu && (
          <button
            ref={menuBtnRef}
            type="button"
            className={`ws-menu-btn${menuOpen ? ' open' : ''}`}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            aria-controls="ws-main-menu"
            onPointerDown={(e) => {
              // Evita que el pointerdown del documento cierre el menú al abrir
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
              setProfileOpen(false)
            }}
          >
            <span className="ws-menu-btn-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Menú</span>
          </button>
        )}

        <button
          ref={profileBtnRef}
          type="button"
          className={`ws-profile-chip${tab === 'perfil' || profileOpen ? ' active' : ''}`}
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          onClick={() => {
            setProfileOpen((v) => !v)
            setMenuOpen(false)
          }}
          title="Mi cuenta"
        >
          <span className="ws-profile-avatar" aria-hidden="true">
            {av ? <img src={av} alt="" /> : initials(profile?.full_name, email)}
            {online && <span className="ws-profile-online" title="En línea" />}
          </span>
          <span className="ws-profile-text">
            <strong>{first}</strong>
            {roleName && <em>{roleName}</em>}
          </span>
          <span className="ws-profile-caret" aria-hidden="true">
            &#9662;
          </span>
        </button>
      </div>

      {menuPanel}
      {profileMenu}
    </div>
  )
}
