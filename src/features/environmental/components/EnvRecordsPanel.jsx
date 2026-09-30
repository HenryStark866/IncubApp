/**
 * Registros de gestión ambiental dentro del módulo Ambiental:
 * - Residuos: entregas al gestor (kg, aprovechado, acta o certificado) y retiros programados.
 * - Medidores: lecturas de agua, energía y gas por sede; muestra el consumo por día.
 * - Obligaciones: vertimientos, informe de aprovechamiento, permisos… con su vencimiento.
 * Lo pendiente aparece en «Necesita tu decisión» del inicio del líder ambiental.
 * Henry Stark Desarrollador
 */
import { useMemo, useState } from 'react'
import { FileLinks, FilesPicker } from '../../../components/RecordFiles'
import { useEnvRecords } from '../hooks/useEnvRecords'
import { daysUntil } from '../../sst/lib/sstRecords'
import {
  METERS,
  OBLIGATION_STATUS,
  OBLIGATION_SUGGESTIONS,
  WASTE_KINDS,
  meterLabel,
  meterUnit,
  obligationStatusLabel,
  wasteKindLabel,
  wasteOfMonth,
  weekOverWeek,
} from '../lib/envRecords'

const pad = (n) => String(n).padStart(2, '0')
const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const day = (v) => {
  if (!v) return ''
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}
const num = (n, dec = 1) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: dec })

function Msg({ msg }) {
  if (!msg) return null
  return (
    <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`} style={{ marginTop: 6 }}>
      {msg.text}
    </p>
  )
}

const Check = ({ checked, onChange, children }) => (
  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 'auto' }} />
    {children}
  </label>
)

/* ─── Residuos ─── */

const EMPTY_WASTE = {
  recorded_on: '',
  kind: 'organic',
  kg: '',
  manager: '',
  recovered: false,
  scheduled: false,
  notes: '',
}

function WasteForm({ api }) {
  const [f, setF] = useState(() => ({ ...EMPTY_WASTE, recorded_on: todayYmd() }))
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const r = await api.addWaste({ ...f, status: f.scheduled ? 'scheduled' : 'delivered' }, files)
    setBusy(false)
    if (r.error) return setMsg({ kind: 'error', text: r.error })
    setMsg({ kind: 'ok', text: f.scheduled ? 'Retiro programado' : 'Entrega de residuos registrada' })
    setF({ ...EMPTY_WASTE, recorded_on: todayYmd(), kind: f.kind, manager: f.manager })
    setFiles([])
  }
  return (
    <div className="card" style={{ margin: '8px 0', padding: '12px 14px' }}>
      <Check checked={f.scheduled} onChange={(v) => set({ scheduled: v })}>
        Es un retiro programado (todavía no sale)
      </Check>
      <div className="two-col" style={{ marginTop: 6 }}>
        <label>
          {f.scheduled ? 'Fecha del retiro' : 'Fecha de entrega'}
          <input type="date" value={f.recorded_on} onChange={(e) => set({ recorded_on: e.target.value })} />
        </label>
        <label>
          Tipo de residuo
          <select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
            {WASTE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {f.scheduled ? 'Kilos aproximados (opcional)' : 'Kilos'}
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={f.kg}
            onChange={(e) => set({ kg: e.target.value })}
          />
        </label>
        <label>
          Gestor
          <input
            list="env-managers"
            value={f.manager}
            onChange={(e) => set({ manager: e.target.value })}
            placeholder="Empresa que recoge"
          />
        </label>
      </div>
      {!f.scheduled && (
        <div style={{ marginTop: 6 }}>
          <Check checked={f.recovered} onChange={(v) => set({ recovered: v })}>
            Aprovechado (reciclaje, compostaje, harina, etc.)
          </Check>
        </div>
      )}
      <label style={{ marginTop: 8 }}>
        Observaciones (opcional)
        <input value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {!f.scheduled && (
        <FilesPicker label="Acta o certificado del gestor (foto o PDF)" files={files} onChange={setFiles} max={1} pdf />
      )}
      <Msg msg={msg} />
      <div className="actions row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" disabled={busy} onClick={submit}>
          {busy ? 'Guardando…' : f.scheduled ? 'Programar retiro' : 'Registrar entrega'}
        </button>
      </div>
    </div>
  )
}

function ConfirmPickup({ w, api, onDone }) {
  const [f, setF] = useState({
    kg: w.kg > 0 ? String(w.kg) : '',
    recovered: Boolean(w.recovered),
    recorded_on: todayYmd(),
  })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const submit = async () => {
    setBusy(true)
    const r = await api.confirmPickup(w.id, f, files)
    setBusy(false)
    if (r.error) return setMsg({ kind: 'error', text: r.error })
    onDone()
  }
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border, #ccc)' }}>
      <div className="two-col">
        <label>
          Salió el
          <input type="date" value={f.recorded_on} onChange={(e) => setF({ ...f, recorded_on: e.target.value })} />
        </label>
        <label>
          Kilos entregados
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={f.kg}
            onChange={(e) => setF({ ...f, kg: e.target.value })}
          />
        </label>
      </div>
      <div style={{ marginTop: 6 }}>
        <Check checked={f.recovered} onChange={(v) => setF({ ...f, recovered: v })}>
          Aprovechado
        </Check>
      </div>
      <FilesPicker label="Acta o certificado (foto o PDF)" files={files} onChange={setFiles} max={1} pdf />
      <Msg msg={msg} />
      <div className="actions row" style={{ marginTop: 6 }}>
        <button type="button" className="primary small" disabled={busy} onClick={submit}>
          {busy ? 'Guardando…' : 'Confirmar retiro'}
        </button>
        <button type="button" className="ghost small" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function Waste({ api, canEdit }) {
  const [confirming, setConfirming] = useState(null)
  const month = useMemo(() => wasteOfMonth(api.waste), [api.waste])
  const byKind = useMemo(() => {
    const ym = todayYmd().slice(0, 7)
    const m = new Map()
    for (const w of api.waste)
      if (w.status !== 'scheduled' && String(w.recorded_on).startsWith(ym))
        m.set(w.kind, (m.get(w.kind) || 0) + Number(w.kg || 0))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [api.waste])
  const scheduled = api.waste
    .filter((w) => w.status === 'scheduled')
    .sort((a, b) => String(a.recorded_on).localeCompare(String(b.recorded_on)))
  const delivered = api.waste.filter((w) => w.status !== 'scheduled').slice(0, 40)
  const managers = [...new Set(api.waste.map((w) => w.manager).filter(Boolean))]
  return (
    <div>
      <datalist id="env-managers">
        {managers.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <p style={{ margin: '0 0 6px' }}>
        <strong>Este mes:</strong> {num(month.kg)} kg entregados
        {month.pct != null ? ` · ${month.pct} % aprovechado` : ''}
        {byKind.length > 0 && (
          <span className="hint" style={{ margin: 0 }}>
            {' '}
            ({byKind.map(([k, kg]) => `${wasteKindLabel(k).toLowerCase()} ${num(kg)} kg`).join(' · ')})
          </span>
        )}
      </p>
      {canEdit && <WasteForm api={api} />}
      <h4 className="section-title" style={{ margin: '14px 0 6px' }}>
        Retiros programados ({scheduled.length})
      </h4>
      {scheduled.length === 0 ? (
        <p className="hint">No hay retiros programados.</p>
      ) : (
        <div className="admin-list">
          {scheduled.map((w) => {
            const left = daysUntil(w.recorded_on)
            return (
              <div key={w.id} className="admin-row" style={{ margin: 0, display: 'block' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ flex: 1 }}>{wasteKindLabel(w.kind)}</strong>
                  <span
                    className="hint"
                    style={{ margin: 0, color: left != null && left < 0 ? 'var(--danger, #c53030)' : undefined }}
                  >
                    {day(w.recorded_on)}
                    {left != null && left < 0 ? ' · sin confirmar' : left === 0 ? ' · hoy' : ''}
                    {w.manager ? ` · ${w.manager}` : ''}
                    {Number(w.kg) > 0 ? ` · ~${num(w.kg)} kg` : ''}
                  </span>
                  {canEdit && confirming !== w.id && (
                    <button type="button" className="ghost small" onClick={() => setConfirming(w.id)}>
                      Confirmar retiro
                    </button>
                  )}
                </div>
                {confirming === w.id && <ConfirmPickup w={w} api={api} onDone={() => setConfirming(null)} />}
              </div>
            )
          })}
        </div>
      )}
      <h4 className="section-title" style={{ margin: '14px 0 6px' }}>
        Entregas recientes
      </h4>
      {delivered.length === 0 ? (
        <p className="hint">Todavía no hay entregas registradas.</p>
      ) : (
        <div className="admin-list">
          {delivered.map((w) => (
            <div key={w.id} className="admin-row compact" style={{ margin: 0 }}>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>
                  {wasteKindLabel(w.kind)} · {num(w.kg)} kg
                </strong>
                <span className="hint" style={{ margin: 0 }}>
                  {day(w.recorded_on)}
                  {w.manager ? ` · ${w.manager}` : ''} · {w.recovered ? 'aprovechado' : 'disposición final'}
                  {w.notes ? ` · ${w.notes}` : ''}
                </span>
              </div>
              <FileLinks paths={[w.certificate_path]} label="Acta" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Medidores ─── */

function MeterForm({ api }) {
  const [f, setF] = useState({ read_on: todayYmd(), meter: 'water', site: '', reading: '', unit: 'm³', notes: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const prev = useMemo(() => {
    const site = f.site.trim().toLowerCase()
    return api.readings
      .filter(
        (r) =>
          r.meter === f.meter &&
          String(r.site || '')
            .trim()
            .toLowerCase() === site &&
          r.read_on <= f.read_on,
      )
      .sort((a, b) => String(b.read_on).localeCompare(String(a.read_on)))[0]
  }, [api.readings, f.meter, f.site, f.read_on])
  const value = Number(String(f.reading).replace(',', '.'))
  const lower = prev && f.reading !== '' && Number.isFinite(value) && value < Number(prev.reading)
  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const r = await api.addReading(f)
    setBusy(false)
    if (r.error) return setMsg({ kind: 'error', text: r.error })
    setMsg({ kind: 'ok', text: 'Lectura guardada' })
    set({ reading: '', notes: '' })
  }
  return (
    <div className="card" style={{ margin: '8px 0', padding: '12px 14px' }}>
      <div className="two-col">
        <label>
          Medidor
          <select value={f.meter} onChange={(e) => set({ meter: e.target.value, unit: meterUnit(e.target.value) })}>
            {METERS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sede
          <input list="env-sites" value={f.site} onChange={(e) => set({ site: e.target.value })} />
        </label>
        <label>
          Fecha
          <input type="date" value={f.read_on} max={todayYmd()} onChange={(e) => set({ read_on: e.target.value })} />
        </label>
        <label>
          Lectura
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={f.reading}
              onChange={(e) => set({ reading: e.target.value })}
            />
            <input
              value={f.unit}
              onChange={(e) => set({ unit: e.target.value })}
              style={{ width: 70, flex: '0 0 auto' }}
              aria-label="Unidad"
            />
          </div>
        </label>
      </div>
      {prev && (
        <p className="hint" style={{ margin: '6px 0 0', color: lower ? 'var(--danger, #c53030)' : undefined }}>
          Lectura anterior: {num(prev.reading, 3)} {prev.unit} el {day(prev.read_on)}
          {lower
            ? ' · la nueva es menor: revise el número (o anote si cambiaron el medidor)'
            : f.reading !== '' && Number.isFinite(value)
              ? ` · consumo ${num(value - Number(prev.reading), 2)} ${f.unit}`
              : ''}
        </p>
      )}
      <label style={{ marginTop: 8 }}>
        Observaciones (opcional)
        <input value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <Msg msg={msg} />
      <div className="actions row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" disabled={busy || f.reading === ''} onClick={submit}>
          {busy ? 'Guardando…' : 'Guardar lectura'}
        </button>
      </div>
    </div>
  )
}

function Meters({ api, canEdit }) {
  const summary = useMemo(
    () => METERS.map((m) => ({ m, w: weekOverWeek(api.readings, m.value) })).filter((x) => x.w.current || x.w.previous),
    [api.readings],
  )
  return (
    <div>
      {summary.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 8 }}>
          {summary.map(({ m, w }) => (
            <div key={m.value} className={`kpi-card${w.change != null && w.change > 0.15 ? ' warn' : ''}`}>
              <span className="kpi-value">{w.current ? `${num(w.current.perDay)} ${w.current.unit}` : '—'}</span>
              <span className="kpi-label">{m.label} por día (últimos 7 días)</span>
              {w.change != null && (
                <span className="hint" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                  {w.change >= 0 ? '+' : ''}
                  {Math.round(w.change * 100)} % frente a la semana anterior
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && <MeterForm api={api} />}
      <h4 className="section-title" style={{ margin: '14px 0 6px' }}>
        Últimas lecturas
      </h4>
      {api.readings.length === 0 ? (
        <p className="hint">
          Sin lecturas. Anote la lectura de cada medidor al menos una vez por semana (idealmente el mismo día).
        </p>
      ) : (
        <div className="admin-list">
          {api.readings.slice(0, 40).map((r) => (
            <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>
                  {meterLabel(r.meter)}
                  {r.site ? ` · ${r.site}` : ''}: {num(r.reading, 3)} {r.unit}
                </strong>
                <span className="hint" style={{ margin: 0 }}>
                  {day(r.read_on)}
                  {r.notes ? ` · ${r.notes}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Obligaciones ─── */

function ObligationForm({ api }) {
  const [f, setF] = useState({ name: '', due_on: '', status: 'pending', notes: '' })
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const r = await api.addObligation(f, files)
    setBusy(false)
    if (r.error) return setMsg({ kind: 'error', text: r.error })
    setMsg({ kind: 'ok', text: 'Obligación registrada' })
    setF({ name: '', due_on: '', status: 'pending', notes: '' })
    setFiles([])
  }
  return (
    <div className="card" style={{ margin: '8px 0', padding: '12px 14px' }}>
      <datalist id="env-obligations">
        {OBLIGATION_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="two-col">
        <label>
          Obligación
          <input
            list="env-obligations"
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Ej. Permiso de vertimientos"
          />
        </label>
        <label>
          Vence el
          <input type="date" value={f.due_on} onChange={(e) => set({ due_on: e.target.value })} />
        </label>
        <label>
          Estado
          <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            {OBLIGATION_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notas (opcional)
          <input value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Entidad, radicado…" />
        </label>
      </div>
      <FilesPicker
        label="Archivo (permiso, informe o radicado; foto o PDF)"
        files={files}
        onChange={setFiles}
        max={1}
        pdf
      />
      <Msg msg={msg} />
      <div className="actions row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" disabled={busy || !f.name.trim() || !f.due_on} onClick={submit}>
          {busy ? 'Guardando…' : 'Registrar obligación'}
        </button>
      </div>
    </div>
  )
}

function ObligationRow({ o, api, canEdit }) {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const left = o.status === 'done' ? null : daysUntil(o.due_on)
  const save = async (patch, withFiles = []) => {
    setBusy(true)
    const r = await api.updateObligation(o.id, patch, withFiles)
    setBusy(false)
    setErr(r.error)
    if (!r.error) setFiles([])
  }
  return (
    <div className="admin-row" style={{ margin: 0, display: 'block' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ flex: 1 }}>{o.name}</strong>
        <span
          className="hint"
          style={{
            margin: 0,
            color:
              left != null && left < 0
                ? 'var(--danger, #c53030)'
                : left != null && left <= 15
                  ? 'var(--amber, #b7791f)'
                  : undefined,
          }}
        >
          vence {day(o.due_on)}
          {left != null
            ? left < 0
              ? ` · vencida hace ${-left} días`
              : left === 0
                ? ' · hoy'
                : ` · en ${left} días`
            : ''}
        </span>
        <FileLinks paths={[o.file_path]} label="Archivo" />
        {canEdit ? (
          <select
            value={o.status}
            disabled={busy}
            onChange={(e) => save({ status: e.target.value })}
            style={{ width: 'auto' }}
            aria-label="Estado"
          >
            {OBLIGATION_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="pill">{obligationStatusLabel(o.status)}</span>
        )}
      </div>
      {o.notes && (
        <p className="hint" style={{ margin: '4px 0 0' }}>
          {o.notes}
        </p>
      )}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <FilesPicker
            label={o.file_path ? 'Reemplazar archivo' : 'Adjuntar archivo'}
            files={files}
            onChange={setFiles}
            max={1}
            pdf
          />
          {files.length > 0 && (
            <button type="button" className="ghost small" disabled={busy} onClick={() => save({}, files)}>
              {busy ? 'Subiendo…' : 'Subir'}
            </button>
          )}
        </div>
      )}
      {err && <p className="msg error">{err}</p>}
    </div>
  )
}

function Obligations({ api, canEdit }) {
  const [showDone, setShowDone] = useState(false)
  const list = api.obligations.filter((o) => showDone || o.status !== 'done')
  return (
    <div>
      {canEdit && <ObligationForm api={api} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0 6px' }}>
        <h4 className="section-title" style={{ margin: 0, flex: 1 }}>
          Obligaciones y vencimientos
        </h4>
        <Check checked={showDone} onChange={setShowDone}>
          Ver cumplidas
        </Check>
      </div>
      {list.length === 0 ? (
        <p className="hint">No hay obligaciones {showDone ? 'registradas' : 'pendientes'}.</p>
      ) : (
        <div className="admin-list">
          {list.map((o) => (
            <ObligationRow key={o.id} o={o} api={api} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function EnvRecordsPanel({ orgId, userId, role, area, isOmniscient = false }) {
  const api = useEnvRecords({ orgId, userId })
  const canEdit =
    isOmniscient ||
    ['owner', 'admin', 'management', 'environmental_auxiliary'].includes(role) ||
    (role === 'coordinator' && area === 'environmental')
  const [view, setView] = useState('waste')
  const scheduled = api.waste.filter((w) => w.status === 'scheduled').length
  const pending = api.obligations.filter((o) => o.status !== 'done').length

  return (
    <div className="card wide" style={{ margin: '16px 0 0', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="section-title" style={{ margin: 0, flex: 1 }}>
          Registros ambientales
        </h3>
        <button type="button" className="ghost small" onClick={api.reload} disabled={api.loading}>
          {api.loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>
      {api.missing ? (
        <p className="msg error" style={{ marginTop: 8 }}>
          Esta función necesita actualizar la base de datos del servidor. Pida a soporte correr 7-ACTUALIZAR-APP.
        </p>
      ) : (
        <>
          {api.error && <p className="msg error">{api.error}</p>}
          <div className="actions row" style={{ gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
            {[
              ['waste', `Residuos${scheduled ? ` (${scheduled} retiros)` : ''}`],
              ['meters', 'Agua, energía y gas'],
              ['obligations', `Obligaciones (${pending} pendientes)`],
            ].map(([v, l]) => (
              <button key={v} type="button" className={`chip${view === v ? '' : ' ghost'}`} onClick={() => setView(v)}>
                {l}
              </button>
            ))}
          </div>
          <datalist id="env-sites">
            {api.sites.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {!canEdit && (
            <p className="hint">Solo consulta: los registros los hacen el líder y el auxiliar de gestión ambiental.</p>
          )}
          {view === 'waste' && <Waste api={api} canEdit={canEdit} />}
          {view === 'meters' && <Meters api={api} canEdit={canEdit} />}
          {view === 'obligations' && <Obligations api={api} canEdit={canEdit} />}
        </>
      )}
    </div>
  )
}
