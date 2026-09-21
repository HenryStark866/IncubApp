/**
 * =============================================================================
 * ARCHIVO: src/components/EggReportPanel.jsx
 * PROPÃ“SITO: Componente UI Â«EggReportPanelÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBatches } from '../features/production/hooks/useBatches'
import { useEggReports } from '../features/production/hooks/useEggReports'
import { exportToExcel } from '../lib/exportExcel'

/**
 * Dashboard del operario galponero (Fase 3): reporte diario de huevos por
 * galpÃ³n, lote y fecha, con las categorÃ­as tipificadas (incubable, comercialâ€¦).
 * Los galpones reportables son los que tienen un lote en producciÃ³n.
 */

const STATUS = {
  reported: { label: 'Reportado', cls: 'warn' },
  verified: { label: 'Verificado', cls: 'ok' },
  received: { label: 'Recibido en planta', cls: '' },
}
const statusOf = (v) => STATUS[v] ?? { label: v, cls: '' }
const today = () => new Date().toLocaleDateString('sv-SE')
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'â€”'
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''

/* â•â• Formulario de reporte de huevos â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function EggReportForm({ reportable, categories, findExisting, onSave, onCancel }) {
  const [roomId, setRoomId] = useState(reportable[0]?.roomId ?? '')
  const [date, setDate] = useState(today())
  const [counts, setCounts] = useState({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  // Al cambiar galpÃ³n o fecha, precarga el reporte existente de ese dÃ­a (si lo hay)
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
          GalpÃ³n (lote en producciÃ³n)
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {reportable.length === 0 && <option value="">â€” Sin galpones en producciÃ³n â€”</option>}
            {reportable.map((r) => (
              <option key={r.roomId} value={r.roomId}>{r.roomName} Â· {r.batchCode}</option>
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
          {busy ? 'Guardandoâ€¦' : 'Guardar reporte'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â•â• Panel principal â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function EggReportPanel({ orgId, userId, role, area, coordinatorName }) {
  const canReport = ['owner', 'admin', 'supervisor', 'coordinator', 'barn_operator'].includes(role)
  const barnOnly = role === 'barn_operator'
  // Verifica/acepta el supervisor o el coordinador de granja
  const canVerify = ['owner', 'admin', 'supervisor'].includes(role) || (role === 'coordinator' && area === 'farm')
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
      for (const row of t.data ?? []) map[row.user_id] = row.profiles?.full_name || row.profiles?.email || 'â€”'
      setPeople(map)
    })
  }, [orgId])

  const roomName = (id) => {
    const r = rooms.find((x) => x.id === id)
    return r ? `${r.name} (${r.code})` : 'GalpÃ³n'
  }
  const farmName = (id) => farms.find((f) => f.id === id)?.name ?? 'Granja'
  const nameOf = (id) => (id ? people[id] ?? 'â€”' : 'â€”')

  // Galpones reportables: placements de producciÃ³n de lotes en producciÃ³n
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
    if (!window.confirm(`Â¿Eliminar el reporte de ${roomName(r.room_id)} del ${fmtDate(r.report_date)}?`)) return
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
            'GalpÃ³n': roomName(r.room_id),
            Granja: farmName(r.farm_id),
            ...Object.fromEntries(er.categories.map((c) => [c.name, Number(r.counts?.[c.code] || 0)])),
            Incubable: t.inc,
            Comercial: t.com,
            Total: t.inc + t.com,
            Estado: r.status === 'received' ? 'Recibido en planta' : r.status === 'verified' ? 'Verificado' : 'Reportado',
            'ReportÃ³': nameOf(r.reported_by),
            'VerificÃ³': nameOf(r.verified_by),
            Observaciones: r.notes ?? '',
          }
        }),
      },
    ], {
      title: 'Reportes de huevo',
      module: 'ProducciÃ³n Â· huevo',
    })
  }

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>Reporte de huevos</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola{firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} Â· registra los huevos por galpÃ³n y lote
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!barnOnly && visibleReports.length > 0 && (
            <button className="chip ghost" onClick={exportReports}>â¬‡ Exportar Excel</button>
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
          No hay lotes en producciÃ³n todavÃ­a. El reporte se habilita cuando un lote en levante
          pasa el grading y se mueve a un mÃ³dulo de producciÃ³n.
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
        <p className="hint">Cargando reportesâ€¦</p>
      ) : visibleReports.length === 0 ? (
        <p className="hint">AÃºn no hay reportes de huevos.</p>
      ) : (
        <div className="admin-list">
          {visibleReports.slice(0, 40).map((r) => {
            const st = statusOf(r.status)
            const t = kindTotals(r.counts)
            return (
              <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                <span>ðŸ¥š</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{roomName(r.room_id)} Â· {fmtDate(r.report_date)}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    Incubable {num(t.inc)} Â· Comercial {num(t.com)} Â· {farmName(r.farm_id)}
                    {r.reported_by ? ` Â· ${nameOf(r.reported_by)}` : ''}
                    {r.notes ? ` Â· ${r.notes}` : ''}
                  </span>
                </div>
                <span className={`pill status ${st.cls}`}>{st.label}</span>
                {canVerify && r.status === 'reported' && (
                  <button className="ghost" onClick={() => er.verifyReport(r.id)} title="Aceptar el reporte">âœ“ Verificar</button>
                )}
                {(r.reported_by === userId || ['owner', 'admin'].includes(role)) && r.status === 'reported' && (
                  <button className="ghost danger" onClick={() => onDelete(r)} title="Eliminar">âœ•</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

