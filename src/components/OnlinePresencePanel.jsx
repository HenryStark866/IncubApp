/**
 * =============================================================================
 * ARCHIVO: src/components/OnlinePresencePanel.jsx
 * PROPÓSITO: Componente UI «OnlinePresencePanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL, areaLabel } from '../lib/roles'
import { distanceMeters, formatDistance, mapsUrl } from '../hooks/useOrgPresence'
import { readPlantGeo } from '../lib/geoMap'

// Un usuario se considera "en la sede" si está a menos de este radio del origen calibrado
const AT_SITE_RADIUS_M = 500

/** Sede más cercana a una posición, entre las sedes con GPS calibrado. */
function nearestSite(sites, lat, lng) {
  if (lat == null || lng == null || !sites.length) return null
  let best = null
  for (const s of sites) {
    const d = distanceMeters({ lat, lng }, { lat: s.lat, lng: s.lng })
    if (d != null && (!best || d < best.distance)) best = { ...s, distance: d }
  }
  return best
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function geoHint(status) {
  switch (status) {
    case 'prompting':
      return 'Solicitando permiso de ubicación…'
    case 'granted':
      return 'Ubicación compartida con el equipo'
    case 'denied':
      return 'Ubicación no compartida (puedes seguir usando la app)'
    case 'unsupported':
      return 'Este dispositivo no soporta geolocalización'
    case 'error':
      return 'No se pudo obtener la ubicación'
    default:
      return 'Su posición no se comparte hasta activar el interruptor'
  }
}

/**
 * Personas en línea de la organización + control de geolocalización.
 */
export default function OnlinePresencePanel({
  presence,
  currentUserId,
  compact = false,
  orgId = null, // con orgId se cargan las sedes (plantas/granjas) para mostrar la sede de trabajo
  asCard = false, // envuelve en tarjeta propia (para montarlo como "ventana" en un panel)
}) {
  // Sedes de la empresa con GPS calibrado (para "sede de trabajo" por cercanía)
  const [sites, setSites] = useState([])
  const [showTrouble, setShowTrouble] = useState(false)

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('plants')
      .select('id, name, code, geo_origin_lat, geo_origin_lng, geo_rotation_deg, geo_scale')
      .eq('org_id', orgId)
      .then(({ data }) => {
        const list = []
        for (const p of data ?? []) {
          const geo = readPlantGeo(p) // BD o calibración local
          if (geo) list.push({ id: p.id, name: p.name, lat: geo.originLat, lng: geo.originLng })
        }
        setSites(list)
      })
  }, [orgId])

  if (!presence) return null

  const {
    peers,
    onlineCount,
    shareLocation,
    setShareLocation,
    geoStatus,
    myLocation,
  } = presence

  const myCoords = shareLocation && myLocation
    ? { lat: myLocation.lat, lng: myLocation.lng }
    : null

  const panel = (
    <section className={`presence-panel${compact ? ' compact' : ''}`}>
      <div className="presence-head">
        <h3 className="section-title" style={{ margin: 0 }}>
          En línea ahora
          <span className="pill live" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
            <span className="dot" />
            {onlineCount}
          </span>
        </h3>
      </div>

      {/* Control de Compartir Ubicación (User Gesture) */}
      <div className="location-settings-bar" style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
        margin: '12px 0 16px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text)' }}>📍 Compartir ubicación en tiempo real</span>
            <span className="hint" style={{ margin: '2px 0 0 0', fontSize: '0.75rem', lineHeight: '1.3' }}>
              Permite a tus coordinadores y al equipo ubicarte en el mapa de la sede
            </span>
          </div>
          <label className="switch-label" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
            <input
              type="checkbox"
              checked={!!shareLocation}
              onChange={(e) => {
                setShareLocation(e.target.checked)
              }}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </label>
        </div>

        {shareLocation && (
          <div style={{
            fontSize: '0.8rem',
            paddingTop: 8,
            borderTop: '1px dashed var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span className={`dot ${geoStatus === 'granted' ? 'ok' : geoStatus === 'prompting' ? 'warn' : 'danger'}`}
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: geoStatus === 'granted' ? 'var(--ok)' : geoStatus === 'prompting' ? 'var(--orange)' : 'var(--danger)'
                  }} />
            <span style={{ color: 'var(--text-dim)' }}>
              Estado del GPS: <strong>{geoHint(geoStatus)}</strong>
            </span>
          </div>
        )}

        {(geoStatus === 'denied' || geoStatus === 'error') && shareLocation && (
          <div style={{
            background: 'rgba(197, 55, 39, 0.08)',
            border: '1px solid var(--danger)',
            borderRadius: '6px',
            padding: '10px 12px',
            marginTop: 4,
            fontSize: '0.8rem',
            color: 'var(--text)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            <strong style={{ color: 'var(--danger)' }}>⚠️ Permiso denegado por el navegador</strong>
            <span style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
              Dado que se bloqueó el permiso en el pasado, el navegador no volverá a mostrar la ventana de solicitud. Debes habilitarlo en los ajustes del sitio web.
            </span>
            <button
              type="button"
              className="ghost small danger"
              onClick={() => setShowTrouble(true)}
              style={{
                alignSelf: 'flex-start',
                padding: '4px 8px',
                fontSize: '0.75rem',
                marginTop: 2,
                cursor: 'pointer',
                fontWeight: 'bold',
                borderColor: 'var(--danger)',
                background: 'transparent',
                color: 'var(--danger)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderRadius: '4px'
              }}
            >
              Ver cómo solucionar (Guía paso a paso)
            </button>
          </div>
        )}
      </div>

      <p className="hint" style={{ margin: '6px 0 10px' }}>
        {onlineCount === 0
          ? 'Nadie más con la app abierta en este momento.'
          : `${onlineCount} persona${onlineCount === 1 ? '' : 's'} con sesión activa en la empresa.`}
        {shareLocation && myLocation ? ` ${geoHint(geoStatus)}.` : ''}
      </p>

      {shareLocation && myLocation && (
        <p className="hint" style={{ margin: '0 0 10px' }}>
          Su posición:{' '}
          <a
            href={mapsUrl(myLocation.lat, myLocation.lng)}
            target="_blank"
            rel="noreferrer"
          >
            {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}
          </a>
          {myLocation.accuracy != null && (
            <span> · precisión ±{Math.round(myLocation.accuracy)} m</span>
          )}
        </p>
      )}

      {peers.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          Cuando un compañero abra IncubApp, aparecerá aquí en tiempo real.
        </p>
      ) : (
        <div className="presence-grid">
          {peers.map((p) => {
            const isMe = p.userId === currentUserId
            const dist =
              !isMe && myCoords && p.lat != null
                ? formatDistance(distanceMeters(myCoords, { lat: p.lat, lng: p.lng }))
                : null
            const map = mapsUrl(p.lat, p.lng)
            const roleText = p.roleLabel || ROLE_LABEL[p.role] || p.role || '—'
            const areaText = p.area ? areaLabel(p.area) : null
            // Sede de trabajo: la sede calibrada más cercana a su posición actual
            const site = nearestSite(sites, p.lat, p.lng)

            return (
              <div
                key={p.userId}
                className={`presence-card${isMe ? ' me' : ''}${p.lat != null ? ' has-loc' : ''}`}
              >
                <div className="presence-avatar" aria-hidden="true">
                  {initials(p.name)}
                  <span className="presence-online-dot" title="En línea" />
                </div>
                <div className="presence-info">
                  <strong>
                    {p.name}
                    {isMe ? ' (usted)' : ''}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {roleText}
                    {areaText ? ` · ${areaText}` : ''}
                  </span>
                  {site && (
                    <span className="presence-meta">
                      {site.distance <= AT_SITE_RADIUS_M
                        ? `📍 En ${site.name}`
                        : `📍 Cerca de ${site.name} · a ${formatDistance(site.distance)}`}
                    </span>
                  )}
                  <span className="presence-meta">
                    {p.lat != null && p.lng != null ? (
                      <>
                        {map ? (
                          <a href={map} target="_blank" rel="noreferrer">
                            Ver en mapa
                          </a>
                        ) : (
                          'Ubicación'
                        )}
                        {dist ? ` · a ${dist}` : ''}
                        {p.accuracy != null ? ` · ±${Math.round(p.accuracy)} m` : ''}
                      </>
                    ) : (
                      <span className="hint" style={{ margin: 0 }}>
                        Sin ubicación compartida
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showTrouble && (
        <PermissionTroubleshootingModal onClose={() => setShowTrouble(false)} />
      )}
    </section>
  )

  // Como "ventana" independiente (paneles de admin/coordinador)
  if (asCard) return <div className="card wide">{panel}</div>
  return panel
}

/* Modal de Solución de Problemas de Permisos de Ubicación */
function PermissionTroubleshootingModal({ onClose }) {
  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 10, 20, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 16,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content card" style={{
        maxWidth: 500,
        width: '100%',
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: 20,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--amber)', fontWeight: 'bold' }}>🔧 Guía: Desbloquear GPS</h3>
          <button type="button" className="ghost small" onClick={onClose} style={{ fontSize: '1.2rem', padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ fontSize: '0.85rem', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            El navegador ha bloqueado las solicitudes de ubicación para este sitio. Sigue estos pasos para habilitarlo de nuevo:
          </p>

          <div style={{ borderLeft: '3px solid var(--cyan)', paddingLeft: 12 }}>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--text)', fontSize: '0.9rem', fontWeight: '600' }}>🤖 Google Chrome (Android / PC)</h4>
            <ol style={{ margin: 0, paddingLeft: 16, color: 'var(--text-dim)' }}>
              <li>Toca el icono del <strong>candado o barras de ajuste</strong> a la izquierda de la dirección URL en la barra superior.</li>
              <li>Ingresa a <strong>Configuración del sitio</strong> o <strong>Permisos</strong>.</li>
              <li>Busca <strong>Ubicación</strong> y selecciona <strong>Permitir</strong>.</li>
              <li>Recarga la pestaña de la aplicación.</li>
            </ol>
          </div>

          <div style={{ borderLeft: '3px solid var(--cyan)', paddingLeft: 12 }}>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--text)', fontSize: '0.9rem', fontWeight: '600' }}>🍏 Safari (iPhone / iPad)</h4>
            <ol style={{ margin: 0, paddingLeft: 16, color: 'var(--text-dim)' }}>
              <li>Toca las letras <strong>aA</strong> o el icono de ajustes a la izquierda de la barra de direcciones de Safari.</li>
              <li>Toca en <strong>Configuración del sitio web</strong>.</li>
              <li>Busca <strong>Ubicación</strong> y cámbialo a <strong>Permitir</strong>.</li>
              <li>Si no funciona, ve a Ajustes de iOS → Privacidad y seguridad → Localización → Safari → Selecciona "Al usar la app".</li>
            </ol>
          </div>

          <div style={{ borderLeft: '3px solid var(--orange)', paddingLeft: 12, background: 'rgba(245, 144, 15, 0.05)', padding: 10, borderRadius: 6 }}>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--orange-lite)', fontSize: '0.9rem', fontWeight: '600' }}>🔒 Conexión Segura Requerida (HTTPS)</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.4' }}>
              Los navegadores modernos por seguridad <strong>bloquean por completo el GPS</strong> en conexiones no seguras (HTTP). 
              Asegúrate de ingresar usando <strong>https://</strong> (ej: <code>https://incubapp.cdhmaker.com</code>) y no mediante una dirección IP local por HTTP ordinario.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="primary small" onClick={onClose} style={{ padding: '6px 12px' }}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
