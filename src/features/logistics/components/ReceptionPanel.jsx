/**
 * =============================================================================
 * ARCHIVO: src/components/ReceptionPanel.jsx
 * PROPÃ“SITO: Componente UI Â«ReceptionPanelÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEggReports } from '../features/production/hooks/useEggReports'
import { useIncubationLots, lotTotals } from '../features/production/hooks/useIncubationLots'
import { compressImage } from '../lib/image'
import ColdRoomPanel from './ColdRoomPanel'

/**
 * RecepciÃ³n del huevo en planta (Fase 4). El operario de recepciÃ³n ve los
 * reportes ya verificados por la granja, cuenta/ajusta las cantidades y
 * certifica el envÃ­o â†’ el lote queda cargado al cuarto frÃ­o (almacenamiento
 * de huevo), listo para el mapa de cargue del coordinador de planta.
 */

const today = () => new Date().toLocaleDateString('sv-SE')
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'â€”'
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')
const num1 = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO', { maximumFractionDigits: 1 })
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''

/* â•â• Formulario de certificaciÃ³n (conteo recibido) â•â•â•â•â•â•â•â•â•â• */
function CertifyForm({ report, categories, onCertify, onCancel }) {
  const [counts, setCounts] = useState(() => {
    const c = {}
    for (const cat of categories) c[cat.code] = String(report.counts?.[cat.code] ?? '')
    return c
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const setCount = (code) => (e) => setCounts((c) => ({ ...c, [code]: e.target.value }))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onCertify(counts)
    setBusy(false)
    if (error) setErr(error)
  }

  return (
    <div className="inline-form compact">
      <p className="hint" style={{ margin: 0 }}>
        Cuenta y confirma las cantidades recibidas. Al certificar, el lote queda cargado al cuarto frÃ­o.
      </p>
      <div className="two-col">
        {categories.map((cat) => (
          <label key={cat.id}>
            {cat.name} (recibido)
            <input type="number" min="0" value={counts[cat.code] ?? ''} onChange={setCount(cat.code)} placeholder="0" />
          </label>
        ))}
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy}>{busy ? 'Certificandoâ€¦' : 'âœ“ Certificar recepciÃ³n'}</button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â•â• Panel principal (sub-pestaÃ±as) â•â• */
export default function ReceptionPanel({
  orgId,
  userId,
  role,
  coordinatorName,
  showReception = true,
  showColdRoom = true,
}) {
  const [subTab, setSubTab] = useState(showReception ? 'recepcion' : 'cuartofrio')
  const multi = showReception && showColdRoom

  return (
    <>
      <nav className="subtabs-rail" aria-label="RecepciÃ³n de huevo" style={{ marginBottom: 12 }}>
        <div className="subtabs-rail-head">
          <p className="subtabs-rail-label">RecepciÃ³n</p>
          <p className="subtabs-rail-hint">Llegada Â· certificaciÃ³n Â· cuarto frÃ­o</p>
        </div>
        <div className="tabs subtabs" role="tablist">
          {showReception && (
            <button
              type="button"
              className={subTab === 'recepcion' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('recepcion')}
            >
              ðŸ“¥ Certificar envÃ­os
            </button>
          )}
          {showReception && (
            <button
              type="button"
              className={subTab === 'llegada' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('llegada')}
            >
              ðŸš› Llegada a planta
            </button>
          )}
          {showColdRoom && (
            <button
              type="button"
              className={subTab === 'cuartofrio' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('cuartofrio')}
            >
              â„ï¸ Cuarto frÃ­o
            </button>
          )}
        </div>
      </nav>
      {subTab === 'cuartofrio' ? (
        <ColdRoomPanel orgId={orgId} userId={userId} role={role} />
      ) : subTab === 'llegada' ? (
        <EggArrivalPanel orgId={orgId} userId={userId} role={role} coordinatorName={coordinatorName} />
      ) : (
        <ReceptionInbox orgId={orgId} userId={userId} role={role} coordinatorName={coordinatorName} />
      )}
      {!multi && !showReception && showColdRoom ? null : null}
    </>
  )
}

/* â•â• Llegada de huevo a planta: foto + sello â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function EggArrivalPanel({ orgId, userId, role, coordinatorName }) {
  const er = useEggReports(orgId, userId)
  const canReport = [
    'owner',
    'admin',
    'supervisor',
    'coordinator',
    'reception_operator',
    'operator',
    'auxiliary',
  ].includes(role)

  const [seal, setSeal] = useState('')
  const [plate, setPlate] = useState('')
  const [farmHint, setFarmHint] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const onFile = async (e) => {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      setFile(null)
      return
    }
    try {
      const c = await compressImage(f, 1280, 0.7)
      setFile(c && c.size > 0 ? c : f)
    } catch {
      setFile(f)
    }
  }

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const res = await er.reportPlantArrival({
      sealNumber: seal,
      file,
      notes,
      vehiclePlate: plate,
      farmHint,
    })
    setBusy(false)
    if (res.error) {
      setMsg({ kind: 'error', text: res.error })
      return
    }
    setMsg({
      kind: 'ok',
      text: `Llegada registrada Â· sello ${res.seal || seal}`,
    })
    setSeal('')
    setPlate('')
    setFarmHint('')
    setNotes('')
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>Reporte de llegada del huevo a planta</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola{firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} Â· tome foto y
            anote el nÃºmero del sello
          </span>
        </div>
        <span className="pill live">
          <span className="dot" /> {er.arrivals.length} registro(s)
        </span>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Al llegar el huevo a planta se registra el <strong>nÃºmero de sello</strong> del precinto y
        una <strong>foto</strong> como evidencia. Luego se certifica el envÃ­o de granja en la pestaÃ±a
        Â«Certificar envÃ­osÂ».
      </p>

      {canReport && (
        <div className="inline-form" style={{ marginTop: 12 }}>
          <div className="two-col">
            <label>
              NÃºmero del sello *
              <input
                type="text"
                value={seal}
                onChange={(e) => setSeal(e.target.value)}
                placeholder="Ej. S-45821"
                autoComplete="off"
              />
            </label>
            <label>
              Placa del vehÃ­culo (opcional)
              <input
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="Ej. ABC-123"
              />
            </label>
          </div>
          <label>
            Procedencia / granja (opcional)
            <input
              type="text"
              value={farmHint}
              onChange={(e) => setFarmHint(e.target.value)}
              placeholder="Ej. Granja Norte Â· lote 12"
            />
          </label>
          <div className="photo-field">
            <span className="hint" style={{ margin: 0, display: 'block' }}>
              Foto del sello / llegada *
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={onFile}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <button type="button" className={file ? 'chip' : 'primary'} onClick={() => inputRef.current?.click()}>
                {file ? 'ðŸ“· Cambiar foto' : 'ðŸ“· Tomar foto'}
              </button>
              {file && (
                <button type="button" className="ghost" onClick={() => setFile(null)}>
                  Quitar
                </button>
              )}
            </div>
            {preview && (
              <img
                src={preview}
                alt="Vista previa sello"
                style={{ display: 'block', maxWidth: 240, borderRadius: 8, marginTop: 8 }}
              />
            )}
          </div>
          <label>
            Observaciones
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Estado del sello, temperatura, etc."
            />
          </label>
          {msg && <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`}>{msg.text}</p>}
          {er.error && <p className="msg error">{er.error}</p>}
          <div className="actions row">
            <button
              type="button"
              className="primary"
              disabled={busy || !seal.trim() || !file}
              onClick={submit}
            >
              {busy ? 'Guardandoâ€¦' : 'âœ“ Registrar llegada'}
            </button>
          </div>
        </div>
      )}

      {/* Cantidades de huevo por fecha de postura del lote recibido (la fecha de
          llegada es automÃ¡tica; el operario ingresa cuÃ¡nto llegÃ³ por fecha). */}
      {canReport && <LotArrivalCapture orgId={orgId} userId={userId} />}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Llegadas recientes (sello + foto)
      </h3>
      {er.loading && !er.arrivals.length ? (
        <p className="hint">Cargandoâ€¦</p>
      ) : er.arrivals.length === 0 ? (
        <p className="hint">AÃºn no hay reportes de llegada.</p>
      ) : (
        <div className="admin-list">
          {er.arrivals.map((a) => (
            <ArrivalRow key={a.id} arrival={a} getUrl={er.getArrivalPhotoUrl} />
          ))}
        </div>
      )}
    </div>
  )
}

/* â•â• Cantidades recibidas por lote y fecha de postura â•â•â•â•â•â•â•â• */
function LotArrivalCapture({ orgId, userId }) {
  const api = useIncubationLots(orgId, userId)
  const [lotId, setLotId] = useState('')
  const [rows, setRows] = useState([{ productionDate: '', eggs: '' }])
  const [seal, setSeal] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // Lotes esperados (los que gerencia dejÃ³ planeados o ya llegando)
  const expected = useMemo(
    () => api.lots.filter((l) => ['planned', 'arrived', 'classifying'].includes(l.status)),
    [api.lots]
  )
  const selected = expected.find((l) => l.id === lotId) || api.lots.find((l) => l.id === lotId)

  // Al elegir lote, prellenar con las fechas de postura planeadas (cantidades vacÃ­as)
  const pickLot = (id) => {
    setLotId(id)
    const lot = api.lots.find((l) => l.id === id)
    if (lot?.postures?.length) {
      setRows(lot.postures.map((p) => ({ productionDate: p.productionDate || '', eggs: '' })))
    } else {
      setRows([{ productionDate: '', eggs: '' }])
    }
  }

  const setRow = (i, patch) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, { productionDate: '', eggs: '' }])
  const removeRow = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))

  const totalEggs = rows.reduce((s, r) => s + (Number(r.eggs) || 0), 0)

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const res = await api.registerArrival({
      lotId: lotId || null,
      lotCode: selected?.code || null,
      receivedPostures: rows,
      sealNumber: seal,
      notes,
    })
    setBusy(false)
    if (res.error) {
      setMsg({ kind: 'error', text: res.error })
      return
    }
    setMsg({ kind: 'ok', text: `Llegada registrada Â· ${num(totalEggs)} huevos` })
    setLotId('')
    setRows([{ productionDate: '', eggs: '' }])
    setSeal('')
    setNotes('')
  }

  return (
    <div className="card" style={{ marginTop: 16, background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
      <div className="card-head" style={{ marginBottom: 4 }}>
        <div>
          <h3 style={{ margin: 0 }}>Cantidades recibidas por lote y fecha</h3>
          <span className="hint" style={{ margin: 0 }}>
            La fecha de llegada es automÃ¡tica (hoy). Ingresa los huevos recibidos por fecha de postura.
          </span>
        </div>
      </div>

      <label>
        Lote recibido
        <select value={lotId} onChange={(e) => pickLot(e.target.value)}>
          <option value="">â€” Selecciona el lote â€”</option>
          {expected.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} ({num(lotTotals(l.postures).eggs)} huevos planeados)
            </option>
          ))}
        </select>
      </label>

      {expected.length === 0 && (
        <p className="hint" style={{ marginTop: 6 }}>
          No hay lotes esperados. Gerencia los registra en el mÃ³dulo Â«DatosÂ».
        </p>
      )}

      {rows.map((r, i) => (
        <div key={i} className="two-col" style={{ gap: 8, alignItems: 'end', marginTop: 6 }}>
          <label style={{ margin: 0 }}>
            Fecha de postura
            <input
              type="date"
              value={r.productionDate}
              max={today()}
              onChange={(e) => setRow(i, { productionDate: e.target.value })}
            />
          </label>
          <label style={{ margin: 0 }}>
            Huevos recibidos
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number"
                min="0"
                value={r.eggs}
                onChange={(e) => setRow(i, { eggs: e.target.value })}
                placeholder="0"
              />
              <button type="button" className="ghost small" onClick={() => removeRow(i)} title="Quitar" style={{ flex: '0 0 auto' }}>
                âœ•
              </button>
            </div>
          </label>
        </div>
      ))}
      <button type="button" className="chip ghost" onClick={addRow} style={{ marginTop: 6 }}>
        + Agregar fecha
      </button>

      <div className="two-col" style={{ marginTop: 8 }}>
        <label>
          Sello / precinto (opcional)
          <input value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="Ej. S-45821" />
        </label>
        <label>
          Observaciones (opcional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Estado del huevo, etc." />
        </label>
      </div>

      {totalEggs > 0 && (
        <p className="hint" style={{ margin: '6px 0 0', color: 'var(--accent)' }}>
          Total recibido: <strong>{num(totalEggs)}</strong> huevos Â·{' '}
          {num1(totalEggs / api.eggsPerTray)} bandejas Â· {Math.ceil(totalEggs / api.eggsPerCart)} carros
        </p>
      )}
      {msg && <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`} style={{ marginTop: 6 }}>{msg.text}</p>}
      {api.error && <p className="msg error" style={{ marginTop: 6 }}>{api.error}</p>}
      <div className="actions row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" disabled={busy || totalEggs <= 0} onClick={submit}>
          {busy ? 'Guardandoâ€¦' : 'âœ“ Registrar cantidades'}
        </button>
      </div>

      {api.arrivals.length > 0 && (
        <>
          <h4 className="section-title" style={{ margin: '16px 0 6px' }}>Ãšltimas cantidades recibidas</h4>
          <div className="admin-list">
            {api.arrivals.slice(0, 8).map((a) => {
              const eggs = (a.received_postures || []).reduce((s, p) => s + (Number(p.eggs) || 0), 0)
              return (
                <div key={a.id} className="admin-row compact" style={{ margin: 0 }}>
                  <span>ðŸ“¦</span>
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>{a.lot_code || 'Lote'} Â· {num(eggs)} huevos</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {a.arrived_at ? new Date(a.arrived_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'â€”'}
                      {' Â· '}
                      {(a.received_postures || []).map((p) => `${fmtDate(p.productionDate)}: ${num(p.eggs)}`).join('  Â·  ')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ArrivalRow({ arrival, getUrl }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let alive = true
    getUrl(arrival.photo_path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [arrival.photo_path, getUrl])

  return (
    <div className="admin-card">
      <div className="admin-row">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" title="Ver foto">
            <img
              src={url}
              alt={`Sello ${arrival.seal_number}`}
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }}
            />
          </a>
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 8,
              background: 'var(--bg-0)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            ðŸ“·
          </div>
        )}
        <div className="admin-row-main" style={{ flex: 1 }}>
          <strong>Sello {arrival.seal_number}</strong>
          <span className="hint" style={{ margin: 0 }}>
            {arrival.arrived_at
              ? new Date(arrival.arrived_at).toLocaleString('es-CO', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'â€”'}
            {arrival.vehicle_plate ? ` Â· ${arrival.vehicle_plate}` : ''}
            {arrival.farm_hint ? ` Â· ${arrival.farm_hint}` : ''}
            {arrival.notes ? ` Â· ${arrival.notes}` : ''}
          </span>
        </div>
        <span className="pill status ok">Llegada</span>
      </div>
    </div>
  )
}

/* â•â• Bandeja de recepciÃ³n (envÃ­os de las granjas) â•â•â•â•â•â•â•â•â•â•â•â• */
function ReceptionInbox({ orgId, userId, role, coordinatorName }) {
  const canCertify = ['owner', 'admin', 'supervisor', 'coordinator', 'reception_operator'].includes(role)
  const er = useEggReports(orgId, userId)
  const [rooms, setRooms] = useState([])
  const [farms, setFarms] = useState([])
  const [people, setPeople] = useState({})
  const [certifyId, setCertifyId] = useState(null)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('rooms').select('id, name, code').order('code'),
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

  const pending = er.reports.filter((r) => r.status === 'verified')
  const received = er.reports.filter((r) => r.status === 'received')
  const receivedToday = received.filter((r) => r.received_at && r.received_at.slice(0, 10) === today())

  const kpis = useMemo(() => {
    let inc = 0
    for (const r of receivedToday) inc += kindTotals(r.received_counts ?? r.counts).inc
    return { pending: pending.length, receivedToday: receivedToday.length, incToday: inc }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length, receivedToday, er.categories])

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>RecepciÃ³n de huevo</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola{firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} Â· verifica y certifica los envÃ­os de las granjas
          </span>
        </div>
        {kpis.pending > 0 && <span className="pill status warn">{kpis.pending} por recibir</span>}
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className={`kpi-card${kpis.pending > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{kpis.pending}</span>
          <span className="kpi-label">Reportes por recibir</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{kpis.receivedToday}</span>
          <span className="kpi-label">Recibidos hoy</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(kpis.incToday)}</span>
          <span className="kpi-label">Huevo incubable recibido hoy</span>
        </div>
      </div>

      {er.error && <p className="msg error">{er.error}</p>}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Por recibir {pending.length > 0 ? `(${pending.length})` : ''}
      </h3>
      {er.loading ? (
        <p className="hint">Cargandoâ€¦</p>
      ) : pending.length === 0 ? (
        <p className="hint">No hay envÃ­os verificados pendientes de recibir. âœ…</p>
      ) : (
        <div className="admin-list">
          {pending.map((r) => {
            const t = kindTotals(r.counts)
            return (
              <div key={r.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>{roomName(r.room_id)} Â· {fmtDate(r.report_date)}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      Reportado: Incubable {num(t.inc)} Â· Comercial {num(t.com)} Â· {farmName(r.farm_id)}
                      {r.verified_by ? ` Â· VerificÃ³ ${nameOf(r.verified_by)}` : ''}
                    </span>
                  </div>
                  <span className="pill status ok">Verificado</span>
                  {canCertify && certifyId !== r.id && (
                    <button className="primary small" onClick={() => setCertifyId(r.id)}>Recibir</button>
                  )}
                </div>
                {certifyId === r.id && (
                  <CertifyForm
                    report={r}
                    categories={er.categories}
                    onCertify={async (counts) => {
                      const res = await er.certifyReport(r.id, counts)
                      if (!res.error) setCertifyId(null)
                      return res
                    }}
                    onCancel={() => setCertifyId(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        En cuarto frÃ­o {received.length > 0 ? `(${received.length})` : ''}
      </h3>
      {received.length === 0 ? (
        <p className="hint">AÃºn no hay huevo certificado en el cuarto frÃ­o.</p>
      ) : (
        <div className="admin-list">
          {received.slice(0, 30).map((r) => {
            const t = kindTotals(r.received_counts ?? r.counts)
            return (
              <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                <span>â„ï¸</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{roomName(r.room_id)} Â· {fmtDate(r.report_date)}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    Recibido: Incubable {num(t.inc)} Â· Comercial {num(t.com)} Â· {farmName(r.farm_id)}
                    {r.received_by ? ` Â· ${nameOf(r.received_by)}` : ''}
                  </span>
                </div>
                <span className="pill status">Recibido</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

