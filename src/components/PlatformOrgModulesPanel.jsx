/**
 * =============================================================================
 * ARCHIVO: src/components/PlatformOrgModulesPanel.jsx
 * PROPÓSITO: Consola CDH Maker · «Módulos por empresa»: control total del
 * catálogo por tenant. Habilitar/deshabilitar módulos del producto y crear
 * módulos personalizados asignándolos a una o varias empresas.
 * CÓMO FUNCIONA: Los apagados se guardan en organizations.settings
 * (disabled_menu_ids) y la app del cliente los deja de mostrar al instante.
 * Los personalizados viven en custom_modules (una fila por empresa asignada);
 * su contenido por bloques se edita en Studio UI con la empresa elegida.
 * Solo admin de plataforma (RLS is_platform_admin). Todo queda en dev_changes.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildModuleCatalog } from '../lib/orgModules'
import { useOrgModuleConfig } from '../hooks/useOrgModuleConfig'

const fmtDT = (iso) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Bitácora inmutable de la consola (misma tabla que Studio UI). */
async function logChange({ orgId, userId, action, target, description, diff }) {
  await supabase.from('dev_changes').insert({
    org_id: orgId,
    actor: userId,
    area: 'module',
    action,
    target: target || null,
    description,
    diff: diff ?? null,
  })
}

/* ══ Catálogo del producto: encender/apagar por empresa ══════ */
function CatalogSection({ org, userId, config }) {
  const catalog = useMemo(() => buildModuleCatalog(), [])
  const groups = useMemo(() => {
    const map = new Map()
    for (const m of catalog) {
      if (!map.has(m.group)) map.set(m.group, [])
      map.get(m.group).push(m)
    }
    return [...map.entries()]
  }, [catalog])

  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null)

  const toggle = async (mod) => {
    const disable = config.moduleEnabled(mod.tab)
    if (
      disable &&
      !window.confirm(
        `¿Desactivar «${mod.label}» para ${org.name}?\n\nLos usuarios de la empresa dejarán de ver este módulo de inmediato.`
      )
    ) {
      return
    }
    setBusyId(mod.id)
    setMsg(null)
    const { error } = await config.setModuleDisabled(mod.id, disable, {
      userId,
      orgName: org.name,
      label: mod.label,
    })
    setBusyId(null)
    if (error) setMsg({ kind: 'error', text: error })
    else
      setMsg({
        kind: 'ok',
        text: `«${mod.label}» ${disable ? 'desactivado' : 'activado'} para ${org.name}. Aplica al instante en la app del cliente.`,
      })
  }

  const disabledCount = config.disabledMenuIds.size

  return (
    <>
      <p className="hint" style={{ margin: '8px 0' }}>
        Catálogo del producto para <strong>{org.name}</strong>. Los módulos base (núcleo) no se
        pueden apagar. {disabledCount > 0 ? `${disabledCount} módulo(s) desactivado(s).` : 'Todos los módulos están activos.'}
      </p>
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {groups.map(([group, mods]) => (
        <div key={group}>
          <p className="component-title" style={{ margin: '14px 0 6px' }}>
            {group}
          </p>
          <div className="admin-list">
            {mods.map((m) => {
              const enabled = config.moduleEnabled(m.tab)
              return (
                <div key={m.id} className="admin-row compact" style={{ margin: '0 0 4px' }}>
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>{m.label}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {m.id}
                      {m.hint ? ` · ${m.hint}` : ''}
                      {m.domains.length ? ` · ${m.domains.join(' · ')}` : ''}
                    </span>
                  </div>
                  {m.core ? (
                    <span className="pill role" title="Módulo del núcleo: siempre activo">
                      Núcleo
                    </span>
                  ) : (
                    <>
                      <span className={`pill status ${enabled ? 'ok' : 'idle'}`}>
                        {enabled ? 'Activo' : 'Desactivado'}
                      </span>
                      <span className="admin-row-actions">
                        <button
                          type="button"
                          className={`ghost small${enabled ? ' danger' : ''}`}
                          disabled={busyId === m.id || config.loading}
                          onClick={() => toggle(m)}
                        >
                          {busyId === m.id ? '…' : enabled ? 'Desactivar' : 'Activar'}
                        </button>
                      </span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

/* ══ Módulos personalizados: crear y asignar a empresas ══════ */
function CustomSection({ org, orgs, userId }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', icon: '', position: 0, content: '' })
  const [targets, setTargets] = useState(() => new Set([org.id]))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('custom_modules')
      .select('id, title, icon, position, enabled, blocks, updated_at')
      .eq('org_id', org.id)
      .order('position')
    setList(data ?? [])
    setLoading(false)
  }, [org.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setTargets(new Set([org.id]))
  }, [org.id])

  const startCreate = () => {
    setCreating(true)
    setForm({ title: '', icon: '', position: (list[list.length - 1]?.position ?? 0) + 1, content: '' })
    setTargets(new Set([org.id]))
    setMsg(null)
  }

  const toggleTarget = (id) => {
    setTargets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const create = async () => {
    const title = form.title.trim()
    if (title.length < 2) {
      setMsg({ kind: 'error', text: 'El título es obligatorio (mínimo 2 caracteres).' })
      return
    }
    if (targets.size === 0) {
      setMsg({ kind: 'error', text: 'Selecciona al menos una empresa destino.' })
      return
    }
    setBusy(true)
    setMsg(null)
    const blocks = form.content.trim() ? [{ type: 'texto', text: form.content.trim() }] : []
    const payload = {
      title,
      icon: form.icon.trim() || null,
      position: Number(form.position) || 0,
      enabled: true,
      blocks,
      created_by: userId,
    }
    const errors = []
    for (const targetId of targets) {
      const target = orgs.find((o) => o.id === targetId)
      const { error } = await supabase.from('custom_modules').insert({ org_id: targetId, ...payload })
      if (error) {
        errors.push(`${target?.name || targetId}: ${error.message}`)
      } else {
        await logChange({
          orgId: targetId,
          userId,
          action: 'crear módulo personalizado',
          target: title,
          description: `Módulo personalizado «${title}» creado y asignado a ${target?.name || 'la empresa'} desde la consola de plataforma`,
          diff: { despues: payload },
        })
      }
    }
    setBusy(false)
    if (errors.length) {
      setMsg({ kind: 'error', text: `Errores: ${errors.join(' · ')}` })
    } else {
      setCreating(false)
      setMsg({
        kind: 'ok',
        text: `Módulo «${title}» creado en ${targets.size} empresa(s). El contenido por bloques se edita en Studio UI con la empresa elegida.`,
      })
    }
    load()
  }

  const toggleEnabled = async (m) => {
    const { error } = await supabase
      .from('custom_modules')
      .update({ enabled: !m.enabled })
      .eq('id', m.id)
    if (error) {
      setMsg({ kind: 'error', text: error.message })
      return
    }
    await logChange({
      orgId: org.id,
      userId,
      action: m.enabled ? 'desactivar módulo personalizado' : 'activar módulo personalizado',
      target: m.title,
      description: `Módulo personalizado «${m.title}» ${m.enabled ? 'desactivado' : 'activado'} para ${org.name} desde la consola de plataforma`,
    })
    load()
  }

  const remove = async (m) => {
    const motivo = window.prompt(
      `¿Eliminar el módulo «${m.title}» de ${org.name}?\n\nEscribe el motivo (queda en la bitácora):`
    )
    if (!motivo || motivo.trim().length < 5) return
    const { error } = await supabase.from('custom_modules').delete().eq('id', m.id)
    if (error) {
      setMsg({ kind: 'error', text: error.message })
      return
    }
    await logChange({
      orgId: org.id,
      userId,
      action: 'eliminar módulo personalizado',
      target: m.title,
      description: motivo.trim(),
      diff: { antes: { title: m.title, blocks: m.blocks } },
    })
    load()
  }

  return (
    <>
      <p className="hint" style={{ margin: '8px 0' }}>
        Módulos creados a medida. Aparecen en el menú del cliente (grupo «Personalizados») cuando
        están activos. Aquí se crean y se asignan; el contenido por bloques se afina en{' '}
        <strong>Studio UI</strong> con la empresa elegida en la barra.
      </p>
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}

      {!creating && (
        <>
          <div className="actions row">
            <button type="button" className="primary small" onClick={startCreate}>
              + Nuevo módulo (asignar a empresas)
            </button>
          </div>
          <div className="admin-list" style={{ marginTop: 10 }}>
            {loading && <p className="hint">Cargando…</p>}
            {!loading && list.length === 0 && (
              <p className="hint">Esta empresa no tiene módulos personalizados.</p>
            )}
            {list.map((m) => (
              <div key={m.id} className="admin-row compact" style={{ margin: '0 0 4px' }}>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>
                    {m.icon ? `${m.icon} ` : ''}
                    {m.title}
                  </strong>
                  <span className="hint" style={{ margin: 0 }}>
                    Posición {m.position} · {(m.blocks ?? []).length} bloque(s) · Actualizado{' '}
                    {fmtDT(m.updated_at)}
                  </span>
                </div>
                <span className={`pill status ${m.enabled ? 'ok' : 'idle'}`}>
                  {m.enabled ? 'Activo' : 'Desactivado'}
                </span>
                <span className="admin-row-actions">
                  <button
                    type="button"
                    className={`ghost small${m.enabled ? ' danger' : ''}`}
                    onClick={() => toggleEnabled(m)}
                  >
                    {m.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" className="ghost small danger" onClick={() => remove(m)}>
                    Eliminar
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {creating && (
        <div className="inline-form">
          <div className="two-col">
            <label>
              Título del módulo
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ej. Protocolos de bioseguridad"
                autoFocus
              />
            </label>
            <label>
              Ícono (emoji, opcional)
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="Ej. 📋"
                maxLength={4}
              />
            </label>
          </div>
          <div className="two-col">
            <label>
              Posición (orden en el menú)
              <input
                type="number"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </label>
          </div>
          <label>
            Contenido inicial (opcional — un párrafo; los bloques se editan en Studio UI)
            <textarea
              rows={3}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Texto inicial del módulo…"
              style={{ width: '100%' }}
            />
          </label>
          <p className="component-title" style={{ margin: '8px 0 0' }}>
            Asignar a empresas ({targets.size})
          </p>
          <div className="admin-list">
            {orgs.map((o) => (
              <label key={o.id} className="check-inline" style={{ display: 'flex', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={targets.has(o.id)}
                  onChange={() => toggleTarget(o.id)}
                />
                {o.name}
              </label>
            ))}
          </div>
          <div className="actions row">
            <button type="button" className="primary" onClick={create} disabled={busy}>
              {busy ? 'Creando…' : `Crear en ${targets.size} empresa(s)`}
            </button>
            <button type="button" className="ghost" onClick={() => setCreating(false)} disabled={busy}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* ══ Panel principal ═════════════════════════════════════════ */
export default function PlatformOrgModulesPanel({ orgs = [], defaultOrgId = null, userId }) {
  const [orgId, setOrgId] = useState(defaultOrgId || orgs[0]?.id || '')
  const [view, setView] = useState('catalogo')

  useEffect(() => {
    if (!orgId && orgs.length) setOrgId(defaultOrgId || orgs[0].id)
  }, [orgs, orgId, defaultOrgId])

  const org = orgs.find((o) => o.id === orgId) || null
  const config = useOrgModuleConfig(org?.id)

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>🧩 Módulos por empresa</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Control total del catálogo por tenant: habilite, deshabilite y cree módulos y asígnelos
            a las empresas. Todo cambio queda en la bitácora.
          </p>
        </div>
        <label>
          Empresa
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!org ? (
        <p className="hint" style={{ marginTop: 12 }}>
          No hay empresas todavía. Cree una en <strong>Empresas y usuarios</strong>.
        </p>
      ) : (
        <>
          <div className="tabs" role="tablist" style={{ marginTop: 10 }}>
            <button
              type="button"
              className={view === 'catalogo' ? 'tab active' : 'tab'}
              onClick={() => setView('catalogo')}
            >
              Catálogo del producto
            </button>
            <button
              type="button"
              className={view === 'personalizados' ? 'tab active' : 'tab'}
              onClick={() => setView('personalizados')}
            >
              Personalizados
            </button>
          </div>
          {config.error && <p className="msg error">{config.error}</p>}
          {view === 'catalogo' ? (
            <CatalogSection org={org} userId={userId} config={config} />
          ) : (
            <CustomSection org={org} orgs={orgs} userId={userId} />
          )}
        </>
      )}
    </div>
  )
}
