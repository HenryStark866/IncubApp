/**
 * Clasificación por cinta de color + mapas Petersime + aprobación y orden de cargue.
 */

import { useEffect, useMemo, useState } from 'react'
import { useLoadClassification } from '../hooks/useLoadClassification'
import { useIncubationLots } from '../hooks/useIncubationLots'
import { useFlockLots } from '../hooks/useFlockLots'
import { flockInfoFor, FERTILITY_LABEL } from '../lib/flockLots'
import {
  TAPE_COLORS,
  TRAYS_PER_CART,
  EGGS_PER_TRAY,
  CARTS_PER_MACHINE,
  ZONE_LABEL,
  ZONE_HINT,
  entryLabel,
  tapeById,
  downloadLoadMapImage,
  buildLoadOrderText,
  buildOperatorPlacementGuide,
  cartNumberOf,
  eggsFromTrays,
  normalizeCartColor,
  readableTextOn,
  EGG_TYPES,
  resolvePostureDay,
  heatBreakdownLabel,
} from '../lib/loadMapEngine'
import { supabase } from '../lib/supabase'

const STATUS_LABEL = {
  draft: 'Borrador',
  pending_approval: 'Pendiente aprobación',
  approved: 'Aprobado',
  ordered: 'Orden enviada a operario',
  completed: 'Cargue completado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
}

function today() {
  return new Date().toLocaleDateString('sv-SE')
}

const nfEs = (n) => (n == null ? 0 : Math.round(Number(n))).toLocaleString('es-CO')
const fmtPostureDate = (v) =>
  v
    ? new Date(v + 'T00:00:00').toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      })
    : '—'

/**
 * Guía de solo lectura para el operario: qué lotes y fechas clasificar y en qué
 * orden (FIFO), según la última orden de clasificación publicada por gerencia.
 * Recibe los datos del hook ÚNICO del workspace (no monta otra suscripción).
 */
function TodayClassificationOrder({ activeOrders }) {
  const order = activeOrders?.[0]
  if (!order || !order.items?.length) return null

  const totalEggs = order.items.reduce((s, i) => s + (Number(i.eggs) || 0), 0)
  const lotCount = new Set(order.items.map((i) => i.lotId)).size

  return (
    <div
      className="card"
      style={{
        margin: '12px 0',
        padding: '12px 14px',
        border: '1px solid var(--accent, #1e88e5)',
        background: 'var(--surface-2, rgba(30,136,229,0.06))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: '1rem' }}>📋 Orden de clasificación de hoy</strong>
        <span className="pill status warn">Publicada por gerencia</span>
      </div>
      <p className="hint" style={{ margin: '6px 0 8px' }}>
        Clasifica en este orden (fecha más vieja primero). {lotCount} lote
        {lotCount === 1 ? '' : 's'} · {nfEs(totalEggs)} huevos · {order.group_count} grupo
        {order.group_count === 1 ? '' : 's'} de 12 carros.
      </p>
      <div className="admin-list">
        {order.items.map((it, i) => (
          <div key={`${it.lotId}-${it.productionDate}-${i}`} className="admin-row compact" style={{ margin: 0 }}>
            <span className="pill" style={{ minWidth: 26, justifyContent: 'center' }}>
              {i + 1}
            </span>
            <div className="admin-row-main" style={{ flex: 1 }}>
              <strong>
                {it.code}
                {it.isTreated ? ' · tratado' : ''}
              </strong>
              <span className="hint" style={{ margin: 0 }}>
                Postura {fmtPostureDate(it.productionDate)} · {nfEs(it.eggs)} huevos ·{' '}
                {Math.ceil(Number(it.carts) || 0)} carros
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LoadClassificationWorkspace({ orgId, userId, role, coordinatorName }) {
  const api = useLoadClassification(orgId, userId)
  // ÚNICA instancia del módulo Datos en este workspace: la comparten la guía
  // de la orden del día y el asistente (dos instancias = dos suscripciones y,
  // antes de uniqueChannel, colisión del canal Realtime).
  const incubation = useIncubationLots(orgId, userId)
  const flock = useFlockLots(orgId, userId)
  const [tab, setTab] = useState('clasificar')
  const [machines, setMachines] = useState([])
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [selectedMap, setSelectedMap] = useState(null)

  const canClassify = [
    'owner',
    'admin',
    'supervisor',
    'coordinator',
    'reception_operator',
    'operator',
    'auxiliary',
    'auxiliary_production',
  ].includes(role)
  // Aprueba quien clasifica: el auxiliar de producción arma el mapa y decide si
  // quedó bien (pedido 2026-09-15). Antes solo aprobaba coordinación, y eso
  // dejaba el mapa esperando a alguien que no estaba en la sala.
  const canApprove =
    ['owner', 'admin', 'supervisor', 'auxiliary_production'].includes(role) || (role === 'coordinator' && true) // coordinador de planta / general
  const canOrder = canApprove
  const isOperator = ['operator', 'auxiliary', 'auxiliary_production', 'reception_operator'].includes(role)

  useEffect(() => {
    if (!orgId) return
    ;(async () => {
      const plants = await supabase.from('plants').select('id').eq('org_id', orgId)
      const ids = (plants.data || []).map((p) => p.id)
      if (!ids.length) {
        setMachines([])
        return
      }
      const m = await supabase
        .from('machines')
        .select('id, name, code, type, plant_id, status')
        .in('plant_id', ids)
        .in('type', ['setter', 'combo'])
      setMachines((m.data || []).filter((x) => x.status !== 'decommissioned'))
    })()
  }, [orgId])

  const pendingMaps = useMemo(() => api.maps.filter((m) => m.status === 'pending_approval'), [api.maps])
  const approvedMaps = useMemo(() => api.maps.filter((m) => m.status === 'approved'), [api.maps])
  const orderedMaps = useMemo(() => api.maps.filter((m) => m.status === 'ordered'), [api.maps])

  // Operario: priorizar órdenes
  useEffect(() => {
    if (isOperator && orderedMaps.length) setTab('ordenes')
  }, [isOperator, orderedMaps.length])

  return (
    <div className="card wide load-class-ws">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>Clasificación y mapa de cargue</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Cintas de color · carros Petersime (12) · aprobación coordinación · orden a operario
            {api.localMode ? ' · datos en este dispositivo' : ''}
          </p>
        </div>
        <span className="pill live">
          <span className="dot" /> En vivo
        </span>
      </div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{api.available.length}</span>
          <span className="kpi-label">Carros listos</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{(api.summary.totalEggs || 0).toLocaleString('es-CO')}</span>
          <span className="kpi-label">Huevos clasificados</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{api.summary.lots?.length || 0}</span>
          <span className="kpi-label">Lotes</span>
        </div>
        <div className={`kpi-card${pendingMaps.length ? ' warn' : ''}`}>
          <span className="kpi-value">{pendingMaps.length}</span>
          <span className="kpi-label">Mapas por aprobar</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{orderedMaps.length}</span>
          <span className="kpi-label">Órdenes activas</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value" style={{ fontSize: '1rem' }}>
            {EGGS_PER_TRAY} / {TRAYS_PER_CART}
          </span>
          <span className="kpi-label">Huevos/bandeja · band./carro</span>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        {[
          { id: 'clasificar', label: 'Clasificar' },
          { id: 'resumen', label: 'Lotes y fechas' },
          {
            id: 'mapas',
            label: `Mapas${pendingMaps.length ? ` (${pendingMaps.length})` : ''}`,
          },
          {
            id: 'ordenes',
            label: `Órdenes${orderedMaps.length ? ` (${orderedMaps.length})` : ''}`,
          },
        ].map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`msg ${msg.kind === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 10 }}>
          {msg.text}
        </p>
      )}
      {api.error && <p className="msg error">{api.error}</p>}

      {tab === 'clasificar' && <TodayClassificationOrder activeOrders={incubation.activeOrders} />}

      {tab === 'clasificar' && (
        <ClassifyTab
          canClassify={canClassify}
          api={api}
          incubation={incubation}
          flockRegistry={flock.registry}
          busy={busy}
          setBusy={setBusy}
          setMsg={setMsg}
          machines={machines}
          onGenerated={(map) => {
            if (map) setSelectedMap(map)
            setTab('mapas')
          }}
        />
      )}

      {tab === 'resumen' && (
        <SummaryTab summary={api.summary} entries={api.available} flock={flock} canEdit={canApprove} />
      )}

      {tab === 'mapas' && (
        <MapsTab
          maps={api.maps}
          canApprove={canApprove}
          canOrder={canOrder}
          busy={busy}
          setBusy={setBusy}
          setMsg={setMsg}
          selectedMap={selectedMap}
          setSelectedMap={setSelectedMap}
          onApprove={async (id) => {
            setBusy(true)
            const r = await api.approveMap(id)
            setBusy(false)
            setMsg(
              r.error
                ? { kind: 'error', text: r.error }
                : {
                    kind: 'ok',
                    text: r.asignada
                      ? `Mapa aprobado y asignado a ${r.asignada}. Ya puede enviarse la orden de cargue al operario.`
                      : 'Mapa aprobado. Ya puede enviarse la orden de cargue al operario.',
                  },
            )
          }}
          onReject={async (id) => {
            const reason = window.prompt('Motivo del rechazo (opcional):') || ''
            setBusy(true)
            const r = await api.rejectMap(id, reason)
            setBusy(false)
            setMsg(
              r.error
                ? { kind: 'error', text: r.error }
                : {
                    kind: 'ok',
                    text: 'Mapa rechazado. Carros liberados para rearmar.',
                  },
            )
          }}
          onOrder={async (id) => {
            setBusy(true)
            const r = await api.orderLoad(id)
            setBusy(false)
            setMsg(
              r.error
                ? { kind: 'error', text: r.error }
                : {
                    kind: 'ok',
                    text: 'Orden de cargue enviada al operario en turno.',
                  },
            )
            setTab('ordenes')
          }}
          coordinatorName={coordinatorName}
        />
      )}

      {tab === 'ordenes' && (
        <OrdersTab
          maps={[...orderedMaps, ...approvedMaps, ...api.maps.filter((m) => m.status === 'completed')]}
          machines={machines}
          canOrder={canOrder}
          isOperator={isOperator || canOrder}
          busy={busy}
          setBusy={setBusy}
          setMsg={setMsg}
          onComplete={async (id, extraData) => {
            setBusy(true)
            const r = await api.completeLoad(id, extraData)
            setBusy(false)
            setMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: 'Cargue marcado como completado.' })
          }}
          onOrder={async (id) => {
            setBusy(true)
            const r = await api.orderLoad(id)
            setBusy(false)
            setMsg(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: 'Orden enviada.' })
          }}
        />
      )}
    </div>
  )
}

/* ─── Clasificar ─────────────────────────────────────────── */

const EMPTY_LOT = () => ({
  kind: 'normal', // normal | doble | tratado
  lot: '',
  colorPrimary: 'rojo',
  colorSecondary: '',
  trays: String(TRAYS_PER_CART),
  productionDate: today(),
  weightKg: '',
  eggType: '',
})

/** Convierte el formulario de un lote al payload que espera el hook */
function lotPayload(l) {
  return {
    isTreated: l.kind === 'tratado',
    lot: l.lot,
    colorPrimary: l.kind === 'tratado' ? null : l.colorPrimary,
    colorSecondary: l.kind === 'doble' && l.colorSecondary ? l.colorSecondary : null,
    trays: Number(l.trays) || 0,
    productionDate: l.kind === 'tratado' ? l.productionDate || null : l.productionDate,
    weightKg: l.weightKg === '' ? null : Number(l.weightKg),
    eggType: l.eggType === '' || l.eggType == null ? null : Number(l.eggType),
  }
}

function ClassifyTab({ canClassify, api, incubation, flockRegistry, busy, setBusy, setMsg, machines, onGenerated }) {
  // Modo de captura: asistente paso a paso (recomendado) o formulario completo.
  const [mode, setMode] = useState('guiado')
  // Carro en construcción: número y lista de lotes.
  // El color NO se elige aquí: se asigna por CARGUE de 12 en la cola de carros.
  const [cartNo, setCartNo] = useState('')
  const [notes, setNotes] = useState('')
  const [lots, setLots] = useState([EMPTY_LOT()])
  const [machineId, setMachineId] = useState('')
  const [groupIndex, setGroupIndex] = useState(0)

  // Si el cargue seleccionado desaparece (p. ej. tras generar su mapa y
  // reducirse la cola de carros), el índice queda apuntando a un cargue
  // inexistente: `groups[groupIndex]` da undefined y el mapa no se puede
  // generar sin que se note por qué. Se corrige solo al primer cargue válido.
  useEffect(() => {
    const groups = api.groups || []
    if (groupIndex > 0 && !groups[groupIndex]) setGroupIndex(0)
  }, [api.groups, groupIndex])

  const setLot = (i, k, v) => setLots((list) => list.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const addLot = () => setLots((list) => [...list, EMPTY_LOT()])
  const removeLot = (i) => setLots((list) => (list.length > 1 ? list.filter((_, idx) => idx !== i) : list))

  const totalTrays = lots.reduce((s, l) => s + (Number(l.trays) || 0), 0)
  const totalEggs = eggsFromTrays(totalTrays)
  const overCapacity = totalTrays > TRAYS_PER_CART

  const resetCart = () => {
    setLots([EMPTY_LOT()])
    setNotes('')
    setCartNo('')
  }

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    const raw = String(cartNo || '').trim()
    if (!raw) {
      setBusy(false)
      setMsg({
        kind: 'error',
        text: 'Indique el número del carro (lo verá el operario en el mapa).',
      })
      return
    }
    const numMatch = raw.match(/(\d+)/)
    const payload = {
      cartNumber: numMatch ? numMatch[1] : raw,
      cartLabel: raw.toLowerCase().startsWith('c') || raw.toLowerCase().includes('carro') ? raw : `Carro ${raw}`,
      notes,
      lots: lots.map(lotPayload),
    }
    const res = await api.addEntry(payload)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({
        kind: 'ok',
        text: `Carro ${cartNumberOf(res.entry)} registrado · ${res.entry.lotCount} lote(s) · ${res.entry.eggs.toLocaleString('es-CO')} huevos`,
      })
      resetCart()
    }
  }

  const genMap = async (submitForApproval) => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      if (!api.available?.length) {
        setMsg({
          kind: 'error',
          text: 'No hay carros disponibles. Registre al menos un carro clasificado antes de generar el mapa.',
        })
        return
      }
      const groupsNow = api.groups || []
      const g = groupsNow[groupIndex]
      if (!g?.carts?.length) {
        setMsg({
          kind: 'error',
          text: 'El cargue seleccionado está vacío. Elija otro cargue o registre más carros.',
        })
        return
      }
      const m = machines.find((x) => x.id === machineId)
      const res = await api.generateMap({
        machineId: machineId || null,
        machineName: m ? `${m.name}${m.code ? ` (${m.code})` : ''}` : 'Petersime 12 carros',
        plantId: m?.plant_id || null,
        submitForApproval,
        groupIndex,
        flockRegistry,
      })
      if (res.error) {
        setMsg({ kind: 'error', text: res.error })
        return
      }
      if (!res.map) {
        setMsg({
          kind: 'error',
          text: 'No se obtuvo el mapa. Intente de nuevo.',
        })
        return
      }
      const warns = res.map?.balance?.warnings || []
      setMsg({
        kind: warns.length ? 'error' : 'ok',
        text: submitForApproval
          ? `Mapa del cargue ${groupIndex + 1} enviado al coordinador.${warns.length ? ` ⚠ ${warns[0]}` : ' Carga balanceada.'}`
          : `Borrador del cargue ${groupIndex + 1} listo · ${(res.map.summary?.totalEggs || 0).toLocaleString('es-CO')} huevos · ${res.map.summary?.cartCount || g.carts.length} carros.${warns.length ? ` ⚠ ${warns[0]}` : ''}`,
      })
      onGenerated?.(res.map)
    } catch (e) {
      console.error(e)
      setMsg({
        kind: 'error',
        text: e?.message || 'Error inesperado al generar el mapa',
      })
    } finally {
      setBusy(false)
    }
  }

  const groups = api.groups || []
  const activeGroup = groups[groupIndex]

  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint">
        Un <strong>carro</strong> puede llevar <strong>uno o varios lotes</strong> (mitad y mitad, mezclas o tratados).
        Cada lote: bandejas ({EGGS_PER_TRAY} huevos c/u; carro = {TRAYS_PER_CART} bandejas), fecha, nº de lote y cinta
        de color — el número del lote se ve <strong>en el color de su cinta</strong>. Los carros se agrupan en{' '}
        <strong>cargues de {CARTS_PER_MACHINE}</strong> y el encargado le asigna{' '}
        <strong>un color a cada cargue completo</strong> para diferenciarlos en cuarto frío.
      </p>

      {canClassify && (
        <div className="tabs" role="tablist" style={{ marginTop: 10 }}>
          <button type="button" className={mode === 'guiado' ? 'tab active' : 'tab'} onClick={() => setMode('guiado')}>
            🧭 Paso a paso (recomendado)
          </button>
          <button
            type="button"
            className={mode === 'completo' ? 'tab active' : 'tab'}
            onClick={() => setMode('completo')}
          >
            Formulario completo
          </button>
        </div>
      )}

      {canClassify && mode === 'guiado' && (
        <CartWizard api={api} incubation={incubation} busy={busy} setBusy={setBusy} setMsg={setMsg} />
      )}

      {canClassify && mode === 'completo' && (
        <div className="inline-form" style={{ marginTop: 10 }}>
          <label style={{ display: 'block', marginBottom: 12 }}>
            Nº del carro (Seleccione del 1 al 12)
            <div
              className="cart-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 8,
                marginTop: 6,
                maxWidth: 450,
              }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
                const inUse = api.entries.some(
                  (c) =>
                    String(c.cartNumber) === String(n) && ['available', 'reserved'].includes(c.status || 'available'),
                )
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCartNo(String(n))}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border:
                        String(cartNo) === String(n)
                          ? '2px solid var(--accent, #e67e22)'
                          : '1px solid var(--line, #9993)',
                      background:
                        String(cartNo) === String(n)
                          ? 'var(--accent, #e67e22)'
                          : inUse
                            ? 'var(--bg-3, rgba(230,126,34,0.15))'
                            : 'transparent',
                      color: String(cartNo) === String(n) ? '#fff' : 'inherit',
                      fontWeight: 'bold',
                      fontSize: '1rem',
                      cursor: 'pointer',
                    }}
                  >
                    {n} {inUse ? '•' : ''}
                  </button>
                )
              })}
            </div>
          </label>

          <div
            className="cart-preview"
            style={{
              background: 'var(--bg-2)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
            }}
          >
            <strong>CARRO {cartNo || '—'}</strong>
            <span>
              {lots.length} lote(s):{' '}
              {lots.map((l, i) => (
                <LotChip
                  key={i}
                  lot={l.lot || '?'}
                  colorId={l.kind === 'tratado' ? null : l.colorPrimary}
                  treated={l.kind === 'tratado'}
                />
              ))}{' '}
              · {totalTrays} band. · {totalEggs.toLocaleString('es-CO')} huevos
            </span>
          </div>

          <h4 className="section-title" style={{ margin: '14px 0 6px' }}>
            Lotes dentro del carro
          </h4>

          {lots.map((l, i) => (
            <div key={i} className="lot-editor">
              <div className="lot-editor-head">
                <strong>Lote {i + 1}</strong>
                <div className="tabs" style={{ margin: 0 }}>
                  {[
                    { id: 'normal', label: 'Cinta' },
                    { id: 'doble', label: 'Mitad y mitad' },
                    { id: 'tratado', label: 'Tratado' },
                  ].map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className={l.kind === k.id ? 'tab active' : 'tab'}
                      onClick={() => setLot(i, 'kind', k.id)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                {lots.length > 1 && (
                  <button type="button" className="ghost small" onClick={() => removeLot(i)} title="Quitar lote">
                    ✕
                  </button>
                )}
              </div>

              <div className="two-col">
                <label>
                  Nº de lote
                  <input value={l.lot} onChange={(e) => setLot(i, 'lot', e.target.value)} placeholder="Ej. 41" />
                </label>
                <label>
                  {l.kind === 'tratado' ? 'Fecha (opcional)' : 'Fecha de producción'}
                  <input
                    type="date"
                    value={l.productionDate}
                    onChange={(e) => setLot(i, 'productionDate', e.target.value)}
                  />
                </label>
              </div>

              {l.kind !== 'tratado' && (
                <div className="two-col">
                  <label>
                    Color de cinta del lote
                    <select
                      value={l.colorPrimary}
                      onChange={(e) => {
                        const id = e.target.value
                        const t = tapeById(id)
                        setLots((list) =>
                          list.map((x, idx) =>
                            idx === i
                              ? {
                                  ...x,
                                  colorPrimary: id,
                                  lot: x.lot || t.lotDefault || x.lot,
                                }
                              : x,
                          ),
                        )
                      }}
                    >
                      {TAPE_COLORS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                          {c.lotDefault ? ` → lote ${c.lotDefault}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {l.kind === 'doble' && (
                    <label>
                      Segundo color (mitad)
                      <select value={l.colorSecondary} onChange={(e) => setLot(i, 'colorSecondary', e.target.value)}>
                        <option value="">— Elija —</option>
                        {TAPE_COLORS.filter((c) => c.id !== l.colorPrimary).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              <div className="two-col">
                <label>
                  Bandejas
                  <input
                    type="number"
                    min="0"
                    max={TRAYS_PER_CART}
                    value={l.trays}
                    onChange={(e) => setLot(i, 'trays', e.target.value)}
                  />
                </label>
                <label>
                  Huevos (auto × {EGGS_PER_TRAY})
                  <input type="text" readOnly value={eggsFromTrays(l.trays).toLocaleString('es-CO')} />
                </label>
              </div>

              <div className="two-col">
                <label>
                  Tipo de huevo (1–5)
                  <select value={l.eggType} onChange={(e) => setLot(i, 'eggType', e.target.value)}>
                    <option value="">— Sin tipo —</option>
                    {EGG_TYPES.map((t) => (
                      <option key={t} value={t}>
                        Tipo {t}
                      </option>
                    ))}
                  </select>
                </label>
                {l.kind !== 'tratado' ? (
                  <label>
                    Peso 2 cubetas (kg del lote)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.weightKg}
                      onChange={(e) => setLot(i, 'weightKg', e.target.value)}
                      placeholder="Ej. 12.4"
                    />
                  </label>
                ) : (
                  <span />
                )}
              </div>
            </div>
          ))}

          <div className="actions row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <button type="button" className="ghost" onClick={addLot}>
              + Agregar otro lote a este carro
            </button>
          </div>

          {overCapacity && (
            <p className="msg error" style={{ marginTop: 8 }}>
              El carro suma {totalTrays} bandejas y el máximo es {TRAYS_PER_CART}. Reparta en otro carro.
            </p>
          )}

          <label style={{ marginTop: 8 }}>
            Notas del carro
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <p className="hint" style={{ margin: '0 0 8px' }}>
            El operario solo mira: <strong>nº y color del carro → posición en la máquina</strong>.
          </p>

          <div className="actions row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="primary"
              disabled={busy || !String(cartNo || '').trim() || lots.some((l) => !l.lot) || overCapacity}
              onClick={submit}
            >
              {busy ? 'Guardando…' : `Registrar carro (${lots.length} lote${lots.length === 1 ? '' : 's'})`}
            </button>
          </div>
        </div>
      )}

      <CartQueue api={api} setMsg={setMsg} />

      <div
        className="card"
        style={{
          marginTop: 16,
          padding: 12,
          border: '1px dashed var(--line, #ccc)',
        }}
      >
        <h3 className="section-title" style={{ margin: '0 0 8px' }}>
          Generar mapa de cargue (Petersime · {CARTS_PER_MACHINE} carros)
        </h3>
        <p className="hint" style={{ marginTop: 0 }}>
          Norma térmica Petersime (columnas simétricas): fechas viejas → <strong>Centro</strong> (menos calor) ·
          intermedias → <strong>Paredes</strong> · nuevas → <strong>Serpentín</strong> (junto al ventilador). La máquina
          se carga pareja a lado y lado.
        </p>

        {groups.length > 1 && (
          <label>
            Cargue a armar (cada uno = {CARTS_PER_MACHINE} carros)
            <select value={groupIndex} onChange={(e) => setGroupIndex(Number(e.target.value))}>
              {groups.map((g, i) => (
                <option key={i} value={i}>
                  Cargue {i + 1} · {g.carts.length} carro(s) · {g.totalEggs.toLocaleString('es-CO')} huevos
                  {g.complete ? '' : ' (incompleto)'}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Incubadora (opcional)
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">— Petersime genérica —</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.code ? `(${m.code})` : ''}
              </option>
            ))}
          </select>
        </label>
        {!groups.length && (
          <p className="msg error" style={{ marginTop: 8 }}>
            No hay carros en cola. Primero registre carros en el formulario de arriba.
          </p>
        )}
        {activeGroup && (
          <p className="hint" style={{ margin: '8px 0' }}>
            Cargue {groupIndex + 1}: <strong>{activeGroup.carts.length}</strong> carro(s) ·{' '}
            <strong>{(activeGroup.totalEggs || 0).toLocaleString('es-CO')}</strong> huevos
            {activeGroup.complete ? ' · completo (12)' : ' · incompleto (faltan carros)'}
          </p>
        )}
        <div className="actions row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="ghost"
            disabled={busy || !activeGroup?.carts?.length}
            onClick={() => genMap(false)}
          >
            {busy ? 'Generando…' : 'Generar borrador'}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !activeGroup?.carts?.length}
            onClick={() => genMap(true)}
          >
            {busy ? 'Generando…' : 'Generar y enviar a coordinador'}
          </button>
        </div>
        {activeGroup && !activeGroup.complete && (
          <p className="hint" style={{ marginTop: 8 }}>
            Este cargue tiene {activeGroup.carts.length} carro(s); el mapa dejará posiciones vacías hasta completar 12.
            Petersime desaconseja iniciar el ciclo sin carga completa.
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Asistente paso a paso (captura guiada, a prueba de errores) ── */

const WIZ_STEPS = ['Carro', 'Lotes', 'Fechas', 'Tipo de huevo', 'Registrar']

/** Botón-chip táctil del asistente */
function WizChip({ selected, disabled, onClick, children, title, big }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: big ? '14px 18px' : '10px 14px',
        borderRadius: 12,
        border: selected ? '2px solid var(--accent, #e67e22)' : '1px solid var(--line, #9993)',
        background: selected ? 'var(--accent, #e67e22)' : 'transparent',
        color: selected ? '#fff' : 'inherit',
        fontWeight: selected ? 700 : 500,
        fontSize: big ? '1.05rem' : '0.95rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        minWidth: big ? 54 : undefined,
        lineHeight: 1.2,
      }}
    >
      {children}
    </button>
  )
}

/** Cinta sugerida para un lote conocido (lote 41 → rojo, etc.) */
function autoTapeFor(code) {
  const t = TAPE_COLORS.find((c) => c.lotDefault && c.lotDefault === String(code).trim())
  return t ? t.id : 'otro'
}

/**
 * Asistente de clasificación en 5 pasos: carro → lotes → fechas (solo el día
 * del mes, nunca futuras) → tipo de huevo (1–5) → confirmar y registrar.
 * Todo se elige con chips; solo se digita el nº de carro (y lotes no listados).
 */
function CartWizard({ api, incubation, busy, setBusy, setMsg }) {
  const { lots: catalogLots, activeOrders } = incubation

  const [step, setStep] = useState(0)
  const [cartNo, setCartNo] = useState('')
  const [lotCount, setLotCount] = useState(1)
  const [picked, setPicked] = useState([]) // [{ code, isTreated, postures }]
  const [manualLot, setManualLot] = useState('')
  const [dateCounts, setDateCounts] = useState({}) // code → nº de fechas
  const [daysByLot, setDaysByLot] = useState({}) // code → [día,…]
  const [typeByLot, setTypeByLot] = useState({}) // code → 1..5
  const [traysBySeg, setTraysBySeg] = useState({}) // "code|iso" → bandejas
  const [colorByLot, setColorByLot] = useState({}) // code → id de cinta
  const [notes, setNotes] = useState('')

  /** Lotes que el usuario puede tocar: primero los de la orden del día (FIFO), luego el resto activo. */
  const knownLots = useMemo(() => {
    const seen = new Set()
    const list = []
    const byId = new Map((catalogLots || []).map((l) => [l.id, l]))
    for (const it of activeOrders?.[0]?.items || []) {
      const code = String(it.code || '').trim()
      if (!code || seen.has(code)) continue
      seen.add(code)
      const cat = byId.get(it.lotId)
      list.push({
        code,
        isTreated: !!(it.isTreated || cat?.is_treated),
        postures: cat?.postures || [],
        fromOrder: true,
      })
    }
    for (const l of catalogLots || []) {
      const code = String(l.code || '').trim()
      if (!code || seen.has(code)) continue
      if (['completed', 'done', 'cancelled', 'archived'].includes(l.status)) continue
      seen.add(code)
      list.push({
        code,
        isTreated: !!l.is_treated,
        postures: l.postures || [],
        fromOrder: false,
      })
    }
    return list
  }, [catalogLots, activeOrders])

  const cartNoClean = String(cartNo || '').trim()
  const dupCart = useMemo(
    () =>
      !!cartNoClean &&
      api.available.some((c) => {
        const m = cartNoClean.match(/(\d+)/)
        return String(c.cartNumber) === String(m ? m[1] : cartNoClean)
      }),
    [api.available, cartNoClean],
  )

  /** Días de postura ya registrados en el módulo Datos → chips sugeridos */
  const suggestedDaysOf = (lot) => {
    const days = new Set()
    for (const p of lot.postures || []) {
      if (!p?.productionDate) continue
      const day = Number(String(p.productionDate).slice(8, 10))
      const r = resolvePostureDay(day)
      if (r && r.iso === p.productionDate) days.add(day)
    }
    return days
  }

  const togglePick = (lot) => {
    setPicked((prev) => {
      const exists = prev.some((p) => p.code === lot.code)
      if (exists) {
        setDaysByLot((d) => ({ ...d, [lot.code]: [] }))
        return prev.filter((p) => p.code !== lot.code)
      }
      if (prev.length >= lotCount) return prev
      return [...prev, lot]
    })
  }

  const addManualLot = () => {
    const code = manualLot.trim()
    if (!code) return
    if (picked.some((p) => p.code === code)) {
      setManualLot('')
      return
    }
    if (picked.length >= lotCount) {
      setMsg({
        kind: 'error',
        text: `Ya eligió ${lotCount} lote(s). Aumente la cantidad o quite uno.`,
      })
      return
    }
    setPicked((prev) => [...prev, { code, isTreated: false, postures: [], manual: true }])
    setManualLot('')
  }

  const setLotCountSafe = (n) => {
    setLotCount(n)
    setPicked((prev) => prev.slice(0, n))
  }

  const toggleDay = (code, day) => {
    setDaysByLot((prev) => {
      const cur = prev[code] || []
      if (cur.includes(day)) return { ...prev, [code]: cur.filter((d) => d !== day) }
      const max = dateCounts[code] || 1
      if (cur.length >= max) return prev
      return { ...prev, [code]: [...cur, day] }
    })
  }

  const setDateCount = (code, n) => {
    setDateCounts((prev) => ({ ...prev, [code]: n }))
    setDaysByLot((prev) => ({
      ...prev,
      [code]: (prev[code] || []).slice(0, n),
    }))
  }

  /** Segmentos lote × fecha, ordenados por fecha (más vieja primero) */
  const segments = useMemo(() => {
    const segs = []
    for (const p of picked) {
      const resolved = (daysByLot[p.code] || [])
        .map((d) => resolvePostureDay(d))
        .filter(Boolean)
        .sort((a, b) => (a.iso < b.iso ? -1 : 1))
      for (const r of resolved) segs.push({ key: `${p.code}|${r.iso}`, lot: p, resolved: r })
    }
    return segs
  }, [picked, daysByLot])

  const stepOk = [
    !!cartNoClean,
    picked.length === lotCount,
    picked.length > 0 && picked.every((p) => (daysByLot[p.code] || []).length === (dateCounts[p.code] || 1)),
    picked.every((p) => !!typeByLot[p.code]),
    true,
  ]

  /** Al entrar a Registrar: repartir las 16 bandejas entre segmentos y sugerir cintas */
  const goConfirm = () => {
    const n = segments.length || 1
    const per = Math.floor(TRAYS_PER_CART / n)
    const rem = TRAYS_PER_CART - per * n
    const map = {}
    segments.forEach((s, i) => {
      map[s.key] = traysBySeg[s.key] ?? per + (i < rem ? 1 : 0)
    })
    setTraysBySeg(map)
    setColorByLot((prev) => {
      const next = { ...prev }
      for (const p of picked) if (!next[p.code]) next[p.code] = autoTapeFor(p.code)
      return next
    })
    setStep(4)
  }

  const totalTrays = segments.reduce((s, seg) => s + (Number(traysBySeg[seg.key]) || 0), 0)
  const totalEggs = eggsFromTrays(totalTrays)
  const overCapacity = totalTrays > TRAYS_PER_CART

  const reset = () => {
    setStep(0)
    setCartNo('')
    setLotCount(1)
    setPicked([])
    setManualLot('')
    setDateCounts({})
    setDaysByLot({})
    setTypeByLot({})
    setTraysBySeg({})
    setColorByLot({})
    setNotes('')
  }

  const register = async () => {
    setBusy(true)
    setMsg(null)
    const numMatch = cartNoClean.match(/(\d+)/)
    const num = numMatch ? numMatch[1] : cartNoClean
    const lots = segments.map((s) => ({
      kind: s.lot.isTreated ? 'tratado' : 'normal',
      isTreated: s.lot.isTreated,
      lot: s.lot.code,
      colorPrimary: s.lot.isTreated ? null : colorByLot[s.lot.code] || 'otro',
      colorSecondary: null,
      trays: Number(traysBySeg[s.key]) || 0,
      productionDate: s.resolved.iso,
      weightKg: null,
      eggType: typeByLot[s.lot.code] || null,
    }))
    const res = await api.addEntry({
      cartNumber: num,
      cartLabel: `Carro ${num}`,
      notes,
      lots,
    })
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({
        kind: 'ok',
        text: `✅ Carro ${cartNumberOf(res.entry)} registrado · ${res.entry.lotCount} lote(s) · ${res.entry.eggs.toLocaleString('es-CO')} huevos. Puede clasificar el siguiente carro.`,
      })
      reset()
    }
  }

  const dayGrid = (lot) => {
    const chosen = daysByLot[lot.code] || []
    const max = dateCounts[lot.code] || 1
    const suggested = suggestedDaysOf(lot)
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))',
          gap: 6,
          marginTop: 8,
        }}
      >
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
          const r = resolvePostureDay(day)
          const selected = chosen.includes(day)
          const disabled = !r || (!selected && chosen.length >= max)
          return (
            <WizChip
              key={day}
              selected={selected}
              disabled={disabled}
              onClick={() => toggleDay(lot.code, day)}
              title={r ? `Día ${day} = ${r.label}` : `El día ${day} no existe en el mes que corresponde`}
            >
              <span style={{ display: 'block', fontSize: '1.05rem' }}>
                {day}
                {suggested.has(day) ? ' ●' : ''}
              </span>
              <span style={{ display: 'block', fontSize: '0.65rem', opacity: 0.8 }}>{r ? r.label : '—'}</span>
            </WizChip>
          )
        })}
      </div>
    )
  }

  return (
    <div className="inline-form" style={{ marginTop: 10 }}>
      {/* Progreso */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {WIZ_STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => i < step && setStep(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              border: 'none',
              background: i === step ? 'var(--accent, #e67e22)' : i < step ? 'var(--accent-dim, #b85c14)' : '#9993',
              color: i <= step ? '#fff' : 'inherit',
              fontWeight: i === step ? 700 : 500,
              fontSize: '0.8rem',
              cursor: i < step ? 'pointer' : 'default',
            }}
            title={i < step ? 'Volver a este paso' : undefined}
          >
            {i < step ? '✓' : i + 1} {s}
          </button>
        ))}
      </div>

      {/* Resumen vivo del carro en construcción */}
      <div
        className="cart-preview"
        style={{
          background: 'var(--bg-2)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
          marginTop: 8,
        }}
      >
        <strong>CARRO {cartNoClean || '—'}</strong>
        <span>
          {picked.length
            ? picked.map((p) => (
                <LotChip
                  key={p.code}
                  lot={p.code}
                  colorId={p.isTreated ? null : colorByLot[p.code] || autoTapeFor(p.code)}
                  treated={p.isTreated}
                  eggType={typeByLot[p.code]}
                />
              ))
            : 'sin lotes aún'}
          {segments.length ? ` · ${segments.length} fecha(s)` : ''}
          {step === 4 ? ` · ${totalTrays} band. · ${totalEggs.toLocaleString('es-CO')} huevos` : ''}
        </span>
      </div>

      {/* Paso 1: carro */}
      {step === 0 && (
        <>
          <h4 className="section-title" style={{ margin: '12px 0 4px' }}>
            1 · Seleccione el carro a clasificar (disponibles del 1 al 12)
          </h4>
          <div
            className="cart-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 10,
              marginTop: 8,
              maxWidth: 450,
            }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
              const inUse = api.entries.some(
                (c) =>
                  String(c.cartNumber) === String(n) && ['available', 'reserved'].includes(c.status || 'available'),
              )
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCartNo(String(n))}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border:
                      String(cartNo) === String(n)
                        ? '2px solid var(--accent, #e67e22)'
                        : '1px solid var(--line, #9993)',
                    background:
                      String(cartNo) === String(n)
                        ? 'var(--accent, #e67e22)'
                        : inUse
                          ? 'var(--bg-3, rgba(230,126,34,0.15))'
                          : 'transparent',
                    color: String(cartNo) === String(n) ? '#fff' : 'inherit',
                    fontWeight: 'bold',
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  <span>{n}</span>
                  <span
                    style={{
                      fontSize: '0.6rem',
                      fontWeight: 'normal',
                      color:
                        String(cartNo) === String(n)
                          ? '#fff'
                          : inUse
                            ? 'var(--accent, #e67e22)'
                            : 'var(--text-dim, #888)',
                    }}
                  >
                    {inUse ? 'En cola' : 'Libre'}
                  </span>
                </button>
              )
            })}
          </div>
          {dupCart && (
            <p className="msg error" style={{ margin: '6px 0 0' }}>
              El carro {cartNoClean} ya está registrado y disponible. Use otro número o edítelo en la cola de abajo.
            </p>
          )}
        </>
      )}

      {/* Paso 2: lotes */}
      {step === 1 && (
        <>
          <h4 className="section-title" style={{ margin: '12px 0 4px' }}>
            2 · ¿Cuántos lotes lleva el carro {cartNoClean}?
          </h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4].map((n) => (
              <WizChip key={n} big selected={lotCount === n} onClick={() => setLotCountSafe(n)}>
                {n}
              </WizChip>
            ))}
          </div>
          <h4 className="section-title" style={{ margin: '14px 0 4px' }}>
            Toque {lotCount === 1 ? 'el lote' : `los ${lotCount} lotes`} ({picked.length}/{lotCount})
          </h4>
          {!knownLots.length && (
            <p className="hint" style={{ margin: '4px 0' }}>
              No hay lotes activos en el módulo Datos. Escriba el número del lote abajo.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {knownLots.map((l) => {
              const selected = picked.some((p) => p.code === l.code)
              return (
                <WizChip
                  key={l.code}
                  big
                  selected={selected}
                  disabled={!selected && picked.length >= lotCount}
                  onClick={() => togglePick(l)}
                  title={l.fromOrder ? 'Está en la orden de clasificación de hoy' : 'Lote activo'}
                >
                  {l.fromOrder ? '📋 ' : ''}Lote {l.code}
                  {l.isTreated ? ' · TRAT.' : ''}
                </WizChip>
              )
            })}
            {picked
              .filter((p) => p.manual)
              .map((p) => (
                <WizChip key={p.code} big selected onClick={() => togglePick(p)}>
                  Lote {p.code}
                </WizChip>
              ))}
          </div>
          <div className="actions row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
            <label style={{ margin: 0 }}>
              ¿Otro lote? Escríbalo
              <input
                value={manualLot}
                onChange={(e) => setManualLot(e.target.value)}
                placeholder="Ej. 47"
                inputMode="numeric"
                style={{ maxWidth: 140 }}
                onKeyDown={(e) => e.key === 'Enter' && addManualLot()}
              />
            </label>
            <button type="button" className="ghost small" onClick={addManualLot} disabled={!manualLot.trim()}>
              + Agregar
            </button>
          </div>
        </>
      )}

      {/* Paso 3: fechas por lote (solo el día del mes; nunca futuras) */}
      {step === 2 && (
        <>
          <h4 className="section-title" style={{ margin: '12px 0 4px' }}>
            3 · Fechas de cada lote (toque el día del mes)
          </h4>
          <p className="hint" style={{ margin: '0 0 6px' }}>
            Solo se dice el <strong>día</strong>: si es mayor que hoy, el sistema entiende que es del{' '}
            <strong>mes anterior</strong> (el huevo nunca es del futuro). ● = día de postura registrado del lote.
          </p>
          {picked.map((p) => (
            <div key={p.code} className="lot-editor" style={{ marginTop: 8 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <LotChip lot={p.code} colorId={p.isTreated ? null : autoTapeFor(p.code)} treated={p.isTreated} />
                <strong>Lote {p.code}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  ¿Cuántas fechas trae?
                </span>
                {[1, 2, 3].map((n) => (
                  <WizChip key={n} selected={(dateCounts[p.code] || 1) === n} onClick={() => setDateCount(p.code, n)}>
                    {n}
                  </WizChip>
                ))}
                <span className="hint" style={{ margin: 0 }}>
                  {(daysByLot[p.code] || []).length}/{dateCounts[p.code] || 1} elegida(s)
                </span>
              </div>
              {dayGrid(p)}
              {(daysByLot[p.code] || []).length > 0 && (
                <p className="hint" style={{ margin: '6px 0 0' }}>
                  Fechas del lote {p.code}:{' '}
                  <strong>
                    {(daysByLot[p.code] || [])
                      .map((d) => resolvePostureDay(d))
                      .filter(Boolean)
                      .sort((a, b) => (a.iso < b.iso ? -1 : 1))
                      .map((r) => r.label)
                      .join(' · ')}
                  </strong>
                </p>
              )}
            </div>
          ))}
        </>
      )}

      {/* Paso 4: tipo de huevo */}
      {step === 3 && (
        <>
          <h4 className="section-title" style={{ margin: '12px 0 4px' }}>
            4 · Tipo de huevo de cada lote (1 a 5)
          </h4>
          {picked.map((p) => (
            <div key={p.code} className="lot-editor" style={{ marginTop: 8 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <LotChip lot={p.code} colorId={p.isTreated ? null : autoTapeFor(p.code)} treated={p.isTreated} />
                <strong>Lote {p.code}</strong>
                {EGG_TYPES.map((t) => (
                  <WizChip
                    key={t}
                    big
                    selected={typeByLot[p.code] === t}
                    onClick={() => setTypeByLot((prev) => ({ ...prev, [p.code]: t }))}
                  >
                    Tipo {t}
                  </WizChip>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Paso 5: confirmar y registrar */}
      {step === 4 && (
        <>
          <h4 className="section-title" style={{ margin: '12px 0 4px' }}>
            5 · Revise y registre el carro {cartNoClean}
          </h4>
          <p className="hint" style={{ margin: '0 0 6px' }}>
            Las {TRAYS_PER_CART} bandejas se repartieron entre los lotes/fechas; ajuste con − / + si hace falta.
          </p>
          {segments.map((s) => (
            <div key={s.key} className="admin-row compact" style={{ margin: '0 0 6px', flexWrap: 'wrap' }}>
              <LotChip
                lot={s.lot.code}
                colorId={s.lot.isTreated ? null : colorByLot[s.lot.code]}
                treated={s.lot.isTreated}
                eggType={typeByLot[s.lot.code]}
              />
              <div className="admin-row-main" style={{ flex: 1, minWidth: 140 }}>
                <strong>
                  Lote {s.lot.code} · {s.resolved.label}
                </strong>
                <span className="hint" style={{ margin: 0 }}>
                  {s.resolved.iso} · Tipo {typeByLot[s.lot.code] || '—'} ·{' '}
                  {eggsFromTrays(traysBySeg[s.key]).toLocaleString('es-CO')} huevos
                </span>
              </div>
              {!s.lot.isTreated && (
                <select
                  value={colorByLot[s.lot.code] || 'otro'}
                  onChange={(e) =>
                    setColorByLot((prev) => ({
                      ...prev,
                      [s.lot.code]: e.target.value,
                    }))
                  }
                  title="Cinta del lote"
                  style={{ maxWidth: 120 }}
                >
                  {TAPE_COLORS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() =>
                    setTraysBySeg((prev) => ({
                      ...prev,
                      [s.key]: Math.max(0, (Number(prev[s.key]) || 0) - 1),
                    }))
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  min="0"
                  max={TRAYS_PER_CART}
                  value={traysBySeg[s.key] ?? 0}
                  onChange={(e) =>
                    setTraysBySeg((prev) => ({
                      ...prev,
                      [s.key]: e.target.value,
                    }))
                  }
                  style={{ width: 64, textAlign: 'center', fontWeight: 700 }}
                />
                <button
                  type="button"
                  className="ghost small"
                  onClick={() =>
                    setTraysBySeg((prev) => ({
                      ...prev,
                      [s.key]: Math.min(TRAYS_PER_CART, (Number(prev[s.key]) || 0) + 1),
                    }))
                  }
                >
                  +
                </button>
                <span className="hint" style={{ margin: 0 }}>
                  band.
                </span>
              </span>
            </div>
          ))}
          <p className={overCapacity ? 'msg error' : 'hint'} style={{ margin: '6px 0' }}>
            Total:{' '}
            <strong>
              {totalTrays}/{TRAYS_PER_CART} bandejas
            </strong>{' '}
            · {totalEggs.toLocaleString('es-CO')} huevos
            {overCapacity ? ` — supera el carro; quite ${totalTrays - TRAYS_PER_CART} bandeja(s).` : ''}
          </p>
          <label>
            Notas (opcional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. bandeja incompleta" />
          </label>
        </>
      )}

      {/* Navegación */}
      <div className="actions row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {step > 0 && (
          <button type="button" className="ghost" onClick={() => setStep(step - 1)} disabled={busy}>
            ← Atrás
          </button>
        )}
        {step < 3 && (
          <button type="button" className="primary" disabled={!stepOk[step]} onClick={() => setStep(step + 1)}>
            Siguiente →
          </button>
        )}
        {step === 3 && (
          <button type="button" className="primary" disabled={!stepOk[3]} onClick={goConfirm}>
            Siguiente →
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            className="primary"
            disabled={
              busy || overCapacity || totalTrays === 0 || segments.some((s) => !(Number(traysBySeg[s.key]) > 0))
            }
            onClick={register}
            style={{ fontSize: '1.05rem', fontWeight: 700 }}
          >
            {busy ? 'Registrando…' : `✔ Registrar carro ${cartNoClean}`}
          </button>
        )}
        {step > 0 && (
          <button type="button" className="ghost small" onClick={reset} disabled={busy}>
            Empezar de nuevo
          </button>
        )}
      </div>
    </div>
  )
}

/** Número de lote pintado con el color de su cinta */
function LotChip({ lot, colorId, treated, trays, eggType }) {
  const typeSuffix = eggType ? ` T${eggType}` : ''
  if (treated) {
    return (
      <span className="lot-chip" style={{ background: '#607d8b', color: '#fff' }} title="Tratado">
        {lot} TRAT.{typeSuffix}
      </span>
    )
  }
  const t = tapeById(colorId)
  return (
    <span className="lot-chip" style={{ background: t.hex, color: t.text }} title={`Cinta ${t.label}`}>
      {lot}
      {trays != null ? ` · ${trays}b` : ''}
      {typeSuffix}
    </span>
  )
}

/** Lotes de un carro como chips coloreados */
function CartLotChips({ cart }) {
  return (
    <span className="lot-chip-row">
      {(cart.lots || []).map((l) => (
        <LotChip
          key={l.id}
          lot={l.lot || '?'}
          colorId={l.colorPrimary}
          treated={l.isTreated}
          trays={l.trays}
          eggType={l.eggType}
        />
      ))}
    </span>
  )
}

/**
 * Cola de carros disponibles, agrupada por cargue de 12.
 * El COLOR se asigna por cargue completo (diferencia un cargue de otro en
 * cuarto frío); los lotes se distinguen por el color de su cinta en el número.
 */
function CartQueue({ api, setMsg }) {
  const [openCart, setOpenCart] = useState(null)
  const groups = api.groups || []

  if (!api.available.length) {
    return (
      <>
        <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
          Carros disponibles (0)
        </h3>
        <p className="hint">Aún no hay carros clasificados listos para mapa.</p>
      </>
    )
  }

  return (
    <>
      <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
        Carros disponibles ({api.available.length}) · {groups.length} cargue(s) de {CARTS_PER_MACHINE}
      </h3>
      {groups.map((g, gi) => {
        // Color del cargue = color de sus carros (todos comparten al asignarse)
        const groupColor = normalizeCartColor(g.carts[0]?.color)
        const uniform = g.carts.every((c) => normalizeCartColor(c.color) === groupColor)
        return (
          <div key={gi} className="load-group" style={{ borderLeft: `6px solid ${groupColor}` }}>
            <div className="load-group-head">
              <span
                className="load-group-color"
                style={{
                  background: groupColor,
                  color: readableTextOn(groupColor),
                }}
              >
                Cargue {gi + 1}
              </span>
              <span className="hint" style={{ margin: 0, flex: 1 }}>
                {g.carts.length}/{CARTS_PER_MACHINE} carros · {g.totalEggs.toLocaleString('es-CO')} huevos
                {g.complete ? ' · completo' : ' · incompleto'}
                {!uniform ? ' · ⚠ carros con color distinto — reasigne el color del cargue' : ''}
              </span>
              <label className="cargue-color-label" title="Color de TODO el cargue (los 12 carros)">
                <span className="hint" style={{ margin: 0 }}>
                  Color del cargue
                </span>
                <input
                  type="color"
                  className="cart-color-inline"
                  value={groupColor}
                  onChange={async (ev) => {
                    const r = await api.setGroupColor(gi, ev.target.value)
                    if (r?.error) setMsg?.({ kind: 'error', text: r.error })
                    else
                      setMsg?.({
                        kind: 'ok',
                        text: `Cargue ${gi + 1}: color asignado a sus ${g.carts.length} carro(s)`,
                      })
                  }}
                />
              </label>
            </div>
            <div className="admin-list">
              {g.carts.map((e) => (
                <div key={e.id}>
                  <div className="admin-row compact" style={{ margin: 0 }}>
                    <span
                      className="cart-num-badge"
                      style={{
                        background: normalizeCartColor(e.color),
                        color: readableTextOn(e.color),
                      }}
                    >
                      {cartNumberOf(e) || '?'}
                    </span>
                    <div className="admin-row-main" style={{ flex: 1 }}>
                      <strong>
                        Carro {cartNumberOf(e) || '—'}
                        {e.isMixed ? ` · ${e.lotCount} lotes` : ''} <CartLotChips cart={e} />
                      </strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {e.trays} band. · {e.eggs.toLocaleString('es-CO')} huevos
                        {e.productionDate ? ` · desde ${e.productionDate}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => setOpenCart(openCart === e.id ? null : e.id)}
                      title="Agregar / quitar lotes"
                    >
                      {openCart === e.id ? '▲' : '＋ lote'}
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => api.removeEntry(e.id)}
                      title="Eliminar carro"
                    >
                      ✕
                    </button>
                  </div>
                  {openCart === e.id && <CartLotsEditor cart={e} api={api} setMsg={setMsg} />}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

/** Edición en sitio de los lotes de un carro ya registrado */
function CartLotsEditor({ cart, api, setMsg }) {
  const [lot, setLotForm] = useState(EMPTY_LOT())
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setLotForm((l) => ({ ...l, [k]: v }))

  const add = async () => {
    setBusy(true)
    const res = await api.addLotToCart(cart.id, lotPayload(lot))
    setBusy(false)
    if (res.error) setMsg?.({ kind: 'error', text: res.error })
    else {
      setMsg?.({
        kind: 'ok',
        text: `Lote agregado al carro ${cartNumberOf(cart)}`,
      })
      setLotForm(EMPTY_LOT())
    }
  }

  return (
    <div className="lot-editor" style={{ marginLeft: 44 }}>
      <div className="admin-list" style={{ marginBottom: 8 }}>
        {cart.lots.map((l) => (
          <div key={l.id} className="admin-row compact" style={{ margin: 0 }}>
            <LotChip lot={l.lot || '?'} colorId={l.colorPrimary} treated={l.isTreated} />
            <div className="admin-row-main" style={{ flex: 1 }}>
              <strong>
                Lote {l.lot || '?'}
                {l.isTreated ? ' · TRATADO' : ''}
              </strong>
              <span className="hint" style={{ margin: 0 }}>
                {l.trays} band. · {(l.eggs || 0).toLocaleString('es-CO')} huevos
                {l.productionDate ? ` · ${l.productionDate}` : ''}
              </span>
            </div>
            {cart.lots.length > 1 && (
              <button
                type="button"
                className="ghost small"
                onClick={() => api.removeLotFromCart(cart.id, l.id)}
                title="Quitar lote"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="two-col">
        <label>
          Nº de lote a agregar
          <input value={lot.lot} onChange={(e) => set('lot', e.target.value)} placeholder="Ej. 43" />
        </label>
        <label>
          Bandejas
          <input
            type="number"
            min="0"
            max={TRAYS_PER_CART}
            value={lot.trays}
            onChange={(e) => set('trays', e.target.value)}
          />
        </label>
      </div>
      <div className="two-col">
        <label>
          Tipo
          <select value={lot.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="normal">Cinta normal</option>
            <option value="doble">Mitad y mitad</option>
            <option value="tratado">Tratado</option>
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={lot.productionDate} onChange={(e) => set('productionDate', e.target.value)} />
        </label>
      </div>
      <div className="actions row" style={{ gap: 8 }}>
        <button type="button" className="primary small" disabled={busy || !lot.lot} onClick={add}>
          {busy ? 'Agregando…' : 'Agregar lote al carro'}
        </button>
      </div>
    </div>
  )
}

/* ─── Resumen ────────────────────────────────────────────── */

/**
 * Edad de parvada por lote → fertilidad estimada (norma Petersime: 30–44
 * semanas = fertilidad alta). Se registra UNA vez por lote; el sistema la va
 * sumando en el tiempo, así el coordinador no la vuelve a digitar cada vez
 * que el lote entra a clasificación. Alimenta directamente el balance
 * térmico del mapa de cargue (loadMapEngine.computeHeatScore).
 */
function FlockAgeBoard({ flock, canEdit }) {
  const [editing, setEditing] = useState(null)
  const [ageInput, setAgeInput] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newAge, setNewAge] = useState('')

  const rows = flock?.rows || []

  const startEdit = (r) => {
    setEditing(r.lot_code)
    setAgeInput(r.status === 'retired' ? '' : String(r.age_weeks_at ?? ''))
  }

  const save = async (code) => {
    const n = Number(ageInput)
    if (!Number.isFinite(n) || n < 0) return
    await flock.upsertAge({ lotCode: code, ageWeeks: n, status: 'active' })
    setEditing(null)
  }

  const addNew = async () => {
    const code = newCode.trim()
    const n = Number(newAge)
    if (!code || !Number.isFinite(n) || n < 0) return
    await flock.upsertAge({ lotCode: code, ageWeeks: n, status: 'active' })
    setNewCode('')
    setNewAge('')
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h3 className="section-title">Edad de parvadas (fertilidad estimada)</h3>
      <p className="hint">
        Registre una vez la edad de cada lote; el sistema la va sumando en el tiempo y calcula la fertilidad
        automáticamente (30–44 semanas = parvada de mayor fertilidad, norma Petersime). Esto entra al balance térmico
        del mapa de cargue junto con el tipo de huevo y el almacenamiento.
      </p>
      {!rows.length ? (
        <p className="hint">Sin lotes registrados todavía.</p>
      ) : (
        <div className="admin-list">
          {rows.map((r) => {
            const info = flockInfoFor(r.lot_code, flock.registry)
            return (
              <div
                key={r.lot_code}
                className="admin-row compact"
                style={{
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div className="admin-row-main" style={{ flex: 1, minWidth: 160 }}>
                  <strong>Lote {r.lot_code}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {r.status === 'retired'
                      ? 'Parvada de salida (ya no clasifica)'
                      : info.ageWeeks != null
                        ? `${info.ageWeeks} semanas · Fertilidad ${FERTILITY_LABEL[info.tier] || '—'}`
                        : 'Sin edad registrada'}
                  </span>
                </div>
                {canEdit && editing === r.lot_code ? (
                  <>
                    <input
                      type="number"
                      min="0"
                      style={{ width: 70 }}
                      value={ageInput}
                      onChange={(e) => setAgeInput(e.target.value)}
                    />
                    <button type="button" className="btn small" onClick={() => save(r.lot_code)}>
                      Guardar
                    </button>
                    <button type="button" className="btn small ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </button>
                  </>
                ) : canEdit ? (
                  <>
                    <button type="button" className="btn small ghost" onClick={() => startEdit(r)}>
                      Actualizar edad
                    </button>
                    {r.status !== 'retired' && (
                      <button type="button" className="btn small ghost" onClick={() => flock.retireLot(r.lot_code)}>
                        Marcar salida
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      {canEdit && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            placeholder="Código de lote (ej. 47)"
            style={{ width: 160 }}
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <input
            type="number"
            min="0"
            placeholder="Edad en semanas"
            style={{ width: 140 }}
            value={newAge}
            onChange={(e) => setNewAge(e.target.value)}
          />
          <button type="button" className="btn small" onClick={addNew}>
            Agregar / actualizar lote
          </button>
        </div>
      )}
    </div>
  )
}

function SummaryTab({ summary, entries, flock, canEdit }) {
  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint">
        El sistema calcula en todo momento cuántas fechas, lotes y cantidades de huevos hay a partir de la
        clasificación.
      </p>
      <h3 className="section-title">Por lote</h3>
      {!summary.lots?.length ? (
        <p className="hint">Sin datos.</p>
      ) : (
        <div className="admin-list">
          {summary.lots.map((l) => (
            <div key={l.lot} className="admin-row compact" style={{ margin: 0 }}>
              <div className="admin-row-main">
                <strong>Lote {l.lot}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  {l.carts} carro(s) · {l.trays} band. · {l.eggs.toLocaleString('es-CO')} huevos
                  {l.treated ? ` · tratados ${l.treated}` : ''}
                  {l.weightKg ? ` · ${l.weightKg} kg pesaje` : ''}
                  {l.dates?.length ? ` · fechas: ${l.dates.join(', ')}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <h3 className="section-title" style={{ marginTop: 16 }}>
        Por fecha de producción
      </h3>
      {!summary.dates?.length ? (
        <p className="hint">Sin fechas.</p>
      ) : (
        <div className="admin-list">
          {summary.dates.map((d) => (
            <div key={d.date} className="admin-row compact" style={{ margin: 0 }}>
              <div className="admin-row-main">
                <strong>{d.date === 's/f' ? 'Sin fecha' : d.date}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  {d.carts} carros · {d.eggs.toLocaleString('es-CO')} huevos · lotes {d.lots?.join(', ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="hint" style={{ marginTop: 12 }}>
        Máquinas Petersime estimadas: {summary.machinesNeeded || 0} (a {CARTS_PER_MACHINE} carros). Total carros en
        cola: {entries.length}.
      </p>
      {flock && <FlockAgeBoard flock={flock} canEdit={canEdit} />}
    </div>
  )
}

/* ─── Mapas ──────────────────────────────────────────────── */

function MapsTab({ maps, canApprove, canOrder, busy, onApprove, onReject, onOrder, selectedMap, setSelectedMap }) {
  if (!maps.length) {
    return (
      <p className="hint" style={{ marginTop: 12 }}>
        Aún no hay mapas. Clasifique carros y genere el mapa de cargue.
      </p>
    )
  }

  const view = maps.find((m) => m.id === selectedMap?.id) || maps[0]

  return (
    <div style={{ marginTop: 12 }} className="load-maps-layout">
      <div className="admin-list" style={{ maxHeight: 360, overflow: 'auto' }}>
        {maps.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`admin-row compact map-pick${view?.id === m.id ? ' active' : ''}`}
            style={{
              margin: 0,
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
            }}
            onClick={() => setSelectedMap(m)}
          >
            <div className="admin-row-main">
              <strong>{m.machineName || 'Petersime'}</strong>
              <span className="hint" style={{ margin: 0 }}>
                {STATUS_LABEL[m.status] || m.status} ·{' '}
                {m.createdAt ? new Date(m.createdAt).toLocaleString('es-CO') : ''}
                {' · '}
                {(m.summary?.totalEggs || 0).toLocaleString('es-CO')} huevos
              </span>
            </div>
            <span
              className={`pill status ${m.status === 'approved' || m.status === 'ordered' ? 'ok' : m.status === 'pending_approval' ? 'warn' : ''}`}
            >
              {STATUS_LABEL[m.status] || m.status}
            </span>
          </button>
        ))}
      </div>

      {view && (
        <div className="map-detail" style={{ marginTop: 14 }}>
          <div className="actions row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <button type="button" className="ghost" onClick={() => downloadLoadMapImage(view, `mapa-${view.id}.png`)}>
              Descargar imagen del mapa
            </button>
            {canApprove && view.status === 'pending_approval' && (
              <>
                <button type="button" className="primary" disabled={busy} onClick={() => onApprove(view.id)}>
                  Aprobar mapa
                </button>
                <button type="button" className="ghost" disabled={busy} onClick={() => onReject(view.id)}>
                  Rechazar
                </button>
              </>
            )}
            {canOrder && view.status === 'approved' && (
              <button type="button" className="primary" disabled={busy} onClick={() => onOrder(view.id)}>
                Enviar orden de cargue al operario
              </button>
            )}
          </div>

          {view.balance && (
            <div className={`balance-note ${view.balance.ok ? 'ok' : 'warn'}`}>
              {view.balance.ok ? (
                <strong>✓ Carga balanceada y completa (12/12, simétrica a lado y lado del ventilador).</strong>
              ) : (
                <>
                  <strong>⚠ Revisar antes de aprobar (norma Petersime):</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {view.balance.warnings.map((w, i) => (
                      <li key={i} className="hint" style={{ margin: 0 }}>
                        {w}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {view.imageDataUrl ? (
            <img
              src={view.imageDataUrl}
              alt="Mapa de cargue"
              className="load-map-img"
              style={{
                width: '100%',
                maxWidth: 1100,
                borderRadius: 12,
                border: '1px solid var(--line)',
              }}
            />
          ) : (
            <MapAscii view={view} />
          )}

          <h4 className="section-title" style={{ marginTop: 14 }}>
            Guía operario: nº carro → ubicación
          </h4>
          <p className="hint" style={{ marginTop: 0 }}>
            El operario de cargue solo necesita el número del carro y dónde va en la máquina.
          </p>
          <OperatorPlacementTable map={view} />

          <h4 className="section-title" style={{ marginTop: 16 }}>
            Detalle por zona (coordinación)
          </h4>
          {['centro', 'paredes', 'serpentin'].map((z) => (
            <div key={z} style={{ marginBottom: 10 }}>
              <strong>
                {ZONE_LABEL[z]} — {ZONE_HINT[z]}
              </strong>
              <ul className="hint" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {(view.slots || [])
                  .filter((s) => s.zone === z && s.entry)
                  .map((s) => (
                    <li key={s.machinePos}>
                      <strong>Carro {s.cartNo || cartNumberOf(s.entry)}</strong> → Pos. {s.machinePos} ({ZONE_LABEL[z]})
                      · {entryLabel(s.entry)}
                      {s.entry && 'heat' in s.entry && (
                        <span style={{ display: 'block', opacity: 0.85 }}>
                          ↳ {heatBreakdownLabel(s.entry.heat)}
                          {s.entry.heat ? ` → calor ${Math.round(s.entry.heat.score * 100)}%` : ''}
                        </span>
                      )}
                    </li>
                  ))}
                {!(view.slots || []).some((s) => s.zone === z && s.entry) && <li>Sin carros</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* Carros ya ubicados por el operario (se guardan en el dispositivo por mapa). */
const PLACED_KEY = (id) => `incubapp:placed-carts:${id}`
function readPlaced(id) {
  try {
    return new Set(JSON.parse(localStorage.getItem(PLACED_KEY(id)) || '[]'))
  } catch {
    return new Set()
  }
}
function OperatorPlacementTable({ map, placed, onToggle }) {
  const guide = map?.placementGuide || buildOperatorPlacementGuide(map || {})
  if (!guide.length) {
    return <p className="hint">Sin carros en este mapa.</p>
  }
  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="data-table operator-place-table">
        <thead>
          <tr>
            <th>Nº carro</th>
            <th>Ubicación en máquina</th>
            <th>Zona</th>
            <th>Carga (ref.)</th>
            {onToggle && <th>Ubicado</th>}
          </tr>
        </thead>
        <tbody>
          {guide.map((r) => (
            <tr key={`${r.cartNo}-${r.machinePos}`}>
              <td>
                <span className="cart-num-badge lg">{r.cartNo}</span>
              </td>
              <td>
                <strong>{r.locationShort || r.location}</strong>
              </td>
              <td>{r.zoneLabel}</td>
              <td className="hint" style={{ margin: 0 }}>
                {r.cargo}
              </td>
              {onToggle && (
                <td>
                  <button
                    type="button"
                    className={placed?.has(`${r.cartNo}-${r.machinePos}`) ? 'primary' : 'ghost'}
                    style={{ minHeight: 44, minWidth: 96 }}
                    aria-pressed={placed?.has(`${r.cartNo}-${r.machinePos}`) || false}
                    onClick={() => onToggle(`${r.cartNo}-${r.machinePos}`)}
                  >
                    {placed?.has(`${r.cartNo}-${r.machinePos}`) ? '✓ Ubicado' : 'Tocar al ubicar'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MapAscii({ view }) {
  return (
    <div className="petersime-grid">
      <div className="petersime-comp">
        <div className="petersime-comp-title">Comp. izquierdo</div>
        <div className="petersime-row">
          {[1, 2, 3].map((p) => (
            <SlotCard key={p} slot={(view.slots || []).find((s) => s.machinePos === p)} pos={p} />
          ))}
        </div>
        <div className="petersime-row">
          {[4, 5, 6].map((p) => (
            <SlotCard key={p} slot={(view.slots || []).find((s) => s.machinePos === p)} pos={p} />
          ))}
        </div>
      </div>
      <div className="petersime-comp">
        <div className="petersime-comp-title">Comp. derecho</div>
        <div className="petersime-row">
          {[10, 11, 12].map((p) => (
            <SlotCard key={p} slot={(view.slots || []).find((s) => s.machinePos === p)} pos={p} />
          ))}
        </div>
        <div className="petersime-row">
          {[7, 8, 9].map((p) => (
            <SlotCard key={p} slot={(view.slots || []).find((s) => s.machinePos === p)} pos={p} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SlotCard({ slot, pos }) {
  const zone = slot?.zone || 'centro'
  const e = slot?.entry
  const cartNo = slot?.cartNo || cartNumberOf(e)
  return (
    <div className={`petersime-slot zone-${zone}`}>
      <div className="petersime-slot-head">
        Ubicación Pos. {pos} · {ZONE_LABEL[zone]}
      </div>
      {e ? (
        <>
          <div className="petersime-slot-cart">CARRO {cartNo || '?'}</div>
          <div className="hint" style={{ margin: '4px 0 0', fontSize: '0.75rem' }}>
            Lote {e.lot}
            {e.isTreated ? ' · TRATADO' : ''} · {e.trays || 0} band.
            <br />
            {e.productionDate || '—'} · {(e.eggs || 0).toLocaleString('es-CO')} h
          </div>
        </>
      ) : (
        <div className="hint" style={{ margin: '8px 0 0' }}>
          Vacío
        </div>
      )}
    </div>
  )
}

/* ─── Órdenes ────────────────────────────────────────────── */

function OrdersTab({ maps, machines = [], canOrder, isOperator, busy, onComplete, onOrder, setMsg }) {
  const [completingId, setCompletingId] = useState(null)
  const [selMachineId, setSelMachineId] = useState('')
  const [loadedAt, setLoadedAt] = useState('')
  const [cycleStartAt, setCycleStartAt] = useState('')
  const [, setPlacedTick] = useState(0)
  const togglePlacedCart = (mapId, key) => {
    const next = readPlaced(mapId)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    try {
      localStorage.setItem(PLACED_KEY(mapId), JSON.stringify([...next]))
    } catch {
      /* sin almacenamiento en el dispositivo */
    }
    setPlacedTick((t) => t + 1)
  }

  const startCompletion = (m) => {
    setCompletingId(m.id)
    setSelMachineId(m.machineId || '')
    // Default loadedAt to current local time in YYYY-MM-DDTHH:mm
    const now = new Date()
    const offset = now.getTimezoneOffset()
    const localNow = new Date(now.getTime() - offset * 60 * 1000)
    const localStr = localNow.toISOString().slice(0, 16)
    setLoadedAt(localStr)
    setCycleStartAt(localStr)
  }

  const handleConfirmComplete = async (mapId) => {
    if (!selMachineId) {
      alert('Debe seleccionar la incubadora')
      return
    }
    const selectedMachine = machines.find((x) => x.id === selMachineId)
    await onComplete(mapId, {
      machineId: selMachineId,
      machineName: selectedMachine ? `${selectedMachine.name} (${selectedMachine.code})` : 'Petersime',
      plantId: selectedMachine?.plant_id || null,
      loadedAt: loadedAt ? new Date(loadedAt).toISOString() : new Date().toISOString(),
      cycleStartAt: cycleStartAt ? new Date(cycleStartAt).toISOString() : new Date().toISOString(),
    })
    setCompletingId(null)
  }

  const active = maps.filter((m) => ['ordered', 'approved', 'completed'].includes(m.status))
  if (!active.length) {
    return (
      <p className="hint" style={{ marginTop: 12 }}>
        No hay órdenes de cargue. El coordinador debe aprobar un mapa y enviarlo al operario.
      </p>
    )
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="hint">
        {isOperator
          ? 'Órdenes de cargue para el turno. Siga el mapa y las posiciones de cada carro.'
          : 'Órdenes emitidas y mapas aprobados listos para despachar al operario.'}
      </p>
      {active.map((m) => renderCard(m))}
    </div>
  )

  function renderCard(m) {
    const placed = readPlaced(m.id)
    const togglePlaced = (key) => togglePlacedCart(m.id, key)
    const guide = m?.placementGuide || buildOperatorPlacementGuide(m || {})
    const total = guide.length
    const done = guide.filter((r) => placed.has(`${r.cartNo}-${r.machinePos}`)).length
    const missing = m.status === 'ordered' ? total - done : 0
    return (
      <div key={m.id} className="card" style={{ marginTop: 12, padding: 12, border: '1px solid var(--line)' }}>
        <div className="card-head" style={{ marginBottom: 8 }}>
          <div>
            <strong>{m.machineName || 'Petersime'}</strong>
            <span className="hint" style={{ display: 'block', margin: 0 }}>
              {STATUS_LABEL[m.status]} · {(m.summary?.totalEggs || 0).toLocaleString('es-CO')} huevos
            </span>
          </div>
          <span className="pill">{STATUS_LABEL[m.status]}</span>
        </div>

        {(m.status === 'ordered' || m.status === 'approved') && (
          <>
            <h4 className="section-title" style={{ margin: '8px 0' }}>
              Coloque cada carro en su ubicación
            </h4>
            {m.status === 'ordered' && total > 0 && (
              <p className="hint" style={{ margin: '0 0 8px' }}>
                <strong>
                  {done} de {total}
                </strong>{' '}
                carros ubicados. Toque cada carro cuando lo deje en su sitio.
              </p>
            )}
            <OperatorPlacementTable map={m} placed={placed} onToggle={m.status === 'ordered' ? togglePlaced : null} />
          </>
        )}

        {m.status === 'ordered' && <pre className="load-order-text">{buildLoadOrderText(m)}</pre>}

        {m.imageDataUrl && (m.status === 'ordered' || m.status === 'approved') && (
          <img
            src={m.imageDataUrl}
            alt="Mapa: número de carro y ubicación"
            style={{
              width: '100%',
              maxWidth: 1000,
              borderRadius: 8,
              marginTop: 8,
            }}
          />
        )}

        <div className="actions row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          {canOrder && m.status === 'approved' && (
            <button type="button" className="primary" disabled={busy} onClick={() => onOrder(m.id)}>
              Enviar orden al operario
            </button>
          )}
          {m.status === 'ordered' && completingId !== m.id && (
            <>
              <button type="button" className="ghost" onClick={() => downloadLoadMapImage(m, `orden-${m.id}.png`)}>
                Descargar mapa
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(buildLoadOrderText(m))
                  setMsg?.({
                    kind: 'ok',
                    text: 'Orden copiada al portapapeles',
                  })
                }}
              >
                Copiar orden
              </button>
              <button type="button" className="primary" disabled={busy} onClick={() => startCompletion(m)}>
                Marcar cargue completado
              </button>
            </>
          )}

          {m.status === 'ordered' && completingId === m.id && (
            <div
              className="inline-form"
              style={{
                marginTop: 10,
                padding: 12,
                border: '1px solid var(--accent, #e67e22)',
                borderRadius: 8,
                background: 'var(--bg-2)',
                width: '100%',
              }}
            >
              <h4 style={{ margin: '0 0 10px' }}>Confirmación de cargue en incubadora</h4>
              <div className="two-col">
                <label>
                  Incubadora
                  <select value={selMachineId} onChange={(e) => setSelMachineId(e.target.value)}>
                    <option value="">— Seleccione —</option>
                    {machines.map((mach) => (
                      <option key={mach.id} value={mach.id}>
                        {mach.name} ({mach.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Hora de cargue
                  <input type="datetime-local" value={loadedAt} onChange={(e) => setLoadedAt(e.target.value)} />
                </label>
              </div>
              <div className="two-col">
                <label>
                  Hora de inicio de ciclo de incubación
                  <input type="datetime-local" value={cycleStartAt} onChange={(e) => setCycleStartAt(e.target.value)} />
                </label>
                <span />
              </div>
              <div className="actions row" style={{ gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="primary"
                  onClick={() => handleConfirmComplete(m.id)}
                  disabled={busy || !selMachineId || missing > 0}
                >
                  {busy
                    ? 'Guardando...'
                    : missing > 0
                      ? `Registrar cargue (faltan ${missing} carros)`
                      : 'Confirmar cargue'}
                </button>
                <button type="button" className="ghost" onClick={() => setCompletingId(null)} disabled={busy}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
}
