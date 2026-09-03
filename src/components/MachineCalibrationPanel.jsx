/**
 * Calibrar máquina: sensores temperatura (°F) y humedad (%).
 * El usuario elige calibrar uno, el otro o ambos (el calibrador no siempre
 * da punto al mismo tiempo). Historial con evidencias para el responsable.
 * Coordinador: sincroniza estado operativo de máquinas desde datos reales.
 *
 * Henry Stark Desarrollador · CDH Maker
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMachineCalibration } from '../hooks/useMachineCalibration'
import { useMachineStateSync } from '../hooks/useMachineStateSync'
import {
  CALIB_REASON_LABEL,
  CALIB_SCOPE,
  CALIB_SCOPE_LABEL,
  canPerformCalibration,
  formatCalibReadings,
  parseCalibReason,
} from '../lib/machineCalibration'
import { PHASE_LABEL } from '../lib/machineOpsState'
import { compressImage } from '../lib/image'
import { ROLE_LABEL } from '../lib/roles'

const MACHINE_TYPE_LABEL = {
  setter: 'Incubadora',
  hatcher: 'Nacedora',
  combo: 'Combinada',
  chiller: 'Chiller',
  compressor: 'Compresor',
  other: 'Otro',
}

function PhotoCapture({ label, file, onFile, hint }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onChange = async (e) => {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      onFile(null)
      return
    }
    setBusy(true)
    try {
      const compressed = await compressImage(f, 1280, 0.7)
      onFile(compressed && compressed.size > 0 ? compressed : f)
    } catch {
      onFile(f)
    }
    setBusy(false)
  }

  return (
    <div className="photo-field" style={{ marginBottom: 10 }}>
      <span className="hint" style={{ margin: 0, display: 'block' }}>
        {label}
        {hint ? ` · ${hint}` : ''}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onChange}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <button
          type="button"
          className={file ? 'chip' : 'primary'}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Procesando…' : file ? '📷 Cambiar foto' : '📷 Tomar foto'}
        </button>
        {file && (
          <button type="button" className="ghost" onClick={() => onFile(null)}>
            Quitar
          </button>
        )}
      </div>
      {preview && (
        <img
          src={preview}
          alt={label}
          style={{ display: 'block', maxWidth: 220, borderRadius: 8, marginTop: 8 }}
        />
      )}
    </div>
  )
}

function EvidenceThumbs({ paths, getUrl }) {
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let alive = true
    ;(async () => {
      const next = {}
      for (const p of paths || []) {
        if (!p) continue
        next[p] = await getUrl(p)
      }
      if (alive) setUrls(next)
    })()
    return () => {
      alive = false
    }
  }, [paths, getUrl])

  if (!paths?.length) return <span className="hint">Sin fotos</span>
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
      {paths.filter(Boolean).map((p) =>
        urls[p] ? (
          <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
            <img
              src={urls[p]}
              alt="Evidencia"
              style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }}
            />
          </a>
        ) : (
          <div
            key={p}
            style={{
              width: 72,
              height: 72,
              borderRadius: 8,
              background: 'var(--bg-0)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            📷
          </div>
        )
      )}
    </div>
  )
}

function CoordStateTab({ sync, machines }) {
  useEffect(() => {
    sync.loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    setBusy(true)
    setMsg(null)
    const res = await sync.applySelected()
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({
        kind: 'ok',
        text: `Estado actualizado: ${res.opsOk}/${res.total} máquinas · cargues con ciclo corregidos: ${res.loadsFixed}${
          res.errors?.length ? ` · avisos: ${res.errors.length}` : ''
        }`,
      })
      sync.loadPreview()
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint">
        Calcula el estado real de cada máquina a partir de los datos ya registrados (cargues,
        transferencias y nacimientos), desde la fecha más antigua, y lo escribe en la base de datos.
        Luego puede revisar y corregir fila a fila.
      </p>
      <div className="actions row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="chip" onClick={() => sync.loadPreview()} disabled={sync.loading}>
          {sync.loading ? 'Calculando…' : '↻ Recalcular vista previa'}
        </button>
        <button
          type="button"
          className="primary"
          style={{ width: 'auto', marginTop: 0 }}
          onClick={apply}
          disabled={busy || sync.applying || !sync.preview.some((r) => r.selected)}
        >
          {busy || sync.applying ? 'Aplicando…' : '✓ Cargar estado real a la BD'}
        </button>
        <button
          type="button"
          className="ghost"
          style={{ width: 'auto', marginTop: 0 }}
          onClick={() => sync.setPreview((p) => p.map((r) => ({ ...r, selected: true })))}
        >
          Seleccionar todas
        </button>
        <button
          type="button"
          className="ghost"
          style={{ width: 'auto', marginTop: 0 }}
          onClick={() => sync.setPreview((p) => p.map((r) => ({ ...r, selected: false })))}
        >
          Ninguna
        </button>
      </div>
      {sync.error && <p className="msg error">{sync.error}</p>}
      {msg && <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`}>{msg.text}</p>}
      {sync.lastResult?.errors?.length > 0 && (
        <p className="hint" style={{ color: 'var(--danger)' }}>
          {sync.lastResult.errors.join(' · ')}
        </p>
      )}

      <div className="admin-list">
        {sync.loading && <p className="hint">Calculando estados…</p>}
        {!sync.loading && sync.preview.length === 0 && (
          <p className="hint">No hay máquinas o faltan datos de planta.</p>
        )}
        {sync.preview.map((r) => (
          <div key={r.machine_id} className="admin-card">
            <div className="admin-row" style={{ alignItems: 'flex-start' }}>
              <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!r.selected}
                  onChange={(e) => sync.setRowSelected(r.machine_id, e.target.checked)}
                />
              </label>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>
                  {r.machine_code} · {r.machine_name}
                </strong>
                <span className="hint" style={{ margin: 0 }}>
                  {MACHINE_TYPE_LABEL[r.machine_type] || r.machine_type} · {r.plant_name}
                  {r.lote ? ` · Lote ${r.lote}` : ''}
                  {r.age_label && r.age_label !== '—' ? ` · Edad ${r.age_label}` : ''}
                </span>
                {r.notes && (
                  <span className="hint" style={{ margin: 0 }}>
                    {r.notes}
                  </span>
                )}
                {r.timeline?.length > 0 && (
                  <span className="hint" style={{ margin: 0 }}>
                    Timeline:{' '}
                    {r.timeline
                      .map(
                        (t) =>
                          `${t.label} (${t.at ? new Date(t.at).toLocaleDateString('es-CO') : '—'})`
                      )
                      .join(' → ')}
                  </span>
                )}
              </div>
              <span
                className={`pill status ${
                  r.phase === 'calib_window' || r.calib_due
                    ? 'warn'
                    : r.phase === 'idle' || r.phase === 'completed'
                      ? 'idle'
                      : 'ok'
                }`}
              >
                {r.phase_label || PHASE_LABEL[r.phase] || r.phase}
              </span>
            </div>
            <div className="two-col" style={{ marginTop: 8 }}>
              <label style={{ marginBottom: 0 }}>
                Fase (editable)
                <select
                  value={r.phase}
                  onChange={(e) =>
                    sync.patchPreviewRow(r.machine_id, {
                      phase: e.target.value,
                      machine_status:
                        e.target.value === 'idle' || e.target.value === 'completed'
                          ? 'idle'
                          : 'active',
                    })
                  }
                >
                  {Object.entries(PHASE_LABEL).map(([k, lab]) => (
                    <option key={k} value={k}>
                      {lab}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ marginBottom: 0 }}>
                Lote
                <input
                  type="text"
                  value={r.lote || ''}
                  onChange={(e) => sync.patchPreviewRow(r.machine_id, { lote: e.target.value })}
                  placeholder="Lote en máquina"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      {!machines?.length && null}
    </div>
  )
}

export default function MachineCalibrationPanel({ orgId, userId, role }) {
  const api = useMachineCalibration(orgId, userId, { role })
  const sync = useMachineStateSync(orgId, userId, { role })
  const canDo = canPerformCalibration(role)
  const [tab, setTab] = useState(api.canManage ? 'pendientes' : 'pendientes')
  const [machineId, setMachineId] = useState('')
  const [scope, setScope] = useState(CALIB_SCOPE.both)
  const [tempMachineF, setTempMachineF] = useState('')
  const [tempCalibratorF, setTempCalibratorF] = useState('')
  const [rhMachinePct, setRhMachinePct] = useState('')
  const [rhCalibratorPct, setRhCalibratorPct] = useState('')
  const [calibratorFile, setCalibratorFile] = useState(null)
  const [screenFile, setScreenFile] = useState(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!orgId || !userId) return
    const scan = () => {
      api.ensureIncWindowOrders()
      api.ensurePreTransferOrders()
    }
    scan()
    const t = setInterval(scan, 5 * 60 * 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId, api.machines.length])

  const activeMachines = useMemo(
    () =>
      (api.machines || []).filter(
        (m) =>
          m.status !== 'decommissioned' &&
          ['setter', 'hatcher', 'combo'].includes(m.type)
      ),
    [api.machines]
  )

  const plantName = (id) => api.plants.find((p) => p.id === id)?.name || '—'
  const machineOf = (id) => api.machines.find((m) => m.id === id)

  const needTemp = scope === CALIB_SCOPE.temperature || scope === CALIB_SCOPE.both
  const needRh = scope === CALIB_SCOPE.humidity || scope === CALIB_SCOPE.both

  const startFromOrder = (order) => {
    setMachineId(order.machine_id || '')
    setTab('ejecutar')
    setMsg(null)
  }

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const res = await api.submitCalibration({
      machineId,
      scope,
      tempMachineF,
      tempCalibratorF,
      rhMachinePct,
      rhCalibratorPct,
      calibratorFile,
      screenFile,
      notes,
    })
    setBusy(false)
    if (res.error) {
      setMsg({ kind: 'error', text: res.error })
      return
    }
    setMsg({
      kind: 'ok',
      text: res.offline
        ? 'Calibración guardada en el dispositivo · se subirá al sincronizar'
        : res.partial
          ? `Sensor registrado (${res.readings || scope}). Puede calibrar el otro sensor cuando el calibrador dé punto.`
          : `Calibración completa${res.code ? ` · OT ${res.code}` : ''}${res.readings ? ` · ${res.readings}` : ''}`,
    })
    setCalibratorFile(null)
    setScreenFile(null)
    setNotes('')
    setTempMachineF('')
    setTempCalibratorF('')
    setRhMachinePct('')
    setRhCalibratorPct('')
    if (!res.partial) setMachineId('')
    setTab(res.partial ? 'ejecutar' : 'historial')
  }

  if (!canDo) {
    return (
      <div className="card wide">
        <div className="card-head">
          <h2>Calibrar máquina</h2>
        </div>
        <p className="hint">Su rol no ejecuta calibraciones de máquina.</p>
      </div>
    )
  }

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ margin: 0 }}>Calibrar máquina</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Sensores: temperatura °F y humedad % · {ROLE_LABEL[role] ?? role}
          </p>
        </div>
        {api.generating && (
          <span className="pill status warn">Revisando ventanas…</span>
        )}
        <span className="pill status warn">{api.pending.length} OT pendiente(s)</span>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Puede calibrar <strong>solo temperatura</strong>, <strong>solo humedad</strong> o{' '}
        <strong>ambas a la vez</strong> (el calibrador a veces no da punto en los dos indicadores
        al mismo tiempo). Cada registro lleva foto del calibrador + foto de la pantalla.
      </p>

      <nav className="subtabs-rail" aria-label="Calibración de máquina" style={{ marginTop: 12 }}>
        <div className="subtabs-rail-head">
          <p className="subtabs-rail-label">Calibración</p>
          <p className="subtabs-rail-hint">T°F · HR% · evidencias</p>
        </div>
        <div className="tabs subtabs" role="tablist">
          <button
            type="button"
            className={tab === 'pendientes' ? 'tab active' : 'tab'}
            onClick={() => setTab('pendientes')}
          >
            Pendientes ({api.pending.length})
          </button>
          <button
            type="button"
            className={tab === 'ejecutar' ? 'tab active' : 'tab'}
            onClick={() => setTab('ejecutar')}
          >
            Ejecutar
          </button>
          <button
            type="button"
            className={tab === 'historial' ? 'tab active' : 'tab'}
            onClick={() => setTab('historial')}
          >
            Mis reportes ({api.reports.length})
          </button>
          {api.canManage && (
            <button
              type="button"
              className={tab === 'estado' ? 'tab active' : 'tab'}
              onClick={() => setTab('estado')}
            >
              Estado máquinas
            </button>
          )}
        </div>
      </nav>

      {api.error && <p className="msg error">{api.error}</p>}
      {msg && <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`}>{msg.text}</p>}

      {tab === 'pendientes' && (
        <div className="admin-list" style={{ marginTop: 12 }}>
          {api.loading && api.pending.length === 0 && <p className="hint">Cargando…</p>}
          {!api.loading && api.pending.length === 0 && (
            <p className="hint">
              No hay OT de calibración abiertas. Puede ejecutar una calibración manual en
              «Ejecutar».
            </p>
          )}
          {api.pending.map((o) => {
            const m = machineOf(o.machine_id)
            const reason = parseCalibReason(o.description)
            return (
              <div key={o.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {o.code || 'OT'} · {o.title}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {m
                        ? `${m.name} (${m.code}) · ${MACHINE_TYPE_LABEL[m.type] || m.type} · ${plantName(m.plant_id)}`
                        : 'Máquina'}
                      {reason ? ` · ${CALIB_REASON_LABEL[reason] || reason}` : ''}
                    </span>
                  </div>
                  <span className="pill status warn">
                    {o.status === 'in_progress' ? 'En ejecución' : 'Abierta'}
                  </span>
                  <button type="button" className="primary small" onClick={() => startFromOrder(o)}>
                    Calibrar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'ejecutar' && (
        <div className="inline-form" style={{ marginTop: 12 }}>
          <label>
            Máquina a calibrar
            <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
              <option value="">— Seleccione —</option>
              {activeMachines.map((m) => {
                const open = api.openForMachine(m.id)
                return (
                  <option key={m.id} value={m.id}>
                    {m.code} · {m.name} · {MACHINE_TYPE_LABEL[m.type] || m.type}
                    {open ? ' · OT pendiente' : ''}
                  </option>
                )
              })}
            </select>
          </label>

          <p className="component-title" style={{ margin: '8px 0 6px' }}>
            ¿Qué sensor(es) va a calibrar?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {[
              [CALIB_SCOPE.temperature, '🌡️ Solo temperatura (°F)'],
              [CALIB_SCOPE.humidity, '💧 Solo humedad (%)'],
              [CALIB_SCOPE.both, '🌡️💧 Ambos a la vez'],
            ].map(([val, lab]) => (
              <button
                key={val}
                type="button"
                className={scope === val ? 'chip active' : 'chip'}
                onClick={() => setScope(val)}
              >
                {lab}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            {scope === CALIB_SCOPE.both
              ? 'Ingrese lecturas de ambos sensores y tome las 2 fotos una sola vez.'
              : `Solo se pedirán lecturas de ${CALIB_SCOPE_LABEL[scope]}. Luego podrá registrar el otro sensor en otra toma.`}
          </p>

          {needTemp && (
            <div className="two-col">
              <label>
                Temperatura en pantalla (°F)
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={tempMachineF}
                  onChange={(e) => setTempMachineF(e.target.value)}
                  placeholder="Ej. 99.5"
                />
              </label>
              <label>
                Temperatura del calibrador (°F)
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={tempCalibratorF}
                  onChange={(e) => setTempCalibratorF(e.target.value)}
                  placeholder="Ej. 99.7"
                />
              </label>
            </div>
          )}

          {needRh && (
            <div className="two-col">
              <label>
                Humedad en pantalla (%)
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={rhMachinePct}
                  onChange={(e) => setRhMachinePct(e.target.value)}
                  placeholder="Ej. 55.0"
                />
              </label>
              <label>
                Humedad del calibrador (%)
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={rhCalibratorPct}
                  onChange={(e) => setRhCalibratorPct(e.target.value)}
                  placeholder="Ej. 54.5"
                />
              </label>
            </div>
          )}

          <PhotoCapture
            label="1. Foto del calibrador"
            hint="instrumento en el punto de calibración"
            file={calibratorFile}
            onFile={setCalibratorFile}
          />
          <PhotoCapture
            label="2. Foto de la pantalla de la máquina"
            hint="valores mostrados del sensor"
            file={screenFile}
            onFile={setScreenFile}
          />

          <label>
            Observaciones (opcional)
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Ajuste fino en sonda A"
            />
          </label>

          <div className="actions row">
            <button
              type="button"
              className="primary"
              disabled={busy || !machineId || !calibratorFile || !screenFile}
              onClick={submit}
            >
              {busy ? 'Guardando…' : '✓ Registrar calibración'}
            </button>
          </div>
        </div>
      )}

      {tab === 'historial' && (
        <div className="admin-list" style={{ marginTop: 12 }}>
          <p className="hint">
            {api.canManage
              ? 'Todos los reportes de calibración de la empresa, con evidencias.'
              : 'Sus reportes de calibración y evidencias fotográficas.'}
          </p>
          {api.reports.length === 0 && (
            <p className="hint">
              Aún no hay calibraciones registradas
              {api.completed.length
                ? ` (${api.completed.length} OT cerradas sin detalle de sensores — ejecute la migración machine_calibration_state).`
                : '.'}
            </p>
          )}
          {api.reports.map((r) => {
            const m = machineOf(r.machine_id)
            const open = expandedId === r.id
            const ev = r.work_order_id ? api.evidenceByWo[r.work_order_id] || [] : []
            const paths = [
              r.photo_calibrator_path,
              r.photo_screen_path,
              ...ev.map((e) => e.file_path),
            ].filter(Boolean)
            const uniquePaths = [...new Set(paths)]
            return (
              <div key={r.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {m ? `${m.code} ${m.name}` : 'Máquina'} ·{' '}
                      {CALIB_SCOPE_LABEL[r.scope] || r.scope}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {r.calibrated_at
                        ? new Date(r.calibrated_at).toLocaleString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                      {' · '}
                      {formatCalibReadings(r)}
                      {r.reason ? ` · ${CALIB_REASON_LABEL[r.reason] || r.reason}` : ''}
                    </span>
                    {r.notes && (
                      <span className="hint" style={{ margin: 0 }}>
                        {r.notes}
                      </span>
                    )}
                  </div>
                  <span className="pill status ok">Registrada</span>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => setExpandedId(open ? null : r.id)}
                  >
                    {open ? 'Ocultar' : 'Evidencias'}
                  </button>
                </div>
                {open && (
                  <div style={{ marginTop: 8 }}>
                    <EvidenceThumbs paths={uniquePaths} getUrl={api.getEvidenceUrl} />
                    {ev.length > 0 && (
                      <ul className="hint" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                        {ev.map((e) => (
                          <li key={e.id}>
                            {e.note || e.file_name} ·{' '}
                            {e.created_at
                              ? new Date(e.created_at).toLocaleString('es-CO')
                              : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* OT completadas sin fila en machine_calibrations (legado) */}
          {api.completed
            .filter((o) => !api.reports.some((r) => r.work_order_id === o.id))
            .slice(0, 15)
            .map((o) => {
              const m = machineOf(o.machine_id)
              const ev = api.evidenceByWo[o.id] || []
              return (
                <div key={o.id} className="admin-row compact" style={{ margin: 0 }}>
                  <span>✓</span>
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {o.code} · {m ? `${m.code} ${m.name}` : o.title}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      OT cerrada · {o.resolution || '—'} · {ev.length} evidencia(s)
                    </span>
                  </div>
                  <span className="pill status idle">OT</span>
                </div>
              )
            })}
        </div>
      )}

      {tab === 'estado' && api.canManage && (
        <CoordStateTab sync={sync} machines={api.machines} />
      )}
    </div>
  )
}
