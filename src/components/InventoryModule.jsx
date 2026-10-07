/**
 * =============================================================================
 * ARCHIVO: src/components/InventoryModule.jsx
 * PROPÓSITO: Componente UI «InventoryModule»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useState } from 'react'
import {
  useAreaInventory,
  INV_CATEGORIES,
  categoryLabel,
} from '../hooks/useAreaInventory'
import { exportToExcel } from '../lib/exportExcel'
import ListControls, { useListControls } from './ListControls'
import CoordinatorInventoryPanel from './CoordinatorInventoryPanel'

/**
 * Inventarios:
 * 1) Corporativos por categoría (huevos, alimento, compras, dotación…)
 * 2) Inventario personal del coordinador (desde cero, ítems a medida)
 */
export default function InventoryModule({
  orgId,
  userId,
  role,
  area,
  userName,
  embedded = false,
}) {
  const api = useAreaInventory(orgId, userId)
  const showCoordInv =
    role === 'coordinator' ||
    ['owner', 'admin', 'management'].includes(role) ||
    String(role || '').includes('auxiliary')
  const [form, setForm] = useState(null)
  const [move, setMove] = useState(null)
  const [leadForm, setLeadForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const lc = useListControls(
    api.filtered,
    (r, q) =>
      `${r.item_name} ${r.item_code || ''} ${r.location || ''} ${r.responsible_label || ''}`
        .toLowerCase()
        .includes(q),
    15
  )

  const lead = api.leadFor(api.category)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const res = await api.saveItem(form, form.id || null)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: form.id ? 'Ítem actualizado' : 'Ítem creado' })
      setForm(null)
    }
  }

  const doMove = async () => {
    setBusy(true)
    setMsg(null)
    const res = await api.moveStock(move)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: 'Movimiento registrado' })
      setMove(null)
    }
  }

  const saveLead = async () => {
    setBusy(true)
    const res = await api.setLead(api.category, leadForm)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: 'Responsable principal actualizado' })
      setLeadForm(null)
    }
  }

  const exportCat = async () => {
    const rows = api.filtered.map((i) => ({
      Categoría: categoryLabel(i.category),
      Código: i.item_code || '',
      Ítem: i.item_name,
      Unidad: i.unit,
      Stock: i.qty_on_hand,
      Mínimo: i.min_qty,
      Ubicación: i.location || '',
      Responsable: i.responsible_label || lead?.label || '',
      Notas: i.notes || '',
    }))
    const res = await exportToExcel(
      `inventario-${api.category}`,
      [{ name: categoryLabel(api.category), rows }],
      { title: `Inventario · ${categoryLabel(api.category)}`, module: 'Inventarios' }
    )
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else setMsg({ kind: 'ok', text: 'Excel de inventario descargado' })
  }

  const body = (
    <>
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {api.localMode && (
        <p className="msg ok">
          Inventarios en modo local hasta publicar la migración{' '}
          <code>supabase_migration_ops_workflow.sql</code>.
        </p>
      )}
      {api.error && !api.localMode && <p className="msg error">{api.error}</p>}

      {showCoordInv && (
        <div
          style={{
            marginTop: 8,
            marginBottom: 18,
            padding: '12px 14px',
            border: '1px solid var(--line)',
            borderRadius: 12,
            background: 'var(--bg-0)',
          }}
        >
          <CoordinatorInventoryPanel
            orgId={orgId}
            userId={userId}
            area={area}
            userName={userName}
            canManage={
              role === 'coordinator' ||
              ['owner', 'admin', 'management'].includes(role) ||
              String(role || '').includes('auxiliary')
            }
          />
        </div>
      )}

      <h3 className="section-title" style={{ margin: '8px 0 6px' }}>
        Inventarios corporativos por categoría
      </h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Categorías compartidas de la empresa (huevos, alimento, compras, dotación…). El inventario
        de coordinación de arriba es independiente y personalizable.
      </p>

      <div className="plant-chips" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        {INV_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            className={api.category === c.value ? 'chip active' : 'chip'}
            onClick={() => api.setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{api.filtered.length}</span>
          <span className="kpi-label">Ítems · {categoryLabel(api.category)}</span>
        </div>
        <div className={`kpi-card${api.lowStock.length ? ' warn' : ''}`}>
          <span className="kpi-value">{api.lowStock.filter((i) => i.category === api.category).length}</span>
          <span className="kpi-label">Bajo mínimo</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value" style={{ fontSize: 14, lineHeight: 1.2 }}>
            {lead?.label || INV_CATEGORIES.find((c) => c.value === api.category)?.defaultLead || '—'}
          </span>
          <span className="kpi-label">Responsable principal</span>
        </div>
      </div>

      <div className="actions row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="primary small"
          onClick={() =>
            setForm({
              category: api.category,
              item_code: '',
              item_name: '',
              unit: 'und',
              qty_on_hand: '0',
              min_qty: '0',
              location: '',
              responsible_label: lead?.label || '',
              notes: '',
            })
          }
        >
          + Ítem
        </button>
        <button
          type="button"
          className="ghost small"
          onClick={() =>
            setLeadForm({ label: lead?.label || '', user_id: lead?.user_id || '' })
          }
        >
          Definir responsable
        </button>
        <button type="button" className="ghost small" onClick={exportCat}>
          Excel inventario
        </button>
        <button type="button" className="ghost small" onClick={() => api.reload()}>
          Actualizar
        </button>
      </div>

      {leadForm && (
        <div className="inline-form compact" style={{ marginTop: 10 }}>
          <label>
            Responsable principal de {categoryLabel(api.category)}
            <input
              type="text"
              value={leadForm.label}
              onChange={(e) => setLeadForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Ej. Auxiliar de recepción · María P."
            />
          </label>
          <div className="actions row">
            <button type="button" className="primary small" onClick={saveLead} disabled={busy}>
              Guardar
            </button>
            <button type="button" className="ghost" onClick={() => setLeadForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {form && (
        <div className="inline-form compact" style={{ marginTop: 10 }}>
          <div className="two-col">
            <label>
              Nombre
              <input
                value={form.item_name}
                onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
                autoFocus
              />
            </label>
            <label>
              Código
              <input
                value={form.item_code}
                onChange={(e) => setForm((f) => ({ ...f, item_code: e.target.value }))}
              />
            </label>
            <label>
              Unidad
              <input
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="und, kg, bulto…"
              />
            </label>
            <label>
              Stock actual
              <input
                type="number"
                step="any"
                value={form.qty_on_hand}
                onChange={(e) => setForm((f) => ({ ...f, qty_on_hand: e.target.value }))}
              />
            </label>
            <label>
              Mínimo
              <input
                type="number"
                step="any"
                value={form.min_qty}
                onChange={(e) => setForm((f) => ({ ...f, min_qty: e.target.value }))}
              />
            </label>
            <label>
              Ubicación
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </label>
            <label>
              Responsable del ítem
              <input
                value={form.responsible_label}
                onChange={(e) => setForm((f) => ({ ...f, responsible_label: e.target.value }))}
              />
            </label>
            <label>
              Notas
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
          <div className="actions row">
            <button type="button" className="primary small" onClick={save} disabled={busy}>
              Guardar
            </button>
            <button type="button" className="ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {move && (
        <div className="inline-form compact" style={{ marginTop: 10 }}>
          <p className="hint" style={{ margin: 0 }}>
            Movimiento: <strong>{move.item_name}</strong>
          </p>
          <div className="two-col">
            <label>
              Tipo
              <select
                value={move.movement_type}
                onChange={(e) => setMove((m) => ({ ...m, movement_type: e.target.value }))}
              >
                <option value="in">Entrada</option>
                <option value="out">Salida</option>
                <option value="adjust">Ajuste (+/-)</option>
              </select>
            </label>
            <label>
              Cantidad
              <input
                type="number"
                step="any"
                value={move.qty}
                onChange={(e) => setMove((m) => ({ ...m, qty: e.target.value }))}
              />
            </label>
            <label>
              Nota
              <input
                value={move.notes}
                onChange={(e) => setMove((m) => ({ ...m, notes: e.target.value }))}
              />
            </label>
          </div>
          <div className="actions row">
            <button type="button" className="primary small" onClick={doMove} disabled={busy}>
              Registrar
            </button>
            <button type="button" className="ghost" onClick={() => setMove(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {api.loading ? (
        <p className="hint">Cargando inventario…</p>
      ) : api.filtered.length === 0 ? (
        <p className="hint" style={{ marginTop: 12 }}>
          Sin ítems en {categoryLabel(api.category)}. Cree el primero con «+ Ítem».
        </p>
      ) : (
        <>
          <ListControls lc={lc} placeholder="Buscar ítem…" />
          <div className="admin-list" style={{ marginTop: 8 }}>
            {lc.visible.map((i) => {
              const low = Number(i.min_qty) > 0 && Number(i.qty_on_hand) <= Number(i.min_qty)
              return (
                <div
                  key={i.id}
                  className={`admin-row${low ? ' pending' : ''}`}
                  style={{ margin: 0, flexWrap: 'wrap' }}
                >
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {i.item_name}
                      {i.item_code ? ` (${i.item_code})` : ''}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      Stock {Number(i.qty_on_hand).toLocaleString('es-CO')} {i.unit}
                      {i.min_qty != null ? ` · mín. ${i.min_qty}` : ''}
                      {i.location ? ` · ${i.location}` : ''}
                      {i.responsible_label ? ` · ${i.responsible_label}` : ''}
                      {low ? ' · BAJO MÍNIMO' : ''}
                    </span>
                  </div>
                  <span className="admin-row-actions">
                    <button
                      type="button"
                      className="primary small"
                      onClick={() =>
                        setMove({
                          inventoryId: i.id,
                          item_name: i.item_name,
                          movement_type: 'in',
                          qty: '',
                          notes: '',
                        })
                      }
                    >
                      Movimiento
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() =>
                        setForm({
                          id: i.id,
                          category: i.category,
                          item_code: i.item_code || '',
                          item_name: i.item_name || '',
                          unit: i.unit || 'und',
                          qty_on_hand: i.qty_on_hand ?? 0,
                          min_qty: i.min_qty ?? 0,
                          location: i.location || '',
                          responsible_label: i.responsible_label || '',
                          notes: i.notes || '',
                        })
                      }
                    >
                      Editar
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )

  if (embedded) return <div className="inventory-embedded">{body}</div>

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2 style={{ margin: 0 }}>Inventarios</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {userName ? `${userName.split(' ')[0]} · ` : ''}
            inventario de su área (personalizado) + categorías corporativas
          </p>
        </div>
      </div>
      {body}
    </div>
  )
}
