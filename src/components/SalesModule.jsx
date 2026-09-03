/**
 * =============================================================================
 * ARCHIVO: src/components/SalesModule.jsx
 * PROPÓSITO: Componente UI «SalesModule»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useMemo, useState } from 'react'
import { useClients } from '../hooks/useClients'
import { useSalesOrders, ORDER_STATUS_LABEL, ORDER_STATUS_NEXT } from '../hooks/useSalesOrders'
import { useRemittances, REMITTANCE_STATUS } from '../hooks/useRemittances'
import { ROLE_LABEL, areaLabel } from '../lib/roles'
import { exportToExcel } from '../lib/exportExcel'
import ListControls, { useListControls } from './ListControls'
import InventoryModule from './InventoryModule'
import SiesaAccountingPanel from './SiesaAccountingPanel'
import {
  getSiesaConfig,
  enqueueMany,
  buildQueueFromDomain,
  runSiesaSync,
} from '../lib/siesa'

const emptyClient = {
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  city: '',
  department: '',
  address: '',
  website: '',
  nit: '',
  code: '',
  status: 'prospect',
  product_interest: 'day_old_chicks',
  buys_day_old_chicks: true,
  farm_type: '',
  capacity_birds: '',
  notes: '',
}

const emptyOrder = {
  customerId: '',
  qty_females: '',
  qty_males: '',
  unit_price: '',
  requested_date: '',
  delivery_date: '',
  delivery_address: '',
  notes: '',
}

/**
 * Perfil operativo (Ventas y Logística son áreas separadas):
 * - sales: coord./aux. ventas — clientes, pedidos, Excel contable
 * - logistics: coord./aux. logística — remisiones y despacho
 * - full: owner/admin/gerencia (ve ambos flujos)
 * - accounting: cruce Excel
 *
 * @param {{ forceProfile?: 'sales'|'logistics'|'full'|'accounting' }} [opts]
 */
export function salesWorkProfile(role, area, opts = {}) {
  if (opts.forceProfile) return opts.forceProfile
  if (role === 'accounting_auxiliary' || (role === 'coordinator' && area === 'accounting')) {
    return 'accounting'
  }
  if (role === 'logistics_auxiliary') return 'logistics'
  if (role === 'sales_logistics_auxiliary') return 'sales'
  if (role === 'coordinator' && area === 'logistics') return 'logistics'
  if (role === 'coordinator' && (area === 'sales' || area === 'sales_logistics')) return 'sales'
  if (['owner', 'admin', 'management'].includes(role)) return 'full'
  return 'sales'
}

const PROFILE_META = {
  sales: {
    title: 'Ventas',
    blurb:
      'Área de ventas (separada de logística): clientes verificados, pedidos y Excel contable. El despacho lo hace Logística.',
    tabs: ['pedidos', 'clientes', 'contable', 'inventarios'],
  },
  logistics: {
    title: 'Logística',
    blurb:
      'Área de logística (separada de ventas): remisiones y despacho a partir de pedidos ya confirmados por ventas.',
    tabs: ['remisiones', 'pedidos', 'inventarios'],
  },
  accounting: {
    title: 'Cruce contable (ventas)',
    blurb:
      'Cruce con Siesa y Excel: remisiones, pedidos y terceros. Marque lo exportado o sincronice al ERP contable.',
    tabs: ['contable', 'remisiones', 'inventarios'],
  },
  full: {
    title: 'Ventas + Logística (dirección)',
    blurb:
      'Vista de dirección: ventas (pedidos) y logística (remisiones) son áreas distintas; aquí se ven ambas.',
    tabs: ['pedidos', 'remisiones', 'clientes', 'contable', 'inventarios'],
  },
}

const TAB_LABEL = {
  pedidos: 'Pedidos',
  remisiones: 'Remisiones',
  clientes: 'Clientes',
  contable: 'Contable / Siesa',
  inventarios: 'Inventarios',
}

/**
 * Módulo comercial por perfil de usuario.
 * @param {{ forceProfile?: 'sales'|'logistics'|'full'|'accounting' }} [props]
 */
export default function SalesModule({ orgId, userId, role, area, userName, forceProfile }) {
  const profile = salesWorkProfile(role, area, { forceProfile })
  const meta = PROFILE_META[profile]
  const clientsApi = useClients(orgId)
  const ordersApi = useSalesOrders(orgId)
  const remApi = useRemittances(orgId)

  const [view, setView] = useState(meta.tabs[0])
  const [form, setForm] = useState(null)
  const [orderForm, setOrderForm] = useState(null)
  const [remForm, setRemForm] = useState(null) // { orderId, vehicle, driver, notes }
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const titleRole = ROLE_LABEL[role] ?? role

  // Pedidos del cliente: solo activos (verificados) o los que ya están en curso
  const verifiedClients = useMemo(
    () => clientsApi.clients.filter((c) => c.status === 'active'),
    [clientsApi.clients]
  )

  const requestedOrders = useMemo(
    () => ordersApi.orders.filter((o) => o.status === 'requested'),
    [ordersApi.orders]
  )
  const readyToRemit = useMemo(
    () => ordersApi.orders.filter((o) => ['confirmed', 'scheduled'].includes(o.status)),
    [ordersApi.orders]
  )

  const lc = useListControls(
    clientsApi.filtered,
    (c, q) =>
      `${c.name} ${c.city || ''} ${c.phone || ''} ${c.contact_name || ''}`
        .toLowerCase()
        .includes(q),
    12
  )
  const orderLc = useListControls(
    ordersApi.orders,
    (o, q) => {
      const name = o.customers?.name || ''
      return `${name} ${o.code || ''} ${o.status}`.toLowerCase().includes(q)
    },
    12
  )
  const remLc = useListControls(
    remApi.remittances,
    (r, q) =>
      `${r.code} ${r.customers?.name || ''} ${r.driver_name || ''} ${r.status}`
        .toLowerCase()
        .includes(q),
    12
  )

  const openNew = () => {
    setMsg(null)
    setForm({ ...emptyClient })
  }
  const openEdit = (c) => {
    setMsg(null)
    setForm({
      id: c.id,
      name: c.name || '',
      contact_name: c.contact_name || '',
      email: c.email || '',
      phone: c.phone || '',
      city: c.city || '',
      department: c.department || '',
      address: c.address || '',
      website: c.website || '',
      nit: c.nit || '',
      code: c.code || '',
      status: c.status || 'prospect',
      product_interest: c.product_interest || 'day_old_chicks',
      buys_day_old_chicks: c.buys_day_old_chicks !== false,
      farm_type: c.farm_type || '',
      capacity_birds: c.capacity_birds ?? '',
      notes: c.notes || '',
    })
  }

  const save = async () => {
    if (!form) return
    setBusy(true)
    setMsg(null)
    const { id, ...payload } = form
    const res = await clientsApi.saveClient(payload, id || null)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: id ? 'Cliente actualizado' : 'Cliente creado' })
      setForm(null)
    }
  }

  const openOrderFor = (customerId) => {
    setView('pedidos')
    setOrderForm({ ...emptyOrder, customerId: customerId || '' })
    setMsg(null)
  }

  const saveOrder = async () => {
    if (!orderForm) return
    setBusy(true)
    setMsg(null)
    const cust = clientsApi.clients.find((c) => c.id === orderForm.customerId)
    if (cust && cust.status !== 'active' && profile === 'sales') {
      setBusy(false)
      setMsg({
        kind: 'error',
        text: 'Solo se toman pedidos de clientes verificados (estado Activo). Verifique la ficha primero.',
      })
      return
    }
    const res = await ordersApi.createOrder({
      ...orderForm,
      created_by: userId,
      status: 'confirmed',
    })
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: 'Pedido registrado — listo para logística' })
      setOrderForm(null)
      clientsApi.reload()
    }
  }

  const confirmRequested = async (orderId) => {
    setBusy(true)
    const res = await ordersApi.updateStatus(orderId, 'confirmed', { confirmed_by: userId })
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else setMsg({ kind: 'ok', text: 'Pedido confirmado. Logística puede generar la remisión.' })
  }

  const openRemit = (order) => {
    setRemForm({
      orderId: order.id,
      vehicle: '',
      driver_name: '',
      notes: '',
      dispatch_date: new Date().toLocaleDateString('sv-SE'),
    })
    setView('remisiones')
    setMsg(null)
  }

  const saveRemittance = async () => {
    if (!remForm) return
    const order = ordersApi.orders.find((o) => o.id === remForm.orderId)
    if (!order) {
      setMsg({ kind: 'error', text: 'Pedido no encontrado' })
      return
    }
    setBusy(true)
    setMsg(null)
    const res = await remApi.createFromOrder({
      order,
      userId,
      vehicle: remForm.vehicle,
      driver_name: remForm.driver_name,
      notes: remForm.notes,
      dispatch_date: remForm.dispatch_date,
    })
    if (!res.error) {
      await ordersApi.updateStatus(order.id, 'dispatched')
    }
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: 'Remisión creada y pedido marcado como despachado' })
      setRemForm(null)
    }
  }

  const exportAccounting = async (onlyPending = true) => {
    const list = onlyPending
      ? remApi.pendingAccounting
      : remApi.remittances.filter((r) => r.status !== 'cancelled')
    if (!list.length) {
      setMsg({ kind: 'error', text: 'No hay remisiones para exportar' })
      return
    }
    const rows = list.map((r) => {
      const total = (Number(r.qty_females) || 0) + (Number(r.qty_males) || 0)
      const price = Number(r.sales_orders?.unit_price) || 0
      return {
        Remisión: r.code,
        Pedido: r.sales_orders?.code || '',
        Cliente: r.customers?.name || '',
        NIT: r.customers?.nit || '',
        Ciudad: r.customers?.city || '',
        Contacto: r.customers?.contact_name || '',
        Teléfono: r.customers?.phone || '',
        Fecha_despacho: r.dispatch_date,
        Hembras: r.qty_females,
        Machos: r.qty_males,
        Total_unidades: total,
        Precio_unitario: price,
        Valor_estimado: price ? price * total : '',
        Dirección: r.delivery_address || '',
        Vehículo: r.vehicle || '',
        Conductor: r.driver_name || '',
        Estado: REMITTANCE_STATUS[r.status] || r.status,
        Exportado_antes: r.accounting_exported_at
          ? new Date(r.accounting_exported_at).toLocaleString('es-CO')
          : 'No',
        Notas: r.notes || '',
      }
    })
    const orderRows = ordersApi.orders
      .filter((o) => ['confirmed', 'scheduled', 'dispatched', 'delivered'].includes(o.status))
      .map((o) => ({
        Pedido: o.code,
        Cliente: o.customers?.name || '',
        Estado: ORDER_STATUS_LABEL[o.status] || o.status,
        Hembras: o.qty_females,
        Machos: o.qty_males,
        Precio: o.unit_price,
        Fecha_solicitud: o.requested_date || '',
        Fecha_entrega: o.delivery_date || '',
        Dirección: o.delivery_address || '',
      }))

    const res = await exportToExcel(
      'cruce-contable-ventas',
      [
        { name: 'Remisiones', rows },
        { name: 'Pedidos', rows: orderRows },
      ],
      { title: 'Cruce contable de ventas', module: 'Ventas' }
    )
    if (res.error) {
      setMsg({ kind: 'error', text: res.error })
      return
    }
    await remApi.markAccountingExported(
      list.map((r) => r.id),
      userId
    )

    // Si Siesa está activo y auto-encola al exportar, sincroniza planos/API
    let siesaNote = ''
    try {
      const cfg = getSiesaConfig(orgId)
      if (cfg.enabled && cfg.autoQueueOnExport !== false) {
        const items = buildQueueFromDomain({
          customers: clientsApi.clients,
          orders: ordersApi.orders,
          remittances: list,
          config: cfg,
          onlyPendingRemittances: false,
        })
        enqueueMany(orgId, items)
        const syncRes = await runSiesaSync(orgId, cfg, { onlyPending: true })
        if (syncRes.ok) {
          siesaNote = ` · Siesa: ${syncRes.syncedIds?.length || 0} doc(s) (${cfg.mode}).`
        } else if (syncRes.message) {
          siesaNote = ` · Siesa: ${syncRes.message}`
        }
      }
    } catch {
      /* no bloquear Excel */
    }

    setMsg({
      kind: 'ok',
      text: `Excel descargado (${list.length} remisiones). Marcadas como exportadas a contabilidad.${siesaNote}`,
    })
  }

  const exportOrdersExcel = async () => {
    const rows = ordersApi.orders.map((o) => ({
      Código: o.code,
      Cliente: o.customers?.name || '',
      Ciudad: o.customers?.city || '',
      Estado: ORDER_STATUS_LABEL[o.status] || o.status,
      Hembras: o.qty_females,
      Machos: o.qty_males,
      Precio: o.unit_price,
      Solicitado: o.requested_date || '',
      Entrega: o.delivery_date || '',
      Dirección: o.delivery_address || '',
      Notas: o.notes || '',
    }))
    const res = await exportToExcel(
      'pedidos-ventas',
      [{ name: 'Pedidos', rows }],
      { title: 'Pedidos de ventas', module: 'Ventas' }
    )
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else setMsg({ kind: 'ok', text: 'Excel de pedidos descargado' })
  }

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>{meta.title}</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {first ? `${first} · ` : ''}
            {titleRole}
            {area ? ` · ${areaLabel(area)}` : ''}
          </p>
        </div>
        <div className="tabs" role="tablist" style={{ margin: 0, flexWrap: 'wrap' }}>
          {meta.tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={view === t ? 'tab active' : 'tab'}
              onClick={() => setView(t)}
            >
              {TAB_LABEL[t]}
              {t === 'pedidos' && requestedOrders.length > 0 && profile !== 'logistics'
                ? ` (${requestedOrders.length})`
                : ''}
              {t === 'remisiones' && readyToRemit.length > 0 && profile !== 'sales'
                ? ` (${readyToRemit.length})`
                : ''}
              {t === 'contable' && remApi.pendingAccounting.length
                ? ` (${remApi.pendingAccounting.length})`
                : ''}
            </button>
          ))}
        </div>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>{meta.blurb}</p>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {(clientsApi.localMode || ordersApi.localMode || remApi.localMode) && (
        <p className="msg ok" style={{ marginTop: 8 }}>
          Parte de los datos opera en respaldo local hasta publicar las tablas en Supabase (
          <code>supabase_migration_sales_clients.sql</code> y{' '}
          <code>supabase_migration_ops_workflow.sql</code>).
        </p>
      )}

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{verifiedClients.length}</span>
          <span className="kpi-label">Clientes verificados</span>
        </div>
        <div className={`kpi-card${requestedOrders.length ? ' warn' : ''}`}>
          <span className="kpi-value">{requestedOrders.length}</span>
          <span className="kpi-label">Pedidos por confirmar</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{readyToRemit.length}</span>
          <span className="kpi-label">Listos para remisión</span>
        </div>
        <div className={`kpi-card${remApi.pendingAccounting.length ? ' warn' : ''}`}>
          <span className="kpi-value">{remApi.pendingAccounting.length}</span>
          <span className="kpi-label">Pendientes contabilidad</span>
        </div>
      </div>

      {/* ═══ PEDIDOS ═══ */}
      {view === 'pedidos' && (
        <>
          <div className="actions row" style={{ marginTop: 16, gap: 8, flexWrap: 'wrap' }}>
            {(profile === 'sales' || profile === 'full') && (
              <button type="button" className="primary small" onClick={() => openOrderFor('')}>
                + Pedido (cliente verificado)
              </button>
            )}
            <button type="button" className="ghost small" onClick={exportOrdersExcel}>
              Excel pedidos
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => {
                ordersApi.reload()
                clientsApi.reload()
              }}
            >
              Actualizar
            </button>
          </div>

          {orderForm && (
            <OrderForm
              form={orderForm}
              setForm={setOrderForm}
              clients={
                profile === 'sales' || profile === 'full'
                  ? verifiedClients.length
                    ? verifiedClients
                    : clientsApi.clients
                  : clientsApi.clients
              }
              onlyVerified={profile === 'sales' || profile === 'full'}
              busy={busy}
              onSave={saveOrder}
              onCancel={() => setOrderForm(null)}
            />
          )}

          {ordersApi.loading ? (
            <p className="hint">Cargando pedidos…</p>
          ) : ordersApi.orders.length === 0 ? (
            <p className="hint" style={{ marginTop: 12 }}>
              Aún no hay pedidos. El cliente los solicita desde su portal (cuenta verificada) o
              ventas los registra.
            </p>
          ) : (
            <div className="admin-list" style={{ marginTop: 12 }}>
              <ListControls lc={orderLc} placeholder="Buscar pedido…" />
              {orderLc.visible.map((o) => {
                const total =
                  o.qty_total ?? (Number(o.qty_females) || 0) + (Number(o.qty_males) || 0)
                const next = ORDER_STATUS_NEXT[o.status]
                return (
                  <div key={o.id} className="admin-row" style={{ margin: 0, flexWrap: 'wrap' }}>
                    <div className="admin-row-main" style={{ flex: 1 }}>
                      <strong>
                        {o.customers?.name || 'Cliente'} · {total.toLocaleString('es-CO')} pollitos
                      </strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {[
                          ORDER_STATUS_LABEL[o.status] || o.status,
                          o.code,
                          o.customers?.city,
                          o.customers?.nit ? `NIT ${o.customers.nit}` : null,
                          o.delivery_date
                            ? `Entrega ${new Date(o.delivery_date).toLocaleDateString('es-CO')}`
                            : null,
                          o.delivery_address,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <span className="admin-row-actions" style={{ flexWrap: 'wrap' }}>
                      {o.status === 'requested' && (profile === 'sales' || profile === 'full') && (
                        <button
                          type="button"
                          className="primary small"
                          disabled={busy}
                          onClick={() => confirmRequested(o.id)}
                        >
                          Verificar y confirmar
                        </button>
                      )}
                      {['confirmed', 'scheduled'].includes(o.status) &&
                        (profile === 'logistics' || profile === 'full') && (
                          <button
                            type="button"
                            className="primary small"
                            onClick={() => openRemit(o)}
                          >
                            Generar remisión
                          </button>
                        )}
                      {next &&
                        profile === 'full' &&
                        o.status !== 'requested' &&
                        o.status !== 'confirmed' && (
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() => ordersApi.updateStatus(o.id, next)}
                          >
                            → {ORDER_STATUS_LABEL[next]}
                          </button>
                        )}
                      {o.status === 'confirmed' && (profile === 'sales' || profile === 'full') && (
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => ordersApi.updateStatus(o.id, 'scheduled')}
                        >
                          Programar
                        </button>
                      )}
                      {o.status !== 'cancelled' &&
                        o.status !== 'delivered' &&
                        (profile === 'sales' || profile === 'full') && (
                          <button
                            type="button"
                            className="ghost danger small"
                            onClick={() => ordersApi.updateStatus(o.id, 'cancelled')}
                          >
                            Cancelar
                          </button>
                        )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ REMISIONES ═══ */}
      {view === 'remisiones' && (
        <>
          <p className="hint" style={{ marginTop: 12 }}>
            El auxiliar de logística arma la remisión con datos del cliente y de la venta (pedido
            confirmado). Luego ventas/contabilidad exportan a Excel.
          </p>

          {readyToRemit.length > 0 && (profile === 'logistics' || profile === 'full') && (
            <>
              <h3 className="section-title" style={{ margin: '14px 0 8px' }}>
                Pedidos listos para despachar
              </h3>
              <div className="admin-list">
                {readyToRemit.map((o) => (
                  <div key={o.id} className="admin-row compact" style={{ margin: 0 }}>
                    <div className="admin-row-main" style={{ flex: 1 }}>
                      <strong>
                        {o.customers?.name} · {o.code}
                      </strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {(Number(o.qty_females) || 0) + (Number(o.qty_males) || 0)} und ·{' '}
                        {ORDER_STATUS_LABEL[o.status]}
                      </span>
                    </div>
                    <button type="button" className="primary small" onClick={() => openRemit(o)}>
                      Remisión
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {remForm && (
            <div className="inline-form compact" style={{ marginTop: 12 }}>
              <h3 style={{ margin: '0 0 8px' }}>Nueva remisión de despacho</h3>
              <p className="hint" style={{ margin: '0 0 8px' }}>
                Pedido:{' '}
                {ordersApi.orders.find((o) => o.id === remForm.orderId)?.code || remForm.orderId}
              </p>
              <div className="two-col">
                <label>
                  Fecha despacho
                  <input
                    type="date"
                    value={remForm.dispatch_date}
                    onChange={(e) => setRemForm((f) => ({ ...f, dispatch_date: e.target.value }))}
                  />
                </label>
                <label>
                  Vehículo
                  <input
                    value={remForm.vehicle}
                    onChange={(e) => setRemForm((f) => ({ ...f, vehicle: e.target.value }))}
                    placeholder="Placa / tipo"
                  />
                </label>
                <label>
                  Conductor
                  <input
                    value={remForm.driver_name}
                    onChange={(e) => setRemForm((f) => ({ ...f, driver_name: e.target.value }))}
                  />
                </label>
                <label>
                  Notas
                  <input
                    value={remForm.notes}
                    onChange={(e) => setRemForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </div>
              <div className="actions row">
                <button
                  type="button"
                  className="primary small"
                  onClick={saveRemittance}
                  disabled={busy}
                >
                  {busy ? 'Guardando…' : 'Emitir remisión'}
                </button>
                <button type="button" className="ghost" onClick={() => setRemForm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {remApi.loading ? (
            <p className="hint">Cargando remisiones…</p>
          ) : remApi.remittances.length === 0 ? (
            <p className="hint" style={{ marginTop: 12 }}>
              Sin remisiones aún. Confirme pedidos en Ventas y luego genere la remisión aquí.
            </p>
          ) : (
            <div className="admin-list" style={{ marginTop: 12 }}>
              <ListControls lc={remLc} placeholder="Buscar remisión…" />
              {remLc.visible.map((r) => (
                <div key={r.id} className="admin-row" style={{ margin: 0, flexWrap: 'wrap' }}>
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {r.code} · {r.customers?.name || 'Cliente'}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {[
                        REMITTANCE_STATUS[r.status] || r.status,
                        r.dispatch_date,
                        `${(Number(r.qty_females) || 0) + (Number(r.qty_males) || 0)} und`,
                        r.vehicle,
                        r.driver_name,
                        r.accounting_exported_at ? 'Exportada contab.' : 'Pendiente contab.',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  {(profile === 'logistics' || profile === 'full') && r.status === 'dispatched' && (
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => remApi.updateStatus(r.id, 'delivered')}
                    >
                      Marcar entregada
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ CONTABLE / SIESA ═══ */}
      {view === 'contable' && (
        <>
          <p className="hint" style={{ marginTop: 12 }}>
            Cruce contable con Excel y sincronización hacia Siesa (terceros, pedidos, remisiones y
            facturas). Las filas exportadas se marcan para no duplicar.
          </p>
          <div className="actions row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="primary"
              onClick={() => exportAccounting(true)}
              disabled={busy || !remApi.pendingAccounting.length}
            >
              Excel pendientes ({remApi.pendingAccounting.length})
            </button>
            <button type="button" className="ghost" onClick={() => exportAccounting(false)}>
              Excel todas las remisiones
            </button>
            <button type="button" className="ghost" onClick={exportOrdersExcel}>
              Solo pedidos
            </button>
          </div>
          <div className="admin-list" style={{ marginTop: 14 }}>
            {remApi.pendingAccounting.length === 0 ? (
              <p className="hint">No hay remisiones pendientes de exportar a contabilidad.</p>
            ) : (
              remApi.pendingAccounting.map((r) => (
                <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                  <div className="admin-row-main">
                    <strong>
                      {r.code} · {r.customers?.name}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {r.dispatch_date} ·{' '}
                      {(Number(r.qty_females) || 0) + (Number(r.qty_males) || 0)} und · NIT{' '}
                      {r.customers?.nit || '—'}
                      {r.siesa_synced_at ? ' · Siesa OK' : ''}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <SiesaAccountingPanel
            orgId={orgId}
            userId={userId}
            compact
            onSynced={() => {
              remApi.reload()
              ordersApi.reload()
              clientsApi.reload()
            }}
          />
        </>
      )}

      {/* ═══ CLIENTES ═══ */}
      {view === 'clientes' && (
        <>
          <div
            className="actions row"
            style={{ marginTop: 16, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
          >
            <button
              type="button"
              className={clientsApi.filter === 'day_old' ? 'primary' : 'chip ghost'}
              onClick={() =>
                clientsApi.setFilter(clientsApi.filter === 'day_old' ? 'all' : 'day_old')
              }
            >
              Potenciales · pollito 1 día
            </button>
            <button
              type="button"
              className={clientsApi.filter === 'active' ? 'primary small' : 'chip ghost'}
              onClick={() =>
                clientsApi.setFilter(clientsApi.filter === 'active' ? 'all' : 'active')
              }
            >
              Solo verificados (activos)
            </button>
            <button type="button" className="primary small" onClick={openNew}>
              + Cliente
            </button>
            <button type="button" className="ghost small" onClick={() => clientsApi.reload()}>
              Actualizar
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>
              Buscar cliente
              <input
                type="search"
                value={clientsApi.query}
                onChange={(e) => clientsApi.setQuery(e.target.value)}
                placeholder="Nombre, ciudad, NIT, teléfono…"
                autoComplete="off"
              />
            </label>
          </div>

          {form && (
            <ClientForm
              form={form}
              setForm={setForm}
              busy={busy}
              onSave={save}
              onCancel={() => setForm(null)}
            />
          )}

          {clientsApi.loading ? (
            <p className="hint">Cargando clientes…</p>
          ) : clientsApi.filtered.length === 0 ? (
            <p className="hint" style={{ marginTop: 12 }}>
              No hay clientes con este filtro.
            </p>
          ) : (
            <>
              <ListControls lc={lc} placeholder="Refinar lista…" />
              <div className="admin-list" style={{ marginTop: 8 }}>
                {lc.visible.map((c) => (
                  <div key={c.id} className="admin-row" style={{ margin: 0, flexWrap: 'wrap' }}>
                    <div className="admin-row-main" style={{ flex: 1, minWidth: 180 }}>
                      <strong>
                        {c.name}
                        {c.status === 'active' ? ' · verificado' : ''}
                      </strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {[
                          c.nit && `NIT ${c.nit}`,
                          c.contact_name,
                          c.city,
                          c.phone,
                          STATUS_ES[c.status] || c.status,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <span className="admin-row-actions" style={{ flexWrap: 'wrap' }}>
                      {c.status === 'prospect' && (
                        <button
                          type="button"
                          className="primary small"
                          onClick={async () => {
                            setBusy(true)
                            await clientsApi.saveClient({ ...c, status: 'active' }, c.id)
                            setBusy(false)
                            setMsg({
                              kind: 'ok',
                              text: 'Cliente verificado (activo). Ya puede pedir y facturarse.',
                            })
                          }}
                        >
                          Verificar
                        </button>
                      )}
                      {c.status === 'active' && (
                        <button
                          type="button"
                          className="primary small"
                          onClick={() => openOrderFor(c.id)}
                        >
                          Pedido
                        </button>
                      )}
                      <button type="button" className="ghost small" onClick={() => openEdit(c)}>
                        Editar
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ INVENTARIOS ═══ */}
      {view === 'inventarios' && (
        <div style={{ marginTop: 12 }}>
          <InventoryModule
            orgId={orgId}
            userId={userId}
            role={role}
            userName={userName}
            embedded
          />
        </div>
      )}
    </div>
  )
}

const STATUS_ES = {
  prospect: 'Prospecto',
  active: 'Activo (verificado)',
  inactive: 'Inactivo',
  blocked: 'Bloqueado',
}

function ClientForm({ form, setForm, busy, onSave, onCancel }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <div
      className="card"
      style={{ marginTop: 14, padding: 14, border: '1px solid var(--border, #ddd)' }}
    >
      <h3 style={{ margin: '0 0 10px' }}>{form.id ? 'Editar cliente' : 'Nuevo cliente'}</h3>
      <div className="two-col">
        <label>
          Nombre / granja *
          <input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          Contacto
          <input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        </label>
        <label>
          Teléfono
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label>
          Correo
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label>
          Ciudad
          <input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </label>
        <label>
          Departamento
          <input value={form.department} onChange={(e) => set('department', e.target.value)} />
        </label>
        <label>
          NIT
          <input value={form.nit} onChange={(e) => set('nit', e.target.value)} />
        </label>
        <label>
          Sitio web
          <input value={form.website} onChange={(e) => set('website', e.target.value)} />
        </label>
        <label>
          Tipo de granja
          <input value={form.farm_type} onChange={(e) => set('farm_type', e.target.value)} />
        </label>
        <label>
          Capacidad (aves)
          <input
            type="number"
            value={form.capacity_birds}
            onChange={(e) => set('capacity_birds', e.target.value)}
          />
        </label>
        <label>
          Estado
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="prospect">Prospecto</option>
            <option value="active">Activo (verificado)</option>
            <option value="inactive">Inactivo</option>
            <option value="blocked">Bloqueado</option>
          </select>
        </label>
        <label>
          Interés de producto
          <select
            value={form.product_interest}
            onChange={(e) => set('product_interest', e.target.value)}
          >
            <option value="day_old_chicks">Pollito de un día</option>
            <option value="both">Pollito y huevo</option>
            <option value="eggs">Huevo</option>
            <option value="other">Otro</option>
          </select>
        </label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={Boolean(form.buys_day_old_chicks)}
          onChange={(e) => set('buys_day_old_chicks', e.target.checked)}
        />
        Comprador potencial de pollito de un día
      </label>
      <label>
        Dirección
        <input value={form.address} onChange={(e) => set('address', e.target.value)} />
      </label>
      <label>
        Notas
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          style={{ width: '100%' }}
        />
      </label>
      <div className="actions row" style={{ marginTop: 10, gap: 8 }}>
        <button
          type="button"
          className="primary"
          disabled={busy || !form.name?.trim()}
          onClick={onSave}
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function OrderForm({ form, setForm, clients, onlyVerified, busy, onSave, onCancel }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const dayOldClients = useMemo(
    () =>
      clients.filter(
        (c) =>
          c.buys_day_old_chicks &&
          (onlyVerified ? c.status === 'active' : ['prospect', 'active'].includes(c.status))
      ),
    [clients, onlyVerified]
  )
  return (
    <div
      className="card"
      style={{ marginTop: 14, padding: 14, border: '1px solid var(--border, #ddd)' }}
    >
      <h3 style={{ margin: '0 0 10px' }}>Nuevo pedido (pollito de un día)</h3>
      {onlyVerified && (
        <p className="hint" style={{ marginTop: 0 }}>
          Solo clientes con estado <strong>Activo (verificado)</strong>.
        </p>
      )}
      <label>
        Cliente *
        <select value={form.customerId} onChange={(e) => set('customerId', e.target.value)}>
          <option value="">Seleccionar…</option>
          <optgroup label="Verificados / potenciales">
            {dayOldClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.city ? ` · ${c.city}` : ''}
                {c.status === 'active' ? ' ✓' : ''}
              </option>
            ))}
          </optgroup>
          {!onlyVerified && (
            <optgroup label="Todos">
              {clients.map((c) => (
                <option key={`all-${c.id}`} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <div className="two-col">
        <label>
          Hembras
          <input
            type="number"
            min={0}
            value={form.qty_females}
            onChange={(e) => set('qty_females', e.target.value)}
          />
        </label>
        <label>
          Machos
          <input
            type="number"
            min={0}
            value={form.qty_males}
            onChange={(e) => set('qty_males', e.target.value)}
          />
        </label>
        <label>
          Precio unitario
          <input
            type="number"
            min={0}
            value={form.unit_price}
            onChange={(e) => set('unit_price', e.target.value)}
          />
        </label>
        <label>
          Fecha solicitada
          <input
            type="date"
            value={form.requested_date}
            onChange={(e) => set('requested_date', e.target.value)}
          />
        </label>
        <label>
          Fecha entrega
          <input
            type="date"
            value={form.delivery_date}
            onChange={(e) => set('delivery_date', e.target.value)}
          />
        </label>
      </div>
      <label>
        Dirección de entrega
        <input
          value={form.delivery_address}
          onChange={(e) => set('delivery_address', e.target.value)}
        />
      </label>
      <label>
        Notas
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          style={{ width: '100%' }}
        />
      </label>
      <div className="actions row" style={{ marginTop: 10, gap: 8 }}>
        <button type="button" className="primary" disabled={busy} onClick={onSave}>
          {busy ? 'Guardando…' : 'Registrar pedido'}
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
