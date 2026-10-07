/**
 * Vacunación (auxiliar de vacunación · 07-10-2026): su inicio con lo que le toca hoy,
 * el inventario de vacunas por lote del fabricante (stock, vencimientos y alertas), el
 * consumo por lote de pollito y sus formatos (PR06-1 nevera y nitrógeno, sexaje y
 * conteo, ombligo y cicatrización). La líder de producción ve lo mismo en su inicio.
 */
import { useMemo, useState } from 'react'
import { useVaccines } from '../hooks/useVaccines'
import { startShiftActivity, completeShiftActivity } from '../hooks/useShiftOps'
import { MOV_LABEL, STORAGE_LABEL, stockByProduct, loteSugerido, consumoPorLote, pendientesVacunacion } from '../lib/vaccineStock'
import { ESTADOS } from '../lib/qualityFormats'
import QualityPanel from './QualityPanel'
import './QualityPanel.css'
import './VaccinationPanel.css'

const LIDERES = ['owner', 'admin', 'management', 'coordinator', 'plant_veterinarian']
const num = (n) => Number(n || 0).toLocaleString('es-CO')
const ahoraLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const fecha = (v) =>
  v
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v).toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        timeZone: 'America/Bogota',
      })
    : '—'
const fechaCorta = (v) =>
  v
    ? String(v)
        .slice(0, 10)
        .split('-')
        .reverse()
        .join('/')
        .replace(/\/(\d{2})(\d{2})$/, '/$2')
    : '—'
const fechaHora = (v) =>
  new Date(v).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  })

const VISTAS = [
  ['hoy', 'Hoy'],
  ['inventario', 'Inventario'],
  ['consumo', 'Consumo'],
  ['formatos', 'Formatos'],
]

export default function VaccinationPanel({ orgId, userId, role, userName, orgName, inicial = 'inventario' }) {
  const api = useVaccines(orgId, userId)
  const [vista, setVista] = useState(inicial)
  const [irFormato, setIrFormato] = useState({ id: null, lote: '', n: 0 })
  const [msg, setMsg] = useState(null)
  const stock = useMemo(() => stockByProduct({ products: api.products, movements: api.movements }), [api.products, api.movements])
  const esLider = LIDERES.includes(role)
  const abrirFormato = (id, lote = '') => {
    setIrFormato((x) => ({ id, lote, n: x.n + 1 }))
    setVista('formatos')
  }
  const aviso = (text, error = false) => setMsg(text ? { text, error } : null)

  return (
    <div className="card wide qp-root vx-root">
      <div className="card-head qp-head">
        <div>
          <h2>💉 Vacunación</h2>
          <p className="hint">Inventario y consumo de vacunas, nevera y nitrógeno, sexaje y ombligo</p>
        </div>
        <div className="qp-vistas" role="tablist">
          {VISTAS.map(([id, l]) => (
            <button key={id} type="button" role="tab" aria-selected={vista === id} className={vista === id ? 'on' : ''} onClick={() => setVista(id)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {api.missing && <p className="msg error">El servidor aún no tiene el inventario de vacunas: falta ejecutar 7-ACTUALIZAR-APP en el servidor.</p>}
      {api.error && <p className="msg error">{api.error}</p>}
      {msg && <p className={`msg ${msg.error ? 'error' : 'ok'}`}>{msg.text}</p>}

      {vista === 'hoy' && <Hoy api={api} stock={stock} orgId={orgId} userName={userName} onFormato={abrirFormato} onVista={setVista} onMsg={aviso} />}
      {vista === 'inventario' && <Inventario api={api} stock={stock} esLider={esLider} userId={userId} orgName={orgName} userName={userName} onMsg={aviso} />}
      {vista === 'consumo' && <Consumo api={api} stock={stock} userId={userId} esLider={esLider} onMsg={aviso} />}
      {vista === 'formatos' && (
        <QualityPanel
          key={irFormato.n}
          orgId={orgId}
          userId={userId}
          role={role}
          userName={userName}
          orgName={orgName}
          area="vacunacion"
          embebido
          formatoInicial={irFormato.id}
          loteInicial={irFormato.lote}
        />
      )}
    </div>
  )
}

/* ─────────────────────────── Hoy ─────────────────────────── */
function Hoy({ api, stock, orgId, userName, onFormato, onVista, onMsg }) {
  const { nitrogenoHoy, lotes } = useMemo(() => pendientesVacunacion(api.today), [api.today])
  const alertas = stock.filter((p) => p.active).flatMap((p) => p.alerts.map((a) => ({ ...a, vacuna: p.name })))
  const tareas = api.today.tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const accion = async (t) => {
    const res = t.status === 'in_progress' ? await completeShiftActivity(orgId, t.id, { completion: 'complete' }) : await startShiftActivity(t.id)
    onMsg(
      res.error || (t.status === 'in_progress' ? (res.offline ? 'Sin conexión: se cerrará al volver la red' : 'Tarea terminada') : 'Tarea iniciada'),
      Boolean(res.error),
    )
    api.reload()
  }
  const hayPendientes = !nitrogenoHoy || lotes.some((l) => !l.sexaje || !l.ombligo) || alertas.length || tareas.length

  return (
    <div className="vx-hoy">
      <p className="vx-saludo">
        {first ? `Hola, ${first}.` : 'Hola.'} {hayPendientes ? 'Esto es lo que te toca hoy:' : 'Todo al día por ahora ✔'}
      </p>

      <section className={`vx-item ${nitrogenoHoy ? 'hecho' : 'pend'}`}>
        <span className="vx-item-ico" aria-hidden="true">
          🧊
        </span>
        <div>
          <b>Control de nevera y nitrógeno (PR06-1)</b>
          <span>{nitrogenoHoy ? `Hecho · ${nitrogenoHoy.results?.resumen || ''}` : 'Pendiente de hoy: temperatura de la nevera y medida de los tanques'}</span>
        </div>
        {nitrogenoHoy ? (
          <span className={`qp-estado s-${nitrogenoHoy.status}`}>{ESTADOS[nitrogenoHoy.status]?.label}</span>
        ) : (
          <button type="button" className="primary small" onClick={() => onFormato('nitrogen_fridge')}>
            Registrar
          </button>
        )}
      </section>

      <h3 className="vx-sub">Lotes nacidos (últimos 5 días)</h3>
      {lotes.length === 0 && <p className="hint">Sin nacimientos registrados en los últimos días.</p>}
      {lotes.map((l) => (
        <section key={l.lote} className={`vx-item ${l.sexaje && l.ombligo ? 'hecho' : 'pend'}`}>
          <span className="vx-item-ico" aria-hidden="true">
            🐣
          </span>
          <div>
            <b>Lote {l.lote}</b>
            <span>
              Nació {fecha(l.at)}
              {l.chicks ? ` · ${num(l.chicks)} pollitos` : ''}
            </span>
          </div>
          <span className="vx-botones">
            <button type="button" className={l.sexaje ? 'ghost small' : 'primary small'} onClick={() => onFormato('sexing_count', l.lote)}>
              {l.sexaje ? '✔ Sexaje' : 'Sexaje y conteo'}
            </button>
            <button type="button" className={l.ombligo ? 'ghost small' : 'primary small'} onClick={() => onFormato('navel_quality', l.lote)}>
              {l.ombligo ? '✔ Ombligo' : 'Ombligo'}
            </button>
          </span>
        </section>
      ))}

      <h3 className="vx-sub">Inventario de vacunas</h3>
      {alertas.length === 0 ? (
        <p className="hint">{stock.length ? 'Sin alertas de stock ni de vencimiento.' : 'Aún no hay vacunas registradas: créelas en Inventario.'}</p>
      ) : (
        alertas.map((a, i) => (
          <button key={i} type="button" className={`vx-alerta t-${a.tone}`} onClick={() => onVista('inventario')}>
            <b>{a.vacuna}</b> · {a.text}
          </button>
        ))
      )}

      <h3 className="vx-sub">Tareas asignadas</h3>
      {tareas.length === 0 && <p className="hint">Sin tareas pendientes.</p>}
      {tareas.map((t) => (
        <section key={t.id} className="vx-item pend">
          <span className="vx-item-ico" aria-hidden="true">
            📋
          </span>
          <div>
            <b>{t.title}</b>
            <span>{t.description || `Asignada ${fechaHora(t.created_at)}`}</span>
          </div>
          <button type="button" className="primary small" onClick={() => accion(t)}>
            {t.status === 'in_progress' ? 'Terminar' : 'Iniciar'}
          </button>
        </section>
      ))}
    </div>
  )
}

/* ─────────────────────────── Inventario ─────────────────────────── */
const PRODUCTO_VACIO = {
  name: '',
  laboratory: '',
  disease: '',
  route: '',
  doses_per_vial: '1000',
  storage: 'nitrogen',
  min_doses: '0',
  active: true,
}

function Inventario({ api, stock, esLider, userId, orgName, userName, onMsg }) {
  const [producto, setProducto] = useState(null) // { id?, ...campos }
  const [mov, setMov] = useState(null) // { kind, product_id }
  const [abierto, setAbierto] = useState(null)
  const [verInactivas, setVerInactivas] = useState(false)
  const lista = stock.filter((p) => verInactivas || p.active)

  const exportar = async () => {
    const { exportToExcel } = await import('../lib/exportExcel')
    const nombre = new Map(api.products.map((p) => [p.id, p.name]))
    await exportToExcel(
      'Inventario_vacunas',
      [
        {
          name: 'Saldo por lote',
          rows: stock.flatMap((p) =>
            (p.lots.length ? p.lots : [{ lot: '—', doses: 0, vials: 0, expires: null }]).map((l) => ({
              Vacuna: p.name,
              Laboratorio: p.laboratory || '',
              'Lote fabricante': l.lot,
              Vence: l.expires || '',
              Dosis: l.doses,
              Frascos: l.vials,
              'Uso diario (30 d)': p.usoDiario,
              'Días de stock': p.diasDeStock ?? '',
            })),
          ),
        },
        {
          name: 'Movimientos',
          rows: api.movements.map((m) => ({
            Fecha: fechaHora(m.moved_at),
            Tipo: MOV_LABEL[m.kind] || m.kind,
            Vacuna: nombre.get(m.product_id) || '',
            'Lote fabricante': m.manufacturer_lot || '',
            Vence: m.expires_on || '',
            Frascos: m.vials ?? '',
            Dosis: m.doses,
            'Lote pollito': m.lote || '',
            Pollitos: m.chicks ?? '',
            Proveedor: m.supplier || '',
            Motivo: m.reason || '',
            Observaciones: m.notes || '',
          })),
        },
      ],
      {
        title: 'Inventario de vacunas',
        orgName,
        module: 'Producción · Vacunación',
        generatedBy: userName,
      },
    )
  }

  return (
    <div className="vx-inv">
      <div className="qp-filtros">
        <button
          type="button"
          className="primary small"
          onClick={() =>
            setMov({
              kind: 'in',
              product_id: stock.find((p) => p.active)?.id || '',
            })
          }
          disabled={!stock.length}
        >
          ＋ Entrada
        </button>
        <button type="button" className="ghost small" onClick={() => setProducto({ ...PRODUCTO_VACIO })}>
          ＋ Vacuna
        </button>
        <button type="button" className="ghost small" onClick={exportar} disabled={!stock.length}>
          📥 Excel
        </button>
        <label className="vx-check">
          <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} /> Ver inactivas
        </label>
      </div>

      {producto && <FormProducto inicial={producto} api={api} onClose={() => setProducto(null)} onMsg={onMsg} />}
      {mov && <FormMovimiento inicial={mov} api={api} stock={stock} onClose={() => setMov(null)} onMsg={onMsg} />}

      {api.loading && !stock.length && <p className="hint">Cargando…</p>}
      {!api.loading && !stock.length && !api.missing && <p className="hint">Registre la primera vacuna con «＋ Vacuna» y luego su entrada.</p>}
      {lista.map((p) => (
        <div
          key={p.id}
          className={`vx-prod ${p.alerts.some((a) => a.tone === 'danger') ? 't-danger' : p.alerts.length ? 't-warn' : ''} ${p.active ? '' : 'inactiva'}`}
        >
          <button type="button" className="vx-prod-head" onClick={() => setAbierto(abierto === p.id ? null : p.id)} aria-expanded={abierto === p.id}>
            <span className="vx-prod-nombre">
              <b>{p.name}</b>
              <small>
                {[p.disease, p.laboratory, p.route, STORAGE_LABEL[p.storage]].filter(Boolean).join(' · ')}
                {!p.active && ' · inactiva'}
              </small>
            </span>
            <span className="vx-prod-cifra">
              <b>{num(p.doses)}</b>
              <small>dosis · {num(p.vials)} frascos</small>
            </span>
            <span className="vx-prod-cifra">
              <b>{p.diasDeStock ?? '—'}</b>
              <small>días de stock</small>
            </span>
          </button>
          {p.alerts.map((a, i) => (
            <p key={i} className={`vx-alerta t-${a.tone}`}>
              {a.text}
            </p>
          ))}
          {abierto === p.id && (
            <div className="vx-prod-det">
              <div className="vx-tabla-wrap">
                <table className="vx-tabla">
                  <thead>
                    <tr>
                      <th>Lote fabricante</th>
                      <th>Vence</th>
                      <th>Dosis</th>
                      <th>Frascos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lots.length === 0 && (
                      <tr>
                        <td colSpan={4}>Sin saldo</td>
                      </tr>
                    )}
                    {p.lots.map((l) => (
                      <tr key={l.lot} className={l.days != null && l.days < 0 ? 't-danger' : l.days != null && l.days <= 15 ? 't-warn' : ''}>
                        <td>{l.lot}</td>
                        <td>
                          {fechaCorta(l.expires)}
                          {l.days != null && <small> ({l.days < 0 ? `vencido ${-l.days} d` : `${l.days} d`})</small>}
                        </td>
                        <td>{num(l.doses)}</td>
                        <td>{num(l.vials)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">
                {num(p.doses_per_vial)} dosis por frasco · mínimo {num(p.min_doses)} dosis · uso diario promedio {num(p.usoDiario)} dosis (30 días)
              </p>
              <div className="vx-botones">
                <button type="button" className="primary small" onClick={() => setMov({ kind: 'in', product_id: p.id })}>
                  Entrada
                </button>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() =>
                    setMov({
                      kind: 'discard',
                      product_id: p.id,
                      manufacturer_lot: loteSugerido(p) || p.lots[0]?.lot || '',
                    })
                  }
                >
                  Baja
                </button>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() =>
                    setMov({
                      kind: 'adjust',
                      product_id: p.id,
                      manufacturer_lot: p.lots[0]?.lot || '',
                    })
                  }
                >
                  Ajuste
                </button>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() =>
                    setProducto({
                      ...p,
                      doses_per_vial: String(p.doses_per_vial),
                      min_doses: String(p.min_doses),
                    })
                  }
                >
                  Editar
                </button>
              </div>
              <Movimientos
                api={api}
                movimientos={api.movements.filter((m) => m.product_id === p.id).slice(0, 12)}
                esLider={esLider}
                userId={userId}
                onMsg={onMsg}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function FormProducto({ inicial, api, onClose, onMsg }) {
  const [f, setF] = useState(inicial)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) =>
    setF({
      ...f,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    })
  const guardar = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) return onMsg('Escriba el nombre de la vacuna.', true)
    const porFrasco = Number(f.doses_per_vial)
    if (!(porFrasco > 0)) return onMsg('Las dosis por frasco deben ser mayores que 0.', true)
    setBusy(true)
    const res = await api.saveProduct(
      {
        name: f.name.trim(),
        laboratory: f.laboratory?.trim() || null,
        disease: f.disease?.trim() || null,
        route: f.route?.trim() || null,
        doses_per_vial: Math.round(porFrasco),
        storage: f.storage,
        min_doses: Math.max(0, Math.round(Number(f.min_doses) || 0)),
        active: Boolean(f.active),
      },
      f.id || null,
    )
    setBusy(false)
    onMsg(res.error || (f.id ? 'Vacuna actualizada' : 'Vacuna creada'), Boolean(res.error))
    if (!res.error) onClose()
  }
  return (
    <form className="qp-form vx-form" onSubmit={guardar}>
      <h3>{f.id ? `Editar ${inicial.name}` : 'Nueva vacuna'}</h3>
      <div className="qp-grid">
        <label>
          Nombre *
          <input value={f.name} onChange={set('name')} placeholder="ej: Marek HVT + Rispens" />
        </label>
        <label>
          Enfermedad
          <input value={f.disease || ''} onChange={set('disease')} placeholder="ej: Marek" />
        </label>
        <label>
          Laboratorio
          <input value={f.laboratory || ''} onChange={set('laboratory')} />
        </label>
        <label>
          Vía
          <input list="vx-vias" value={f.route || ''} onChange={set('route')} />
          <datalist id="vx-vias">
            {['Subcutánea', 'In ovo', 'Spray', 'Ocular', 'Agua de bebida'].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label>
          Dosis por frasco *
          <input inputMode="numeric" value={f.doses_per_vial} onChange={set('doses_per_vial')} />
        </label>
        <label>
          Almacenamiento
          <select value={f.storage} onChange={set('storage')}>
            {Object.entries(STORAGE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stock mínimo (dosis)
          <input inputMode="numeric" value={f.min_doses} onChange={set('min_doses')} />
        </label>
        <label className="qp-si">
          <span className="qp-si-caja">
            <input type="checkbox" checked={Boolean(f.active)} onChange={set('active')} /> Activa
          </span>
        </label>
      </div>
      <div className="vx-botones">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/** Entrada, consumo, baja o ajuste. Dosis = frascos × dosis por frasco (se puede corregir). */
function FormMovimiento({ inicial, api, stock, onClose, onMsg, lotesPollito = [] }) {
  const [f, setF] = useState({
    kind: inicial.kind,
    product_id: inicial.product_id || '',
    moved_at: ahoraLocal(),
    vials: '',
    doses: '',
    manufacturer_lot: inicial.manufacturer_lot ?? (inicial.kind === 'use' ? loteSugerido(stock.find((p) => p.id === inicial.product_id)) : ''),
    expires_on: '',
    lote: '',
    chicks: '',
    supplier: '',
    reason: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const prod = stock.find((p) => p.id === f.product_id)
  const porFrasco = prod?.doses_per_vial || 1000
  const dosisCalc = f.doses !== '' ? Number(f.doses) : f.vials !== '' ? Number(f.vials) * porFrasco : null
  const set = (k) => (e) => {
    const v = e.target.value
    const nuevo = { ...f, [k]: v }
    if (k === 'product_id' && f.kind === 'use') nuevo.manufacturer_lot = loteSugerido(stock.find((p) => p.id === v))
    setF(nuevo)
  }
  const titulo = {
    in: 'Entrada de vacuna',
    use: 'Consumo (vacunación de un lote)',
    discard: 'Baja de vacuna',
    adjust: 'Ajuste de inventario',
  }[f.kind]

  const guardar = async (e) => {
    e.preventDefault()
    if (!f.product_id) return onMsg('Elija la vacuna.', true)
    if (dosisCalc == null || Number.isNaN(dosisCalc) || (f.kind !== 'adjust' && dosisCalc < 0) || dosisCalc === 0)
      return onMsg('Escriba los frascos o las dosis.', true)
    if (f.kind === 'in' && !f.manufacturer_lot.trim()) return onMsg('Escriba el lote del fabricante.', true)
    if (f.kind === 'in' && !f.expires_on) return onMsg('Escriba la fecha de vencimiento.', true)
    if (f.kind === 'use' && !f.lote.trim()) return onMsg('Escriba el lote de pollito vacunado.', true)
    if ((f.kind === 'discard' || f.kind === 'adjust') && !f.reason.trim()) return onMsg('Escriba el motivo.', true)
    if (f.kind === 'use' || f.kind === 'discard') {
      const saldo = prod?.lots.find((l) => l.lot === (f.manufacturer_lot.trim() || 'Sin lote'))?.doses ?? 0
      if (
        dosisCalc > saldo &&
        !window.confirm(`El lote ${f.manufacturer_lot || 'sin lote'} tiene ${num(saldo)} dosis y va a descontar ${num(dosisCalc)}. ¿Guardar de todas formas?`)
      )
        return
    }
    setBusy(true)
    const res = await api.addMovement({
      kind: f.kind,
      product_id: f.product_id,
      moved_at: new Date(f.moved_at).toISOString(),
      vials: f.vials === '' ? (f.doses !== '' ? Math.round((Number(f.doses) / porFrasco) * 100) / 100 : null) : Number(f.vials),
      doses: dosisCalc,
      manufacturer_lot: f.manufacturer_lot.trim() || null,
      expires_on: f.kind === 'in' ? f.expires_on || null : null,
      lote: f.kind === 'use' ? f.lote.trim() : null,
      chicks: f.kind === 'use' && f.chicks !== '' ? Math.round(Number(f.chicks)) : null,
      supplier: f.kind === 'in' ? f.supplier.trim() || null : null,
      reason: f.reason.trim() || null,
      notes: f.notes.trim() || null,
    })
    setBusy(false)
    onMsg(res.error || `${MOV_LABEL[f.kind]} guardada · ${num(dosisCalc)} dosis de ${prod?.name || 'vacuna'}`, Boolean(res.error))
    if (!res.error) onClose()
  }

  return (
    <form className="qp-form vx-form" onSubmit={guardar}>
      <h3>{titulo}</h3>
      <div className="qp-grid">
        <label>
          Vacuna *
          <select value={f.product_id} onChange={set('product_id')}>
            <option value="">—</option>
            {stock
              .filter((p) => p.active || p.id === f.product_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({num(p.doses)} dosis)
                </option>
              ))}
          </select>
        </label>
        <label>
          Fecha y hora
          <input type="datetime-local" value={f.moved_at} onChange={set('moved_at')} />
        </label>
        <label>
          Lote del fabricante{f.kind === 'in' ? ' *' : ''}
          <input list="vx-lotes-fab" value={f.manufacturer_lot} onChange={set('manufacturer_lot')} />
          <datalist id="vx-lotes-fab">
            {(prod?.lots || []).map((l) => (
              <option key={l.lot} value={l.lot}>
                {num(l.doses)} dosis · vence {fecha(l.expires)}
              </option>
            ))}
          </datalist>
        </label>
        {f.kind === 'in' && (
          <>
            <label>
              Vence *
              <input type="date" value={f.expires_on} onChange={set('expires_on')} />
            </label>
            <label>
              Proveedor
              <input value={f.supplier} onChange={set('supplier')} />
            </label>
          </>
        )}
        {f.kind === 'use' && (
          <>
            <label>
              Lote de pollito *
              <input list="vx-lotes-pollito" value={f.lote} onChange={set('lote')} placeholder="ej: 45" />
              <datalist id="vx-lotes-pollito">
                {lotesPollito.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </label>
            <label>
              Pollitos vacunados
              <input inputMode="numeric" value={f.chicks} onChange={set('chicks')} />
            </label>
          </>
        )}
        <label>
          Frascos
          <input inputMode="decimal" value={f.vials} onChange={set('vials')} placeholder={`${num(porFrasco)} dosis c/u`} />
        </label>
        <label>
          Dosis {f.kind === 'adjust' ? '(+ suma, − resta)' : ''}
          <input inputMode="decimal" value={f.doses} onChange={set('doses')} placeholder={dosisCalc != null && f.doses === '' ? num(dosisCalc) : ''} />
        </label>
        {(f.kind === 'discard' || f.kind === 'adjust') && (
          <label>
            Motivo *
            <input list="vx-motivos" value={f.reason} onChange={set('reason')} />
            <datalist id="vx-motivos">
              {['Vencida', 'Rotura del frasco', 'Falla de la cadena de frío', 'Sobrante descartado', 'Conteo físico'].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
        )}
        <label className="qp-ancho">
          Observaciones
          <textarea rows={2} value={f.notes} onChange={set('notes')} />
        </label>
      </div>
      {f.kind === 'use' && f.chicks && dosisCalc ? (
        <p className="hint">
          {Math.round((dosisCalc / Number(f.chicks)) * 100) / 100} dosis por pollito
          {dosisCalc < Number(f.chicks) ? ' · ⚠ menos dosis que pollitos' : ''}
        </p>
      ) : null}
      <div className="vx-botones">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Movimientos({ api, movimientos, esLider, userId, onMsg, conVacuna = false }) {
  const nombre = new Map(api.products.map((p) => [p.id, p.name]))
  if (!movimientos.length) return <p className="hint">Sin movimientos.</p>
  return (
    <div className="vx-movs">
      {movimientos.map((m) => (
        <div key={m.id} className={`vx-mov k-${m.kind}`}>
          <span className="vx-mov-tipo">{MOV_LABEL[m.kind]}</span>
          <span className="vx-mov-main">
            <b>
              {m.kind === 'in' ? '+' : m.kind === 'adjust' && Number(m.doses) > 0 ? '+' : m.kind === 'adjust' ? '' : '−'}
              {num(Math.abs(Number(m.doses)))} dosis
              {conVacuna ? ` · ${nombre.get(m.product_id) || ''}` : ''}
              {m.lote ? ` · lote ${m.lote}` : ''}
            </b>
            <small>
              {fechaHora(m.moved_at)}
              {m.manufacturer_lot ? ` · fab. ${m.manufacturer_lot}` : ''}
              {m.expires_on ? ` · vence ${fecha(m.expires_on)}` : ''}
              {m.chicks ? ` · ${num(m.chicks)} pollitos` : ''}
              {m.reason ? ` · ${m.reason}` : ''}
              {m.notes ? ` · ${m.notes}` : ''}
            </small>
          </span>
          {(esLider || (userId && m.created_by === userId)) && (
            <button
              type="button"
              className="ghost small"
              aria-label="Borrar movimiento"
              onClick={async () => {
                if (!window.confirm('¿Borrar este movimiento? El saldo se recalcula.')) return
                const res = await api.removeMovement(m.id)
                onMsg(res.error || 'Movimiento borrado', Boolean(res.error))
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────── Consumo ─────────────────────────── */
function Consumo({ api, stock, userId, esLider, onMsg }) {
  const [form, setForm] = useState(false)
  const usos = api.movements.filter((m) => m.kind === 'use')
  const porLote = useMemo(() => consumoPorLote({ movements: api.movements, products: api.products }), [api.movements, api.products])
  const lotesPollito = useMemo(() => pendientesVacunacion(api.today).lotes.map((l) => l.lote), [api.today])
  const activa = stock.find((p) => p.active)
  return (
    <div className="vx-consumo">
      <div className="qp-filtros">
        <button type="button" className="primary small" onClick={() => setForm(true)} disabled={!activa}>
          💉 Registrar vacunación
        </button>
      </div>
      {form && (
        <FormMovimiento
          inicial={{ kind: 'use', product_id: activa?.id || '' }}
          api={api}
          stock={stock}
          lotesPollito={lotesPollito}
          onClose={() => setForm(false)}
          onMsg={onMsg}
        />
      )}
      <h3 className="vx-sub">Consumo por lote de pollito</h3>
      {porLote.length === 0 ? (
        <p className="hint">Sin consumos registrados.</p>
      ) : (
        <div className="vx-tabla-wrap">
          <table className="vx-tabla">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Vacunas</th>
                <th>Dosis</th>
                <th>Pollitos</th>
                <th>Dosis por pollito</th>
              </tr>
            </thead>
            <tbody>
              {porLote.map((g) => (
                <tr key={g.lote} className={g.dosisPorPollito != null && g.dosisPorPollito < 1 ? 't-warn' : ''}>
                  <td>
                    <b>{g.lote}</b>
                    <small> {fecha(g.last)}</small>
                  </td>
                  <td>{g.vacunas.join(', ')}</td>
                  <td>{num(g.doses)}</td>
                  <td>{g.chicks ? num(g.chicks) : '—'}</td>
                  <td>{g.dosisPorPollito ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3 className="vx-sub">Últimos consumos</h3>
      <Movimientos api={api} movimientos={usos.slice(0, 40)} esLider={esLider} userId={userId} onMsg={onMsg} conVacuna />
    </div>
  )
}
