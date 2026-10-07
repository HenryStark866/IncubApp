/**
 * =============================================================================
 * ARCHIVO: src/components/FarmBatchesPanel.jsx
 * PROPÓSITO: Componente UI «FarmBatchesPanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBatches } from '../hooks/useBatches'
import { exportToExcel } from '../lib/exportExcel'

/**
 * Levantes / lotes en levante.
 *  - Recepción del lote → galpones de levante.
 *  - Coordinador aprueba e inicia el levante.
 *  - «Producción» = grading (pesaje) y traslado del lote a un módulo de producción.
 */

const BATCH_STATUS = {
  received: { label: 'Por aprobar', cls: 'warn' },
  levante: { label: 'Lote en levante', cls: '' },
  production: { label: 'En producción', cls: 'ok' },
  closed: { label: 'Cerrado', cls: 'idle' },
}
const statusOf = (v) => BATCH_STATUS[v] ?? { label: v, cls: '' }

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'received', label: 'Por aprobar' },
  { value: 'levante', label: 'En levante' },
  { value: 'production', label: 'En producción' },
]

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')

// Galpones reales para distribuir aves: salas tipificadas como levante/producción.
// Las salas "MODULO ..." son contenedores del plano y se excluyen. Si la granja
// aún no tiene galpones tipificados, se muestran todas sus salas para no bloquear.
const isGalpon = (r) => (r.type === 'levante' || r.type === 'produccion') && !/^\s*MODUL/i.test(r.name || '')
const galponesDe = (list, stage) => {
  const barns = list.filter(isGalpon)
  if (barns.length === 0) return list
  const byStage = barns.filter((r) => r.type === stage)
  const out = byStage.length > 0 ? byStage : barns
  return [...out].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { numeric: true }))
}

/* ══ Formulario de recepción (supervisor) ════════════════════ */
function NewReceptionForm({ farms, rooms, onCreate, onCancel }) {
  const [form, setForm] = useState({
    farmId: farms[0]?.id ?? '',
    code: '',
    arrivalDate: new Date().toLocaleDateString('sv-SE'),
    hens: '',
    roosters: '',
    notes: '',
  })
  const [dist, setDist] = useState([{ roomId: '', hens: '', roosters: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // La recepción distribuye en galpones de LEVANTE
  const farmRooms = galponesDe(rooms.filter((r) => r.plant_id === form.farmId), 'levante')

  const setRow = (i, k) => (e) =>
    setDist((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: e.target.value } : r)))
  const addRow = () => setDist((rows) => [...rows, { roomId: '', hens: '', roosters: '' }])
  const removeRow = (i) => setDist((rows) => rows.filter((_, idx) => idx !== i))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onCreate({ ...form, distribution: dist })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <div className="two-col">
        <label>
          Granja
          <select value={form.farmId} onChange={(e) => setForm((f) => ({ ...f, farmId: e.target.value }))}>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label>
          Nº de lote
          <input type="text" value={form.code} onChange={set('code')} placeholder="Ej. L-2026-07" autoFocus />
        </label>
      </div>
      <div className="two-col">
        <label>
          Fecha de llegada
          <input type="date" value={form.arrivalDate} onChange={set('arrivalDate')} />
        </label>
        <label>
          Total pollas (hembras)
          <input type="number" min="0" value={form.hens} onChange={set('hens')} placeholder="0" />
        </label>
      </div>
      <div className="two-col">
        <label>
          Total pollos (machos)
          <input type="number" min="0" value={form.roosters} onChange={set('roosters')} placeholder="0" />
        </label>
        <label>
          Observaciones
          <input type="text" value={form.notes} onChange={set('notes')} placeholder="Opcional" />
        </label>
      </div>

      <p className="component-title" style={{ margin: '6px 0 4px' }}>Distribución por galpón / módulo</p>
      {farmRooms.length === 0 && (
        <p className="hint" style={{ margin: '0 0 6px' }}>
          Esta granja no tiene galpones en el plano todavía. Puedes registrar el lote y distribuirlo luego.
        </p>
      )}
      {dist.map((r, i) => (
        <div className="two-col" key={i} style={{ alignItems: 'end' }}>
          <label>
            Galpón (levante)
            <select value={r.roomId} onChange={setRow(i, 'roomId')}>
              <option value="">— Selecciona —</option>
              {farmRooms.map((rm) => (
                <option key={rm.id} value={rm.id}>{rm.name} ({rm.code})</option>
              ))}
            </select>
          </label>
          <div className="two-col" style={{ gap: 8 }}>
            <label>
              Gallinas
              <input type="number" min="0" value={r.hens} onChange={setRow(i, 'hens')} placeholder="0" />
            </label>
            <label>
              Gallos
              <input type="number" min="0" value={r.roosters} onChange={setRow(i, 'roosters')} placeholder="0" />
            </label>
          </div>
          {dist.length > 1 && (
            <button className="ghost danger" type="button" onClick={() => removeRow(i)} title="Quitar fila" style={{ marginBottom: 2 }}>✕</button>
          )}
        </div>
      ))}
      <div className="actions row">
        <button className="ghost" type="button" onClick={addRow} disabled={farmRooms.length === 0}>+ Agregar galpón</button>
      </div>

      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !form.farmId || form.code.trim().length < 1}>
          {busy ? 'Registrando…' : 'Registrar recepción'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* ══ Aprobación e inicio de levante (coordinador de granja) ═══ */
function ApproveForm({ onApprove, onCancel }) {
  const [ageWeeks, setAgeWeeks] = useState('')
  const [levanteDays, setLevanteDays] = useState('')
  const [feedKg, setFeedKg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    await onApprove({ ageWeeks, levanteDays, feedKg })
    setBusy(false)
  }

  return (
    <div className="inline-form compact">
      <p className="hint" style={{ margin: 0 }}>
        Al aprobar defines los parámetros de levante e inicias el ciclo. (Las vacunas se configuran en una etapa posterior.)
      </p>
      <div className="two-col">
        <label>
          Edad inicial (semanas)
          <input type="number" min="0" step="any" value={ageWeeks} onChange={(e) => setAgeWeeks(e.target.value)} placeholder="Ej. 16" autoFocus />
        </label>
        <label>
          Tiempo estimado de levante (días)
          <input type="number" min="1" value={levanteDays} onChange={(e) => setLevanteDays(e.target.value)} placeholder="Ej. 140" />
        </label>
      </div>
      <label>
        Comida por día (kg)
        <input type="number" min="0" step="any" value={feedKg} onChange={(e) => setFeedKg(e.target.value)} placeholder="Ej. 120" />
      </label>
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy}>
          {busy ? 'Aprobando…' : '✓ Aprobar e iniciar levante'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* ══ Grading: pesaje + paso a módulo de producción ═══════════ */
function GreadingForm({ rooms, initial, onGrade, onCancel }) {
  const [avgWeight, setAvgWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [dist, setDist] = useState(initial.length ? initial : [{ roomId: '', hens: '', roosters: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const setRow = (i, k) => (e) => setDist((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: e.target.value } : r)))
  const addRow = () => setDist((rows) => [...rows, { roomId: '', hens: '', roosters: '' }])
  const removeRow = (i) => setDist((rows) => rows.filter((_, idx) => idx !== i))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onGrade({ avgWeight, notes, placements: dist })
    setBusy(false)
    if (error) setErr(error)
  }

  return (
    <div className="inline-form compact">
      <p className="hint" style={{ margin: 0 }}>
        Grading: pesaje y reubicación del lote en un módulo de producción. Deja de ser levante y
        pasa a estado «en producción».
      </p>
      <label>
        Peso promedio de las aves (gramos, opcional)
        <input type="number" min="0" step="any" value={avgWeight} onChange={(e) => setAvgWeight(e.target.value)} placeholder="Ej. 1450" />
      </label>
      <p className="component-title" style={{ margin: '4px 0 2px' }}>
        Distribución en módulo de producción
      </p>
      {rooms.length === 0 && (
        <p className="hint" style={{ margin: '0 0 6px' }}>Esta granja no tiene galpones en el plano; agrégalos para distribuir.</p>
      )}
      {dist.map((r, i) => (
        <div className="two-col" key={i} style={{ alignItems: 'end' }}>
          <label>
            Galpón (producción)
            <select value={r.roomId} onChange={setRow(i, 'roomId')}>
              <option value="">— Selecciona —</option>
              {rooms.map((rm) => (<option key={rm.id} value={rm.id}>{rm.name} ({rm.code})</option>))}
            </select>
          </label>
          <div className="two-col" style={{ gap: 8 }}>
            <label>Gallinas<input type="number" min="0" value={r.hens} onChange={setRow(i, 'hens')} placeholder="0" /></label>
            <label>Gallos<input type="number" min="0" value={r.roosters} onChange={setRow(i, 'roosters')} placeholder="0" /></label>
          </div>
          {dist.length > 1 && (
            <button className="ghost danger" type="button" onClick={() => removeRow(i)} style={{ marginBottom: 2 }}>✕</button>
          )}
        </div>
      ))}
      <div className="actions row">
        <button className="ghost" type="button" onClick={addRow} disabled={rooms.length === 0}>+ Agregar galpón</button>
      </div>
      <label>
        Observaciones del grading
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </label>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy}>
          {busy ? 'Procesando…' : '✓ Grading y pasar a producción'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* ══ Registro diario del galpón (comida + mortalidad) ════════ */
function DailyLogForm({ rooms, onSave, onCancel }) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '')
  const [logDate, setLogDate] = useState(new Date().toLocaleDateString('sv-SE'))
  const [feedKg, setFeedKg] = useState('')
  const [deaths, setDeaths] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onSave({ roomId, logDate, feedKg, deaths, notes })
    setBusy(false)
    if (error) setErr(error)
  }

  return (
    <div className="inline-form compact">
      <p className="hint" style={{ margin: 0 }}>
        Registro diario del galpón: consumo de comida y aves muertas. (Se sobrescribe si ya existe ese día.)
      </p>
      <div className="two-col">
        <label>
          Galpón
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.length === 0 && <option value="">— Sin galpones —</option>}
            {rooms.map((rm) => (<option key={rm.id} value={rm.id}>{rm.name} ({rm.code})</option>))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        </label>
      </div>
      <div className="two-col">
        <label>Consumo de comida (kg)<input type="number" min="0" step="any" value={feedKg} onChange={(e) => setFeedKg(e.target.value)} placeholder="0" /></label>
        <label>Aves muertas<input type="number" min="0" value={deaths} onChange={(e) => setDeaths(e.target.value)} placeholder="0" /></label>
      </div>
      <label>Observaciones<input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></label>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy || !roomId}>{busy ? 'Guardando…' : 'Guardar registro'}</button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* ══ Panel principal ═════════════════════════════════════════ */
export default function FarmBatchesPanel({ orgId, userId, role, area }) {
  // El coordinador de GRANJA (área 'farm') aprueba; el supervisor/operario de recepción registra. Owner/admin todo.
  const isFarmCoord = role === 'coordinator' && area === 'farm'
  const canReceive = ['owner', 'admin', 'supervisor', 'reception_operator'].includes(role) || isFarmCoord
  const canApprove = ['owner', 'admin', 'management'].includes(role) || isFarmCoord
  const canDelete = ['owner', 'admin'].includes(role)
  // El grading (paso a producción) y el registro diario: supervisor o coord. de granja
  const canGrade = ['owner', 'admin', 'supervisor'].includes(role) || isFarmCoord
  const canLog = canGrade

  const bt = useBatches(orgId, userId)
  const [farms, setFarms] = useState([])
  const [rooms, setRooms] = useState([])
  const [people, setPeople] = useState({})
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [gradingId, setGradingId] = useState(null)
  const [loggingId, setLoggingId] = useState(null)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('created_at'),
      supabase.from('rooms').select('id, plant_id, name, code, type').order('code'),
      supabase.from('organization_members').select('user_id, profiles ( full_name, email )').eq('org_id', orgId),
    ]).then(([p, r, t]) => {
      setFarms((p.data ?? []).filter((x) => x.code?.startsWith('G') || x.name?.startsWith('G-')))
      setRooms(r.data ?? [])
      const map = {}
      for (const row of t.data ?? []) map[row.user_id] = row.profiles?.full_name || row.profiles?.email || '—'
      setPeople(map)
    })
  }, [orgId, bt.batches.length])

  const farmName = (id) => farms.find((f) => f.id === id)?.name ?? 'Granja'
  const roomName = (id) => {
    const r = rooms.find((x) => x.id === id)
    return r ? `${r.name} (${r.code})` : 'Galpón'
  }
  const nameOf = (id) => (id ? people[id] ?? '—' : '—')
  const placementsOf = (batchId) => bt.placements.filter((p) => p.batch_id === batchId)
  const logsOf = (batchId) => bt.dailyLogs.filter((l) => l.batch_id === batchId)

  const counts = useMemo(() => {
    const c = { received: 0, levante: 0, production: 0, closed: 0 }
    for (const b of bt.batches) c[b.status] = (c[b.status] ?? 0) + 1
    return c
  }, [bt.batches])

  const visible = filter === 'all' ? bt.batches : bt.batches.filter((b) => b.status === filter)

  const onDelete = async (b) => {
    if (!window.confirm(`¿Eliminar el lote ${b.code}? Se borrará también su distribución. Irreversible.`)) return
    await bt.deleteBatch(b.id)
  }

  const BATCH_STATUS_ES = {
    received: 'Por aprobar',
    levante: 'Lote en levante',
    production: 'En producción (post-grading)',
    closed: 'Cerrado',
  }
  const exportBatches = async () => {
    await exportToExcel('granjas-levantes-lotes', [
      {
        name: 'Lotes levante-producción',
        rows: bt.batches.map((b) => ({
          Lote: b.code,
          Granja: farmName(b.farm_id),
          Estado: BATCH_STATUS_ES[b.status] ?? b.status,
          Llegada: b.arrival_date ?? '',
          Gallinas: b.hens_received ?? 0,
          Gallos: b.roosters_received ?? 0,
          'Edad llegada (sem)': b.arrival_age_weeks ?? '',
          'Levante (días est.)': b.estimated_levante_days ?? '',
          'Comida diaria (kg)': b.daily_feed_kg ?? '',
          'Peso grading (g)': b.avg_weight_g ?? '',
          'Inicio producción (post-grading)': b.production_started_at
            ? b.production_started_at.slice(0, 10)
            : '',
          Observaciones: b.notes ?? '',
        })),
      },
      {
        name: 'Registro diario',
        rows: bt.dailyLogs.map((l) => ({
          Fecha: l.log_date,
          Lote: bt.batches.find((b) => b.id === l.batch_id)?.code ?? '',
          'Galpón': roomName(l.room_id),
          'Comida (kg)': l.feed_kg ?? '',
          Mortalidad: l.deaths ?? 0,
          Observaciones: l.notes ?? '',
          'Registró': nameOf(l.recorded_by),
        })),
      },
    ], {
      title: 'Levantes y lotes de granja',
      module: 'Granjas · levantes',
    })
  }

  return (
    <div className="card wide">
      <div className="card-head">
        <h2>Levantes · Lotes de aves</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {bt.batches.length > 0 && (
            <button className="chip ghost" onClick={exportBatches}>⬇ Exportar Excel</button>
          )}
          {counts.received > 0 && <span className="pill status warn">{counts.received} por aprobar</span>}
        </div>
      </div>

      <div className="kpi-grid" style={{ marginTop: 10 }}>
        <div className={`kpi-card${counts.received > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{counts.received}</span>
          <span className="kpi-label">Por aprobar</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{counts.levante}</span>
          <span className="kpi-label">Lotes en levante</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{counts.production}</span>
          <span className="kpi-label">En producción</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{bt.batches.length}</span>
          <span className="kpi-label">Lotes totales</span>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        <strong>Levante</strong> = lote de aves en galpones de levante.{' '}
        <strong>Producción</strong> = tras el grading (pesaje), el lote se mueve a un módulo de
        producción.
      </p>

      <div className="admin-section-head">
        <div className="plant-chips" style={{ margin: 0 }}>
          {FILTERS.map((f) => (
            <button key={f.value} className={filter === f.value ? 'chip active' : 'chip'} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        {canReceive && !showForm && (
          <button className="chip ghost" onClick={() => setShowForm(true)}>+ Registrar recepción</button>
        )}
      </div>

      {showForm && (
        <NewReceptionForm farms={farms} rooms={rooms} onCreate={bt.createReception} onCancel={() => setShowForm(false)} />
      )}
      {!canReceive && (
        <p className="hint">Vista de solo lectura. La recepción la registra el supervisor u operario de recepción.</p>
      )}
      {bt.error && <p className="msg error">{bt.error}</p>}

      {bt.loading ? (
        <p className="hint">Cargando lotes…</p>
      ) : visible.length === 0 ? (
        <p className="hint">No hay lotes{filter !== 'all' ? ' con ese estado' : ' registrados todavía'}.</p>
      ) : (
        <div className="admin-list">
          {visible.map((b) => {
            const st = statusOf(b.status)
            const places = placementsOf(b.id)
            const levantePlaces = places.filter((p) => p.stage === 'levante')
            const prodPlaces = places.filter((p) => p.stage === 'production')
            const shownPlaces = b.status === 'production' ? prodPlaces : levantePlaces
            const farmRooms = rooms.filter((r) => r.plant_id === b.farm_id)
            const prodRooms = prodPlaces.map((p) => rooms.find((r) => r.id === p.room_id)).filter(Boolean)
            const logs = logsOf(b.id)
            const deathsTotal = logs.reduce((s, l) => s + (Number(l.deaths) || 0), 0)
            const lastLog = logs[0] // dailyLogs viene desc por fecha
            return (
              <div key={b.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      <span className="machine-code">{b.code}</span> · {farmName(b.farm_id)}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      🐔 {num(b.hens_received)} gallinas · 🐓 {num(b.roosters_received)} gallos · Llegada {fmtDate(b.arrival_date)}
                      {b.created_by ? ` · Registró ${nameOf(b.created_by)}` : ''}
                    </span>
                  </div>
                  <span className={`pill status ${st.cls}`}>{st.label}</span>
                  <span className="admin-row-actions">
                    {b.status === 'received' && canApprove && approvingId !== b.id && (
                      <button className="primary small" onClick={() => { setApprovingId(b.id); setGradingId(null); setLoggingId(null) }}>Aprobar</button>
                    )}
                    {b.status === 'levante' && canGrade && gradingId !== b.id && (
                      <button
                        className="primary small"
                        onClick={() => {
                          setGradingId(b.id)
                          setApprovingId(null)
                          setLoggingId(null)
                        }}
                      >
                        Grading → producción
                      </button>
                    )}
                    {b.status === 'production' && canLog && loggingId !== b.id && (
                      <button className="primary small" onClick={() => { setLoggingId(b.id); setGradingId(null); setApprovingId(null) }}>Registrar día</button>
                    )}
                    {b.status === 'received' && canDelete && (
                      <button className="ghost danger" onClick={() => onDelete(b)}>Eliminar</button>
                    )}
                  </span>
                </div>

                {/* Parámetros de levante (tras la aprobación) */}
                {b.status !== 'received' && (
                  <p className="wo-desc">
                    Levante: {b.arrival_age_weeks != null ? `${b.arrival_age_weeks} sem. inicial` : 'edad s/d'}
                    {b.estimated_levante_days != null ? ` · ${b.estimated_levante_days} días estimados` : ''}
                    {b.daily_feed_kg != null ? ` · ${num(b.daily_feed_kg)} kg/día` : ''}
                    {b.approved_by ? ` · Aprobó ${nameOf(b.approved_by)}` : ''}
                  </p>
                )}
                {/* Datos de producción (tras el grading) */}
                {b.status === 'production' && (
                  <p className="wo-desc done">
                    En producción desde {fmtDate(b.production_started_at)}
                    {b.avg_weight_g != null ? ` · Grading ${num(b.avg_weight_g)} g` : ''}
                    {` · Mortalidad acum. ${num(deathsTotal)}`}
                    {lastLog
                      ? ` · Último día ${fmtDate(lastLog.log_date)}${lastLog.feed_kg != null ? ` (${num(lastLog.feed_kg)} kg)` : ''}`
                      : ' · Sin registros diarios aún'}
                  </p>
                )}
                {b.grading_notes && <p className="wo-desc">Grading: {b.grading_notes}</p>}
                {b.notes && <p className="wo-desc">📝 {b.notes}</p>}

                {/* Distribución por galpón (según etapa) */}
                {shownPlaces.length > 0 && (
                  <div className="hint" style={{ margin: '2px 14px 6px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <span className="hint" style={{ margin: 0 }}>
                      {b.status === 'production' ? 'Módulo de producción:' : 'Galpones de levante:'}
                    </span>
                    {shownPlaces.map((p) => (
                      <span key={p.id} className="pill">
                        {roomName(p.room_id)}: {num(p.hens)}🐔 / {num(p.roosters)}🐓
                      </span>
                    ))}
                  </div>
                )}

                {approvingId === b.id && b.status === 'received' && (
                  <ApproveForm
                    onApprove={async (vals) => {
                      const { error } = await bt.approveBatch(b.id, vals)
                      if (!error) setApprovingId(null)
                    }}
                    onCancel={() => setApprovingId(null)}
                  />
                )}
                {gradingId === b.id && b.status === 'levante' && (
                  <GreadingForm
                    rooms={galponesDe(farmRooms, 'produccion')}
                    initial={levantePlaces.map((p) => ({ roomId: p.room_id, hens: String(p.hens ?? ''), roosters: String(p.roosters ?? '') }))}
                    onGrade={async (vals) => {
                      const res = await bt.startProduction(b.id, vals)
                      if (!res.error) setGradingId(null)
                      return res
                    }}
                    onCancel={() => setGradingId(null)}
                  />
                )}
                {loggingId === b.id && b.status === 'production' && (
                  <DailyLogForm
                    rooms={prodRooms}
                    onSave={async (vals) => {
                      const res = await bt.saveDailyLog({ batchId: b.id, ...vals })
                      if (!res.error) setLoggingId(null)
                      return res
                    }}
                    onCancel={() => setLoggingId(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
