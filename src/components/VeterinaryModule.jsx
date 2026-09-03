/**
 * =============================================================================
 * ARCHIVO: src/components/VeterinaryModule.jsx
 * PROPÓSITO: Componente UI «VeterinaryModule»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useState } from 'react'
import { useVeterinary, VET_KINDS, kindLabel } from '../hooks/useVeterinary'
import { ROLE_LABEL, areaLabel, isVeterinaryRole } from '../lib/roles'
import { exportToExcel } from '../lib/exportExcel'
import ListControls, { useListControls } from './ListControls'

const empty = {
  kind: 'vaccination',
  title: '',
  site: '',
  batch_or_lote: '',
  sample_point: '',
  result: '',
  result_status: 'ok',
  product_name: '',
  dose: '',
  units: '',
  recorded_at: new Date().toISOString().slice(0, 16),
  notes: '',
}

/**
 * Sanidad veterinaria: vacunas, medicina, fertilidad, lab wet tunnels.
 * Usuarios: médico vet. planta, aux. vacunación, coord. granja (vet), dueños.
 */
export default function VeterinaryModule({ orgId, userId, role, area, userName }) {
  const api = useVeterinary(orgId, userId)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const canWrite = isVeterinaryRole(role, area) || ['owner', 'admin', 'management'].includes(role)
  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const roleName = ROLE_LABEL[role] ?? role
  const isFarmCoord = role === 'coordinator' && area === 'farm'
  const isPlantVet = role === 'plant_veterinarian'
  const isVacAux = role === 'vaccination_auxiliary'

  const lc = useListControls(
    api.filtered,
    (r, q) =>
      `${r.title} ${r.site || ''} ${r.batch_or_lote || ''} ${r.product_name || ''} ${r.sample_point || ''}`
        .toLowerCase()
        .includes(q),
    15
  )

  const save = async () => {
    if (!form) return
    setBusy(true)
    setMsg(null)
    const recorded_at = form.recorded_at
      ? new Date(form.recorded_at).toISOString()
      : new Date().toISOString()
    const res = await api.save({ ...form, recorded_at }, form.id || null)
    setBusy(false)
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else {
      setMsg({ kind: 'ok', text: form.id ? 'Registro actualizado' : 'Registro guardado' })
      setForm(null)
    }
  }

  const exportAll = async () => {
    const rows = api.filtered.map((r) => ({
      Tipo: kindLabel(r.kind),
      Título: r.title,
      Sede: r.site || '',
      Lote: r.batch_or_lote || '',
      Punto_muestra: r.sample_point || '',
      Producto: r.product_name || '',
      Dosis: r.dose ?? '',
      Unidad: r.units || '',
      Resultado: r.result || '',
      Estado: r.result_status || '',
      Fecha: r.recorded_at
        ? new Date(r.recorded_at).toLocaleString('es-CO')
        : '',
      Notas: r.notes || '',
    }))
    const res = await exportToExcel(
      'sanidad-veterinaria',
      [{ name: 'Registros', rows }],
      { title: 'Sanidad veterinaria', module: 'Veterinaria' }
    )
    if (res.error) setMsg({ kind: 'error', text: res.error })
    else setMsg({ kind: 'ok', text: 'Excel de sanidad descargado' })
  }

  const subtitle = isFarmCoord
    ? 'Coordinación de granja (veterinario) · vacunas, medicina y pruebas'
    : isPlantVet
      ? 'Médico veterinario de planta · sanidad integral'
      : isVacAux
        ? 'Auxiliar de vacunación · ejecución y registro'
        : `${roleName}${area ? ` · ${areaLabel(area)}` : ''}`

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>Sanidad veterinaria</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {first ? `${first} · ` : ''}
            {subtitle}
          </p>
        </div>
        <div className="actions row" style={{ margin: 0, gap: 8 }}>
          {canWrite && (
            <button
              type="button"
              className="primary small"
              onClick={() => setForm({ ...empty })}
            >
              + Nuevo registro
            </button>
          )}
          <button type="button" className="ghost small" onClick={exportAll}>
            Excel
          </button>
          <button type="button" className="ghost small" onClick={() => api.reload()}>
            Actualizar
          </button>
        </div>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        Vacunación, medicamentos, pruebas de fertilidad y muestras de laboratorio de ambientes
        (incl. <strong>wet tunnels</strong>). Participan el médico veterinario de planta, el
        auxiliar de vacunación y los coordinadores de granja (veterinarios), con sus auxiliares.
      </p>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {api.localMode && (
        <p className="msg ok">
          Registros en modo local hasta publicar{' '}
          <code>supabase_migration_veterinary.sql</code>.
        </p>
      )}
      {api.error && !api.localMode && <p className="msg error">{api.error}</p>}

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-card">
          <span className="kpi-value">{api.stats.vaccination}</span>
          <span className="kpi-label">Vacunaciones</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{api.stats.medicine}</span>
          <span className="kpi-label">Medicina</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{api.stats.fertility}</span>
          <span className="kpi-label">Fertilidad</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-value">{api.stats.wet_tunnel_lab + api.stats.other_lab}</span>
          <span className="kpi-label">Lab / wet tunnel</span>
        </div>
        <div className={`kpi-card${api.stats.alert ? ' warn' : ''}`}>
          <span className="kpi-value">{api.stats.alert}</span>
          <span className="kpi-label">Resultados en alerta</span>
        </div>
      </div>

      <div className="plant-chips" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={api.kind === 'all' ? 'chip active' : 'chip'}
          onClick={() => api.setKind('all')}
        >
          Todos
        </button>
        {VET_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className={api.kind === k.value ? 'chip active' : 'chip'}
            onClick={() => api.setKind(k.value)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {form && canWrite && (
        <div className="inline-form compact" style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 8px' }}>
            {form.id ? 'Editar registro' : 'Nuevo registro de sanidad'}
          </h3>
          <div className="two-col">
            <label>
              Tipo *
              <select
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
              >
                {VET_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha / hora
              <input
                type="datetime-local"
                value={form.recorded_at}
                onChange={(e) => setForm((f) => ({ ...f, recorded_at: e.target.value }))}
              />
            </label>
            <label>
              Título / descripción *
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ej. Vacuna Gumboro lote L-12"
                autoFocus
              />
            </label>
            <label>
              Sede / galpón / sala
              <input
                value={form.site}
                onChange={(e) => setForm((f) => ({ ...f, site: e.target.value }))}
                placeholder="Granja Norte · Galpón 3 / Wet tunnel A"
              />
            </label>
            <label>
              Lote / batch
              <input
                value={form.batch_or_lote}
                onChange={(e) => setForm((f) => ({ ...f, batch_or_lote: e.target.value }))}
              />
            </label>
            {(form.kind === 'wet_tunnel_lab' || form.kind === 'other_lab' || form.kind === 'fertility') && (
              <label>
                Punto de muestra
                <input
                  value={form.sample_point}
                  onChange={(e) => setForm((f) => ({ ...f, sample_point: e.target.value }))}
                  placeholder="Ambiente wet tunnel, bandeja, aire…"
                />
              </label>
            )}
            {(form.kind === 'vaccination' || form.kind === 'medicine') && (
              <>
                <label>
                  Producto / biológico
                  <input
                    value={form.product_name}
                    onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
                  />
                </label>
                <label>
                  Dosis
                  <input
                    type="number"
                    step="any"
                    value={form.dose}
                    onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))}
                  />
                </label>
                <label>
                  Unidad
                  <input
                    value={form.units}
                    onChange={(e) => setForm((f) => ({ ...f, units: e.target.value }))}
                    placeholder="ml, dosis, ug…"
                  />
                </label>
              </>
            )}
            <label>
              Resultado / lectura
              <input
                value={form.result}
                onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
                placeholder="Valor o descripción del resultado"
              />
            </label>
            <label>
              Estado del resultado
              <select
                value={form.result_status}
                onChange={(e) => setForm((f) => ({ ...f, result_status: e.target.value }))}
              >
                <option value="ok">Conforme / OK</option>
                <option value="alert">Alerta / seguimiento</option>
                <option value="fail">No conforme</option>
                <option value="pending">Pendiente de lab</option>
              </select>
            </label>
            <label>
              Notas
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
          <div className="actions row">
            <button type="button" className="primary small" onClick={save} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {api.loading ? (
        <p className="hint">Cargando registros…</p>
      ) : api.filtered.length === 0 ? (
        <p className="hint" style={{ marginTop: 12 }}>
          Sin registros{api.kind !== 'all' ? ` de ${kindLabel(api.kind)}` : ''}. Use «Nuevo
          registro» para documentar vacunación, medicina, fertilidad o muestras de wet tunnel.
        </p>
      ) : (
        <>
          <ListControls lc={lc} placeholder="Buscar por lote, sede, producto…" />
          <div className="admin-list" style={{ marginTop: 8 }}>
            {lc.visible.map((r) => {
              const alert =
                r.result_status === 'alert' || r.result_status === 'fail'
              return (
                <div
                  key={r.id}
                  className={`admin-row${alert ? ' pending' : ''}`}
                  style={{ margin: 0, flexWrap: 'wrap' }}
                >
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>
                      {kindLabel(r.kind)} · {r.title}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {[
                        r.site,
                        r.batch_or_lote && `Lote ${r.batch_or_lote}`,
                        r.sample_point && `Muestra: ${r.sample_point}`,
                        r.product_name,
                        r.dose != null && `${r.dose} ${r.units || ''}`.trim(),
                        r.result && `Resultado: ${r.result}`,
                        r.result_status,
                        r.recorded_at &&
                          new Date(r.recorded_at).toLocaleString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  {canWrite && (
                    <span className="admin-row-actions">
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() =>
                          setForm({
                            id: r.id,
                            kind: r.kind,
                            title: r.title || '',
                            site: r.site || '',
                            batch_or_lote: r.batch_or_lote || '',
                            sample_point: r.sample_point || '',
                            result: r.result || '',
                            result_status: r.result_status || 'ok',
                            product_name: r.product_name || '',
                            dose: r.dose ?? '',
                            units: r.units || '',
                            recorded_at: r.recorded_at
                              ? new Date(r.recorded_at).toISOString().slice(0, 16)
                              : empty.recorded_at,
                            notes: r.notes || '',
                          })
                        }
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="ghost small danger"
                        onClick={async () => {
                          if (!window.confirm('¿Eliminar este registro?')) return
                          await api.remove(r.id)
                        }}
                      >
                        Eliminar
                      </button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
