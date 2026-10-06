/**
 * Listado de OT abiertas que se abre al tocar el indicador «OT abiertas» del líder.
 * Asigna técnico a una OT o a varias seleccionadas de una vez. 06-10-2026.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { assignWorkOrder, assignWorkOrders } from '../hooks/useLeaderHome'

const PRIORIDAD = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' }
const ORDEN = { critical: 0, high: 1, medium: 2, low: 3 }
const ESTADO = { open: 'Abierta', in_progress: 'En ejecución' }

function fechaCorta(v) {
  if (!v) return ''
  return new Date(v).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
}

export default function WorkOrdersSheet({ workOrders, machines, technicians, peopleName, filtroInicial, onCerrar, onCambio }) {
  const [filtro, setFiltro] = useState(filtroInicial || 'unassigned')
  const [buscar, setBuscar] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [tecGrupo, setTecGrupo] = useState('')
  const [tecFila, setTecFila] = useState({})
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', esc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', esc)
      document.body.style.overflow = prev
    }
  }, [onCerrar])

  const codeOf = useMemo(() => new Map((machines || []).map((m) => [m.id, m.code || m.name])), [machines])
  const abiertas = useMemo(
    () =>
      (workOrders || [])
        .filter((w) => w.status === 'open' || w.status === 'in_progress')
        .sort(
          (a, b) =>
            (ORDEN[a.priority] ?? 9) - (ORDEN[b.priority] ?? 9) || String(a.created_at).localeCompare(String(b.created_at)),
        ),
    [workOrders],
  )
  const sinTecnico = abiertas.filter((w) => !w.assigned_to).length
  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return abiertas.filter((w) => {
      if (filtro === 'unassigned' && w.assigned_to) return false
      if (!q) return true
      return [w.code, codeOf.get(w.machine_id), w.title, w.description].some((t) =>
        String(t || '').toLowerCase().includes(q),
      )
    })
  }, [abiertas, filtro, buscar, codeOf])

  const todasMarcadas = lista.length > 0 && lista.every((w) => sel.has(w.id))
  const marcar = (id) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const marcarTodas = () => setSel(todasMarcadas ? new Set() : new Set(lista.map((w) => w.id)))
  const nombreTec = (id) => technicians.find((t) => t.id === id)?.name || peopleName?.[id] || 'Técnico'

  const asignarUna = async (w) => {
    const tec = tecFila[w.id]
    if (!tec) return
    setBusy(w.id)
    setMsg(null)
    const res = await assignWorkOrder(w.id, tec)
    setBusy(null)
    if (res.error) setMsg({ error: true, text: res.error })
    else {
      setMsg({ text: `${w.code || 'OT'} asignada a ${nombreTec(tec)}` })
      onCambio?.()
    }
  }

  const asignarGrupo = async () => {
    if (!tecGrupo || !sel.size) return
    setBusy('grupo')
    setMsg(null)
    const ids = [...sel]
    const res = await assignWorkOrders(ids, tecGrupo)
    setBusy(null)
    if (res.error) setMsg({ error: true, text: res.error })
    else {
      setMsg({ text: `${res.count} OT asignadas a ${nombreTec(tecGrupo)}` })
      setSel(new Set())
      onCambio?.()
    }
  }

  return createPortal(
    <div className="wos-capa" role="presentation" onClick={onCerrar}>
      <div className="wos" role="dialog" aria-modal="true" aria-label="OT abiertas" onClick={(e) => e.stopPropagation()}>
        <header className="wos-head">
          <div>
            <h2>OT abiertas · {abiertas.length}</h2>
            <span>{sinTecnico ? `${sinTecnico} sin técnico` : 'todas tienen técnico'}</span>
          </div>
          <button type="button" className="wos-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="wos-filtros">
          <div className="wos-seg" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={filtro === 'unassigned'}
              className={filtro === 'unassigned' ? 'on' : ''}
              onClick={() => setFiltro('unassigned')}
            >
              Sin técnico ({sinTecnico})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtro === 'all'}
              className={filtro === 'all' ? 'on' : ''}
              onClick={() => setFiltro('all')}
            >
              Todas ({abiertas.length})
            </button>
          </div>
          <input
            className="wos-buscar"
            type="search"
            placeholder="Buscar máquina, código o título…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>

        {/* Asignación en grupo */}
        <div className={`wos-grupo${sel.size ? ' activo' : ''}`}>
          <label className="wos-check">
            <input type="checkbox" checked={todasMarcadas} onChange={marcarTodas} disabled={!lista.length} />
            <span>{sel.size ? `${sel.size} seleccionadas` : 'Seleccionar todas'}</span>
          </label>
          <select value={tecGrupo} onChange={(e) => setTecGrupo(e.target.value)} aria-label="Técnico para el grupo">
            <option value="">Técnico para el grupo…</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" className="wos-btn p" disabled={!sel.size || !tecGrupo || busy === 'grupo'} onClick={asignarGrupo}>
            {busy === 'grupo' ? 'Asignando…' : `Asignar ${sel.size || ''}`.trim()}
          </button>
        </div>

        {msg && <p className={msg.error ? 'wos-msg error' : 'wos-msg ok'}>{msg.text}</p>}
        {!technicians.length && (
          <p className="wos-msg error">No hay técnicos de mantenimiento registrados en la empresa.</p>
        )}

        <div className="wos-lista">
          {lista.length === 0 ? (
            <p className="wos-vacio">
              {filtro === 'unassigned' ? 'Todas las OT abiertas tienen técnico.' : 'No hay OT abiertas.'}
            </p>
          ) : (
            lista.map((w) => (
              <div key={w.id} className={`wos-fila p-${w.priority || 'medium'}${sel.has(w.id) ? ' sel' : ''}`}>
                <label className="wos-check">
                  <input type="checkbox" checked={sel.has(w.id)} onChange={() => marcar(w.id)} aria-label={`Seleccionar ${w.code || 'OT'}`} />
                </label>
                <div className="wos-info">
                  <b>
                    {w.code || 'OT'}
                    {codeOf.get(w.machine_id) ? ` · ${codeOf.get(w.machine_id)}` : ''}
                  </b>
                  <span className="wos-titulo">{w.title || w.description || 'Sin título'}</span>
                  <span className="wos-meta">
                    <i className={`wos-pri p-${w.priority || 'medium'}`}>{PRIORIDAD[w.priority] || 'Media'}</i>
                    {ESTADO[w.status] || w.status} · pedida {fechaCorta(w.created_at)}
                    {w.scheduled_for ? ` · programada ${fechaCorta(w.scheduled_for)}` : ''}
                    {w.assigned_to ? ` · ${nombreTec(w.assigned_to)}` : ''}
                  </span>
                </div>
                <div className="wos-asignar">
                  <select
                    value={tecFila[w.id] || ''}
                    onChange={(e) => setTecFila((x) => ({ ...x, [w.id]: e.target.value }))}
                    aria-label={`Técnico para ${w.code || 'OT'}`}
                  >
                    <option value="">{w.assigned_to ? 'Cambiar técnico…' : 'Técnico…'}</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="wos-btn"
                    disabled={!tecFila[w.id] || busy === w.id}
                    onClick={() => asignarUna(w)}
                  >
                    {busy === w.id ? '…' : 'Asignar'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
