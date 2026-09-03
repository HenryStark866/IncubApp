/**
 * =============================================================================
 * ARCHIVO: src/components/ColdStorageLoadPanel.jsx
 * PROPÓSITO: Componente UI «ColdStorageLoadPanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEggReports } from '../hooks/useEggReports'
import { useBatches } from '../hooks/useBatches'
import { useLoads } from '../hooks/useLoads'
import LoadClassificationWorkspace from './LoadClassificationWorkspace'

/**
 * Cargue: clasificación por cintas + mapa Petersime + aprobación/orden,
 * y cuarto frío / setter_loads (ciclo de incubación).
 */

const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''
const fmtDT = (v) => (v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

/* ── Hitos de ciclo ─────────────────────────────────────────────────────────── */

// Devuelve la edad del ciclo como { hours, label } a partir de cycle_start_at
function cycleAge(cycleStartAt) {
  if (!cycleStartAt) return null
  const diffMs = Date.now() - new Date(cycleStartAt).getTime()
  if (diffMs < 0) return null // inicio en el futuro
  const hours = diffMs / 3_600_000
  const d = Math.floor(hours / 24)
  const h = Math.floor(hours % 24)
  return { hours, label: `${d}d ${h}h` }
}

// Devuelve un badge { text, cls } según la edad del ciclo
// - 'calibracion': 36 h – 60 h
// - 'transferencia': ≥ 18 d (= 432 h)
function milestoneBadge(ageHours) {
  if (ageHours == null) return null
  if (ageHours >= 432) return { text: '✅ Listo para transferencia', cls: 'pill status ok' }
  if (ageHours >= 36 && ageHours < 60) return { text: '⚠️ Calibración obligatoria', cls: 'pill status warn' }
  return null
}


/* ══ Formulario de cargue ════════════════════════════════════ */
function LoadForm({ coldStorage, plants, machines, onCreate, onCancel }) {
  const [batchId, setBatchId] = useState(coldStorage[0]?.batchId ?? '')
  const [plantId, setPlantId] = useState(plants[0]?.id ?? '')
  const [machineId, setMachineId] = useState('')
  const [loadedAt, setLoadedAt] = useState('')
  // Pre-incubación: horas que el huevo estuvo en la incubadora antes de encender el ciclo
  const [preIncubHours, setPreIncubHours] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const plantMachines = machines.filter(
    (m) => m.plant_id === plantId && (m.type === 'setter' || m.type === 'combo') && m.status !== 'decommissioned'
  )
  const entry = coldStorage.find((c) => c.batchId === batchId)

  // cycle_start_at = loaded_at + pre-incubación (horas)
  // Si no se indica loaded_at, se calcula a partir de ahora
  const computedCycleStart = useMemo(() => {
    const base = loadedAt ? new Date(loadedAt) : new Date()
    const h = parseFloat(preIncubHours) || 0
    if (h < 0) return null
    const d = new Date(base.getTime() + h * 3_600_000)
    return d.toISOString()
  }, [loadedAt, preIncubHours])

  const submit = async () => {
    if (!entry) return
    setBusy(true)
    setErr(null)
    const { error } = await onCreate({
      plantId,
      machineId,
      batchId,
      lote: entry.code,
      loadedAt: loadedAt || null,
      cycleStartAt: computedCycleStart,
    })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  const preH = parseFloat(preIncubHours) || 0
  const cyclePreview = computedCycleStart ? fmtDT(computedCycleStart) : '—'

  return (
    <div className="inline-form">
      <div className="two-col">
        <label>
          Lote (cuarto frío)
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {coldStorage.length === 0 && <option value="">— Sin huevo en cuarto frío —</option>}
            {coldStorage.map((c) => (
              <option key={c.batchId} value={c.batchId}>{c.code} · {num(c.inc)} incubables</option>
            ))}
          </select>
        </label>
        <label>
          Planta de incubación
          <select value={plantId} onChange={(e) => { setPlantId(e.target.value); setMachineId('') }}>
            {plants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </label>
      </div>
      <label>
        Incubadora
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
          <option value="">— Selecciona la incubadora —</option>
          {plantMachines.map((m) => (<option key={m.id} value={m.id}>{m.name} ({m.code})</option>))}
        </select>
      </label>
      <div className="two-col">
        <label>
          Hora de cargue <span className="hint" style={{ margin: 0 }}>(opcional, por defecto ahora)</span>
          <input type="datetime-local" value={loadedAt} onChange={(e) => setLoadedAt(e.target.value)} />
        </label>
        <label>
          Pre-incubación (horas)
          <input
            type="number" min="0" max="72" step="0.5"
            value={preIncubHours}
            onChange={(e) => setPreIncubHours(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>
      {preH > 0 && (
        <p className="hint" style={{ margin: '4px 0 8px', color: 'var(--accent)' }}>
          ℹ️ Inicio de ciclo calculado: <strong>{cyclePreview}</strong>
          &nbsp;({preH}h antes del cargue)
        </p>
      )}
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !batchId || !machineId}>
          {busy ? 'Creando…' : 'Crear cargue'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* ══ Panel principal ═════════════════════════════════════════ */
export default function ColdStorageLoadPanel({ orgId, userId, role, coordinatorName }) {
  // Cargues: también los registran operarios y auxiliares de turno (mismo
  // catálogo que private.is_org_operator en la BD).
  const canLoad = [
    'owner',
    'admin',
    'coordinator',
    'supervisor',
    'operator',
    'auxiliary',
    'auxiliary_production',
    'reception_operator',
  ].includes(role)
  const er = useEggReports(orgId, userId)
  const bt = useBatches(orgId, userId)
  const ld = useLoads(orgId, userId)

  const [plants, setPlants] = useState([])
  const [machines, setMachines] = useState([])
  const [people, setPeople] = useState({})
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('created_at'),
      supabase.from('machines').select('id, plant_id, name, code, type, status'),
      supabase.from('organization_members').select('user_id, profiles ( full_name, email )').eq('org_id', orgId),
    ]).then(([p, m, t]) => {
      setPlants(p.data ?? [])
      setMachines(m.data ?? [])
      const map = {}
      for (const row of t.data ?? []) map[row.user_id] = row.profiles?.full_name || row.profiles?.email || '—'
      setPeople(map)
    })
  }, [orgId])

  // Plantas de incubación (no granjas): las granjas usan prefijo G-
  const incubationPlants = plants.filter((p) => !(p.code?.startsWith('G') || p.name?.startsWith('G-')))
  const batchOf = (id) => bt.batches.find((b) => b.id === id)
  const machineName = (id) => {
    const m = machines.find((x) => x.id === id)
    return m ? `${m.name} (${m.code})` : '—'
  }
  const nameOf = (id) => (id ? people[id] ?? '—' : '—')

  const incTotal = (counts) => {
    let inc = 0
    for (const cat of er.categories) if (cat.kind === 'incubable') inc += Number(counts?.[cat.code] || 0)
    return inc
  }

  // Cuarto frío: huevo incubable certificado (received), agrupado por lote
  const coldStorage = useMemo(() => {
    const byBatch = new Map()
    for (const r of er.reports) {
      if (r.status !== 'received') continue
      const inc = incTotal(r.received_counts ?? r.counts)
      const cur = byBatch.get(r.batch_id) ?? { batchId: r.batch_id, inc: 0, reports: 0 }
      cur.inc += inc
      cur.reports += 1
      byBatch.set(r.batch_id, cur)
    }
    return [...byBatch.values()]
      .map((c) => ({ ...c, code: batchOf(c.batchId)?.code ?? 'Lote' }))
      .filter((c) => c.inc > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [er.reports, er.categories, bt.batches])

  const loadsFor = (batchId) => ld.loads.filter((l) => l.batch_id === batchId)
  const totalInc = coldStorage.reduce((s, c) => s + c.inc, 0)

  return (
    <>
    <LoadClassificationWorkspace
      orgId={orgId}
      userId={userId}
      role={role}
      coordinatorName={coordinatorName}
    />

    <div className="card wide" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div>
          <h2>Cuarto frío y registro de incubación</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola{firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} · cargues en máquina y ciclo de incubación
          </span>
        </div>
        <span className="pill live"><span className="dot" /> En vivo</span>
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{coldStorage.length}</span>
          <span className="kpi-label">Lotes en cuarto frío</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{num(totalInc)}</span>
          <span className="kpi-label">Huevo incubable disponible</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{ld.loads.length}</span>
          <span className="kpi-label">Cargues registrados</span>
        </div>
      </div>

      <div className="admin-section-head">
        <span className="component-title" style={{ margin: 0 }}>Cuarto frío (huevo incubable certificado)</span>
        {canLoad && !showForm && (
          <button className="chip ghost" onClick={() => setShowForm(true)} disabled={coldStorage.length === 0}>
            + Crear cargue
          </button>
        )}
      </div>

      {showForm && (
        <LoadForm
          coldStorage={coldStorage}
          plants={incubationPlants}
          machines={machines}
          onCreate={ld.createPlannedLoad}
          onCancel={() => setShowForm(false)}
        />
      )}
      {ld.error && <p className="msg error">{ld.error}</p>}

      {coldStorage.length === 0 ? (
        <p className="hint">No hay huevo certificado en el cuarto frío todavía. Llega cuando recepción certifica los envíos.</p>
      ) : (
        <div className="admin-list">
          {coldStorage.map((c) => {
            const loads = loadsFor(c.batchId)
            return (
              <div key={c.batchId} className="admin-row compact" style={{ margin: 0 }}>
                <span>❄️</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{c.code}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {num(c.inc)} huevos incubables · {c.reports} reporte{c.reports === 1 ? '' : 's'} recibido{c.reports === 1 ? '' : 's'}
                    {loads.length > 0 ? ` · ${loads.length} cargue${loads.length === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
                <span className="pill status ok">{num(c.inc)}</span>
              </div>
            )
          })}
        </div>
      )}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Cargues recientes</h3>
      {ld.loads.length === 0 ? (
        <p className="hint">Sin cargues registrados.</p>
      ) : (
        <div className="admin-list">
        {ld.loads.slice(0, 20).map((l) => {
            const age   = cycleAge(l.cycle_start_at)
            const badge = age ? milestoneBadge(age.hours) : null
            return (
              <div key={l.id} className="admin-row compact" style={{ margin: 0 }}>
                <span>🥚</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{l.lote} · {machineName(l.machine_id)}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    Cargue {fmtDT(l.loaded_at)}
                    {l.cycle_start_at ? ` · Inicio incubación ${fmtDT(l.cycle_start_at)}` : ''}
                    {age ? ` · Edad: ${age.label}` : ''}
                    {l.created_by ? ` · ${nameOf(l.created_by)}` : ''}
                  </span>
                </div>
                {badge && <span className={badge.cls}>{badge.text}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
    </>
  )
}
