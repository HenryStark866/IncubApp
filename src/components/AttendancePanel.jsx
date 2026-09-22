/**
 * Asistencia: ingreso/salida con selfie + marca de agua (nombre, fecha, hora, lugar).
 * Henry Stark Desarrollador
 */
import { useEffect, useRef, useState } from 'react'
import { useAttendance } from '../hooks/useAttendance'
import { applyAttendanceWatermark } from '../lib/watermark'

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—'

/**
 * Ingreso / salida con selfie obligatoria y marca de agua de cumplimiento.
 */
export default function AttendancePanel({
  orgId,
  userId,
  userName = '',
  location,
  locationReady,
}) {
  const att = useAttendance({ orgId, userId, userName })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [msg, setMsg] = useState(null)
  const [thumbs, setThumbs] = useState({})
  const [previewBusy, setPreviewBusy] = useState(false)
  const inputRef = useRef(null)

  // Vista previa con marca de agua simulada
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    let cancelled = false
    let objectUrl
    ;(async () => {
      setPreviewBusy(true)
      try {
        const wm = await applyAttendanceWatermark(file, {
          userName: userName || 'Operario',
          userId,
          punchType: att.isInside ? 'out' : 'in',
          lat: location?.lat,
          lng: location?.lng,
          accuracy: location?.accuracy,
          at: new Date(),
        })
        if (cancelled) return
        objectUrl = URL.createObjectURL(wm)
        setPreview(objectUrl)
      } catch {
        if (!cancelled) {
          objectUrl = URL.createObjectURL(file)
          setPreview(objectUrl)
        }
      } finally {
        if (!cancelled) setPreviewBusy(false)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, userName, userId, location, att.isInside, att])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const map = {}
      for (const r of att.todayPunches.slice(0, 6)) {
        if (r.photo_path) map[r.id] = await att.signedUrl(r.photo_path)
      }
      if (!cancelled) setThumbs(map)
    })()
    return () => {
      cancelled = true
    }
  }, [att.todayPunches, att.signedUrl])

  const doPunch = async (type) => {
    setMsg(null)
    if (!file) {
      setMsg({ kind: 'error', text: 'Toma una selfie (cámara frontal) para marcar.' })
      inputRef.current?.click()
      return
    }
    const { error, location: loc, local, watermarked } = await att.punch({
      type,
      photoFile: file,
      placeLabel: locationReady
        ? `${location?.lat?.toFixed(5)}, ${location?.lng?.toFixed(5)}`
        : '',
    })
    if (error) setMsg({ kind: 'error', text: error })
    else {
      setMsg({
        kind: 'ok',
        text: `${type === 'in' ? 'Ingreso' : 'Salida'} con selfie${watermarked ? ' + marca de agua' : ''} · GPS ±${Math.round(loc?.accuracy ?? 0)} m${local ? ' · local' : ''}`,
      })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Asistencia · selfie ingreso / salida</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Selfie obligatoria con marca de agua: nombre, fecha, hora, lugar y GPS. Sirve para
            adherencia al turno y plan de bonos.
          </p>
        </div>
        <span className={`pill status ${att.isInside ? 'ok' : 'warn'}`}>
          {att.isInside ? 'Dentro (ingreso abierto)' : 'Fuera / sin ingreso'}
        </span>
      </div>

      {(att.tableMissing || att.localMode) && (
        <p className="msg warn">
          Modo local de asistencia activo
          {att.tableMissing
            ? ' (falta tabla en nube). Ejecuta supabase_migration_dispatches_attendance.sql para sincronizar.'
            : ' (se guarda en este dispositivo si la nube falla).'}
        </p>
      )}
      {att.error && <p className="msg error">{att.error}</p>}
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}

      <div className="exec-split" style={{ marginTop: 12 }}>
        <section className="exec-panel">
          <div className="exec-panel-head">
            <h3 className="exec-group-title">Marcar ahora</h3>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            Operario: <strong>{userName || '—'}</strong>
            <br />
            GPS:{' '}
            {locationReady
              ? `${location.lat?.toFixed(5)}, ${location.lng?.toFixed(5)} (±${Math.round(location.accuracy || 0)} m)`
              : 'se capturará al marcar (alta precisión)'}
            <br />
            {att.sitesCalibrated
              ? 'Solo se puede marcar dentro del radio calibrado de la sede.'
              : 'La sede aún no tiene calibración GPS: no se exige verificación de ubicación.'}
          </p>
          <label className="punch-photo-box">
            {preview ? (
              <img src={preview} alt="Selfie con marca de agua" className="punch-preview" />
            ) : (
              <span>
                {previewBusy
                  ? 'Generando vista previa…'
                  : 'Toca para selfie (cámara frontal)'}
              </span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <p className="hint" style={{ marginTop: 8 }}>
            La marca de agua se graba en la foto: IncubApp · INGRESO/SALIDA · tu nombre · fecha y
            hora Bogotá · coordenadas.
          </p>
          <div className="actions row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="primary"
              disabled={att.busy || att.isInside}
              onClick={() => doPunch('in')}
            >
              {att.busy ? 'Registrando…' : 'Marcar ingreso'}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={att.busy || !att.isInside}
              onClick={() => doPunch('out')}
            >
              Marcar salida
            </button>
          </div>
        </section>

        <section className="exec-panel">
          <div className="exec-panel-head">
            <h3 className="exec-group-title">Hoy</h3>
          </div>
          {att.loading ? (
            <p className="hint">Cargando…</p>
          ) : att.todayPunches.length === 0 ? (
            <p className="exec-empty">Sin marcas hoy.</p>
          ) : (
            <div className="exec-list">
              {att.todayPunches.map((p) => (
                <div key={p.id} className="exec-list-item">
                  {thumbs[p.id] && (
                    <img src={thumbs[p.id]} alt="" className="punch-thumb" />
                  )}
                  <div className="exec-list-main">
                    <strong>{p.punch_type === 'in' ? 'Ingreso' : 'Salida'}</strong>
                    <span>
                      {fmt(p.punched_at)} · ±{Math.round(p.accuracy_m || 0)} m
                      {String(p.device_note || '').includes('selfie_watermark')
                        ? ' · selfie OK'
                        : ''}
                      {p.site_name ? ` · ${p.site_name}` : ''}
                      {p.distance_m != null ? ` · a ${Math.round(p.distance_m)} m del origen` : ''}
                    </span>
                  </div>
                  {p.site_verified === true && (
                    <span className="pill status ok" title="Dentro del radio calibrado de la sede">
                      En sede
                    </span>
                  )}
                  <span className={`pill status ${p.punch_type === 'in' ? 'ok' : 'warn'}`}>
                    {p.punch_type === 'in' ? 'IN' : 'OUT'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
