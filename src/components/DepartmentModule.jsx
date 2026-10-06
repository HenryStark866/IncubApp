/**
 * =============================================================================
 * ARCHIVO: src/components/DepartmentModule.jsx
 * PROPÓSITO: Componente UI «DepartmentModule»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import EnDesarrollo from './EnDesarrollo'
import { ROLE_LABEL, areaLabel } from '../lib/roles'
import { useDepartmentStats } from '../hooks/useDepartmentStats'
import ManagementCockpit from './ManagementCockpit'
import SiesaAccountingPanel from './SiesaAccountingPanel'
import SstRecordsPanel from '../features/sst/components/SstRecordsPanel'
import EnvRecordsPanel from '../features/environmental/components/EnvRecordsPanel'

/**
 * Panel de módulo corporativo con KPIs reales desde Supabase
 * (Gerencia, RR.HH., Coord. mantenimiento y cruces de Contabilidad/Ventas/SST).
 * Gerencia usa el mismo lenguaje visual del resumen admin (tablero ejecutivo).
 */
export default function DepartmentModule({
  module: mod,
  orgId,
  role,
  area,
  userName,
  userId,
  onNavigate,
  grantedScopeIds = [],
  isOmniscient = false,
  location = null,
  onNotify,
}) {
  const stats = useDepartmentStats(orgId, mod?.id, { grantedScopeIds, isOmniscient })
  if (!mod) return null

  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const roleName = ROLE_LABEL[role] ?? role
  const isAux = String(role || '').includes('auxiliary')
  const isCoord = role === 'coordinator'
  const isGerencia = mod.id === 'gerencia'
  const scope =
    isCoord && area
      ? areaLabel(area)
      : isAux
        ? 'Vista de auxiliar'
        : role === 'management' || isGerencia
          ? 'Dirección'
          : 'Gestión'

  const hasLive =
    Boolean(orgId) &&
    [
      'gerencia',
      'rrhh',
      'coord_mantenimiento',
      'contabilidad',
      'ventas',
      'logistica',
      'sst',
      'ambiental',
      'veterinaria',
    ].includes(mod.id)

  if (isGerencia) {
    return (
      <ManagementCockpit
        orgId={orgId}
        mod={mod}
        stats={stats}
        first={first}
        roleName={roleName}
        scope={scope}
        isAux={isAux}
        onNavigate={onNavigate}
        sealed={!!stats.sealed}
        userId={userId}
        role={role}
        area={area}
        location={location}
        isOmniscient={isOmniscient}
        onNotify={onNotify}
      />
    )
  }

  return (
    <div className="card wide">
      <div className="card-head" style={{ alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>{mod.label}</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {mod.tagline}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="pill role">{roleName}</span>
          <span className="pill">{scope}</span>
          {hasLive && (
            <button type="button" className="ghost small" onClick={() => stats.reload()} disabled={stats.loading}>
              {stats.loading ? 'Actualizando…' : 'Actualizar datos'}
            </button>
          )}
        </div>
      </div>

      {mod.id === 'rrhh' && (
        <div style={{ marginTop: 12 }}>
          <EnDesarrollo
            bloque
            detalle="Recursos humanos aún no tiene pantallas propias de ingresos, egresos ni dotación. Por ahora se apoya en Horarios, Asistencia e Inventarios."
          />
        </div>
      )}
      <p style={{ margin: '12px 0 8px' }}>
        Hola{first ? `, ${first}` : ''}. Este es tu módulo de <strong>{mod.label}</strong>
        {isAux
          ? ' en modo auxiliar: registras y ejecutas lo que asigne la coordinación (cada coordinador puede tener uno o varios auxiliares).'
          : isCoord
            ? ': coordina el equipo y sus auxiliares, prioriza tareas y da seguimiento al área.'
            : '.'}
        {hasLive ? ' Los indicadores de abajo salen en vivo de la base de la empresa.' : ''}
      </p>

      {hasLive && (
        <>
          {stats.error && (
            <p className="msg error" style={{ marginTop: 8 }}>
              No se pudieron cargar indicadores: {stats.error}
            </p>
          )}
          <div className="kpi-grid" style={{ marginTop: 12 }}>
            {stats.loading && !stats.kpis?.length
              ? [1, 2, 3, 4].map((i) => (
                  <div key={i} className="kpi-card">
                    <span className="kpi-value" style={{ fontSize: '1rem', opacity: 0.5 }}>
                      …
                    </span>
                    <span className="kpi-label">Cargando</span>
                  </div>
                ))
              : (stats.kpis || []).map((k) => (
                  <div key={k.label} className={`kpi-card${k.warn ? ' warn' : ''}`}>
                    <span className="kpi-value">{k.value}</span>
                    <span className="kpi-label">{k.label}</span>
                    {k.sub && (
                      <span className="hint" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                        {k.sub}
                      </span>
                    )}
                  </div>
                ))}
          </div>
          {stats.updatedAt && (
            <p className="hint" style={{ margin: '8px 0 0', fontSize: '0.75rem' }}>
              Actualizado{' '}
              {new Date(stats.updatedAt).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </p>
          )}

          <StatsLists lists={stats.lists} moduleId={mod.id} onNavigate={onNavigate} />
        </>
      )}

      {mod.id === 'contabilidad' && orgId && <SiesaAccountingPanel orgId={orgId} userId={userId} />}

      {mod.id === 'sst' && orgId && (
        <SstRecordsPanel
          orgId={orgId}
          userId={userId}
          role={role}
          area={area}
          userName={userName}
          isOmniscient={isOmniscient}
        />
      )}

      {mod.id === 'ambiental' && orgId && (
        <EnvRecordsPanel orgId={orgId} userId={userId} role={role} area={area} isOmniscient={isOmniscient} />
      )}

      {!hasLive && (
        <div className="kpi-grid" style={{ marginTop: 12 }}>
          <div className="kpi-card">
            <span className="kpi-value" style={{ fontSize: '1.1rem' }}>
              {isAux ? 'Auxiliar' : isCoord || role === 'management' ? 'Liderazgo' : 'Acceso'}
            </span>
            <span className="kpi-label">Nivel en el módulo</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value" style={{ fontSize: '1.1rem' }}>
              {mod.features?.length ?? 0}
            </span>
            <span className="kpi-label">Frentes de trabajo</span>
          </div>
        </div>
      )}

      <h3 className="section-title" style={{ margin: '20px 0 8px' }}>
        Alcance del módulo
      </h3>
      <ul className="hint" style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.55 }}>
        {(mod.features || []).map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <div
        className="card"
        style={{
          margin: '12px 0',
          padding: '12px 14px',
          background: 'var(--surface-2, rgba(0,0,0,0.03))',
          border: '1px dashed var(--border, #ccc)',
        }}
      >
        <strong style={{ display: 'block', marginBottom: 6 }}>
          {isAux ? 'Tu rol como auxiliar' : 'Tu rol de coordinación / dirección'}
        </strong>
        <p className="hint" style={{ margin: 0 }}>
          {isAux
            ? 'Ejecutas actividades asignadas, cargas evidencia y reportas avance a la coordinación del área.'
            : 'Defines prioridades del área, asignas trabajo a auxiliares y haces seguimiento con datos operativos en vivo.'}
        </p>
      </div>

      {mod.quickLinks?.length > 0 && (
        <>
          <h3 className="section-title" style={{ margin: '16px 0 8px' }}>
            Accesos rápidos
          </h3>
          <div className="actions row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {mod.quickLinks.map((l) => (
              <button key={l.tab} type="button" className="chip ghost" onClick={() => onNavigate?.(l.tab)}>
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatsLists({ lists, moduleId, onNavigate }) {
  if (!lists || !Object.keys(lists).length) return null

  const blocks = []

  if (lists.criticalOrders?.length) {
    blocks.push({
      title: 'OT prioritarias',
      items: lists.criticalOrders,
      action: { tab: 'mantenimiento', label: 'Ver OT' },
    })
  }
  if (lists.recentOrders?.length && moduleId === 'coord_mantenimiento') {
    blocks.push({
      title: 'Últimas órdenes',
      items: lists.recentOrders,
      action: { tab: 'mantenimiento', label: 'Abrir mantenimiento' },
    })
  }
  if (lists.team?.length) {
    blocks.push({ title: 'Equipo del área', items: lists.team })
  }
  if (lists.activeBatches?.length) {
    blocks.push({
      title: 'Lotes activos',
      items: lists.activeBatches,
      action: { tab: 'produccion', label: 'Producción' },
    })
  }
  if (lists.roleBreakdown?.length) {
    blocks.push({
      title: 'Plantilla por rol',
      items: lists.roleBreakdown.map((r) => ({
        id: r.role,
        title: r.label,
        meta: `${r.count} persona${r.count === 1 ? '' : 's'}`,
      })),
    })
  }
  if (lists.people?.length && moduleId === 'rrhh') {
    blocks.push({ title: 'Personas (muestra)', items: lists.people })
  }
  if (lists.coordinators?.length) {
    blocks.push({ title: 'Líderes de área', items: lists.coordinators })
  }
  if (lists.machineAlerts?.length) {
    blocks.push({
      title: `Alertas de máquina hoy (${lists.machineAlerts.length}) — falla/aviso`,
      items: lists.machineAlerts,
      action: { tab: 'supervision', label: 'Ver supervisión' },
    })
  }
  if (lists.machineOff?.length) {
    blocks.push({
      title: `Máquinas apagadas hoy (${lists.machineOff.length}) — no son alerta`,
      items: lists.machineOff,
      action: { tab: 'supervision', label: 'Ver supervisión' },
    })
  }
  if (lists.costly?.length) {
    blocks.push({ title: 'OT con mayor costo', items: lists.costly })
  }
  if (lists.recentTransfers?.length) {
    blocks.push({
      title: 'Transferencias recientes',
      items: lists.recentTransfers,
      action: { tab: 'cargue', label: 'Cargue' },
    })
  }

  if (!blocks.length) return null

  return (
    <div style={{ marginTop: 16 }}>
      {blocks.map((b) => (
        <div key={b.title} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 className="section-title" style={{ margin: '0 0 8px' }}>
              {b.title}
            </h3>
            {b.action && (
              <button
                type="button"
                className="ghost small"
                style={{ marginBottom: 8 }}
                onClick={() => onNavigate?.(b.action.tab)}
              >
                {b.action.label} →
              </button>
            )}
          </div>
          <div className="admin-list">
            {b.items.map((it) => (
              <div key={it.id} className="admin-row compact" style={{ margin: 0 }}>
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{it.title}</strong>
                  {it.meta && (
                    <span className="hint" style={{ margin: 0 }}>
                      {it.meta}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
