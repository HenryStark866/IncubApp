/**
 * Inicio de la líder de producción (06-10-2026): en tiempo real, lo que necesita su
 * decisión, recepción de lotes, cuarto frío desglosable (lote / fecha / granja / galpón),
 * mapas de cargue para revisar (aprobar, observar o rechazar), estado y contenido de las
 * máquinas, transferencias y nacimientos, y su equipo (lo que registra cada auxiliar y
 * las tareas que les asigna).
 */
import { useMemo, useState } from 'react'
import { useLeaderHome } from '../hooks/useLeaderHome'
import { useLoadClassification } from '../../../hooks/useLoadClassification'
import { createShiftActivity } from '../../../hooks/useShiftOps'
import { supabase } from '../../../lib/supabase'
import {
  COLD_TYPES,
  coldRoomGroups,
  machineStates,
  teamRecords,
  productionBoard,
  lotsOfMap,
  posturesOf,
  fmtDay,
  fmtTime,
  VAC_KINDS,
} from '../lib/productionHome'
import { stockByProduct } from '../../../lib/vaccineStock'
import './LeaderAreaHome.css'
import './ProductionLeaderHome.css'

const num = (n) => Number(n || 0).toLocaleString('es-CO')
const SECCIONES = [
  ['maquinas', '🏭', 'Máquinas'],
  ['recepcion', '🚚', 'Recepción'],
  ['frio', '❄️', 'Cuarto frío'],
  ['mapas', '🗺️', 'Mapas de cargue'],
  ['movimientos', '🐣', 'Transferencias y nacimientos'],
  ['calidad', '🔬', 'Calidad'],
  ['vacunacion', '💉', 'Vacunación'],
  ['equipo', '👥', 'Equipo y tareas'],
]

/** Observación del líder en un mapa de cargue (queda en payload.observaciones). */
async function observarMapa(mapId, { userId, userName, texto }) {
  const { data, error } = await supabase.from('load_maps').select('payload').eq('id', mapId).single()
  if (error) return { error: error.message }
  const payload = data?.payload || {}
  const observaciones = [
    ...(Array.isArray(payload.observaciones) ? payload.observaciones : []),
    { at: new Date().toISOString(), by: userId, name: userName || null, text: texto.trim() },
  ]
  const { error: e2 } = await supabase.from('load_maps').update({ payload: { ...payload, observaciones } }).eq('id', mapId)
  return { error: e2?.message || null }
}

export default function ProductionLeaderHome({ orgId, userId, userName, onNavigate }) {
  const home = useLeaderHome({ kind: 'production', orgId })
  const { data } = home
  const [seccion, setSeccion] = useState('maquinas')
  const [msg, setMsg] = useState(null)

  const vista = useMemo(() => {
    if (!data) return null
    const states = machineStates({
      machines: data.machines,
      loads: data.loads,
      transfers: data.transfers,
      checks: data.checks,
      workOrders: data.workOrders,
    })
    const stockGroups = coldRoomGroups({ stock: data.stock, batches: data.batches, farms: data.farms, rooms: data.rooms })
    const board = productionBoard({ ...data, states, stockGroups })
    const team = teamRecords({ ...data, maps: data.maps })
    return { states, stockGroups, board, team }
  }, [data])

  const ir = (s) => {
    setSeccion(s)
    setTimeout(() => document.getElementById('prod-seccion')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  return (
    <div className="lh-root prod-root" data-kind="production">
      <header className="prod-head">
        <div>
          <h1>Producción</h1>
          <span>
            <i className="prod-vivo" /> En vivo
            {home.updatedAt ? ` · actualizado ${fmtTime(home.updatedAt)}` : ''}
          </span>
        </div>
        <button type="button" className="lh-btn" onClick={home.reload} disabled={home.loading}>
          {home.loading ? 'Actualizando…' : '↻ Actualizar'}
        </button>
      </header>
      {home.error && <p className="lh-msg is-error">{home.error}</p>}
      {msg && <p className={`lh-msg ${msg.error ? 'is-error' : 'is-ok'}`}>{msg.text}</p>}

      {!vista ? (
        <div className="lh-card">
          <p className="lh-empty">{home.loading ? 'Cargando producción…' : 'Sin datos todavía.'}</p>
        </div>
      ) : (
        <>
          <section className="lh-section">
            <div className="lh-sec-head">
              <h2>Necesita tu decisión · {vista.board.decisions.length}</h2>
              <span>lo más urgente primero</span>
            </div>
            <div className="lh-card">
              {vista.board.decisions.length === 0 ? (
                <p className="lh-empty">Nada pendiente. Producción en orden.</p>
              ) : (
                vista.board.decisions.map((d) => (
                  <div key={d.id} className={`lh-dec tone-${d.tone}`}>
                    <span className="lh-sev" aria-hidden="true" />
                    <div className="lh-dec-main">
                      <b>{d.title}</b>
                      {d.detail && <span>{d.detail}</span>}
                    </div>
                    <div className="lh-dec-actions">
                      {d.mapId ? (
                        <button type="button" className="lh-btn lh-btn-p" onClick={() => ir('mapas')}>
                          Revisar mapa
                        </button>
                      ) : d.tab ? (
                        <button type="button" className="lh-btn" onClick={() => onNavigate?.(d.tab)}>
                          Ver
                        </button>
                      ) : (
                        <button type="button" className="lh-btn" onClick={() => ir('equipo')}>
                          Ver equipo
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="lh-kpis">
            {vista.board.kpis.map((k) => (
              <div key={k.label} className={`lh-card lh-kpi${k.tone ? ` tone-${k.tone}` : ''}`}>
                <span>{k.label}</span>
                <b>{k.value}</b>
                <small>{k.sub}</small>
              </div>
            ))}
          </div>

          <nav className="prod-nav" aria-label="Secciones de producción">
            {SECCIONES.map(([id, icono, label]) => (
              <button
                key={id}
                type="button"
                className={seccion === id ? 'prod-tab on' : 'prod-tab'}
                aria-pressed={seccion === id}
                onClick={() => setSeccion(id)}
              >
                <span className="prod-tab-ico" aria-hidden="true">
                  {icono}
                </span>
                {label}
              </button>
            ))}
          </nav>

          <div id="prod-seccion">
            {seccion === 'maquinas' && <Maquinas states={vista.states} onNavigate={onNavigate} />}
            {seccion === 'recepcion' && <Recepcion lots={data.lots} arrivals={data.arrivals} people={data.members} onNavigate={onNavigate} />}
            {seccion === 'frio' && <CuartoFrio data={data} />}
            {seccion === 'mapas' && (
              <MapasReview
                orgId={orgId}
                userId={userId}
                userName={userName}
                onDone={(text, error) => {
                  setMsg({ text, error })
                  home.reload()
                }}
              />
            )}
            {seccion === 'calidad' && <CalidadResumen quality={(data.quality || []).filter((q) => !VAC_KINDS.includes(q.kind))} onNavigate={onNavigate} />}
            {seccion === 'vacunacion' && (
              <VacunacionResumen
                quality={(data.quality || []).filter((q) => VAC_KINDS.includes(q.kind))}
                products={data.vaccineProducts || []}
                movements={data.vaccineMovements || []}
                onNavigate={onNavigate}
              />
            )}
            {seccion === 'movimientos' && (
              <Movimientos transfers={data.transfers} hatches={data.hatches} machines={data.machines} onNavigate={onNavigate} />
            )}
            {seccion === 'equipo' && (
              <Equipo
                team={vista.team}
                tasks={data.tasks}
                machines={data.machines}
                orgId={orgId}
                userId={userId}
                onNavigate={onNavigate}
                onDone={(text, error) => {
                  setMsg({ text, error })
                  if (!error) home.reload()
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Seccion({ titulo, sub, extra, children }) {
  return (
    <section className="lh-section">
      <div className="lh-sec-head">
        <h2>{titulo}</h2>
        {sub && <span>{sub}</span>}
        {extra}
      </div>
      {children}
    </section>
  )
}

/* ─────────────── Máquinas y su contenido ─────────────── */
function Maquinas({ states, onNavigate }) {
  const [filtro, setFiltro] = useState('todas')
  const [abierta, setAbierta] = useState(null)
  const lista = states.filter((s) =>
    filtro === 'huevo' ? s.occupied : filtro === 'transferir' ? s.dueTransfer : filtro === 'alerta' ? ['fault', 'warning'].includes(s.condition) : true,
  )
  const grupos = [
    ['setter', 'Incubadoras'],
    ['hatcher', 'Nacedoras'],
  ]
  return (
    <Seccion
      titulo="Máquinas en tiempo real"
      sub="contenido, día del ciclo y última ronda"
      extra={
        <select className="lh-select" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar máquinas">
          <option value="todas">Todas</option>
          <option value="huevo">Con huevo</option>
          <option value="transferir">Para transferir</option>
          <option value="alerta">En alerta o falla</option>
        </select>
      }
    >
      {grupos.map(([kind, titulo]) => {
        const items = lista.filter((s) => s.kind === kind)
        if (!items.length) return null
        return (
          <div key={kind} className="prod-maq-grupo">
            <h3>
              {titulo} · {items.filter((s) => s.occupied).length} con huevo de {items.length}
            </h3>
            <div className="prod-maq-grid">
              {items.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`prod-maq${s.occupied ? ' llena' : ''}${s.condition ? ` c-${s.condition}` : ''}${s.dueTransfer ? ' due' : ''}${abierta === s.id ? ' abierta' : ''}`}
                  onClick={() => setAbierta(abierta === s.id ? null : s.id)}
                  aria-expanded={abierta === s.id}
                >
                  <span className="prod-maq-code">{s.code}</span>
                  <span className="prod-maq-estado">
                    {s.occupied ? (s.kind === 'setter' ? `Día ${s.day}` : `${s.day === 0 ? 'Hoy' : `Hace ${s.day} d`}`) : 'Libre'}
                  </span>
                  <span className="prod-maq-lotes">{s.lots.length ? `Lote ${s.lots.join(', ')}` : '—'}</span>
                  {abierta === s.id && (
                    <span className="prod-maq-det">
                      {s.since && <span>{s.kind === 'setter' ? 'Ciclo desde' : 'Transferida'} {fmtDay(s.since)} {fmtTime(s.since)}</span>}
                      {s.detail.map((d, i) => (
                        <span key={i}>
                          · {d.lote} {d.at ? `(${fmtDay(d.at)})` : ''}
                        </span>
                      ))}
                      <span>
                        Última ronda: {s.lastCheckAt ? `${fmtTime(s.lastCheckAt)} · ${({ normal: 'normal', warning: 'alerta', fault: 'falla', off: 'apagada' })[s.condition] || s.condition}` : 'sin ronda en 24 h'}
                      </span>
                      {(s.temp != null || s.humidity != null) && (
                        <span>
                          {s.temp != null ? `${s.temp} °F` : ''} {s.humidity != null ? `· ${s.humidity} % HR` : ''}
                        </span>
                      )}
                      {s.openOrders > 0 && <span>{s.openOrders} OT abierta(s)</span>}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <div className="prod-links">
        <button type="button" className="lh-btn" onClick={() => onNavigate?.('monitoreo')}>
          Monitoreo completo
        </button>
        <button type="button" className="lh-btn" onClick={() => onNavigate?.('mapa-3d')}>
          Mapa 3D de la planta
        </button>
      </div>
    </Seccion>
  )
}

/* ─────────────── Recepción ─────────────── */
function Recepcion({ lots, arrivals, people, onNavigate }) {
  const nombre = new Map(people.map((p) => [p.id, p.name]))
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
  const porLlegar = lots.filter((l) => l.expected_arrival_date >= hoy && !['arrived', 'cancelled', 'classifying', 'loaded'].includes(l.status))
  const lotById = new Map(lots.map((l) => [l.id, l]))
  return (
    <Seccion titulo="Recepción de lotes" sub="en vivo · últimos 7 días">
      <div className="lh-card prod-lista">
        <h3 className="prod-sub">Por llegar ({porLlegar.length})</h3>
        {porLlegar.length === 0 && <p className="lh-empty">No hay lotes programados por llegar.</p>}
        {porLlegar.slice(0, 12).map((l) => (
          <div key={l.id} className="prod-fila">
            <b>Lote {l.code}</b>
            <span>{l.origin || 'Granja'} · {num(posturesOf(l.postures))} esperados</span>
            <em>{fmtDay(l.expected_arrival_date)}</em>
          </div>
        ))}
        <h3 className="prod-sub">Recibidos ({arrivals.length})</h3>
        {arrivals.length === 0 && <p className="lh-empty">Sin recepciones en los últimos 7 días.</p>}
        {arrivals.map((a) => {
          const esperado = posturesOf(lotById.get(a.lot_id)?.postures)
          const diff = esperado ? posturesOf(a.received_postures) - esperado : null
          return (
            <div key={a.id} className="prod-fila">
              <b>Lote {a.lot_code || '—'}</b>
              <span>
                {num(posturesOf(a.received_postures))} recibidos
                {diff != null && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${num(diff)} vs esperado)` : ''}
                {a.photo_paths?.length ? ` · 📷 ${a.photo_paths.length}` : ''}
                {a.received_by ? ` · ${nombre.get(a.received_by) || 'recepción'}` : ''}
              </span>
              <em>
                {fmtDay(a.arrived_at)} {fmtTime(a.arrived_at)}
              </em>
            </div>
          )
        })}
      </div>
      <div className="prod-links">
        <button type="button" className="lh-btn" onClick={() => onNavigate?.('recepcion')}>
          Abrir Recepción
        </button>
      </div>
    </Seccion>
  )
}

/* ─────────────── Cuarto frío ─────────────── */
function CuartoFrio({ data }) {
  const [por, setPor] = useState('batch')
  const [buscar, setBuscar] = useState('')
  const res = useMemo(
    () => coldRoomGroups({ stock: data.stock, batches: data.batches, farms: data.farms, rooms: data.rooms, groupBy: por }),
    [data, por],
  )
  const q = buscar.trim().toLowerCase()
  const grupos = q
    ? res.groups.filter((g) => [g.key, ...g.rows.flatMap((r) => [r.lote, r.granja, r.galpon])].some((t) => String(t).toLowerCase().includes(q)))
    : res.groups
  return (
    <Seccion
      titulo="Cuarto frío · inventario"
      sub={`${num(res.totals.incubable)} incubables · ${num(res.totals.total)} en total`}
      extra={
        <div className="prod-frio-ctrl">
          <select className="lh-select" value={por} onChange={(e) => setPor(e.target.value)} aria-label="Agrupar por">
            <option value="batch">Por lote</option>
            <option value="date">Por fecha</option>
            <option value="farm">Por granja</option>
            <option value="barn">Por galpón</option>
          </select>
          <input className="lh-select" type="search" placeholder="Buscar…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
      }
    >
      <div className="lh-card prod-frio">
        <div className="prod-frio-row prod-frio-head">
          <span>{{ batch: 'Lote', date: 'Fecha', farm: 'Granja', barn: 'Granja · galpón' }[por]}</span>
          {COLD_TYPES.map(([k, l]) => (
            <span key={k}>{l}</span>
          ))}
          <span>Total</span>
        </div>
        {grupos.length === 0 && <p className="lh-empty">No hay saldos en el cuarto frío.</p>}
        {grupos.map((g) => (
          <details key={g.key} className="prod-frio-grupo">
            <summary className="prod-frio-row">
              <span>{por === 'date' ? fmtDay(g.key) : g.key}</span>
              {COLD_TYPES.map(([k]) => (
                <span key={k}>{num(g.counts[k])}</span>
              ))}
              <b>{num(g.total)}</b>
            </summary>
            {g.rows.map((r) => (
              <div key={r.id} className="prod-frio-row prod-frio-det">
                <span>
                  Lote {r.lote} · {fmtDay(r.fecha)} · {r.granja} · {r.galpon}
                </span>
                {COLD_TYPES.map(([k]) => (
                  <span key={k}>{num(r.counts[k])}</span>
                ))}
                <span>{num(r.total)}</span>
              </div>
            ))}
          </details>
        ))}
        {grupos.length > 0 && (
          <div className="prod-frio-row prod-frio-total">
            <span>Total</span>
            {COLD_TYPES.map(([k]) => (
              <span key={k}>{num(res.totals[k])}</span>
            ))}
            <b>{num(res.totals.total)}</b>
          </div>
        )}
      </div>
    </Seccion>
  )
}

/* ─────────────── Mapas de cargue: revisar, observar, aprobar o rechazar ─────────────── */
function MapasReview({ orgId, userId, userName, onDone }) {
  const api = useLoadClassification(orgId, userId)
  const [abierto, setAbierto] = useState(null)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(null)
  const pendientes = api.maps.filter((m) => m.status === 'pending_approval')
  const enCurso = api.maps.filter((m) => m.status === 'approved' || m.status === 'ordered')
  const recientes = api.maps
    .filter((m) => ['rejected', 'completed'].includes(m.status))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 8)

  const accion = async (m, tipo) => {
    if ((tipo === 'rechazar' || tipo === 'observar') && texto.trim().length < 5) {
      onDone('Escriba el motivo u observación (mínimo 5 caracteres).', true)
      return
    }
    setBusy(`${m.id}-${tipo}`)
    let res
    if (tipo === 'aprobar') {
      if (texto.trim()) await observarMapa(m.id, { userId, userName, texto: `Aprobado: ${texto}` })
      res = await api.approveMap(m.id)
    } else if (tipo === 'rechazar') {
      await observarMapa(m.id, { userId, userName, texto: `Rechazado: ${texto}` })
      res = await api.rejectMap(m.id, texto.trim())
    } else {
      res = await observarMapa(m.id, { userId, userName, texto })
      if (!res.error) {
        try {
          await supabase.from('notifications').insert({
            org_id: orgId,
            title: 'Observación en un mapa de cargue',
            body: `${m.machineName || 'Mapa'}: ${texto.trim()}`,
            kind: 'load_map',
            created_by: userId,
          })
        } catch {
          /* el aviso no frena la observación */
        }
      }
    }
    setBusy(null)
    if (!res?.error) {
      setTexto('')
      setAbierto(null)
      await api.reload()
    }
    onDone(
      res?.error ||
        {
          aprobar: `Mapa aprobado${res?.asignada ? ` · incubadora asignada: ${res.asignada}` : ''}`,
          rechazar: 'Mapa rechazado: los carros vuelven a la cola de recepción',
          observar: 'Observación enviada',
        }[tipo],
      Boolean(res?.error),
    )
  }

  // Función de render (no componente): así el cuadro de texto no pierde el foco al escribir
  const tarjeta = (m, editable) => {
    const lots = lotsOfMap(m)
    const obs = Array.isArray(m.observaciones) ? m.observaciones : []
    const abiertoEste = abierto === m.id
    return (
      <div key={m.id} className={`prod-mapa${abiertoEste ? ' abierto' : ''}`}>
        <button type="button" className="prod-mapa-top" onClick={() => setAbierto(abiertoEste ? null : m.id)} aria-expanded={abiertoEste}>
          {m.imageDataUrl ? <img src={m.imageDataUrl} alt={`Mapa ${m.machineName || ''}`} /> : <span className="prod-mapa-sin">🗺️</span>}
          <span className="prod-mapa-info">
            <b>{m.machineName || 'Sin incubadora asignada'}</b>
            <span>
              {num(m.summary?.totalEggs)} huevos · {m.summary?.totalTrays || 0} bandejas · lotes {lots.join(', ') || '—'}
            </span>
            <span>
              {{ pending_approval: 'Por aprobar', approved: 'Aprobado', ordered: 'Orden emitida', rejected: 'Rechazado', completed: 'Cargado' }[m.status] || m.status}
              {' · '}
              {fmtDay(m.createdAt)} {fmtTime(m.createdAt)}
              {m.rejectedReason && m.status === 'rejected' ? ` · ${m.rejectedReason}` : ''}
            </span>
          </span>
        </button>
        {abiertoEste && (
          <div className="prod-mapa-cuerpo">
            {m.imageDataUrl && (
              <a href={m.imageDataUrl} target="_blank" rel="noreferrer" className="prod-mapa-grande">
                <img src={m.imageDataUrl} alt="Mapa de cargue completo" />
              </a>
            )}
            {obs.length > 0 && (
              <div className="prod-obs">
                {obs.map((o, i) => (
                  <p key={i}>
                    <b>{o.name || 'Líder'}</b> · {fmtDay(o.at)} {fmtTime(o.at)}: {o.text}
                  </p>
                ))}
              </div>
            )}
            {editable ? (
              <>
                <textarea
                  className="prod-texto"
                  rows={2}
                  placeholder="Observación o motivo del rechazo…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <div className="prod-acciones">
                  <button type="button" className="lh-btn" disabled={Boolean(busy)} onClick={() => accion(m, 'observar')}>
                    💬 Observación
                  </button>
                  <button type="button" className="lh-btn prod-rechazar" disabled={Boolean(busy)} onClick={() => accion(m, 'rechazar')}>
                    ✕ Rechazar
                  </button>
                  <button type="button" className="lh-btn lh-btn-p" disabled={Boolean(busy)} onClick={() => accion(m, 'aprobar')}>
                    {busy === `${m.id}-aprobar` ? 'Aprobando…' : '✓ Aprobar'}
                  </button>
                </div>
              </>
            ) : (
              m.status !== 'rejected' &&
              m.status !== 'completed' && (
                <>
                  <textarea
                    className="prod-texto"
                    rows={2}
                    placeholder="Observación para el equipo…"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                  <div className="prod-acciones">
                    <button type="button" className="lh-btn" disabled={Boolean(busy)} onClick={() => accion(m, 'observar')}>
                      💬 Observación
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Seccion titulo={`Mapas de cargue · ${pendientes.length} por revisar`} sub="toque un mapa para verlo completo">
      {api.loading && !api.maps.length && <p className="lh-empty">Cargando mapas…</p>}
      {api.error && <p className="lh-msg is-error">{api.error}</p>}
      <div className="prod-mapas">
        {pendientes.length === 0 && !api.loading && <p className="lh-empty">No hay mapas esperando aprobación.</p>}
        {pendientes.map((m) => tarjeta(m, true))}
      </div>
      {enCurso.length > 0 && (
        <>
          <h3 className="prod-sub">Aprobados y en cargue ({enCurso.length})</h3>
          <div className="prod-mapas">
            {enCurso.map((m) => tarjeta(m, false))}
          </div>
        </>
      )}
      {recientes.length > 0 && (
        <>
          <h3 className="prod-sub">Recientes</h3>
          <div className="prod-mapas">
            {recientes.map((m) => tarjeta(m, false))}
          </div>
        </>
      )}
    </Seccion>
  )
}

/* ─────────────── Transferencias y nacimientos ─────────────── */
function Movimientos({ transfers, hatches, machines, onNavigate }) {
  const code = new Map(machines.map((m) => [m.id, m.code || m.name]))
  const nacs = [...hatches].sort((a, b) =>
    String(b.ended_at || b.started_at || b.scheduled_at || b.created_at).localeCompare(String(a.ended_at || a.started_at || a.scheduled_at || a.created_at)),
  )
  return (
    <>
      <Seccion titulo={`Transferencias · ${transfers.length}`} sub="últimos 30 días">
        <div className="lh-card prod-lista">
          {transfers.length === 0 && <p className="lh-empty">Sin transferencias en 30 días.</p>}
          {transfers.slice(0, 40).map((t) => (
            <div key={t.id} className="prod-fila">
              <b>
                {code.get(t.source_machine_id) || 'Incubadora'} → {(t.hatcher_ids || []).map((h) => code.get(h)).filter(Boolean).join(', ') || 'nacedoras'}
              </b>
              <span>
                Lote {t.lote || '—'}
                {t.origen ? ' · reportada por WhatsApp' : ''}
                {t.origen?.observaciones?.length ? ` · ⚠ ${t.origen.observaciones.length} observación(es)` : ''}
              </span>
              <em>
                {fmtDay(t.transferred_at)} {fmtTime(t.transferred_at)}
              </em>
            </div>
          ))}
        </div>
      </Seccion>
      <Seccion titulo={`Nacimientos · ${hatches.length}`} sub="últimos 30 días">
        <div className="lh-card prod-lista">
          {nacs.length === 0 && <p className="lh-empty">Sin nacimientos en 30 días.</p>}
          {nacs.slice(0, 40).map((h) => (
            <div key={h.id} className="prod-fila">
              <b>Lote {h.lote || '—'}</b>
              <span>
                {h.actual_chicks ? `${num(h.actual_chicks)} pollitos` : { planned: 'Programado', in_progress: 'En curso', completed: 'Terminado' }[h.status] || h.status}
                {h.females_count ? ` · ${num(h.females_count)} hembras` : ''}
                {h.males_count ? ` · ${num(h.males_count)} machos` : ''}
              </span>
              <em>{fmtDay(h.ended_at || h.started_at || h.scheduled_at || h.created_at)}</em>
            </div>
          ))}
        </div>
        <div className="prod-links">
          <button type="button" className="lh-btn" onClick={() => onNavigate?.('reportes-informes')}>
            Reportes e informes
          </button>
          <button type="button" className="lh-btn" onClick={() => onNavigate?.('supervision')}>
            Supervisión
          </button>
        </div>
      </Seccion>
    </>
  )
}

/* ─────────────── Equipo: formatos y tareas ─────────────── */
function Equipo({ team, tasks, machines, orgId, userId, onNavigate, onDone }) {
  const [abierto, setAbierto] = useState(null)
  const [f, setF] = useState({ para: '', titulo: '', detalle: '', maquina: '' })
  const [busy, setBusy] = useState(false)
  const nombre = new Map(team.map((p) => [p.id, p.name]))
  const tareasEquipo = tasks.filter((t) => nombre.has(t.assigned_to))

  const asignar = async (e) => {
    e.preventDefault()
    if (!f.para || f.titulo.trim().length < 3) {
      onDone('Elija a quién y escriba la tarea (mínimo 3 caracteres).', true)
      return
    }
    setBusy(true)
    const destinos = f.para === 'todos' ? team.map((p) => p.id) : [f.para]
    let error = null
    for (const id of destinos) {
      const r = await createShiftActivity({
        org_id: orgId,
        assigned_to: id,
        assigned_by: userId,
        title: f.titulo.trim(),
        description: f.detalle.trim() || null,
        machine_id: f.maquina || null,
      })
      if (r.error) error = r.error
    }
    setBusy(false)
    if (!error) setF({ para: '', titulo: '', detalle: '', maquina: '' })
    onDone(error ? `No se pudo asignar: ${error}` : `Tarea asignada a ${destinos.length === 1 ? nombre.get(destinos[0]) : `${destinos.length} personas`}`, Boolean(error))
  }

  return (
    <>
      <Seccion titulo={`Mi equipo · ${team.length}`} sub="lo que registra cada auxiliar (últimos 7 días)">
        <div className="lh-card">
          {team.length === 0 && (
            <p className="lh-empty">
              No hay auxiliares de producción, calidad, vacunación ni operario de recepción en la empresa.
            </p>
          )}
          {team.map((p) => (
            <div key={p.id} className="prod-persona">
              <button type="button" className="prod-persona-top" onClick={() => setAbierto(abierto === p.id ? null : p.id)} aria-expanded={abierto === p.id}>
                <span className="lh-av" aria-hidden="true">
                  {p.name
                    .split(' ')
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join('')}
                </span>
                <span className="prod-persona-main">
                  <b>{p.name}</b>
                  <span>
                    {p.roleLabel}
                    {p.last ? ` · ${p.last.kind} ${fmtDay(p.last.at)} ${fmtTime(p.last.at)}` : ' · sin registros en 7 días'}
                  </span>
                </span>
                <span className="prod-persona-n">
                  {p.records.length}
                  <small>registros</small>
                </span>
                {p.pending.length > 0 && <span className="prod-badge">{p.pending.length} tarea(s)</span>}
              </button>
              {abierto === p.id && (
                <div className="prod-persona-det">
                  {(p.role === 'quality_auxiliary' || p.role === 'auxiliary_production') && (
                    <p className="prod-nota">
                      <button type="button" className="lh-btn" onClick={() => onNavigate?.('calidad')}>
                        Ver formatos de calidad
                      </button>
                    </p>
                  )}
                  {p.records.length === 0 && <p className="lh-empty">Sin registros en los últimos 7 días.</p>}
                  {p.records.slice(0, 15).map((r, i) => (
                    <button type="button" key={i} className="prod-reg" onClick={() => onNavigate?.(r.tab)}>
                      <b>{r.kind}</b>
                      <span>{r.text}</span>
                      <em>
                        {fmtDay(r.at)} {fmtTime(r.at)}
                      </em>
                    </button>
                  ))}
                  {p.pending.length > 0 && (
                    <>
                      <h4>Tareas pendientes</h4>
                      {p.pending.map((t) => (
                        <p key={t.id} className="prod-tarea">
                          {t.status === 'in_progress' ? '▶' : '○'} {t.title} <em>· {fmtDay(t.created_at)}</em>
                        </p>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Asignar tarea" sub="a una persona o a todo el equipo">
        <form className="lh-card prod-form" onSubmit={asignar}>
          <label>
            Para
            <select value={f.para} onChange={(e) => setF({ ...f, para: e.target.value })}>
              <option value="">Elija…</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.roleLabel}
                </option>
              ))}
              {team.length > 1 && <option value="todos">Todo el equipo</option>}
            </select>
          </label>
          <label>
            Tarea
            <input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="ej: Ovoscopia lote 47" />
          </label>
          <label>
            Detalle
            <textarea rows={2} value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} />
          </label>
          <label>
            Máquina (opcional)
            <select value={f.maquina} onChange={(e) => setF({ ...f, maquina: e.target.value })}>
              <option value="">—</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code || m.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="lh-btn lh-btn-p" disabled={busy}>
            {busy ? 'Asignando…' : 'Asignar tarea'}
          </button>
        </form>
        {tareasEquipo.length > 0 && (
          <div className="lh-card prod-lista">
            <h3 className="prod-sub">Tareas del equipo (7 días)</h3>
            {tareasEquipo.slice(0, 30).map((t) => (
              <div key={t.id} className="prod-fila">
                <b>{t.title}</b>
                <span>
                  {nombre.get(t.assigned_to)} ·{' '}
                  {{ pending: 'Pendiente', in_progress: 'En curso', completed: 'Cerrada', done: 'Cerrada', cancelled: 'Cancelada' }[t.status] || t.status}
                  {t.result_note ? ` · ${t.result_note}` : ''}
                </span>
                <em>{fmtDay(t.created_at)}</em>
              </div>
            ))}
          </div>
        )}
      </Seccion>
    </>
  )
}

/* ─────────────── Calidad (formatos del auxiliar de calidad) ─────────────── */
const ETIQUETA_CAL = {
  egg_weight: '⚖️ Peso del huevo',
  moisture_loss: '💧 Pérdida de humedad',
  candling: '🔦 Ovoscopia',
  breakout: '🥚 Embriodiagnóstico',
  chick_quality: '🐣 Calidad del pollito',
}
const ESTADO_CAL = { ok: 'Normal', watch: 'Vigilar', alert: 'Alerta' }

function CalidadResumen({ quality, onNavigate }) {
  const alertas = quality.filter((q) => q.status !== 'ok').length
  return (
    <Seccion titulo={`Calidad · ${quality.length} muestreos`} sub={`últimos 7 días${alertas ? ` · ${alertas} para revisar` : ''}`}>
      <div className="lh-card prod-lista">
        {quality.length === 0 && <p className="lh-empty">Sin muestreos de calidad en los últimos 7 días.</p>}
        {quality.slice(0, 30).map((q) => (
          <div key={q.id} className={`prod-fila prod-cal s-${q.status}`}>
            <b>
              {ETIQUETA_CAL[q.kind] || q.kind} · Lote {q.lote || '—'}
            </b>
            <span>
              {ESTADO_CAL[q.status] || q.status} · {q.results?.resumen || ''}
            </span>
            <em>
              {fmtDay(q.sampled_at)} {fmtTime(q.sampled_at)}
            </em>
          </div>
        ))}
      </div>
      <div className="prod-links">
        <button type="button" className="lh-btn" onClick={() => onNavigate?.('calidad')}>
          Abrir Calidad de incubación
        </button>
      </div>
    </Seccion>
  )
}

/* ─────────────── Vacunación (inventario y formatos del auxiliar) ─────────────── */
const ETIQUETA_VAC = {
  nitrogen_fridge: '🧊 Nevera y nitrógeno (PR06-1)',
  sexing_count: '🐥 Sexaje y conteo',
  navel_quality: '🩹 Ombligo y cicatrización',
}

function VacunacionResumen({ quality, products, movements, onNavigate }) {
  const stock = useMemo(() => stockByProduct({ products: products.filter((p) => p.active), movements }), [products, movements])
  const alertas = stock.reduce((s, p) => s + p.alerts.length, 0)
  return (
    <Seccion titulo={`Vacunación · ${stock.length} vacuna(s)`} sub={alertas ? `${alertas} alerta(s) de inventario` : 'inventario sin alertas'}>
      <div className="lh-card prod-lista">
        {stock.length === 0 && <p className="lh-empty">El auxiliar de vacunación aún no ha registrado vacunas.</p>}
        {stock.map((p) => (
          <div key={p.id} className={`prod-fila prod-cal ${p.alerts.some((a) => a.tone === 'danger') ? 's-alert' : p.alerts.length ? 's-watch' : 's-ok'}`}>
            <b>
              💉 {p.name} · {num(p.doses)} dosis
            </b>
            <span>
              {num(p.vials)} frascos
              {p.diasDeStock != null ? ` · alcanza ${p.diasDeStock} día(s)` : ''}
              {p.lots[0]?.expires ? ` · próximo vence ${fmtDay(p.lots[0].expires)}` : ''}
              {p.alerts.length ? ` · ${p.alerts.map((a) => a.text).join(' · ')}` : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="lh-card prod-lista">
        {quality.length === 0 && <p className="lh-empty">Sin formatos de vacunación en los últimos 7 días.</p>}
        {quality.slice(0, 20).map((q) => (
          <div key={q.id} className={`prod-fila prod-cal s-${q.status}`}>
            <b>
              {ETIQUETA_VAC[q.kind] || q.kind}
              {q.lote ? ` · Lote ${q.lote}` : ''}
            </b>
            <span>
              {ESTADO_CAL[q.status] || q.status} · {q.results?.resumen || ''}
            </span>
            <em>
              {fmtDay(q.sampled_at)} {fmtTime(q.sampled_at)}
            </em>
          </div>
        ))}
      </div>
      <div className="prod-links">
        <button type="button" className="lh-btn" onClick={() => onNavigate?.('vacunacion')}>
          Abrir Vacunación
        </button>
      </div>
    </Seccion>
  )
}
