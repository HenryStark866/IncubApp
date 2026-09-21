/**
 * Bandeja de reportes + canal entre mÃ³dulos (completa).
 * OC / facturas / cotizaciones / solicitudes + aprobaciÃ³n gerencial.
 * Henry Stark Desarrollador
 */
import { useEffect, useMemo, useState } from 'react'
import { useSiloDispatches } from '../hooks/useSiloDispatches'
import { useNotifications } from '../shared/hooks/useNotifications'
import { PRIVACY_DOMAINS } from '../lib/privacyScopes'
import { ROLE_LABEL } from '../lib/roles'
import ExportMenu from './ExportMenu'

const KIND_OPTS = [
  { value: 'purchase_order', label: 'Orden de compra', icon: 'ðŸ›’' },
  { value: 'invoice', label: 'Factura', icon: 'ðŸ§¾' },
  { value: 'quotation', label: 'CotizaciÃ³n', icon: 'ðŸ“‹' },
  { value: 'solicitud', label: 'Solicitud a gerencia/lÃ­der', icon: 'ðŸ“¨' },
  { value: 'informe', label: 'Informe / reporte de Ã¡rea', icon: 'ðŸ“Š' },
  { value: 'novedad', label: 'Novedad', icon: 'âš ï¸' },
  { value: 'dato', label: 'Dato operativo', icon: 'ðŸ“Ž' },
  { value: 'evidencia', label: 'Evidencia / archivo', icon: 'ðŸ“·' },
  { value: 'otro', label: 'Otro', icon: 'ðŸ“„' },
]

const KIND_LABEL = Object.fromEntries(KIND_OPTS.map((k) => [k.value, k.label]))
const KIND_ICON = Object.fromEntries(KIND_OPTS.map((k) => [k.value, k.icon]))

const DISPATCH_TO_NOTIF = {
  purchase_order: 'purchase_order',
  invoice: 'invoice',
  quotation: 'quotation',
  solicitud: 'leader_request',
  informe: 'area_report',
  novedad: 'area_report',
  dato: 'area_report',
  evidencia: 'dispatch',
  otro: 'dispatch',
}

const STATUS = {
  sent: 'Pendiente',
  read: 'LeÃ­do',
  verified: 'Aprobado / verificado',
  rejected: 'Rechazado',
  archived: 'Archivado',
}

const MGMT_KINDS = new Set(['purchase_order', 'invoice', 'quotation', 'solicitud', 'informe'])
const DOC_KINDS = new Set(['purchase_order', 'invoice', 'quotation'])

function money(n, cur = 'COP') {
  if (n == null || n === '') return 'â€”'
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: cur || 'COP',
      maximumFractionDigits: 0,
    }).format(Number(n))
  } catch {
    return `${n} ${cur || ''}`
  }
}

function isImagePath(path, fileName) {
  const s = `${path || ''} ${fileName || ''}`.toLowerCase()
  return /\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)/i.test(s) || s.startsWith('data:image')
}

export default function SiloReportsPanel({
  orgId,
  userId,
  role,
  area,
  location,
  isOmniscient,
  mode = 'channel',
  onNotify,
  orgName = '',
  userName = '',
}) {
  const api = useSiloDispatches({ orgId, userId, role, area })
  // Notificaciones opcionales: si la tabla no existe, no tumba la bandeja
  const nt = useNotifications(orgId, userId, { role, area, isOmniscient })
  const isReports = mode === 'reports' || !!api?.isGerencia
  const members = Array.isArray(api?.members) ? api.members : []
  const rows = Array.isArray(api?.rows) ? api.rows : []
  const inbox = Array.isArray(api?.inbox) ? api.inbox : []
  const outbox = Array.isArray(api?.outbox) ? api.outbox : []
  const verified = Array.isArray(api?.verified) ? api.verified : []
  const stats = api?.stats || { pending: 0, verified: 0, inbox: 0, outbox: 0, pendingAmount: 0 }

  const [tab, setTab] = useState(() => (mode === 'reports' ? 'bandeja' : 'enviar'))
  const [form, setForm] = useState({
    title: '',
    body: '',
    kind: 'informe',
    toMode: 'silo',
    recipientId: '',
    recipientScope: 'gerencia',
    amount: '',
    currency: 'COP',
    vendor: '',
    reference: '',
  })
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [photos, setPhotos] = useState({})
  const [filterKind, setFilterKind] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterQ, setFilterQ] = useState('')
  const [quick, setQuick] = useState('all')
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')

  const nameOf = useMemo(() => {
    const m = Object.fromEntries(
      members.filter((x) => x?.id).map((x) => [x.id, x.name || 'Usuario'])
    )
    return (id) => m[id] || (id ? String(id).slice(0, 8) : 'â€”')
  }, [members])

  useEffect(() => {
    if (isReports) setTab((t) => (t === 'enviar' || t === 'inbox' ? 'bandeja' : t))
  }, [isReports])

  // Sincronizar detalle con filas actualizadas
  useEffect(() => {
    if (!selected?.id) return
    const fresh = rows.find((r) => r.id === selected.id)
    if (fresh && fresh.status !== selected.status) setSelected(fresh)
  }, [rows, selected?.id, selected?.status])

  const bandejaItems = useMemo(() => {
    const list = Array.isArray(rows) ? rows : []
    const inboxList = Array.isArray(inbox) ? inbox : []
    const inboxIds = new Set(inboxList.map((r) => r.id))
    const base = isReports
      ? list.filter(
          (r) =>
            MGMT_KINDS.has(r.kind) ||
            r.recipient_scope === 'gerencia' ||
            inboxIds.has(r.id)
        )
      : inboxList
    const map = new Map()
    for (const r of base) if (r?.id) map.set(r.id, r)
    let items = [...map.values()]
    items = items.filter((r) => {
      if (filterKind !== 'all' && r.kind !== filterKind) return false
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (quick === 'docs' && !DOC_KINDS.has(r.kind)) return false
      if (quick === 'pending' && !['sent', 'read'].includes(r.status)) return false
      if (quick === 'money' && r.payload?.amount == null) return false
      if (filterQ.trim()) {
        const q = filterQ.trim().toLowerCase()
        const hay =
          `${r.title || ''} ${r.body || ''} ${r.payload?.vendor || ''} ${r.payload?.reference || ''} ${KIND_LABEL[r.kind] || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return items
  }, [rows, inbox, isReports, filterKind, filterStatus, filterQ, quick])

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const mgmtDoc = ['purchase_order', 'invoice', 'quotation', 'solicitud'].includes(form.kind)
    let recipientId = form.toMode === 'person' ? form.recipientId || null : null
    let recipientScope = form.toMode === 'silo' ? form.recipientScope || null : null
    if (mgmtDoc && !recipientId) recipientScope = recipientScope || 'gerencia'

    const { error, local, warn } = await api.send({
      title: form.title,
      body: form.body,
      kind: form.kind,
      recipientId,
      recipientScope,
      photoFile: file,
      location: location || null,
      amount: form.amount,
      currency: form.currency,
      payload: {
        vendor: form.vendor?.trim() || undefined,
        reference: form.reference?.trim() || undefined,
      },
    })
    setBusy(false)
    if (error) {
      setMsg({ kind: 'error', text: error })
      return
    }
    setMsg({
      kind: 'ok',
      text: local
        ? `Guardado${warn ? ' (modo local: aplica SQL en Supabase para nube)' : ' en bandeja'}.`
        : mgmtDoc
          ? 'Enviado a gerencia.'
          : 'Enviado correctamente.',
    })
    try {
      await nt.notify({
        title: form.title,
        body: form.body?.slice(0, 160) || form.kind,
        kind: DISPATCH_TO_NOTIF[form.kind] || 'dispatch',
      })
    } catch {
      /* notif opcional */
    }
    onNotify?.({ title: form.title, kind: form.kind })
    setForm((f) => ({
      ...f,
      title: '',
      body: '',
      amount: '',
      vendor: '',
      reference: '',
    }))
    setFile(null)
    if (isReports) setTab('bandeja')
    else setTab('outbox')
  }

  const openDetail = async (row) => {
    setSelected(row)
    setNote(row.verify_note || '')
    if (row.photo_path && !photos[row.id]) {
      const url = await api.signedUrl(row.photo_path)
      if (url) setPhotos((p) => ({ ...p, [row.id]: url }))
    }
    if (row.status === 'sent' && (row.recipient_id === userId || api?.isGerencia || isOmniscient)) {
      try {
        api?.setStatus?.(row.id, 'read')
      } catch {
        /* */
      }
    }
  }

  const act = async (status) => {
    if (!selected) return
    setBusy(true)
    const { error } = await api.setStatus(selected.id, status, note || null)
    setBusy(false)
    if (error) {
      setMsg({ kind: 'error', text: error })
      return
    }
    const label =
      status === 'verified' || status === 'approved'
        ? 'Documento aprobado / verificado.'
        : status === 'rejected'
          ? 'Documento rechazado.'
          : 'Actualizado.'
    setMsg({ kind: 'ok', text: label })
    try {
      await nt.notify({
        title:
          status === 'verified' || status === 'approved'
            ? `Aprobado: ${selected.title}`
            : status === 'rejected'
              ? `Rechazado: ${selected.title}`
              : `Actualizado: ${selected.title}`,
        body: note || `${KIND_LABEL[selected.kind] || selected.kind}`,
        kind: DISPATCH_TO_NOTIF[selected.kind] || 'management',
      })
    } catch {
      /* opcional */
    }
    onNotify?.({ title: selected.title, kind: status })
    setSelected(null)
    api.reload()
  }

  const buildExportRows = (list) =>
    list.map((r) => ({
      Fecha: new Date(r.created_at).toLocaleString('es-CO'),
      Tipo: KIND_LABEL[r.kind] || r.kind,
      TÃ­tulo: r.title,
      Monto: r.payload?.amount ?? '',
      Moneda: r.payload?.currency ?? '',
      Proveedor: r.payload?.vendor ?? '',
      Referencia: r.payload?.reference ?? '',
      Estado: STATUS[r.status] || r.status,
      De: nameOf(r.sender_id),
      MÃ³dulo_origen: r.sender_scope || '',
      Para: r.recipient_id ? nameOf(r.recipient_id) : r.recipient_scope || '',
      Cuerpo: r.body || '',
      Nota: r.verify_note || '',
      Verificado: r.verified_at ? new Date(r.verified_at).toLocaleString('es-CO') : '',
      Adjunto: r.payload?.fileName || r.photo_path || '',
    }))

  const exportMeta = (title) => ({
    title,
    orgName: orgName || undefined,
    module: 'Reportes / bandeja gerencial',
    generatedBy: userName || undefined,
  })

  const canActOn = (row) =>
    (row.status === 'sent' || row.status === 'read') &&
    (api?.isGerencia ||
      row.recipient_id === userId ||
      isOmniscient ||
      (row.recipient_scope && (api?.myScopes || []).includes(row.recipient_scope)))

  const filters = (
    <div style={{ marginTop: 10 }}>
      <div className="actions row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {[
          { id: 'all', label: 'Todos' },
          { id: 'pending', label: 'Pendientes' },
          { id: 'docs', label: 'OC / Factura / Cotiz.' },
          { id: 'money', label: 'Con monto' },
        ].map((q) => (
          <button
            key={q.id}
            type="button"
            className={quick === q.id ? 'chip primary' : 'chip ghost'}
            onClick={() => setQuick(q.id)}
          >
            {q.label}
          </button>
        ))}
      </div>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Buscar
        <input
          type="search"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          placeholder="TÃ­tulo, proveedor, referenciaâ€¦"
        />
      </label>
      <div className="two-col" style={{ gap: 8 }}>
        <label>
          Tipo
          <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)}>
            <option value="all">Todos</option>
            {KIND_OPTS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.icon} {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )

  return (
    <div className={mode === 'reports' ? '' : 'card wide'}>
      {mode !== 'reports' && (
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ margin: 0 }}>Reportes y documentos</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              EnvÃ­a a un mÃ³dulo o persona. Gerencia aprueba OC, facturas y cotizaciones.
            </p>
          </div>
        </div>
      )}

      {(api?.tableMissing || api?.localMode) && (
        <p className="msg warn" style={{ marginTop: 8 }}>
          Modo local activo (tabla en nube no disponible o no migrada). Los datos se guardan en este
          dispositivo. Ejecuta en Supabase el archivo{' '}
          <strong>supabase_schema_bandeja_y_core.sql</strong> (o{' '}
          <strong>supabase_migration_dispatches_attendance.sql</strong>) y recarga.
        </p>
      )}
      {api?.error && <p className="msg error">{api.error}</p>}
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}

      <div className="exec-kpi-grid" style={{ marginTop: 12 }}>
        <div className="exec-kpi warn">
          <span className="exec-kpi-value">{stats.pending}</span>
          <span className="exec-kpi-label">Pendientes</span>
        </div>
        <div className="exec-kpi ok">
          <span className="exec-kpi-value">{stats.verified}</span>
          <span className="exec-kpi-label">Aprobados</span>
        </div>
        <div className="exec-kpi">
          <span className="exec-kpi-value">{stats.inbox}</span>
          <span className="exec-kpi-label">En bandeja</span>
        </div>
        <div className="exec-kpi">
          <span className="exec-kpi-value" style={{ fontSize: 16 }}>
            {money(stats.pendingAmount)}
          </span>
          <span className="exec-kpi-label">Monto pendiente</span>
        </div>
      </div>

      <div className="cockpit-tabs" style={{ marginTop: 12 }}>
        {(isReports || api?.isGerencia) && (
          <button
            type="button"
            className={tab === 'bandeja' ? 'cockpit-tab active' : 'cockpit-tab'}
            onClick={() => setTab('bandeja')}
          >
            Bandeja ({bandejaItems.length})
          </button>
        )}
        <button
          type="button"
          className={tab === 'enviar' ? 'cockpit-tab active' : 'cockpit-tab'}
          onClick={() => setTab('enviar')}
        >
          Enviar
        </button>
        {!isReports && (
          <button
            type="button"
            className={tab === 'inbox' ? 'cockpit-tab active' : 'cockpit-tab'}
            onClick={() => setTab('inbox')}
          >
            Recibidos ({inbox.length})
          </button>
        )}
        <button
          type="button"
          className={tab === 'outbox' ? 'cockpit-tab active' : 'cockpit-tab'}
          onClick={() => setTab('outbox')}
        >
          Enviados ({outbox.length})
        </button>
        <button
          type="button"
          className={tab === 'informes' ? 'cockpit-tab active' : 'cockpit-tab'}
          onClick={() => setTab('informes')}
        >
          Aprobados ({verified.length})
        </button>
      </div>

      {tab === 'enviar' && (
        <div className="inline-form" style={{ marginTop: 14 }}>
          <div className="two-col">
            <label>
              Tipo de documento
              <select
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value
                  const isMgmt = ['purchase_order', 'invoice', 'quotation', 'solicitud'].includes(kind)
                  setForm((f) => ({
                    ...f,
                    kind,
                    recipientScope: isMgmt ? 'gerencia' : f.recipientScope,
                    toMode: isMgmt ? 'silo' : f.toMode,
                  }))
                }}
              >
                {KIND_OPTS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.icon} {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destino
              <select
                value={form.toMode}
                onChange={(e) => setForm((f) => ({ ...f, toMode: e.target.value }))}
              >
                <option value="silo">MÃ³dulo / Ã¡rea</option>
                <option value="person">Persona</option>
              </select>
            </label>
          </div>
          {form.toMode === 'person' ? (
            <label>
              Persona
              <select
                value={form.recipientId}
                onChange={(e) => setForm((f) => ({ ...f, recipientId: e.target.value }))}
              >
                <option value="">â€” Elegir â€”</option>
                {members
                  .filter((m) => m.id && m.id !== userId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} Â· {ROLE_LABEL[m.role] || m.role}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <label>
              MÃ³dulo
              <select
                value={form.recipientScope}
                onChange={(e) => setForm((f) => ({ ...f, recipientScope: e.target.value }))}
              >
                <option value="">â€” Elegir â€”</option>
                {PRIVACY_DOMAINS.filter((d) => d.id !== 'datos').map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            TÃ­tulo / asunto
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ej. OC repuestos volteo setter 3"
            />
          </label>
          {DOC_KINDS.has(form.kind) && (
            <>
              <div className="two-col">
                <label>
                  Monto
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                  />
                </label>
                <label>
                  Moneda
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  >
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
              </div>
              <div className="two-col">
                <label>
                  Proveedor
                  <input
                    type="text"
                    value={form.vendor}
                    onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                    placeholder="Nombre o NIT del proveedor"
                  />
                </label>
                <label>
                  NÂº factura / OC / cotiz.
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="Referencia del documento"
                  />
                </label>
              </div>
            </>
          )}
          <label>
            Detalle
            <textarea
              rows={4}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="JustificaciÃ³n, proveedor, cifras, novedadesâ€¦"
              style={{ width: '100%', marginTop: 6 }}
            />
          </label>
          <label>
            Adjunto (foto o archivo)
            <input
              type="file"
              accept="image/*,.pdf,.xlsx,.xls,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && (
              <span className="hint" style={{ display: 'block', marginTop: 4 }}>
                {file.name} ({Math.round(file.size / 1024)} KB)
              </span>
            )}
          </label>
          <button type="button" className="primary" disabled={busy} onClick={submit}>
            {busy ? 'Enviandoâ€¦' : 'Enviar a bandeja'}
          </button>
        </div>
      )}

      {(tab === 'bandeja' || tab === 'inbox') && (
        <div style={{ marginTop: 12 }}>
          {filters}
          <div className="actions row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
            <button type="button" className="ghost small" onClick={() => api?.reload?.()}>
              Actualizar
            </button>
            <ExportMenu
              filename="bandeja_gerencial"
              sheets={[{ name: 'Bandeja', rows: buildExportRows(bandejaItems) }]}
              meta={exportMeta('Bandeja gerencial Â· OC / facturas / cotizaciones')}
              label="Exportar vista"
              disabled={!bandejaItems.length}
            />
          </div>
          {api?.loading ? (
            <p className="hint">Cargandoâ€¦</p>
          ) : (
            <ItemList
              items={tab === 'inbox' ? inbox : bandejaItems}
              nameOf={nameOf}
              empty="Bandeja vacÃ­a. EnvÃ­a un documento desde la pestaÃ±a Enviar."
              onOpen={openDetail}
              selectedId={selected?.id}
            />
          )}
        </div>
      )}

      {tab === 'outbox' && (
        <div style={{ marginTop: 12 }}>
          {filters}
          <ItemList
            items={outbox}
            nameOf={nameOf}
            empty="AÃºn no has enviado documentos."
            onOpen={openDetail}
            selectedId={selected?.id}
          />
        </div>
      )}

      {tab === 'informes' && (
        <div style={{ marginTop: 12 }}>
          <div className="actions row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
            <ExportMenu
              filename="documentos_aprobados"
              sheets={[{ name: 'Aprobados', rows: buildExportRows(verified) }]}
              meta={exportMeta('Documentos aprobados / verificados')}
              label="Exportar aprobados"
              disabled={!verified.length}
            />
            <button type="button" className="ghost small" onClick={() => api?.reload?.()}>
              Actualizar
            </button>
          </div>
          <ItemList
            items={verified}
            nameOf={nameOf}
            empty="No hay documentos aprobados todavÃ­a."
            onOpen={openDetail}
            selectedId={selected?.id}
          />
        </div>
      )}

      {selected && (
        <div className="tool-card" style={{ marginTop: 14 }}>
          <div className="exec-panel-head">
            <h3 className="exec-group-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {KIND_ICON[selected.kind]} {selected.title}
            </h3>
            <button type="button" className="ghost small" onClick={() => setSelected(null)}>
              Cerrar
            </button>
          </div>
          <p className="hint" style={{ margin: '0 0 8px' }}>
            {KIND_LABEL[selected.kind] || selected.kind} Â· {STATUS[selected.status] || selected.status}
            {' Â· '}
            De {nameOf(selected.sender_id)}
            {selected.payload?.amount != null && (
              <>
                {' Â· '}
                <strong>{money(selected.payload.amount, selected.payload.currency)}</strong>
              </>
            )}
          </p>
          {(selected.payload?.vendor || selected.payload?.reference) && (
            <p className="hint" style={{ margin: '0 0 8px' }}>
              {selected.payload.vendor && <>Proveedor: <strong>{selected.payload.vendor}</strong></>}
              {selected.payload.vendor && selected.payload.reference && ' Â· '}
              {selected.payload.reference && <>Ref: <strong>{selected.payload.reference}</strong></>}
            </p>
          )}
          {selected.body && (
            <p style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{selected.body}</p>
          )}
          {selected.photo_path && (
            <AttachmentPreview
              path={selected.photo_path}
              fileName={selected.payload?.fileName}
              url={photos[selected.id]}
            />
          )}
          {canActOn(selected) && (
            <>
              <label style={{ display: 'block', marginTop: 10 }}>
                Nota de aprobaciÃ³n / rechazo
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <div className="actions row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                <button type="button" className="primary" disabled={busy} onClick={() => act('verified')}>
                  Aprobar / verificar
                </button>
                <button type="button" className="ghost danger" disabled={busy} onClick={() => act('rejected')}>
                  Rechazar
                </button>
                <button type="button" className="ghost" disabled={busy} onClick={() => act('archived')}>
                  Archivar
                </button>
              </div>
            </>
          )}
          {selected.status === 'verified' && (
            <p className="msg ok" style={{ marginTop: 10 }}>
              Aprobado
              {selected.verified_at
                ? ` el ${new Date(selected.verified_at).toLocaleString('es-CO')}`
                : ''}
              {selected.verify_note ? ` Â· ${selected.verify_note}` : ''}
            </p>
          )}
          {selected.status === 'rejected' && (
            <p className="msg error" style={{ marginTop: 10 }}>
              Rechazado
              {selected.verify_note ? ` Â· ${selected.verify_note}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function AttachmentPreview({ path, fileName, url }) {
  const name = fileName || path?.split('/').pop() || 'Adjunto'
  const href = url || path
  if (!href) return null
  if (isImagePath(path, fileName) || String(href).startsWith('data:image') || String(href).startsWith('blob:')) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        <img
          src={href}
          alt={name}
          style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 10, border: '1px solid var(--line)' }}
        />
      </a>
    )
  }
  return (
    <a className="chip primary" href={href} target="_blank" rel="noreferrer" download={name}>
      ðŸ“Ž Abrir adjunto: {name}
    </a>
  )
}

function ItemList({ items, nameOf, empty, onOpen, selectedId }) {
  if (!items?.length) return <p className="exec-empty" style={{ marginTop: 12 }}>{empty}</p>
  return (
    <div className="admin-list" style={{ marginTop: 12 }}>
      {items.map((r) => (
        <div
          key={r.id}
          className="admin-row"
          style={{
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            cursor: 'pointer',
            outline: selectedId === r.id ? '2px solid var(--accent)' : undefined,
          }}
          onClick={() => onOpen?.(r)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen?.(r)}
          role="button"
          tabIndex={0}
        >
          <span style={{ fontSize: 18 }} aria-hidden>
            {KIND_ICON[r.kind] || 'ðŸ“„'}
          </span>
          <div className="admin-row-main" style={{ flex: 1, minWidth: 160 }}>
            <strong>{r.title}</strong>
            <span className="hint" style={{ margin: 0 }}>
              {KIND_LABEL[r.kind] || r.kind}
              {r.payload?.amount != null && ` Â· ${money(r.payload.amount, r.payload.currency)}`}
              {r.payload?.vendor ? ` Â· ${r.payload.vendor}` : ''}
              {' Â· '}
              {nameOf(r.sender_id)}
              {' Â· '}
              {new Date(r.created_at).toLocaleString('es-CO', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {r.photo_path ? ' Â· ðŸ“Ž' : ''}
            </span>
          </div>
          <span
            className={`pill status ${
              r.status === 'verified' ? 'ok' : r.status === 'rejected' ? 'off' : r.status === 'sent' ? 'warn' : ''
            }`}
          >
            {STATUS[r.status] || r.status}
          </span>
        </div>
      ))}
    </div>
  )
}

