/**
 * =============================================================================
 * ARCHIVO: src/components/SensorPanel.jsx
 * PROPÓSITO: Componente UI «SensorPanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useState } from 'react'
import { useSensors } from '../hooks/useSensors'

export const SENSOR_KINDS = [
  { value: 'temperature', label: 'Temperatura', unit: '°C', icon: '🌡️' },
  { value: 'humidity', label: 'Humedad', unit: '%HR', icon: '💧' },
  { value: 'co2', label: 'CO₂', unit: 'ppm', icon: '☁️' },
  { value: 'turning', label: 'Volteo', unit: 'ciclos/h', icon: '🔄' },
  { value: 'power', label: 'Energía', unit: 'kW', icon: '⚡' },
  { value: 'door', label: 'Puerta', unit: 'estado', icon: '🚪' },
  { value: 'pressure', label: 'Presión', unit: 'Pa', icon: '🎚️' },
]

const kindOf = (k) => SENSOR_KINDS.find((x) => x.value === k) ?? { label: k, unit: '', icon: '📟' }

const outOfRange = (value, s) =>
  value != null &&
  ((s.min_threshold != null && value < Number(s.min_threshold)) ||
    (s.max_threshold != null && value > Number(s.max_threshold)))

const timeAgo = (iso) => {
  if (!iso) return null
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'hace segundos'
  if (secs < 3600) return `hace ${Math.floor(secs / 60)} min`
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)} h`
  return `hace ${Math.floor(secs / 86400)} días`
}

function NewSensorForm({ onCreate, onCancel }) {
  const [form, setForm] = useState({
    code: '',
    kind: 'temperature',
    unit: '°C',
    min_threshold: '',
    max_threshold: '',
    device_id: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const setKind = (e) => {
    const kind = e.target.value
    setForm((f) => ({ ...f, kind, unit: kindOf(kind).unit }))
  }
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
    <div className="inline-form compact">
      <div className="two-col">
        <label>
          Código
          <input type="text" value={form.code} onChange={set('code')} placeholder="Ej. TMP-01" autoFocus />
        </label>
        <label>
          Variable
          <select value={form.kind} onChange={setKind}>
            {SENSOR_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.icon} {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="two-col">
        <label>
          Umbral mínimo ({form.unit})
          <input type="number" step="any" value={form.min_threshold} onChange={set('min_threshold')} placeholder="Ej. 37.2" />
        </label>
        <label>
          Umbral máximo ({form.unit})
          <input type="number" step="any" value={form.max_threshold} onChange={set('max_threshold')} placeholder="Ej. 38.1" />
        </label>
      </div>
      <label>
        ID del dispositivo (opcional)
        <input type="text" value={form.device_id} onChange={set('device_id')} placeholder="Ej. esp32-a4:cf:12" />
      </label>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || form.code.trim().length < 2}>
          {busy ? 'Agregando…' : 'Agregar sensor'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function TestReading({ sensor, onIngest }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (value === '') return
    setBusy(true)
    const { error } = await onIngest(sensor.id, Number(value))
    setBusy(false)
    if (!error) setValue('')
  }

  return (
    <span className="test-reading">
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={sensor.unit}
        title="Registrar lectura manual"
      />
      <button className="ghost" onClick={send} disabled={busy || value === ''}>
        {busy ? '…' : 'Registrar'}
      </button>
    </span>
  )
}

export default function SensorPanel({ machineId, orgId, canManage, latest }) {
  const { sensors, loading, error, createSensor, deleteSensor, ingestReading } = useSensors(machineId, orgId)
  const [showForm, setShowForm] = useState(false)

  const onDelete = async (s) => {
    if (!window.confirm(`¿Eliminar el sensor "${s.code}"? Se conservarán sus lecturas históricas.`)) return
    await deleteSensor(s.id)
  }

  return (
    <div className="sensor-panel">
      <div className="sensor-panel-head">
        <span className="hint" style={{ margin: 0 }}>
          {sensors.length === 0 ? 'Sin sensores conectados.' : `${sensors.length} sensor${sensors.length === 1 ? '' : 'es'}`}
        </span>
        {canManage && !showForm && (
          <button className="chip ghost small" onClick={() => setShowForm(true)}>
            + Sensor
          </button>
        )}
      </div>

      {showForm && <NewSensorForm onCreate={createSensor} onCancel={() => setShowForm(false)} />}
      {error && <p className="msg error">{error}</p>}
      {loading && <p className="hint">Cargando sensores…</p>}

      {sensors.map((s) => {
        const k = kindOf(s.kind)
        const reading = latest?.[s.id]
        const alarm = reading && outOfRange(reading.value, s)
        return (
          <div key={s.id} className={`sensor-row${alarm ? ' alarm' : ''}`}>
            <span className="sensor-kind" title={k.label}>
              {k.icon} {k.label}
            </span>
            <span className="machine-code">{s.code}</span>
            <span className={`sensor-value${alarm ? ' alarm' : ''}`}>
              {reading ? (
                <>
                  <strong>{reading.value}</strong> {s.unit}
                  <em className="sensor-time">{timeAgo(reading.recorded_at)}</em>
                </>
              ) : (
                <em className="sensor-time">sin lecturas</em>
              )}
            </span>
            <span className="sensor-range">
              {s.min_threshold != null || s.max_threshold != null
                ? `${s.min_threshold ?? '−∞'} a ${s.max_threshold ?? '+∞'} ${s.unit}`
                : 'sin umbrales'}
            </span>
            {alarm && <span className="pill status off">FUERA DE RANGO</span>}
            {canManage && (
              <span className="sensor-actions">
                <TestReading sensor={s} onIngest={ingestReading} />
                <button className="ghost danger" onClick={() => onDelete(s)} title="Eliminar sensor">
                  ✕
                </button>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
