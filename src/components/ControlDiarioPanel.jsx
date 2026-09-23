/**
 * =============================================================================
 * ARCHIVO: src/components/ControlDiarioPanel.jsx
 * PROPÓSITO: Componente UI «ControlDiarioPanel»: entrega los registros del SIG
 *   FOINC01 (control diario de incubadoras) y FONAC01 (nacedoras) ya
 *   diligenciados con las rondas de turno.
 * CÓMO FUNCIONA: lista los cargues de la planta —uno por ciclo de incubación— y
 *   descarga el registro de cualquiera. El documento se arma en el momento con
 *   las rondas que haya, así que el de un ciclo en curso siempre sale al día.
 *   Se usa como ventana (Monitoreo) o incrustado (Centro de Activos, inline).
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DIAS_INCUBACION,
  exportRegistroCargue,
  exportRegistroNacedora,
  exportTodoElPeriodo,
  FECHA_FORMATO,
  listarCiclos,
  VERSION_FORMATO,
} from '../lib/controlDiarioFormat'
import './ControlDiarioPanel.css'

const fmt = (iso) => {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const hoyIso = () => new Date().toLocaleDateString('sv-SE')
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE')
}
const numeroDe = (m) => Number(String(m?.code || m?.name || '').replace(/\D/g, '')) || 0

/** Día de incubación hoy (cargue = día 0), solo para ciclos en curso. */
const diaDeHoy = (cargue) => {
  if (!cargue) return null
  const d = Math.round((new Date(`${hoyIso()}T12:00:00`) - new Date(`${cargue}T12:00:00`)) / 86_400_000)
  return d >= 0 ? d : null
}

export default function ControlDiarioPanel({ machines = [], rooms = [], people = {}, onClose, inline = false }) {
  const [ciclos, setCiclos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bajando, setBajando] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [tab, setTab] = useState('setter')
  const [desde, setDesde] = useState(haceDias(30))
  const [hasta, setHasta] = useState(hoyIso())
  const [todo, setTodo] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState('todos')

  const porId = useMemo(() => {
    const map = {}
    for (const m of machines) map[m.id] = m
    return map
  }, [machines])

  const salaDe = useCallback((m) => rooms.find((r) => r.id === m?.room_id)?.name || '', [rooms])

  const setters = useMemo(() => machines.filter((m) => m.type === 'setter'), [machines])
  const hatchers = useMemo(
    () => machines.filter((m) => m.type === 'hatcher').sort((a, b) => numeroDe(a) - numeroDe(b)),
    [machines]
  )

  useEffect(() => {
    if (!setters.length) {
      setLoading(false)
      return undefined
    }
    let vivo = true
    setLoading(true)
    listarCiclos({ machineIds: setters.map((m) => m.id), desde: haceDias(180) }).then((r) => {
      if (!vivo) return
      if (r.error) setError(r.error)
      else setCiclos(r.ciclos.filter((c) => porId[c.machineId]))
      setLoading(false)
    })
    return () => {
      vivo = false
    }
  }, [setters, porId])

  useEffect(() => {
    if (inline || !onClose) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [inline, onClose])

  const q = buscar.trim().toLowerCase()
  const ciclosVista = useMemo(
    () =>
      ciclos.filter((c) => {
        if (estado === 'curso' && !c.abierto) return false
        if (estado === 'cerrados' && c.abierto) return false
        if (!q) return true
        const m = porId[c.machineId]
        return [m?.code, m?.name, c.lotes, salaDe(m)].some((v) => String(v || '').toLowerCase().includes(q))
      }),
    [ciclos, estado, q, porId, salaDe]
  )
  const nacVista = useMemo(
    () => hatchers.filter((m) => !q || [m.code, m.name, salaDe(m)].some((v) => String(v || '').toLowerCase().includes(q))),
    [hatchers, q, salaDe]
  )
  const enCurso = ciclos.filter((c) => c.abierto).length

  const bajarCargue = async (ciclo) => {
    const machine = porId[ciclo.machineId]
    if (!machine) return
    const clave = `${ciclo.machineId}|${ciclo.cargue}`
    setBajando(clave)
    setAviso(null)
    const r = await exportRegistroCargue({ machine, ciclo, people, sala: salaDe(machine) })
    setAviso(r.error ? { tipo: 'mal', txt: r.error } : { tipo: 'bien', txt: `${machine.code} · FOINC01 descargado · ${r.dias} días, ${r.tomas} tomas` })
    setBajando(null)
  }

  /** Todo el set en un ZIP: es lo que se entrega, con los enlaces ya firmados. */
  const bajarTodo = async () => {
    setAviso(null)
    setTodo({ hecho: 0, total: ciclos.length + hatchers.length, que: 'preparando…' })
    try {
      const r = await exportTodoElPeriodo({
        ciclos,
        porId,
        salaDe,
        people,
        hatchers,
        desde,
        hasta,
        onProgress: (hecho, total, que) => setTodo({ hecho, total, que }),
      })
      setAviso({ tipo: 'bien', txt: r.fallos ? `${r.documentos} documentos · ${r.fallos} sin rondas en su rango` : `${r.documentos} documentos en el ZIP` })
    } catch (e) {
      setAviso({ tipo: 'mal', txt: e?.message || 'No se pudo armar el ZIP' })
    }
    setTodo(null)
  }

  const bajarNacedora = async (machine) => {
    setBajando(machine.id)
    setAviso(null)
    const r = await exportRegistroNacedora({ machine, desde, hasta, people, sala: salaDe(machine) })
    setAviso(r.error ? { tipo: 'mal', txt: r.error } : { tipo: 'bien', txt: `${machine.code} · FONAC01 descargado · ${r.dias} días, ${r.tomas} tomas` })
    setBajando(null)
  }

  const cuerpo = (
    <section className={`cd2${inline ? ' cd2-inline' : ''}`} aria-label="Control diario — registros del SIG" onClick={(e) => e.stopPropagation()}>
      <header className="cd2-head">
        <span className="cd2-badge" aria-hidden="true">SIG</span>
        <div className="cd2-title">
          <h2>Control diario de incubación</h2>
          <p>Registros FOINC01 · FONAC01 · versión {VERSION_FORMATO} · {FECHA_FORMATO} · diligenciados con las rondas</p>
        </div>
        {!inline && onClose && (
          <button type="button" className="cd2-close" onClick={onClose} aria-label="Cerrar">×</button>
        )}
      </header>

      <div className="cd2-stats">
        <div><strong>{ciclos.length}</strong><span>cargues (6 meses)</span></div>
        <div><strong>{enCurso}</strong><span>en curso</span></div>
        <div><strong>{hatchers.length}</strong><span>nacedoras</span></div>
      </div>

      <details className="cd2-info">
        <summary>¿Cómo se arma cada registro?</summary>
        <p>
          Un registro por cargue: cubre una sola incubadora desde el día del cargue hasta la transferencia (día {DIAS_INCUBACION}).
          Se arma con las rondas que haya al momento de descargarlo, así que el de un ciclo en curso siempre sale al día. En cada
          línea, la hora es un enlace a la foto de la pantalla en esa toma: la evidencia se abre con un clic y el enlace sirve un año.
        </p>
      </details>

      <div className="cd2-tabs" role="tablist" aria-label="Tipo de registro">
        <button type="button" role="tab" aria-selected={tab === 'setter'} className={tab === 'setter' ? 'is-on' : ''} onClick={() => setTab('setter')}>
          <b>FOINC01</b> Incubadoras <em>{ciclos.length}</em>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'hatcher'} className={tab === 'hatcher' ? 'is-on' : ''} onClick={() => setTab('hatcher')}>
          <b>FONAC01</b> Nacedoras <em>{hatchers.length}</em>
        </button>
      </div>

      <div className="cd2-toolbar">
        <input type="search" placeholder={tab === 'setter' ? 'Buscar máquina, lote o sala…' : 'Buscar nacedora o sala…'} value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
        {tab === 'setter' && (
          <div className="cd2-seg" role="radiogroup" aria-label="Estado del ciclo">
            {[['todos', 'Todos'], ['curso', 'En curso'], ['cerrados', 'Cerrados']].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={estado === id} className={estado === id ? 'is-on' : ''} onClick={() => setEstado(id)}>{label}</button>
            ))}
          </div>
        )}
        <label className="cd2-date"><span>Desde</span><input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="cd2-date"><span>Hasta</span><input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
        <button type="button" className="cd2-primary" onClick={bajarTodo} disabled={!!todo || loading || !ciclos.length} title="Todos los registros del periodo en un ZIP, con la misma estructura de carpetas">
          {todo ? 'Armando…' : '⬇ Todo el periodo (ZIP)'}
        </button>
      </div>

      {todo && (
        <div className="cd2-progress" role="status">
          <span style={{ width: `${todo.total ? (todo.hecho / todo.total) * 100 : 0}%` }} />
          <small>{todo.hecho} de {todo.total} · {todo.que}</small>
        </div>
      )}
      {aviso && <p className={`cd2-aviso cd2-aviso-${aviso.tipo}`} role="status">{aviso.tipo === 'bien' ? '✓' : '⚠'} {aviso.txt}</p>}
      {error && <p className="cd2-aviso cd2-aviso-mal">⚠ {error}</p>}

      {tab === 'setter' && (
        <>
          {loading && <p className="cd2-empty">Cargando cargues…</p>}
          {!loading && !ciclos.length && (
            <p className="cd2-empty">No hay cargues registrados en los últimos 6 meses. El registro se genera desde el cargue, así que primero hay que registrarlo en la app.</p>
          )}
          {!loading && !!ciclos.length && !ciclosVista.length && <p className="cd2-empty">Ningún cargue coincide con el filtro.</p>}
          {!!ciclosVista.length && (
            <div className="cd2-scroll">
              <table className="cd2-table">
                <thead>
                  <tr>
                    <th>Máquina</th>
                    <th>Cargue</th>
                    <th>Lote(s)</th>
                    <th>Nacimiento</th>
                    <th>Estado</th>
                    <th><span className="cd2-sr">Descargar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {ciclosVista.map((c) => {
                    const m = porId[c.machineId]
                    const clave = `${c.machineId}|${c.cargue}`
                    const dia = c.abierto ? diaDeHoy(c.cargue) : null
                    return (
                      <tr key={clave}>
                        <td data-label="Máquina"><strong>{m?.code || m?.name}</strong>{salaDe(m) && <small>{salaDe(m)}</small>}</td>
                        <td data-label="Cargue">{fmt(c.cargue)}</td>
                        <td data-label="Lote(s)">{c.lotes || '—'}</td>
                        <td data-label="Nacimiento">{fmt(c.nacimiento)}</td>
                        <td data-label="Estado">
                          <span className={c.abierto ? 'cd2-pill cd2-pill-live' : 'cd2-pill'}>
                            {c.abierto ? `En curso${dia != null ? ` · día ${dia}` : ''}` : 'Cerrado'}
                          </span>
                        </td>
                        <td className="cd2-act">
                          <button type="button" onClick={() => bajarCargue(c)} disabled={bajando === clave}>
                            {bajando === clave ? 'Generando…' : '📄 FOINC01'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'hatcher' && (
        <>
          <p className="cd2-note">
            Mientras la transferencia no se registre en la app, el registro de nacedora no se puede separar por nacimiento: se descarga por el rango de fechas de arriba.
          </p>
          {!nacVista.length && <p className="cd2-empty">No hay nacedoras que coincidan.</p>}
          {!!nacVista.length && (
            <div className="cd2-scroll">
              <table className="cd2-table">
                <thead>
                  <tr>
                    <th>Máquina</th>
                    <th>Sala</th>
                    <th>Rango</th>
                    <th><span className="cd2-sr">Descargar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {nacVista.map((m) => (
                    <tr key={m.id}>
                      <td data-label="Máquina"><strong>{m.code || m.name}</strong></td>
                      <td data-label="Sala">{salaDe(m) || '—'}</td>
                      <td data-label="Rango">{fmt(desde)} – {fmt(hasta)}</td>
                      <td className="cd2-act">
                        <button type="button" onClick={() => bajarNacedora(m)} disabled={bajando === m.id || !desde || !hasta}>
                          {bajando === m.id ? 'Generando…' : '📄 FONAC01'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )

  if (inline) return cuerpo
  return (
    <div className="cd2-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Control diario — registros del SIG">
      {cuerpo}
    </div>
  )
}
