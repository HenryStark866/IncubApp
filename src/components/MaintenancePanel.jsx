/**
 * =============================================================================
 * ARCHIVO: src/components/MaintenancePanel.jsx
 * PROPÓSITO: Componente UI «MaintenancePanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkOrders } from '../hooks/useWorkOrders'
import { useEvidence, useActivityCatalog } from '../hooks/useEvidence'
import ListControls, { useListControls } from './ListControls'
import MachineDossier from './MachineDossier'
import { compressImage } from '../lib/image'
import { exportToExcel } from '../lib/exportExcel'
import {
  MAINTENANCE_POLICY,
  MAINTENANCE_OBJECTIVES,
  MAINTENANCE_FRAMEWORK,
  MAINTENANCE_STRATEGY_TYPES,
  MAINTENANCE_RISKS,
  MAINTENANCE_REVIEW_CYCLE,
  MAINTENANCE_DOC_MAP,
  buildLiveResultsAndIndicators,
} from '../lib/maintenanceManagementPlan'

const WO_TYPES = [
  { value: 'preventive', label: 'Preventivo' },
  { value: 'corrective', label: 'Correctivo' },
  { value: 'inspection', label: 'Inspección' },
]
const WO_PRIORITIES = [
  { value: 'low', label: 'Baja', cls: 'idle' },
  { value: 'medium', label: 'Media', cls: '' },
  { value: 'high', label: 'Alta', cls: 'warn' },
  { value: 'critical', label: 'Crítica', cls: 'off' },
]
const WO_STATUS = [
  { value: 'open', label: 'Abierta', cls: 'warn' },
  { value: 'in_progress', label: 'En ejecución', cls: '' },
  { value: 'completed', label: 'Completada', cls: 'ok' },
  { value: 'cancelled', label: 'Cancelada', cls: 'idle' },
]
const LOCATIONS = [
  { value: 'plant', label: 'Planta' },
  { value: 'farm', label: 'Granja' },
  { value: 'other', label: 'Otro lugar' },
]

const FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'open', label: 'Abiertas' },
  { value: 'in_progress', label: 'En ejecución' },
  { value: 'completed', label: 'Completadas' },
  { value: 'cancelled', label: 'Canceladas' },
]

const typeLabel = (v) => WO_TYPES.find((t) => t.value === v)?.label ?? v
const priorityOf = (v) => WO_PRIORITIES.find((p) => p.value === v) ?? { label: v, cls: '' }
const statusOf = (v) => WO_STATUS.find((s) => s.value === v) ?? { label: v, cls: '' }
const locationLabel = (v) => LOCATIONS.find((l) => l.value === v)?.label ?? v
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : null)
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)
const fmtCost = (n) => (n != null ? `$${Number(n).toLocaleString('es-CO')}` : null)

/* ══ Formulario de actividad / nueva OT ══════════════════════ */
function NewOrderForm({ plants, machines, team, catalog, myName, onCreate, onCancel }) {
  const [now, setNow] = useState(new Date())
  const [form, setForm] = useState({
    activityId: '',
    locationType: 'plant',
    locationName: '',
    plantId: plants[0]?.id ?? '',
    machineId: '',
    type: 'corrective',
    priority: 'medium',
    title: '',
    description: '',
    scheduledFor: '',
    assignedTo: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const pickActivity = (e) => {
    const id = e.target.value
    const a = catalog.find((c) => c.id === id)
    setForm((f) => ({
      ...f,
      activityId: id,
      title: a ? a.name : f.title,
      description: a ? a.description : f.description,
      type: a ? a.wo_type : f.type,
    }))
  }

  const plantMachines = machines.filter((m) => m.plant_id === form.plantId)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onCreate(form)
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      {/* Datos automáticos: fecha, hora y usuario */}
      <div className="auto-banner">
        <span>📅 {now.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
        <span>🕐 {now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
        <span>👤 {myName}</span>
      </div>

      <label>
        Actividad predeterminada (autocompleta título y descripción)
        <select value={form.activityId} onChange={pickActivity}>
          <option value="">— Actividad personalizada —</option>
          {catalog.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>

      <div className="two-col">
        <label>
          Lugar de trabajo
          <select value={form.locationType} onChange={set('locationType')}>
            {LOCATIONS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
        {form.locationType === 'plant' ? (
          <label>
            Planta
            <select value={form.plantId} onChange={(e) => setForm((f) => ({ ...f, plantId: e.target.value, machineId: '' }))}>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Nombre del lugar
            <input
              type="text"
              value={form.locationName}
              onChange={set('locationName')}
              placeholder={form.locationType === 'farm' ? 'Ej. Granja La Esperanza' : 'Ej. Bodega externa'}
            />
          </label>
        )}
      </div>

      {form.locationType === 'plant' && (
        <label>
          Máquina (opcional)
          <select value={form.machineId} onChange={set('machineId')}>
            <option value="">— Instalaciones generales —</option>
            {plantMachines.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
            ))}
          </select>
        </label>
      )}

      <div className="two-col">
        <label>
          Tipo
          <select value={form.type} onChange={set('type')}>
            {WO_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label>
          Prioridad
          <select value={form.priority} onChange={set('priority')}>
            {WO_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Título
        <input type="text" value={form.title} onChange={set('title')} placeholder="Ej. Cambio de rodamientos del ventilador" />
      </label>
      <label>
        Descripción
        <textarea rows={3} value={form.description} onChange={set('description')} placeholder="Detalle del trabajo, repuestos, hallazgos…" />
      </label>
      <div className="two-col">
        <label>
          Fecha programada (opcional)
          <input type="date" value={form.scheduledFor} onChange={set('scheduledFor')} />
        </label>
        <label>
          Asignar a (opcional)
          <select value={form.assignedTo} onChange={set('assignedTo')}>
            <option value="">Sin asignar</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button
          className="primary"
          onClick={submit}
          disabled={busy || form.title.trim().length < 3 || (form.locationType === 'plant' && !form.plantId)}
        >
          {busy ? 'Creando…' : 'Registrar actividad'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* ══ Edición de una OT existente ═════════════════════════════ */
function EditOrderForm({ order, onSave, onCancel }) {
  const [title, setTitle] = useState(order.title)
  const [description, setDescription] = useState(order.description ?? '')
  const [priority, setPriority] = useState(order.priority)
  const [scheduledFor, setScheduledFor] = useState(order.scheduled_for ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    await onSave(order.id, {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      scheduled_for: scheduledFor || null,
    })
    setBusy(false)
    onCancel()
  }

  return (
    <div className="inline-form compact">
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <label>
        Descripción
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="two-col">
        <label>
          Prioridad
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {WO_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label>
          Fecha programada
          <input type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </label>
      </div>
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy || title.trim().length < 3}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* ══ Evidencias de una OT ════════════════════════════════════ */
function EvidencePanel({ order, ev, nameOf, canDeleteAll, userId, executing }) {
  const items = ev.evidence.filter((e) => e.work_order_id === order.id)
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [err, setErr] = useState(null)
  const [inputKey, setInputKey] = useState(0)

  const upload = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await ev.uploadEvidence(order.id, file, note)
    setBusy(false)
    if (error) setErr(error)
    else {
      setFile(null)
      setNote('')
      setInputKey((k) => k + 1)
    }
  }

  const open = async (item, download) => {
    const url = await ev.getFileUrl(item.file_path, download)
    if (url) window.open(url, '_blank', 'noreferrer')
  }

  const remove = async (item) => {
    if (!window.confirm(`¿Eliminar la evidencia "${item.file_name}"?`)) return
    await ev.deleteEvidence(item)
  }

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.type.startsWith('image/')) {
      setCompressing(true)
      const compressed = await compressImage(f)
      setCompressing(false)
      setFile(compressed)
    } else {
      setFile(f)
    }
  }

  return (
    <div className={`evidence-panel${executing ? ' executing' : ''}`}>
      {executing && (
        <p className="evidence-live-hint">
          🔧 Actividad en ejecución — adjunta aquí las fotos y documentos de evidencia a medida que avanzas.
        </p>
      )}
      {items.length === 0 && <p className="hint" style={{ margin: '0 0 6px' }}>Sin evidencias todavía.</p>}
      {items.map((item) => (
        <div key={item.id} className="evidence-row">
          <span className="evidence-icon">{item.file_type === 'image' ? '🖼️' : '📄'}</span>
          <div className="admin-row-main" style={{ flex: 1 }}>
            <strong>{item.file_name}</strong>
            <span className="hint" style={{ margin: 0 }}>
              {nameOf(item.uploaded_by) ?? '—'} · {fmtDateTime(item.created_at)}
              {item.note ? ` · ${item.note}` : ''}
            </span>
          </div>
          <span className="admin-row-actions" style={{ width: 'auto' }}>
            <button className="ghost" onClick={() => open(item, false)}>Ver</button>
            <button className="ghost" onClick={() => open(item, true)}>Descargar</button>
            {(canDeleteAll || item.uploaded_by === userId) && (
              <button className="ghost danger" onClick={() => remove(item)}>✕</button>
            )}
          </span>
        </div>
      ))}

      <div className="evidence-upload">
        <input
          key={inputKey}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileChange}
          disabled={compressing}
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={compressing ? 'Comprimiendo imagen...' : 'Nota de la evidencia (opcional)'}
          disabled={compressing}
        />
        <button className="primary small" onClick={upload} disabled={busy || !file || compressing}>
          {busy ? 'Subiendo…' : compressing ? '⌛...' : '📎 Adjuntar'}
        </button>
      </div>
      {err && <p className="msg error">{err}</p>}
    </div>
  )
}

/* ══ Informe imprimible (PDF vía imprimir/guardar) ═══════════ */
function PrintReport({ orders, orgName, myName, machineOf, plantOf, nameOf, evidenceCount, onClose }) {
  return (
    <div className="print-report-overlay">
      <div className="print-actions no-print">
        <button className="primary" onClick={() => window.print()}>
          🖨️ Imprimir / Guardar como PDF
        </button>
        <button className="ghost" onClick={onClose}>Cerrar</button>
      </div>
      <div className="print-report">
        <header>
          <h1>Informe de actividades de mantenimiento</h1>
          <p>
            {orgName} · Generado por {myName} · {new Date().toLocaleString('es-CO')}
            <br />
            {orders.length} actividad{orders.length === 1 ? '' : 'es'} incluida{orders.length === 1 ? '' : 's'}
          </p>
        </header>
        <table>
          <thead>
            <tr>
              <th>OT</th>
              <th>Actividad</th>
              <th>Lugar</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Responsable</th>
              <th>Fechas</th>
              <th>Parada</th>
              <th>Costo</th>
              <th>Evid.</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const machine = machineOf(o.machine_id)
              const plant = plantOf(o.plant_id)
              const lugar =
                o.location_type === 'plant'
                  ? [plant?.name, machine ? `${machine.name} (${machine.code})` : 'Instalaciones'].filter(Boolean).join(' · ')
                  : `${locationLabel(o.location_type)}${o.location_name ? `: ${o.location_name}` : ''}`
              return (
                <tr key={o.id}>
                  <td>{o.code}</td>
                  <td>
                    <strong>{o.title}</strong>
                    {o.description ? <div className="rep-desc">{o.description}</div> : null}
                    {o.resolution ? <div className="rep-desc">Resolución: {o.resolution}</div> : null}
                  </td>
                  <td>{lugar}</td>
                  <td>{typeLabel(o.type)}</td>
                  <td>{statusOf(o.status).label}</td>
                  <td>{nameOf(o.assigned_to) ?? 'Sin asignar'}</td>
                  <td>
                    Creada: {fmtDate(o.created_at)}
                    {o.completed_at ? <><br />Cierre: {fmtDate(o.completed_at)}</> : null}
                  </td>
                  <td>{o.downtime_minutes != null ? `${o.downtime_minutes} min` : '—'}</td>
                  <td>{fmtCost(o.cost) ?? '—'}</td>
                  <td>{evidenceCount(o.id)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <footer>IncubApp — informe generado desde el módulo de mantenimiento con trazabilidad completa.</footer>
      </div>
    </div>
  )
}

/* ══ Panel principal ═════════════════════════════════════════ */
export default function MaintenancePanel({ orgId, userId, role }) {
  // Gestión de OT (crear/editar/asignar/cancelar): owner/admin/coordinador y el supervisor de planta.
  const canManage = ['owner', 'admin', 'coordinator', 'supervisor'].includes(role)
  // Borrar OT es destructivo → solo owner/admin (coincide con la RLS work_orders_delete = is_org_admin).
  const canDelete = ['owner', 'admin'].includes(role)
  // Auxiliar de mantenimiento: solo ve y ejecuta las OT que le asignan (no crea/edita/asigna)
  const isAux = role === 'maintenance_auxiliary'
  const wo = useWorkOrders(orgId, userId)
  const ev = useEvidence(orgId, userId)
  const catalog = useActivityCatalog(orgId)
  const [plants, setPlants] = useState([])
  const [machines, setMachines] = useState([])
  const [orgName, setOrgName] = useState('')
  const [exportingPlan, setExportingPlan] = useState(false)
  const [filter, setFilter] = useState('all')
  const [mineOnly, setMineOnly] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [completingId, setCompletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [evidenceId, setEvidenceId] = useState(null)
  const [report, setReport] = useState(null)
  const [dossierMachineId, setDossierMachineId] = useState(null)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('created_at'),
      supabase.from('machines').select('id, plant_id, name, code, status'),
      supabase.from('organizations').select('name').eq('id', orgId).single(),
    ]).then(([p, m, o]) => {
      setPlants(p.data ?? [])
      setMachines(m.data ?? [])
      setOrgName(o.data?.name ?? '')
    })
  }, [orgId, wo.orders.length])

  // El auxiliar ve sus OT asignadas + las OT generales sin asignar (incidencias) que puede atender
  const visibleOrders = useMemo(
    () => (isAux ? wo.orders.filter((o) => o.assigned_to === userId || (o.status === 'open' && !o.assigned_to)) : wo.orders),
    [wo.orders, isAux, userId]
  )

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, completed: 0, cancelled: 0 }
    for (const o of visibleOrders) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [visibleOrders])

  const machineOf = (id) => machines.find((m) => m.id === id)
  const plantOf = (id) => plants.find((p) => p.id === id)
  const nameOf = (id) => wo.team.find((t) => t.id === id)?.name ?? null
  const myName = nameOf(userId) ?? 'Usuario'
  const evidenceCount = (woId) => ev.evidence.filter((e) => e.work_order_id === woId).length

  const byStatus = (filter === 'all' ? visibleOrders : visibleOrders.filter((o) => o.status === filter)).filter(
    (o) => !mineOnly || o.assigned_to === userId || o.created_by === userId
  )

  const lc = useListControls(byStatus, (o, q) =>
    [o.code, o.title, o.description, o.location_name, machineOf(o.machine_id)?.name, machineOf(o.machine_id)?.code, nameOf(o.assigned_to)]
      .some((v) => v?.toLowerCase().includes(q))
  )

  const onDelete = async (o) => {
    if (!window.confirm(`¿Eliminar la orden ${o.code}? Se borrarán también sus evidencias. Irreversible.`)) return
    await wo.deleteOrder(o.id)
  }

  const STATUS_ES = { open: 'Abierta', in_progress: 'En ejecución', completed: 'Completada', cancelled: 'Cancelada' }
  const PRIORITY_ES = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' }
  const exportOrders = async () => {
    await exportToExcel('ordenes-mantenimiento', [
      {
        name: 'Órdenes',
        rows: visibleOrders.map((o) => ({
          Código: o.code,
          Título: o.title,
          Estado: STATUS_ES[o.status] ?? o.status,
          Prioridad: PRIORITY_ES[o.priority] ?? o.priority,
          Tipo: o.type ?? '',
          Planta: plantOf(o.plant_id)?.name ?? '',
          'Máquina/Ubicación': machineOf(o.machine_id)?.name ?? o.location_name ?? '',
          'Asignada a': nameOf(o.assigned_to) ?? '',
          'Creada por': nameOf(o.created_by) ?? '',
          Programada: o.scheduled_for ? o.scheduled_for.slice(0, 10) : '',
          Completada: o.completed_at ? o.completed_at.slice(0, 10) : '',
          'Parada (min)': o.downtime_minutes ?? '',
          'Costo (COP)': o.cost ?? '',
          Resolución: o.resolution ?? '',
          Evidencias: evidenceCount(o.id),
        })),
      },
    ], {
      title: 'Órdenes de mantenimiento',
      module: 'Mantenimiento',
    })
  }

  /**
   * Exporta el Plan de Gestión del Mantenimiento (MTO-PLA-001) con los
   * indicadores y resultados RECALCULADOS en vivo desde la base de datos —
   * a diferencia del documento oficial de la carpeta MANTENIMIENTO, que es
   * un corte fijo. Pensado para que los líderes lo saquen desde sus propias
   * herramientas cuando lo necesiten, sin depender de que alguien regenere
   * el archivo oficial.
   */
  const exportManagementPlan = async () => {
    setExportingPlan(true)
    try {
      const [checksRes, calibRes] = await Promise.all([
        supabase.from('machine_checks').select('condition').eq('org_id', orgId),
        supabase
          .from('machine_calibrations')
          .select('machine_id, scope, temp_delta_f, rh_delta_pct, calibrated_at')
          .eq('org_id', orgId)
          .order('calibrated_at', { ascending: false }),
      ])
      const machineName = {}
      for (const m of machines) machineName[m.id] = `${m.name}${m.code ? ` (${m.code})` : ''}`
      const { resultsRows, indicatorRows } = buildLiveResultsAndIndicators({
        checks: checksRes.data ?? [],
        orders: wo.orders,
        calibrations: calibRes.data ?? [],
        machineName,
      })
      const corte = new Date().toLocaleString('es-CO')
      await exportToExcel('plan-gestion-mantenimiento', [
        { name: 'Política', rows: [{ 'Política de mantenimiento': MAINTENANCE_POLICY }] },
        { name: 'Objetivos', rows: MAINTENANCE_OBJECTIVES },
        { name: 'Marco de referencia', rows: MAINTENANCE_FRAMEWORK },
        { name: 'Estrategia de mantenimiento', rows: MAINTENANCE_STRATEGY_TYPES },
        { name: 'Resultados reales', rows: resultsRows.length ? resultsRows : [{ Métrica: 'Sin datos aún', Valor: '—', Nota: '' }] },
        { name: 'Indicadores', rows: indicatorRows },
        { name: 'Riesgos', rows: MAINTENANCE_RISKS },
        { name: 'Revisión por la dirección', rows: MAINTENANCE_REVIEW_CYCLE },
        { name: 'Referencias documentales', rows: MAINTENANCE_DOC_MAP },
      ], {
        title: `Plan de Gestión del Mantenimiento — corte ${corte}`,
        module: 'Mantenimiento',
      })
    } finally {
      setExportingPlan(false)
    }
  }

  const CompleteForm = ({ order }) => {
    const [resolution, setResolution] = useState('')
    const [downtime, setDowntime] = useState('')
    const [cost, setCost] = useState('')
    const [busy, setBusy] = useState(false)
    return (
      <div className="inline-form compact">
        <label>
          Resolución / trabajo realizado
          <textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} autoFocus />
        </label>
        <div className="two-col">
          <label>
            Tiempo de parada (minutos) *
            <input
              type="number"
              min="0"
              required
              value={downtime}
              onChange={(e) => setDowntime(e.target.value)}
              placeholder="0 si el equipo no paró"
            />
          </label>
          <label>
            Costo (COP, opcional)
            <input type="number" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
          </label>
        </div>
        <p className="hint">
          * El tiempo de parada es obligatorio: de él salen la disponibilidad, el MTTR y el MTBF.
          Si el equipo no paró, registre 0.
        </p>
        <div className="actions row">
          <button
            className="primary small"
            disabled={busy || downtime === ''}
            onClick={async () => {
              setBusy(true)
              const res = await wo.completeOrder(order.id, { resolution, downtimeMinutes: downtime, cost })
              setBusy(false)
              if (!res?.error) setCompletingId(null)
            }}
          >
            {busy ? 'Cerrando…' : 'Cerrar orden'}
          </button>
          <button className="ghost" onClick={() => setCompletingId(null)} disabled={busy}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card wide">
      {report && (
        <PrintReport
          orders={report}
          orgName={orgName}
          myName={myName}
          machineOf={machineOf}
          plantOf={plantOf}
          nameOf={nameOf}
          evidenceCount={evidenceCount}
          onClose={() => setReport(null)}
        />
      )}

      <div className="card-head">
        <h2>{isAux ? 'Mis órdenes de trabajo' : 'Gestión de mantenimiento'}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isAux && visibleOrders.length > 0 && (
            <button className="chip ghost" onClick={exportOrders}>⬇ Exportar Excel</button>
          )}
          {canManage && (
            <button
              className="chip ghost"
              onClick={exportManagementPlan}
              disabled={exportingPlan}
              title="Exporta el Plan de Gestión del Mantenimiento (MTO-PLA-001) con indicadores y resultados recalculados en vivo"
            >
              {exportingPlan ? '⏳ Generando…' : '📋 Plan de Gestión del Mantenimiento'}
            </button>
          )}
          {counts.open + counts.in_progress > 0 && (
            <span className="pill status warn">{counts.open + counts.in_progress} activas</span>
          )}
        </div>
      </div>

      {isAux && (
        <p className="hint" style={{ marginTop: 4 }}>
          Aquí ves y ejecutas las órdenes que te asignan, y también las OT generales/incidencias sin asignar:
          tómalas con «Atender», adjunta evidencia y ciérralas.
        </p>
      )}

      <div className="kpi-grid" style={{ marginTop: 10 }}>
        <div className={`kpi-card${counts.open > 0 ? ' warn' : ''}`}>
          <span className="kpi-value">{counts.open}</span>
          <span className="kpi-label">Abiertas</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{counts.in_progress}</span>
          <span className="kpi-label">En ejecución</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{counts.completed}</span>
          <span className="kpi-label">Completadas</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{visibleOrders.filter((o) => o.priority === 'critical' && (o.status === 'open' || o.status === 'in_progress')).length}</span>
          <span className="kpi-label">Críticas activas</span>
        </div>
      </div>

      <div className="admin-section-head">
        <div className="plant-chips" style={{ margin: 0 }}>
          {FILTERS.map((f) => (
            <button key={f.value} className={filter === f.value ? 'chip active' : 'chip'} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
          {!isAux && (
            <button className={mineOnly ? 'chip active' : 'chip'} onClick={() => setMineOnly(!mineOnly)}>
              Mis actividades
            </button>
          )}
        </div>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button className="chip ghost" onClick={() => setReport(byStatus)} disabled={byStatus.length === 0} title="Genera un PDF con las actividades filtradas">
            📄 Informe PDF
          </button>
          {!isAux && !showForm && (
            <button className="chip ghost" onClick={() => setShowForm(true)}>
              + Nueva actividad
            </button>
          )}
        </span>
      </div>

      {showForm && (
        <NewOrderForm
          plants={plants}
          machines={machines}
          team={wo.team}
          catalog={catalog}
          myName={myName}
          onCreate={wo.createOrder}
          onCancel={() => setShowForm(false)}
        />
      )}
      {wo.error && <p className="msg error">{wo.error}</p>}
      {ev.error && <p className="msg error">{ev.error}</p>}

      {!wo.loading && byStatus.length > 0 && (
        <ListControls lc={lc} placeholder="Buscar por código, actividad, lugar, máquina o técnico…" />
      )}

      {wo.loading ? (
        <p className="hint">Cargando órdenes…</p>
      ) : lc.visible.length === 0 ? (
        <p className="hint">No hay actividades{lc.query ? ' que coincidan con la búsqueda' : ' con esos filtros'}.</p>
      ) : (
        <div className="admin-list">
          {lc.visible.map((o) => {
            const pr = priorityOf(o.priority)
            const st = statusOf(o.status)
            const machine = machineOf(o.machine_id)
            const plant = plantOf(o.plant_id)
            const mine = o.assigned_to === userId
            const canOperate = canManage || mine
            const nEv = evidenceCount(o.id)
            // En ejecución: el panel de evidencias queda abierto para quien la trabaja
            const executing = o.status === 'in_progress' && canOperate
            const showEvidence = executing || evidenceId === o.id
            const lugar =
              o.location_type === 'plant'
                ? `${plant?.name ?? 'Planta'}${machine ? ` · ${machine.name} (${machine.code})` : ' · Instalaciones'}`
                : `${locationLabel(o.location_type)}${o.location_name ? `: ${o.location_name}` : ''}`
            const isDone = o.status === 'completed' || o.status === 'cancelled'
            return (
              <div key={o.id} className={`admin-card wo-card pr-${o.priority}${isDone ? ' wo-done' : ' wo-pending'}`}>
                {/* Cabecera compacta: código, título y estado */}
                <div className="admin-row wo-head">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      <span className="machine-code">{o.code}</span> {o.title}
                      {o.source === 'incident' && (
                        <span className="pill status warn" style={{ marginLeft: 6 }}>
                          Incidencia
                        </span>
                      )}
                    </strong>
                  </div>
                  <span className={`pill status ${pr.cls}`}>{pr.label}</span>
                  <span className={`pill status ${st.cls}`}>{st.label}</span>
                </div>

                {/* Tipificación ordenada (mismo estilo visual que las atendidas) */}
                <div className={`wo-desc${isDone ? ' done' : ' meta'}`}>
                  <div className="wo-meta-grid">
                    <div className="wo-meta-item">
                      <span className="wo-meta-k">Tipo</span>
                      <span className="wo-meta-v">{typeLabel(o.type)}</span>
                    </div>
                    <div className="wo-meta-item">
                      <span className="wo-meta-k">Lugar</span>
                      <span className="wo-meta-v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{lugar}</span>
                        {o.machine_id && (
                          <button
                            type="button"
                            className="chip ghost small"
                            onClick={() => setDossierMachineId(o.machine_id)}
                            style={{ fontSize: 10, padding: '1px 6px', color: '#60a5fa', borderColor: '#3b82f6' }}
                            title="Ver ficha y trazabilidad SIG completa del activo"
                          >
                            📋 Expediente SIG
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="wo-meta-item">
                      <span className="wo-meta-k">Asignado</span>
                      <span className="wo-meta-v">
                        {o.assigned_to
                          ? `${nameOf(o.assigned_to) ?? '—'}${mine ? ' (tú)' : ''}`
                          : 'Sin asignar'}
                      </span>
                    </div>
                    {o.scheduled_for && (
                      <div className="wo-meta-item">
                        <span className="wo-meta-k">Programada</span>
                        <span className="wo-meta-v">{fmtDate(o.scheduled_for)}</span>
                      </div>
                    )}
                    {o.created_at && (
                      <div className="wo-meta-item">
                        <span className="wo-meta-k">Creada</span>
                        <span className="wo-meta-v">{fmtDate(o.created_at)}</span>
                      </div>
                    )}
                    {nEv > 0 && (
                      <div className="wo-meta-item">
                        <span className="wo-meta-k">Evidencias</span>
                        <span className="wo-meta-v">{nEv}</span>
                      </div>
                    )}
                  </div>
                  {o.description && (
                    <p className="wo-meta-desc">{o.description}</p>
                  )}
                  {o.status === 'completed' && (
                    <p className="wo-meta-resolution">
                      Resolución: {o.resolution || 'Sin notas de resolución.'}
                      {o.downtime_minutes != null ? ` · Parada: ${o.downtime_minutes} min` : ''}
                      {o.cost != null ? ` · Costo: ${fmtCost(o.cost)}` : ''}
                      {o.completed_at ? ` · ${fmtDate(o.completed_at)}` : ''}
                    </p>
                  )}
                </div>

                {/* Acciones en fila ordenada debajo de la tipificación */}
                {!isDone && (
                  <div className="wo-actions">
                    {!executing && (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => setEvidenceId(evidenceId === o.id ? null : o.id)}
                      >
                        {evidenceId === o.id ? '▾' : '▸'} Evidencias ({nEv})
                      </button>
                    )}
                    {canOperate && !isAux && (o.status === 'open' || o.status === 'in_progress') && (
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => setEditingId(editingId === o.id ? null : o.id)}
                      >
                        Editar
                      </button>
                    )}
                    {isAux && o.status === 'open' && !o.assigned_to && (
                      <button
                        type="button"
                        className="primary small"
                        onClick={() => wo.claimOrder(o.id)}
                      >
                        Atender
                      </button>
                    )}
                    {o.status === 'open' && canManage && (
                      <select
                        value={o.assigned_to ?? ''}
                        onChange={(e) =>
                          wo.updateOrder(o.id, { assigned_to: e.target.value || null })
                        }
                        title="Asignar técnico"
                        className="wo-assign"
                      >
                        <option value="">Asignar…</option>
                        {wo.team.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {o.status === 'open' && canOperate && (
                      <button
                        type="button"
                        className="primary small"
                        onClick={() => wo.startOrder(o.id)}
                      >
                        Iniciar
                      </button>
                    )}
                    {o.status === 'in_progress' && canOperate && completingId !== o.id && (
                      <button
                        type="button"
                        className="primary small"
                        onClick={() => setCompletingId(o.id)}
                      >
                        Completar
                      </button>
                    )}
                    {(o.status === 'open' || o.status === 'in_progress') && canManage && (
                      <button type="button" className="ghost small" onClick={() => wo.cancelOrder(o.id)}>
                        Cancelar
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className="ghost small danger" onClick={() => onDelete(o)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
                {isDone && (
                  <div className="wo-actions">
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => setEvidenceId(evidenceId === o.id ? null : o.id)}
                    >
                      {evidenceId === o.id ? '▾' : '▸'} Evidencias ({nEv})
                    </button>
                    {canDelete && (
                      <button type="button" className="ghost small danger" onClick={() => onDelete(o)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                )}

                {editingId === o.id && (
                  <EditOrderForm order={o} onSave={wo.updateOrder} onCancel={() => setEditingId(null)} />
                )}
                {showEvidence && (
                  <EvidencePanel
                    order={o}
                    ev={ev}
                    nameOf={nameOf}
                    canDeleteAll={canDelete}
                    userId={userId}
                    executing={executing}
                  />
                )}
                {completingId === o.id && o.status === 'in_progress' && (
                  <>
                    {nEv === 0 && (
                      <p className="msg error" style={{ margin: '0 14px' }}>
                        Esta actividad no tiene evidencias adjuntas. Se recomienda subir al menos
                        una foto antes de cerrarla.
                      </p>
                    )}
                    <CompleteForm order={o} />
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal / Overlay Expediente SIG de Máquina */}
      {dossierMachineId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 9990,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '24px 16px',
          }}
          onClick={() => setDossierMachineId(null)}
        >
          <div
            style={{
              maxWidth: 1100,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              borderRadius: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MachineDossier
              machineId={dossierMachineId}
              orgId={orgId}
              canManage={canManage}
              onClose={() => setDossierMachineId(null)}
              initialTab="fomat01"
            />
          </div>
        </div>
      )}
    </div>
  )
}
