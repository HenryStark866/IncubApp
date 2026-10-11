/**
 * =============================================================================
 * ARCHIVO: src/components/ReceptionPanel.jsx
 * PROPÓSITO: Componente UI «ReceptionPanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEggReports } from '../hooks/useEggReports'
import { useIncubationLots, lotTotals } from '../hooks/useIncubationLots'
import { compressImage } from '../lib/image'
import ColdRoomPanel from './ColdRoomPanel'
import remisionRefImg from '../assets/remision-galpon-referencia.jpg'

const EggRotationBoardPanelLazy = lazy(() => import('./EggRotationBoardPanel'))
const TapingPanelLazy          = lazy(() => import('./TapingPanel'))
const CartMarkingPanelLazy     = lazy(() => import('./CartMarkingPanel'))

/**
 * Recepción del huevo en planta (Fase 4). El operario de recepción ve los
 * reportes ya verificados por la granja, cuenta/ajusta las cantidades y
 * certifica el envío → el lote queda cargado al cuarto frío (almacenamiento
 * de huevo), listo para el mapa de cargue del coordinador de planta.
 */

const today = () => new Date().toLocaleDateString('sv-SE')
const fmtDate = (v) =>
  v
    ? new Date(v).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'
const num = (n) => (n == null ? 0 : Number(n)).toLocaleString('es-CO')
const num1 = (n) =>
  (n == null ? 0 : Number(n)).toLocaleString('es-CO', {
    maximumFractionDigits: 1,
  })
const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''

/* ══ Formulario de certificación (conteo recibido) ══════════ */
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
        Cuenta y confirma las cantidades recibidas. Al certificar, el lote queda cargado al cuarto frío.
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
        <button className="primary small" onClick={submit} disabled={busy}>
          {busy ? 'Certificando…' : '✓ Certificar recepción'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/* ══ Panel principal (sub-pestañas) ══ */
export default function ReceptionPanel({
  orgId,
  userId,
  role,
  coordinatorName,
  showReception = true,
  showColdRoom = true,
  initialSubTab = null,
  onNavigate,
}) {
  const [subTab, setSubTab] = useState(initialSubTab || (showReception ? 'recepcion' : 'cuartofrio'))

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab)
    }
  }, [initialSubTab])

  const multi = showReception && showColdRoom

  return (
    <>
      <nav className="subtabs-rail" aria-label="Recepción de huevo" style={{ marginBottom: 12 }}>
        <div className="subtabs-rail-head">
          <p className="subtabs-rail-label">Recepción</p>
          <p className="subtabs-rail-hint">Llegada · certificación · remisión · rotación · encintar · marcar · cuarto frío</p>
        </div>
        <div className="tabs subtabs" role="tablist">
          {showReception && (
            <button
              type="button"
              className={subTab === 'recepcion' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('recepcion')}
            >
              📥 Certificar envíos
            </button>
          )}
          {showReception && (
            <button
              type="button"
              className={subTab === 'remision' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('remision')}
            >
              📋 Remisión galpón
            </button>
          )}
          {showReception && (
            <button
              type="button"
              className={subTab === 'llegada' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('llegada')}
            >
              🚛 Llegada a planta
            </button>
          )}
          {showReception && (
            <button
              type="button"
              className={subTab === 'rotacion' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('rotacion')}
            >
              🔄 Rotación de huevo
            </button>
          )}
          {showReception && (
            <button
              type="button"
              className={subTab === 'encintar' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('encintar')}
            >
              🎀 Encintar
            </button>
          )}
          {showReception && (
            <button
              type="button"
              className={subTab === 'marcar-carros' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('marcar-carros')}
            >
              🏷️ Marcar carros
            </button>
          )}
          {showColdRoom && (
            <button
              type="button"
              className={subTab === 'cuartofrio' ? 'tab active' : 'tab'}
              onClick={() => setSubTab('cuartofrio')}
            >
              ❄️ Cuarto frío
            </button>
          )}
        </div>
      </nav>
      {subTab === 'cuartofrio' ? (
        <ColdRoomPanel orgId={orgId} userId={userId} role={role} />
      ) : subTab === 'llegada' ? (
        <EggArrivalPanel orgId={orgId} userId={userId} role={role} coordinatorName={coordinatorName} />
      ) : subTab === 'remision' ? (
        <RemisionForm orgId={orgId} userId={userId} role={role} onGoToReception={() => setSubTab('recepcion')} />
      ) : subTab === 'rotacion' ? (
        <Suspense fallback={<p className="hint">Cargando tablero de rotación…</p>}>
          <EggRotationBoardPanelLazy orgId={orgId} userId={userId} role={role} />
        </Suspense>
      ) : subTab === 'encintar' ? (
        <Suspense fallback={<p className="hint">Cargando panel de encintado…</p>}>
          <TapingPanelLazy orgId={orgId} userId={userId} role={role} />
        </Suspense>
      ) : subTab === 'marcar-carros' ? (
        <Suspense fallback={<p className="hint">Cargando panel de marcación…</p>}>
          <CartMarkingPanelLazy orgId={orgId} userId={userId} role={role} />
        </Suspense>
      ) : (
        <ReceptionInbox
          orgId={orgId}
          userId={userId}
          role={role}
          coordinatorName={coordinatorName}
          onOpenRemision={() => setSubTab('remision')}
        />
      )}
      {!multi && !showReception && showColdRoom ? null : null}
    </>
  )
}

/* ══ Formulario Remisión Huevos Galpón (formato Antioqueña de Incubación S.A.S) ══ */
const REMISION_GALPON_COLS = [
  { key: 'incubable', label: 'Incubable' },
  { key: 'fisurado',  label: 'Fisurado' },
  { key: 'extra',     label: 'Extra' },
  { key: 'roto',      label: 'Roto' },
  { key: 'sucio',     label: 'Sucio' },
  { key: 'cajas',     label: 'Nº Cajas' },
  { key: 'cubetas',   label: 'Nº Cubetas' },
]

function emptyRow(galpon = '') {
  return { galpon, incubable: '', fisurado: '', extra: '', roto: '', sucio: '', cajas: '', cubetas: '' }
}

function numOrEmpty(v) {
  const n = Number(v)
  return isNaN(n) || v === '' ? '' : n
}

function colTotal(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
}

function RemisionForm({ orgId, userId, role, onGoToReception }) {
  const canEdit = ['owner','admin','supervisor','coordinator','reception_operator','operator','auxiliary'].includes(role)

  /* ── Estado principal ── */
  const [remisionNo, setRemisionNo] = useState('')
  const [fechaProd, setFechaProd] = useState('')
  const [fechaRemision, setFechaRemision] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [quienDespacha, setQuienDespacha] = useState('')
  const [quienRecibe, setQuienRecibe] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [showRefImg, setShowRefImg] = useState(true)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  /* Filas de galpones — por defecto 3 vacías */
  const [rows, setRows] = useState(() => [emptyRow(), emptyRow(), emptyRow()])

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const loadReferenceSample = () => {
    setRemisionNo('4854')
    setFechaProd('2026-10-08')
    setFechaRemision('2026-10-08')
    setQuienDespacha('Adrian Gil')
    setQuienRecibe('Nelson Palacio')
    setObservaciones('')
    setRows([
      { galpon: '201', incubable: 2240, fisurado: '', extra: '', roto: '', sucio: '', cajas: 6, cubetas: '' },
      { galpon: '202', incubable: 2340, fisurado: '', extra: '', roto: '', sucio: '', cajas: 6, cubetas: '' },
      { galpon: '203', incubable: 2160, fisurado: '', extra: '', roto: '', sucio: '', cajas: 6, cubetas: '' },
      { galpon: '204', incubable: 1870, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
      { galpon: '205', incubable: 2520, fisurado: '12030 ✓', extra: '', roto: '', sucio: '', cajas: 7, cubetas: '' },
      { galpon: '301', incubable: 1870, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
      { galpon: '302', incubable: 1680, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
      { galpon: '303', incubable: 1800, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
      { galpon: '304', incubable: 1950, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
      { galpon: '305', incubable: 1800, fisurado: '', extra: '', roto: '', sucio: '', cajas: 5, cubetas: '' },
      { galpon: '306', incubable: 1980, fisurado: '12840 ✓', extra: '', roto: '', cajas: 6, cubetas: '' },
      { galpon: '401', incubable: 1440, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
      { galpon: '402', incubable: 1380, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
      { galpon: '403', incubable: 1440, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
      { galpon: '404', incubable: 1530, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
      { galpon: '405', incubable: 1380, fisurado: '', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
      { galpon: '406', incubable: 1440, fisurado: '10650 +90', extra: '', roto: '', sucio: '', cajas: 4, cubetas: '' },
    ])
    setMsg({ kind: 'ok', text: '✓ Se cargaron los datos exactos del formato físico de referencia Nº 4854 (Total incubable: 30.720 huevos)' })
  }

  const resetForm = () => {
    setRemisionNo('')
    setFechaProd('')
    setFechaRemision(new Date().toLocaleDateString('sv-SE'))
    setQuienDespacha('')
    setQuienRecibe('')
    setObservaciones('')
    setRows([emptyRow(), emptyRow(), emptyRow()])
    setMsg(null)
  }

  const setCell = (i, key, val) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [key]: val } : r))

  const addRow = () => setRows(rs => [...rs, emptyRow()])
  const removeRow = i => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)

  /* Totales */
  const totalIncubable = colTotal(rows, 'incubable')
  const totalRotos     = colTotal(rows, 'roto')
  const totalSucios    = colTotal(rows, 'sucio')
  const totalExtra     = colTotal(rows, 'extra')
  const totalFisurado  = colTotal(rows, 'fisurado')

  const handleSubmit = async () => {
    if (!orgId || !userId) return
    setBusy(true)
    setMsg(null)
    try {
      const payload = {
        org_id: orgId,
        registered_by: userId,
        remision_no: remisionNo.trim() || null,
        fecha_produccion: fechaProd || null,
        fecha_remision: fechaRemision || null,
        quien_despacha: quienDespacha.trim() || null,
        quien_recibe: quienRecibe.trim() || null,
        observaciones: observaciones.trim() || null,
        galpon_rows: rows.filter(r => r.galpon.trim() || Number(r.incubable) > 0),
        totales: { incubable: totalIncubable, roto: totalRotos, sucio: totalSucios, extra: totalExtra, fisurado: totalFisurado },
        created_at: new Date().toISOString(),
      }
      const { error } = await import('../lib/supabase').then(m =>
        m.supabase.from('reception_remisions').insert(payload)
      )
      if (error) {
        if (error.code === '42P01' || /does not exist/i.test(error.message)) {
          setMsg({ kind: 'warn', text: 'La tabla reception_remisions aún no está creada en Supabase. El formulario funciona — guárdalo cuando el administrador habilite la tabla.' })
        } else {
          setMsg({ kind: 'error', text: error.message })
        }
      } else {
        setMsg({ kind: 'ok', text: `Remisión No. ${remisionNo || '—'} guardada · ${totalIncubable.toLocaleString('es-CO')} huevos incubables` })
        resetForm()
      }
    } catch(e) {
      setMsg({ kind: 'error', text: e.message })
    }
    setBusy(false)
  }

  /* ── Render ── */
  return (
    <div className="card wide rx-remision-wrap">

      {/* ── Modal Lightbox Pantalla Completa de la Imagen ── */}
      {lightboxOpen && (
        <div className="rx-remision-lightbox-overlay" onClick={() => setLightboxOpen(false)}>
          <div className="rx-remision-lightbox-header" onClick={e => e.stopPropagation()}>
            <strong style={{ fontSize: '1.05rem' }}>
              📄 Formato Físico Original: Remisión Huevos Galpón Nº 4854 — ANTIOQUEÑA DE INCUBACIÓN S.A.S
            </strong>
            <button
              type="button"
              className="ghost"
              style={{ color: '#fff', fontSize: '1.1rem', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}
              onClick={() => setLightboxOpen(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          <img
            src={remisionRefImg}
            alt="Formato físico original Remisión Huevos Galpón Nº 4854"
            className="rx-remision-lightbox-img"
            onClick={e => e.stopPropagation()}
          />
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginTop: 10 }}>
            Haz clic fuera de la foto o en Cerrar para volver.
          </p>
        </div>
      )}

      {/* ── Tarjeta de referencia visible con la imagen física ── */}
      <div className="rx-remision-ref-card">
        <div className="rx-remision-ref-header">
          <div className="rx-remision-ref-title">
            <span style={{ fontSize: '1.4rem' }}>📸</span>
            <div>
              <h3>Formato Físico Oficial: Remisión Huevos Galpón (Nº 4854)</h3>
              <p className="hint" style={{ margin: 0 }}>
                Antioqueña de Incubación S.A.S · NIT: 900.762.687-3 · Formato físico diligenciado en granja
              </p>
            </div>
          </div>
          <div className="rx-remision-ref-actions">
            <button
              type="button"
              className="secondary small"
              onClick={() => setLightboxOpen(true)}
              title="Ver imagen en alta resolución en pantalla completa"
            >
              🔍 Ampliar foto
            </button>
            <button
              type="button"
              className="secondary small"
              onClick={loadReferenceSample}
              title="Cargar los números y galpones exactamente como figuran en la remisión Nº 4854"
            >
              📋 Cargar datos de la foto (Nº 4854)
            </button>
            <button
              type="button"
              className="ghost small"
              onClick={() => setShowRefImg(v => !v)}
            >
              {showRefImg ? '📷 Ocultar foto' : '📷 Mostrar foto'}
            </button>
          </div>
        </div>

        {showRefImg && (
          <div className="rx-remision-img-preview-box">
            <img
              src={remisionRefImg}
              alt="Formato Físico de Remisión Huevos Galpón Nº 4854"
              className="rx-remision-img-preview"
              onClick={() => setLightboxOpen(true)}
              title="Clic para ampliar en pantalla completa"
            />
            <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              🔍 Haz clic sobre la foto para ampliarla en pantalla completa
            </p>
          </div>
        )}
      </div>

      {/* ── Encabezado tipo formato ── */}
      <div className="rx-remision-header">
        <div className="rx-remision-brand">
          <div className="rx-remision-logo-box">
            <span className="rx-remision-logo-text">INCUBANT</span>
            <span className="rx-remision-logo-sub">ANTIOQUEÑA DE INCUBACIÓN S.A.S</span>
          </div>
          <div className="rx-remision-title-box">
            <strong>ANTIOQUEÑA DE INCUBACIÓN S.A.S</strong>
            <span>Remisión Huevos Galpón Detallado</span>
            <span>NIT: 900.762.687-3</span>
          </div>
        </div>
        <div className="rx-remision-no-box">
          <span className="rx-remision-no-label">Remisión Huevos Galpón</span>
          <div className="rx-remision-no-value">
            <span>Nº</span>
            {canEdit ? (
              <input
                type="text"
                className="rx-remision-no-input"
                value={remisionNo}
                onChange={e => setRemisionNo(e.target.value)}
                placeholder="0000"
                maxLength={8}
              />
            ) : (
              <strong>{remisionNo || '—'}</strong>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabla de galpones ── */}
      <div className="rx-remision-table-wrap">
        <table className="rx-remision-table">
          <thead>
            <tr>
              <th rowSpan={2} className="rx-remision-th-galpon">Galpón</th>
              <th rowSpan={2}>Incubable</th>
              <th rowSpan={2}>Fisurado</th>
              <th colSpan={3} className="rx-remision-th-center">Cantidad de Huevo</th>
              <th rowSpan={2}>Nº Cajas</th>
              <th rowSpan={2}>Nº Cubetas</th>
              {canEdit && <th rowSpan={2}></th>}
            </tr>
            <tr>
              <th>Extra</th>
              <th>Roto</th>
              <th>Sucio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="rx-remision-row">
                <td>
                  {canEdit ? (
                    <input
                      className="rx-remision-cell-input"
                      value={row.galpon}
                      onChange={e => setCell(i, 'galpon', e.target.value)}
                      placeholder={`G${i + 1}`}
                    />
                  ) : row.galpon || `G${i+1}`}
                </td>
                {['incubable','fisurado','extra','roto','sucio','cajas','cubetas'].map(key => (
                  <td key={key}>
                    {canEdit ? (
                      <input
                        type="text"
                        className="rx-remision-cell-input num"
                        value={row[key]}
                        onChange={e => setCell(i, key, e.target.value)}
                        placeholder="—"
                      />
                    ) : (numOrEmpty(row[key]) !== '' ? numOrEmpty(row[key]).toLocaleString('es-CO') : '—')}
                  </td>
                ))}
                {canEdit && (
                  <td>
                    <button type="button" className="ghost small rx-remision-del" onClick={() => removeRow(i)} title="Quitar fila">✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {/* Totales por columna */}
          <tfoot>
            <tr className="rx-remision-totals">
              <td colSpan={2}><strong>Total</strong></td>
              {['incubable','fisurado','extra','roto','sucio','cajas','cubetas'].map(key => (
                <td key={key}>
                  <strong>{colTotal(rows, key) > 0 ? colTotal(rows, key).toLocaleString('es-CO') : '—'}</strong>
                </td>
              ))}
              {canEdit && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {canEdit && (
        <button type="button" className="ghost small" style={{ margin: '6px 0' }} onClick={addRow}>
          + Agregar galpón
        </button>
      )}

      {/* ── Resumen de totales (bloque inferior izquierdo del formato) ── */}
      <div className="rx-remision-bottom">
        <div className="rx-remision-totales-box">
          <table className="rx-remision-totales-table">
            <tbody>
              {[
                ['Huevo incubable', totalIncubable],
                ['Huevo roto',      totalRotos],
                ['Huevo sucio',     totalSucios],
                ['Huevo extra',     totalExtra],
              ].map(([label, val]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td><strong>{val > 0 ? val.toLocaleString('es-CO') : ''}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rx-remision-obs">
            <span>Observaciones</span>
            {canEdit ? (
              <input
                type="text"
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                placeholder="Anotaciones del turno…"
              />
            ) : <span>{observaciones || '—'}</span>}
          </div>
        </div>

        {/* ── Metadatos (derecha del formato) ── */}
        <div className="rx-remision-meta">
          {[
            { label: 'Fecha de Producción', type: 'date', val: fechaProd,       set: setFechaProd },
            { label: 'Fecha de Remisión',   type: 'date', val: fechaRemision,   set: setFechaRemision },
            { label: 'Quien Despacha',      type: 'text', val: quienDespacha,   set: setQuienDespacha },
            { label: 'Quien Recibe',        type: 'text', val: quienRecibe,     set: setQuienRecibe },
          ].map(({ label, type, val, set }) => (
            <div key={label} className="rx-remision-meta-row">
              <span>{label}:</span>
              {canEdit ? (
                <input type={type} value={val} onChange={e => set(e.target.value)} />
              ) : <span>{val || '—'}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Acciones ── */}
      {canEdit && (
        <div className="actions row" style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="primary" disabled={busy} onClick={handleSubmit}>
            {busy ? 'Guardando…' : '💾 Guardar remisión'}
          </button>
          <button type="button" className="ghost" onClick={resetForm} title="Limpiar todos los campos">
            ↺ Limpiar
          </button>
          <button type="button" className="ghost" onClick={() => window.print()} title="Imprimir">
            🖨️ Imprimir
          </button>
          {onGoToReception && (
            <button type="button" className="ghost" onClick={onGoToReception} title="Volver a la lista de envíos">
              ← Volver a Certificar envíos
            </button>
          )}
        </div>
      )}
      {msg && (
        <p className={`msg ${msg.kind === 'ok' ? 'ok' : msg.kind === 'warn' ? 'warn' : 'error'}`} style={{ marginTop: 8 }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}


/* ══ Llegada de huevo a planta: foto + sello ═════════════════ */
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
      text: `Llegada registrada · sello ${res.seal || seal}`,
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
            Hola
            {firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} · tome foto y anote el número del
            sello
          </span>
        </div>
        <span className="pill live">
          <span className="dot" /> {er.arrivals.length} registro(s)
        </span>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Al llegar el huevo a planta se registra el <strong>número de sello</strong> del precinto y una{' '}
        <strong>foto</strong> como evidencia. Luego se certifica el envío de granja en la pestaña «Certificar envíos».
      </p>

      {canReport && (
        <div className="inline-form" style={{ marginTop: 12 }}>
          <div className="two-col">
            <label>
              Número del sello *
              <input
                type="text"
                value={seal}
                onChange={(e) => setSeal(e.target.value)}
                placeholder="Ej. S-45821"
                autoComplete="off"
              />
            </label>
            <label>
              Placa del vehículo (opcional)
              <input type="text" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Ej. ABC-123" />
            </label>
          </div>
          <label>
            Procedencia / granja (opcional)
            <input
              type="text"
              value={farmHint}
              onChange={(e) => setFarmHint(e.target.value)}
              placeholder="Ej. Granja Norte · lote 12"
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
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 6,
              }}
            >
              <button type="button" className={file ? 'chip' : 'primary'} onClick={() => inputRef.current?.click()}>
                {file ? '📷 Cambiar foto' : '📷 Tomar foto'}
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
                style={{
                  display: 'block',
                  maxWidth: 240,
                  borderRadius: 8,
                  marginTop: 8,
                }}
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
            <button type="button" className="primary" disabled={busy || !seal.trim() || !file} onClick={submit}>
              {busy ? 'Guardando…' : '✓ Registrar llegada'}
            </button>
          </div>
        </div>
      )}

      {/* Cantidades de huevo por fecha de postura del lote recibido (la fecha de
          llegada es automática; el operario ingresa cuánto llegó por fecha). */}
      {canReport && <LotArrivalCapture orgId={orgId} userId={userId} />}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Llegadas recientes (sello + foto)
      </h3>
      {er.loading && !er.arrivals.length ? (
        <p className="hint">Cargando…</p>
      ) : er.arrivals.length === 0 ? (
        <p className="hint">Aún no hay reportes de llegada.</p>
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

/* ══ Cantidades recibidas por lote y fecha de postura ════════ */
function LotArrivalCapture({ orgId, userId }) {
  const api = useIncubationLots(orgId, userId)
  const [lotId, setLotId] = useState('')
  const [rows, setRows] = useState([{ productionDate: '', eggs: '' }])
  const [seal, setSeal] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // Lotes esperados (los que gerencia dejó planeados o ya llegando)
  const expected = useMemo(
    () => api.lots.filter((l) => ['planned', 'arrived', 'classifying'].includes(l.status)),
    [api.lots],
  )
  const selected = expected.find((l) => l.id === lotId) || api.lots.find((l) => l.id === lotId)

  // Al elegir lote, prellenar con las fechas de postura planeadas (cantidades vacías)
  const pickLot = (id) => {
    setLotId(id)
    const lot = api.lots.find((l) => l.id === id)
    if (lot?.postures?.length) {
      setRows(
        lot.postures.map((p) => ({
          productionDate: p.productionDate || '',
          eggs: '',
        })),
      )
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
      photos,
    })
    setBusy(false)
    if (res.error) {
      setMsg({ kind: 'error', text: res.error })
      return
    }
    setMsg({
      kind: 'ok',
      text: `Llegada registrada · ${num(totalEggs)} huevos`,
    })
    setLotId('')
    setRows([{ productionDate: '', eggs: '' }])
    setSeal('')
    setNotes('')
    setPhotos([])
  }

  const expectedEggs = selected ? lotTotals(selected.postures).eggs : 0
  const diff = totalEggs - expectedEggs

  return (
    <div
      className="card"
      style={{
        marginTop: 16,
        background: 'var(--surface-2, rgba(0,0,0,0.03))',
      }}
    >
      <div className="card-head" style={{ marginBottom: 4 }}>
        <div>
          <h3 style={{ margin: 0 }}>Cantidades recibidas por lote y fecha</h3>
          <span className="hint" style={{ margin: 0 }}>
            La fecha de llegada es automática (hoy). Ingresa los huevos recibidos por fecha de postura.
          </span>
        </div>
      </div>

      <label>
        Lote recibido
        <select value={lotId} onChange={(e) => pickLot(e.target.value)}>
          <option value="">— Selecciona el lote —</option>
          {expected.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} ({num(lotTotals(l.postures).eggs)} huevos planeados)
            </option>
          ))}
        </select>
      </label>

      {expected.length === 0 && (
        <p className="hint" style={{ marginTop: 6 }}>
          No hay lotes esperados. Gerencia los registra en el módulo «Datos».
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
              <button
                type="button"
                className="ghost small"
                onClick={() => removeRow(i)}
                title="Quitar"
                style={{ flex: '0 0 auto' }}
              >
                ✕
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

      <label style={{ marginTop: 8 }}>
        Fotos de la llegada (camión, precinto, estado del huevo)
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            setPhotos((ps) => [...ps, ...files].slice(0, 6))
            e.target.value = ''
          }}
        />
      </label>
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {photos.map((f, i) => (
            <button
              key={`${f.name}-${i}`}
              type="button"
              className="chip ghost"
              title="Quitar foto"
              onClick={() => setPhotos((ps) => ps.filter((_, idx) => idx !== i))}
            >
              📷 Foto {i + 1} ✕
            </button>
          ))}
        </div>
      )}

      {selected && totalEggs > 0 && expectedEggs > 0 && (
        <p
          className="hint"
          style={{
            margin: '6px 0 0',
            fontWeight: 700,
            color: diff === 0 ? 'var(--ok)' : 'var(--amber, #b7791f)',
          }}
        >
          Esperado {num(expectedEggs)} · recibido {num(totalEggs)} ·{' '}
          {diff === 0 ? 'cuadra' : `diferencia ${diff > 0 ? '+' : ''}${num(diff)} huevos`}
        </p>
      )}

      {totalEggs > 0 && (
        <p className="hint" style={{ margin: '6px 0 0', color: 'var(--accent)' }}>
          Total recibido: <strong>{num(totalEggs)}</strong> huevos · {num1(totalEggs / api.eggsPerTray)} bandejas ·{' '}
          {Math.ceil(totalEggs / api.eggsPerCart)} carros
        </p>
      )}
      {msg && (
        <p className={`msg ${msg.kind === 'ok' ? 'ok' : 'error'}`} style={{ marginTop: 6 }}>
          {msg.text}
        </p>
      )}
      {api.error && (
        <p className="msg error" style={{ marginTop: 6 }}>
          {api.error}
        </p>
      )}
      <div className="actions row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" disabled={busy || totalEggs <= 0} onClick={submit}>
          {busy ? 'Guardando…' : '✓ Registrar cantidades'}
        </button>
      </div>

      {api.arrivals.length > 0 && (
        <>
          <h4 className="section-title" style={{ margin: '16px 0 6px' }}>
            Últimas cantidades recibidas
          </h4>
          <div className="admin-list">
            {api.arrivals.slice(0, 8).map((a) => {
              const eggs = (a.received_postures || []).reduce((s, p) => s + (Number(p.eggs) || 0), 0)
              return (
                <div key={a.id} className="admin-row compact" style={{ margin: 0 }}>
                  <span>📦</span>
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {a.lot_code || 'Lote'} · {num(eggs)} huevos
                      {a.photo_paths?.length ? ` · 📷 ${a.photo_paths.length}` : ''}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {a.arrived_at
                        ? new Date(a.arrived_at).toLocaleString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                      {' · '}
                      {(a.received_postures || [])
                        .map((p) => `${fmtDate(p.productionDate)}: ${num(p.eggs)}`)
                        .join('  ·  ')}
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
              style={{
                width: 64,
                height: 64,
                objectFit: 'cover',
                borderRadius: 8,
              }}
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
            📷
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
              : '—'}
            {arrival.vehicle_plate ? ` · ${arrival.vehicle_plate}` : ''}
            {arrival.farm_hint ? ` · ${arrival.farm_hint}` : ''}
            {arrival.notes ? ` · ${arrival.notes}` : ''}
          </span>
        </div>
        <span className="pill status ok">Llegada</span>
      </div>
    </div>
  )
}

/* ══ Bandeja de recepción (envíos de las granjas) ════════════ */
function ReceptionInbox({ orgId, userId, role, coordinatorName, onOpenRemision }) {
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
      for (const row of t.data ?? []) map[row.user_id] = row.profiles?.full_name || row.profiles?.email || '—'
      setPeople(map)
    })
  }, [orgId])

  const roomName = (id) => {
    const r = rooms.find((x) => x.id === id)
    return r ? `${r.name} (${r.code})` : 'Galpón'
  }
  const farmName = (id) => farms.find((f) => f.id === id)?.name ?? 'Granja'
  const nameOf = (id) => (id ? (people[id] ?? '—') : '—')

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
    return {
      pending: pending.length,
      receivedToday: receivedToday.length,
      incToday: inc,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length, receivedToday, er.categories])

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>Recepción de huevo</h2>
          <span className="hint" style={{ margin: 0 }}>
            Hola
            {firstName(coordinatorName) ? `, ${firstName(coordinatorName)}` : ''} · verifica y certifica los envíos de
            las granjas
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

      {/* ── Acceso directo al formato físico oficial con thumbnail ── */}
      <div className="rx-remision-banner-card" style={{ marginTop: 14 }}>
        <img
          src={remisionRefImg}
          alt="Formato oficial Antioqueña"
          className="rx-remision-banner-thumb"
        />
        <div className="rx-remision-banner-info">
          <strong>📋 Formato Oficial: Remisión Huevos Galpón (Nº 4854)</strong>
          <span className="hint">
            Consulta la imagen escaneada original de Antioqueña de Incubación S.A.S o captura el formato físico digitalmente.
          </span>
        </div>
        {onOpenRemision && (
          <button
            type="button"
            className="primary small"
            onClick={onOpenRemision}
            style={{ whiteSpace: 'nowrap' }}
          >
            📄 Ver formato e imagen
          </button>
        )}
      </div>

      {er.error && <p className="msg error">{er.error}</p>}

      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Por recibir {pending.length > 0 ? `(${pending.length})` : ''}
      </h3>
      {er.loading ? (
        <p className="hint">Cargando…</p>
      ) : pending.length === 0 ? (
        <p className="hint">No hay envíos verificados pendientes de recibir. ✅</p>
      ) : (
        <div className="admin-list">
          {pending.map((r) => {
            const t = kindTotals(r.counts)
            return (
              <div key={r.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {roomName(r.room_id)} · {fmtDate(r.report_date)}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      Reportado: Incubable {num(t.inc)} · Comercial {num(t.com)} · {farmName(r.farm_id)}
                      {r.verified_by ? ` · Verificó ${nameOf(r.verified_by)}` : ''}
                    </span>
                  </div>
                  <span className="pill status ok">Verificado</span>
                  {canCertify && certifyId !== r.id && (
                    <button className="primary small" onClick={() => setCertifyId(r.id)}>
                      Recibir
                    </button>
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
        En cuarto frío {received.length > 0 ? `(${received.length})` : ''}
      </h3>
      {received.length === 0 ? (
        <p className="hint">Aún no hay huevo certificado en el cuarto frío.</p>
      ) : (
        <div className="admin-list">
          {received.slice(0, 30).map((r) => {
            const t = kindTotals(r.received_counts ?? r.counts)
            return (
              <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
                <span>❄️</span>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>
                    {roomName(r.room_id)} · {fmtDate(r.report_date)}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    Recibido: Incubable {num(t.inc)} · Comercial {num(t.com)} · {farmName(r.farm_id)}
                    {r.received_by ? ` · ${nameOf(r.received_by)}` : ''}
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
