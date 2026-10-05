/**
 * =============================================================================
 * ARCHIVO: src/components/ClassificationPanel.jsx
 * PROPÓSITO: Pantalla de CLASIFICACIÓN del operario de recepción.
 *   Clasificar = cargar los carros y generar el mapa de cargue (no es ovoscopia
 *   ni descarte). El trabajo va en cuatro pasos y la pantalla marca en cuál va
 *   según los datos reales:
 *     1. Orden del día: la orden FIFO que publicó gerencia y sus lotes.
 *     2. Registrar carros: asistente paso a paso + cola del cargue (X de 12).
 *     3. Mapa de cargue: generarlo y enviarlo al líder; ver su estado.
 *     4. Cargar la máquina: guía «N° de carro → ubicación» y completar cargue.
 *   El operario NO aprueba ni da la orden: eso sigue en la pantalla del líder.
 *   Pensada para tablet/celular en el muelle: botones grandes y lenguaje simple.
 *   Reutiliza las piezas de LoadClassificationWorkspace con UNA sola instancia
 *   de cada hook (useLoadClassification, useIncubationLots, useFlockLots).
 * =============================================================================
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './ClassificationPanel.css'
import { RxHeader } from './ReceptionScaffold'
import {
  CartQueue,
  CartWizard,
  MapAscii,
  OperatorPlacementTable,
  TodayClassificationOrder,
} from './LoadClassificationWorkspace'
import {
  CLASSIFICATION_STEPS,
  OPEN_MAP_STATUSES,
  deriveClassificationStep,
  isStaleOpenMap,
  useLoadClassification,
} from '../hooks/useLoadClassification'
import { lotTotals, orderProgress, planOrderTransitions, useIncubationLots } from '../hooks/useIncubationLots'
import { useFlockLots } from '../hooks/useFlockLots'
import { buildOperatorPlacementGuide, CARTS_PER_MACHINE, downloadLoadMapImage } from '../lib/loadMapEngine'
import { openLoadMapPrint } from '../lib/loadMapPrint'
import { supabase } from '../lib/supabase'

const fmt = new Intl.NumberFormat('es-CO')
const num = (n) => fmt.format(Math.round(Number(n) || 0))
const fechaCorta = (d) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—'
const fechaHora = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

/** Estado del lote en palabras del operario. */
const LOT_STATUS = {
  planned: { texto: 'Programado · aún no llega', clase: 'muted' },
  arrived: { texto: 'En planta · por clasificar', clase: 'accent' },
  classifying: { texto: 'En clasificación', clase: 'accent' },
  classified: { texto: 'Clasificado · todo en carros', clase: 'ok' },
  loaded: { texto: 'Cargado en la máquina', clase: 'ok' },
  closed: { texto: 'Cerrado', clase: 'muted' },
}

/** Estado del mapa en palabras (el operario no necesita los códigos internos). */
const MAP_STATUS = {
  draft: { texto: 'Borrador · no se ha enviado al líder', clase: 'muted' },
  pending_approval: { texto: 'Esperando aprobación del líder', clase: 'warn' },
  approved: { texto: 'Aprobado · falta que el líder dé la orden de cargue', clase: 'ok' },
  ordered: { texto: 'Orden de cargue dada · cargue la máquina', clase: 'accent' },
  rejected: { texto: 'Rechazado por el líder', clase: 'danger' },
  completed: { texto: 'Cargado', clase: 'ok' },
  cancelled: { texto: 'Descartado', clase: 'muted' },
}
const mapStatusOf = (m) => MAP_STATUS[m?.status] || { texto: m?.status || '—', clase: 'muted' }

/* Carros ya ubicados (lista de chequeo del cargue). Misma llave que usa la
   pestaña «Órdenes» del workspace: lo marcado en un lado se ve en el otro. */
const PLACED_KEY = (id) => `incubapp:placed-carts:${id}`
function readPlaced(id) {
  try {
    return new Set(JSON.parse(localStorage.getItem(PLACED_KEY(id)) || '[]'))
  } catch {
    return new Set()
  }
}
function writePlaced(id, set) {
  try {
    localStorage.setItem(PLACED_KEY(id), JSON.stringify([...set]))
  } catch {
    /* sin almacenamiento: la lista vive solo mientras la pantalla esté abierta */
  }
}

/* Fechas y horas locales para los controles del cargue (sin datetime-local). */
const pad = (n) => String(n).padStart(2, '0')
const localDateOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localTimeOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
function isoFrom(date, time) {
  if (!date || !/^\d{2}:\d{2}$/.test(time || '')) return null
  const d = new Date(`${date}T${time}:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const machineLabel = (m) => (m ? `${m.name}${m.code ? ` (${m.code})` : ''}` : '')

/**
 * SlotCard (workspace) escribe «Lote {entry.lot}», pero los carros del mapa
 * guardan sus lotes en `entry.lots` (sin `lot` arriba) y la casilla salía como
 * «Lote ·». Aquí se completa ese texto solo para pintar, sin tocar el mapa.
 */
function withLotLabels(map) {
  if (!map?.slots) return map
  return {
    ...map,
    slots: map.slots.map((s) =>
      s?.entry && !s.entry.lot
        ? {
            ...s,
            entry: {
              ...s.entry,
              lot: (s.entry.lots || []).map((l) => l.lot).filter(Boolean).join(' + ') || '?',
            },
          }
        : s,
    ),
  }
}

export default function ClassificationPanel({ orgId, userId, role, onNavigate, orgName: orgNameProp }) {
  // UNA instancia de cada hook para toda la pantalla (cada una abre su canal en vivo).
  const api = useLoadClassification(orgId, userId)
  const incubation = useIncubationLots(orgId, userId)
  const flock = useFlockLots(orgId, userId)

  const [machines, setMachines] = useState([])
  const [plants, setPlants] = useState([])
  const [orgName, setOrgName] = useState(orgNameProp || '')
  const [refError, setRefError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [view, setView] = useState(null) // null = seguir el paso real
  const [wizard, setWizard] = useState({ key: 0, lot: null })

  // Incubadoras, plantas y nombre de la empresa (para el mapa impreso).
  useEffect(() => {
    if (!orgId) return
    let vivo = true
    ;(async () => {
      const [p, o] = await Promise.all([
        supabase.from('plants').select('id, name').eq('org_id', orgId),
        orgNameProp ? Promise.resolve({ data: null }) : supabase.from('organizations').select('name').eq('id', orgId).single(),
      ])
      if (!vivo) return
      if (p.error) {
        setRefError(`No se pudieron leer las plantas: ${p.error.message}`)
        return
      }
      setPlants(p.data || [])
      if (o?.data?.name) setOrgName(o.data.name)
      const ids = (p.data || []).map((x) => x.id)
      if (!ids.length) return
      const m = await supabase
        .from('machines')
        .select('id, name, code, type, plant_id, status')
        .in('plant_id', ids)
        .in('type', ['setter', 'combo'])
      if (!vivo) return
      if (m.error) setRefError(`No se pudieron leer las incubadoras: ${m.error.message}`)
      else setMachines((m.data || []).filter((x) => x.status !== 'decommissioned'))
    })()
    return () => {
      vivo = false
    }
  }, [orgId, orgNameProp])

  // Los mensajes de éxito se van solos; los errores se quedan hasta cerrarlos.
  useEffect(() => {
    if (!msg || msg.kind !== 'ok') return
    const t = setTimeout(() => setMsg(null), 9000)
    return () => clearTimeout(t)
  }, [msg])

  /* ── Avance real de la orden del día y estados que se derivan ── */
  const activeOrder = incubation.activeOrders?.[0] || null
  const progress = useMemo(() => orderProgress(activeOrder, api.entries), [activeOrder, api.entries])
  const plan = useMemo(
    () => planOrderTransitions(activeOrder, progress, incubation.lots),
    [activeOrder, progress, incubation.lots],
  )
  const planKey = plan.order || plan.lots.length ? JSON.stringify(plan) : ''
  const attemptedPlan = useRef('')
  const mounted = useRef(true)
  const [syncErrors, setSyncErrors] = useState([])
  const [syncTick, setSyncTick] = useState(0)
  const applyTransitions = incubation.applyOrderTransitions

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    // En modo local los carros no están en la base: no se mueven estados con ellos.
    if (!planKey || api.localMode || api.loading || incubation.loading) return
    if (attemptedPlan.current === planKey) return
    attemptedPlan.current = planKey
    ;(async () => {
      const r = await applyTransitions(JSON.parse(planKey))
      if (!mounted.current) return
      setSyncErrors(r.errors)
      if (r.applied.length) setMsg({ kind: 'ok', text: `Estado actualizado · ${r.applied.join(' · ')}` })
    })()
  }, [planKey, api.localMode, api.loading, incubation.loading, applyTransitions, syncTick])

  const retrySync = () => {
    attemptedPlan.current = ''
    setSyncErrors([])
    setSyncTick((t) => t + 1)
  }

  /* ── Paso en el que va el operario según los datos ── */
  const realStep = deriveClassificationStep({
    maps: api.maps,
    groups: api.groups,
    available: api.available,
    orderStarted: !!progress?.started,
  })
  const shown = view || realStep

  const goTo = useCallback((id) => {
    setView(id)
    if (typeof window !== 'undefined') window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }, [])

  const startWithLot = (lot) => {
    setWizard((w) => ({ key: w.key + 1, lot }))
    setMsg(null)
    goTo('carros')
  }

  const plantNameOf = (id) => plants.find((p) => p.id === id)?.name || ''

  return (
    <div className="module-panel rx-panel cls-op">
      {api.localMode && <LocalModeStrip api={api} setMsg={setMsg} />}
      {!api.localMode && api.localOnlyEntries?.length > 0 && <LocalLeftovers api={api} setMsg={setMsg} />}

      <RxHeader
        icon="🛒"
        title="Clasificación · cargue de carros y mapa de cargue"
        hint="Registre cada carro (lotes, cinta, bandejas, fecha y tipo de huevo), arme el mapa de cargue para el líder y, cuando él dé la orden, ubique los carros en la máquina."
      />

      {role && role !== 'reception_operator' ? (
        <p className="hint cls-role-note">
          Esta es la vista del operario de recepción. La aprobación del mapa y la orden de cargue están en «Cargue».{' '}
          {onNavigate ? (
            <button type="button" className="ghost small" onClick={() => onNavigate('cargue')}>
              Abrir Cargue
            </button>
          ) : null}
        </p>
      ) : null}

      <StepBar current={realStep} shown={shown} onPick={goTo} />

      {api.error ? <p className="msg error">No se pudieron leer los carros o los mapas: {api.error}</p> : null}
      {incubation.error ? <p className="msg error">No se pudieron leer los lotes: {String(incubation.error)}</p> : null}
      {refError ? <p className="msg error">{refError}</p> : null}
      {syncErrors.length > 0 && (
        <div className="msg error cls-sync-error" role="alert">
          <strong>No se pudo actualizar el estado de la orden o de un lote.</strong>
          <ul>
            {syncErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <button type="button" className="ghost small" onClick={retrySync}>
            Reintentar
          </button>
        </div>
      )}

      {shown === 'orden' && (
        <OrderStep
          incubation={incubation}
          activeOrder={activeOrder}
          progress={progress}
          onClassify={startWithLot}
          onGoCarts={() => goTo('carros')}
        />
      )}

      {shown === 'carros' && (
        <CartsStep
          api={api}
          incubation={incubation}
          busy={busy}
          setBusy={setBusy}
          setMsg={setMsg}
          wizard={wizard}
          onClearLot={() => setWizard((w) => ({ key: w.key + 1, lot: null }))}
          onGoMap={() => goTo('mapa')}
          onGoOrder={() => goTo('orden')}
        />
      )}

      {shown === 'mapa' && (
        <MapStep
          api={api}
          machines={machines}
          flockRegistry={flock.registry}
          busy={busy}
          setBusy={setBusy}
          setMsg={setMsg}
          printMeta={(m) => ({ orgName, plantName: plantNameOf(m?.plantId) })}
          onGoLoad={() => goTo('cargar')}
          onGoCarts={() => goTo('carros')}
        />
      )}

      {shown === 'cargar' && (
        <LoadStep
          api={api}
          machines={machines}
          busy={busy}
          setBusy={setBusy}
          setMsg={setMsg}
          printMeta={(m) => ({ orgName, plantName: plantNameOf(m?.plantId) })}
          onGoMap={() => goTo('mapa')}
        />
      )}

      {msg && (
        <div className={`cls-toast ${msg.kind === 'error' ? 'is-error' : msg.kind === 'warn' ? 'is-warn' : 'is-ok'}`} role="status" aria-live="polite">
          <span>{msg.text}</span>
          <button type="button" className="ghost small" onClick={() => setMsg(null)} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── Franja de guardado local (sin conexión con la base) ─────────────────── */

function LocalModeStrip({ api, setMsg }) {
  const [retrying, setRetrying] = useState(false)
  const n = api.localOnlyEntries?.length || 0
  const retry = async () => {
    setRetrying(true)
    try {
      await api.reload()
    } catch (e) {
      setMsg({ kind: 'error', text: `Sigue sin conexión: ${e?.message || e}` })
    } finally {
      setRetrying(false)
    }
  }
  // La franja fija lleva solo el aviso y el botón (en el celular no tapa la
  // pantalla); el «qué hacer» completo va debajo y se desplaza con la página.
  return (
    <>
      <div className="cls-local-strip" role="alert">
        <strong>Sin conexión con la base: los carros se están guardando SOLO en este equipo.</strong>
        <button type="button" className="cls-btn-strip" onClick={retry} disabled={retrying}>
          {retrying ? 'Probando…' : 'Reintentar conexión'}
        </button>
      </div>
      <div className="cls-local-help">
        <strong>Qué hacer:</strong> {n ? `${n} carro(s) guardado(s) solo aquí. ` : ''}El líder no los ve y no llegan al
        mapa de los demás. No cierre la sesión ni borre los datos del navegador, anote los carros en el formato de
        papel y avise a su líder o a sistemas. Cuando vuelva la conexión, toque «Reintentar conexión» y luego «Subir a
        la base».
      </div>
    </>
  )
}

/** Volvió la conexión pero quedaron carros guardados solo en este equipo. */
function LocalLeftovers({ api, setMsg }) {
  const [busy, setBusy] = useState(false)
  const [skipped, setSkipped] = useState([])
  const [confirmForget, setConfirmForget] = useState(null)
  const list = api.localOnlyEntries || []
  const upload = async () => {
    setBusy(true)
    const r = await api.uploadLocalEntries()
    setBusy(false)
    if (r.error) {
      setMsg({ kind: 'error', text: r.error })
      return
    }
    setSkipped(r.skipped || [])
    setMsg({
      kind: r.skipped?.length ? 'warn' : 'ok',
      text: `${r.uploaded} carro(s) subidos a la base.${r.skipped?.length ? ` ${r.skipped.length} no se pudieron subir (vea el detalle).` : ''}`,
    })
  }
  return (
    <div className="cls-local-leftovers" role="alert">
      <strong>
        Hay {list.length} carro(s) que se guardaron SOLO en este equipo mientras no había conexión. No están en la base.
      </strong>
      <ul>
        {list.map((c) => (
          <li key={c.id}>
            Carro {c.cartNumber || '?'} · {c.lots.map((l) => l.lot).join(', ')} · {num(c.eggs)} huevos ·{' '}
            <span className="hint">
              registrado {c.classifiedAt ? new Date(c.classifiedAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '¿?'}
            </span>
            {confirmForget === c.id ? (
              <>
                {' '}
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    api.forgetLocalEntry(c.id)
                    setConfirmForget(null)
                  }}
                >
                  Sí, ya lo registré de nuevo: quitarlo de este equipo
                </button>
                <button type="button" className="ghost small" onClick={() => setConfirmForget(null)}>
                  No
                </button>
              </>
            ) : (
              <button type="button" className="ghost small" onClick={() => setConfirmForget(c.id)}>
                Quitar de este equipo
              </button>
            )}
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <ul className="cls-skipped">
          {skipped.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      <button type="button" className="primary" onClick={upload} disabled={busy}>
        {busy ? 'Subiendo…' : 'Subir a la base'}
      </button>
    </div>
  )
}

/* ─── Indicador de pasos ─────────────────────────────────────────────────── */

function StepBar({ current, shown, onPick }) {
  const idx = CLASSIFICATION_STEPS.findIndex((s) => s.id === current)
  return (
    <nav className="cls-steps" aria-label="Pasos de la clasificación">
      {CLASSIFICATION_STEPS.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : 'todo'
        return (
          <button
            key={s.id}
            type="button"
            className={`cls-step is-${state}${shown === s.id ? ' is-shown' : ''}`}
            aria-current={shown === s.id ? 'step' : undefined}
            onClick={() => onPick(s.id)}
          >
            <span className="cls-step-n">{state === 'done' ? '✓' : i + 1}</span>
            <span className="cls-step-label">
              {s.label}
              {state === 'current' ? <small>Usted va aquí</small> : null}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

/* ─── 1 · Orden del día ──────────────────────────────────────────────────── */

const ORDER_STATUS_TEXT = {
  published: 'Publicada · todavía sin carros',
  in_progress: 'En clasificación',
  done: 'Terminada',
}

/** ¿Hay una orden que se terminó en las últimas 24 h? (al pasar a 'done' sale de activeOrders). */
function ordenTerminadaHoy(orders) {
  const hace24h = Date.now() - 24 * 3600 * 1000
  return (orders || []).some((o) => o.status === 'done' && new Date(o.updated_at || o.published_at || 0).getTime() > hace24h)
}

function OrderStep({ incubation, activeOrder, progress, onClassify, onGoCarts }) {
  const { lots, loading } = incubation

  // Lotes de la orden (en el orden FIFO de la orden) y luego los que están en planta.
  const rows = useMemo(() => {
    const out = []
    const seen = new Set()
    const byId = new Map((lots || []).map((l) => [l.id, l]))
    for (const it of activeOrder?.items || []) {
      if (!it.lotId || seen.has(it.lotId)) continue
      seen.add(it.lotId)
      const lot = byId.get(it.lotId) || { id: it.lotId, code: it.code, status: null, postures: [], is_treated: it.isTreated }
      const prog =
        progress?.lots.find((p) => p.lotId === it.lotId) ||
        progress?.lots.find((p) => String(p.code).trim().toUpperCase() === String(it.code).trim().toUpperCase())
      out.push({ lot, inOrder: true, prog })
    }
    for (const l of lots || []) {
      if (seen.has(l.id)) continue
      if (!['planned', 'arrived', 'classifying'].includes(l.status)) continue
      seen.add(l.id)
      out.push({ lot: l, inOrder: false, prog: null })
    }
    return out
  }, [lots, activeOrder, progress])

  return (
    <section className="card wide cls-section">
      <h3 className="cls-section-title">1 · Orden del día</h3>
      {activeOrder ? (
        <>
          <TodayClassificationOrder activeOrders={[activeOrder]} />
          <p className="cls-order-state">
            <span className={`cls-tag ${activeOrder.status === 'in_progress' ? 'accent' : 'warn'}`}>
              {ORDER_STATUS_TEXT[activeOrder.status] || activeOrder.status}
            </span>{' '}
            {progress?.carts
              ? `${progress.carts} carro(s) registrados de esta orden · ${progress.loadedCarts} ya cargados en máquina.`
              : 'Todavía no hay carros registrados de esta orden.'}
          </p>
          {progress?.ambiguousCodes?.length ? (
            <p className="msg error">
              Ojo: en la orden hay dos lotes distintos con el código {progress.ambiguousCodes.join(', ')}. Sus carros
              cuentan para la orden, pero el estado de esos lotes no se cambia solo: avise a gerencia.
            </p>
          ) : null}
        </>
      ) : (
        <div className="cls-empty">
          <strong>
            {ordenTerminadaHoy(incubation.orders)
              ? 'La orden de clasificación ya se terminó: todos sus carros quedaron cargados.'
              : 'Gerencia todavía no ha publicado la orden de clasificación.'}
          </strong>
          <p className="hint">
            Si hay lotes en planta puede registrar sus carros igual. Cuando publiquen la orden, aparece aquí en el
            orden en que se deben clasificar (fecha de postura más vieja primero).
          </p>
        </div>
      )}

      <h4 className="cls-subtitle">Lotes {activeOrder ? 'de la orden y en planta' : 'en planta y próximos'}</h4>
      {loading && rows.length === 0 ? <p className="hint">Cargando lotes…</p> : null}
      {!loading && rows.length === 0 ? <p className="hint">No hay lotes por clasificar en este momento.</p> : null}
      <div className="cls-lot-grid">
        {rows.map(({ lot, inOrder, prog }) => {
          const st = LOT_STATUS[lot.status] || { texto: lot.status || 'Sin estado', clase: 'muted' }
          const t = lotTotals(lot.postures)
          const pct = prog?.orderEggs ? Math.min(100, Math.round((prog.classifiedEggs / prog.orderEggs) * 100)) : 0
          const terminado = ['classified', 'loaded', 'closed'].includes(lot.status)
          const puede = !terminado && (inOrder || lot.status !== 'planned')
          return (
            <article key={lot.id} className={`cls-lot${inOrder ? ' in-order' : ''}`}>
              <header>
                <strong className="cls-lot-code">
                  Lote {lot.code || lot.id.slice(0, 8)}
                  {lot.is_treated ? ' · tratado' : ''}
                </strong>
                <span className={`cls-tag ${st.clase}`}>{st.texto}</span>
              </header>
              <p className="hint">
                {inOrder ? '📋 En la orden del día · ' : ''}
                {lot.origin ? `${lot.origin} · ` : ''}
                {t.eggs ? `${num(t.eggs)} huevos · ${t.fullCarts} carro(s)` : 'Sin cantidades registradas'}
                {lot.expected_arrival_date ? ` · llegada ${fechaCorta(lot.expected_arrival_date)}` : ''}
              </p>
              {prog ? (
                <div className="cls-progress" aria-label={`Avance del lote ${lot.code}`}>
                  <div className="cls-bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <small>
                    {num(prog.classifiedEggs)} de {num(prog.orderEggs)} huevos en carros · {prog.carts} carro(s)
                    {prog.loadedCarts ? ` · ${prog.loadedCarts} cargado(s)` : ''}
                  </small>
                </div>
              ) : null}
              {puede ? (
                <button
                  type="button"
                  className="primary cls-btn-lg"
                  onClick={() =>
                    onClassify({ code: lot.code, isTreated: !!lot.is_treated, postures: lot.postures || [], fromOrder: inOrder })
                  }
                >
                  Clasificar
                </button>
              ) : lot.status === 'planned' && !inOrder ? (
                <p className="hint">Se clasifica cuando llegue a planta.</p>
              ) : null}
            </article>
          )
        })}
      </div>
      <div className="cls-actions">
        <button type="button" className="ghost cls-btn-lg" onClick={onGoCarts}>
          Ir a registrar carros →
        </button>
      </div>
    </section>
  )
}

/* ─── 2 · Registrar carros ───────────────────────────────────────────────── */

function CartsStep({ api, incubation, busy, setBusy, setMsg, wizard, onClearLot, onGoMap, onGoOrder }) {
  const groups = api.groups || []
  const current = groups[0]
  const count = current?.carts.length || 0
  const extra = groups.slice(1).reduce((s, g) => s + g.carts.length, 0)

  return (
    <section className="card wide cls-section">
      <h3 className="cls-section-title">2 · Registrar carros</h3>

      <div className={`cls-load-progress${current?.complete ? ' is-complete' : ''}`}>
        <div className="cls-load-count">
          <strong>
            {count} de {CARTS_PER_MACHINE} carros
          </strong>
          <span>en el cargue actual{extra ? ` · ${extra} carro(s) más esperan el siguiente cargue` : ''}</span>
        </div>
        <div className="cls-bar big">
          <span style={{ width: `${Math.min(100, (count / CARTS_PER_MACHINE) * 100)}%` }} />
        </div>
        {current?.complete ? (
          <button type="button" className="primary cls-btn-lg" onClick={onGoMap}>
            Cargue completo: generar el mapa de cargue →
          </button>
        ) : null}
      </div>

      {wizard.lot ? (
        <p className="cls-lot-banner">
          Registrando carros del <strong>lote {wizard.lot.code}</strong> (ya quedó elegido en el paso «Lotes»).{' '}
          <button type="button" className="ghost small" onClick={onClearLot}>
            Elegir otro lote
          </button>
        </p>
      ) : (
        <p className="hint">
          Toque «Clasificar» en un lote de la <button type="button" className="linkish" onClick={onGoOrder}>orden del día</button>{' '}
          para traerlo ya elegido, o elija el lote en el paso 2 del asistente.
        </p>
      )}

      <CartWizard
        key={wizard.key}
        api={api}
        incubation={incubation}
        busy={busy}
        setBusy={setBusy}
        setMsg={setMsg}
        initialLot={wizard.lot}
      />

      <CartQueue api={api} setMsg={setMsg} confirmRemove />
    </section>
  )
}

/* ─── 3 · Mapa de cargue ─────────────────────────────────────────────────── */

function MapStep({ api, machines, flockRegistry, busy, setBusy, setMsg, printMeta, onGoLoad, onGoCarts }) {
  const groups = useMemo(() => api.groups || [], [api.groups])
  const [groupIndex, setGroupIndex] = useState(0)
  const [machineId, setMachineId] = useState('')
  const [confirmIncomplete, setConfirmIncomplete] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (groupIndex > 0 && !groups[groupIndex]) setGroupIndex(0)
  }, [groups, groupIndex])

  const group = groups[groupIndex]
  const now = new Date()
  const openMaps = api.maps.filter((m) => OPEN_MAP_STATUSES.includes(m.status) && !isStaleOpenMap(m, now))
  const staleMaps = api.maps.filter((m) => isStaleOpenMap(m, now))
  const recentClosed = api.maps
    .filter((m) => ['rejected', 'completed', 'cancelled'].includes(m.status))
    .filter((m) => now.getTime() - Date.parse(m.createdAt || 0) < 7 * 86400000)
    .slice(0, 5)
  const visible = [...openMaps, ...recentClosed]
  const selected = visible.find((m) => m.id === selectedId) || openMaps[0] || recentClosed[0] || null

  const generate = async () => {
    if (busy) return
    setConfirmIncomplete(false)
    if (!group?.carts?.length) {
      setMsg({ kind: 'error', text: 'No hay carros en este cargue. Registre los carros primero.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const m = machines.find((x) => x.id === machineId)
      const res = await api.generateMap({
        machineId: machineId || null,
        machineName: m ? machineLabel(m) : 'Petersime 12 carros',
        plantId: m?.plant_id || null,
        submitForApproval: true,
        groupIndex,
        flockRegistry,
      })
      if (res.error) {
        setMsg({ kind: 'error', text: `No se pudo generar el mapa: ${res.error}` })
        return
      }
      if (!res.map) {
        setMsg({ kind: 'error', text: 'No se obtuvo el mapa. Intente de nuevo.' })
        return
      }
      const warns = res.map.balance?.warnings || []
      setSelectedId(res.map.id)
      setMsg({
        kind: res.local ? 'error' : warns.length ? 'warn' : 'ok',
        text: res.local
          ? 'El mapa quedó guardado SOLO en este equipo (sin conexión): el líder no lo ve todavía.'
          : `Mapa enviado al líder para aprobación · ${num(res.map.summary?.totalEggs)} huevos · ${res.map.summary?.cartCount || group.carts.length} carros.${warns.length ? ` Ojo: ${warns[0]}` : ' Carga balanceada.'}`,
      })
    } catch (e) {
      setMsg({ kind: 'error', text: `Error inesperado al generar el mapa: ${e?.message || e}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card wide cls-section">
      <h3 className="cls-section-title">3 · Mapa de cargue</h3>

      <div className="cls-generate">
        {!groups.length ? (
          <div className="cls-empty">
            <strong>No hay carros en la cola para armar un mapa.</strong>
            <button type="button" className="ghost cls-btn-lg" onClick={onGoCarts}>
              Ir a registrar carros
            </button>
          </div>
        ) : (
          <>
            {groups.length > 1 && (
              <div className="cls-chip-row" role="group" aria-label="Cargue a armar">
                {groups.map((g, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`cls-chip${i === groupIndex ? ' is-on' : ''}`}
                    onClick={() => {
                      setGroupIndex(i)
                      setConfirmIncomplete(false)
                    }}
                  >
                    Cargue {i + 1} · {g.carts.length}/{CARTS_PER_MACHINE}
                  </button>
                ))}
              </div>
            )}
            {group && (
              <p className="cls-generate-info">
                Cargue {groupIndex + 1}: <strong>{group.carts.length} de {CARTS_PER_MACHINE} carros</strong> ·{' '}
                {num(group.totalEggs)} huevos {group.complete ? '· completo' : '· incompleto'}
              </p>
            )}
            {machines.length > 0 && (
              <details className="cls-machine-pick">
                <summary>¿El líder ya le dijo en qué incubadora va? (opcional)</summary>
                <label>
                  Incubadora
                  <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                    <option value="">La asigna el líder al aprobar</option>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {machineLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
              </details>
            )}
            {group?.complete ? (
              <button type="button" className="primary cls-btn-lg" disabled={busy} onClick={generate}>
                {busy ? 'Generando…' : 'Generar mapa y enviar a aprobación'}
              </button>
            ) : group ? (
              confirmIncomplete ? (
                <div className="msg error" role="alertdialog">
                  <strong>
                    El cargue tiene {group.carts.length} de {CARTS_PER_MACHINE} carros.
                  </strong>{' '}
                  Petersime desaconseja iniciar el ciclo con la máquina incompleta: el mapa quedará con posiciones
                  vacías. ¿Lo envía así al líder?
                  <div className="cls-actions">
                    <button type="button" className="primary cls-btn-lg" disabled={busy} onClick={generate}>
                      {busy ? 'Generando…' : 'Sí, enviar incompleto'}
                    </button>
                    <button type="button" className="ghost cls-btn-lg" onClick={() => setConfirmIncomplete(false)}>
                      No, sigo registrando carros
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="ghost cls-btn-lg" disabled={busy} onClick={() => setConfirmIncomplete(true)}>
                  Generar con {group.carts.length} carro(s) (incompleto)…
                </button>
              )
            ) : null}
            <p className="hint">
              El sistema ubica los carros por calor: fechas más viejas al <strong>Centro</strong>, intermedias a las{' '}
              <strong>Paredes</strong> y las más nuevas al <strong>Serpentín</strong> (junto al ventilador), y la
              máquina queda pareja a lado y lado (6/6). El carro con huevo tratado va donde lo marque el mapa.
            </p>
          </>
        )}
      </div>

      {visible.length > 0 && (
        <>
          <h4 className="cls-subtitle">Mapas</h4>
          <div className="cls-chip-row" role="tablist" aria-label="Mapas de cargue">
            {visible.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={selected?.id === m.id}
                className={`cls-map-pick${selected?.id === m.id ? ' is-on' : ''}`}
                onClick={() => setSelectedId(m.id)}
              >
                <strong>{m.machineName || 'Petersime'}</strong>
                <span className={`cls-tag ${mapStatusOf(m).clase}`}>{mapStatusOf(m).texto}</span>
                <small>{fechaHora(m.createdAt)}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <MapDetail
          map={selected}
          api={api}
          busy={busy}
          setBusy={setBusy}
          setMsg={setMsg}
          printMeta={printMeta}
          onGoLoad={onGoLoad}
        />
      )}

      {staleMaps.length > 0 && (
        <div className="cls-stale">
          <strong>Mapas viejos sin terminar ({staleMaps.length})</strong>
          <p className="hint">
            Llevan más de una semana abiertos y sus carros siguen apartados. No se tocan desde aquí: avise a su líder
            para que los cierre.
          </p>
          <ul>
            {staleMaps.map((m) => (
              <li key={m.id}>
                {m.machineName || 'Petersime'} · {mapStatusOf(m).texto} · {fechaHora(m.createdAt)} ·{' '}
                {m.summary?.cartCount || m.cartIds?.length || 0} carros
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function PrintButtons({ map, printMeta, setMsg }) {
  const print = () => {
    try {
      const r = openLoadMapPrint(map, printMeta(map))
      if (r === false || r?.error) {
        setMsg({
          kind: 'error',
          text: r?.error || 'El navegador no abrió la ventana para imprimir. Permita las ventanas emergentes de IncubApp.',
        })
      }
    } catch (e) {
      setMsg({ kind: 'error', text: `No se pudo abrir el formato para imprimir: ${e?.message || e}` })
    }
  }
  const download = async () => {
    try {
      await downloadLoadMapImage(map, `mapa-cargue-${String(map.createdAt || '').slice(0, 10) || map.id}.png`)
    } catch (e) {
      setMsg({ kind: 'error', text: `No se pudo descargar la imagen: ${e?.message || e}` })
    }
  }
  return (
    <div className="cls-actions">
      <button type="button" className="ghost cls-btn-lg" onClick={print}>
        🖨 Imprimir / PDF del mapa
      </button>
      <button type="button" className="ghost cls-btn-lg" onClick={download}>
        ⬇ Descargar imagen
      </button>
    </div>
  )
}

function MapDetail({ map, api, busy, setBusy, setMsg, printMeta, onGoLoad }) {
  const st = mapStatusOf(map)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const run = async (fn, okText) => {
    setBusy(true)
    const r = await fn(map.id)
    setBusy(false)
    setConfirmDiscard(false)
    if (r?.error) setMsg({ kind: 'error', text: r.error })
    else setMsg({ kind: r?.warning ? 'warn' : 'ok', text: r?.warning ? `${okText} Ojo: ${r.warning}` : okText })
  }

  return (
    <div className="cls-map-detail">
      <div className={`cls-map-status ${st.clase}`}>
        <strong>{st.texto}</strong>
        <span>
          {map.machineName || 'Petersime'} · {map.summary?.cartCount || map.cartIds?.length || 0} carros ·{' '}
          {num(map.summary?.totalEggs)} huevos · creado {fechaHora(map.createdAt)}
          {map.status === 'completed' && (map.loadedAt || map.loaded_at) ? ` · cargado ${fechaHora(map.loadedAt || map.loaded_at)}` : ''}
        </span>
        {map.status === 'rejected' && (
          <p className="cls-reject">
            Motivo del líder: <strong>{map.rejectedReason || 'no dejó motivo escrito'}</strong>. Los carros volvieron
            a la cola: corrija lo que haga falta y genere el mapa de nuevo.
          </p>
        )}
        {map.status === 'pending_approval' && (
          <p className="hint">El líder lo revisa en su pantalla. Usted no tiene que hacer nada más con este mapa.</p>
        )}
        {map.status === 'approved' && <p className="hint">Espere la orden de cargue del líder.</p>}
      </div>

      {map.balance && !map.balance.ok && (map.balance.warnings || []).length > 0 && (
        <ul className="cls-warnings">
          {map.balance.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <MapAscii view={withLotLabels(map)} />

      <PrintButtons map={map} printMeta={printMeta} setMsg={setMsg} />

      {map.status === 'draft' && (
        <div className="cls-actions">
          <button
            type="button"
            className="primary cls-btn-lg"
            disabled={busy}
            onClick={() => run(api.submitMapForApproval, 'Mapa enviado al líder para aprobación.')}
          >
            Enviar a aprobación del líder
          </button>
          {confirmDiscard ? (
            <>
              <button
                type="button"
                className="ghost cls-btn-lg"
                disabled={busy}
                onClick={() => run(api.discardDraftMap, 'Borrador descartado: sus carros volvieron a la cola.')}
              >
                Sí, descartar el borrador
              </button>
              <button type="button" className="ghost cls-btn-lg" onClick={() => setConfirmDiscard(false)}>
                No
              </button>
            </>
          ) : (
            <button type="button" className="ghost cls-btn-lg" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              Descartar borrador…
            </button>
          )}
        </div>
      )}
      {map.status === 'ordered' && (
        <div className="cls-actions">
          <button type="button" className="primary cls-btn-lg" onClick={onGoLoad}>
            Ir a cargar la máquina →
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── 4 · Cargar la máquina ──────────────────────────────────────────────── */

function LoadStep({ api, machines, busy, setBusy, setMsg, printMeta, onGoMap }) {
  const ordered = api.maps.filter((m) => m.status === 'ordered' && !isStaleOpenMap(m)) // los de hace más de 7 días son restos viejos: no se ofrecen para cargar
  const waiting = api.maps.filter((m) => ['pending_approval', 'approved'].includes(m.status) && !isStaleOpenMap(m))

  return (
    <section className="card wide cls-section">
      <h3 className="cls-section-title">4 · Cargar la máquina</h3>
      {!ordered.length ? (
        <div className="cls-empty">
          <strong>Todavía no hay orden de cargue.</strong>
          <p className="hint">
            {waiting.some((m) => m.status === 'approved')
              ? 'El líder ya aprobó el mapa; falta que dé la orden de cargue.'
              : waiting.length
                ? 'El mapa está esperando la aprobación del líder.'
                : 'Primero genere el mapa de cargue y envíelo al líder.'}
          </p>
          <button type="button" className="ghost cls-btn-lg" onClick={onGoMap}>
            Ver el mapa de cargue
          </button>
        </div>
      ) : (
        ordered.map((m) => (
          <LoadOrderCard
            key={m.id}
            map={m}
            api={api}
            machines={machines}
            busy={busy}
            setBusy={setBusy}
            setMsg={setMsg}
            printMeta={printMeta}
          />
        ))
      )}
    </section>
  )
}

function LoadOrderCard({ map, api, machines, busy, setBusy, setMsg, printMeta }) {
  const guide = useMemo(() => map.placementGuide || buildOperatorPlacementGuide(map), [map])
  const [placed, setPlaced] = useState(() => readPlaced(map.id))
  const [showMap, setShowMap] = useState(false)
  const keyOf = (r) => `${r.cartNo}-${r.machinePos}`
  const done = guide.filter((r) => placed.has(keyOf(r))).length
  const missing = guide.length - done

  const toggle = (key) => {
    setPlaced((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      writePlaced(map.id, next)
      return next
    })
  }

  return (
    <div className="cls-order-card">
      <div className="cls-map-status accent">
        <strong>Orden de cargue · {map.machineName || 'Petersime'}</strong>
        <span>
          Orden dada {fechaHora(map.orderedAt)} · {guide.length} carros · {num(map.summary?.totalEggs)} huevos
        </span>
      </div>

      <h4 className="cls-subtitle">Lleve cada carro a su ubicación y tóquelo al dejarlo</h4>
      <p className={`cls-placed-count${missing === 0 && guide.length ? ' is-done' : ''}`}>
        <strong>
          {done} de {guide.length}
        </strong>{' '}
        carros ubicados{missing > 0 ? ` · faltan ${missing}` : ' · ¡todos en su sitio!'}
      </p>
      <OperatorPlacementTable map={map} placed={placed} onToggle={toggle} />

      <div className="cls-actions">
        <button type="button" className="ghost cls-btn-lg" onClick={() => setShowMap((v) => !v)}>
          {showMap ? 'Ocultar el mapa' : 'Ver el mapa de la máquina'}
        </button>
      </div>
      {showMap && <MapAscii view={withLotLabels(map)} />}
      <PrintButtons map={map} printMeta={printMeta} setMsg={setMsg} />

      <CompleteLoadForm map={map} api={api} machines={machines} busy={busy} setBusy={setBusy} setMsg={setMsg} missing={missing} />
    </div>
  )
}

/** Selector de fecha (Hoy / Ayer) + hora + botón «Ahora», cómodo en celular. */
function WhenPicker({ label, date, time, onChange, idPrefix }) {
  const today = localDateOf(new Date())
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterday = localDateOf(y)
  return (
    <fieldset className="cls-when">
      <legend>{label}</legend>
      <div className="cls-chip-row">
        <button type="button" className={`cls-chip${date === today ? ' is-on' : ''}`} onClick={() => onChange({ date: today, time })}>
          Hoy
        </button>
        <button
          type="button"
          className={`cls-chip${date === yesterday ? ' is-on' : ''}`}
          onClick={() => onChange({ date: yesterday, time })}
        >
          Ayer
        </button>
        <label className="cls-time" htmlFor={`${idPrefix}-hora`}>
          Hora
          <input
            id={`${idPrefix}-hora`}
            type="time"
            value={time}
            onChange={(e) => onChange({ date, time: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="cls-chip"
          onClick={() => {
            const n = new Date()
            onChange({ date: localDateOf(n), time: localTimeOf(n) })
          }}
        >
          Ahora
        </button>
      </div>
      <small className="hint">{date === today ? 'Hoy' : date === yesterday ? 'Ayer' : date} a las {time || '—'}</small>
    </fieldset>
  )
}

function CompleteLoadForm({ map, api, machines, busy, setBusy, setMsg, missing }) {
  const [open, setOpen] = useState(false)
  const [machineId, setMachineId] = useState(map.machineId || '')
  const [changeMachine, setChangeMachine] = useState(false)
  const [load, setLoad] = useState(() => {
    const n = new Date()
    return { date: localDateOf(n), time: localTimeOf(n) }
  })
  const [sameCycle, setSameCycle] = useState(true)
  const [cycle, setCycle] = useState(load)
  const [formError, setFormError] = useState(null)

  const assigned = machines.find((m) => m.id === map.machineId)

  const confirm = async () => {
    setFormError(null)
    const mId = machineId || map.machineId
    if (!mId) {
      setFormError('Elija la incubadora donde quedó el cargue.')
      return
    }
    const loadedAt = isoFrom(load.date, load.time)
    const cycleStartAt = sameCycle ? loadedAt : isoFrom(cycle.date, cycle.time)
    if (!loadedAt || !cycleStartAt) {
      setFormError('Revise la fecha y la hora: falta la hora o no es válida.')
      return
    }
    const limite = Date.now() + 5 * 60000
    if (Date.parse(loadedAt) > limite || Date.parse(cycleStartAt) > limite) {
      setFormError('La hora no puede ser del futuro. Toque «Ahora» o corrija la hora.')
      return
    }
    if (Date.parse(cycleStartAt) < Date.parse(loadedAt)) {
      setFormError('El ciclo de incubación no puede empezar antes del cargue.')
      return
    }
    const m = machines.find((x) => x.id === mId)
    setBusy(true)
    const r = await api.completeLoad(map.id, {
      machineId: mId,
      machineName: m ? machineLabel(m) : map.machineName || 'Petersime',
      plantId: m?.plant_id || map.plantId || null,
      loadedAt,
      cycleStartAt,
    })
    setBusy(false)
    if (r?.error) {
      setFormError(`No se pudo completar el cargue: ${r.error}`)
      return
    }
    setOpen(false)
    setMsg({
      kind: r?.warning ? 'warn' : 'ok',
      text: r?.warning
        ? `Cargue completado, pero con avisos: ${r.warning}. Avise a su líder.`
        : `Cargue completado en ${m ? machineLabel(m) : map.machineName || 'la incubadora'}. ¡Buen trabajo!`,
    })
  }

  if (!open) {
    return (
      <div className="cls-actions">
        <button
          type="button"
          className="primary cls-btn-lg"
          disabled={busy || missing > 0}
          onClick={() => setOpen(true)}
          title={missing > 0 ? 'Primero ubique todos los carros' : undefined}
        >
          {missing > 0 ? `Completar cargue (faltan ${missing} carros por ubicar)` : '✔ Completar cargue'}
        </button>
      </div>
    )
  }

  return (
    <div className="cls-complete">
      <h4 className="cls-subtitle">Completar cargue</h4>
      {map.machineId && !changeMachine ? (
        <p>
          Incubadora: <strong>{assigned ? machineLabel(assigned) : map.machineName || 'asignada por el líder'}</strong>{' '}
          {machines.length > 0 && (
            <button type="button" className="ghost small" onClick={() => setChangeMachine(true)}>
              No es esa
            </button>
          )}
        </p>
      ) : machines.length ? (
        <label>
          Incubadora donde quedó el cargue
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">— Elija la incubadora —</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {machineLabel(m)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="msg error">No se pudo leer la lista de incubadoras. Avise a su líder antes de completar.</p>
      )}

      <WhenPicker label="Fecha y hora del cargue" date={load.date} time={load.time} onChange={setLoad} idPrefix={`carga-${map.id}`} />

      <label className="cls-check">
        <input type="checkbox" checked={sameCycle} onChange={(e) => setSameCycle(e.target.checked)} />
        El ciclo de incubación empezó a la misma hora del cargue
      </label>
      {!sameCycle && (
        <WhenPicker
          label="Inicio del ciclo de incubación"
          date={cycle.date}
          time={cycle.time}
          onChange={setCycle}
          idPrefix={`ciclo-${map.id}`}
        />
      )}

      {formError && (
        <p className="msg error" role="alert">
          {formError}
        </p>
      )}
      <div className="cls-actions">
        <button type="button" className="primary cls-btn-lg" disabled={busy || missing > 0} onClick={confirm}>
          {busy ? 'Guardando…' : '✔ Confirmar: la máquina quedó cargada'}
        </button>
        <button type="button" className="ghost cls-btn-lg" disabled={busy} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
