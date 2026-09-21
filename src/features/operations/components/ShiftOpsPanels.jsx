/**
 * =============================================================================
 * ARCHIVO: src/components/ShiftOpsPanels.jsx
 * PROPÃ“SITO: Componente UI Â«ShiftOpsPanelsÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useRef, useState } from 'react'
import { useWorkOrders } from '../hooks/useWorkOrders'
import { useEvidence } from '../hooks/useEvidence'
import { useShiftOps } from '../features/operations/hooks/useShiftOps'
import { compressImage } from '../lib/image'
import { canAssignShiftWork } from '../lib/roles'

/* â”€â”€ Helpers compartidos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const fmtDT = (v) => (v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'â€”')
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')
const PRIORITIES = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'CrÃ­tica' },
]
const WO_STATUS = { open: { label: 'Abierta', cls: 'warn' }, in_progress: { label: 'En ejecuciÃ³n', cls: '' }, completed: { label: 'Completada', cls: 'ok' }, cancelled: { label: 'Cancelada', cls: 'idle' } }
const ACT_STATUS = { pending: { label: 'Pendiente', cls: 'warn' }, in_progress: { label: 'En ejecuciÃ³n', cls: '' }, completed: { label: 'Completada', cls: 'ok' } }

// Operarios + gerencia + coord. planta / supervisor pueden atender incidencias
const ATTENDERS = [
  'owner',
  'admin',
  'supervisor',
  'coordinator',
  'management',
  'management_auxiliary',
  'operator',
  'maintenance_auxiliary',
]

function elapsed(fromIso, toIso) {
  if (!fromIso) return null
  const ms = (toIso ? new Date(toIso) : new Date()) - new Date(fromIso)
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

/* â”€â”€ Captura de foto (abre la cÃ¡mara en mÃ³vil) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function PhotoInput({ file, onFile, label = 'ðŸ“· Tomar foto' }) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(null)
  const [compressing, setCompressing] = useState(false)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const handleChange = async (e) => {
    const f = e.target.files?.[0] ?? null
    if (f) {
      setCompressing(true)
      const compressed = await compressImage(f)
      setCompressing(false)
      onFile(compressed)
    } else {
      onFile(null)
    }
  }

  return (
    <div className="photo-field">
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={handleChange} />
      <button type="button" className="ghost" onClick={() => ref.current?.click()} disabled={compressing}>
        {compressing ? 'âŒ› Comprimiendo...' : file ? 'ðŸ“· Cambiar foto' : label}
      </button>
      {preview && <img src={preview} alt="Vista previa" style={{ display: 'block', maxWidth: 180, borderRadius: 8, marginTop: 6 }} />}
    </div>
  )
}

function PhotoLink({ path, getUrl }) {
  if (!path) return null
  const open = async () => {
    const url = await getUrl(path)
    if (url) window.open(url, '_blank', 'noreferrer')
  }
  return <button type="button" className="ghost small" onClick={open}>ðŸ“· Ver foto</button>
}

/* â•â• 1) Reporte de incidencias â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function IncidentReportView({ orgId, userId, plants, rooms, machines }) {
  const wo = useWorkOrders(orgId, userId)
  const ev = useEvidence(orgId, userId)
  const [form, setForm] = useState({ plantId: plants[0]?.id ?? '', roomId: '', machineId: '', title: '', description: '', priority: 'critical' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const plantRooms = rooms.filter((r) => r.plant_id === form.plantId)
  const roomMachines = machines.filter(
    (m) => (form.roomId ? m.room_id === form.roomId : m.plant_id === form.plantId) && m.status !== 'decommissioned'
  )
  const mine = wo.orders.filter((o) => o.source === 'incident' && o.created_by === userId).slice(0, 8)
  const roomName = (id) => rooms.find((r) => r.id === id)?.name
  const machineName = (id) => machines.find((m) => m.id === id)?.name

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const res = await wo.createIncident(form)
    if (res.error) { setBusy(false); setMsg({ kind: 'error', text: res.error }); return }
    if (file && res.id) await ev.uploadEvidence(res.id, file, 'Foto de la incidencia')
    setBusy(false)
    setMsg({ kind: 'ok', text: `Incidencia reportada como OT ${res.code}. Ya es visible para mantenimiento.` })
    setForm((f) => ({ ...f, title: '', description: '', roomId: '', machineId: '' }))
    setFile(null)
  }

  return (
    <div>
      <p className="hint">Reporta una alarma o novedad. Se genera automÃ¡ticamente una OT <strong>crÃ­tica</strong> y general que ven los auxiliares de mantenimiento, los jefes y los operarios de turno (pestaÃ±a OT); cualquiera puede atenderla.</p>
      <div className="inline-form">
        <div className="two-col">
          <label>
            Planta
            <select value={form.plantId} onChange={(e) => setForm((f) => ({ ...f, plantId: e.target.value, roomId: '', machineId: '' }))}>
              {plants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </label>
          <label>
            Prioridad
            <select value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
            </select>
          </label>
        </div>
        <div className="two-col">
          <label>
            SalÃ³n / sala
            <select value={form.roomId} onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value, machineId: '' }))}>
              <option value="">â€” Sin sala especÃ­fica â€”</option>
              {plantRooms.map((r) => (<option key={r.id} value={r.id}>{r.name} ({r.code})</option>))}
            </select>
          </label>
          <label>
            MÃ¡quina (si aplica)
            <select value={form.machineId} onChange={set('machineId')}>
              <option value="">â€” Sin mÃ¡quina â€”</option>
              {roomMachines.map((m) => (<option key={m.id} value={m.id}>{m.name} ({m.code})</option>))}
            </select>
          </label>
        </div>
        <label>
          Alarma / tÃ­tulo de la incidencia
          <input type="text" value={form.title} onChange={set('title')} placeholder="Ej. Alarma de alta temperatura" />
        </label>
        <label>
          DescripciÃ³n
          <textarea rows={3} value={form.description} onChange={set('description')} placeholder="Describe la novedadâ€¦" />
        </label>
        <PhotoInput file={file} onFile={setFile} label="ðŸ“· Tomar foto de la incidencia" />
        {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
        {wo.error && <p className="msg error">{wo.error}</p>}
        <div className="actions row">
          <button className="primary" onClick={submit} disabled={busy || form.title.trim().length < 3 || !form.plantId}>
            {busy ? 'Reportandoâ€¦' : 'Reportar incidencia'}
          </button>
        </div>
      </div>

      {mine.length > 0 && (
        <>
          <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Mis incidencias reportadas</h3>
          <div className="admin-list">
            {mine.map((o) => {
              const st = WO_STATUS[o.status] ?? { label: o.status, cls: '' }
              return (
                <div key={o.id} className="admin-row compact" style={{ margin: 0 }}>
                  <span>âš ï¸</span>
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>{o.code} Â· {o.title}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {[roomName(o.room_id), machineName(o.machine_id)].filter(Boolean).join(' Â· ') || 'Instalaciones'} Â· {fmtDT(o.created_at)}
                    </span>
                  </div>
                  <span className={`pill status ${st.cls}`}>{st.label}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* â•â• 2) OT generales (atender / cerrar) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function CompleteWoForm({ order, ev, onDone }) {
  const [resolution, setResolution] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    if (file) await ev.uploadEvidence(order.id, file, 'Evidencia de cierre')
    await onDone(resolution)
    setBusy(false)
  }
  return (
    <div className="inline-form compact">
      <label>
        ResoluciÃ³n / trabajo realizado
        <textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} autoFocus />
      </label>
      <PhotoInput file={file} onFile={setFile} label="ðŸ“· Foto de evidencia" />
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy}>{busy ? 'Cerrandoâ€¦' : 'Cerrar OT'}</button>
      </div>
    </div>
  )
}

export function WorkOrdersView({ orgId, userId, role, rooms, machines }) {
  const wo = useWorkOrders(orgId, userId)
  const ev = useEvidence(orgId, userId)
  const canAttend = ATTENDERS.includes(role)
  const [completingId, setCompletingId] = useState(null)
  const roomName = (id) => rooms.find((r) => r.id === id)?.name
  const machineName = (id) => machines.find((m) => m.id === id)?.name
  const nEv = (id) => ev.evidence.filter((e) => e.work_order_id === id).length

  const active = wo.orders.filter((o) => o.status === 'open' || o.status === 'in_progress')

  return (
    <div>
      <p className="hint">Ã“rdenes de trabajo generales. Cualquier tÃ©cnico o jefe (y operarios con experiencia) puede atenderlas y cerrarlas.</p>
      {wo.error && <p className="msg error">{wo.error}</p>}
      {active.length === 0 ? (
        <p className="hint">No hay OT activas. ðŸŽ‰</p>
      ) : (
        <div className="admin-list">
          {active.map((o) => {
            const st = WO_STATUS[o.status] ?? { label: o.status, cls: '' }
            const mine = o.assigned_to === userId
            const lugar = [roomName(o.room_id), machineName(o.machine_id)].filter(Boolean).join(' Â· ') || 'Instalaciones'
            return (
              <div key={o.id} className={`admin-card wo-card pr-${o.priority}`}>
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      <span className="machine-code">{o.code}</span> {o.title}
                      {o.source === 'incident' && <span className="pill status warn" style={{ marginLeft: 6 }}>Incidencia</span>}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      ðŸ“ {lugar}
                      {o.assigned_to ? ` Â· ðŸ‘¤ ${wo.team.find((t) => t.id === o.assigned_to)?.name ?? 'â€”'}${mine ? ' (tÃº)' : ''}` : ' Â· Sin asignar'}
                      {nEv(o.id) > 0 ? ` Â· ðŸ“Ž ${nEv(o.id)}` : ''}
                    </span>
                  </div>
                  <span className={`pill status ${st.cls}`}>{st.label}</span>
                  <span className="admin-row-actions">
                    {canAttend && o.status === 'open' && !o.assigned_to && (
                      <button className="primary small" onClick={() => wo.claimOrder(o.id)}>Atender</button>
                    )}
                    {canAttend && o.status === 'in_progress' && mine && completingId !== o.id && (
                      <button className="primary small" onClick={() => setCompletingId(o.id)}>Cerrar</button>
                    )}
                  </span>
                </div>
                {o.description && <p className="wo-desc">{o.description}</p>}
                {completingId === o.id && mine && (
                  <CompleteWoForm
                    order={o}
                    ev={ev}
                    onDone={async (resolution) => {
                      await wo.completeOrder(o.id, { resolution, downtimeMinutes: '', cost: '' })
                      setCompletingId(null)
                    }}
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

/* â•â• 3) Actividades del turno â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function CompleteActivityForm({ rooms, machines, plantId, onComplete }) {
  const [completion, setCompletion] = useState('complete')
  const [resultQty, setResultQty] = useState('')
  const [resultNote, setResultNote] = useState('')
  const [roomId, setRoomId] = useState('')
  const [machineId, setMachineId] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const plantRooms = rooms.filter((r) => !plantId || r.plant_id === plantId)
  const roomMachines = machines.filter((m) => (roomId ? m.room_id === roomId : true) && m.status !== 'decommissioned')

  const submit = async () => {
    setBusy(true)
    await onComplete({ completion, resultQty, resultNote, roomId, machineId, file })
    setBusy(false)
  }

  return (
    <div className="inline-form compact">
      <div className="two-col">
        <label>
          Â¿Se cumpliÃ³?
          <select value={completion} onChange={(e) => setCompletion(e.target.value)}>
            <option value="complete">Completa</option>
            <option value="partial">Parcial</option>
          </select>
        </label>
        <label>
          Cantidad (ej. canastas lavadas)
          <input type="number" min="0" value={resultQty} onChange={(e) => setResultQty(e.target.value)} placeholder="0" />
        </label>
      </div>
      <div className="two-col">
        <label>
          Sala
          <select value={roomId} onChange={(e) => { setRoomId(e.target.value); setMachineId('') }}>
            <option value="">â€” Sin sala â€”</option>
            {plantRooms.map((r) => (<option key={r.id} value={r.id}>{r.name} ({r.code})</option>))}
          </select>
        </label>
        <label>
          MÃ¡quina
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">â€” Sin mÃ¡quina â€”</option>
            {roomMachines.map((m) => (<option key={m.id} value={m.id}>{m.name} ({m.code})</option>))}
          </select>
        </label>
      </div>
      <label>
        Observaciones
        <input type="text" value={resultNote} onChange={(e) => setResultNote(e.target.value)} placeholder="Opcional" />
      </label>
      <PhotoInput file={file} onFile={setFile} label="ðŸ“· Foto de evidencia" />
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy}>{busy ? 'Guardandoâ€¦' : 'Finalizar actividad'}</button>
      </div>
    </div>
  )
}

const GRANT_MODULES = [
  { value: '', label: 'â€” Sin mÃ³dulo â€”' },
  { value: 'reception', label: 'Habilita RecepciÃ³n' },
]
const grantLabel = (v) => GRANT_MODULES.find((g) => g.value === v)?.label ?? v

function CatalogManager({ catalog, onAdd, onRemove, onClose }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [grantsModule, setGrantsModule] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true)
    const { error } = await onAdd({ name, description, grantsModule })
    setBusy(false)
    if (!error) { setName(''); setDescription(''); setGrantsModule('') }
  }
  return (
    <div className="inline-form">
      <p className="component-title" style={{ margin: 0 }}>CatÃ¡logo de actividades del turno</p>
      <div className="two-col">
        <label>Nombre<input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Lavado de canastas" /></label>
        <label>DescripciÃ³n<input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" /></label>
      </div>
      <label>
        Habilita mÃ³dulo (opcional)
        <select value={grantsModule} onChange={(e) => setGrantsModule(e.target.value)}>
          {GRANT_MODULES.map((g) => (<option key={g.value} value={g.value}>{g.label}</option>))}
        </select>
      </label>
      {grantsModule && (
        <p className="hint" style={{ margin: 0 }}>Al asignar esta actividad, el operario podrÃ¡ usar ese mÃ³dulo mientras la tarea estÃ© activa.</p>
      )}
      <div className="actions row">
        <button className="primary small" onClick={add} disabled={busy || name.trim().length < 2}>+ Agregar al catÃ¡logo</button>
        <button className="ghost" onClick={onClose}>Cerrar</button>
      </div>
      {catalog.length === 0 ? (
        <p className="hint">El catÃ¡logo estÃ¡ vacÃ­o. Agrega las actividades tÃ­picas del turno.</p>
      ) : (
        <div className="admin-list">
          {catalog.map((c) => (
            <div key={c.id} className="admin-row compact" style={{ margin: 0 }}>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{c.name}</strong>
                {c.description && <span className="hint" style={{ margin: 0 }}>{c.description}</span>}
              </div>
              {c.grants_module && <span className="pill status warn">{grantLabel(c.grants_module)}</span>}
              <button className="ghost danger" onClick={() => onRemove(c.id)} title="Quitar del catÃ¡logo">âœ•</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ShiftActivitiesView({ orgId, userId, role, area, plants, rooms, machines, team }) {
  const so = useShiftOps(orgId, userId)
  const canAssign = canAssignShiftWork(role, area)
  const [showForm, setShowForm] = useState(false)
  const [manageCatalog, setManageCatalog] = useState(false)
  const [completingId, setCompletingId] = useState(null)
  const [form, setForm] = useState({ catalogId: '', title: '', description: '', assignedTo: '', plantId: plants[0]?.id ?? '', roomId: '', machineId: '', grantsModule: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const pickActivity = (e) => {
    const id = e.target.value
    const c = so.catalog.find((x) => x.id === id)
    setForm((f) => ({ ...f, catalogId: id, title: c?.name ?? '', description: c?.description ?? '', grantsModule: c?.grants_module ?? '' }))
  }

  const roomName = (id) => rooms.find((r) => r.id === id)?.name
  const machineName = (id) => machines.find((m) => m.id === id)?.name
  const nameOf = (id) => team.find((t) => t.id === id)?.name ?? 'â€”'
  const plantRooms = rooms.filter((r) => r.plant_id === form.plantId)

  const visible = canAssign ? so.activities : so.activities.filter((a) => a.assigned_to === userId)

  const submitNew = async () => {
    const { error } = await so.createActivity(form)
    if (!error) { setShowForm(false); setForm((f) => ({ ...f, catalogId: '', title: '', description: '', assignedTo: '', grantsModule: '' })) }
  }

  return (
    <div>
      <div className="admin-section-head">
        <span className="component-title" style={{ margin: 0 }}>{canAssign ? 'Actividades del turno' : 'Mis actividades del turno'}</span>
        {canAssign && (
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <button className={manageCatalog ? 'chip active' : 'chip ghost'} onClick={() => setManageCatalog((v) => !v)}>CatÃ¡logo</button>
            {!showForm && <button className="chip ghost" onClick={() => setShowForm(true)}>+ Asignar actividad</button>}
          </span>
        )}
      </div>

      {manageCatalog && canAssign && (
        <CatalogManager catalog={so.catalog} onAdd={so.addCatalogItem} onRemove={so.removeCatalogItem} onClose={() => setManageCatalog(false)} />
      )}

      {showForm && canAssign && (
        <div className="inline-form">
          <label>
            Actividad (del catÃ¡logo)
            <select value={form.catalogId} onChange={pickActivity} autoFocus>
              <option value="">â€” Selecciona una actividad â€”</option>
              {so.catalog.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>
          {so.catalog.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>No hay actividades en el catÃ¡logo. Ãbrelo con Â«CatÃ¡logoÂ» y agrega una.</p>
          )}
          <label>
            DescripciÃ³n
            <textarea rows={2} value={form.description} onChange={set('description')} placeholder="Detalleâ€¦" />
          </label>
          <div className="two-col">
            <label>
              Asignar a
              <select value={form.assignedTo} onChange={set('assignedTo')}>
                <option value="">â€” Selecciona operario â€”</option>
                {team.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </label>
            <label>
              Planta
              <select value={form.plantId} onChange={(e) => setForm((f) => ({ ...f, plantId: e.target.value, roomId: '' }))}>
                {plants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </label>
          </div>
          <label>
            Sala (opcional)
            <select value={form.roomId} onChange={set('roomId')}>
              <option value="">â€” Sin sala â€”</option>
              {plantRooms.map((r) => (<option key={r.id} value={r.id}>{r.name} ({r.code})</option>))}
            </select>
          </label>
          <div className="actions row">
            <button className="primary small" onClick={submitNew} disabled={!form.catalogId || !form.assignedTo}>Asignar</button>
            <button className="ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {so.error && <p className="msg error">{so.error}</p>}

      {so.loading ? (
        <p className="hint">Cargandoâ€¦</p>
      ) : visible.length === 0 ? (
        <p className="hint">{canAssign ? 'No hay actividades asignadas.' : 'No tienes actividades asignadas en este turno.'}</p>
      ) : (
        <div className="admin-list">
          {visible.map((a) => {
            const st = ACT_STATUS[a.status] ?? { label: a.status, cls: '' }
            const mine = a.assigned_to === userId
            const canWork = mine || canAssign
            return (
              <div key={a.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {a.title}
                      {a.grants_module && <span className="pill status warn" style={{ marginLeft: 6 }}>{grantLabel(a.grants_module)}</span>}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      ðŸ‘¤ {nameOf(a.assigned_to)}{mine ? ' (tÃº)' : ''}
                      {[roomName(a.room_id), machineName(a.machine_id)].filter(Boolean).length ? ` Â· ðŸ“ ${[roomName(a.room_id), machineName(a.machine_id)].filter(Boolean).join(' Â· ')}` : ''}
                      {a.started_at ? ` Â· â±ï¸ ${elapsed(a.started_at, a.completed_at)}` : ''}
                    </span>
                  </div>
                  <span className={`pill status ${st.cls}`}>{st.label}</span>
                  <span className="admin-row-actions">
                    {canWork && a.status === 'pending' && <button className="primary small" onClick={() => so.startActivity(a.id)}>Iniciar</button>}
                    {canWork && a.status === 'in_progress' && completingId !== a.id && <button className="primary small" onClick={() => setCompletingId(a.id)}>Finalizar</button>}
                    {canAssign && <button className="ghost danger" onClick={() => so.deleteActivity(a.id)} title="Eliminar">âœ•</button>}
                  </span>
                </div>
                {a.description && <p className="wo-desc">{a.description}</p>}
                {a.status === 'completed' && (
                  <p className="wo-desc done">
                    âœ” {a.completion === 'partial' ? 'Cumplida parcial' : 'Cumplida completa'}
                    {a.result_qty != null ? ` Â· Cantidad: ${num(a.result_qty)}` : ''}
                    {a.result_note ? ` Â· ${a.result_note}` : ''}
                    {a.completed_at ? ` Â· ${fmtDT(a.completed_at)}` : ''}
                  </p>
                )}
                {a.photo_path && <div style={{ padding: '0 14px 8px' }}><PhotoLink path={a.photo_path} getUrl={so.getPhotoUrl} /></div>}
                {completingId === a.id && a.status === 'in_progress' && (
                  <CompleteActivityForm
                    rooms={rooms}
                    machines={machines}
                    plantId={a.plant_id}
                    onComplete={async (vals) => {
                      const { error } = await so.completeActivity(a.id, vals)
                      if (!error) setCompletingId(null)
                    }}
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

/* â•â• 4) Reporte de mercancÃ­a recibida â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function MerchandiseView({ orgId, userId, plants, rooms }) {
  const so = useShiftOps(orgId, userId)
  const [open, setOpen] = useState(false)
  const [plantId, setPlantId] = useState(plants[0]?.id ?? '')
  const [roomId, setRoomId] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const plantRooms = rooms.filter((r) => r.plant_id === plantId)
  const roomName = (id) => rooms.find((r) => r.id === id)?.name ?? 'Sin ubicaciÃ³n'

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await so.saveMerchandise({ plantId, roomId, description, file })
    setBusy(false)
    if (error) setErr(error)
    else { setOpen(false); setFile(null); setDescription(''); setRoomId('') }
  }

  return (
    <div>
      <div className="admin-section-head">
        <span className="component-title" style={{ margin: 0 }}>MercancÃ­a recibida</span>
        {!open && <button className="chip ghost" onClick={() => setOpen(true)}>ðŸ“· Reportar mercancÃ­a</button>}
      </div>

      {open && (
        <div className="inline-form">
          <p className="hint" style={{ margin: 0 }}>Toma la foto de la mercancÃ­a y luego indica dÃ³nde queda almacenada.</p>
          <PhotoInput file={file} onFile={setFile} label="ðŸ“· Tomar foto de la mercancÃ­a" />
          <div className="two-col">
            <label>
              Planta
              <select value={plantId} onChange={(e) => { setPlantId(e.target.value); setRoomId('') }}>
                {plants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </label>
            <label>
              UbicaciÃ³n (sala)
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">â€” Selecciona la sala â€”</option>
                {plantRooms.map((r) => (<option key={r.id} value={r.id}>{r.name} ({r.code})</option>))}
              </select>
            </label>
          </div>
          <label>
            DescripciÃ³n
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. 20 sacos de alimento" />
          </label>
          {err && <p className="msg error">{err}</p>}
          <div className="actions row">
            <button className="primary" onClick={submit} disabled={busy || !file || !roomId}>{busy ? 'Guardandoâ€¦' : 'Guardar reporte'}</button>
            <button className="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
          </div>
        </div>
      )}
      {so.error && <p className="msg error">{so.error}</p>}

      {so.merchandise.length === 0 ? (
        <p className="hint">AÃºn no hay reportes de mercancÃ­a.</p>
      ) : (
        <div className="admin-list">
          {so.merchandise.slice(0, 30).map((r) => (
            <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
              <span>ðŸ“¦</span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{r.description || 'MercancÃ­a recibida'}</strong>
                <span className="hint" style={{ margin: 0 }}>ðŸ“ {roomName(r.room_id)} Â· {fmtDT(r.received_at)}</span>
              </div>
              <PhotoLink path={r.photo_path} getUrl={so.getPhotoUrl} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

