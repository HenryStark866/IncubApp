/**
 * =============================================================================
 * ARCHIVO: src/components/DevStudio.jsx
 * PROPÓSITO: Componente UI «DevStudio»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { UI_FONTS, UI_SCALES, applyUiVars } from '../hooks/useUiSettings'

/**
 * 🎨 Diseño — el taller del rol desarrollador (y de la gestión).
 *
 * Permite trabajar el front desde la propia interfaz:
 *  - Apariencia: fuente, escala (tamaños/espacios) y colores de acento, en vivo.
 *  - Pestañas: crear/editar/deshabilitar módulos principales por bloques de contenido.
 *  - Bitácora: TODO cambio exige una descripción y queda registrado (inmutable).
 *
 * Lo que NO se puede desde aquí (a propósito): código arbitrario y el módulo de
 * Planos — ese solo lo trabaja el desarrollador, o quien tenga activa la tarea
 * "crear planos" (grants_module='plans').
 */

const fmtDT = (iso) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const AREA_LABEL = { theme: '🎨 Apariencia', module: '🧩 Pestañas', plans: '🗺 Planos', other: 'Otro' }

/** Registra el cambio en la bitácora (obligatorio en todo guardado del estudio). */
async function logChange({ orgId, userId, area, action, target, description, diff }) {
  await supabase.from('dev_changes').insert({
    org_id: orgId, actor: userId, area, action, target: target || null,
    description: description.trim(), diff: diff ?? null,
  })
}

/* ══ Apariencia ══════════════════════════════════════════════ */
function AppearanceTab({ orgId, userId }) {
  const [saved, setSaved] = useState({})
  const [form, setForm] = useState({ font: '', scale: '', accent: '', accentDim: '' })
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase.from('ui_settings').select('vars').eq('org_id', orgId).maybeSingle().then(({ data }) => {
      const v = data?.vars ?? {}
      setSaved(v)
      setForm({ font: v.font ?? '', scale: v.scale ?? '', accent: v.accent ?? '', accentDim: v.accentDim ?? '' })
    })
  }, [orgId])

  // Vista previa en vivo mientras se edita
  const set = (k) => (e) => {
    const next = { ...form, [k]: e.target.value }
    setForm(next)
    applyUiVars(next)
  }

  const save = async () => {
    if (desc.trim().length < 5) { setMsg({ kind: 'error', text: 'Describe el cambio (mínimo 5 caracteres) — todo queda documentado.' }); return }
    setBusy(true)
    setMsg(null)
    const vars = {}
    for (const k of ['font', 'scale', 'accent', 'accentDim']) if (form[k]) vars[k] = form[k]
    const { error } = await supabase.from('ui_settings').upsert({ org_id: orgId, vars, updated_by: userId }, { onConflict: 'org_id' })
    if (!error) await logChange({ orgId, userId, area: 'theme', action: 'actualizar apariencia', description: desc, diff: { antes: saved, despues: vars } })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error.message })
    else { setSaved(vars); setDesc(''); setMsg({ kind: 'ok', text: 'Apariencia guardada y documentada. Aplica para toda la empresa.' }) }
  }

  const reset = () => {
    const next = { font: '', scale: '', accent: '', accentDim: '' }
    setForm(next)
    applyUiVars({})
  }

  return (
    <div className="inline-form">
      <p className="hint" style={{ margin: 0 }}>
        Los cambios se ven en vivo en tu pantalla; al guardar aplican para toda la empresa (todos los dispositivos, al instante).
      </p>
      <div className="two-col">
        <label>
          Fuente / tipo de letra
          <select value={form.font} onChange={set('font')}>
            {UI_FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <label>
          Escala general (tamaños y espacios)
          <select value={form.scale} onChange={set('scale')}>
            {UI_SCALES.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <div className="two-col">
        <label>
          Color de acento {form.accent && <button type="button" className="ghost small" onClick={() => set('accent')({ target: { value: '' } })}>Quitar</button>}
          <input type="color" value={form.accent || '#e67e22'} onChange={set('accent')} style={{ height: 42, padding: 4 }} />
        </label>
        <label>
          Acento suave (botones/degradados) {form.accentDim && <button type="button" className="ghost small" onClick={() => set('accentDim')({ target: { value: '' } })}>Quitar</button>}
          <input type="color" value={form.accentDim || '#b85c14'} onChange={set('accentDim')} style={{ height: 42, padding: 4 }} />
        </label>
      </div>
      <label>
        Descripción del cambio (obligatoria — queda en la bitácora)
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Letra más grande para los operarios de campo" />
      </label>
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      <div className="actions row">
        <button className="primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar apariencia'}</button>
        <button className="ghost" onClick={reset} disabled={busy}>Restablecer a la base</button>
      </div>
    </div>
  )
}

/* ══ Editor de bloques de una pestaña ════════════════════════ */
const NEW_BLOCK = {
  titulo: () => ({ type: 'titulo', text: '' }),
  texto: () => ({ type: 'texto', text: '' }),
  lista: () => ({ type: 'lista', items: [''] }),
  enlace: () => ({ type: 'enlace', label: '', url: 'https://' }),
  separador: () => ({ type: 'separador' }),
}

function BlockEditor({ blocks, setBlocks }) {
  const setB = (i, patch) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const move = (i, d) => setBlocks((bs) => {
    const j = i + d
    if (j < 0 || j >= bs.length) return bs
    const copy = [...bs]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })
  const remove = (i) => setBlocks((bs) => bs.filter((_, j) => j !== i))

  return (
    <>
      <div className="actions row" style={{ marginTop: 4, flexWrap: 'wrap' }}>
        {Object.keys(NEW_BLOCK).map((t) => (
          <button key={t} type="button" className="chip ghost" onClick={() => setBlocks((bs) => [...bs, NEW_BLOCK[t]()])}>
            + {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {blocks.map((b, i) => (
        <div key={i} className="dev-block">
          <div className="dev-block-head">
            <span className="pill">{b.type}</span>
            <span>
              <button type="button" className="ghost small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="ghost small" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</button>
              <button type="button" className="ghost small danger" onClick={() => remove(i)}>✕</button>
            </span>
          </div>
          {b.type === 'titulo' && (
            <input type="text" value={b.text} onChange={(e) => setB(i, { text: e.target.value })} placeholder="Texto del título" />
          )}
          {b.type === 'texto' && (
            <textarea rows={3} value={b.text} onChange={(e) => setB(i, { text: e.target.value })} placeholder="Párrafo de texto…" style={{ width: '100%', marginTop: 6 }} />
          )}
          {b.type === 'lista' && (
            <textarea
              rows={3}
              value={(b.items ?? []).join('\n')}
              onChange={(e) => setB(i, { items: e.target.value.split('\n') })}
              placeholder={'Un ítem por línea'}
              style={{ width: '100%', marginTop: 6 }}
            />
          )}
          {b.type === 'enlace' && (
            <div className="two-col">
              <label>Texto<input type="text" value={b.label} onChange={(e) => setB(i, { label: e.target.value })} placeholder="Ej. Formato de vacunación" /></label>
              <label>URL (https://…)<input type="text" value={b.url} onChange={(e) => setB(i, { url: e.target.value })} /></label>
            </div>
          )}
        </div>
      ))}
    </>
  )
}

/* ══ Pestañas personalizadas ═════════════════════════════════ */
function ModulesTab({ orgId, userId }) {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | module
  const [form, setForm] = useState({ title: '', icon: '', position: 0, enabled: true })
  const [blocks, setBlocks] = useState([])
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('custom_modules')
      .select('id, title, icon, position, enabled, blocks, updated_at')
      .eq('org_id', orgId)
      .order('position')
    setList(data ?? [])
  }, [orgId])
  useEffect(() => { load() }, [load])

  const startNew = () => {
    setEditing('new')
    setForm({ title: '', icon: '', position: (list[list.length - 1]?.position ?? 0) + 1, enabled: true })
    setBlocks([])
    setDesc('')
    setMsg(null)
  }
  const startEdit = (m) => {
    setEditing(m)
    setForm({ title: m.title, icon: m.icon ?? '', position: m.position, enabled: m.enabled })
    setBlocks(Array.isArray(m.blocks) ? m.blocks : [])
    setDesc('')
    setMsg(null)
  }

  const save = async () => {
    if (form.title.trim().length < 2) { setMsg({ kind: 'error', text: 'El título es obligatorio (mínimo 2 caracteres).' }); return }
    if (desc.trim().length < 5) { setMsg({ kind: 'error', text: 'Describe el cambio (mínimo 5 caracteres) — todo queda documentado.' }); return }
    setBusy(true)
    setMsg(null)
    const payload = {
      title: form.title.trim(),
      icon: form.icon.trim() || null,
      position: Number(form.position) || 0,
      enabled: !!form.enabled,
      blocks: blocks.filter((b) => b.type === 'separador' || b.text?.trim() || b.items?.some((x) => x.trim()) || b.url?.trim()),
    }
    let error
    if (editing === 'new') {
      ;({ error } = await supabase.from('custom_modules').insert({ org_id: orgId, created_by: userId, ...payload }))
      if (!error) await logChange({ orgId, userId, area: 'module', action: 'crear pestaña', target: payload.title, description: desc, diff: { despues: payload } })
    } else {
      ;({ error } = await supabase.from('custom_modules').update(payload).eq('id', editing.id))
      if (!error) await logChange({ orgId, userId, area: 'module', action: 'editar pestaña', target: payload.title, description: desc, diff: { antes: { title: editing.title, blocks: editing.blocks }, despues: payload } })
    }
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error.message })
    else { setEditing(null); load() }
  }

  const remove = async (m) => {
    const motivo = window.prompt(`¿Eliminar la pestaña "${m.title}"?\n\nEscribe el motivo (queda en la bitácora):`)
    if (!motivo || motivo.trim().length < 5) return
    const { error } = await supabase.from('custom_modules').delete().eq('id', m.id)
    if (!error) await logChange({ orgId, userId, area: 'module', action: 'eliminar pestaña', target: m.title, description: motivo, diff: { antes: { title: m.title, blocks: m.blocks } } })
    load()
  }

  return (
    <>
      <p className="hint" style={{ margin: '8px 0' }}>
        Las pestañas habilitadas aparecen como módulos principales para toda la empresa. El contenido se arma por bloques (sin código).
      </p>
      {!editing && (
        <>
          <div className="actions row"><button className="primary small" onClick={startNew}>+ Nueva pestaña</button></div>
          <div className="admin-list" style={{ marginTop: 10 }}>
            {list.length === 0 && <p className="hint">Aún no hay pestañas personalizadas.</p>}
            {list.map((m) => (
              <div key={m.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>{m.icon ? `${m.icon} ` : ''}{m.title}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      Posición {m.position} · {(m.blocks ?? []).length} bloque(s) · Actualizada {fmtDT(m.updated_at)}
                    </span>
                  </div>
                  <span className={`pill status ${m.enabled ? 'ok' : 'idle'}`}>{m.enabled ? 'Visible' : 'Oculta'}</span>
                  <span className="admin-row-actions">
                    <button className="ghost small" onClick={() => startEdit(m)}>✏️ Editar</button>
                    <button className="ghost small danger" onClick={() => remove(m)}>Eliminar</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && (
        <div className="inline-form">
          <div className="two-col">
            <label>Título de la pestaña<input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej. Protocolos" autoFocus /></label>
            <label>Ícono (emoji, opcional)<input type="text" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} placeholder="Ej. 📋" maxLength={4} /></label>
          </div>
          <div className="two-col">
            <label>Posición (orden en el menú)<input type="number" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} /></label>
            <label className="check-inline" style={{ marginTop: 26 }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
              Visible para la empresa
            </label>
          </div>

          <p className="component-title" style={{ margin: '8px 0 0' }}>Contenido (bloques)</p>
          <BlockEditor blocks={blocks} setBlocks={setBlocks} />

          <label style={{ marginTop: 10 }}>
            Descripción del cambio (obligatoria — queda en la bitácora)
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Nueva pestaña de protocolos de bioseguridad" />
          </label>
          {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
          <div className="actions row">
            <button className="primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : editing === 'new' ? 'Crear pestaña' : 'Guardar cambios'}</button>
            <button className="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  )
}

/* ══ Bitácora ════════════════════════════════════════════════ */
function LogTab({ orgId }) {
  const [rows, setRows] = useState([])
  const [people, setPeople] = useState({})

  useEffect(() => {
    Promise.all([
      supabase.from('dev_changes').select('id, actor, area, action, target, description, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100),
      supabase.from('organization_members').select('user_id, profiles ( full_name, email )').eq('org_id', orgId),
    ]).then(([r, t]) => {
      setRows(r.data ?? [])
      const map = {}
      for (const x of t.data ?? []) map[x.user_id] = x.profiles?.full_name || x.profiles?.email || '—'
      setPeople(map)
    })
  }, [orgId])

  return (
    <>
      <p className="hint" style={{ margin: '8px 0' }}>
        Registro inmutable de todos los cambios hechos desde Diseño (quién, cuándo, qué y por qué). Últimos 100.
      </p>
      <div className="admin-list">
        {rows.length === 0 && <p className="hint">Sin cambios registrados todavía.</p>}
        {rows.map((r) => (
          <div key={r.id} className="admin-row compact" style={{ margin: 0 }}>
            <span>{(AREA_LABEL[r.area] ?? r.area).split(' ')[0]}</span>
            <div className="admin-row-main" style={{ flex: 1 }}>
              <strong>{r.action}{r.target ? ` — ${r.target}` : ''}</strong>
              <span className="hint" style={{ margin: 0 }}>{r.description}</span>
            </div>
            <span className="hint" style={{ margin: 0, textAlign: 'right' }}>
              {people[r.actor] ?? '—'}<br />{fmtDT(r.created_at)}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/* ══ Panel principal ═════════════════════════════════════════ */
export default function DevStudio({ orgId, userId, role }) {
  const [view, setView] = useState('apariencia')
  return (
    <div className="card wide">
      <div className="card-head">
        <h2>🎨 Diseño</h2>
        <span className="pill role">{role === 'developer' ? 'Desarrollador front' : 'Gestión'}</span>
      </div>
      <p className="hint" style={{ margin: '4px 0 0' }}>
        Taller del front: apariencia global, pestañas/módulos por bloques y bitácora. Los Planos no se editan aquí:
        los trabaja el desarrollador, o quien tenga activa la tarea de crear planos.
      </p>
      <div className="tabs" role="tablist" style={{ marginTop: 10 }}>
        <button className={view === 'apariencia' ? 'tab active' : 'tab'} onClick={() => setView('apariencia')}>Apariencia</button>
        <button className={view === 'pestanas' ? 'tab active' : 'tab'} onClick={() => setView('pestanas')}>Pestañas y módulos</button>
        <button className={view === 'bitacora' ? 'tab active' : 'tab'} onClick={() => setView('bitacora')}>Bitácora</button>
      </div>
      {view === 'apariencia' ? (
        <AppearanceTab orgId={orgId} userId={userId} />
      ) : view === 'pestanas' ? (
        <ModulesTab orgId={orgId} userId={userId} />
      ) : (
        <LogTab orgId={orgId} />
      )}
    </div>
  )
}
