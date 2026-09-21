/**
 * Gestión de plantillas de menú/módulos para nuevas empresas.
 * Estructura base versionable: al adecuar el producto se publica y se propaga metadata.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_CLIENT_TEMPLATE,
  listClientTemplates,
  defaultTemplateRpcPayload,
} from '../lib/clientMenuTemplate'

export default function PlatformTemplatesPanel() {
  const localTemplates = listClientTemplates()
  const [remote, setRemote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const loadRemote = useCallback(async () => {
    const { data, error } = await supabase
      .from('platform_client_templates')
      .select('*')
      .eq('is_default', true)
      .maybeSingle()
    if (!error && data) setRemote(data)
  }, [])

  useEffect(() => {
    loadRemote()
  }, [loadRemote])

  const publishBase = async () => {
    setBusy(true)
    setMsg(null)
    const payload = defaultTemplateRpcPayload(DEFAULT_CLIENT_TEMPLATE)
    const { data, error } = await supabase.rpc('platform_upsert_default_template', {
      p_payload: payload,
    })
    setBusy(false)
    if (error) {
      setMsg({
        kind: 'error',
        text:
          error.message ||
          'No se pudo publicar. Ejecute supabase_migration_platform_staff_and_flow.sql',
      })
      return
    }
    setRemote(data)
    setMsg({
      kind: 'ok',
      text: `Estructura base actualizada a v${data?.version ?? payload.version}. Las empresas que usan esta plantilla reciben la metadata nueva.`,
    })
    loadRemote()
  }

  const display = remote
    ? {
        id: remote.id,
        name: remote.name,
        description: remote.description,
        version: remote.version,
        sourceClient: remote.source_note,
        menu: Array.isArray(remote.menu) ? remote.menu : DEFAULT_CLIENT_TEMPLATE.menu,
        enabledDomains: Array.isArray(remote.enabled_domains)
          ? remote.enabled_domains
          : DEFAULT_CLIENT_TEMPLATE.enabledDomains,
      }
    : localTemplates[0]

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>Plantillas de empresa (estructura base)</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Al crear o editar un tenant se parte de esta estructura. Cuando se adecúe el producto,
            publique la plantilla para subir versión y sincronizar metadata en las empresas.
          </p>
        </div>
        <button type="button" className="primary" disabled={busy} onClick={publishBase}>
          {busy ? 'Publicando…' : 'Publicar estructura base actual'}
        </button>
      </div>

      {msg && (
        <p className={`msg ${msg.kind === 'error' ? 'error' : 'ok'}`} style={{ marginTop: 12 }}>
          {msg.text}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <div className="tool-card" style={{ padding: 14 }}>
          <strong>{display.name}</strong>
          <p className="hint" style={{ margin: '6px 0' }}>
            {display.description}
          </p>
          <p className="hint" style={{ margin: 0 }}>
            ID: <code>{display.id}</code> · v{display.version}
            {display.sourceClient ? ` · ${display.sourceClient}` : ''}
            {remote ? ' · en Supabase' : ' · solo código local (aún no publicada)'}
          </p>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Dominios: {(display.enabledDomains || []).join(', ')}
          </p>
        </div>

        <p className="component-title" style={{ margin: '16px 0 8px' }}>
          Ítems del menú plantilla ({(display.menu || []).length})
        </p>
        <div className="admin-list">
          {(display.menu || []).map((m) => (
            <div key={m.id} className="admin-row compact" style={{ margin: '0 0 4px' }}>
              <div className="admin-row-main">
                <strong>{m.label}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  {m.id}
                  {m.group ? ` · grupo: ${m.group}` : ''}
                  {m.always ? ' · siempre' : ''}
                </span>
              </div>
              {m.hint && <span className="hint">{m.hint}</span>}
            </div>
          ))}
        </div>
      </div>

      <p className="msg ok" style={{ marginTop: 16 }}>
        Flujo: <strong>Empresas y usuarios</strong> → crear empresa (aplica plantilla) →{' '}
        <strong>Elegir compañía</strong> en la barra → construir/editar menú operativo, plantas y
        usuarios. Al adecuar la estructura base, use <strong>Publicar estructura base actual</strong>
        .
      </p>
    </div>
  )
}
