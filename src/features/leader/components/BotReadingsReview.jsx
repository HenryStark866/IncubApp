/**
 * «Lecturas por revisar»: lo que el bot de fotos (n8n) no pudo confirmar.
 * El líder ve la foto, lo que digitó el turnero y lo que leyó el bot, deja el
 * valor correcto y la marca revisada. Guarda por resolver_lectura_bot, que
 * vuelve a comprobar en el servidor que quien guarda supervisa la planta.
 * Si la tabla del bot no existe en ese servidor, la sección no aparece.
 * Henry Stark Desarrollador · CDH Maker
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { isMissingTable } from '../../../lib/missingTable'
import { hourSlotLabel } from '../../../lib/roundRecords'
import { clock } from '../../shift/lib/shiftHome'
import { finalValues, machineMismatch, reviewFields } from '../lib/botReadings'
import './BotReadingsReview.css'

const COLUMNS =
  'check_id, valores, discrepancias, motivo, etiqueta_pantalla, procesada_at, machines ( code, name, type ), machine_checks ( taken_at, shift_date, shift_number, hour_slot, photo_path, taken_by, temp_ovoscan, temp_air, humidity, co2, turn_count )'

function useBotReadings(orgId) {
  const [state, setState] = useState({ rows: [], urls: {}, loading: true, error: null, missing: false })
  const load = useCallback(async () => {
    if (!orgId) return
    setState((s) => ({ ...s, loading: true }))
    const { data, error } = await supabase
      .from('machine_check_ai_readings')
      .select(COLUMNS)
      .eq('org_id', orgId)
      .eq('status', 'revisar')
      .order('procesada_at', { ascending: false })
      .limit(50)
    if (error) {
      setState({ rows: [], urls: {}, loading: false, error: isMissingTable(error) ? null : error.message, missing: isMissingTable(error) })
      return
    }
    const paths = [...new Set((data || []).map((r) => r.machine_checks?.photo_path).filter(Boolean))]
    const signed = paths.length ? await supabase.storage.from('machine-checks').createSignedUrls(paths, 3600) : { data: [] }
    const urls = Object.fromEntries((signed.data || []).filter((s) => s?.signedUrl).map((s) => [s.path, s.signedUrl]))
    setState({ rows: data || [], urls, loading: false, error: null, missing: false })
  }, [orgId])
  useEffect(() => {
    load()
  }, [load])
  return { ...state, reload: load }
}

function ReadingEditor({ reading, url, onDone, onCancel }) {
  const fields = reviewFields(reading)
  const mismatch = machineMismatch(reading)
  const [draft, setDraft] = useState({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { valores, error: draftError } = finalValues(fields, draft)
  const changes = valores ? Object.keys(valores).length : 0
  const valueOf = (f) => (draft[f.key] !== undefined ? draft[f.key] : f.initial == null ? '' : String(f.initial))

  const save = async () => {
    if (draftError) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('resolver_lectura_bot', {
      p_check_id: reading.check_id,
      p_valores: valores,
      p_nota: note || null,
    })
    setBusy(false)
    if (rpcError) setError(rpcError.message)
    else onDone(changes ? `${reading.machines?.code || 'Máquina'}: ${changes} lectura${changes === 1 ? '' : 's'} corregida${changes === 1 ? '' : 's'}` : `${reading.machines?.code || 'Máquina'}: confirmada como estaba`)
  }

  return (
    <div className="br-editor">
      {url ? (
        <a className="br-photo" href={url} target="_blank" rel="noreferrer" title="Abrir la foto completa">
          <img src={url} alt={`Pantalla de ${reading.machines?.code || 'la máquina'}`} />
        </a>
      ) : (
        <p className="br-photo br-nophoto">No se pudo cargar la foto.</p>
      )}
      <div className="br-form">
        {mismatch && <p className="lh-msg is-error">{mismatch} Verifica en la foto antes de guardar.</p>}
        <table className="br-table">
          <thead>
            <tr>
              <th scope="col">Lectura</th>
              <th scope="col">Turnero</th>
              <th scope="col">Foto (bot)</th>
              <th scope="col">Valor final</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className={f.flagged ? 'is-flagged' : ''}>
                <th scope="row">
                  {f.label}
                  {f.unit ? <small> {f.unit}</small> : null}
                  {f.reason && <span className="br-reason">{f.reason}</span>}
                </th>
                <td>{f.operator ?? '—'}</td>
                <td>{f.photoText}</td>
                <td>
                  <div className="br-final">
                    <label className="lh-sr" htmlFor={`br-${reading.check_id}-${f.key}`}>
                      Valor final de {f.label}
                    </label>
                    <input
                      id={`br-${reading.check_id}-${f.key}`}
                      className="br-input"
                      inputMode="decimal"
                      value={valueOf(f)}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                    {f.photo != null && f.photo !== f.operator && (
                      <button
                        type="button"
                        className="br-use"
                        onClick={() => setDraft((d) => ({ ...d, [f.key]: String(f.photo) }))}
                      >
                        Usar foto
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="br-note">
          <span>Nota (opcional)</span>
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: foto con reflejo, se leyó en sitio" />
        </label>
        {(draftError || error) && <p className="lh-msg is-error">{draftError || error}</p>}
        <div className="lh-dec-actions">
          <button type="button" className="lh-btn" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="lh-btn lh-btn-p" onClick={save} disabled={busy || !!draftError}>
            {busy ? 'Guardando…' : changes ? `Guardar ${changes} ${changes === 1 ? 'corrección' : 'correcciones'}` : 'Confirmar como está'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BotReadingsReview({ orgId, peopleName = {} }) {
  const { rows, urls, loading, error, missing, reload } = useBotReadings(orgId)
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState(null)

  if (missing || (!loading && !error && rows.length === 0 && !msg)) return null

  return (
    <section className="lh-section">
      <div className="lh-sec-head">
        <h2>Lecturas por revisar · {rows.length}</h2>
        <span>el bot de fotos no pudo confirmarlas</span>
      </div>
      {msg && <p className="lh-msg is-ok">{msg}</p>}
      {error && <p className="lh-msg is-error">{error}</p>}
      <div className="lh-card">
        {loading && rows.length === 0 ? (
          <p className="lh-empty">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="lh-empty">No quedan lecturas por revisar.</p>
        ) : (
          rows.map((r) => {
            const c = r.machine_checks || {}
            const isOpen = open === r.check_id
            const who = c.taken_by ? peopleName[c.taken_by] : null
            const flagged = reviewFields(r).filter((f) => f.flagged)
            const summary = machineMismatch(r) || (flagged.length ? flagged.map((f) => `${f.label}: ${f.reason.toLowerCase()}`).join(' · ') : r.motivo)
            return (
              <div key={r.check_id} className={`br-item${isOpen ? ' is-open' : ''}`}>
                <div className="lh-dec tone-warn">
                  <span className="lh-sev" aria-hidden="true" />
                  <div className="lh-dec-main">
                    <b>
                      {r.machines?.code || r.machines?.name || 'Máquina'} · T{c.shift_number} {hourSlotLabel(c.hour_slot) || ''}
                    </b>
                    <span>{summary}</span>
                    <span>
                      {c.shift_date} · foto {c.taken_at ? clock(c.taken_at) : ''}
                      {who ? ` · ${who}` : ''}
                    </span>
                  </div>
                  <div className="lh-dec-actions">
                    <button
                      type="button"
                      className={`lh-btn${isOpen ? '' : ' lh-btn-p'}`}
                      aria-expanded={isOpen}
                      onClick={() => {
                        setMsg(null)
                        setOpen(isOpen ? null : r.check_id)
                      }}
                    >
                      {isOpen ? 'Cerrar' : 'Revisar'}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <ReadingEditor
                    reading={r}
                    url={urls[c.photo_path] || null}
                    onCancel={() => setOpen(null)}
                    onDone={(text) => {
                      setOpen(null)
                      setMsg(text)
                      reload()
                    }}
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
