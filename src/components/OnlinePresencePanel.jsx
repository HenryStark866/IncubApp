/**
 * =============================================================================
 * ARCHIVO: src/components/OnlinePresencePanel.jsx
 * PROPÃ“SITO: Componente UI Â«OnlinePresencePanelÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL, areaLabel } from '../lib/roles'
import { distanceMeters, formatDistance, mapsUrl } from '../features/platform/hooks/useOrgPresence'
import { readPlantGeo } from '../lib/geoMap'

// Un usuario se considera "en la sede" si estÃ¡ a menos de este radio del origen calibrado
const AT_SITE_RADIUS_M = 500

/** Sede mÃ¡s cercana a una posiciÃ³n, entre las sedes con GPS calibrado. */
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
      return 'Solicitando permiso de ubicaciÃ³nâ€¦'
    case 'granted':
      return 'UbicaciÃ³n compartida con el equipo'
    case 'denied':
      return 'UbicaciÃ³n no compartida (puedes seguir usando la app)'
    case 'unsupported':
      return 'Este dispositivo no soporta geolocalizaciÃ³n'
    case 'error':
      return 'No se pudo obtener la ubicaciÃ³n'
    default:
      return 'Su posiciÃ³n no se comparte hasta activar el interruptor'
  }
}

/**
 * Personas en lÃ­nea de la organizaciÃ³n + control de geolocalizaciÃ³n.
 */
export default function OnlinePresencePanel({
  presence,
  currentUserId,
  compact = false,
  orgId = null, // con orgId se cargan las sedes (plantas/granjas) para mostrar la sede de trabajo
  asCard = false, // envuelve en tarjeta propia (para montarlo como "ventana" en un panel)
}) {
  // Sedes de la empresa con GPS calibrado (para "sede de trabajo" por cercanÃ­a)
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
          const geo = readPlantGeo(p) // BD o calibraciÃ³n local
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
          En lÃ­nea ahora
          <span className="pill live" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
            <span className="dot" />
            {onlineCount}
          </span>
        </h3>
      </div>

      {/* Control de Compartir UbicaciÃ³n (User Gesture) */}
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
            <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text)' }}>ðŸ“ Compartir ubicaciÃ³n en tiempo real</span>
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
            <strong style={{ color: 'var(--danger)' }}>âš ï¸ Permiso denegado por el navegador</strong>
            <span style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
              Dado que se bloqueÃ³ el permiso en el pasado, el navegador no volverÃ¡ a mostrar la ventana de solicitud. Debes habilitarlo en los ajustes del sitio web.
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
              Ver cÃ³mo solucionar (GuÃ­a paso a paso)
            </button>
          </div>
        )}
      </div>

      <p className="hint" style={{ margin: '6px 0 10px' }}>
        {onlineCount === 0
          ? 'Nadie mÃ¡s con la app abierta en este momento.'
          : `${onlineCount} persona${onlineCount === 1 ? '' : 's'} con sesiÃ³n activa en la empresa.`}
        {shareLocation && myLocation ? ` ${geoHint(geoStatus)}.` : ''}
      </p>

      {shareLocation && myLocation && (
        <p className="hint" style={{ margin: '0 0 10px' }}>
          Su posiciÃ³n:{' '}
          <a
            href={mapsUrl(myLocation.lat, myLocation.lng)}
            target="_blank"
            rel="noreferrer"
          >
            {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}
          </a>
          {myLocation.accuracy != null && (
            <span> Â· precisiÃ³n Â±{Math.round(myLocation.accuracy)} m</span>
          )}
        </p>
      )}

      {peers.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          Cuando un compaÃ±ero abra IncubApp, aparecerÃ¡ aquÃ­ en tiempo real.
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
            const roleText = p.roleLabel || ROLE_LABEL[p.role] || p.role || 'â€”'
            const areaText = p.area ? areaLabel(p.area) : null
            // Sede de trabajo: la sede calibrada mÃ¡s cercana a su posiciÃ³n actual
            const site = nearestSite(sites, p.lat, p.lng)

            return (
              <div
                key={p.userId}
                className={`presence-card${isMe ? ' me' : ''}${p.lat != null ? ' has-loc' : ''}`}
              >
                <div className="presence-avatar" aria-hidden="true">
                  {initials(p.name)}
                  <span className="presence-online-dot" title="En lÃ­nea" />
                </div>
                <div className="presence-info">
                  <strong>
                    {p.name}
                    {isMe ? ' (usted)' : ''}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {roleText}
                    {areaText ? ` Â· ${areaText}` : ''}
                  </span>
                  {site && (
                    <span className="presence-meta">
                      {site.distance <= AT_SITE_RADIUS_M
                        ? `ðŸ“ En ${site.name}`
                        : `ðŸ“ Cerca de ${site.name} Â· a ${formatDistance(site.distance)}`}
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
                          'UbicaciÃ³n'
                        )}
                        {dist ? ` Â· a ${dist}` : ''}
                        {p.accuracy != null ? ` Â· Â±${Math.round(p.accuracy)} m` : ''}
                      </>
                    ) : (
                      <span className="hint" style={{ margin: 0 }}>
                        Sin ubicaciÃ³n compartida
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

/* Modal de SoluciÃ³n de Problemas de Permisos de UbicaciÃ³n */
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
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--amber)', fontWeight: 'bold' }}>ðŸ”§ GuÃ­a: Desbloquear GPS</h3>
          <button type="button" className="ghost small" onClick={onClose} style={{ fontSize: '1.2rem', padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' }}>âœ•</button>
        </div>

        <div style={{ fontSize: '0.85rem', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            El navegador ha bloqueado las solicitudes de ubicaciÃ³n para este sitio. Sigue estos pasos para habilitarlo de nuevo:
          </p>

          <div style={{ borderLeft: '3px solid var(--cyan)', paddingLeft: 12 }}>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--text)', fontSize: '0.9rem', fontWeight: '600' }}>ðŸ¤– Google Chrome (Android / PC)</h4>
            <ol style={{ margin: 0, paddingLeft: 16, color: 'var(--text-dim)' }}>
              <li>Toca el icono del <strong>candado o barras de ajuste</strong> a la izquierda de la direcciÃ³n URL en la barra superior.</li>
              <li>Ingresa a <strong>ConfiguraciÃ³n del sitio</strong> o <strong>Permisos</strong>.</li>
              <li>Busca <strong>UbicaciÃ³n</strong> y selecciona <strong>Permitir</strong>.</li>
              <li>Recarga la pestaÃ±a de la aplicaciÃ³n.</li>
            </ol>
          </div>

          <div style={{ borderLeft: '3px solid var(--cyan)', paddingLeft: 12 }}>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--text)', fontSize: '0.9rem', fontWeight: '600' }}>ðŸ Safari (iPhone / iPad)</h4>
            <ol style={{ margin: 0, paddingLeft: 16, color: 'var(--text-dim)' }}>
              <li>Toca las letras <strong>aA</strong> o el icono de ajustes a la izquierda de la barra de direcciones de Safari.</li>
              <li>Toca en <strong>ConfiguraciÃ³n del sitio web</strong>.</li>
              <li>Busca <strong>UbicaciÃ³n</strong> y cÃ¡mbialo a <strong>Permitir</strong>.</li>
              <li>Si no funciona, ve a Ajustes de iOS â†’ Privacidad y seguridad â†’ LocalizaciÃ³n â†’ Safari â†’ Selecciona "Al usar la app".</li>
            </ol>
          </div>

          <div style={{ borderLeft: '3px solid var(--orange)', paddingLeft: 12, background: 'rgba(245, 144, 15, 0.05)', padding: 10, borderRadius: 6 }}>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--orange-lite)', fontSize: '0.9rem', fontWeight: '600' }}>ðŸ”’ ConexiÃ³n Segura Requerida (HTTPS)</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.4' }}>
              Los navegadores modernos por seguridad <strong>bloquean por completo el GPS</strong> en conexiones no seguras (HTTP). 
              AsegÃºrate de ingresar usando <strong>https://</strong> (ej: <code>https://incubapp.vercel.app</code>) y no mediante una direcciÃ³n IP local por HTTP ordinario.
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

