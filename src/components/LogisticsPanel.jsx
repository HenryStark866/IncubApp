/**
 * =============================================================================
 * ARCHIVO: src/components/LogisticsPanel.jsx
 * PROPÓSITO: Componente UI «LogisticsPanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useMemo, useState } from 'react'
import {
  useLogisticsFleet,
  ROUTE_STATUS,
  DELIVERY_STATUS,
  OPERATION_TYPES,
  CONTACT_KINDS,
} from '../hooks/useLogisticsFleet'
import { useRemittances, REMITTANCE_STATUS } from '../hooks/useRemittances'
import { useSalesOrders, ORDER_STATUS_LABEL } from '../hooks/useSalesOrders'
import { ROLE_LABEL, areaLabel } from '../lib/roles'
import { exportToExcel } from '../lib/exportExcel'
import { mapsUrl } from '../hooks/useOrgPresence'
import ListControls, { useListControls } from './ListControls'
import CoordinatorInventoryPanel from './CoordinatorInventoryPanel'
import WazeStyleMap from './WazeStyleMap'
import { useHighPrecisionGps } from '../hooks/useHighPrecisionGps'

const VIEWS = [
  { id: 'tablero', label: 'Tablero' },
  { id: 'conductores', label: 'Conductores' },
  { id: 'rutas', label: 'Rutas' },
  { id: 'entregas', label: 'Entregas' },
  { id: 'mapa', label: 'Mapa GPS' },
  { id: 'chat', label: 'Chat conductores' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'remisiones', label: 'Remisiones' },
  { id: 'inventario', label: 'Inventario' },
]

/**
 * Panel de Logística: flota, rutas, entregas, mapa en vivo, chat y contactos.
 */
export default function LogisticsPanel({
  orgId,
  userId,
  role,
  area,
  userName,
  presence,
}) {
  const fleet = useLogisticsFleet(orgId, userId)
  const remApi = useRemittances(orgId)
  const ordersApi = useSalesOrders(orgId)
  const [view, setView] = useState('tablero')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const [driverForm, setDriverForm] = useState(null)
  const [routeForm, setRouteForm] = useState(null)
  const [contactForm, setContactForm] = useState(null)
  const [chatDriverId, setChatDriverId] = useState(null)
  const [chatText, setChatText] = useState('')
  const [myDriverId, setMyDriverId] = useState(() => {
    try {
      return localStorage.getItem(`incubapp_my_driver_${orgId}`) || ''
    } catch {
      return ''
    }
  })

  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const readyOrders = useMemo(
    () => ordersApi.orders.filter((o) => ['confirmed', 'scheduled'].includes(o.status)),
    [ordersApi.orders]
  )

  // Si soy conductor (user_id vinculado), forzar GPS en ruta
  const linkedDriver = useMemo(
    () =>
      fleet.drivers.find((d) => d.user_id === userId) ||
      fleet.drivers.find((d) => d.id === myDriverId),
    [fleet.drivers, userId, myDriverId]
  )

  const precisionGps = useHighPrecisionGps({
    enabled: Boolean(linkedDriver && (linkedDriver.on_route || view === 'mapa')),
    onFix: (f) => {
      if (!linkedDriver?.id) return
      // Solo empujar a flota si estamos en ruta o hay fix excelente
      if (linkedDriver.on_route || (f.accuracy != null && f.accuracy <= 40)) {
        fleet.updateDriverGps(linkedDriver.id, {
          lat: f.lat,
          lng: f.lng,
          accuracy: f.accuracy,
          heading: f.heading,
          speed: f.speed,
        })
      }
    },
  })

  // Fusionar presencia de app con conductores (si user_id) + fix local de precisión
  const mapPoints = useMemo(() => {
    const pts = []
    for (const d of fleet.drivers) {
      let lat = d.last_lat
      let lng = d.last_lng
      let accuracy = null
      let heading = null
      let speed = null
      if (d.user_id && presence?.peers) {
        const p = presence.peers.find((x) => x.userId === d.user_id)
        if (p?.lat != null) {
          lat = p.lat
          lng = p.lng
          accuracy = p.accuracy
        }
      }
      // Override con rastreador de alta precisión si soy este conductor
      if (linkedDriver?.id === d.id && precisionGps.fix) {
        lat = precisionGps.fix.lat
        lng = precisionGps.fix.lng
        accuracy = precisionGps.fix.accuracy
        heading = precisionGps.fix.heading
        speed = precisionGps.fix.speed
      }
      if (lat != null && lng != null) {
        pts.push({
          id: d.id,
          name: d.full_name,
          lat,
          lng,
          on_route: d.on_route,
          plate: d.plate,
          phone: d.phone,
          accuracy,
          heading,
          speed,
        })
      }
    }
    return pts
  }, [fleet.drivers, presence?.peers, linkedDriver?.id, precisionGps.fix])

  const mapPlants = useMemo(
    () =>
      fleet.plants
        .filter((p) => p.geo_origin_lat != null && p.geo_origin_lng != null)
        .map((p) => ({
          id: p.id,
          name: p.name,
          lat: p.geo_origin_lat,
          lng: p.geo_origin_lng,
        })),
    [fleet.plants]
  )

  const mapRoutes = useMemo(() => {
    // Polilíneas simples: orden de paradas con coordenadas o GPS planta
    return fleet.routes
      .filter((r) => r.status === 'en_route' || r.status === 'planned')
      .map((r) => {
        const stops = fleet.deliveriesByRoute(r.id)
        const positions = []
        for (const s of stops) {
          if (s.lat != null && s.lng != null) positions.push([s.lat, s.lng])
        }
        if (r.plant_lat != null && r.plant_lng != null) {
          positions.push([r.plant_lat, r.plant_lng])
        }
        return {
          id: r.id,
          color: r.status === 'en_route' ? '#00e5a8' : '#33b5ff',
          positions,
        }
      })
      .filter((r) => r.positions.length >= 2)
  }, [fleet.routes, fleet.deliveriesByRoute])

  const driverLc = useListControls(
    fleet.drivers,
    (d, q) =>
      `${d.full_name} ${d.phone || ''} ${d.plate || ''} ${d.vehicle || ''}`
        .toLowerCase()
        .includes(q),
    20
  )
  const contactLc = useListControls(
    fleet.contacts,
    (c, q) =>
      `${c.name} ${c.kind} ${c.phone || ''} ${c.city || ''}`.toLowerCase().includes(q),
    20
  )

  const saveDriver = async () => {
    setBusy(true)
    setMsg(null)
    const res = await fleet.saveDriver(driverForm, driverForm.id || null)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: driverForm.id ? 'Conductor actualizado' : 'Conductor creado' })
      setDriverForm(null)
    }
  }

  const saveRoute = async () => {
    setBusy(true)
    setMsg(null)
    const res = await fleet.saveRoute(routeForm, routeForm.id || null)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: 'Ruta guardada' })
      setRouteForm(null)
    }
  }

  const saveContact = async () => {
    setBusy(true)
    const res = await fleet.saveContact(contactForm, contactForm.id || null)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: 'Contacto guardado' })
      setContactForm(null)
    }
  }

  const openChat = async (driverId) => {
    setChatDriverId(driverId)
    setView('chat')
    await fleet.loadMessages(driverId)
  }

  const sendChat = async () => {
    if (!chatDriverId) return
    setBusy(true)
    const res = await fleet.sendDriverMessage(chatDriverId, chatText)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else setChatText('')
  }

  const exportDrivers = async () => {
    await exportToExcel('conductores-logistica', [
      {
        name: 'Conductores',
        rows: fleet.drivers.map((d) => ({
          Nombre: d.full_name,
          Teléfono: d.phone || '',
          Placa: d.plate || '',
          Vehículo: d.vehicle || '',
          Licencia: d.license_id || '',
          En_ruta: d.on_route ? 'Sí' : 'No',
          Activo: d.active ? 'Sí' : 'No',
          Última_lat: d.last_lat ?? '',
          Última_lng: d.last_lng ?? '',
        })),
      },
    ], {
      title: 'Conductores y flota · Logística',
      module: 'Logística',
    })
  }

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>Logística</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {first ? `${first} · ` : ''}
            {ROLE_LABEL[role] ?? role}
            {area ? ` · ${areaLabel(area)}` : ''}
            · rutas · flota · GPS · contactos
          </p>
        </div>
      </div>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {fleet.localMode && (
        <p className="msg ok">
          Flota en modo local hasta publicar <code>supabase_migration_logistics_fleet.sql</code>.
        </p>
      )}
      {fleet.error && !fleet.localMode && <p className="msg error">{fleet.error}</p>}

      {linkedDriver?.on_route && (
        <p className="msg ok">
          <strong>GPS en ruta activo</strong> para {linkedDriver.full_name}. La llegada a planta /
          paradas se registra automáticamente al entrar en geocerca.
        </p>
      )}

      <div className="tabs" role="tablist" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={view === v.id ? 'tab active' : 'tab'}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* ══ TABLERO ══ */}
      {view === 'tablero' && (
        <>
          <div className="kpi-grid" style={{ marginTop: 14 }}>
            <div className="kpi-card">
              <span className="kpi-value">{fleet.drivers.filter((d) => d.active).length}</span>
              <span className="kpi-label">Conductores activos</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value">{fleet.routes.filter((r) => r.status === 'en_route').length}</span>
              <span className="kpi-label">Rutas en curso</span>
            </div>
            <div className={`kpi-card${readyOrders.length ? ' warn' : ''}`}>
              <span className="kpi-value">{readyOrders.length}</span>
              <span className="kpi-label">Pedidos por despachar</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value">{mapPoints.length}</span>
              <span className="kpi-label">Con GPS visible</span>
            </div>
          </div>
          <div className="actions row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="primary small" onClick={() => setView('rutas')}>
              Gestionar rutas
            </button>
            <button type="button" className="ghost small" onClick={() => setView('mapa')}>
              Mapa en vivo
            </button>
            <button type="button" className="ghost small" onClick={() => setView('conductores')}>
              Conductores
            </button>
            <button type="button" className="ghost small" onClick={() => fleet.reload()}>
              Actualizar
            </button>
          </div>
          <h3 className="section-title" style={{ margin: '16px 0 8px' }}>
            Rutas activas / planificadas
          </h3>
          {fleet.activeRoutes.length === 0 ? (
            <p className="hint">No hay rutas planificadas o en curso.</p>
          ) : (
            <div className="admin-list">
              {fleet.activeRoutes.map((r) => {
                const dr = fleet.drivers.find((d) => d.id === r.driver_id)
                return (
                  <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                    <div className="admin-row-main">
                      <strong>
                        {r.code} · {r.name}
                      </strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {ROUTE_STATUS[r.status]} · {dr?.full_name || 'Sin conductor'} ·{' '}
                        {fleet.deliveriesByRoute(r.id).length} paradas
                      </span>
                    </div>
                    {r.status === 'planned' && (
                      <button
                        type="button"
                        className="primary small"
                        onClick={async () => {
                          const res = await fleet.setRouteStatus(r.id, 'en_route')
                          if (res.error) setMsg({ kind: 'error', text: res.error })
                          else
                            setMsg({
                              kind: 'ok',
                              text: 'Ruta iniciada. El conductor debe tener GPS activo.',
                            })
                        }}
                      >
                        Iniciar ruta
                      </button>
                    )}
                    {r.status === 'en_route' && (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => fleet.setRouteStatus(r.id, 'completed')}
                      >
                        Cerrar ruta
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══ CONDUCTORES ══ */}
      {view === 'conductores' && (
        <>
          <div className="actions row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="primary small"
              onClick={() =>
                setDriverForm({
                  full_name: '',
                  phone: '',
                  license_id: '',
                  vehicle: '',
                  plate: '',
                  active: true,
                  notes: '',
                })
              }
            >
              + Conductor
            </button>
            <button type="button" className="ghost small" onClick={exportDrivers}>
              Excel
            </button>
            <label className="hint" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              Yo soy conductor:
              <select
                value={myDriverId}
                onChange={(e) => {
                  setMyDriverId(e.target.value)
                  try {
                    localStorage.setItem(`incubapp_my_driver_${orgId}`, e.target.value)
                  } catch {
                    /* */
                  }
                }}
              >
                <option value="">—</option>
                {fleet.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {driverForm && (
            <div className="inline-form compact" style={{ marginTop: 12 }}>
              <div className="two-col">
                <label>
                  Nombre *
                  <input
                    value={driverForm.full_name}
                    onChange={(e) => setDriverForm((f) => ({ ...f, full_name: e.target.value }))}
                    autoFocus
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    value={driverForm.phone}
                    onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </label>
                <label>
                  Licencia
                  <input
                    value={driverForm.license_id}
                    onChange={(e) => setDriverForm((f) => ({ ...f, license_id: e.target.value }))}
                  />
                </label>
                <label>
                  Vehículo
                  <input
                    value={driverForm.vehicle}
                    onChange={(e) => setDriverForm((f) => ({ ...f, vehicle: e.target.value }))}
                  />
                </label>
                <label>
                  Placa
                  <input
                    value={driverForm.plate}
                    onChange={(e) => setDriverForm((f) => ({ ...f, plate: e.target.value }))}
                  />
                </label>
                <label>
                  Notas
                  <input
                    value={driverForm.notes}
                    onChange={(e) => setDriverForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </div>
              <div className="actions row">
                <button type="button" className="primary small" onClick={saveDriver} disabled={busy}>
                  Guardar
                </button>
                <button type="button" className="ghost" onClick={() => setDriverForm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <ListControls lc={driverLc} placeholder="Buscar conductor…" />
          <div className="admin-list" style={{ marginTop: 8 }}>
            {driverLc.visible.map((d) => (
              <div key={d.id} className="admin-row" style={{ margin: 0, flexWrap: 'wrap' }}>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>
                    {d.full_name}
                    {d.on_route ? ' · EN RUTA' : ''}
                    {!d.active ? ' · inactivo' : ''}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {[d.phone, d.plate, d.vehicle, d.license_id && `Lic. ${d.license_id}`]
                      .filter(Boolean)
                      .join(' · ')}
                    {d.last_lat != null &&
                      ` · GPS ${Number(d.last_lat).toFixed(4)}, ${Number(d.last_lng).toFixed(4)}`}
                  </span>
                </div>
                <span className="admin-row-actions" style={{ flexWrap: 'wrap' }}>
                  {d.last_lat != null && (
                    <a
                      className="ghost small"
                      href={mapsUrl(d.last_lat, d.last_lng)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      Mapa
                    </a>
                  )}
                  <button type="button" className="ghost small" onClick={() => openChat(d.id)}>
                    Chat
                  </button>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() =>
                      setDriverForm({
                        id: d.id,
                        full_name: d.full_name || '',
                        phone: d.phone || '',
                        license_id: d.license_id || '',
                        vehicle: d.vehicle || '',
                        plate: d.plate || '',
                        active: d.active !== false,
                        notes: d.notes || '',
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="ghost small danger"
                    onClick={async () => {
                      if (!window.confirm(`¿Eliminar conductor ${d.full_name}?`)) return
                      await fleet.deleteDriver(d.id)
                    }}
                  >
                    Borrar
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══ RUTAS ══ */}
      {view === 'rutas' && (
        <>
          <div className="actions row" style={{ marginTop: 12, gap: 8 }}>
            <button
              type="button"
              className="primary small"
              onClick={() =>
                setRouteForm({
                  name: '',
                  driver_id: fleet.drivers[0]?.id || '',
                  plant_id: fleet.plants[0]?.id || '',
                  notes: '',
                  stops: [
                    {
                      operation_type: 'delivery',
                      label: 'Entrega 1',
                      address: '',
                      customer_name: '',
                    },
                    {
                      operation_type: 'plant_return',
                      label: 'Regreso a planta',
                      address: 'Planta',
                    },
                  ],
                })
              }
            >
              + Nueva ruta
            </button>
          </div>

          {routeForm && (
            <div className="inline-form compact" style={{ marginTop: 12 }}>
              <div className="two-col">
                <label>
                  Nombre de la ruta *
                  <input
                    value={routeForm.name}
                    onChange={(e) => setRouteForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ruta norte AM"
                    autoFocus
                  />
                </label>
                <label>
                  Conductor
                  <select
                    value={routeForm.driver_id}
                    onChange={(e) => setRouteForm((f) => ({ ...f, driver_id: e.target.value }))}
                  >
                    <option value="">—</option>
                    {fleet.drivers
                      .filter((d) => d.active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name}
                          {d.plate ? ` · ${d.plate}` : ''}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Planta de regreso (geocerca GPS)
                  <select
                    value={routeForm.plant_id}
                    onChange={(e) => setRouteForm((f) => ({ ...f, plant_id: e.target.value }))}
                  >
                    <option value="">—</option>
                    {fleet.plants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.geo_origin_lat != null ? ' · GPS calibrado' : ' · sin GPS'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Notas
                  <input
                    value={routeForm.notes}
                    onChange={(e) => setRouteForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </div>
              <p className="hint" style={{ margin: '8px 0' }}>
                Paradas (tipo de operación, dirección). La llegada a planta se detecta por GPS si la
                sede tiene origen GPS calibrado.
              </p>
              {(routeForm.stops || []).map((s, i) => (
                <div key={i} className="two-col" style={{ marginBottom: 8 }}>
                  <label>
                    Tipo de operación
                    <select
                      value={s.operation_type}
                      onChange={(e) => {
                        const stops = [...routeForm.stops]
                        stops[i] = { ...stops[i], operation_type: e.target.value }
                        setRouteForm((f) => ({ ...f, stops }))
                      }}
                    >
                      {OPERATION_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Etiqueta
                    <input
                      value={s.label}
                      onChange={(e) => {
                        const stops = [...routeForm.stops]
                        stops[i] = { ...stops[i], label: e.target.value }
                        setRouteForm((f) => ({ ...f, stops }))
                      }}
                    />
                  </label>
                  <label>
                    Cliente
                    <input
                      value={s.customer_name || ''}
                      onChange={(e) => {
                        const stops = [...routeForm.stops]
                        stops[i] = { ...stops[i], customer_name: e.target.value }
                        setRouteForm((f) => ({ ...f, stops }))
                      }}
                    />
                  </label>
                  <label>
                    Dirección
                    <input
                      value={s.address || ''}
                      onChange={(e) => {
                        const stops = [...routeForm.stops]
                        stops[i] = { ...stops[i], address: e.target.value }
                        setRouteForm((f) => ({ ...f, stops }))
                      }}
                    />
                  </label>
                </div>
              ))}
              <div className="actions row">
                <button
                  type="button"
                  className="ghost small"
                  onClick={() =>
                    setRouteForm((f) => ({
                      ...f,
                      stops: [
                        ...(f.stops || []),
                        { operation_type: 'delivery', label: `Parada ${(f.stops?.length || 0) + 1}` },
                      ],
                    }))
                  }
                >
                  + Parada
                </button>
                <button type="button" className="primary small" onClick={saveRoute} disabled={busy}>
                  Guardar ruta
                </button>
                <button type="button" className="ghost" onClick={() => setRouteForm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="admin-list" style={{ marginTop: 12 }}>
            {fleet.routes.map((r) => {
              const dr = fleet.drivers.find((d) => d.id === r.driver_id)
              const stops = fleet.deliveriesByRoute(r.id)
              return (
                <div key={r.id} className="admin-card" style={{ marginBottom: 8 }}>
                  <div className="admin-row" style={{ margin: 0, border: 'none' }}>
                    <div className="admin-row-main">
                      <strong>
                        {r.code} · {r.name}
                      </strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {ROUTE_STATUS[r.status]} · {dr?.full_name || 'Sin conductor'} · {stops.length}{' '}
                        paradas
                      </span>
                    </div>
                    <span className="admin-row-actions">
                      {r.status === 'planned' && (
                        <button
                          type="button"
                          className="primary small"
                          onClick={() => fleet.setRouteStatus(r.id, 'en_route')}
                        >
                          Iniciar
                        </button>
                      )}
                      {r.status === 'en_route' && (
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => fleet.setRouteStatus(r.id, 'completed')}
                        >
                          Completar
                        </button>
                      )}
                      <button
                        type="button"
                        className="ghost small danger"
                        onClick={async () => {
                          if (!window.confirm('¿Eliminar ruta?')) return
                          await fleet.deleteRoute(r.id)
                        }}
                      >
                        Borrar
                      </button>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ══ ENTREGAS ══ */}
      {view === 'entregas' && (
        <>
          <p className="hint" style={{ marginTop: 12 }}>
            Reporte de <strong>salida</strong> del lugar y tipo de operación. La llegada a planta se
            marca sola cuando el GPS del conductor entra en la geocerca de la sede.
          </p>
          {fleet.routes.filter((r) => r.status === 'en_route').length === 0 && (
            <p className="hint">Inicie una ruta para gestionar entregas en vivo.</p>
          )}
          {fleet.routes
            .filter((r) => r.status === 'en_route' || r.status === 'planned')
            .map((r) => (
              <div key={r.id} style={{ marginTop: 12 }}>
                <h3 className="section-title" style={{ margin: '0 0 8px' }}>
                  {r.code} · {r.name}
                </h3>
                <div className="admin-list">
                  {fleet.deliveriesByRoute(r.id).map((s) => (
                    <div key={s.id} className="admin-row compact" style={{ margin: 0 }}>
                      <div className="admin-row-main">
                        <strong>
                          #{s.sequence} {s.label || 'Parada'} ·{' '}
                          {OPERATION_TYPES.find((o) => o.value === s.operation_type)?.label ||
                            s.operation_type}
                        </strong>
                        <span className="hint" style={{ margin: 0 }}>
                          {[
                            DELIVERY_STATUS[s.status],
                            s.customer_name,
                            s.address,
                            s.departed_at &&
                              `Salida ${new Date(s.departed_at).toLocaleTimeString('es-CO')}`,
                            s.arrived_at &&
                              `Llegada ${new Date(s.arrived_at).toLocaleTimeString('es-CO')}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <span className="admin-row-actions">
                        {s.status === 'pending' && (
                          <button
                            type="button"
                            className="primary small"
                            onClick={() => fleet.reportDeparture(s.id)}
                          >
                            Reportar salida
                          </button>
                        )}
                        {s.status !== 'arrived' && s.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() => fleet.markArrived(s.id, 'manual')}
                          >
                            Marcar llegada
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </>
      )}

      {/* ══ MAPA ══ */}
      {view === 'mapa' && (
        <>
          <p className="hint" style={{ marginTop: 12 }}>
            Mapa estilo Waze con modo satélite realista. El rastreador usa{' '}
            <strong>GNSS de alta precisión</strong> (el dispositivo combina todas las
            constelaciones disponibles: GPS, GLONASS, Galileo, BeiDou, etc.), varias lecturas en
            paralelo y elige la de menor error. En ruta el GPS se mantiene activo.
          </p>

          <div className="kpi-grid" style={{ marginTop: 10 }}>
            <div className="kpi-card">
              <span className="kpi-value" style={{ fontSize: 18 }}>
                {precisionGps.accuracyLabel}
              </span>
              <span className="kpi-label">Precisión actual</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value" style={{ fontSize: 18 }}>
                {precisionGps.quality || '—'}
              </span>
              <span className="kpi-label">Calidad fix</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value" style={{ fontSize: 18 }}>
                {precisionGps.speedKmh != null ? `${precisionGps.speedKmh}` : '—'}
              </span>
              <span className="kpi-label">km/h</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value" style={{ fontSize: 18 }}>
                {precisionGps.running ? 'ON' : 'OFF'}
              </span>
              <span className="kpi-label">Rastreador multi-GNSS</span>
            </div>
          </div>

          <div className="actions row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
            {!precisionGps.running ? (
              <button type="button" className="primary small" onClick={() => precisionGps.start()}>
                Activar GPS máxima precisión
              </button>
            ) : (
              <button type="button" className="ghost small" onClick={() => precisionGps.stop()}>
                Pausar rastreador
              </button>
            )}
            <button
              type="button"
              className="ghost small"
              onClick={async () => {
                const f = await precisionGps.burst()
                if (f && linkedDriver?.id) {
                  await fleet.updateDriverGps(linkedDriver.id, {
                    lat: f.lat,
                    lng: f.lng,
                    accuracy: f.accuracy,
                  })
                  setMsg({
                    kind: 'ok',
                    text: `Fix multi-lectura: ${f.quality} (${Math.round(f.accuracy || 0)} m)`,
                  })
                }
              }}
            >
              Ráfaga 4 lecturas en paralelo
            </button>
            {precisionGps.error && (
              <span className="msg error" style={{ margin: 0 }}>
                {precisionGps.error}
              </span>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <WazeStyleMap
              points={mapPoints}
              plants={mapPlants}
              routes={mapRoutes}
              followId={linkedDriver?.on_route ? linkedDriver.id : null}
              height={460}
            />
          </div>

          <div className="admin-list" style={{ marginTop: 12 }}>
            {mapPoints.map((p) => (
              <div key={p.id} className="admin-row compact" style={{ margin: 0 }}>
                <div className="admin-row-main">
                  <strong>
                    {p.name}
                    {p.on_route ? ' · EN RUTA' : ''}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                    {p.accuracy != null ? ` · ±${Math.round(p.accuracy)} m` : ''}
                    {p.speed != null && p.speed >= 0
                      ? ` · ${Math.round(p.speed * 3.6)} km/h`
                      : ''}
                    {p.plate ? ` · ${p.plate}` : ''}
                  </span>
                </div>
                <a
                  className="primary small"
                  href={mapsUrl(p.lat, p.lng)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  Navegar
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══ CHAT ══ */}
      {view === 'chat' && (
        <>
          <div className="two-col" style={{ marginTop: 12 }}>
            <label>
              Conductor
              <select
                value={chatDriverId || ''}
                onChange={async (e) => {
                  setChatDriverId(e.target.value)
                  await fleet.loadMessages(e.target.value)
                }}
              >
                <option value="">Seleccionar…</option>
                {fleet.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {chatDriverId && (
            <>
              <div
                className="admin-list"
                style={{
                  marginTop: 10,
                  maxHeight: 280,
                  overflow: 'auto',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: 8,
                }}
              >
                {fleet.messages.length === 0 ? (
                  <p className="hint">Sin mensajes. Escriba al conductor.</p>
                ) : (
                  fleet.messages.map((m) => (
                    <div key={m.id} className="admin-row compact" style={{ margin: '0 0 6px' }}>
                      <div className="admin-row-main">
                        <strong>{m.sender_role === 'logistics' ? 'Logística' : 'Conductor'}</strong>
                        <span className="hint" style={{ margin: 0 }}>
                          {m.body}
                        </span>
                        <span className="hint" style={{ margin: 0, fontSize: '0.7rem' }}>
                          {m.created_at
                            ? new Date(m.created_at).toLocaleString('es-CO')
                            : ''}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="actions row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                <input
                  style={{ flex: 1, minWidth: 180 }}
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Mensaje al conductor…"
                  onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                />
                <button type="button" className="primary small" onClick={sendChat} disabled={busy}>
                  Enviar
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* ══ CONTACTOS ══ */}
      {view === 'contactos' && (
        <>
          <div className="actions row" style={{ marginTop: 12, gap: 8 }}>
            <button
              type="button"
              className="primary small"
              onClick={() =>
                setContactForm({
                  name: '',
                  kind: 'mechanic',
                  phone: '',
                  email: '',
                  city: '',
                  notes: '',
                })
              }
            >
              + Contacto
            </button>
          </div>
          {contactForm && (
            <div className="inline-form compact" style={{ marginTop: 10 }}>
              <div className="two-col">
                <label>
                  Nombre *
                  <input
                    value={contactForm.name}
                    onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={contactForm.kind}
                    onChange={(e) => setContactForm((f) => ({ ...f, kind: e.target.value }))}
                  >
                    {CONTACT_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Teléfono
                  <input
                    value={contactForm.phone}
                    onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </label>
                <label>
                  Correo
                  <input
                    value={contactForm.email}
                    onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <label>
                  Ciudad
                  <input
                    value={contactForm.city}
                    onChange={(e) => setContactForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </label>
                <label>
                  Notas
                  <input
                    value={contactForm.notes}
                    onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </div>
              <div className="actions row">
                <button type="button" className="primary small" onClick={saveContact} disabled={busy}>
                  Guardar
                </button>
                <button type="button" className="ghost" onClick={() => setContactForm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <ListControls lc={contactLc} placeholder="Buscar mecánico, proveedor…" />
          <div className="admin-list" style={{ marginTop: 8 }}>
            {contactLc.visible.map((c) => (
              <div key={c.id} className="admin-row compact" style={{ margin: 0 }}>
                <div className="admin-row-main">
                  <strong>
                    {c.name} · {CONTACT_KINDS.find((k) => k.value === c.kind)?.label || c.kind}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {[c.phone, c.email, c.city].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className="admin-row-actions">
                  {c.phone && (
                    <a className="ghost small" href={`tel:${c.phone}`} style={{ textDecoration: 'none' }}>
                      Llamar
                    </a>
                  )}
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() =>
                      setContactForm({
                        id: c.id,
                        name: c.name || '',
                        kind: c.kind || 'other',
                        phone: c.phone || '',
                        email: c.email || '',
                        city: c.city || '',
                        notes: c.notes || '',
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="ghost small danger"
                    onClick={() => fleet.deleteContact(c.id)}
                  >
                    Borrar
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══ REMISIONES (compact) ══ */}
      {view === 'remisiones' && (
        <>
          <p className="hint" style={{ marginTop: 12 }}>
            Pedidos confirmados por ventas listos para remisión / despacho.
          </p>
          {readyOrders.length === 0 ? (
            <p className="hint">No hay pedidos confirmados pendientes.</p>
          ) : (
            <div className="admin-list" style={{ marginTop: 8 }}>
              {readyOrders.map((o) => (
                <div key={o.id} className="admin-row compact" style={{ margin: 0 }}>
                  <div className="admin-row-main">
                    <strong>
                      {o.customers?.name} · {o.code}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {ORDER_STATUS_LABEL[o.status]} ·{' '}
                      {(Number(o.qty_females) || 0) + (Number(o.qty_males) || 0)} und
                    </span>
                  </div>
                  <button
                    type="button"
                    className="primary small"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      const res = await remApi.createFromOrder({
                        order: o,
                        userId,
                        dispatch_date: new Date().toLocaleDateString('sv-SE'),
                      })
                      if (!res.error) await ordersApi.updateStatus(o.id, 'dispatched')
                      setBusy(false)
                      if (res.error) setMsg({ kind: 'error', text: res.error })
                      else setMsg({ kind: 'ok', text: 'Remisión creada y pedido despachado' })
                    }}
                  >
                    Remisión
                  </button>
                </div>
              ))}
            </div>
          )}
          <h3 className="section-title" style={{ margin: '16px 0 8px' }}>
            Remisiones recientes
          </h3>
          <div className="admin-list">
            {remApi.remittances.slice(0, 15).map((r) => (
              <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                <div className="admin-row-main">
                  <strong>
                    {r.code} · {r.customers?.name}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {REMITTANCE_STATUS[r.status] || r.status} · {r.dispatch_date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══ INVENTARIO ══ */}
      {view === 'inventario' && (
        <div style={{ marginTop: 12 }}>
          <CoordinatorInventoryPanel
            orgId={orgId}
            userId={userId}
            area={area || 'logistics'}
            userName={userName}
            canManage
          />
        </div>
      )}
    </div>
  )
}
