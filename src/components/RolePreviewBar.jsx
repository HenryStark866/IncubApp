/**
 * Vista por rol (solo admin de plataforma).
 * Oculta por defecto; se despliega al pulsar «Ver como».
 * Henry Stark Desarrollador
 */
import { useEffect, useMemo, useState } from 'react'
import { ORG_ROLES, WORK_AREAS, ROLE_LABEL, areaLabel } from '../lib/roles'
import { domainsMemberOf, nativeTabsFor } from '../lib/privacyScopes'

/**
 * @param {{
 *   active: { role: string, area?: string|null } | null,
 *   onChange: (next: { role: string, area?: string|null } | null) => void,
 *   realRole?: string|null,
 * }} props
 */
export default function RolePreviewBar({ active, onChange, realRole }) {
  const [open, setOpen] = useState(false)
  const role = active?.role || ''
  const area = active?.area || ''

  // Si hay una vista activa al montar, no forzar el panel abierto (solo chip compacto)
  useEffect(() => {
    if (!active) setOpen(false)
  }, [active])

  const needsArea = role === 'coordinator' || role === 'supervisor'

  const previewTabs = useMemo(() => {
    if (!active?.role) return []
    return [...nativeTabsFor(active.role, active.area || null)].sort()
  }, [active])

  const previewDomains = useMemo(() => {
    if (!active?.role) return []
    return domainsMemberOf(active.role, active.area || null)
  }, [active])

  const groups = useMemo(() => {
    const map = new Map()
    for (const r of ORG_ROLES) {
      const g = r.group || 'Otros'
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(r)
    }
    return [...map.entries()]
  }, [])

  const apply = (nextRole, nextArea) => {
    if (!nextRole) {
      onChange(null)
      return
    }
    onChange({
      role: nextRole,
      area:
        nextRole === 'coordinator' || nextRole === 'supervisor'
          ? nextArea || 'plant'
          : nextArea || null,
    })
  }

  const exit = () => {
    onChange(null)
    setOpen(false)
  }

  // ── Compacto: solo botón o chip de vista activa ────────────
  if (!open) {
    return (
      <div className={`role-preview-toggle-wrap${active ? ' is-active' : ''}`}>
        {active ? (
          <div className="role-preview-chip-row">
            <button
              type="button"
              className="role-preview-chip active"
              onClick={() => setOpen(true)}
              title="Cambiar rol simulado"
            >
              <span className="role-preview-chip-dot" aria-hidden />
              Ver como:{' '}
              <strong>
                {ROLE_LABEL[active.role] || active.role}
                {active.area ? ` · ${areaLabel(active.area)}` : ''}
              </strong>
            </button>
            <button type="button" className="role-preview-exit compact" onClick={exit}>
              Salir
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="role-preview-chip"
            onClick={() => setOpen(true)}
            title="Simular menú y módulos de otro rol (solo admin)"
          >
            Ver como…
          </button>
        )}
      </div>
    )
  }

  // ── Desplegado: selector completo ──────────────────────────
  return (
    <div className={`role-preview-bar${active ? ' active' : ''} open`}>
      <div className="role-preview-main">
        <span className="role-preview-badge" title="Solo admin de plataforma">
          QA · Ver como
        </span>
        <label className="role-preview-field">
          <span className="sr-only">Rol a simular</span>
          <select
            value={role}
            autoFocus
            onChange={(e) => {
              const v = e.target.value
              if (!v) onChange(null)
              else apply(v, area || 'plant')
            }}
          >
            <option value="">— Mi vista real —</option>
            {groups.map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {needsArea && (
          <label className="role-preview-field">
            <span className="sr-only">Área</span>
            <select
              value={area || 'plant'}
              onChange={(e) => apply(role, e.target.value)}
            >
              {WORK_AREAS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {active && (
          <button type="button" className="role-preview-exit" onClick={exit}>
            Salir de vista
          </button>
        )}
        <button
          type="button"
          className="role-preview-collapse"
          onClick={() => setOpen(false)}
          title="Ocultar panel"
        >
          Cerrar
        </button>
      </div>
      {active && (
        <div className="role-preview-meta">
          <strong>
            Viendo exactamente como: {ROLE_LABEL[active.role] || active.role}
            {active.area ? ` · ${areaLabel(active.area)}` : ''}
          </strong>
          <span>
            Módulos nativos:{' '}
            {previewDomains.map((d) => d.label).join(' · ') || 'solo comunes'}
            {' · '}
            Pestañas: {previewTabs.length ? previewTabs.join(', ') : 'hoy, perfil…'}
          </span>
          <span className="role-preview-hint">
            Tu sesión real sigue siendo admin
            {realRole ? ` (${ROLE_LABEL[realRole] || realRole})` : ''}. Los datos en BD no cambian;
            solo el menú y permisos de UI.
          </span>
        </div>
      )}
      {!active && (
        <p className="role-preview-hint" style={{ margin: '8px 0 0' }}>
          Elige un rol para ver su menú y módulos. Puedes cerrar este panel cuando no lo uses.
        </p>
      )}
    </div>
  )
}
