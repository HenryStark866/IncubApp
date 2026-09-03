/**
 * Panel de compatibilidad y sincronización con Siesa (ERP contable).
 * Se embebe en Contabilidad y se reutiliza desde el cruce contable de Ventas.
 */

import { useEffect, useState } from 'react'
import { useSiesa } from '../hooks/useSiesa'
import { useClients } from '../hooks/useClients'
import { useSalesOrders } from '../hooks/useSalesOrders'
import { useRemittances } from '../hooks/useRemittances'
import { supabase } from '../lib/supabase'
import {
  SIESA_SYNC_STATUS_LABEL,
  SIESA_PRODUCT,
  SIESA_INTEGRATION_VERSION,
} from '../lib/siesa'

export default function SiesaAccountingPanel({
  orgId,
  userId,
  compact = false,
  onSynced,
}) {
  const siesa = useSiesa(orgId)
  const clientsApi = useClients(orgId)
  const ordersApi = useSalesOrders(orgId)
  const remApi = useRemittances(orgId)
  const [form, setForm] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (siesa.config && !form) setForm({ ...siesa.config })
  }, [siesa.config, form])

  useEffect(() => {
    if (siesa.config) setForm({ ...siesa.config })
  }, [siesa.config?.updatedAt])

  if (siesa.loading || !form) {
    return (
      <div className="card" style={{ marginTop: compact ? 0 : 16 }}>
        <p className="hint" style={{ margin: 0 }}>
          Cargando integración {SIESA_PRODUCT}…
        </p>
      </div>
    )
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setNested = (group, key, value) =>
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }))

  const save = async () => {
    await siesa.saveConfig(form)
  }

  const enqueueAndSync = async (onlyPending = true) => {
    const workOrders = await loadWorkOrderCosts(orgId)
    const enq = siesa.enqueueDomain({
      customers: clientsApi.clients,
      orders: ordersApi.orders,
      remittances: onlyPending
        ? remApi.remittances.filter((r) => !r.siesa_synced_at && r.status !== 'cancelled')
        : remApi.remittances,
      workOrders,
      inventory: [],
    })
    if (enq.error) {
      siesa.setMessage({ kind: 'error', text: enq.error })
      return
    }
    const res = await siesa.syncNow({ onlyPending: true })
    if (res.ok && res.syncedIds?.length) {
      await markRemittancesSiesaSynced(orgId, remApi, userId, onlyPending)
      onSynced?.(res)
    }
  }

  const stats = siesa.stats || { total: 0, queued: 0, synced: 0, error: 0 }

  return (
    <div className="card" style={{ marginTop: compact ? 0 : 16, padding: compact ? 12 : 16 }}>
      <div className="card-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0 }}>
            {SIESA_PRODUCT} · integración contable
          </h3>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Compatibilidad y sincronización con el ERP contable. v{SIESA_INTEGRATION_VERSION}
            {siesa.source === 'supabase' ? ' · config en nube' : ' · config local'}
            {siesa.ready ? ' · listo' : ' · incompleto'}
          </p>
        </div>
        <span className={`pill ${form.enabled ? 'ok' : ''}`}>
          {form.enabled ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {siesa.message && (
        <p className={`msg ${siesa.message.kind === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 10 }}>
          {siesa.message.text}
        </p>
      )}

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{stats.queued}</span>
          <span className="kpi-label">En cola</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{stats.synced}</span>
          <span className="kpi-label">Sincronizados</span>
        </div>
        <div className={`kpi-card${stats.error ? ' warn' : ''}`}>
          <span className="kpi-value">{stats.error}</span>
          <span className="kpi-label">Con error</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value" style={{ fontSize: '1rem' }}>
            {(siesa.modes[form.mode] || siesa.modes.plano).label}
          </span>
          <span className="kpi-label">Modo</span>
        </div>
      </div>

      <h4 className="section-title" style={{ margin: '16px 0 8px' }}>
        Dependencias que alimentan Siesa
      </h4>
      <ul className="hint" style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.5 }}>
        {siesa.deps.map((d) => (
          <li key={d.id}>
            <strong>{d.label}</strong>
            {form.entities?.[d.entity] === false ? ' — desactivado' : ' — habilitado'}
          </li>
        ))}
      </ul>

      <div className="actions row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="primary"
          disabled={siesa.busy || !form.enabled}
          onClick={() => enqueueAndSync(true)}
        >
          {siesa.busy ? 'Sincronizando…' : 'Sincronizar pendientes → Siesa'}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={siesa.busy || !form.enabled}
          onClick={() => enqueueAndSync(false)}
        >
          Re-sincronizar todo
        </button>
        <button type="button" className="ghost small" disabled={siesa.busy} onClick={save}>
          Guardar configuración
        </button>
        {(form.mode === 'rest' || form.mode === 'hybrid') && (
          <button
            type="button"
            className="ghost small"
            disabled={siesa.busy}
            onClick={() => siesa.testConnection()}
          >
            Probar conexión API
          </button>
        )}
        <button
          type="button"
          className="ghost small"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Ocultar config' : 'Configurar Siesa'}
        </button>
      </div>

      {showAdvanced && (
        <div
          style={{
            border: '1px solid var(--line, #ddd)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={!!form.enabled}
              onChange={(e) => set('enabled', e.target.checked)}
            />
            Activar integración con {SIESA_PRODUCT}
          </label>

          <div className="form-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
            <label>
              Modo
              <select value={form.mode} onChange={(e) => set('mode', e.target.value)}>
                {Object.values(siesa.modes).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Código compañía (CIA)
              <input
                value={form.companyCode || ''}
                onChange={(e) => set('companyCode', e.target.value)}
                placeholder="Ej. 001"
              />
            </label>
            <label>
              Centro operación (CO)
              <input value={form.co || ''} onChange={(e) => set('co', e.target.value)} />
            </label>
            <label>
              Unidad negocio (UN)
              <input value={form.un || ''} onChange={(e) => set('un', e.target.value)} />
            </label>
            <label>
              Prefijo ID externo
              <input
                value={form.externalPrefix || ''}
                onChange={(e) => set('externalPrefix', e.target.value)}
                placeholder="INC"
              />
            </label>
          </div>

          {(form.mode === 'rest' || form.mode === 'hybrid') && (
            <div className="form-grid" style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <label>
                URL base API / middleware
                <input
                  value={form.baseUrl || ''}
                  onChange={(e) => set('baseUrl', e.target.value)}
                  placeholder="https://middleware.empresa.com"
                />
              </label>
              <label>
                API key / token
                <input
                  type="password"
                  autoComplete="off"
                  value={form.apiKey || ''}
                  onChange={(e) => set('apiKey', e.target.value)}
                  placeholder="••••••••"
                />
              </label>
            </div>
          )}

          <p className="hint" style={{ margin: '10px 0 6px' }}>
            {(siesa.modes[form.mode] || {}).description}
          </p>

          <h4 className="section-title" style={{ margin: '12px 0 6px', fontSize: '0.95rem' }}>
            Entidades a sincronizar
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {Object.values(siesa.entityTypes).map((e) => (
              <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={form.entities?.[e.id] !== false}
                  onChange={(ev) => setNested('entities', e.id, ev.target.checked)}
                />
                {e.label}
              </label>
            ))}
          </div>

          <h4 className="section-title" style={{ margin: '12px 0 6px', fontSize: '0.95rem' }}>
            Códigos de ítem en Siesa
          </h4>
          <div className="form-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
            <label>
              Pollito 1 día
              <input
                value={form.itemCodes?.day_old_chicks || ''}
                onChange={(e) => setNested('itemCodes', 'day_old_chicks', e.target.value)}
              />
            </label>
            <label>
              Huevo
              <input
                value={form.itemCodes?.eggs || ''}
                onChange={(e) => setNested('itemCodes', 'eggs', e.target.value)}
              />
            </label>
            <label>
              Otro
              <input
                value={form.itemCodes?.other || ''}
                onChange={(e) => setNested('itemCodes', 'other', e.target.value)}
              />
            </label>
          </div>

          <label style={{ display: 'block', marginTop: 10 }}>
            Notas de integración
            <textarea
              rows={2}
              value={form.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Contacto del implementador Siesa, reglas de CIA/CO…"
            />
          </label>

          <div className="actions row" style={{ marginTop: 10, gap: 8 }}>
            <button type="button" className="primary small" disabled={siesa.busy} onClick={save}>
              Guardar
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => siesa.clearQueue(true)}
            >
              Limpiar cola sincronizada
            </button>
            <button type="button" className="ghost small" onClick={() => siesa.clearQueue(false)}>
              Vaciar cola
            </button>
          </div>
        </div>
      )}

      {!compact && siesa.queue.length > 0 && (
        <>
          <h4 className="section-title" style={{ margin: '8px 0' }}>
            Cola ({siesa.queue.length})
          </h4>
          <div className="table-wrap" style={{ maxHeight: 220, overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Entidad</th>
                  <th>Documento</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {siesa.queue.slice(0, 40).map((q) => (
                  <tr key={q.id}>
                    <td>{q.entity}</td>
                    <td>{q.label}</td>
                    <td>{SIESA_SYNC_STATUS_LABEL[q.status] || q.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!compact && siesa.log.length > 0 && (
        <p className="hint" style={{ marginTop: 10, fontSize: '0.8rem' }}>
          Última sync:{' '}
          {new Date(siesa.log[0].at).toLocaleString('es-CO')} · {siesa.log[0].count ?? 0} docs ·{' '}
          {siesa.log[0].mode}
        </p>
      )}
    </div>
  )
}

async function loadWorkOrderCosts(orgId) {
  if (!orgId) return []
  try {
    const { data, error } = await supabase
      .from('work_orders')
      .select('id, org_id, code, title, status, cost, downtime_minutes, completed_at, machine_id')
      .eq('org_id', orgId)
      .not('cost', 'is', null)
      .limit(200)
    if (error) return []
    return (data || []).filter((w) => Number(w.cost) > 0)
  } catch {
    return []
  }
}

async function markRemittancesSiesaSynced(orgId, remApi, userId, onlyPending) {
  const list = (remApi.remittances || []).filter((r) => {
    if (r.status === 'cancelled') return false
    if (onlyPending && r.siesa_synced_at) return false
    return true
  })
  if (!list.length) return
  const ids = list.map((r) => r.id)
  const patch = {
    siesa_synced_at: new Date().toISOString(),
    siesa_synced_by: userId || null,
    accounting_exported_at: new Date().toISOString(),
    accounting_exported_by: userId || null,
  }
  // markAccountingExported cubre accounting_*; intentamos update extra de siesa_*
  await remApi.markAccountingExported(ids, userId)
  try {
    await supabase.from('sales_remittances').update(patch).in('id', ids).eq('org_id', orgId)
  } catch {
    /* columnas opcionales */
  }
  remApi.reload?.()
}
