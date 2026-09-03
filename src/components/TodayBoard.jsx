/**
 * =============================================================================
 * ARCHIVO: src/components/TodayBoard.jsx
 * PROPÓSITO: Componente UI «TodayBoard»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { ROLE_LABEL, areaLabel, canSeePlant3DTour, PLANT_3D_TOUR_URL } from '../lib/roles'
import { useTodayBoard } from '../hooks/useTodayBoard'
import OnlinePresencePanel from './OnlinePresencePanel'
import {
  ExecEmpty,
  ExecGroup,
  ExecHero,
  ExecKpiGrid,
  ExecLinks,
  ExecList,
  ExecPanel,
  ExecStatus,
  healthLabel,
  healthTone,
} from './ExecBoard'

/**
 * Tablero de entrada por rol: KPIs, alertas y accesos del día.
 * Dirección / gerencia usan el mismo lenguaje visual del resumen admin.
 */
export default function TodayBoard({
  orgId,
  userId,
  role,
  area,
  userName,
  orgName,
  onNavigate,
  presence,
  grantedScopeIds = [],
  isOmniscient = false,
}) {
  const board = useTodayBoard({ orgId, userId, role, area, grantedScopeIds, isOmniscient })
  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const roleName = ROLE_LABEL[role] ?? role
  const isExecHome =
    role === 'management' ||
    role === 'management_auxiliary' ||
    role === 'owner' ||
    role === 'admin'

  if (isExecHome) {
    return (
      <ExecTodayBoard
        board={board}
        first={first}
        roleName={roleName}
        area={area}
        orgId={orgId}
        orgName={orgName}
        role={role}
        onNavigate={onNavigate}
        presence={presence}
        userId={userId}
      />
    )
  }

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>{board.loading ? 'Hoy' : board.title}</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {first ? `${first} · ` : ''}
            {roleName}
            {area ? ` · ${areaLabel(area)}` : ''}
            {orgName ? ` · ${orgName}` : ''}
          </p>
          {!board.loading && board.subtitle && (
            <p className="hint" style={{ margin: '6px 0 0' }}>
              {board.subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          className="ghost small"
          disabled={board.loading}
          onClick={() => board.reload()}
        >
          {board.loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {board.error && (
        <p className="msg error" style={{ marginTop: 10 }}>
          {board.error}
        </p>
      )}

      {presence && (
        <div style={{ marginTop: 14 }}>
          <OnlinePresencePanel presence={presence} currentUserId={userId} orgId={orgId} />
        </div>
      )}

      <div className="kpi-grid" style={{ marginTop: 14 }}>
        {board.loading && !(board.kpis || []).length
          ? [1, 2, 3, 4].map((i) => (
              <div key={i} className="kpi-card">
                <span className="kpi-value" style={{ opacity: 0.4 }}>
                  …
                </span>
                <span className="kpi-label">Cargando</span>
              </div>
            ))
          : (board.kpis || []).map((k) => (
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

      {(board.alerts || []).length > 0 && (
        <>
          <h3 className="section-title" style={{ margin: '20px 0 8px' }}>
            Requiere atención
          </h3>
          <div className="admin-list">
            {board.alerts.map((a, i) => (
              <div
                key={`${a.text}-${i}`}
                className="admin-row compact"
                style={{ margin: 0, borderColor: a.warn ? 'rgba(240, 179, 74, 0.45)' : undefined }}
              >
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{a.text}</strong>
                </div>
                {a.tab && (
                  <button type="button" className="primary small" onClick={() => onNavigate?.(a.tab)}>
                    Ir
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {(board.lines || []).length > 0 && (
        <>
          <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
            Actividad reciente
          </h3>
          <div className="admin-list">
            {board.lines.map((line, i) => (
              <div key={`${line.title}-${i}`} className="admin-row compact" style={{ margin: 0 }}>
                <div className="admin-row-main">
                  <strong>{line.title}</strong>
                  {line.meta && (
                    <span className="hint" style={{ margin: 0 }}>
                      {line.meta}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {(board.actions || []).length > 0 && (
        <>
          <h3 className="section-title" style={{ margin: '18px 0 8px' }}>
            Accesos del día
          </h3>
          <div className="actions row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {board.actions.map((a) => (
              <button
                key={a.tab}
                type="button"
                className="chip ghost"
                onClick={() => onNavigate?.(a.tab)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}

      {board.updatedAt && (
        <p className="hint" style={{ marginTop: 16, fontSize: '0.75rem' }}>
          Actualizado{' '}
          {new Date(board.updatedAt).toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </p>
      )}
    </div>
  )
}

function ExecTodayBoard({
  board,
  first,
  roleName,
  area,
  /* orgId se usa abajo en OnlinePresencePanel: sin recibirlo aquí, la
     referencia reventaba el tablero de dirección en cuanto llegaba presence. */
  orgId,
  orgName,
  role,
  onNavigate,
  presence,
  userId,
}) {
  const kpis = board.kpis || []
  const warnCount = kpis.filter((k) => k.warn).length
  const alertCount = (board.alerts || []).length
  const health = {
    pending: 0,
    alarms: alertCount,
    critical: warnCount,
  }
  const tone = board.loading ? 'ok' : healthTone(health)

  const coverage = kpis.filter((k) =>
    /planta|sede|personal|miembro|granja/i.test(k.label)
  )
  const operation = kpis.filter((k) => !coverage.includes(k))

  const alertItems = (board.alerts || []).map((a, i) => ({
    id: `alert-${i}`,
    title: a.text,
    meta: a.tab ? 'Abrir módulo relacionado' : null,
    warn: a.warn,
    action: a.tab ? (
      <button type="button" className="primary small" onClick={() => onNavigate?.(a.tab)}>
        Ir
      </button>
    ) : null,
  }))

  const lineItems = (board.lines || []).map((line, i) => ({
    id: `line-${i}`,
    title: line.title,
    meta: line.meta,
  }))

  const updatedMeta = board.updatedAt
    ? `Actualizado ${new Date(board.updatedAt).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}`
    : null

  const context = [roleName, area ? areaLabel(area) : null, orgName].filter(Boolean).join(' · ')

  return (
    <div className="card wide">
      <div className="exec-board">
        <ExecHero
          kicker="Hoy · Dirección"
          title={first ? `Buen día, ${first}` : board.title || 'Hoy'}
          subtitle={
            board.subtitle ||
            `${context}. Panorama del día con indicadores operativos y accesos de gerencia.`
          }
          status={
            <ExecStatus tone={tone}>
              {board.loading ? 'Cargando…' : healthLabel(health)}
            </ExecStatus>
          }
          meta={updatedMeta}
          actions={
            <>
              {canSeePlant3DTour(role) && (
                /* Metaverso IncubApp: página aparte, en pestaña nueva (la CSP
                   de la app pone frame-ancestors 'none', no admite iframe). */
                <a
                  className="ghost small plant3d-link"
                  href={PLANT_3D_TOUR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Recorrido virtual de la planta en 3D (abre en otra pestaña)"
                >
                  🕶️ Planta 3D
                </a>
              )}
              <button
                type="button"
                className="ghost small"
                disabled={board.loading}
                onClick={() => board.reload()}
              >
                {board.loading ? 'Actualizando…' : 'Actualizar'}
              </button>
            </>
          }
        />

        {board.error && (
          <p className="msg error" style={{ margin: 0 }}>
            {board.error}
          </p>
        )}

        {presence && <OnlinePresencePanel presence={presence} currentUserId={userId} orgId={orgId} />}

        <div className="exec-groups">
          {coverage.length > 0 && (
            <ExecGroup title="Cobertura" hint="Sedes y equipo">
              <ExecKpiGrid
                items={
                  board.loading && !coverage.length
                    ? [
                        { label: 'Cargando', value: '…' },
                        { label: 'Cargando', value: '…' },
                      ]
                    : coverage
                }
              />
            </ExecGroup>
          )}
          <ExecGroup title="Operación del día" hint="Mantenimiento, lotes y controles">
            <ExecKpiGrid
              items={
                board.loading && !operation.length
                  ? [
                      { label: 'Cargando', value: '…' },
                      { label: 'Cargando', value: '…' },
                      { label: 'Cargando', value: '…' },
                    ]
                  : operation.length
                    ? operation
                    : kpis
              }
            />
          </ExecGroup>
        </div>

        <div className="exec-split">
          <ExecPanel title="Requiere atención">
            {alertItems.length === 0 ? (
              <ExecEmpty ok>
                {board.loading ? 'Revisando alertas…' : 'Sin pendientes críticos por ahora.'}
              </ExecEmpty>
            ) : (
              <ExecList items={alertItems} />
            )}
          </ExecPanel>
          <ExecPanel title="Actividad reciente">
            {lineItems.length === 0 ? (
              <ExecEmpty>
                {board.loading ? 'Cargando actividad…' : 'Sin actividad prioritaria listada.'}
              </ExecEmpty>
            ) : (
              <ExecList items={lineItems} />
            )}
          </ExecPanel>
        </div>

        {(board.actions || []).length > 0 && (
          <ExecGroup title="Accesos del día" hint="Atajos de dirección">
            <ExecLinks links={board.actions} onNavigate={onNavigate} />
          </ExecGroup>
        )}
      </div>
    </div>
  )
}
