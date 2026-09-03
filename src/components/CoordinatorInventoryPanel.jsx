/**
 * =============================================================================
 * ARCHIVO: src/components/CoordinatorInventoryPanel.jsx
 * PROPÓSITO: Componente UI «CoordinatorInventoryPanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useState } from 'react'
import { useCoordinatorInventory } from '../hooks/useCoordinatorInventory'
import { areaLabel } from '../lib/roles'
import { exportToExcel } from '../lib/exportExcel'
import ListControls, { useListControls } from './ListControls'

/**
 * Inventario personal del coordinador: crea libros desde cero e ítems a medida.
 */
export default function CoordinatorInventoryPanel({
  orgId,
  userId,
  area,
  userName,
  canManage = true,
}) {
  const api = useCoordinatorInventory(orgId, userId, area)
  const [bookForm, setBookForm] = useState(null)
  const [itemForm, setItemForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const lc = useListControls(
    api.items,
    (r, q) =>
      `${r.item_name} ${r.item_code || ''} ${r.location || ''} ${r.custom_label || ''}`
        .toLowerCase()
        .includes(q),
    20
  )

  const activeBook = api.books.find((b) => b.id === api.bookId)

  const createBook = async () => {
    setBusy(true)
    setMsg(null)
    const res = await api.createBook(bookForm)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: 'Inventario creado. Ya puede agregar ítems personalizados.' })
      setBookForm(null)
    }
  }

  const saveItem = async () => {
    setBusy(true)
    setMsg(null)
    const res = await api.saveItem(itemForm, itemForm.id || null)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: itemForm.id ? 'Ítem actualizado' : 'Ítem agregado' })
      setItemForm(null)
    }
  }

  const exportBook = async () => {
    if (!activeBook) return
    const rows = api.items.map((i) => ({
      Inventario: activeBook.name,
      Código: i.item_code || '',
      Ítem: i.item_name,
      Etiqueta: i.custom_label || '',
      Unidad: i.unit,
      Stock: i.qty_on_hand,
      Mínimo: i.min_qty,
      Ubicación: i.location || '',
      Notas: i.notes || '',
    }))
    const res = await exportToExcel(
      `inventario-${(activeBook.name || 'coord').replace(/\s+/g, '-')}`,
      [{ name: 'Ítems', rows }],
      {
        title: `Inventario coordinación · ${activeBook.name || 'general'}`,
        module: 'Inventarios coordinación',
      }
    )
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else setMsg({ kind: 'ok', text: 'Excel descargado' })
  }

  return (
    <section className="coord-inv-panel">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            Mi inventario de coordinación
          </h3>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {userName ? `${userName.split(/\s+/)[0]} · ` : ''}
            {area ? areaLabel(area) : 'Área general'} · cree inventarios desde cero con ítems a su
            medida
          </p>
        </div>
      </div>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {api.localMode && (
        <p className="msg ok">
          Inventarios de coordinador en modo local hasta publicar{' '}
          <code>supabase_migration_coord_inventory_iot.sql</code>.
        </p>
      )}
      {api.error && !api.localMode && <p className="msg error">{api.error}</p>}

      <div className="actions row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {api.books.map((b) => (
          <button
            key={b.id}
            type="button"
            className={api.bookId === b.id ? 'chip active' : 'chip'}
            onClick={() => api.setBookId(b.id)}
          >
            {b.name}
          </button>
        ))}
        {canManage && (
          <button
            type="button"
            className="chip ghost"
            onClick={() => setBookForm({ name: '', description: '' })}
          >
            + Nuevo inventario
          </button>
        )}
      </div>

      {bookForm && (
        <div className="inline-form compact" style={{ marginTop: 10 }}>
          <p className="hint" style={{ margin: '0 0 8px' }}>
            Cree un inventario vacío personalizado (ej. «Insumos de planta», «Repuestos OT», «EPP
            cuadrilla»). Luego agregue cada ítem.
          </p>
          <div className="two-col">
            <label>
              Nombre del inventario *
              <input
                value={bookForm.name}
                onChange={(e) => setBookForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Bodega coordinación planta"
                autoFocus
              />
            </label>
            <label>
              Descripción
              <input
                value={bookForm.description}
                onChange={(e) => setBookForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Opcional"
              />
            </label>
          </div>
          <div className="actions row">
            <button type="button" className="primary small" onClick={createBook} disabled={busy}>
              Crear inventario
            </button>
            <button type="button" className="ghost" onClick={() => setBookForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!api.books.length && !bookForm && (
        <p className="hint" style={{ marginTop: 12 }}>
          Aún no tiene inventarios propios.{' '}
          {canManage
            ? 'Pulse «+ Nuevo inventario» para empezar desde cero.'
            : 'Pida a su coordinador que cree el inventario del área.'}
        </p>
      )}

      {activeBook && (
        <>
          <div
            className="actions row"
            style={{ marginTop: 14, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
          >
            <span className="pill live">
              <span className="dot" />
              {activeBook.name}
              {activeBook.description ? ` · ${activeBook.description}` : ''}
            </span>
            <span className="hint" style={{ margin: 0 }}>
              {api.items.length} ítem{api.items.length === 1 ? '' : 's'}
            </span>
            {canManage && (
              <button
                type="button"
                className="primary small"
                onClick={() =>
                  setItemForm({
                    item_code: '',
                    item_name: '',
                    unit: 'und',
                    qty_on_hand: '0',
                    min_qty: '0',
                    location: '',
                    custom_label: '',
                    notes: '',
                  })
                }
              >
                + Ítem
              </button>
            )}
            <button type="button" className="ghost small" onClick={exportBook}>
              Excel
            </button>
            {canManage && (
              <button
                type="button"
                className="ghost small danger"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `¿Eliminar el inventario «${activeBook.name}» y todos sus ítems?`
                    )
                  )
                    return
                  setBusy(true)
                  const res = await api.deleteBook(activeBook.id)
                  setBusy(false)
                  if (res.error) setMsg({ kind: 'error', text: res.error })
                  else setMsg({ kind: 'ok', text: 'Inventario eliminado' })
                }}
              >
                Eliminar inventario
              </button>
            )}
          </div>

          {itemForm && (
            <div className="inline-form compact" style={{ marginTop: 10 }}>
              <div className="two-col">
                <label>
                  Nombre del ítem *
                  <input
                    value={itemForm.item_name}
                    onChange={(e) => setItemForm((f) => ({ ...f, item_name: e.target.value }))}
                    autoFocus
                  />
                </label>
                <label>
                  Código
                  <input
                    value={itemForm.item_code}
                    onChange={(e) => setItemForm((f) => ({ ...f, item_code: e.target.value }))}
                  />
                </label>
                <label>
                  Etiqueta personalizada
                  <input
                    value={itemForm.custom_label}
                    onChange={(e) => setItemForm((f) => ({ ...f, custom_label: e.target.value }))}
                    placeholder="Ej. crítico, consumible, prestado…"
                  />
                </label>
                <label>
                  Unidad
                  <input
                    value={itemForm.unit}
                    onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                  />
                </label>
                <label>
                  Stock
                  <input
                    type="number"
                    step="any"
                    value={itemForm.qty_on_hand}
                    onChange={(e) => setItemForm((f) => ({ ...f, qty_on_hand: e.target.value }))}
                  />
                </label>
                <label>
                  Mínimo
                  <input
                    type="number"
                    step="any"
                    value={itemForm.min_qty}
                    onChange={(e) => setItemForm((f) => ({ ...f, min_qty: e.target.value }))}
                  />
                </label>
                <label>
                  Ubicación
                  <input
                    value={itemForm.location}
                    onChange={(e) => setItemForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </label>
                <label>
                  Notas
                  <input
                    value={itemForm.notes}
                    onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>
              </div>
              <div className="actions row">
                <button type="button" className="primary small" onClick={saveItem} disabled={busy}>
                  Guardar ítem
                </button>
                <button type="button" className="ghost" onClick={() => setItemForm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {api.loading ? (
            <p className="hint">Cargando ítems…</p>
          ) : api.items.length === 0 ? (
            <p className="hint" style={{ marginTop: 10 }}>
              Inventario vacío. Agregue el primer ítem personalizado.
            </p>
          ) : (
            <>
              <ListControls lc={lc} placeholder="Buscar en mi inventario…" />
              <div className="admin-list" style={{ marginTop: 8 }}>
                {lc.visible.map((i) => {
                  const low =
                    Number(i.min_qty) > 0 && Number(i.qty_on_hand) <= Number(i.min_qty)
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
                          {i.custom_label ? ` · ${i.custom_label}` : ''}
                        </strong>
                        <span className="hint" style={{ margin: 0 }}>
                          Stock {Number(i.qty_on_hand).toLocaleString('es-CO')} {i.unit}
                          {i.min_qty != null ? ` · mín. ${i.min_qty}` : ''}
                          {i.location ? ` · ${i.location}` : ''}
                          {low ? ' · BAJO MÍNIMO' : ''}
                        </span>
                      </div>
                      {canManage && (
                        <span className="admin-row-actions">
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() => api.adjustQty(i.id, 1)}
                            title="Entrada +1"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() => api.adjustQty(i.id, -1)}
                            title="Salida −1"
                          >
                            −1
                          </button>
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() =>
                              setItemForm({
                                id: i.id,
                                item_code: i.item_code || '',
                                item_name: i.item_name || '',
                                unit: i.unit || 'und',
                                qty_on_hand: i.qty_on_hand ?? 0,
                                min_qty: i.min_qty ?? 0,
                                location: i.location || '',
                                custom_label: i.custom_label || '',
                                notes: i.notes || '',
                              })
                            }
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="ghost small danger"
                            onClick={async () => {
                              if (!window.confirm('¿Eliminar ítem?')) return
                              await api.removeItem(i.id)
                            }}
                          >
                            Eliminar
                          </button>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
