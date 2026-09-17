/**
 * =============================================================================
 * ARCHIVO: src/components/ControlDiarioPanel.jsx
 * PROPÓSITO: Componente UI «ControlDiarioPanel»: entrega los registros del SIG
 *   FOINC01 (control diario de incubadoras) y FONAC01 (nacedoras) ya
 *   diligenciados con las rondas de turno.
 * CÓMO FUNCIONA: lista los cargues de la planta —uno por ciclo de incubación— y
 *   descarga el registro de cualquiera. El documento se arma en el momento con
 *   las rondas que haya, así que el de un ciclo en curso siempre sale al día.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DIAS_INCUBACION,
  exportRegistroCargue,
  exportRegistroNacedora,
  exportTodoElPeriodo,
  listarCiclos,
} from '../lib/controlDiarioFormat'

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

export default function ControlDiarioPanel({ machines = [], rooms = [], people = {}, onClose }) {
  const [ciclos, setCiclos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bajando, setBajando] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [tab, setTab] = useState('setter')
  const [desde, setDesde] = useState(haceDias(30))
  const [hasta, setHasta] = useState(hoyIso())
  const [todo, setTodo] = useState(null)

  const porId = useMemo(() => {
    const map = {}
    for (const m of machines) map[m.id] = m
    return map
  }, [machines])

  const salaDe = useCallback(
    (m) => rooms.find((r) => r.id === m?.room_id)?.name || '',
    [rooms]
  )

  const setters = useMemo(() => machines.filter((m) => m.type === 'setter'), [machines])
  const hatchers = useMemo(
    () =>
      machines
        .filter((m) => m.type === 'hatcher')
        .sort((a, b) => (Number(a.code?.replace(/\D/g, '')) || 0) - (Number(b.code?.replace(/\D/g, '')) || 0)),
    [machines]
  )

  useEffect(() => {
    if (!setters.length) {
      setLoading(false)
      return
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

  const bajarCargue = async (ciclo) => {
    const machine = porId[ciclo.machineId]
    if (!machine) return
    const clave = `${ciclo.machineId}|${ciclo.cargue}`
    setBajando(clave)
    setAviso(null)
    const r = await exportRegistroCargue({ machine, ciclo, people, sala: salaDe(machine) })
    setAviso(r.error ? `⚠️ ${r.error}` : `✓ ${machine.code} · ${r.dias} días, ${r.tomas} tomas`)
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
      setAviso(
        r.fallos
          ? `✓ ${r.documentos} documentos · ${r.fallos} sin rondas en su rango`
          : `✓ ${r.documentos} documentos`
      )
    } catch (e) {
      setAviso(`⚠️ ${e?.message || 'No se pudo armar el ZIP'}`)
    }
    setTodo(null)
  }

  const bajarNacedora = async (machine) => {
    setBajando(machine.id)
    setAviso(null)
    const r = await exportRegistroNacedora({
      machine,
      desde,
      hasta,
      people,
      sala: salaDe(machine),
    })
    setAviso(r.error ? `⚠️ ${r.error}` : `✓ ${machine.code} · ${r.dias} días, ${r.tomas} tomas`)
    setBajando(null)
  }

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-modal card" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>Control diario — registros del SIG</h2>
          <button type="button" className="ghost small" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <p className="hint" style={{ marginTop: 0 }}>
          Un registro por cargue: cubre una sola máquina desde el día del cargue hasta la
          transferencia (día {DIAS_INCUBACION}). Se arma con las rondas que haya en el momento
          de descargarlo, así que el de un ciclo en curso siempre sale al día. En cada línea, la
          hora es un enlace a la foto de la pantalla en esa toma: la evidencia se abre con un
          clic y el enlace sirve un año.
        </p>

        <div className="cd-todo">
          <button
            type="button"
            className="primary small"
            onClick={bajarTodo}
            disabled={!!todo || loading || !ciclos.length}
            title="Todos los registros del periodo en un ZIP, con la misma estructura de carpetas"
          >
            {todo ? '⏳ Armando…' : '⬇ Descargar todo (ZIP)'}
          </button>
          {todo && (
            <span className="hint" style={{ margin: 0 }}>
              {todo.hecho} de {todo.total} · {todo.que}
            </span>
          )}
        </div>

        <div className="cd-tabs">
          <button
            type="button"
            className={tab === 'setter' ? 'chip active' : 'chip'}
            onClick={() => setTab('setter')}
          >
            FOINC01 · Incubadoras ({ciclos.length})
          </button>
          <button
            type="button"
            className={tab === 'hatcher' ? 'chip active' : 'chip'}
            onClick={() => setTab('hatcher')}
          >
            FONAC01 · Nacedoras ({hatchers.length})
          </button>
        </div>

        {aviso && <p className="hint">{aviso}</p>}
        {error && <p className="error">{error}</p>}

        {tab === 'setter' && (
          <>
            {loading && <p className="hint">Cargando cargues…</p>}
            {!loading && !ciclos.length && (
              <p className="hint">
                No hay cargues registrados en los últimos 6 meses. El registro se genera desde el
                cargue, así que primero hay que registrarlo en la app.
              </p>
            )}
            {!!ciclos.length && (
              <div className="cd-scroll">
                <table className="cd-table">
                  <thead>
                    <tr>
                      <th>Máquina</th>
                      <th>Cargue</th>
                      <th>Lote(s)</th>
                      <th>Nacimiento</th>
                      <th>Estado</th>
                      <th aria-label="Descargar" />
                    </tr>
                  </thead>
                  <tbody>
                    {ciclos.map((c) => {
                      const m = porId[c.machineId]
                      const clave = `${c.machineId}|${c.cargue}`
                      return (
                        <tr key={clave}>
                          <td>{m?.code || m?.name}</td>
                          <td>{fmt(c.cargue)}</td>
                          <td>{c.lotes || '—'}</td>
                          <td>{fmt(c.nacimiento)}</td>
                          <td>
                            <span className={c.abierto ? 'pill live' : 'pill'}>
                              {c.abierto ? 'En curso' : 'Cerrado'}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => bajarCargue(c)}
                              disabled={bajando === clave}
                            >
                              {bajando === clave ? '⏳' : '📄 Registro'}
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
            <p className="hint">
              Mientras la transferencia no se registre en la app, el registro de nacedora no se
              puede separar por nacimiento: se descarga por rango de fechas.
            </p>
            <div className="cd-fields">
              <label>
                <span>Desde</span>
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label>
                <span>Hasta</span>
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
            </div>
            <div className="cd-scroll">
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Máquina</th>
                    <th>Sala</th>
                    <th aria-label="Descargar" />
                  </tr>
                </thead>
                <tbody>
                  {hatchers.map((m) => (
                    <tr key={m.id}>
                      <td>{m.code || m.name}</td>
                      <td>{salaDe(m) || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => bajarNacedora(m)}
                          disabled={bajando === m.id || !desde || !hasta}
                        >
                          {bajando === m.id ? '⏳' : '📄 Registro'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
