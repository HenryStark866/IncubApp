/**
 * Barra de plataforma: elegir empresa (tenant) e ingresar en modo desarrollador general.
 * Solo admin SaaS (CDH Maker). Henry Stark
 */

import { useMemo } from 'react'
import { BRAND, PLATFORM_DEV_ROLE } from '../lib/brandIdentity'

/**
 * @param {{
 *   orgs: Array<{id:string,name:string,slug?:string}>,
 *   activeOrgId: string|null,
 *   onSelect: (org: object|null) => void,
 *   loading?: boolean,
 *   developerMode?: boolean,
 *   onOpenAdmin?: () => void,
 * }} props
 */
export default function PlatformCompanyBar({
  orgs = [],
  activeOrgId,
  onSelect,
  loading = false,
  developerMode = false,
  onOpenAdmin,
}) {
  const sorted = useMemo(
    () => [...orgs].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es')),
    [orgs]
  )

  return (
    <div className="platform-company-bar" role="region" aria-label="Selector de empresa plataforma">
      <div className="platform-company-brand">
        <img src={BRAND.assets.mark} alt="" width={28} height={28} />
        <div>
          <strong>Consola {BRAND.productName}</strong>
          <span>
            {BRAND.legalOperator} · {developerMode ? PLATFORM_DEV_ROLE.label : 'Administración SaaS'}
          </span>
        </div>
      </div>

      <label className="platform-company-select">
        <span>Elegir compañía</span>
        <select
          value={activeOrgId || ''}
          disabled={loading || sorted.length === 0}
          onChange={(e) => {
            const id = e.target.value
            if (!id) {
              onSelect?.(null)
              return
            }
            const org = sorted.find((o) => o.id === id) || null
            onSelect?.(org)
          }}
          title="Entra a la empresa en modo desarrollador general (todas las herramientas de plataforma)"
        >
          <option value="">
            {loading ? 'Cargando empresas…' : '— Consola global (sin tenant) —'}
          </option>
          {sorted.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
              {o.slug ? ` · ${o.slug}` : ''}
            </option>
          ))}
        </select>
      </label>

      {developerMode && activeOrgId && (
        <span className="platform-dev-badge" title={PLATFORM_DEV_ROLE.description}>
          Modo desarrollador general
        </span>
      )}

      {onOpenAdmin && (
        <button type="button" className="ghost small" onClick={() => onOpenAdmin()}>
          + Empresas
        </button>
      )}

      {sorted.length === 0 && !loading && (
        <span className="hint" style={{ margin: 0 }}>
          No hay empresas. Cree una en Empresas y usuarios.
        </span>
      )}
    </div>
  )
}
