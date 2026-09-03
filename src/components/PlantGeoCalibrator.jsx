/**
 * =============================================================================
 * ARCHIVO: src/components/PlantGeoCalibrator.jsx
 * PROPÓSITO: Componente UI «PlantGeoCalibrator»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import {
  writePlantGeoLocal,
  clearPlantGeoLocal,
  calibrateFromTwoPoints,
  DEFAULT_SITE_RADIUS_M,
} from '../lib/geoMap'

function getGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este dispositivo no soporta geolocalización'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err?.code === 1) reject(new Error('Permiso de ubicación denegado'))
        else reject(new Error('No se pudo leer la ubicación'))
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  })
}

async function persistGeo(plantId, next, updatePlantGeo) {
  writePlantGeoLocal(plantId, next)
  let dbOk = false
  if (updatePlantGeo) {
    const { error } = await updatePlantGeo(plantId, {
      geo_origin_lat: next.originLat,
      geo_origin_lng: next.originLng,
      geo_rotation_deg: next.rotationDeg,
      geo_scale: next.scale,
      geo_radius_m: next.radiusM,
    })
    if (error && !/column|schema cache|does not exist|offlineOnly/i.test(error.message || '')) {
      throw new Error(error.message)
    }
    dbOk = !error
  }
  return dbOk
}

/**
 * Calibra el plano GPS:
 *  - Rápido: 1 punto (origen) + rotación manual
 *  - Preciso: 2 puntos (origen + hito en el plano) → rotación y escala automáticas
 */
export default function PlantGeoCalibrator({
  plant,
  geo,
  canManage,
  onSaved,
  updatePlantGeo,
  /** Activa/desactiva modo clic en el FloorMap */
  onPickModeChange,
  /** Punto del plano elegido por clic: { x, y } en metros */
  pickedLandmark,
  onClearPick,
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('two') // 'two' | 'quick'
  const [step, setStep] = useState(1) // 1 origen, 2 hito plano, 3 GPS hito
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [rotation, setRotation] = useState(geo?.rotationDeg ?? 0)
  const [originGps, setOriginGps] = useState(null)
  const [landmarkGps, setLandmarkGps] = useState(null)
  const [radius, setRadius] = useState(geo?.radiusM ?? DEFAULT_SITE_RADIUS_M)
  const [wakeLockActive, setWakeLockActive] = useState(false)
  const [showTrouble, setShowTrouble] = useState(false)

  // Control de Screen Wake Lock para mantener encendida la pantalla durante la calibración
  useEffect(() => {
    let wl = null
    const requestLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wl = await navigator.wakeLock.request('screen')
          setWakeLockActive(true)
        } catch (err) {
          console.warn('Wake Lock request failed:', err)
        }
      }
    }
    
    if (open && canManage) {
      requestLock()
    }

    return () => {
      if (wl) {
        wl.release().then(() => {
          setWakeLockActive(false)
        }).catch(() => {})
      }
    }
  }, [open, canManage])

  useEffect(() => {
    if (geo?.rotationDeg != null) setRotation(geo.rotationDeg)
  }, [geo?.rotationDeg, plant?.id])

  useEffect(() => {
    setRadius(geo?.radiusM ?? DEFAULT_SITE_RADIUS_M)
  }, [geo?.radiusM, plant?.id])

  // Avisar al padre si estamos en paso 2 (elegir hito en el plano)
  useEffect(() => {
    const active = open && canManage && mode === 'two' && step === 2
    onPickModeChange?.(active)
    return () => onPickModeChange?.(false)
  }, [open, canManage, mode, step, onPickModeChange])

  // Al marcar el hito en el plano, avanzar al paso 3
  useEffect(() => {
    if (mode === 'two' && step === 2 && pickedLandmark) {
      setStep(3)
      setMsg({
        kind: 'ok',
        text: `Hito marcado en plano (${pickedLandmark.x.toFixed(1)}, ${pickedLandmark.y.toFixed(1)} m). Vaya a ese sitio real y capture GPS.`,
      })
    }
  }, [pickedLandmark, mode, step])

  if (!plant) return null

  const landmarkPlan = pickedLandmark

  const resetWizard = () => {
    setStep(1)
    setOriginGps(null)
    setLandmarkGps(null)
    setMsg(null)
    onClearPick?.()
  }

  const captureOrigin = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const g = await getGps()
      setOriginGps(g)
      if (mode === 'quick') {
        const next = {
          originLat: g.lat,
          originLng: g.lng,
          rotationDeg: Number(rotation) || 0,
          scale: geo?.scale || 1,
          radiusM: geo?.radiusM ?? DEFAULT_SITE_RADIUS_M,
        }
        const dbOk = await persistGeo(plant.id, next, updatePlantGeo)
        setMsg({
          kind: 'ok',
          text: dbOk
            ? `Origen guardado (±${Math.round(g.accuracy || 0)} m). Ajuste rotación si hace falta.`
            : `Origen guardado en este dispositivo (±${Math.round(g.accuracy || 0)} m).`,
        })
        onSaved?.(next)
      } else {
        setStep(2)
        setMsg({
          kind: 'ok',
          text: `Origen GPS capturado (±${Math.round(g.accuracy || 0)} m). Ahora toque en el plano el segundo hito.`,
        })
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
    }
    setBusy(false)
  }

  const captureLandmarkGps = async () => {
    if (!originGps) {
      setMsg({ kind: 'error', text: 'Primero capture el origen (paso 1)' })
      return
    }
    if (!landmarkPlan) {
      setMsg({ kind: 'error', text: 'Primero toque el hito en el plano (paso 2)' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const g = await getGps()
      setLandmarkGps(g)
      const result = calibrateFromTwoPoints({
        originGps,
        landmarkGps: g,
        landmarkPlan,
      })
      if (result.error) {
        setMsg({ kind: 'error', text: result.error })
        setBusy(false)
        return
      }
      const next = {
        originLat: result.originLat,
        originLng: result.originLng,
        rotationDeg: result.rotationDeg,
        scale: result.scale,
        radiusM: geo?.radiusM ?? DEFAULT_SITE_RADIUS_M,
      }
      const dbOk = await persistGeo(plant.id, next, updatePlantGeo)
      setRotation(result.rotationDeg)
      setMsg({
        kind: 'ok',
        text: `Calibración 2 puntos lista: rotación ${result.rotationDeg}°, escala ${result.scale} (real ${result.distanceRealM} m / plano ${result.distancePlanM} m)${dbOk ? '' : ' · guardado local'}.`,
      })
      onSaved?.(next)
      setStep(1)
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
    }
    setBusy(false)
  }

  const saveRotation = async () => {
    if (!geo && !originGps) {
      setMsg({ kind: 'error', text: 'Primero capture el origen GPS' })
      return
    }
    setBusy(true)
    try {
      const next = {
        originLat: geo?.originLat ?? originGps.lat,
        originLng: geo?.originLng ?? originGps.lng,
        rotationDeg: Number(rotation) || 0,
        scale: geo?.scale || 1,
        radiusM: geo?.radiusM ?? DEFAULT_SITE_RADIUS_M,
      }
      await persistGeo(plant.id, next, updatePlantGeo)
      setMsg({ kind: 'ok', text: 'Rotación actualizada' })
      onSaved?.(next)
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
    }
    setBusy(false)
  }

  const saveRadius = async () => {
    if (!geo) {
      setMsg({ kind: 'error', text: 'Primero calibre el origen GPS de la sede' })
      return
    }
    const r = Math.round(Number(radius))
    if (!Number.isFinite(r) || r < 20 || r > 5000) {
      setMsg({ kind: 'error', text: 'El radio debe estar entre 20 y 5000 metros' })
      return
    }
    setBusy(true)
    try {
      const next = { ...geo, radiusM: r }
      await persistGeo(plant.id, next, updatePlantGeo)
      setMsg({ kind: 'ok', text: `Radio de validación guardado: ${r} m` })
      onSaved?.(next)
    } catch (e) {
      setMsg({ kind: 'error', text: e.message })
    }
    setBusy(false)
  }

  const clear = async () => {
    if (!window.confirm('¿Quitar la calibración GPS de este plano?')) return
    clearPlantGeoLocal(plant.id)
    if (updatePlantGeo) {
      await updatePlantGeo(plant.id, {
        geo_origin_lat: null,
        geo_origin_lng: null,
        geo_rotation_deg: 0,
        geo_scale: 1,
        geo_radius_m: DEFAULT_SITE_RADIUS_M,
      })
    }
    resetWizard()
    setMsg({ kind: 'ok', text: 'Calibración eliminada' })
    onSaved?.(null)
  }

  return (
    <div className="plant-geo-cal">
      <div className="actions row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <span className={`pill${geo ? ' live' : ''}`}>
          <span className="dot" />
          {geo
            ? `GPS plano: ${geo.originLat.toFixed(5)}, ${geo.originLng.toFixed(5)} · rot ${Number(geo.rotationDeg || 0).toFixed(0)}° · esc ${Number(geo.scale || 1).toFixed(2)} · radio ${Math.round(Number(geo.radiusM || DEFAULT_SITE_RADIUS_M))} m`
            : 'Plano sin calibrar GPS'}
        </span>
        {open && wakeLockActive && (
          <span className="pill status ok" style={{ backgroundColor: 'rgba(87, 217, 163, 0.1)', color: 'var(--ok)', borderColor: 'var(--ok)', borderStyle: 'solid', borderWidth: '1px' }}>
            📱 Pantalla siempre activa
          </span>
        )}
        {canManage && (
          <button
            type="button"
            className="ghost small"
            onClick={() => {
              setOpen((v) => {
                if (v) {
                  onPickModeChange?.(false)
                  resetWizard()
                }
                return !v
              })
            }}
          >
            {open ? 'Cerrar calibración' : 'Calibrar GPS de la sede'}
          </button>
        )}
        {!canManage && (
          <span className="hint" style={{ margin: 0 }}>
            Solo líderes de área / gerencia calibran GPS. Dibujar planos: CDH Maker.
          </span>
        )}
      </div>

      {open && canManage && (
        <div className="inline-form compact" style={{ marginTop: 10 }}>
          <p className="hint" style={{ margin: '0 0 8px' }}>
            Calibración de sede: alinea el plano con GPS real. No modifica el dibujo de salas (eso lo
            hace CDH Maker).
          </p>
          <div className="tabs" role="tablist" style={{ marginBottom: 10 }}>
            <button
              type="button"
              role="tab"
              className={mode === 'two' ? 'tab active' : 'tab'}
              onClick={() => {
                setMode('two')
                resetWizard()
              }}
            >
              2 puntos (recomendado)
            </button>
            <button
              type="button"
              role="tab"
              className={mode === 'quick' ? 'tab active' : 'tab'}
              onClick={() => {
                setMode('quick')
                resetWizard()
                onPickModeChange?.(false)
              }}
            >
              Rápido (1 punto)
            </button>
          </div>

          {mode === 'two' ? (
            <>
              <p className="hint" style={{ margin: '0 0 10px' }}>
                <strong>Paso 1:</strong> párese en el origen real del plano (esquina superior
                izquierda del dibujo) y capture GPS.
                <br />
                <strong>Paso 2:</strong> en el plano, toque un hito lejano y reconocible (esquina de
                sala, portón, silo…).
                <br />
                <strong>Paso 3:</strong> camine hasta ese mismo sitio real y capture GPS. La app
                calcula rotación y escala sola.
              </p>

              <ol className="geo-steps">
                <li className={step === 1 ? 'active' : originGps ? 'done' : ''}>
                  <span className="geo-step-n">1</span>
                  <div>
                    <strong>Origen (0,0)</strong>
                    <p className="hint" style={{ margin: '2px 0 6px' }}>
                      {originGps
                        ? `Capturado: ${originGps.lat.toFixed(6)}, ${originGps.lng.toFixed(6)} (±${Math.round(originGps.accuracy || 0)} m)`
                        : 'En el terreno, en la esquina del plano.'}
                    </p>
                    <button
                      type="button"
                      className="primary small"
                      onClick={captureOrigin}
                      disabled={busy}
                    >
                      {busy && step === 1 ? 'Capturando…' : 'Capturar GPS origen'}
                    </button>
                  </div>
                </li>
                <li className={step === 2 ? 'active' : landmarkPlan ? 'done' : ''}>
                  <span className="geo-step-n">2</span>
                  <div>
                    <strong>Hito en el plano</strong>
                    <p className="hint" style={{ margin: '2px 0 6px' }}>
                      {landmarkPlan
                        ? `Marcado en plano: (${landmarkPlan.x.toFixed(1)} m, ${landmarkPlan.y.toFixed(1)} m)`
                        : step === 2
                          ? 'Toque ahora un punto lejano en el mapa de abajo…'
                          : 'Complete el paso 1 primero.'}
                    </p>
                    {landmarkPlan && (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => {
                          onClearPick?.()
                          setStep(2)
                          setMsg({ kind: 'ok', text: 'Toque de nuevo el hito en el plano.' })
                        }}
                      >
                        Volver a marcar
                      </button>
                    )}
                  </div>
                </li>
                <li className={step === 3 ? 'active' : landmarkGps ? 'done' : ''}>
                  <span className="geo-step-n">3</span>
                  <div>
                    <strong>GPS del hito</strong>
                    <p className="hint" style={{ margin: '2px 0 6px' }}>
                      Párese en el mismo sitio físico que marcó en el plano.
                    </p>
                    <button
                      type="button"
                      className="primary small"
                      onClick={captureLandmarkGps}
                      disabled={busy || !originGps || !landmarkPlan}
                    >
                      {busy && step === 3 ? 'Calculando…' : 'Capturar GPS hito y calcular'}
                    </button>
                  </div>
                </li>
              </ol>

              <div className="actions row" style={{ marginTop: 8 }}>
                <button type="button" className="ghost small" onClick={resetWizard} disabled={busy}>
                  Reiniciar asistente
                </button>
                {geo && (
                  <button type="button" className="ghost small danger" onClick={clear} disabled={busy}>
                    Quitar calibración
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="hint" style={{ margin: '0 0 8px' }}>
                Párese en el origen (0,0) del plano, capture GPS y ajuste la rotación a mano si el
                plano no mira al norte. La escala queda en 1:1.
              </p>
              <div className="two-col">
                <label>
                  Rotación del plano (°)
                  <input
                    type="number"
                    min="-180"
                    max="360"
                    step="1"
                    value={rotation}
                    onChange={(e) => setRotation(e.target.value)}
                  />
                </label>
                <div className="actions row" style={{ alignItems: 'flex-end' }}>
                  <button type="button" className="primary small" onClick={captureOrigin} disabled={busy}>
                    {busy ? 'Capturando…' : 'Capturar origen aquí'}
                  </button>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={saveRotation}
                    disabled={busy || (!geo && !originGps)}
                  >
                    Guardar rotación
                  </button>
                  {geo && (
                    <button type="button" className="ghost small danger" onClick={clear} disabled={busy}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {geo && (
            <div className="two-col" style={{ marginTop: 12, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
              <label>
                Radio de validación de ingreso/salida (m)
                <input
                  type="number"
                  min="20"
                  max="5000"
                  step="10"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                />
              </label>
              <div className="actions row" style={{ alignItems: 'flex-end' }}>
                <button type="button" className="ghost small" onClick={saveRadius} disabled={busy}>
                  Guardar radio
                </button>
              </div>
              <p className="hint" style={{ margin: '2px 0 0', gridColumn: '1 / -1' }}>
                Solo se podrá marcar ingreso/salida si el GPS del operario está dentro de este radio
                del origen calibrado. Úselo tras pararse en la mitad de la planta/granja al calibrar.
              </p>
            </div>
          )}

          {msg && (
            <div style={{ marginTop: 8 }}>
              <p className={`msg ${msg.kind}`}>{msg.text}</p>
              {/permiso|denegad/i.test(msg.text || '') && (
                <button
                  type="button"
                  className="ghost small danger"
                  onClick={() => setShowTrouble(true)}
                  style={{
                    marginTop: 6,
                    borderColor: 'var(--danger)',
                    color: 'var(--danger)',
                    background: 'transparent',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  🔧 ¿Cómo activar permisos de GPS?
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!geo && !open && (
        <p className="hint" style={{ margin: '8px 0 0' }}>
          Para ver personal en el plano en tiempo real, un administrador debe calibrar el GPS del
          plano (recomendado: 2 puntos) y cada persona activar «Compartir mi ubicación» en Hoy.
        </p>
      )}

      {showTrouble && (
        <PermissionTroubleshootingModal onClose={() => setShowTrouble(false)} />
      )}
    </div>
  )
}

/* Modal de Solución de Problemas de Permisos de Ubicación (Copia local independiente) */
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
              Asegúrate de ingresar usando <strong>https://</strong> (ej: <code>https://incubapp.vercel.app</code>) y no mediante una dirección IP local por HTTP ordinario.
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
