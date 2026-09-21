/**
 * =============================================================================
 * ARCHIVO: src/components/OperationsDataCenter.jsx
 * PROPÃ“SITO: MÃ³dulo "Datos" del perfil de Gerencia. Punto de arranque del pipeline
 *   automatizado de incubaciÃ³n: gerencia ingresa lotes (cÃ³digo, huevos por fecha),
 *   genera y publica la ORDEN DE CLASIFICACIÃ“N para recepciÃ³n, y registra las
 *   cargas actuales dentro de las incubadoras. Exporta el libro de Excel de la
 *   operaciÃ³n.
 * CÃ“MO FUNCIONA: usa useIncubationLots (lotes/Ã³rdenes) y useLoads (setter_loads),
 *   consulta plants/machines de la org, y reutiliza la config del mapa Petersime
 *   (336 huevos/bandeja Â· 16 bandejas/carro Â· 12 carros/mÃ¡quina).
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useIncubationLots, lotTotals } from '../features/production/hooks/useIncubationLots'
import { useLoads } from '../features/production/hooks/useLoads'
import { buildOperationModel, exportOperationBook } from '../lib/operationConsolidation'

const num = (n) => (n == null ? 0 : Math.round(Number(n))).toLocaleString('es-CO')
const num1 = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO', { maximumFractionDigits: 1 })
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''
const fmtDate = (v) =>
  v ? new Date(v + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }) : 'â€”'
const fmtDT = (v) =>
  v
    ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'â€”'

function today() {
  return new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD local
}

/** Edad del ciclo de incubaciÃ³n a partir de cycle_start_at â†’ "Nd Nh". */
function cycleAge(cycleStartAt) {
  if (!cycleStartAt) return null
  const diffMs = Date.now() - new Date(cycleStartAt).getTime()
  if (diffMs < 0) return null
  const hours = diffMs / 3_600_000
  return { hours, label: `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h` }
}

/** Paleta de cintas para los grupos de 12 carros (nombre + hex). */
const TAPE_PALETTE = [
  { name: 'Rojo', hex: '#e53935' },
  { name: 'Azul', hex: '#1e88e5' },
  { name: 'Verde', hex: '#43a047' },
  { name: 'Amarillo', hex: '#fdd835' },
  { name: 'Naranja', hex: '#fb8c00' },
  { name: 'Morado', hex: '#8e24aa' },
  { name: 'Blanco', hex: '#eceff1' },
  { name: 'Negro', hex: '#37474f' },
]

const LOT_STATUS_LABEL = {
  planned: 'Planeado',
  arrived: 'Recibido',
  classifying: 'En clasificaciÃ³n',
  classified: 'Clasificado',
  loaded: 'Cargado',
  closed: 'Cerrado',
}

/* â•â• Editor de posturas [{ productionDate, eggs }] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function PosturesEditor({ postures, onChange, label = 'Huevos incubables por fecha de postura' }) {
  const rows = postures.length ? postures : [{ productionDate: '', eggs: '' }]

  const update = (i, patch) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    onChange(next)
  }
  const addRow = () => onChange([...rows, { productionDate: '', eggs: '' }])
  const removeRow = (i) => {
    const next = rows.filter((_, idx) => idx !== i)
    onChange(next.length ? next : [{ productionDate: '', eggs: '' }])
  }

  return (
    <div style={{ margin: '6px 0' }}>
      <span className="hint" style={{ display: 'block', marginBottom: 4 }}>{label}</span>
      {rows.map((r, i) => (
        <div key={i} className="two-col" style={{ gap: 8, alignItems: 'end', marginBottom: 6 }}>
          <label style={{ margin: 0 }}>
            Fecha de postura
            <input
              type="date"
              value={r.productionDate || ''}
              max={today()}
              onChange={(e) => update(i, { productionDate: e.target.value })}
            />
          </label>
          <label style={{ margin: 0 }}>
            Huevos
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={r.eggs}
                onChange={(e) => update(i, { eggs: e.target.value })}
              />
              <button
                type="button"
                className="ghost small"
                onClick={() => removeRow(i)}
                title="Quitar fecha"
                style={{ flex: '0 0 auto' }}
              >
                âœ•
              </button>
            </div>
          </label>
        </div>
      ))}
      <button type="button" className="chip ghost" onClick={addRow}>
        + Agregar fecha
      </button>
    </div>
  )
}

/* â•â• Formulario de lote â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function LotForm({ initial, onSave, onCancel }) {
  const [code, setCode] = useState(initial?.code || '')
  const [origin, setOrigin] = useState(initial?.origin || '')
  const [isTreated, setIsTreated] = useState(!!initial?.is_treated)
  const [expected, setExpected] = useState(initial?.expected_arrival_date || '')
  const [priority, setPriority] = useState(initial?.priority ?? 0)
  const [postures, setPostures] = useState(
    initial?.postures?.length ? initial.postures.map((p) => ({ ...p })) : [{ productionDate: '', eggs: '' }]
  )
  const [notes, setNotes] = useState(initial?.notes || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const totals = lotTotals(postures.map((p) => ({ ...p, eggs: Number(p.eggs) || 0 })))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onSave({
      code,
      origin,
      isTreated,
      expectedArrivalDate: expected || null,
      priority,
      postures,
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
          CÃ³digo del lote
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. G-045" />
        </label>
        <label>
          Origen / granja <span className="hint" style={{ margin: 0 }}>(opcional)</span>
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Granja / lote de aves" />
        </label>
      </div>

      <PosturesEditor postures={postures} onChange={setPostures} />

      <div className="two-col">
        <label>
          Fecha esperada de llegada <span className="hint" style={{ margin: 0 }}>(opcional)</span>
          <input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </label>
        <label>
          Prioridad
          <input type="number" min="0" step="1" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </label>
      </div>

      <label className="check-row" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
        <input type="checkbox" checked={isTreated} onChange={(e) => setIsTreated(e.target.checked)} />
        <span>Huevo tratado</span>
      </label>

      <label>
        Notas <span className="hint" style={{ margin: 0 }}>(opcional)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones" />
      </label>

      <p className="hint" style={{ margin: '4px 0 8px', color: 'var(--accent)' }}>
        Total: <strong>{num(totals.eggs)}</strong> huevos Â· {num1(totals.trays)} bandejas Â·{' '}
        <strong>{num(totals.fullCarts)}</strong> carros
      </p>

      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !code.trim()}>
          {busy ? 'Guardandoâ€¦' : initial ? 'Guardar cambios' : 'Crear lote'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â•â• Formulario de carga actual (setter_loads) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function CurrentLoadForm({ lots, plants, machines, onCreate, onCancel }) {
  const [lote, setLote] = useState(lots[0]?.code || '')
  const [plantId, setPlantId] = useState(plants[0]?.id || '')
  const [machineId, setMachineId] = useState('')
  const [cycleStart, setCycleStart] = useState('')
  const [tapeName, setTapeName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const plantMachines = machines.filter(
    (m) => m.plant_id === plantId && (m.type === 'setter' || m.type === 'combo') && m.status !== 'decommissioned'
  )
  const tape = TAPE_PALETTE.find((t) => t.name === tapeName)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onCreate({
      plantId,
      machineId,
      lote,
      cycleStartAt: cycleStart ? new Date(cycleStart).toISOString() : null,
      tapeColor: tape?.hex || null,
      tapeColorName: tape?.name || null,
    })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <div className="two-col">
        <label>
          Lote
          {lots.length ? (
            <select value={lote} onChange={(e) => setLote(e.target.value)}>
              {lots.map((l) => (
                <option key={l.id} value={l.code}>{l.code}</option>
              ))}
              <option value="">â€” Otro (escribir) â€”</option>
            </select>
          ) : (
            <input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="CÃ³digo del lote" />
          )}
        </label>
        <label>
          Planta de incubaciÃ³n
          <select value={plantId} onChange={(e) => { setPlantId(e.target.value); setMachineId('') }}>
            {plants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </label>
      </div>
      {lots.length > 0 && lote === '' && (
        <label>
          CÃ³digo del lote
          <input autoFocus onChange={(e) => setLote(e.target.value)} placeholder="Escriba el cÃ³digo" />
        </label>
      )}
      <label>
        Incubadora
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
          <option value="">â€” Selecciona la incubadora â€”</option>
          {plantMachines.map((m) => (<option key={m.id} value={m.id}>{m.name} ({m.code})</option>))}
        </select>
      </label>
      <div className="two-col">
        <label>
          Inicio del ciclo de incubaciÃ³n
          <input type="datetime-local" value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} />
        </label>
        <label>
          Color de cinta (grupo de carros)
          <select value={tapeName} onChange={(e) => setTapeName(e.target.value)}>
            <option value="">â€” Sin cinta â€”</option>
            {TAPE_PALETTE.map((t) => (<option key={t.name} value={t.name}>{t.name}</option>))}
          </select>
        </label>
      </div>
      {tape && (
        <p className="hint" style={{ margin: '2px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: tape.hex, border: '1px solid #0003', display: 'inline-block' }} />
          Cinta {tape.name}
        </p>
      )}
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !machineId || !lote?.trim()}>
          {busy ? 'Registrandoâ€¦' : 'Registrar carga'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â•â• Panel principal â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function OperationsDataCenter({ orgId, userId, userName }) {
  const api = useIncubationLots(orgId, userId)
  const ld = useLoads(orgId, userId)
  const [tab, setTab] = useState('lotes')
  const [msg, setMsg] = useState(null)
  const [showLotForm, setShowLotForm] = useState(false)
  const [editingLot, setEditingLot] = useState(null)
  const [showLoadForm, setShowLoadForm] = useState(false)
  const [model, setModel] = useState(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState(null)
  const [exporting, setExporting] = useState(false)

  const [plants, setPlants] = useState([])
  const [machines, setMachines] = useState([])

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('created_at'),
      supabase.from('machines').select('id, plant_id, name, code, type, status'),
    ]).then(([p, m]) => {
      // Plantas de incubaciÃ³n (las granjas usan prefijo G-)
      setPlants((p.data ?? []).filter((x) => !(x.code?.startsWith('G') || x.name?.startsWith('G-'))))
      setMachines(m.data ?? [])
    })
  }, [orgId])

  const machineName = (id) => {
    const m = machines.find((x) => x.id === id)
    return m ? `${m.name} (${m.code})` : 'â€”'
  }

  // buildClassificationOrder estÃ¡ memoizado sobre `lots`; recalcular por render es barato.
  const preview = api.buildClassificationOrder()
  const activeLots = useMemo(
    () => api.lots.filter((l) => ['planned', 'arrived'].includes(l.status)),
    [api.lots]
  )
  const totalPlannedEggs = useMemo(
    () => activeLots.reduce((s, l) => s + lotTotals(l.postures).eggs, 0),
    [activeLots]
  )
  const activeLoads = ld.loads.filter((l) => l.cycle_start_at || l.loaded_at)

  const flash = (t) => {
    setMsg(t)
    setTimeout(() => setMsg(null), 3500)
  }

  const saveLot = async (payload) => {
    const res = editingLot
      ? await api.updateLot(editingLot.id, payload)
      : await api.createLot(payload)
    if (!res.error) {
      flash(editingLot ? 'Lote actualizado.' : 'Lote creado.')
      setEditingLot(null)
    }
    return res
  }

  const publish = async () => {
    if (!preview.items.length) {
      flash('No hay lotes con posturas para clasificar.')
      return
    }
    const res = await api.publishClassificationOrder({ items: preview.items })
    if (res.error) flash(res.error)
    else flash('Orden de clasificaciÃ³n publicada y notificada a recepciÃ³n.')
  }

  const createLoad = async (payload) => {
    const res = await ld.createPlannedLoad(payload)
    if (!res.error) flash('Carga registrada en la incubadora.')
    return res
  }

  const loadModel = async () => {
    setModelLoading(true)
    setModelError(null)
    try {
      const m = await buildOperationModel(orgId)
      setModel(m)
      return m
    } catch (e) {
      setModelError(e?.message || 'No se pudo consolidar la operaciÃ³n')
      return null
    } finally {
      setModelLoading(false)
    }
  }

  const exportConsolidated = async () => {
    setExporting(true)
    try {
      const m = model || (await buildOperationModel(orgId))
      setModel(m)
      await exportOperationBook({ orgId, orgName: undefined, userName, model: m })
      flash('Libro Power BI generado (modelo en estrella listo para cargar).')
    } catch (e) {
      flash(`No se pudo exportar: ${e?.message || e}`)
    } finally {
      setExporting(false)
    }
  }

  const TABS = [
    { id: 'lotes', label: 'Lotes' },
    { id: 'orden', label: 'Orden de clasificaciÃ³n' },
    { id: 'cargas', label: 'Cargas actuales' },
    { id: 'consolidado', label: 'Consolidado (BI)' },
  ]

  // Cargar el modelo consolidado al abrir la pestaÃ±a.
  useEffect(() => {
    if (tab === 'consolidado' && !model && !modelLoading) loadModel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>Datos de operaciÃ³n</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Hola{firstName(userName) ? `, ${firstName(userName)}` : ''}. Ingresa los lotes, publica la orden de
            clasificaciÃ³n para recepciÃ³n y registra las cargas dentro de las incubadoras.
            {api.eggsPerCart ? ` Â· 1 carro = ${num(api.eggsPerCart)} huevos (${api.traysPerCart} bandejas)` : ''}
          </p>
        </div>
        <button type="button" className="chip ghost" onClick={exportConsolidated} disabled={exporting}>
          {exporting ? 'Generandoâ€¦' : 'â¬‡ Libro Power BI'}
        </button>
      </div>

      {api.error && <p className="msg error" style={{ marginTop: 8 }}>{api.error}</p>}
      {msg && <p className="msg" style={{ marginTop: 8 }}>{msg}</p>}

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{activeLots.length}</span>
          <span className="kpi-label">Lotes por clasificar</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(totalPlannedEggs)}</span>
          <span className="kpi-label">Huevos planeados</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{preview.groupCount}</span>
          <span className="kpi-label">Grupos de 12 carros</span>
        </div>
        <div className={`kpi-card${api.activeOrders.length ? ' warn' : ''}`}>
          <span className="kpi-value">{api.activeOrders.length}</span>
          <span className="kpi-label">Ã“rdenes activas</span>
        </div>
      </div>

      {/* Sub-pestaÃ±as */}
      <div className="seg" role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0 12px' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`chip${tab === t.id ? ' active' : ' ghost'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* â”€â”€ LOTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'lotes' && (
        <>
          <div className="admin-section-head">
            <span className="component-title" style={{ margin: 0 }}>Lotes de huevo</span>
            {!showLotForm && (
              <button className="chip ghost" onClick={() => { setEditingLot(null); setShowLotForm(true) }}>
                + Nuevo lote
              </button>
            )}
          </div>

          {showLotForm && (
            <LotForm
              initial={editingLot}
              onSave={saveLot}
              onCancel={() => { setShowLotForm(false); setEditingLot(null) }}
            />
          )}

          {api.loading && !api.lots.length ? (
            <p className="hint">Cargando lotesâ€¦</p>
          ) : api.lots.length === 0 ? (
            <p className="hint">AÃºn no hay lotes. Crea el primero con Â«+ Nuevo loteÂ».</p>
          ) : (
            <div className="admin-list">
              {api.lots.map((l) => {
                const t = lotTotals(l.postures)
                return (
                  <div key={l.id} className="admin-row" style={{ margin: 0, alignItems: 'flex-start' }}>
                    <span>ðŸ¥š</span>
                    <div className="admin-row-main" style={{ flex: 1 }}>
                      <strong>
                        {l.code}
                        {l.is_treated ? ' Â· tratado' : ''}
                        {l.origin ? ` Â· ${l.origin}` : ''}
                      </strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {num(t.eggs)} huevos Â· {num1(t.trays)} bandejas Â· {num(t.fullCarts)} carros
                        {l.expected_arrival_date ? ` Â· llega ${fmtDate(l.expected_arrival_date)}` : ''}
                      </span>
                      <span className="hint" style={{ margin: 0, fontSize: '0.78rem' }}>
                        {(l.postures || []).map((p) => `${fmtDate(p.productionDate)}: ${num(p.eggs)}`).join('  Â·  ') || 'Sin posturas'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <span className="pill status">{LOT_STATUS_LABEL[l.status] || l.status}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => { setEditingLot(l); setShowLotForm(true) }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={async () => {
                            if (window.confirm(`Â¿Eliminar el lote ${l.code}?`)) {
                              const r = await api.deleteLot(l.id)
                              if (r.error) flash(r.error)
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* â”€â”€ ORDEN DE CLASIFICACIÃ“N â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'orden' && (
        <>
          <div className="admin-section-head">
            <span className="component-title" style={{ margin: 0 }}>
              Vista previa (FIFO por fecha de postura)
            </span>
            <button className="primary small" onClick={publish} disabled={!preview.items.length}>
              Publicar orden a recepciÃ³n
            </button>
          </div>

          {!preview.items.length ? (
            <p className="hint">
              No hay lotes Â«PlaneadoÂ» o Â«RecibidoÂ» con huevos. Crea lotes en la pestaÃ±a Â«LotesÂ».
            </p>
          ) : (
            <>
              <p className="hint" style={{ margin: '0 0 8px' }}>
                {num(preview.totalEggs)} huevos Â· {num1(preview.totalTrays)} bandejas Â·{' '}
                <strong>{preview.totalCarts}</strong> carros Â·{' '}
                <strong>{preview.groupCount}</strong> grupo{preview.groupCount === 1 ? '' : 's'} de 12
              </p>
              <div className="admin-list">
                {preview.items.map((it, i) => (
                  <div key={`${it.lotId}-${it.productionDate}-${i}`} className="admin-row compact" style={{ margin: 0 }}>
                    <span className="pill" style={{ minWidth: 28, justifyContent: 'center' }}>{i + 1}</span>
                    <div className="admin-row-main" style={{ flex: 1 }}>
                      <strong>{it.code}{it.isTreated ? ' Â· tratado' : ''}</strong>
                      <span className="hint" style={{ margin: 0 }}>
                        Postura {fmtDate(it.productionDate)} Â· {num(it.eggs)} huevos Â· {num1(it.trays)} bandejas Â· {Math.ceil(it.carts)} carros
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="section-title" style={{ margin: '20px 0 8px' }}>Ã“rdenes publicadas</h3>
          {api.orders.length === 0 ? (
            <p className="hint">Sin Ã³rdenes publicadas todavÃ­a.</p>
          ) : (
            <div className="admin-list">
              {api.orders.map((o) => {
                const eggs = (o.items || []).reduce((s, i) => s + (Number(i.eggs) || 0), 0)
                const lotCount = new Set((o.items || []).map((i) => i.lotId)).size
                return (
                  <div key={o.id} className="admin-row compact" style={{ margin: 0 }}>
                    <span>{o.status === 'published' || o.status === 'in_progress' ? 'ðŸ“‹' : 'âœ…'}</span>
                    <div className="admin-row-main" style={{ flex: 1 }}>
                      <strong>{lotCount} lote{lotCount === 1 ? '' : 's'} Â· {num(eggs)} huevos Â· {o.group_count} grupo{o.group_count === 1 ? '' : 's'}</strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {o.published_at ? `Publicada ${fmtDT(o.published_at)}` : `Creada ${fmtDT(o.created_at)}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="pill status">{o.status}</span>
                      {(o.status === 'published' || o.status === 'in_progress') && (
                        <button
                          type="button"
                          className="ghost small"
                          onClick={async () => {
                            if (window.confirm('Â¿Cancelar esta orden de clasificaciÃ³n?')) {
                              const r = await api.cancelOrder(o.id)
                              if (r.error) flash(r.error)
                            }
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* â”€â”€ CARGAS ACTUALES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'cargas' && (
        <>
          <div className="admin-section-head">
            <span className="component-title" style={{ margin: 0 }}>Cargas dentro de las incubadoras</span>
            {!showLoadForm && (
              <button className="chip ghost" onClick={() => setShowLoadForm(true)} disabled={!plants.length}>
                + Registrar carga
              </button>
            )}
          </div>

          {!plants.length && (
            <p className="hint">No hay plantas de incubaciÃ³n configuradas. AgrÃ©galas en Â«Plantas y planosÂ».</p>
          )}

          {showLoadForm && (
            <CurrentLoadForm
              lots={api.lots}
              plants={plants}
              machines={machines}
              onCreate={createLoad}
              onCancel={() => setShowLoadForm(false)}
            />
          )}
          {ld.error && <p className="msg error">{ld.error}</p>}

          {activeLoads.length === 0 ? (
            <p className="hint">Sin cargas registradas. Registra el estado actual de las incubadoras.</p>
          ) : (
            <div className="admin-list">
              {activeLoads.map((l) => {
                const age = cycleAge(l.cycle_start_at)
                return (
                  <div key={l.id} className="admin-row compact" style={{ margin: 0 }}>
                    <span>ðŸ£</span>
                    <div className="admin-row-main" style={{ flex: 1 }}>
                      <strong>{l.lote} Â· {machineName(l.machine_id)}</strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {l.cycle_start_at ? `Inicio ciclo ${fmtDT(l.cycle_start_at)}` : `Cargue ${fmtDT(l.loaded_at)}`}
                        {age ? ` Â· Edad ${age.label}` : ''}
                      </span>
                    </div>
                    {l.tape_color_name && (
                      <span className="pill" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: l.tape_color || '#999', display: 'inline-block' }} />
                        {l.tape_color_name}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* â”€â”€ CONSOLIDADO (BI) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === 'consolidado' && (
        <>
          <div className="admin-section-head">
            <span className="component-title" style={{ margin: 0 }}>
              Consolidado de la operaciÃ³n (modelo Power BI)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ghost small" onClick={loadModel} disabled={modelLoading}>
                {modelLoading ? 'Consolidandoâ€¦' : 'Actualizar'}
              </button>
              <button className="primary small" onClick={exportConsolidated} disabled={exporting}>
                {exporting ? 'Generandoâ€¦' : 'â¬‡ Exportar libro Power BI'}
              </button>
            </div>
          </div>

          <p className="hint" style={{ margin: '0 0 8px' }}>
            Une lotes, llegadas, clasificaciÃ³n, cargue, transferencias y nacimientos en un modelo en estrella
            (dimensiones + hechos + KPIs + hoja Â«ModeloÂ» con las relaciones), listo para cargar en Power BI.
          </p>

          {modelError && <p className="msg error">{modelError}</p>}
          {modelLoading && !model ? (
            <p className="hint">Consolidando la operaciÃ³nâ€¦</p>
          ) : model ? (
            <>
              <div className="kpi-grid" style={{ marginTop: 8 }}>
                {model.kpis.map((k) => (
                  <div key={k.label} className="kpi-card">
                    <span className="kpi-value">{num(k.value)}</span>
                    <span className="kpi-label">{k.label}</span>
                    <span className="hint" style={{ margin: '2px 0 0', fontSize: '0.72rem' }}>{k.unit}</span>
                  </div>
                ))}
              </div>

              {model.breakdowns?.lotesPorEstado?.length > 0 && (
                <>
                  <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Lotes por estado</h3>
                  <div className="admin-list">
                    {model.breakdowns.lotesPorEstado.map((b) => (
                      <div key={b.key} className="admin-row compact" style={{ margin: 0 }}>
                        <div className="admin-row-main" style={{ flex: 1 }}>
                          <strong>{LOT_STATUS_LABEL[b.key] || b.key}</strong>
                        </div>
                        <span className="pill status">{b.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {model.breakdowns?.carguesPorMaquina?.length > 0 && (
                <>
                  <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Cargues por incubadora</h3>
                  <div className="admin-list">
                    {model.breakdowns.carguesPorMaquina.map((b) => (
                      <div key={b.key} className="admin-row compact" style={{ margin: 0 }}>
                        <div className="admin-row-main" style={{ flex: 1 }}>
                          <strong>{b.key}</strong>
                        </div>
                        <span className="pill status">{b.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <p className="hint" style={{ margin: '16px 0 0', fontSize: '0.78rem' }}>
                El libro incluye {model.sheets.length} hojas ({model.counts.dates} fechas Â· {model.counts.carts} carros Â·{' '}
                {model.counts.loads} cargues Â· {model.counts.hatches} nacimientos). En Power BI: marca Â«Dim_FechaÂ» como
                tabla de fechas y crea las relaciones de la hoja Â«ModeloÂ».
              </p>
            </>
          ) : (
            <p className="hint">Pulsa Â«ActualizarÂ» para consolidar la operaciÃ³n.</p>
          )}
        </>
      )}
    </div>
  )
}

