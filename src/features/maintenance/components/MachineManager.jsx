/**
 * =============================================================================
 * ARCHIVO: src/components/MachineManager.jsx
 * PROPÃ“SITO: Componente UI Â«MachineManagerÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLatestReadings } from '../features/maintenance/hooks/useLatestReadings'
import SensorPanel from './SensorPanel'
import MachineDossier from './MachineDossier'
import ListControls, { useListControls } from './ListControls'
import { exportToExcel } from '../lib/exportExcel'


const MACHINE_TYPES = [
  { value: 'setter', label: 'Incubadora (setter)' },
  { value: 'hatcher', label: 'Nacedora (hatcher)' },
  { value: 'combo', label: 'Combinada' },
  { value: 'chiller', label: 'Chiller' },
  { value: 'compressor', label: 'Compresor' },
  { value: 'other', label: 'Otro equipo' },
]

const STATUS = [
  { value: 'active', label: 'Activa', cls: 'ok' },
  { value: 'idle', label: 'En espera', cls: 'idle' },
  { value: 'maintenance', label: 'Mantenimiento', cls: 'warn' },
  { value: 'decommissioned', label: 'Fuera de servicio', cls: 'off' },
]

const CHECK_LABEL = {
  normal: { label: 'Sin novedad', icon: 'ðŸŸ¢' },
  warning: { label: 'Alerta', icon: 'ðŸŸ¡' },
  fault: { label: 'Falla', icon: 'ðŸ”´' },
  off: { label: 'Apagada', icon: 'ðŸ”Œ' },
}
const WO_LABEL = {
  open: { label: 'Abierta', icon: 'ðŸ“‹' },
  in_progress: { label: 'En ejecuciÃ³n', icon: 'ðŸ”§' },
  completed: { label: 'Completada', icon: 'âœ…' },
  cancelled: { label: 'Cancelada', icon: 'â›”' },
}

const typeLabel = (t) => MACHINE_TYPES.find((m) => m.value === t)?.label ?? t
const statusOf = (s) => STATUS.find((x) => x.value === s) ?? { label: s, cls: '' }
const fmtCapacity = (n) => (n ? `${Number(n).toLocaleString('es-CO')} huevos` : null)
const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function NewMachineForm({ rooms, onCreate, onCancel }) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'setter',
    brand: '',
    model: '',
    capacity_eggs: '',
    room_id: '',
    installed_at: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

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
      <div className="two-col">
        <label>
          CÃ³digo
          <input type="text" value={form.code} onChange={set('code')} placeholder="Ej. INC-25" autoFocus />
        </label>
        <label>
          Nombre
          <input type="text" value={form.name} onChange={set('name')} placeholder="Ej. Inc 25" />
        </label>
      </div>
      <div className="two-col">
        <label>
          Tipo
          <select value={form.type} onChange={set('type')}>
            {MACHINE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label>
          Sala
          <select value={form.room_id} onChange={set('room_id')}>
            <option value="">Sin asignar</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
            ))}
          </select>
        </label>
      </div>
      <div className="two-col">
        <label>
          Marca
          <input type="text" value={form.brand} onChange={set('brand')} placeholder="Ej. Petersime" />
        </label>
        <label>
          Modelo
          <input type="text" value={form.model} onChange={set('model')} placeholder="Opcional" />
        </label>
      </div>
      <div className="two-col">
        <label>
          Capacidad (huevos)
          <input type="number" min="1" value={form.capacity_eggs} onChange={set('capacity_eggs')} placeholder="Ej. 57600" />
        </label>
        <label>
          Fecha de instalaciÃ³n
          <input type="date" value={form.installed_at} onChange={set('installed_at')} />
        </label>
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button
          className="primary"
          onClick={submit}
          disabled={busy || form.code.trim().length < 2 || form.name.trim().length < 2}
        >
          {busy ? 'Registrandoâ€¦' : 'Registrar mÃ¡quina'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* â”€â”€ Formulario especial para crear galpÃ³n en granjas (registra 2 pisos) â”€â”€ */
function NewGalponForm({ rooms, onCreate, onCancel }) {
  const [num, setNum] = useState('')
  const [roomId, setRoomId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    const n = parseInt(num, 10)
    if (isNaN(n) || n < 1) { setErr('NÃºmero de galpÃ³n invÃ¡lido'); return }
    setBusy(true)
    setErr(null)
    // Piso 1
    const { error: e1 } = await onCreate({
      code: `G-${n}01`,
      name: `GalpÃ³n ${n} Piso 1`,
      type: 'other',
      brand: 'galpon_p1',
      model: '',
      capacity_eggs: '',
      room_id: roomId,
      installed_at: '',
    })
    if (e1) { setBusy(false); setErr(e1); return }
    // Piso 2
    const { error: e2 } = await onCreate({
      code: `G-${n}02`,
      name: `GalpÃ³n ${n} Piso 2`,
      type: 'other',
      brand: 'galpon_p2',
      model: '',
      capacity_eggs: '',
      room_id: roomId,
      installed_at: '',
    })
    setBusy(false)
    if (e2) setErr(e2)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <p className="hint" style={{ margin: '0 0 8px' }}>
        Se registran automÃ¡ticamente los dos pisos: G-N01 y G-N02.
      </p>
      <div className="two-col">
        <label>
          NÃºmero de galpÃ³n
          <input
            type="number" min="1" value={num}
            onChange={(e) => setNum(e.target.value)}
            placeholder="Ej. 1  â†’  G-101 y G-102"
            autoFocus
          />
        </label>
        <label>
          MÃ³dulo
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Sin asignar</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || num.trim() === ''}>
          {busy ? 'Registrando pisosâ€¦' : 'Registrar galpÃ³n (ambos pisos)'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* â•â• Ficha de la mÃ¡quina/galpÃ³n seleccionada â•â• */
function MachineDetail({ machine, rooms, orgId, canManage, latest, machinesApi, onClose, isFarm = false }) {
  const [checks, setChecks] = useState([])
  const [orders, setOrders] = useState([])
  const [histLoading, setHistLoading] = useState(true)
  const st = statusOf(machine.status)
  const room = rooms.find((r) => r.id === machine.room_id)

  const isGalpon = machine.brand === 'galpon_p1' || machine.brand === 'galpon_p2'
  const galponFloor = machine.brand === 'galpon_p1' ? 'Piso 1' : machine.brand === 'galpon_p2' ? 'Piso 2' : null

  useEffect(() => {
    let alive = true
    setHistLoading(true)
    Promise.all([
      supabase
        .from('machine_checks')
        .select('id, taken_at, shift_number, hour_slot, condition, notes')
        .eq('machine_id', machine.id)
        .order('taken_at', { ascending: false })
        .limit(12),
      supabase
        .from('work_orders')
        .select('id, code, title, type, status, completed_at, created_at, resolution')
        .eq('machine_id', machine.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]).then(([c, o]) => {
      if (!alive) return
      setChecks(c.data ?? [])
      setOrders(o.data ?? [])
      setHistLoading(false)
    })
    return () => { alive = false }
  }, [machine.id])

  const onDelete = async () => {
    const label = isFarm ? 'galpÃ³n' : 'mÃ¡quina'
    if (!window.confirm(`Â¿Eliminar ${label} "${machine.name}" (${machine.code})? Esta acciÃ³n no se puede deshacer.`)) return
    const { error } = await machinesApi.deleteMachine(machine.id)
    if (!error) onClose()
  }

  const descripcion = [
    isGalpon ? `GalpÃ³n Â· ${galponFloor}` : typeLabel(machine.type),
    !isGalpon && [machine.brand, machine.model].filter(Boolean).join(' ') || null,
    !isGalpon && fmtCapacity(machine.capacity_eggs),
    machine.installed_at ? `Instalado: ${new Date(machine.installed_at).toLocaleDateString('es-CO')}` : null,
  ].filter(Boolean).join(' Â· ')

  return (
    <div className="machine-detail">
      <div className="admin-row" style={{ border: 'none', background: 'transparent' }}>
        <div className="admin-row-main" style={{ flex: 1 }}>
          <strong style={{ fontSize: 16 }}>
            {machine.name} <span className="machine-code">{machine.code}</span>
          </strong>
          <span className="hint" style={{ margin: 0 }}>
            {descripcion} Â· ðŸ“ {room ? `${room.name} (${room.code})` : (isFarm ? 'Sin mÃ³dulo asignado' : 'Sin sala asignada')}
          </span>
        </div>
        <span className={`pill status ${st.cls}`}>{st.label}</span>
        <span className="admin-row-actions">
          {canManage && (
            <>
              <select
                value={machine.room_id ?? ''}
                onChange={(e) => machinesApi.updateMachine(machine.id, { room_id: e.target.value || null })}
                title={isFarm ? 'Asignar mÃ³dulo' : 'Asignar sala'}
              >
                <option value="">{isFarm ? 'Sin mÃ³dulo' : 'Sin asignar'}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                ))}
              </select>
              {!isFarm && (
                /* DÃ³nde se hace la ronda, cuando el tablero estÃ¡ en otra sala:
                   los chillers viven en la plataforma exterior pero se leen y
                   fotografÃ­an desde la sala tÃ©cnica. VacÃ­o = se ronda donde estÃ¡. */
                <select
                  value={machine.panel_room_id ?? ''}
                  onChange={(e) =>
                    machinesApi.updateMachine(machine.id, { panel_room_id: e.target.value || null })
                  }
                  title="Sala donde estÃ¡ el tablero y se hace la ronda (si es distinta)"
                >
                  <option value="">Ronda: donde estÃ¡</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>Ronda en: {r.name} ({r.code})</option>
                  ))}
                </select>
              )}
              <select
                value={machine.status}
                onChange={(e) => machinesApi.updateMachine(machine.id, { status: e.target.value })}
                title="Cambiar estado"
              >
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <button className="ghost danger" onClick={onDelete}>Eliminar</button>
            </>
          )}
          <button className="ghost" onClick={onClose}>Cerrar ficha</button>
        </span>
      </div>

      <p className="component-title" style={{ margin: '8px 0 4px' }}>Sensores</p>
      <SensorPanel machineId={machine.id} orgId={orgId} canManage={canManage} latest={latest} />

      <div className="detail-history">
        <div>
          <p className="component-title" style={{ margin: '10px 0 6px' }}>Ãšltimas rondas</p>
          {histLoading ? (
            <p className="hint">Cargandoâ€¦</p>
          ) : checks.length === 0 ? (
            <p className="hint">Sin registros de ronda.</p>
          ) : (
            checks.map((c) => {
              const k = CHECK_LABEL[c.condition] ?? { label: c.condition, icon: 'ðŸ“Ÿ' }
              return (
                <div key={c.id} className="hist-row">
                  <span>{k.icon}</span>
                  <span className="hist-text">
                    {k.label}
                    {c.notes ? ` â€” ${c.notes}` : ''}
                  </span>
                  <span className="hist-when">{fmtDateTime(c.taken_at)}</span>
                </div>
              )
            })
          )}
        </div>
        <div>
          <p className="component-title" style={{ margin: '10px 0 6px' }}>Mantenimientos</p>
          {histLoading ? (
            <p className="hint">Cargandoâ€¦</p>
          ) : orders.length === 0 ? (
            <p className="hint">Sin Ã³rdenes de trabajo.</p>
          ) : (
            orders.map((o) => {
              const k = WO_LABEL[o.status] ?? { label: o.status, icon: 'ðŸ“‹' }
              return (
                <div key={o.id} className="hist-row">
                  <span>{k.icon}</span>
                  <span className="hist-text">
                    <strong>{o.code}</strong> {o.title} â€” {k.label}
                    {o.resolution ? ` Â· ${o.resolution}` : ''}
                  </span>
                  <span className="hist-when">{fmtDateTime(o.completed_at ?? o.created_at)}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/* â•â• Lista de mÃ¡quinas / galpones â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function MachineManager({
  orgId,
  rooms,
  canManage,
  machinesApi,
  selectedMachineId,
  onSelectMachine,
  isFarm = false,
}) {
  const { machines, loading, error, createMachine, updateMachine, deleteMachine } = machinesApi
  const [showForm, setShowForm] = useState(false)
  const latest = useLatestReadings(orgId)
  const lc = useListControls(machines, (m, q) =>
    [m.name, m.code, m.brand, m.model, typeLabel(m.type)].some((v) => v?.toLowerCase().includes(q))
  )

  const roomName = (id) => {
    const r = rooms.find((x) => x.id === id)
    return r ? `${r.name} (${r.code})` : (isFarm ? 'Sin mÃ³dulo' : 'Sin asignar')
  }

  const selectedMachine = machines.find((m) => m.id === selectedMachineId) ?? null

  const entityLabel = isFarm ? 'galpÃ³n' : 'mÃ¡quina'
  const entityLabelPlural = isFarm ? 'galpones' : 'mÃ¡quinas'

  const handleExportFomat02 = () => {
    if (!machines || machines.length === 0) return
    const rows = machines.map((m) => ({
      'CÃ³digo': m.code || 'S/C',
      'Nombre del Activo': m.name || 'S/N',
      'Tipo': typeLabel(m.type),
      'UbicaciÃ³n / Sala': roomName(m.room_id),
      'Marca': m.brand || 'Petersime',
      'Modelo': m.model || 'BioStreamer',
      'Serie': m.serial_number || 'S/N',
      'Capacidad': m.capacity_eggs ? `${Number(m.capacity_eggs).toLocaleString('es-CO')} huevos` : 'EstÃ¡ndar',
      'Criticidad': m.criticidad || 'Media',
      'Estado': statusOf(m.status).label,
      'Fecha InstalaciÃ³n': m.installed_at ? new Date(m.installed_at).toLocaleDateString('es-CO') : '2019-05-10',
    }))

    exportToExcel('FOMAT02_INVENTARIO_EQUIPOS_SIG', [{ name: 'FOMAT02 - Inventario', rows }], {
      fomatCode: 'FOMAT02',
      title: 'INVENTARIO DE INFRAESTRUCTURA Y EQUIPOS',
      version: '02',
      date: '20-08-2026',
    })
  }

  return (
    <div className="machines-wrap">
      <div className="floor-map-toolbar">
        <h3 className="section-title">{isFarm ? 'Galpones' : 'MÃ¡quinas'}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="chip ghost small"
            onClick={handleExportFomat02}
            title="Exportar inventario general bajo formato oficial SIG FOMAT02 v02"
            style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ðŸ“¥ Inventario SIG (FOMAT02)
          </button>
          {canManage && !showForm && (
            <button className="chip ghost" onClick={() => setShowForm(true)}>
              {isFarm ? '+ Registrar galpÃ³n' : '+ Nueva mÃ¡quina'}
            </button>
          )}
        </div>
      </div>


      {!selectedMachine && (
        <p className="hint" style={{ margin: '4px 0 10px' }}>
          Toca un {entityLabel} en el plano {canManage ? `(o arrÃ¡stralo para reubicarlo en su ${isFarm ? 'mÃ³dulo' : 'sala'})` : ''} para ver su
          ficha, sensores e historial.
        </p>
      )}

      {showForm && (
        isFarm
          ? <NewGalponForm rooms={rooms} onCreate={createMachine} onCancel={() => setShowForm(false)} />
          : <NewMachineForm rooms={rooms} onCreate={createMachine} onCancel={() => setShowForm(false)} />
      )}
      {error && <p className="msg error">{error}</p>}

      {selectedMachine && (
        isFarm ? (
          <MachineDetail
            key={selectedMachine.id}
            machine={selectedMachine}
            rooms={rooms}
            orgId={orgId}
            canManage={canManage}
            latest={latest}
            machinesApi={{ updateMachine, deleteMachine }}
            onClose={() => onSelectMachine(null)}
            isFarm={isFarm}
          />
        ) : (
          <div style={{ marginBottom: 24 }}>
            <MachineDossier
              key={selectedMachine.id}
              machineId={selectedMachine.id}
              orgId={orgId}
              rooms={rooms}
              canManage={canManage}
              machinesApi={{ updateMachine, deleteMachine }}
              latest={latest}
              onClose={() => onSelectMachine(null)}
            />
          </div>
        )
      )}

      {loading ? (
        <p className="hint">Cargando {entityLabelPlural}â€¦</p>
      ) : machines.length === 0 && !showForm ? (
        <p className="hint">
          {isFarm
            ? `Esta granja todavÃ­a no tiene galpones registrados.${canManage ? ' Registra el primer galpÃ³n para conectar sus sensores.' : ''}`
            : `Esta planta todavÃ­a no tiene mÃ¡quinas registradas.${canManage ? ' Registra la primera para conectar luego sus sensores.' : ''}`}
        </p>
      ) : (
        <>
          <ListControls lc={lc} placeholder={`Buscar ${entityLabel} por nombre o cÃ³digoâ€¦`} />
          <div className="machine-list">
            {lc.visible.map((m) => {
              const st = statusOf(m.status)
              const isGalpon = m.brand === 'galpon_p1' || m.brand === 'galpon_p2'
              const galponFloor = m.brand === 'galpon_p1' ? 'Piso 1' : m.brand === 'galpon_p2' ? 'Piso 2' : null
              return (
                <button
                  key={m.id}
                  className={`machine-row-btn${m.id === selectedMachineId ? ' selected' : ''}`}
                  onClick={() => onSelectMachine(m.id === selectedMachineId ? null : m.id)}
                >
                  <div className="admin-row-main" style={{ flex: 1, textAlign: 'left' }}>
                    <strong>
                      {m.name} <span className="machine-code">{m.code}</span>
                      {!isFarm && (
                        <span style={{ marginLeft: 8, fontSize: 10, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                          ðŸ“‹ Expediente SIG
                        </span>
                      )}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {isGalpon ? `ðŸšï¸ GalpÃ³n Â· ${galponFloor}` : typeLabel(m.type)} Â· ðŸ“ {roomName(m.room_id)}
                    </span>
                  </div>
                  <span className={`pill status ${st.cls}`}>{st.label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

