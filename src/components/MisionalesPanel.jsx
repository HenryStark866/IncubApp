/**
 * Desplazamientos Misionales — inspección pre-operacional de vehículos.
 * Portado desde repo_misionales a IncubApp (multi-tenant).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMisionales } from '../hooks/useMisionales'
import {
  VEHICLE_TYPES,
  GRADE_LABEL,
  aspectosForTipo,
  valoresForTipo,
  calcularPorcentaje,
  normalizePlaca,
} from '../lib/misionalesCatalog'
import { canManageOrgUsers } from '../lib/roles'

function todayIso() {
  return new Date().toLocaleDateString('sv-SE')
}

export default function MisionalesPanel({
  orgId,
  userId,
  role,
  userName,
  orgName,
}) {
  const canSeeAll =
    canManageOrgUsers(role) ||
    role === 'supervisor' ||
    role === 'platform_admin' ||
    role === 'developer'
  const api = useMisionales(orgId, userId, { canSeeAll })
  const [tab, setTab] = useState('nueva')
  const [msg, setMsg] = useState(null)

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>Desplazamientos misionales</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Inspección pre-operacional de vehículos · {orgName || 'Empresa'}
            {api.localMode ? ' · datos en este dispositivo' : ''}
          </p>
        </div>
        <span className="pill live">
          <span className="dot" /> SST · Misionales
        </span>
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{api.stats.total}</span>
          <span className="kpi-label">Inspecciones</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{api.stats.today}</span>
          <span className="kpi-label">Hoy</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{api.stats.avgPct}%</span>
          <span className="kpi-label">Cumplimiento medio</span>
        </div>
        <div className={`kpi-card${api.stats.notOptimal ? ' warn' : ''}`}>
          <span className="kpi-value">{api.stats.notOptimal}</span>
          <span className="kpi-label">No óptimas</span>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={tab === 'nueva' ? 'tab active' : 'tab'}
          onClick={() => setTab('nueva')}
        >
          Nueva inspección
        </button>
        <button
          type="button"
          className={tab === 'historial' ? 'tab active' : 'tab'}
          onClick={() => setTab('historial')}
        >
          Historial{canSeeAll ? ' (empresa)' : ' (mío)'}
        </button>
      </div>

      {msg && (
        <p className={`msg ${msg.kind === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </p>
      )}
      {api.error && <p className="msg error">{api.error}</p>}

      {tab === 'nueva' && (
        <InspectionForm
          userName={userName}
          orgName={orgName}
          busy={false}
          onSubmit={async (payload) => {
            setMsg(null)
            const res = await api.createInspection(payload)
            if (res.error) setMsg({ kind: 'error', text: res.error })
            else {
              setMsg({
                kind: 'ok',
                text: `Inspección registrada · cumplimiento ${res.row?.compliance_pct ?? '—'}%`,
              })
              setTab('historial')
            }
            return res
          }}
        />
      )}

      {tab === 'historial' && (
        <HistoryList
          rows={api.rows}
          loading={api.loading}
          canDelete={canSeeAll}
          onDelete={async (id) => {
            if (!window.confirm('¿Eliminar esta inspección?')) return
            await api.removeInspection(id)
          }}
        />
      )}
    </div>
  )
}

function InspectionForm({ userName, orgName, onSubmit }) {
  const [tipo, setTipo] = useState('Moto')
  const aspectosList = useMemo(() => aspectosForTipo(tipo), [tipo])
  const grades = useMemo(() => valoresForTipo(tipo), [tipo])
  const [aspectos, setAspectos] = useState({})
  const [form, setForm] = useState({
    driver_name: userName || '',
    plate: '',
    process: 'Misional',
    origin: '',
    destination: '',
    brand: '',
    model: '',
    fuel: '',
    line: '',
    engine: '',
    internal_number: '',
    odometer: '',
    city: '',
    license_num: '',
    license_exp: '',
    soat: '',
    property_card: '',
    gas_cert: '',
    insurance: '',
    optimal: true,
    observations: '',
  })
  const [busy, setBusy] = useState(false)
  const [gps, setGps] = useState({ lat: null, lng: null, accuracy: null })
  const canvasRef = useRef(null)
  const drawing = useRef(false)

  useEffect(() => {
    // reset aspectos al cambiar tipo
    setAspectos({})
  }, [tipo])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }, [])

  // Firma canvas
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'

    const pos = (e) => {
      const r = c.getBoundingClientRect()
      const t = e.touches?.[0]
      const x = (t ? t.clientX : e.clientX) - r.left
      const y = (t ? t.clientY : e.clientY) - r.top
      return { x: (x * c.width) / r.width, y: (y * c.height) / r.height }
    }
    const start = (e) => {
      e.preventDefault()
      drawing.current = true
      const p = pos(e)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    }
    const move = (e) => {
      if (!drawing.current) return
      e.preventDefault()
      const p = pos(e)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    const end = () => {
      drawing.current = false
    }
    c.addEventListener('mousedown', start)
    c.addEventListener('mousemove', move)
    c.addEventListener('mouseup', end)
    c.addEventListener('mouseleave', end)
    c.addEventListener('touchstart', start, { passive: false })
    c.addEventListener('touchmove', move, { passive: false })
    c.addEventListener('touchend', end)
    return () => {
      c.removeEventListener('mousedown', start)
      c.removeEventListener('mousemove', move)
      c.removeEventListener('mouseup', end)
      c.removeEventListener('mouseleave', end)
      c.removeEventListener('touchstart', start)
      c.removeEventListener('touchmove', move)
      c.removeEventListener('touchend', end)
    }
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setAspect = (idx, val) =>
    setAspectos((a) => ({
      ...a,
      [String(idx + 1)]: { valor: val, label: aspectosList[idx] },
    }))

  const done = Object.keys(aspectos).length
  const pct = calcularPorcentaje(aspectos)

  const clearSign = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
  }

  const submit = async () => {
    if (done < aspectosList.length) {
      alert(`Complete todos los aspectos (${done}/${aspectosList.length})`)
      return
    }
    setBusy(true)
    const signature_data = canvasRef.current?.toDataURL?.('image/png') || null
    await onSubmit({
      ...form,
      vehicle_type: tipo,
      plate: normalizePlaca(form.plate),
      aspectos,
      optimal: form.optimal === true || form.optimal === 'true' || form.optimal === 'SI',
      lat: gps.lat,
      lng: gps.lng,
      gps_accuracy: gps.accuracy,
      signature_data,
    })
    setBusy(false)
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint">
        Antes de cada desplazamiento, registre el estado del vehículo. Formatos SST digitalizados
        (moto 13 aspectos · carro/camión 50). Fecha: {todayIso()}
        {gps.lat != null
          ? ` · GPS ${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)}`
          : ' · GPS pendiente'}
      </p>

      <div className="tabs" style={{ margin: '10px 0', flexWrap: 'wrap' }}>
        {VEHICLE_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tipo === t.id ? 'tab active' : 'tab'}
            onClick={() => setTipo(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="inline-form">
        <h3 className="section-title" style={{ margin: '0 0 8px' }}>
          Datos del desplazamiento
        </h3>
        <div className="two-col">
          <label>
            Conductor
            <input value={form.driver_name} onChange={set('driver_name')} />
          </label>
          <label>
            Placa
            <input
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
              placeholder="ABC123"
            />
          </label>
        </div>
        <div className="two-col">
          <label>
            Desde
            <input value={form.origin} onChange={set('origin')} placeholder="Planta / origen" />
          </label>
          <label>
            Hasta
            <input value={form.destination} onChange={set('destination')} placeholder="Destino" />
          </label>
        </div>
        <div className="two-col">
          <label>
            Proceso
            <input value={form.process} onChange={set('process')} />
          </label>
          <label>
            Ciudad
            <input value={form.city} onChange={set('city')} />
          </label>
        </div>
        <div className="two-col">
          <label>
            Marca
            <input value={form.brand} onChange={set('brand')} />
          </label>
          <label>
            Modelo
            <input value={form.model} onChange={set('model')} />
          </label>
        </div>
        <div className="two-col">
          <label>
            Kilometraje
            <input value={form.odometer} onChange={set('odometer')} />
          </label>
          <label>
            Nº interno
            <input value={form.internal_number} onChange={set('internal_number')} />
          </label>
        </div>
        <div className="two-col">
          <label>
            Licencia Nº
            <input value={form.license_num} onChange={set('license_num')} />
          </label>
          <label>
            Vence licencia
            <input type="date" value={form.license_exp} onChange={set('license_exp')} />
          </label>
        </div>
        <div className="two-col">
          <label>
            SOAT
            <input value={form.soat} onChange={set('soat')} />
          </label>
          <label>
            Tarjeta de propiedad
            <input value={form.property_card} onChange={set('property_card')} />
          </label>
        </div>

        <h3 className="section-title" style={{ margin: '16px 0 8px' }}>
          Aspectos a revisar ({done}/{aspectosList.length}) · cumplimiento estimado {pct}%
        </h3>
        <p className="hint" style={{ marginTop: 0 }}>
          {grades.map((g) => `${g}=${GRADE_LABEL[g]}`).join(' · ')}
        </p>
        <div className="misionales-aspects">
          {aspectosList.map((label, i) => {
            const key = String(i + 1)
            const cur = aspectos[key]?.valor || aspectos[key] || ''
            return (
              <div key={key} className={`misionales-aspect-row${cur === 'M' || cur === 'R' ? ' bad' : ''}`}>
                <span className="misionales-aspect-label">
                  {i + 1}. {label}
                </span>
                <div className="misionales-grades">
                  {grades.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`chip${cur === g ? ' primary' : ' ghost'}${g === 'M' ? ' danger' : ''}`}
                      onClick={() => setAspect(i, g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <label style={{ marginTop: 12, display: 'block' }}>
          ¿Vehículo en óptimas condiciones?
          <select
            value={form.optimal === true || form.optimal === 'true' ? 'true' : 'false'}
            onChange={(e) => setForm((f) => ({ ...f, optimal: e.target.value === 'true' }))}
          >
            <option value="true">SÍ</option>
            <option value="false">NO</option>
          </select>
        </label>
        <label>
          Observaciones
          <textarea
            rows={3}
            value={form.observations}
            onChange={set('observations')}
            placeholder="Novedades, fallas, acciones…"
          />
        </label>

        <h3 className="section-title" style={{ margin: '12px 0 6px' }}>
          Firma del conductor
        </h3>
        <canvas
          ref={canvasRef}
          width={560}
          height={160}
          className="misionales-sign"
          style={{ width: '100%', maxWidth: 560, height: 160, touchAction: 'none' }}
        />
        <div className="actions row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" className="ghost small" onClick={clearSign}>
            Limpiar firma
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || done < aspectosList.length}
            onClick={submit}
          >
            {busy ? 'Guardando…' : 'Registrar inspección'}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Empresa: {orgName || '—'} · Ante condición insegura detenga la operación y notifique al
          líder inmediato.
        </p>
      </div>
    </div>
  )
}

function HistoryList({ rows, loading, canDelete, onDelete }) {
  if (loading) return <p className="hint">Cargando…</p>
  if (!rows.length) {
    return (
      <p className="hint" style={{ marginTop: 12 }}>
        Sin inspecciones registradas todavía.
      </p>
    )
  }
  return (
    <div className="admin-list" style={{ marginTop: 12 }}>
      {rows.map((r) => {
        const aspects = r.aspects || r.aspectos || {}
        const nAspects = Object.keys(aspects).length
        return (
          <div key={r.id} className="admin-row compact" style={{ margin: 0, flexWrap: 'wrap' }}>
            <div className="admin-row-main" style={{ flex: 1 }}>
              <strong>
                {r.plate} · {r.vehicle_type} · {r.driver_name}
              </strong>
              <span className="hint" style={{ margin: 0 }}>
                {r.inspected_at
                  ? new Date(r.inspected_at).toLocaleString('es-CO')
                  : '—'}
                {r.origin || r.destination
                  ? ` · ${r.origin || '?'} → ${r.destination || '?'}`
                  : ''}
                {` · ${nAspects} aspectos · ${r.compliance_pct ?? '—'}%`}
              </span>
            </div>
            <span className={`pill status ${r.optimal ? 'ok' : 'warn'}`}>
              {r.optimal ? 'Óptimo' : 'No óptimo'}
            </span>
            {canDelete && (
              <button type="button" className="ghost small" onClick={() => onDelete(r.id)}>
                Eliminar
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
