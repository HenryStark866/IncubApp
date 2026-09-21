/**
 * =============================================================================
 * ARCHIVO: src/components/ColdRoomPanel.jsx
 * PROPÃ“SITO: Componente UI Â«ColdRoomPanelÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBatches } from '../features/production/hooks/useBatches'
import { useColdRoom, COLD_ROOM_TYPES, CLASSIFICATION_TYPES } from '../hooks/useColdRoom'
import { exportToExcel } from '../lib/exportExcel'

/**
 * Cuarto frÃ­o (operario de recepciÃ³n):
 *  1. Saldos reales por lote + fecha + galpÃ³n (Incubable, Deforme, Extra, Roto, Sucio)
 *  2. Actividad de clasificaciÃ³n del huevo: operarios, carros a clasificar,
 *     orden de los carros 1..12 (un cargue de incubadora), sencilla 12 / doble 24.
 */

const today = () => new Date().toLocaleDateString('sv-SE')
const fmtDate = (v) =>
  v ? new Date(`${v}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'â€”'
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')
const totalOf = (counts) => COLD_ROOM_TYPES.reduce((s, t) => s + Number(counts?.[t.code] || 0), 0)

/* â•â• Formulario de saldo (cargar / actualizar) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function StockForm({
  batches,
  rooms,
  plants,
  placements,
  initial,
  canCreateBatch,
  canCreateRoom,
  onCreateBatch,
  onCreateRoom,
  onSave,
  onCancel,
}) {
  const [batchId, setBatchId] = useState(initial?.batch_id ?? batches[0]?.id ?? '')
  const [roomId, setRoomId] = useState(initial?.room_id ?? '')
  const [date, setDate] = useState(initial?.stock_date ?? today())
  const [counts, setCounts] = useState(() => {
    const c = {}
    for (const t of COLD_ROOM_TYPES) c[t.code] = String(initial?.counts?.[t.code] ?? '')
    return c
  })
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  // Alta rÃ¡pida de lote (queda provisional; lo edita gestiÃ³n)
  const [addBatch, setAddBatch] = useState(false)
  const [newBatch, setNewBatch] = useState({ farmId: plants[0]?.id ?? '', code: '', layDate: today() })
  const [addRoom, setAddRoom] = useState(false)
  const [newRoom, setNewRoom] = useState({ plantId: plants[0]?.id ?? '', name: '', type: 'other' })
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState(null)

  // Galpones del lote seleccionado (su distribuciÃ³n); si no hay, todos los galpones
  const batchRooms = useMemo(() => {
    const ids = new Set(placements.filter((p) => p.batch_id === batchId).map((p) => p.room_id))
    const own = rooms.filter((r) => ids.has(r.id))
    return own.length > 0 ? own : rooms
  }, [placements, rooms, batchId])

  // El galpÃ³n seleccionado siempre visible (p. ej. uno reciÃ©n creado sin distribuciÃ³n)
  const roomOptions = useMemo(() => {
    const list = [...batchRooms]
    if (roomId && !list.some((r) => r.id === roomId)) {
      const r = rooms.find((x) => x.id === roomId)
      if (r) list.unshift(r)
    }
    return list
  }, [batchRooms, roomId, rooms])

  useEffect(() => {
    if (roomId && !roomOptions.some((r) => r.id === roomId)) setRoomId(roomOptions[0]?.id ?? '')
    else if (!roomId && roomOptions.length > 0) setRoomId(roomOptions[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomOptions])

  const setCount = (code) => (e) => setCounts((c) => ({ ...c, [code]: e.target.value }))
  const total = totalOf(counts)

  const submitNewBatch = async () => {
    setCreating(true)
    setCreateErr(null)
    const { batch, error } = await onCreateBatch(newBatch)
    setCreating(false)
    if (error) return setCreateErr(error)
    setBatchId(batch.id)
    setAddBatch(false)
    setNewBatch({ farmId: plants[0]?.id ?? '', code: '', layDate: today() })
  }

  const submitNewRoom = async () => {
    setCreating(true)
    setCreateErr(null)
    const { room, error } = await onCreateRoom(newRoom)
    setCreating(false)
    if (error) return setCreateErr(error)
    setRoomId(room.id)
    setAddRoom(false)
    setNewRoom({ plantId: plants[0]?.id ?? '', name: '', type: 'other' })
  }

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onSave({ batchId, roomId, stockDate: date, counts, notes })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <div className="two-col">
        <label>
          Lote
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {batches.length === 0 && <option value="">â€” Sin lotes â€”</option>}
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.code}</option>
            ))}
          </select>
        </label>
        <label>
          GalpÃ³n
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {roomOptions.length === 0 && <option value="">â€” Sin galpones â€”</option>}
            {roomOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
            ))}
          </select>
        </label>
      </div>

      {/* Alta rÃ¡pida: crear lote o galpÃ³n sin salir del registro de saldos */}
      {(canCreateBatch || canCreateRoom) && (
        <div className="actions row" style={{ margin: '0 0 4px' }}>
          {canCreateBatch && (
            <button
              type="button"
              className="chip ghost"
              onClick={() => {
                setAddRoom(false)
                setCreateErr(null)
                setAddBatch((v) => !v)
              }}
            >
              {addBatch ? 'âœ• Cancelar lote' : '+ Nuevo lote'}
            </button>
          )}
          {canCreateRoom && (
            <button
              type="button"
              className="chip ghost"
              onClick={() => {
                setAddBatch(false)
                setCreateErr(null)
                setAddRoom((v) => !v)
              }}
            >
              {addRoom ? 'âœ• Cancelar galpÃ³n' : '+ Nuevo galpÃ³n'}
            </button>
          )}
        </div>
      )}

      {addBatch && (
        <div className="inline-form" style={{ margin: '0 0 8px' }}>
          <p className="hint" style={{ margin: 0 }}>Nuevo lote de huevo (para ingresar el stock al cuarto frÃ­o)</p>
          <div className="two-col">
            <label>
              Granja de origen
              <select value={newBatch.farmId} onChange={(e) => setNewBatch((f) => ({ ...f, farmId: e.target.value }))}>
                {plants.length === 0 && <option value="">â€” Sin granjas â€”</option>}
                {plants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </label>
            <label>
              CÃ³digo del lote
              <input type="text" value={newBatch.code} onChange={(e) => setNewBatch((f) => ({ ...f, code: e.target.value }))} placeholder="Ej. L-2026-01" />
            </label>
          </div>
          <label>
            Fecha de postura
            <input type="date" value={newBatch.layDate} onChange={(e) => setNewBatch((f) => ({ ...f, layDate: e.target.value }))} />
          </label>
          <div className="actions row">
            <button className="primary" onClick={submitNewBatch} disabled={creating || !newBatch.farmId || newBatch.code.trim().length < 1}>
              {creating ? 'Creandoâ€¦' : 'Crear lote'}
            </button>
          </div>
        </div>
      )}

      {addRoom && (
        <div className="inline-form" style={{ margin: '0 0 8px' }}>
          <p className="hint" style={{ margin: 0 }}>Nuevo galpÃ³n (provisional Â· lo completa gestiÃ³n)</p>
          <div className="two-col">
            <label>
              Granja / planta
              <select value={newRoom.plantId} onChange={(e) => setNewRoom((f) => ({ ...f, plantId: e.target.value }))}>
                {plants.length === 0 && <option value="">â€” Sin granjas â€”</option>}
                {plants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </label>
            <label>
              Nombre del galpÃ³n
              <input type="text" value={newRoom.name} onChange={(e) => setNewRoom((f) => ({ ...f, name: e.target.value }))} placeholder="Ej. GalpÃ³n 3" />
            </label>
          </div>
          <label>
            Tipo
            <select value={newRoom.type} onChange={(e) => setNewRoom((f) => ({ ...f, type: e.target.value }))}>
              <option value="levante">GalpÃ³n de levante</option>
              <option value="produccion">GalpÃ³n de producciÃ³n</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <div className="actions row">
            <button className="primary" onClick={submitNewRoom} disabled={creating || !newRoom.plantId || newRoom.name.trim().length < 1}>
              {creating ? 'Creandoâ€¦' : 'Crear galpÃ³n'}
            </button>
          </div>
        </div>
      )}

      {createErr && <p className="msg error">{createErr}</p>}

      <label>
        Fecha del saldo
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <p className="component-title" style={{ margin: '6px 0 2px' }}>Saldo por tipo de huevo</p>
      <div className="two-col">
        {COLD_ROOM_TYPES.map((t) => (
          <label key={t.code}>
            {t.label}
            <input type="number" min="0" value={counts[t.code] ?? ''} onChange={setCount(t.code)} placeholder="0" />
          </label>
        ))}
      </div>
      <p className="hint" style={{ margin: '2px 0' }}>Total: <strong>{num(total)}</strong> huevos</p>
      <label>
        Observaciones
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </label>

      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !batchId || !roomId}>
          {busy ? 'Guardandoâ€¦' : 'Guardar saldo'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â•â• Formulario de clasificaciÃ³n â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ClassificationForm({ batches, rooms, onSave, onCancel }) {
  const [date, setDate] = useState(today())
  const [batchId, setBatchId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [operators, setOperators] = useState('')
  const [type, setType] = useState('sencilla')
  const [carts, setCarts] = useState('12')
  const [cartOrder, setCartOrder] = useState([]) // orden de selecciÃ³n de los carros 1..12
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const pickType = (v) => {
    setType(v)
    const t = CLASSIFICATION_TYPES.find((x) => x.value === v)
    if (t) setCarts(String(t.carts))
  }

  const toggleCart = (n) =>
    setCartOrder((o) => (o.includes(n) ? o.filter((x) => x !== n) : [...o, n]))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onSave({
      batchId: batchId || null,
      roomId: roomId || null,
      activityDate: date,
      operatorsCount: operators,
      cartsCount: carts,
      classificationType: type,
      cartNumbers: cartOrder,
      notes,
    })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <div className="two-col">
        <label>
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Cantidad de operarios
          <input type="number" min="1" value={operators} onChange={(e) => setOperators(e.target.value)} placeholder="Ej. 4" />
        </label>
      </div>
      <div className="two-col">
        <label>
          Lote (opcional)
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">â€” Sin lote especÃ­fico â€”</option>
            {batches.map((b) => (<option key={b.id} value={b.id}>{b.code}</option>))}
          </select>
        </label>
        <label>
          GalpÃ³n (opcional)
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">â€” Sin galpÃ³n especÃ­fico â€”</option>
            {rooms.map((r) => (<option key={r.id} value={r.id}>{r.name} ({r.code})</option>))}
          </select>
        </label>
      </div>
      <div className="two-col">
        <label>
          ClasificaciÃ³n
          <select value={type} onChange={(e) => pickType(e.target.value)}>
            {CLASSIFICATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label>
          Carros a clasificar
          <input type="number" min="1" max="24" value={carts} onChange={(e) => setCarts(e.target.value)} />
        </label>
      </div>

      <p className="component-title" style={{ margin: '6px 0 2px' }}>
        Orden de los carros (1 al 12 Â· un cargue de incubadora)
      </p>
      <div className="cart-order">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
          const pos = cartOrder.indexOf(n)
          return (
            <button
              key={n}
              type="button"
              className={`cart-chip${pos >= 0 ? ' active' : ''}`}
              onClick={() => toggleCart(n)}
              title={pos >= 0 ? `Orden ${pos + 1}` : `Carro ${n}`}
            >
              {n}
              {pos >= 0 && <sup>{pos + 1}</sup>}
            </button>
          )
        })}
      </div>
      {cartOrder.length > 0 && (
        <p className="hint" style={{ margin: '2px 0' }}>Orden registrado: {cartOrder.join(' â†’ ')}</p>
      )}
      <label>
        Observaciones
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </label>

      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !operators}>
          {busy ? 'Guardandoâ€¦' : 'Registrar clasificaciÃ³n'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â•â• Panel principal â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function ColdRoomPanel({ orgId, userId, role }) {
  // El auxiliar de producciÃ³n solo llega aquÃ­ con la tarea "recibir huevo" activa
  // (la pestaÃ±a se oculta sin el grant y la RLS de cold_room_stock lo refuerza).
  const canWrite = ['owner', 'admin', 'supervisor', 'coordinator', 'reception_operator', 'operator', 'auxiliary_production'].includes(role)
  // El recepcionista (personal de PLANTA) crea el LOTE de huevo con su fecha de postura para
  // ingresar el stock existente al cuarto frÃ­o. Los GALPONES son de granja â†’ no se crean aquÃ­
  // (la RLS de rooms tambiÃ©n se lo impide a recepciÃ³n).
  const canCreateBatch = ['owner', 'admin', 'supervisor', 'coordinator', 'reception_operator'].includes(role)
  const canCreateRoom = false
  const cr = useColdRoom(orgId, userId)
  const bt = useBatches(orgId, userId)

  const [rooms, setRooms] = useState([])
  const [plants, setPlants] = useState([])
  const [people, setPeople] = useState({})
  const [showStockForm, setShowStockForm] = useState(false)
  const [editStock, setEditStock] = useState(null)
  const [showClsForm, setShowClsForm] = useState(false)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('rooms').select('id, name, code, plant_id, type').order('code'),
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('name'),
      supabase.from('organization_members').select('user_id, profiles ( full_name, email )').eq('org_id', orgId),
    ]).then(([r, pl, t]) => {
      setRooms(r.data ?? [])
      setPlants(pl.data ?? [])
      const map = {}
      for (const row of t.data ?? []) map[row.user_id] = row.profiles?.full_name || row.profiles?.email || 'â€”'
      setPeople(map)
    })
  }, [orgId])

  // Crear galpÃ³n provisional (cÃ³digo Ãºnico por planta: constraint plant_id+code)
  const createRoom = async ({ plantId, name, type }) => {
    if (!plantId) return { error: 'Selecciona la granja/planta' }
    if (!name?.trim()) return { error: 'El nombre del galpÃ³n es obligatorio' }
    let nextNum = 1
    rooms
      .filter((r) => r.plant_id === plantId)
      .forEach((r) => {
        const m = /(\d+)\s*$/.exec(r.code || '')
        if (m) {
          const n = parseInt(m[1], 10)
          if (n >= nextNum) nextNum = n + 1
        }
      })
    const { data, error } = await supabase
      .from('rooms')
      .insert({ org_id: orgId, plant_id: plantId, name: name.trim(), code: `G${nextNum}`, type: type || 'other' })
      .select('id, name, code, plant_id, type')
      .single()
    if (error) return { error: error.message }
    setRooms((prev) => [...prev, data])
    return { room: data }
  }

  // Crear lote de huevo con su fecha de postura (queda en estado 'received'; gestiÃ³n lo edita)
  const createBatch = async ({ farmId, code, layDate }) => {
    if (!farmId) return { error: 'Selecciona la granja de origen' }
    if (!code?.trim()) return { error: 'El cÃ³digo del lote es obligatorio' }
    const { data, error } = await supabase
      .from('bird_batches')
      .insert({ org_id: orgId, farm_id: farmId, code: code.trim(), lay_date: layDate || null, created_by: userId, status: 'received' })
      .select('id, code')
      .single()
    if (error) return { error: error.message }
    await bt.reload()
    return { batch: data }
  }

  const batchCode = (id) => bt.batches.find((b) => b.id === id)?.code ?? 'â€”'
  const roomName = (id) => {
    const r = rooms.find((x) => x.id === id)
    return r ? `${r.name} (${r.code})` : 'â€”'
  }
  const nameOf = (id) => (id ? people[id] ?? 'â€”' : 'â€”')

  // Saldos ordenados por la tipificaciÃ³n: lote â†’ fecha â†’ galpÃ³n
  const orderedStock = useMemo(
    () =>
      [...cr.stock].sort(
        (a, b) =>
          batchCode(a.batch_id).localeCompare(batchCode(b.batch_id)) ||
          b.stock_date.localeCompare(a.stock_date) ||
          roomName(a.room_id).localeCompare(roomName(b.room_id))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cr.stock, bt.batches, rooms]
  )

  const kpis = useMemo(() => {
    let incubable = 0
    let total = 0
    const lotes = new Set()
    for (const s of cr.stock) {
      incubable += Number(s.counts?.incubable || 0)
      total += totalOf(s.counts)
      if (totalOf(s.counts) > 0) lotes.add(s.batch_id)
    }
    const clsToday = cr.classifications.filter((c) => c.activity_date === today()).length
    return { incubable, total, lotes: lotes.size, clsToday }
  }, [cr.stock, cr.classifications])

  const closeStockForm = () => {
    setShowStockForm(false)
    setEditStock(null)
  }

  const exportAll = async () => {
    await exportToExcel('cuarto-frio', [
      {
        name: 'Saldos',
        rows: orderedStock.map((s) => ({
          Lote: batchCode(s.batch_id),
          Fecha: s.stock_date,
          'GalpÃ³n': roomName(s.room_id),
          ...Object.fromEntries(COLD_ROOM_TYPES.map((t) => [t.label, Number(s.counts?.[t.code] || 0)])),
          Total: totalOf(s.counts),
          Observaciones: s.notes ?? '',
          'ActualizÃ³': nameOf(s.updated_by),
        })),
      },
      {
        name: 'Clasificaciones',
        rows: cr.classifications.map((c) => ({
          Fecha: c.activity_date,
          Tipo: c.classification_type === 'doble' ? 'Doble (24)' : 'Sencilla (12)',
          Carros: c.carts_count,
          Operarios: c.operators_count,
          Lote: c.batch_id ? batchCode(c.batch_id) : '',
          'GalpÃ³n': c.room_id ? roomName(c.room_id) : '',
          'Orden de carros': c.cart_numbers?.join(' â†’ ') ?? '',
          Observaciones: c.notes ?? '',
          'RegistrÃ³': nameOf(c.created_by),
        })),
      },
    ], {
      title: 'Cuarto frÃ­o Â· saldos y clasificaciones',
      module: 'RecepciÃ³n Â· cuarto frÃ­o',
    })
  }

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>Cuarto frÃ­o</h2>
          <span className="hint" style={{ margin: 0 }}>
            Saldos reales por lote, fecha y galpÃ³n Â· clasificaciÃ³n del huevo
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(cr.stock.length > 0 || cr.classifications.length > 0) && (
            <button className="chip ghost" onClick={exportAll}>â¬‡ Exportar Excel</button>
          )}
          <span className="pill live"><span className="dot" /> En vivo</span>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.incubable)}</span>
          <span className="kpi-label">Huevo incubable en saldo</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.total)}</span>
          <span className="kpi-label">Total huevos en cuarto frÃ­o</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{kpis.lotes}</span>
          <span className="kpi-label">Lotes con saldo</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{kpis.clsToday}</span>
          <span className="kpi-label">Clasificaciones hoy</span>
        </div>
      </div>

      {cr.error && <p className="msg error">{cr.error}</p>}

      {/* â”€â”€ Saldos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="admin-section-head">
        <span className="component-title" style={{ margin: 0 }}>Saldos en cuarto frÃ­o</span>
        {canWrite && !showStockForm && (
          <button className="chip ghost" onClick={() => setShowStockForm(true)}>+ Cargar saldo</button>
        )}
      </div>

      {showStockForm && (
        <StockForm
          batches={bt.batches}
          rooms={rooms}
          plants={plants}
          placements={bt.placements}
          initial={editStock}
          canCreateBatch={canCreateBatch}
          canCreateRoom={canCreateRoom}
          onCreateBatch={createBatch}
          onCreateRoom={createRoom}
          onSave={cr.saveStock}
          onCancel={closeStockForm}
        />
      )}

      {cr.loading ? (
        <p className="hint">Cargandoâ€¦</p>
      ) : orderedStock.length === 0 ? (
        <p className="hint">Sin saldos cargados. Usa â€œ+ Cargar saldoâ€ para registrar el inventario real.</p>
      ) : (
        <div className="admin-list">
          {orderedStock.slice(0, 40).map((s) => (
            <div key={s.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>â„ï¸</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{batchCode(s.batch_id)} Â· {fmtDate(s.stock_date)} Â· {roomName(s.room_id)}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  {COLD_ROOM_TYPES.map((t) => `${t.label} ${num(s.counts?.[t.code])}`).join(' Â· ')}
                  {s.updated_by ? ` Â· ${nameOf(s.updated_by)}` : ''}
                </span>
              </div>
              <span className="pill status ok">{num(totalOf(s.counts))}</span>
              {canWrite && (
                <>
                  <button
                    className="chip ghost"
                    onClick={() => {
                      setEditStock(s)
                      setShowStockForm(true)
                    }}
                  >
                    Actualizar
                  </button>
                  <button
                    className="chip ghost danger"
                    onClick={async () => {
                      if (window.confirm(`Â¿Eliminar el saldo de ${batchCode(s.batch_id)} Â· ${fmtDate(s.stock_date)} Â· ${roomName(s.room_id)}?`)) {
                        await cr.deleteStock(s.id)
                      }
                    }}
                  >
                    âœ•
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* â”€â”€ ClasificaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="admin-section-head" style={{ marginTop: 18 }}>
        <span className="component-title" style={{ margin: 0 }}>ClasificaciÃ³n del huevo</span>
        {canWrite && !showClsForm && (
          <button className="chip ghost" onClick={() => setShowClsForm(true)}>+ Registrar clasificaciÃ³n</button>
        )}
      </div>

      {showClsForm && (
        <ClassificationForm
          batches={bt.batches}
          rooms={rooms}
          onSave={cr.saveClassification}
          onCancel={() => setShowClsForm(false)}
        />
      )}

      {cr.classifications.length === 0 ? (
        <p className="hint">
          Sin clasificaciones registradas. Cada cargue de incubadora usa 12 carros: sencilla = 12, doble = 24.
        </p>
      ) : (
        <div className="admin-list">
          {cr.classifications.slice(0, 30).map((c) => (
            <div key={c.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>ðŸ›’</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>
                  {fmtDate(c.activity_date)} Â· {c.classification_type === 'doble' ? 'Doble (24)' : 'Sencilla (12)'} Â· {c.carts_count} carro{c.carts_count === 1 ? '' : 's'}
                </strong>
                <span className="hint" style={{ margin: 0 }}>
                  {c.operators_count} operario{c.operators_count === 1 ? '' : 's'}
                  {c.batch_id ? ` Â· Lote ${batchCode(c.batch_id)}` : ''}
                  {c.room_id ? ` Â· ${roomName(c.room_id)}` : ''}
                  {c.cart_numbers?.length ? ` Â· Orden ${c.cart_numbers.join(' â†’ ')}` : ''}
                  {c.created_by ? ` Â· ${nameOf(c.created_by)}` : ''}
                </span>
              </div>
              {canWrite && (
                <button
                  className="chip ghost danger"
                  onClick={async () => {
                    if (window.confirm(`Â¿Eliminar la clasificaciÃ³n del ${fmtDate(c.activity_date)}?`)) {
                      await cr.deleteClassification(c.id)
                    }
                  }}
                >
                  âœ•
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

