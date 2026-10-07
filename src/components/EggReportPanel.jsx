/**
 * =============================================================================
 * ARCHIVO: src/components/EggReportPanel.jsx
 * PROPÓSITO: Componente UI «EggReportPanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBatches } from '../hooks/useBatches'
import { useEggReports } from '../hooks/useEggReports'
import { exportToExcel } from '../lib/exportExcel'

/**
 * Dashboard del operario galponero (Fase 3): reporte diario de huevos por
 * galpón, lote y fecha, con las categorías tipificadas (incubable, comercial…).
 * Los galpones reportables son los que tienen un lote en producción.
 */

const STATUS = {
  reported: { label: 'Reportado', cls: 'warn' },
  verified: { label: 'Verificado', cls: 'ok' },
  received: { label: 'Recibido en planta', cls: '' },
}
const statusOf = (v) => STATUS[v] ?? { label: v, cls: '' }
const today = () => new Date().toLocaleDateString('sv-SE')
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''

/* ══ Formulario de reporte de huevos ═════════════════════════ */
function EggReportForm({ reportable, categories, findExisting, onSave, onCancel }) {
  const [roomId, setRoomId] = useState(reportable[0]?.roomId ?? '')
  const [date, setDate] = useState(today())
  const [counts, setCounts] = useState({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  // Al cambiar galpón o fecha, precarga el reporte existente de ese día (si lo hay)
  useEffect(() => {
    const ex = findExisting(roomId, date)
    if (ex) {
      const c = {}
      for (const cat of categories) c[cat.code] = String(ex.counts?.[cat.code] ?? '')
      setCounts(c)
      setNotes(ex.notes ?? '')
    } else {
      setCounts({})
      setNotes('')
    }
  }, [roomId, date, findExisting, categories])

  const entry = reportable.find((r) => r.roomId === roomId)
  const setCount = (code) => (e) => setCounts((c) => ({ ...c, [code]: e.target.value }))

  const submit = async () => {
    if (!entry) return
    setBusy(true)
    setErr(null)
    const { error } = await onSave({
      farmId: entry.farmId,
      batchId: entry.batchId,
      roomId,
      reportDate: date,
      counts,
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
          Galpón (lote en producción)
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {reportable.length === 0 && <option value="">— Sin galpones en producción —</option>}
            {reportable.map((r) => (
              <option key={r.roomId} value={r.roomId}>{r.roomName} · {r.batchCode}</option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <p className="component-title" style={{ margin: '6px 0 2px' }}>Cantidad de huevos por tipo</p>
      <div className="two-col">
        {categories.map((cat) => (
          <label key={cat.id}>
            {cat.name}
            <input
              type="number"
              min="0"
              value={counts[cat.code] ?? ''}
              onChange={setCount(cat.code)}
              placeholder="0"
            />
          </label>
        ))}
      </div>
      <label>
        Observaciones
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </label>

      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !roomId}>
          {busy ? 'Guardando…' : 'Guardar reporte'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* ══ Panel principal ═════════════════════════════════════════ */
export default function EggReportPanel({ orgId, userId, role, area, coordinatorName }) {
  const canReport = ['owner', 'admin', 'supervisor', 'coordinator', 'barn_operator'].includes(role)
  const barnOnly = role === 'barn_operator'
  // Verifica/acepta el supervisor o el coordinador de granja
  const canVerify = ['owner', 'admin', 'management', 'supervisor'].includes(role) || (role === 'coordinator' && area === 'farm')
  const bt = useBatches(orgId, userId)
  const er = useEggReports(orgId, userId)

  const [rooms, setRooms] = useState([])
  const [farms, setFarms] = useState([])
  const [people, setPeople] = useState({})
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('rooms').select('id, plant_id, name, code').order('code'),
      supabase.from('plants').select('id, name, code').eq('org_id', orgId),
      supabase.from('organization_members').select('user_id, profiles ( full_name, email )').eq('org_id', orgId),
    ]).then(([r, p, t]) => {
      setRooms(r.data ?? [])
      setFarms(p.data ?? [])
      const map = {}
      for (const row of t.data ?? []) map[row.user_id] = row.profiles?.full_name || row.profiles?.email || '—'
      setPeople(map)
    })
  }, [orgId])

  const roomName = (id) => {
    const r = rooms.find((x) => x.id === id)
    return r ? `${r.name} (${r.code})` : 'Galpón'
  }
  const farmName = (id) => farms.find((f) => f.id === id)?.name ?? 'Granja'
  const nameOf = (id) => (id ? people[id] ?? '—' : '—')

  // Galpones reportables: placements de producción de lotes en producción
  const reportable = useMemo(() => {
    const prod = bt.batches.filter((b) => b.status === 'production')
    const seen = new Set()
    const list = []
    for (const p of bt.placements) {
      if (p.stage !== 'production') continue
      const b = prod.find((x) => x.id === p.batch_id)
      if (!b) continue
      const key = `${p.batch_id}:${p.room_id}`
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ roomId: p.room_id, batchId: p.batch_id, farmId: b.farm_id, batchCode: b.code, roomName: roomName(p.room_id) })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bt.batches, bt.placements, rooms])

  const findExisting = useMemo(
    () => (roomId, date) => er.reports.find((r) => r.room_id === roomId && r.report_date === date),
    [er.reports]
  )

  const kindTotals = (counts) => {
    let inc = 0
    let com = 0
    for (const cat of er.categories) {
      const v = Number(counts?.[cat.code] || 0)
      if (cat.kind === 'incubable') inc += v
      else com += v
    }
    return { inc, com }
  }

  const visibleReports = barnOnly ? er.reports.filter((r) => r.reported_by === userId) : er.reports
  const todayReports = visibleReports.filter((r) => r.report_date === today())

  const kpis = useMemo(() => {
    let inc = 0
    let com = 0
    for (const r of todayReports) {
      const t = kindTotals(r.counts)
      inc += t.inc
      com += t.com
    }
    return { reported: todayReports.length, inc, com }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayReports, er.categories])

  const onDelete = async (r) => {
    if (!window.confirm(`¿Eliminar el reporte de ${roomName(r.room_id)} del ${fmtDate(r.report_date)}?`)) return
    await er.deleteReport(r.id)
  }

  const batchCodeOf = (id) => bt.batches.find((b) => b.id === id)?.code ?? ''
  const exportReports = async () => {
    await exportToExcel('reportes-huevo', [
      {
        name: 'Reportes',
        rows: visibleReports.map((r) => {
          const t = kindTotals(r.counts)
          return {
            Fecha: r.report_date,
            Lote: batchCodeOf(r.batch_id),
            'Galpón': roomName(r.room_id),
            Granja: farmName(r.farm_id),
            ...Object.fromEntries(er.categories.map((c) => [c.name, Number(r.counts?.[c.code] || 0)])),
            Incubable: t.inc,
            Comercial: t.com,
            Total: t.inc + t.com,
            Estado: r.status === 'received' ? 'Recibido en planta' : r.status === 'verified' ? 'Verificado' : 'Reportado',
            'Reportó': nameOf(r.reported_by),
            'Verificó': nameOf(r.verified_by),
            Observaciones: r.notes ?? '',
          }
        }),
      },
    ], {
      title: 'Reportes de huevo',
      module: 'Producción · huevo',
    })
  }

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>Reporte de huevos</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola{firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} · registra los huevos por galpón y lote
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!barnOnly && visibleReports.length > 0 && (
            <button className="chip ghost" onClick={exportReports}>⬇ Exportar Excel</button>
          )}
          <span className="pill live"><span className="dot" /> En vivo</span>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{kpis.reported}/{reportable.length}</span>
          <span className="kpi-label">Galpones reportados hoy</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.inc)}</span>
          <span className="kpi-label">Huevo incubable (hoy)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.com)}</span>
          <span className="kpi-label">Huevo comercial (hoy)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.inc + kpis.com)}</span>
          <span className="kpi-label">Total huevos (hoy)</span>
        </div>
      </div>

      <div className="admin-section-head">
        <span className="component-title" style={{ margin: 0 }}>
          {barnOnly ? 'Mis reportes' : 'Reportes de la granja'}
        </span>
        {canReport && !showForm && (
          <button className="chip ghost" onClick={() => setShowForm(true)} disabled={reportable.length === 0}>
            + Reportar huevos
          </button>
        )}
      </div>

      {reportable.length === 0 && (
        <p className="hint">
          No hay lotes en producción todavía. El reporte se habilita cuando un lote en levante
          pasa el grading y se mueve a un módulo de producción.
        </p>
      )}
      {showForm && (
        <EggReportForm
          reportable={reportable}
          categories={er.categories}
          findExisting={findExisting}
          onSave={er.saveReport}
          onCancel={() => setShowForm(false)}
        />
      )}
      {er.error && <p className="msg error">{er.error}</p>}

      {er.loading ? (
        <p className="hint">Cargando reportes…</p>
      ) : visibleReports.length === 0 ? (
        <p className="hint">Aún no hay reportes de huevos.</p>
      ) : (
        <div className="admin-list">
          {visibleReports.slice(0, 40).map((r) => {
            const st = statusOf(r.status)
            const t = kindTotals(r.counts)
            return (
              <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                <span>🥚</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{roomName(r.room_id)} · {fmtDate(r.report_date)}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    Incubable {num(t.inc)} · Comercial {num(t.com)} · {farmName(r.farm_id)}
                    {r.reported_by ? ` · ${nameOf(r.reported_by)}` : ''}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </span>
                </div>
                <span className={`pill status ${st.cls}`}>{st.label}</span>
                {canVerify && r.status === 'reported' && (
                  <button className="ghost" onClick={() => er.verifyReport(r.id)} title="Aceptar el reporte">✓ Verificar</button>
                )}
                {(r.reported_by === userId || ['owner', 'admin'].includes(role)) && r.status === 'reported' && (
                  <button className="ghost danger" onClick={() => onDelete(r)} title="Eliminar">✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
