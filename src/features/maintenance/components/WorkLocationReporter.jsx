/**
 * «¿Dónde estoy trabajando?»: sede, sitio y actividad (u OT). Lo ve el jefe en el
 * tablero del equipo al instante. Para salir de la sede se usa el traslado misional
 * (Misionales), que también queda aquí como «en traslado» y le llega a SST.
 * Lo usan el líder de mantenimiento y los auxiliares. 12-10-2026.
 */
import { useState } from 'react'

function currentCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 },
    )
  })
}

export default function WorkLocationReporter({ plants = [], myOrders = [], defaultSiteId = '', onReport, onNavigate, last = null }) {
  const [siteId, setSiteId] = useState(defaultSiteId || plants[0]?.id || '')
  const [place, setPlace] = useState('')
  const [activity, setActivity] = useState('')
  const [orderId, setOrderId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const send = async (status) => {
    setBusy(true)
    setMsg(null)
    const order = myOrders.find((o) => o.id === orderId)
    const coords = await currentCoords()
    const res = await onReport({
      status,
      siteId: status === 'fuera' ? null : siteId,
      place,
      activity: activity || (order ? `${order.code || 'OT'} · ${order.title}` : ''),
      workOrderId: order?.id || null,
      coords,
    })
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: status === 'fuera' ? 'Quedó registrado que terminaste el turno.' : 'Ubicación reportada: tu jefe ya la ve.' })
      setPlace('')
      setActivity('')
      setOrderId('')
    }
  }

  return (
    <section className="mt-card" aria-label="Mi lugar de trabajo">
      <div className="mt-card-head">
        <h3>📍 Mi lugar de trabajo</h3>
        {last && <span className="mt-dim">Último: {last.text}</span>}
      </div>
      <div className="mt-form">
        <label>
          Sede
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {plants.length === 0 && <option value="">— Sin sedes —</option>}
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sitio exacto
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ej. Sala de incubadoras, galpón 3, cuarto eléctrico" />
        </label>
        {myOrders.length > 0 && (
          <label>
            OT que estoy atendiendo
            <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">— Ninguna —</option>
              {myOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code || 'OT'} · {o.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Qué estoy haciendo
          <input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Ej. Revisión de ventiladores" />
        </label>
      </div>
      <div className="mt-actions">
        <button type="button" className="primary small" disabled={busy || !siteId} onClick={() => send('en_sitio')}>
          {busy ? 'Enviando…' : '📍 Estoy aquí'}
        </button>
        {onNavigate && (
          <button type="button" className="secondary small" disabled={busy} onClick={() => onNavigate('misionales')} title="Diligencia la inspección del vehículo con origen y destino: le llega a SST">
            🚗 Salgo en traslado misional
          </button>
        )}
        <button type="button" className="ghost small" disabled={busy} onClick={() => send('fuera')}>
          Terminé el turno
        </button>
      </div>
      {msg && <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`}>{msg.text}</p>}
    </section>
  )
}
