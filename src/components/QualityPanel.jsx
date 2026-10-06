/**
 * Calidad de incubación (auxiliar de calidad · 06-10-2026): formatos de peso del huevo,
 * pérdida de humedad, ovoscopia / fertilidad, embriodiagnóstico y calidad del pollito.
 * Cada formato calcula sus indicadores en vivo y los compara con la referencia; el
 * historial y el resumen por lote los ve también la líder de producción.
 */
import { useMemo, useState } from 'react'
import { useQualityRecords } from '../hooks/useQualityRecords'
import { FORMATOS, ESTADOS, REFERENCIA, formatoPorId } from '../lib/qualityFormats'
import './QualityPanel.css'

const LIDERES = ['owner', 'admin', 'management', 'coordinator', 'supervisor']
const ahoraLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const fecha = (v) =>
  new Date(v).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })

export default function QualityPanel({ orgId, userId, role, userName, orgName }) {
  const api = useQualityRecords(orgId)
  const [vista, setVista] = useState('registrar')
  const [formatoId, setFormatoId] = useState(FORMATOS[0].id)
  const [msg, setMsg] = useState(null)
  const esLider = LIDERES.includes(role)

  return (
    <div className="card wide qp-root">
      <div className="card-head qp-head">
        <div>
          <h2>Calidad de incubación</h2>
          <p className="hint">Formatos del auxiliar de calidad · los indicadores se calculan solos</p>
        </div>
        <div className="qp-vistas" role="tablist">
          {[
            ['registrar', 'Registrar'],
            ['historial', 'Historial'],
            ['lotes', 'Por lote'],
          ].map(([id, l]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} className={vista === id ? 'on' : ''} onClick={() => setVista(id)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {api.missing && (
        <p className="msg error">El servidor aún no tiene los formatos de calidad: falta ejecutar 7-ACTUALIZAR-APP en el servidor.</p>
      )}
      {api.error && <p className="msg error">{api.error}</p>}
      {msg && <p className={`msg ${msg.error ? 'error' : 'ok'}`}>{msg.text}</p>}

      {vista === 'registrar' && (
        <>
          <div className="qp-formatos">
            {FORMATOS.map((f) => (
              <button key={f.id} type="button" className={formatoId === f.id ? 'qp-fmt on' : 'qp-fmt'} onClick={() => setFormatoId(f.id)}>
                <span className="qp-fmt-ico" aria-hidden="true">
                  {f.icon}
                </span>
                <span>{f.label}</span>
                <small>{f.codigo}</small>
              </button>
            ))}
          </div>
          <Formulario
            key={formatoId}
            formato={formatoPorId(formatoId)}
            api={api}
            onGuardado={(text, error) => {
              setMsg({ text, error })
              if (!error) setVista('historial')
            }}
          />
        </>
      )}
      {vista === 'historial' && <Historial api={api} esLider={esLider} userId={userId} orgName={orgName} userName={userName} onMsg={setMsg} />}
      {vista === 'lotes' && <PorLote records={api.records} />}
    </div>
  )
}

function Formulario({ formato, api, onGuardado }) {
  const [d, setD] = useState({})
  const [lote, setLote] = useState('')
  const [maquina, setMaquina] = useState('')
  const [cuando, setCuando] = useState(ahoraLocal)
  const [notas, setNotas] = useState('')
  const [fotos, setFotos] = useState([])
  const [busy, setBusy] = useState(false)
  const calc = useMemo(() => formato.calcular(d), [formato, d])
  const hayDatos = Object.values(d).some((v) => String(v || '').trim())
  const maquinas = api.machines.filter((m) =>
    formato.id === 'breakout' || formato.id === 'chick_quality' ? m.type === 'hatcher' || /^NAC/i.test(m.code || '') : true,
  )

  const guardar = async (e) => {
    e.preventDefault()
    if (calc.error) return onGuardado(calc.error, true)
    if (!lote.trim()) return onGuardado('Escriba el lote.', true)
    setBusy(true)
    const res = await api.create(
      {
        kind: formato.id,
        sampled_at: new Date(cuando).toISOString(),
        lote: lote.trim(),
        machine_id: maquina || null,
        sample_size: calc.muestra ?? null,
        data: d,
        results: { ...calc.results, resumen: calc.resumen },
        status: calc.status,
        notes: notas.trim() || null,
      },
      fotos,
    )
    setBusy(false)
    onGuardado(res.error || `${formato.label} guardado · ${ESTADOS[calc.status].label}`, Boolean(res.error))
  }

  return (
    <form className="qp-form" onSubmit={guardar}>
      <p className="qp-ayuda">
        {formato.icon} {formato.ayuda}
      </p>
      <div className="qp-grid">
        <label>
          Lote *
          <input list="qp-lotes" value={lote} onChange={(e) => setLote(e.target.value)} placeholder="ej: 47" />
          <datalist id="qp-lotes">
            {api.lots.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <label>
          Máquina
          <select value={maquina} onChange={(e) => setMaquina(e.target.value)}>
            <option value="">—</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code || m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha y hora
          <input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} />
        </label>
        {formato.campos.map((c) => (
          <label key={c.k} className={c.tipo === 'texto' ? 'qp-ancho' : ''}>
            {c.label}
            {c.tipo === 'texto' ? (
              <textarea rows={2} value={d[c.k] || ''} placeholder={c.placeholder} onChange={(e) => setD({ ...d, [c.k]: e.target.value })} />
            ) : (
              <input inputMode="decimal" value={d[c.k] || ''} placeholder={c.placeholder} onChange={(e) => setD({ ...d, [c.k]: e.target.value })} />
            )}
          </label>
        ))}
      </div>

      {hayDatos && (
        <div className={`qp-resultado ${calc.error ? 'err' : `s-${calc.status}`}`} aria-live="polite">
          {calc.error ? (
            calc.error
          ) : (
            <>
              <span className={`qp-estado s-${calc.status}`}>{ESTADOS[calc.status].label}</span> {calc.resumen}
            </>
          )}
        </div>
      )}

      <label className="qp-ancho">
        Observaciones
        <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </label>
      <label className="qp-ancho">
        Fotos (opcional, hasta 3)
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFotos([...(e.target.files || [])].slice(0, 3))} />
      </label>
      <button type="submit" className="primary" disabled={busy || !hayDatos}>
        {busy ? 'Guardando…' : `Guardar ${formato.label.toLowerCase()}`}
      </button>
      <p className="qp-ref">
        Referencia: huevo {REFERENCIA.pesoHuevo.min}–{REFERENCIA.pesoHuevo.max} g · humedad {REFERENCIA.humedad.min}–{REFERENCIA.humedad.max} % al día 18 ·
        fertilidad ≥ {REFERENCIA.fertilidad.vigilar} % · pollito {REFERENCIA.pesoPollito.min}–{REFERENCIA.pesoPollito.max} g · segunda ≤ {REFERENCIA.segunda.vigilar} %
      </p>
    </form>
  )
}

function Historial({ api, esLider, userId, orgName, userName, onMsg }) {
  const [tipo, setTipo] = useState('')
  const [buscar, setBuscar] = useState('')
  const [fotos, setFotos] = useState({})
  const code = new Map(api.machines.map((m) => [m.id, m.code || m.name]))
  const lista = api.records.filter(
    (r) => (!tipo || r.kind === tipo) && (!buscar.trim() || String(r.lote || '').includes(buscar.trim())),
  )
  const verFotos = async (r) => {
    const urls = await Promise.all((r.photo_paths || []).map((p) => api.photoUrl(p)))
    setFotos((f) => ({ ...f, [r.id]: urls.filter(Boolean) }))
  }
  const exportar = async () => {
    const { exportToExcel } = await import('../lib/exportExcel')
    const hojas = FORMATOS.map((f) => ({
      name: f.label.slice(0, 30),
      rows: api.records
        .filter((r) => r.kind === f.id)
        .map((r) => ({
          Fecha: fecha(r.sampled_at),
          Lote: r.lote,
          Máquina: code.get(r.machine_id) || '',
          Muestra: r.sample_size,
          Estado: ESTADOS[r.status]?.label || r.status,
          Resultado: r.results?.resumen || '',
          ...Object.fromEntries(Object.entries(r.data || {}).map(([k, v]) => [k, v])),
          Observaciones: r.notes || '',
        })),
    }))
    await exportToExcel('Calidad_incubacion', hojas, { title: 'Calidad de incubación', orgName, module: 'Producción · Calidad', generatedBy: userName })
  }
  return (
    <div className="qp-hist">
      <div className="qp-filtros">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Formato">
          <option value="">Todos los formatos</option>
          {FORMATOS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Lote…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <button type="button" className="ghost small" onClick={exportar} disabled={!api.records.length}>
          📥 Excel
        </button>
      </div>
      {api.loading && <p className="hint">Cargando…</p>}
      {!api.loading && lista.length === 0 && <p className="hint">Sin registros todavía.</p>}
      {lista.map((r) => {
        const f = formatoPorId(r.kind)
        return (
          <div key={r.id} className={`qp-reg s-${r.status}`}>
            <span className="qp-reg-ico" aria-hidden="true">
              {f?.icon}
            </span>
            <div className="qp-reg-main">
              <b>
                {f?.label} · Lote {r.lote || '—'}
                {r.machine_id ? ` · ${code.get(r.machine_id) || ''}` : ''}
              </b>
              <span>{r.results?.resumen}</span>
              <small>
                {fecha(r.sampled_at)}
                {r.notes ? ` · ${r.notes}` : ''}
              </small>
              {fotos[r.id] && (
                <span className="qp-fotos">
                  {fotos[r.id].map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="Foto del muestreo" />
                    </a>
                  ))}
                </span>
              )}
            </div>
            <span className={`qp-estado s-${r.status}`}>{ESTADOS[r.status]?.label}</span>
            <span className="qp-reg-acc">
              {r.photo_paths?.length > 0 && !fotos[r.id] && (
                <button type="button" className="ghost small" onClick={() => verFotos(r)}>
                  📷 {r.photo_paths.length}
                </button>
              )}
              {(esLider || r.created_by === userId) && (
                <button
                  type="button"
                  className="ghost small"
                  onClick={async () => {
                    if (!window.confirm('¿Eliminar este registro de calidad?')) return
                    const res = await api.remove(r.id)
                    onMsg(res.error ? { text: res.error, error: true } : { text: 'Registro eliminado' })
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Último resultado de cada formato por lote: la foto de la calidad del lote. */
function PorLote({ records }) {
  const lotes = useMemo(() => {
    const m = new Map()
    for (const r of records) {
      const k = r.lote || 'Sin lote'
      if (!m.has(k)) m.set(k, {})
      const g = m.get(k)
      if (!g[r.kind] || g[r.kind].sampled_at < r.sampled_at) g[r.kind] = r
    }
    return [...m.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0]), 'es', { numeric: true }))
  }, [records])
  if (!lotes.length) return <p className="hint">Sin registros todavía.</p>
  const dato = (r, f) => (r ? f(r.results || {}) : '—')
  return (
    <div className="qp-lotes">
      <div className="qp-lote qp-lote-head">
        <span>Lote</span>
        <span>Peso huevo</span>
        <span>Humedad d18</span>
        <span>Fertilidad</span>
        <span>Embriodiag.</span>
        <span>Pollito</span>
      </div>
      {lotes.map(([lote, g]) => (
        <div key={lote} className="qp-lote">
          <b>{lote}</b>
          <span className={g.egg_weight ? `s-${g.egg_weight.status}` : ''}>{dato(g.egg_weight, (x) => `${x.promedio} g`)}</span>
          <span className={g.moisture_loss ? `s-${g.moisture_loss.status}` : ''}>{dato(g.moisture_loss, (x) => `${x.perdidaDia18} %`)}</span>
          <span className={g.candling ? `s-${g.candling.status}` : ''}>{dato(g.candling, (x) => `${x.fertilidad} %`)}</span>
          <span className={g.breakout ? `s-${g.breakout.status}` : ''}>{dato(g.breakout, (x) => `${x.analizados} analiz.`)}</span>
          <span className={g.chick_quality ? `s-${g.chick_quality.status}` : ''}>
            {dato(g.chick_quality, (x) => [x.promedio != null && `${x.promedio} g`, x.segundaPct != null && `${x.segundaPct} % 2.ª`].filter(Boolean).join(' · ') || '—')}
          </span>
        </div>
      ))}
    </div>
  )
}
