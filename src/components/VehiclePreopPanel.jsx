/**
 * =============================================================================
 * ARCHIVO: src/components/VehiclePreopPanel.jsx
 * PROPÓSITO: Componente UI «VehiclePreopPanel»: FOSST22 digital — inspección
 *   preoperacional de vehículos. El conductor diligencia (evidencia en su
 *   historial); el líder de logística filtra por conductor/fecha/ruta/cliente,
 *   revisa y exporta a Excel o PDF; gerencia monitorea todo.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useMemo, useState } from 'react'
import { useVehiclePreop } from '../hooks/useVehiclePreop'
import {
  PREOP_FORM_CODE,
  PREOP_FORM_VERSION,
  PREOP_FORM_TITLE,
  PREOP_ITEMS,
  PREOP_GROUPS,
  PREOP_MAINTENANCE_FIELDS,
  emptyPreopItems,
  suggestCompliance,
  DRIVER_SAFETY_REMINDER,
} from '../lib/vehiclePreopCatalog'
import { exportCorporateExcel, exportCorporatePdfPrint } from '../lib/exportDocument'
import { ROLE_LABEL } from '../lib/roles'

const today = () => new Date().toLocaleDateString('sv-SE')
const fmtD = (v) => (v ? String(v) : '—')
const fmtDT = (v) =>
  v
    ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

/** ¿Este rol revisa/monitorea el preoperacional? (espejo de private.can_review_preop) */
export function canReviewPreop(role, area) {
  if (['owner', 'admin', 'management'].includes(role)) return true
  if (role === 'logistics_auxiliary') return true
  if (role === 'coordinator' && ['logistics', 'sales_logistics'].includes(area)) return true
  return false
}

export default function VehiclePreopPanel({
  orgId,
  userId,
  role,
  area,
  userName,
  orgName,
  isOmniscient = false,
}) {
  const canReview = isOmniscient || canReviewPreop(role, area)
  const api = useVehiclePreop({ orgId, userId, canReview })
  const [tab, setTab] = useState(canReview ? 'monitor' : 'diligenciar')

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ margin: 0 }}>Preoperacional de vehículos · {PREOP_FORM_CODE}</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {PREOP_FORM_TITLE} · versión {PREOP_FORM_VERSION} · {ROLE_LABEL[role] ?? role}
          </p>
        </div>
        <span className="pill live">
          <span className="dot" /> En vivo
        </span>
      </div>

      <div className="tabs" role="tablist" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={tab === 'diligenciar' ? 'tab active' : 'tab'}
          onClick={() => setTab('diligenciar')}
        >
          Diligenciar inspección
        </button>
        <button
          type="button"
          className={tab === 'historial' ? 'tab active' : 'tab'}
          onClick={() => setTab('historial')}
        >
          Mi historial ({api.myReports.length})
        </button>
        {canReview && (
          <button
            type="button"
            className={tab === 'monitor' ? 'tab active' : 'tab'}
            onClick={() => setTab('monitor')}
          >
            Monitoreo y exportes ({api.reports.length})
          </button>
        )}
      </div>

      {api.error && <p className="msg error">{api.error}</p>}
      {api.tableMissing && (
        <p className="msg error">
          Falta la tabla vehicle_preop_reports en Supabase (migración vehicle_preop_fosst22).
        </p>
      )}

      {tab === 'diligenciar' && (
        <PreopForm api={api} userName={userName} onDone={() => setTab('historial')} />
      )}
      {tab === 'historial' && <DriverHistory reports={api.myReports} loading={api.loading} />}
      {tab === 'monitor' && canReview && (
        <LeaderMonitor api={api} orgName={orgName} userName={userName} />
      )}
    </div>
  )
}

/* ─── Formulario del conductor ───────────────────────────── */

function PreopForm({ api, userName, onDone }) {
  const [head, setHead] = useState({
    driverName: userName || '',
    driverCc: '',
    licenseNumber: '',
    licenseCategory: '',
    licenseExpiry: '',
    workShift: '',
    vehiclePlate: '',
    vehicleModel: '',
    inspectionDate: today(),
    routeName: '',
    clientName: '',
    commitments: '',
  })
  const [items, setItems] = useState(emptyPreopItems)
  const [maint, setMaint] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const setH = (k, v) => setHead((h) => ({ ...h, [k]: v }))
  const setItem = (id, k, v) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, [k]: v } : i)))

  const { compliant, badCount } = useMemo(() => suggestCompliance(items), [items])

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const res = await api.submitReport({ ...head, items, maintenanceDates: maint, compliant })
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({
        kind: 'ok',
        text: `Inspección ${head.vehiclePlate.toUpperCase()} enviada. Queda en tu historial como evidencia.`,
      })
      setItems(emptyPreopItems())
      setMaint({})
      setHead((h) => ({ ...h, vehiclePlate: '', routeName: '', clientName: '', commitments: '' }))
      onDone?.()
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint preop-reminder">🛡 {DRIVER_SAFETY_REMINDER}</p>

      <h3 className="section-title">Inspección general del vehículo</h3>
      <div className="inline-form">
        <div className="two-col">
          <label>
            Placa del vehículo *
            <input
              value={head.vehiclePlate}
              onChange={(e) => setH('vehiclePlate', e.target.value.toUpperCase())}
              placeholder="ABC123"
            />
          </label>
          <label>
            Modelo
            <input value={head.vehicleModel} onChange={(e) => setH('vehicleModel', e.target.value)} />
          </label>
        </div>
        <div className="two-col">
          <label>
            Fecha de inspección
            <input type="date" value={head.inspectionDate} onChange={(e) => setH('inspectionDate', e.target.value)} />
          </label>
          <label>
            Turno de trabajo
            <input value={head.workShift} onChange={(e) => setH('workShift', e.target.value)} placeholder="Ej. Diurno" />
          </label>
        </div>

        <h3 className="section-title" style={{ margin: '12px 0 4px' }}>Datos del conductor</h3>
        <div className="two-col">
          <label>
            Nombre del conductor *
            <input value={head.driverName} onChange={(e) => setH('driverName', e.target.value)} />
          </label>
          <label>
            C.C.
            <input value={head.driverCc} onChange={(e) => setH('driverCc', e.target.value)} />
          </label>
        </div>
        <div className="two-col">
          <label>
            Licencia No.
            <input value={head.licenseNumber} onChange={(e) => setH('licenseNumber', e.target.value)} />
          </label>
          <label>
            Categoría
            <input value={head.licenseCategory} onChange={(e) => setH('licenseCategory', e.target.value)} placeholder="Ej. C2" />
          </label>
        </div>
        <label>
          Vencimiento de la licencia
          <input type="date" value={head.licenseExpiry} onChange={(e) => setH('licenseExpiry', e.target.value)} />
        </label>

        <h3 className="section-title" style={{ margin: '12px 0 4px' }}>Ruta y cliente (para trazabilidad del líder)</h3>
        <div className="two-col">
          <label>
            Ruta
            <input value={head.routeName} onChange={(e) => setH('routeName', e.target.value)} placeholder="Ej. Medellín → Urabá" />
          </label>
          <label>
            Cliente
            <input value={head.clientName} onChange={(e) => setH('clientName', e.target.value)} placeholder="Ej. Pollocoa" />
          </label>
        </div>
      </div>

      <h3 className="section-title" style={{ margin: '18px 0 6px' }}>
        Criterios de inspección (B = bueno · M = malo)
      </h3>
      {PREOP_GROUPS.map((g) => (
        <div key={g} className="preop-group">
          <strong className="preop-group-title">{g}</strong>
          {items
            .filter((i) => i.group === g)
            .map((i) => {
              const meta = PREOP_ITEMS.find((x) => x.id === i.id)
              return (
                <div key={i.id} className={`preop-item${i.status === 'M' ? ' bad' : ''}`}>
                  <span className="preop-item-label">{i.label}</span>
                  <div className="preop-bm" role="radiogroup" aria-label={i.label}>
                    {['B', 'M'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`preop-bm-btn ${s === 'B' ? 'good' : 'bad'}${i.status === s ? ' active' : ''}`}
                        onClick={() => setItem(i.id, 'status', s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {meta?.dateLabel && (
                    <input
                      type="date"
                      className="preop-date"
                      title={meta.dateLabel}
                      value={i.correctiveDate || ''}
                      onChange={(e) => setItem(i.id, 'correctiveDate', e.target.value)}
                    />
                  )}
                  {i.status === 'M' && (
                    <div className="preop-item-extra">
                      <input
                        placeholder="Observaciones"
                        value={i.observation}
                        onChange={(e) => setItem(i.id, 'observation', e.target.value)}
                      />
                      <input
                        placeholder="Acción correctiva"
                        value={i.correctiveAction}
                        onChange={(e) => setItem(i.id, 'correctiveAction', e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      ))}

      <h3 className="section-title" style={{ margin: '18px 0 6px' }}>17. Últimas fechas de mantenimiento</h3>
      <div className="inline-form">
        <div className="two-col">
          {PREOP_MAINTENANCE_FIELDS.map((f) => (
            <label key={f.id}>
              {f.label}
              <input
                type="date"
                value={maint[f.id] || ''}
                onChange={(e) => setMaint((m) => ({ ...m, [f.id]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <label>
          Compromisos pendientes del conductor
          <input value={head.commitments} onChange={(e) => setH('commitments', e.target.value)} />
        </label>
      </div>

      <div className={`balance-note ${compliant ? 'ok' : 'warn'}`} style={{ marginTop: 12 }}>
        {compliant ? (
          <strong>✓ Todos los criterios en B: el vehículo queda APROBADO para operar.</strong>
        ) : (
          <strong>
            ⚠ {badCount} criterio(s) en M: el vehículo queda con NOVEDAD. Registre observación y
            acción correctiva; el líder de logística decidirá.
          </strong>
        )}
      </div>

      {msg && <p className={`msg ${msg.kind === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>}

      <div className="actions row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="primary"
          disabled={busy || !head.vehiclePlate.trim() || !head.driverName.trim()}
          onClick={submit}
        >
          {busy ? 'Enviando…' : 'Firmar y enviar inspección'}
        </button>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        Al enviar queda firmada con tu usuario y NO se puede editar: es evidencia para auditorías.
      </p>
    </div>
  )
}

/* ─── Historial del conductor (evidencia) ────────────────── */

function DriverHistory({ reports, loading }) {
  if (!reports.length) {
    return (
      <p className="hint" style={{ marginTop: 12 }}>
        {loading ? 'Cargando…' : 'Aún no has enviado inspecciones. Cada envío queda aquí como evidencia.'}
      </p>
    )
  }
  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint">
        Estas inspecciones son tu <strong>evidencia</strong>: preséntalas cuando te la soliciten.
      </p>
      <div className="admin-list">
        {reports.map((r) => (
          <PreopRow key={r.id} r={r} />
        ))}
      </div>
    </div>
  )
}

function PreopRow({ r, action }) {
  const [open, setOpen] = useState(false)
  const bad = (r.items || []).filter((i) => i.status === 'M')
  return (
    <div>
      <div className="admin-row compact" style={{ margin: 0 }}>
        <span>{r.compliant ? '✅' : '⚠️'}</span>
        <div className="admin-row-main" style={{ flex: 1 }}>
          <strong>
            {r.vehicle_plate} · {fmtD(r.inspection_date)} · {r.driver_name}
          </strong>
          <span className="hint" style={{ margin: 0 }}>
            {r.route_name ? `Ruta ${r.route_name} · ` : ''}
            {r.client_name ? `Cliente ${r.client_name} · ` : ''}
            {bad.length ? `${bad.length} novedad(es)` : 'sin novedades'} ·{' '}
            {r.status === 'reviewed' ? `Revisado por ${r.reviewer_name || 'líder'} ${fmtDT(r.reviewed_at)}` : 'Pendiente de revisión'}
          </span>
        </div>
        <button type="button" className="ghost small" onClick={() => setOpen(!open)}>
          {open ? 'Cerrar' : 'Ver'}
        </button>
        {action}
      </div>
      {open && (
        <div className="preop-detail">
          {bad.length > 0 && (
            <>
              <strong>Novedades (M):</strong>
              <ul className="hint" style={{ margin: '4px 0 8px', paddingLeft: 18 }}>
                {bad.map((i) => (
                  <li key={i.id}>
                    {i.group} — {i.label}
                    {i.observation ? ` · Obs: ${i.observation}` : ''}
                    {i.correctiveAction ? ` · Acción: ${i.correctiveAction}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          <span className="hint" style={{ margin: 0 }}>
            Licencia {r.license_number || '—'} ({r.license_category || '—'}) vence {fmtD(r.license_expiry)} · CC{' '}
            {r.driver_cc || '—'} · Turno {r.work_shift || '—'}
            {r.commitments ? ` · Compromisos: ${r.commitments}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

/* ─── Monitoreo del líder de logística / gerencia ────────── */

function LeaderMonitor({ api, orgName, userName }) {
  const [f, setF] = useState({ driver: '', plate: '', from: '', to: '', route: '', client: '' })
  const [busyExport, setBusyExport] = useState(false)
  const [msg, setMsg] = useState(null)
  const rows = useMemo(() => api.filterReports(f), [api, f])
  const setFilter = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const exportRows = () =>
    rows.map((r) => ({
      Fecha: r.inspection_date,
      Conductor: r.driver_name,
      'C.C.': r.driver_cc || '',
      Placa: r.vehicle_plate,
      Modelo: r.vehicle_model || '',
      Ruta: r.route_name || '',
      Cliente: r.client_name || '',
      Turno: r.work_shift || '',
      Cumple: r.compliant ? 'SÍ' : 'NO',
      'Novedades (M)': (r.items || [])
        .filter((i) => i.status === 'M')
        .map((i) => `${i.label}${i.correctiveAction ? ` → ${i.correctiveAction}` : ''}`)
        .join(' | '),
      Estado: r.status === 'reviewed' ? `Revisado (${r.reviewer_name || ''})` : 'Enviado',
      'Licencia vence': r.license_expiry || '',
    }))

  const doExport = async (kind) => {
    if (!rows.length) {
      setMsg({ kind: 'error', text: 'No hay inspecciones con esos filtros' })
      return
    }
    setBusyExport(true)
    const meta = {
      title: `${PREOP_FORM_CODE} · Preoperacional de vehículos`,
      orgName,
      module: 'Logística · preoperacional',
      generatedBy: userName,
    }
    const sheets = [{ name: 'Preoperacional', rows: exportRows() }]
    const r =
      kind === 'xlsx'
        ? await exportCorporateExcel('preoperacional-vehiculos', sheets, meta)
        : exportCorporatePdfPrint('preoperacional-vehiculos', sheets, meta)
    setBusyExport(false)
    setMsg(r?.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: `Exportadas ${rows.length} inspección(es)` })
  }

  const pending = rows.filter((r) => r.status === 'submitted')

  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint">
        Filtre por conductor, fecha, ruta, cliente o placa; exporte el resultado (o todo en general)
        a Excel o PDF con membrete.
      </p>

      <div className="inline-form">
        <div className="two-col">
          <label>
            Conductor
            <input value={f.driver} onChange={(e) => setFilter('driver', e.target.value)} placeholder="Nombre" />
          </label>
          <label>
            Placa
            <input value={f.plate} onChange={(e) => setFilter('plate', e.target.value)} placeholder="ABC123" />
          </label>
        </div>
        <div className="two-col">
          <label>
            Desde
            <input type="date" value={f.from} onChange={(e) => setFilter('from', e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={f.to} onChange={(e) => setFilter('to', e.target.value)} />
          </label>
        </div>
        <div className="two-col">
          <label>
            Ruta
            <input value={f.route} onChange={(e) => setFilter('route', e.target.value)} />
          </label>
          <label>
            Cliente
            <input value={f.client} onChange={(e) => setFilter('client', e.target.value)} />
          </label>
        </div>
      </div>

      <div className="actions row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        <button type="button" className="primary" disabled={busyExport} onClick={() => doExport('xlsx')}>
          Exportar Excel ({rows.length})
        </button>
        <button type="button" className="ghost" disabled={busyExport} onClick={() => doExport('pdf')}>
          Exportar PDF ({rows.length})
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setF({ driver: '', plate: '', from: '', to: '', route: '', client: '' })}
        >
          Limpiar filtros
        </button>
      </div>

      {msg && <p className={`msg ${msg.kind === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>}

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{rows.length}</span>
          <span className="kpi-label">Inspecciones (filtro)</span>
        </div>
        <div className={`kpi-card${pending.length ? ' warn' : ''}`}>
          <span className="kpi-value">{pending.length}</span>
          <span className="kpi-label">Por revisar</span>
        </div>
        <div className={`kpi-card${rows.some((r) => !r.compliant) ? ' warn' : ''}`}>
          <span className="kpi-value">{rows.filter((r) => !r.compliant).length}</span>
          <span className="kpi-label">Con novedad (no cumple)</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{new Set(rows.map((r) => r.driver_user_id)).size}</span>
          <span className="kpi-label">Conductores</span>
        </div>
      </div>

      <h3 className="section-title" style={{ margin: '16px 0 8px' }}>
        Inspecciones ({rows.length}) — orden: más reciente primero
      </h3>
      {!rows.length ? (
        <p className="hint">{api.loading ? 'Cargando…' : 'Sin inspecciones para el filtro.'}</p>
      ) : (
        <div className="admin-list">
          {rows.slice(0, 100).map((r) => (
            <PreopRow
              key={r.id}
              r={r}
              action={
                r.status === 'submitted' ? (
                  <button
                    type="button"
                    className="primary small"
                    onClick={async () => {
                      const res = await api.reviewReport(r.id, userName)
                      setMsg(
                        res.error
                          ? { kind: 'error', text: res.error }
                          : { kind: 'ok', text: `Inspección ${r.vehicle_plate} revisada y sellada` }
                      )
                    }}
                  >
                    Revisar ✓
                  </button>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
