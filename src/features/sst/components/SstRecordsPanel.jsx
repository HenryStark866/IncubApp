/**
 * Registros de SST dentro del módulo SST:
 * - Reportar incidente: cualquier empleado con acceso al módulo (accidente, incidente,
 *   casi accidente o condición insegura, con fotos).
 * - Incidentes: el líder de SST los investiga, define acción correctiva, responsable y
 *   fecha límite, y los cierra.
 * - Inspecciones: el auxiliar de SST las programa y registra el resultado con fotos.
 * Lo pendiente aparece en «Necesita tu decisión» del inicio del líder de SST.
 * Henry Stark Desarrollador
 */
import { useMemo, useState } from 'react'
import { FileLinks, FilesPicker } from '../../../components/RecordFiles'
import { useSstRecords } from '../hooks/useSstRecords'
import {
  INCIDENT_KINDS,
  INCIDENT_STATUS,
  INSPECTION_KINDS,
  INSPECTION_RESULTS,
  SEVERITIES,
  actionPending,
  daysUntil,
  incidentKindLabel,
  incidentStatusLabel,
  inspectionKindLabel,
  inspectionResultLabel,
  severityLabel,
} from '../lib/sstRecords'

const pad = (n) => String(n).padStart(2, '0')
const localInput = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const todayYmd = () => localInput().slice(0, 10)
const when = (v) =>
  v ? new Date(v).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const day = (v) => {
  if (!v) return ''
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}
const STATUS_TONE = { reported: 'var(--danger, #c53030)', investigating: 'var(--amber, #b7791f)', closed: 'var(--ok)' }

function Msg({ msg }) {
  if (!msg) return null
  return (
    <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`} style={{ marginTop: 6 }}>
      {msg.text}
    </p>
  )
}

function SitesList({ id, sites }) {
  return (
    <datalist id={id}>
      {sites.map((s) => (
        <option key={s} value={s} />
      ))}
    </datalist>
  )
}

/* ─── Reportar incidente (cualquier empleado) ─── */

const EMPTY_INCIDENT = {
  occurred_at: '',
  site: '',
  area: '',
  kind: 'incident',
  affected_person: '',
  description: '',
  severity: 'low',
  has_disability: false,
  disability_days: '',
}

function IncidentForm({ api }) {
  const [f, setF] = useState(() => ({ ...EMPTY_INCIDENT, occurred_at: localInput() }))
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const r = await api.reportIncident(f, photos)
    setBusy(false)
    if (r.error) return setMsg({ kind: 'error', text: r.error })
    setF({ ...EMPTY_INCIDENT, occurred_at: localInput() })
    setPhotos([])
    setMsg({ kind: 'ok', text: 'Reporte enviado a SST. Gracias por avisar.' })
  }

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Reporte todo accidente, incidente, casi accidente o condición insegura. SST lo investiga y define la acción
        correctiva.
      </p>
      <div className="two-col">
        <label>
          Tipo
          <select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
            {INCIDENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha y hora
          <input
            type="datetime-local"
            value={f.occurred_at}
            max={localInput()}
            onChange={(e) => set({ occurred_at: e.target.value })}
          />
        </label>
        <label>
          Sede
          <input list="sst-sites" value={f.site} onChange={(e) => set({ site: e.target.value })} placeholder="Planta" />
        </label>
        <label>
          Área o lugar
          <input value={f.area} onChange={(e) => set({ area: e.target.value })} placeholder="Ej. sala de nacedoras" />
        </label>
        <label>
          Persona afectada (si hay)
          <input
            value={f.affected_person}
            onChange={(e) => set({ affected_person: e.target.value })}
            placeholder="Nombre"
          />
        </label>
        <label>
          Gravedad
          <select value={f.severity} onChange={(e) => set({ severity: e.target.value })}>
            {SEVERITIES.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ marginTop: 8 }}>
        ¿Qué pasó?
        <textarea
          rows={3}
          value={f.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Qué pasó, cómo y qué se hizo en el momento"
        />
      </label>
      <div className="two-col" style={{ alignItems: 'end' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={f.has_disability}
            onChange={(e) => set({ has_disability: e.target.checked })}
            style={{ width: 'auto' }}
          />
          Generó incapacidad
        </label>
        {f.has_disability && (
          <label>
            Días de incapacidad
            <input
              type="number"
              min="0"
              value={f.disability_days}
              onChange={(e) => set({ disability_days: e.target.value })}
            />
          </label>
        )}
      </div>
      <FilesPicker label="Fotos (opcional)" files={photos} onChange={setPhotos} />
      <Msg msg={msg} />
      <div className="actions row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" disabled={busy || !f.description.trim()} onClick={submit}>
          {busy ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </div>
    </div>
  )
}

/* ─── Incidentes: seguimiento del líder ─── */

function IncidentEditor({ x, api, onDone }) {
  const [f, setF] = useState({
    status: x.status,
    corrective_action: x.corrective_action || '',
    action_owner: x.action_owner || '',
    action_due: x.action_due || '',
    done: Boolean(x.action_done_at),
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (patch) => setF((v) => ({ ...v, ...patch }))
  const save = async () => {
    if (f.status === 'closed' && f.corrective_action.trim() === '' && x.kind !== 'near_miss')
      return setMsg({ kind: 'error', text: 'Registre la acción correctiva antes de cerrar' })
    setBusy(true)
    const r = await api.updateIncident(x.id, {
      status: f.status,
      corrective_action: f.corrective_action,
      action_owner: f.action_owner,
      action_due: f.action_due,
      action_done_at: f.done ? x.action_done_at || new Date().toISOString() : null,
    })
    setBusy(false)
    if (r.error) return setMsg({ kind: 'error', text: r.error })
    onDone()
  }
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border, #ccc)' }}>
      <div className="two-col">
        <label>
          Estado
          <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            {INCIDENT_STATUS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsable de la acción
          <input value={f.action_owner} onChange={(e) => set({ action_owner: e.target.value })} />
        </label>
        <label>
          Fecha límite
          <input type="date" value={f.action_due} onChange={(e) => set({ action_due: e.target.value })} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', alignSelf: 'end' }}>
          <input
            type="checkbox"
            checked={f.done}
            onChange={(e) => set({ done: e.target.checked })}
            style={{ width: 'auto' }}
          />
          Acción cumplida
        </label>
      </div>
      <label style={{ marginTop: 8 }}>
        Acción correctiva
        <textarea
          rows={2}
          value={f.corrective_action}
          onChange={(e) => set({ corrective_action: e.target.value })}
          placeholder="Qué se va a hacer para que no se repita"
        />
      </label>
      <Msg msg={msg} />
      <div className="actions row" style={{ marginTop: 6 }}>
        <button type="button" className="primary small" disabled={busy} onClick={save}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="ghost small" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function IncidentList({ api, canLead }) {
  const [filter, setFilter] = useState('open')
  const [editing, setEditing] = useState(null)
  const list = api.incidents.filter((x) => (filter === 'open' ? x.status !== 'closed' : true))
  return (
    <div>
      <div className="actions row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {[
          ['open', `Abiertos (${api.incidents.filter((x) => x.status !== 'closed').length})`],
          ['all', 'Todos (6 meses)'],
        ].map(([v, l]) => (
          <button key={v} type="button" className={`chip${filter === v ? '' : ' ghost'}`} onClick={() => setFilter(v)}>
            {l}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="hint">Sin incidentes {filter === 'open' ? 'abiertos' : 'registrados'}.</p>
      ) : (
        <div className="admin-list" style={{ marginTop: 8 }}>
          {list.map((x) => {
            const left = actionPending(x) ? daysUntil(x.action_due) : null
            return (
              <div key={x.id} className="admin-row" style={{ margin: 0, display: 'block' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>
                    {incidentKindLabel(x.kind)}
                    {x.affected_person ? ` · ${x.affected_person}` : ''}
                  </strong>
                  <span className="pill" style={{ color: STATUS_TONE[x.status] }}>
                    {incidentStatusLabel(x.status)}
                  </span>
                  <span className="hint" style={{ margin: 0 }}>
                    {when(x.occurred_at)} · gravedad {severityLabel(x.severity).toLowerCase()}
                    {x.site || x.area ? ` · ${[x.site, x.area].filter(Boolean).join(' / ')}` : ''}
                    {x.has_disability ? ` · incapacidad ${x.disability_days || 0} días` : ''}
                  </span>
                </div>
                <p style={{ margin: '4px 0' }}>{x.description}</p>
                {x.corrective_action && (
                  <p className="hint" style={{ margin: '2px 0' }}>
                    Acción: {x.corrective_action}
                    {x.action_owner ? ` · ${x.action_owner}` : ''}
                    {x.action_due ? ` · límite ${day(x.action_due)}` : ''}
                    {x.action_done_at ? ' · cumplida' : ''}
                    {left != null && left < 0 && (
                      <b style={{ color: 'var(--danger, #c53030)' }}> · vencida hace {-left} días</b>
                    )}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <FileLinks paths={x.photo_paths} />
                  {canLead && editing !== x.id && (
                    <button type="button" className="ghost small" onClick={() => setEditing(x.id)}>
                      {x.status === 'reported' ? 'Investigar' : 'Actualizar'}
                    </button>
                  )}
                </div>
                {editing === x.id && <IncidentEditor x={x} api={api} onDone={() => setEditing(null)} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Inspecciones (auxiliar SST) ─── */

function InspectionFields({ f, set, withSchedule }) {
  return (
    <div className="two-col">
      <label>
        Tipo de inspección
        <select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
          {INSPECTION_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {f.kind === 'other' && (
        <label>
          ¿Cuál?
          <input value={f.kind_other} onChange={(e) => set({ kind_other: e.target.value })} />
        </label>
      )}
      <label>
        Sede
        <input list="sst-sites" value={f.site} onChange={(e) => set({ site: e.target.value })} />
      </label>
      {withSchedule && (
        <label>
          Programada para
          <input
            type="date"
            value={f.scheduled_for}
            min={todayYmd()}
            onChange={(e) => set({ scheduled_for: e.target.value })}
          />
        </label>
      )}
      <label>
        Responsable
        <input value={f.responsible_name} onChange={(e) => set({ responsible_name: e.target.value })} />
      </label>
    </div>
  )
}

function ResultFields({ f, set, photos, setPhotos }) {
  return (
    <>
      <div className="two-col">
        <label>
          Hecha el
          <input
            type="datetime-local"
            value={f.done_at}
            max={localInput()}
            onChange={(e) => set({ done_at: e.target.value })}
          />
        </label>
        <label>
          Resultado
          <select value={f.result} onChange={(e) => set({ result: e.target.value })}>
            <option value="">— Seleccione —</option>
            {INSPECTION_RESULTS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ marginTop: 8 }}>
        Hallazgos {f.result === 'findings' ? '' : '(opcional)'}
        <textarea rows={2} value={f.findings} onChange={(e) => set({ findings: e.target.value })} />
      </label>
      <FilesPicker label="Fotos de la inspección" files={photos} onChange={setPhotos} />
    </>
  )
}

const EMPTY_INSP = {
  kind: 'epp',
  kind_other: '',
  site: '',
  scheduled_for: '',
  responsible_name: '',
  done_at: '',
  result: '',
  findings: '',
}

function InspectionForm({ api, mode, target, userName, onDone }) {
  const [f, setF] = useState(() => ({
    ...EMPTY_INSP,
    ...(target
      ? {
          kind: target.kind,
          kind_other: target.kind_other || '',
          site: target.site || '',
          responsible_name: target.responsible_name || '',
        }
      : {}),
    responsible_name: target?.responsible_name || userName || '',
    scheduled_for: mode === 'schedule' ? todayYmd() : '',
    done_at: localInput(),
  }))
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const r =
      mode === 'schedule'
        ? await api.scheduleInspection(f)
        : await api.recordInspection({ ...f, id: target?.id }, photos)
    setBusy(false)
    if (r.error) return setMsg({ kind: 'error', text: r.error })
    setMsg({ kind: 'ok', text: mode === 'schedule' ? 'Inspección programada' : 'Inspección registrada' })
    setPhotos([])
    onDone?.()
  }
  return (
    <div className="card" style={{ margin: '8px 0', padding: '12px 14px' }}>
      <strong>
        {mode === 'schedule'
          ? 'Programar inspección'
          : target
            ? `Registrar resultado · ${inspectionKindLabel(target)} (${day(target.scheduled_for)})`
            : 'Registrar inspección hecha'}
      </strong>
      {!target && <InspectionFields f={f} set={set} withSchedule={mode === 'schedule'} />}
      {mode !== 'schedule' && <ResultFields f={f} set={set} photos={photos} setPhotos={setPhotos} />}
      <Msg msg={msg} />
      <div className="actions row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" disabled={busy} onClick={submit}>
          {busy ? 'Guardando…' : mode === 'schedule' ? 'Programar' : 'Guardar inspección'}
        </button>
        {onDone && (
          <button type="button" className="ghost" onClick={onDone}>
            Cerrar
          </button>
        )}
      </div>
    </div>
  )
}

function Inspections({ api, canInspect, userName }) {
  const [form, setForm] = useState(null) // 'schedule' | 'record' | { target }
  const pending = api.inspections
    .filter((x) => !x.done_at)
    .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)))
  const done = api.inspections
    .filter((x) => x.done_at)
    .sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)))
    .slice(0, 30)
  return (
    <div>
      {canInspect ? (
        <div className="actions row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="chip ghost" onClick={() => setForm('schedule')}>
            + Programar inspección
          </button>
          <button type="button" className="chip ghost" onClick={() => setForm('record')}>
            + Registrar inspección hecha
          </button>
        </div>
      ) : (
        <p className="hint">Las inspecciones las programa y registra el auxiliar de SST.</p>
      )}
      {(form === 'schedule' || form === 'record') && (
        <InspectionForm key={form} api={api} mode={form} userName={userName} onDone={() => setForm(null)} />
      )}

      <h4 className="section-title" style={{ margin: '14px 0 6px' }}>
        Programadas ({pending.length})
      </h4>
      {pending.length === 0 ? (
        <p className="hint">No hay inspecciones pendientes.</p>
      ) : (
        <div className="admin-list">
          {pending.map((x) => {
            const left = daysUntil(x.scheduled_for)
            return (
              <div key={x.id} className="admin-row" style={{ margin: 0, display: 'block' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ flex: 1 }}>
                    {inspectionKindLabel(x)}
                    {x.site ? ` · ${x.site}` : ''}
                  </strong>
                  <span
                    className="hint"
                    style={{ margin: 0, color: left != null && left < 0 ? 'var(--danger, #c53030)' : undefined }}
                  >
                    {day(x.scheduled_for)}
                    {left != null && left < 0 ? ` · vencida` : left === 0 ? ' · hoy' : ''}
                    {x.responsible_name ? ` · ${x.responsible_name}` : ''}
                  </span>
                  {canInspect && form?.target?.id !== x.id && (
                    <button type="button" className="ghost small" onClick={() => setForm({ target: x })}>
                      Registrar resultado
                    </button>
                  )}
                </div>
                {form?.target?.id === x.id && (
                  <InspectionForm api={api} mode="record" target={x} userName={userName} onDone={() => setForm(null)} />
                )}
              </div>
            )
          })}
        </div>
      )}

      <h4 className="section-title" style={{ margin: '14px 0 6px' }}>
        Hechas recientemente
      </h4>
      {done.length === 0 ? (
        <p className="hint">Todavía no hay inspecciones registradas.</p>
      ) : (
        <div className="admin-list">
          {done.map((x) => (
            <div key={x.id} className="admin-row compact" style={{ margin: 0, display: 'block' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>
                  {inspectionKindLabel(x)}
                  {x.site ? ` · ${x.site}` : ''}
                </strong>
                <span
                  className="pill"
                  style={{ color: x.result === 'findings' ? 'var(--amber, #b7791f)' : 'var(--ok)' }}
                >
                  {inspectionResultLabel(x.result)}
                </span>
                <span className="hint" style={{ margin: 0 }}>
                  {when(x.done_at)}
                  {x.responsible_name ? ` · ${x.responsible_name}` : ''}
                </span>
                <FileLinks paths={x.photo_paths} />
              </div>
              {x.findings && (
                <p className="hint" style={{ margin: '4px 0 0' }}>
                  Hallazgos: {x.findings}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SstRecordsPanel({ orgId, userId, role, area, userName, isOmniscient = false }) {
  const api = useSstRecords({ orgId, userId })
  const canLead =
    isOmniscient ||
    ['owner', 'admin', 'management'].includes(role) ||
    (role === 'coordinator' && ['sst', 'hse'].includes(area))
  const canInspect = canLead || ['sst_auxiliary', 'hse_auxiliary'].includes(role)
  const openCount = useMemo(() => api.incidents.filter((x) => x.status !== 'closed').length, [api.incidents])
  const pendingInsp = useMemo(() => api.inspections.filter((x) => !x.done_at).length, [api.inspections])
  const [view, setView] = useState('report')

  return (
    <div className="card" style={{ margin: '16px 0 0', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="section-title" style={{ margin: 0, flex: 1 }}>
          Registros de SST
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
              ['report', 'Reportar incidente'],
              ['incidents', `Incidentes (${openCount} abiertos)`],
              ['inspections', `Inspecciones (${pendingInsp} programadas)`],
            ].map(([v, l]) => (
              <button key={v} type="button" className={`chip${view === v ? '' : ' ghost'}`} onClick={() => setView(v)}>
                {l}
              </button>
            ))}
          </div>
          <SitesList id="sst-sites" sites={api.sites} />
          {view === 'report' && <IncidentForm api={api} />}
          {view === 'incidents' && <IncidentList api={api} canLead={canLead} />}
          {view === 'inspections' && <Inspections api={api} canInspect={canInspect} userName={userName} />}
        </>
      )}
    </div>
  )
}
