/**
 * =============================================================================
 * ARCHIVO: src/components/ClientPortal.jsx
 * PROPÓSITO: Componente UI «ClientPortal»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useState } from 'react'
import { useMyCustomerOrders } from '../hooks/useClients'
import { ORDER_STATUS_LABEL } from '../hooks/useSalesOrders'

/**
 * Portal del cliente (rol `customer`):
 * ve su ficha, pedidos y puede solicitar pollito de un día.
 */
export default function ClientPortal({ orgId, userId, profile }) {
  const api = useMyCustomerOrders(orgId, userId)
  const [form, setForm] = useState({
    qty_females: '',
    qty_males: '',
    requested_date: '',
    delivery_address: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async () => {
    if (api.customer?.status && api.customer.status !== 'active') {
      setMsg({
        kind: 'error',
        text: 'Su ficha aún no está verificada (estado Activo). Contacte a ventas para habilitar pedidos.',
      })
      return
    }
    setBusy(true)
    setMsg(null)
    const res = await api.requestOrder(form)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({
        kind: 'ok',
        text: 'Pedido enviado. Ventas lo confirmará; logística generará la remisión de despacho.',
      })
      setForm({
        qty_females: '',
        qty_males: '',
        requested_date: '',
        delivery_address: '',
        notes: '',
      })
    }
  }

  const canOrder = !api.customer?.status || api.customer.status === 'active'

  if (api.loading) {
    return (
      <div className="card wide">
        <p className="hint">Cargando tu espacio de cliente…</p>
      </div>
    )
  }

  if (!api.customer) {
    return (
      <div className="card wide">
        <div className="card-head">
          <h2>Portal del cliente</h2>
        </div>
        <p>
          Hola{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Tu usuario tiene
          rol de cliente, pero aún no hay una ficha comercial vinculada.
        </p>
        <p className="hint">
          Pide a la coordinación de ventas que cree tu cliente en el CRM y asocie tu usuario (
          <code>user_id</code>), o que te reasignen el acceso.
        </p>
        {api.error && <p className="msg error">{api.error}</p>}
      </div>
    )
  }

  const c = api.customer

  return (
    <div className="card wide">
      <div className="card-head">
        <h2>Mi cuenta · pedidos de pollito</h2>
      </div>
      <p className="hint" style={{ marginTop: 4 }}>
        {c.name}
        {c.city ? ` · ${c.city}` : ''}
        {c.phone ? ` · ${c.phone}` : ''}
      </p>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {api.error && <p className="msg error">{api.error}</p>}

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{api.orders.length}</span>
          <span className="kpi-label">Pedidos</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">
            {api.orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length}
          </span>
          <span className="kpi-label">En proceso</span>
        </div>
      </div>

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Solicitar pollito de un día
      </h3>
      {!canOrder && (
        <p className="msg error">
          Cuenta pendiente de verificación por ventas. Cuando su ficha pase a{' '}
          <strong>Activo</strong> podrá registrar pedidos.
        </p>
      )}
      <div className="two-col">
        <label>
          Cantidad hembras
          <input
            type="number"
            min={0}
            disabled={!canOrder}
            value={form.qty_females}
            onChange={(e) => setForm((f) => ({ ...f, qty_females: e.target.value }))}
          />
        </label>
        <label>
          Cantidad machos
          <input
            type="number"
            min={0}
            value={form.qty_males}
            onChange={(e) => setForm((f) => ({ ...f, qty_males: e.target.value }))}
          />
        </label>
        <label>
          Fecha deseada
          <input
            type="date"
            value={form.requested_date}
            onChange={(e) => setForm((f) => ({ ...f, requested_date: e.target.value }))}
          />
        </label>
      </div>
      <label>
        Dirección de entrega
        <input
          value={form.delivery_address}
          onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))}
          placeholder={c.address || 'Dirección de la granja'}
        />
      </label>
      <label>
        Notas
        <textarea
          rows={2}
          style={{ width: '100%' }}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </label>
      <button
        type="button"
        className="primary"
        style={{ marginTop: 8 }}
        disabled={busy || !canOrder}
        onClick={submit}
      >
        {busy ? 'Enviando…' : 'Enviar pedido'}
      </button>

      <h3 className="section-title" style={{ margin: '22px 0 8px' }}>
        Historial de pedidos
      </h3>
      {api.orders.length === 0 ? (
        <p className="hint">Aún no tienes pedidos registrados.</p>
      ) : (
        <div className="admin-list">
          {api.orders.map((o) => {
            const total = (Number(o.qty_females) || 0) + (Number(o.qty_males) || 0)
            return (
              <div key={o.id} className="admin-row compact" style={{ margin: 0 }}>
                <div className="admin-row-main">
                  <strong>
                    {total.toLocaleString('es-CO')} pollitos ·{' '}
                    {ORDER_STATUS_LABEL[o.status] || o.status}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {o.created_at
                      ? new Date(o.created_at).toLocaleString('es-CO')
                      : ''}
                    {o.delivery_date
                      ? ` · Entrega ${new Date(o.delivery_date).toLocaleDateString('es-CO')}`
                      : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
