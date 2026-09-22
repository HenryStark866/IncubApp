/**
 * =============================================================================
 * ARCHIVO: src/components/ManagementCockpit.jsx
 * PROPÓSITO: Componente UI «ManagementCockpit»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useMemo, useState } from 'react'
import {
  capacityRatio,
  eisenhowerQuadrant,
  managementScorecard,
  pareto,
  woPriorityScore,
} from '../lib/ieTools'
import {
  ActionLogTool,
  CycleCalculators,
  FiveWhysTool,
  GaugeRing,
  GoalsTool,
  ParetoBars,
  ScoreBar,
  ToolTabs,
} from './EngineeringTools'
import {
  ExecEmpty,
  ExecHero,
  ExecKpiGrid,
  ExecLinks,
  ExecList,
  ExecPanel,
  ExecStatus,
  healthLabel,
  healthTone,
} from './ExecBoard'
import MgmtExpertChat from './MgmtExpertChat'
import SiloReportsPanel from './SiloReportsPanel'
import ModuleBoundary from './ModuleBoundary'

const TABS = [
  { id: 'tower', label: 'Torre de control' },
  { id: 'bandeja', label: 'Bandeja gerencial' },
  { id: 'asesor', label: 'Asesor IA' },
  { id: 'score', label: 'Scorecard' },
  { id: 'decide', label: 'Decisiones' },
  { id: 'tools', label: 'Herramientas' },
  { id: 'goals', label: 'Metas' },
]

/**
 * Cockpit inmersivo de gerencia: indicadores + herramientas de dirección.
 */
export default function ManagementCockpit({
  orgId,
  mod,
  stats,
  first,
  roleName,
  scope,
  isAux,
  onNavigate,
  sealed = false,
  userId,
  role,
  area,
  location,
  isOmniscient = false,
  onNotify,
}) {
  const [tab, setTab] = useState('tower')
  const safeStats = stats || { kpis: [], lists: {}, health: {}, loading: false }
  const kpis = safeStats.kpis || []
  const byLabel = Object.fromEntries(kpis.map((k) => [k.label, k]))
  const lists = safeStats.lists || {}
  const health = {
    pending: 0,
    alarms: safeStats.health?.alarms ?? 0,
    critical: safeStats.health?.critical ?? 0,
  }
  const tone = safeStats.loading ? 'ok' : healthTone(health)

  const openWo = safeStats.health?.openWO ?? Number(byLabel['OT activas']?.value || 0)
  const criticalWo = safeStats.health?.critical ?? 0
  const members = safeStats.health?.members ?? Number(byLabel['Personal']?.value || 0)
  const plantsCount = safeStats.health?.plants ?? Number(byLabel['Plantas']?.value || 0)
  const activeBatches = Number(byLabel['Lotes activos']?.value || 0)
  const alertChecks = safeStats.health?.alarms ?? 0
  const checksToday = Number(byLabel['Checks hoy']?.value || 0)
  const sensorsFromSub = Number(String(byLabel['Sensores']?.sub || '').match(/(\d+)/)?.[1]) || 0
  const activeSensors = Number(byLabel['Sensores']?.value || 0)

  const scorecard = useMemo(
    () =>
      managementScorecard({
        openWO: openWo,
        criticalWO: criticalWo,
        members,
        plants: plantsCount,
        activeBatches,
        alertChecks,
        checksToday,
        sensors: sensorsFromSub,
        activeSensors,
      }),
    [openWo, criticalWo, members, plantsCount, activeBatches, alertChecks, checksToday, sensorsFromSub, activeSensors]
  )

  const cap = useMemo(
    () =>
      capacityRatio({
        heads: members,
        machines: activeSensors,
        batches: activeBatches,
      }),
    [members, activeSensors, activeBatches]
  )

  const criticalItems = (lists.criticalOrders || []).map((it) => {
    const score = woPriorityScore({
      priority: (it.meta || '').split('·')[0]?.trim(),
      status: (it.meta || '').split('·')[1]?.trim(),
      assigned_to: null,
      created_at: null,
    })
    const q = eisenhowerQuadrant(score + 20)
    return { ...it, warn: true, meta: `${it.meta} · ${q.label}` }
  })

  const rolePareto = useMemo(() => {
    const rows = (lists.roleBreakdown || []).map((r) => ({
      label: r.label,
      count: r.count,
    }))
    const total = rows.reduce((s, r) => s + r.count, 0) || 1
    let acc = 0
    return rows.map((r) => {
      acc += r.count
      return {
        ...r,
        pct: Math.round((r.count / total) * 100),
        cumPct: Math.round((acc / total) * 100),
      }
    })
  }, [lists.roleBreakdown])

  const batchPareto = useMemo(() => {
    const items = lists.activeBatches || []
    return pareto(items, (b) => (b.meta || '').split('·')[0]?.trim() || 'lote')
  }, [lists.activeBatches])

  const siteKpis = [
    byLabel['Plantas'] || { label: 'Plantas', value: stats.loading ? '…' : 0 },
    byLabel['Personal'] || { label: 'Personal', value: stats.loading ? '…' : 0 },
    byLabel['OT activas'] || { label: 'OT activas', value: stats.loading ? '…' : 0 },
    byLabel['Lotes activos'] || { label: 'Lotes activos', value: stats.loading ? '…' : 0 },
  ]

  const opsKpis = [
    byLabel['Sensores'] || { label: 'Sensores', value: stats.loading ? '…' : 0 },
    byLabel['Checks hoy'] || { label: 'Checks hoy', value: stats.loading ? '…' : 0 },
    {
      label: 'Score dirección',
      value: stats.loading ? '…' : scorecard.overall,
      sub: 'promedio scorecard',
      ok: scorecard.overall >= 70,
      warn: scorecard.overall < 50,
    },
    {
      label: 'Dotación',
      value: cap.staffing === 'sin datos' ? '—' : cap.mPerPerson,
      sub: cap.staffing,
      tone: cap.tone === 'danger' ? 'danger' : cap.tone === 'warn' ? 'warn' : 'ok',
    },
  ]

  const updatedMeta = stats.updatedAt
    ? `Actualizado ${new Date(stats.updatedAt).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`
    : null

  return (
    <div className="card wide cockpit-shell">
      <div className="cockpit-ambient" aria-hidden="true" />
      <div className="exec-board cockpit-board">
        <ExecHero
          kicker="Cockpit de gerencia"
          title={first ? `${first} · Dirección` : 'Torre de control gerencial'}
          subtitle={`${mod?.tagline || 'Dirección estratégica'}. ${roleName} · ${scope}. Panel inmersivo con herramientas de gerencia e ingeniería industrial.`}
          status={
            <ExecStatus tone={tone}>
              {stats.loading ? 'Cargando…' : healthLabel(health)}
            </ExecStatus>
          }
          meta={updatedMeta}
          actions={
            <button
              type="button"
              className="ghost small"
              onClick={() => stats.reload()}
              disabled={stats.loading}
            >
              {stats.loading ? 'Actualizando…' : 'Actualizar datos'}
            </button>
          }
        />

        <ToolTabs tabs={TABS} active={tab} onChange={setTab} />

        {stats.error && (
          <p className="msg error" style={{ margin: 0 }}>
            {stats.error}
          </p>
        )}

        {(sealed || stats.privacyNote) && (
          <p className="msg warn" style={{ margin: 0 }}>
            {stats.privacyNote ||
              'Módulos operativos sellados. Solicita autorización al responsable del módulo.'}
          </p>
        )}

        {tab === 'tower' && (
          <>
            <div className="cockpit-gauges">
              <GaugeRing
                value={scorecard.overall}
                label="Score"
                sub="dirección"
                tone={scorecard.overall >= 70 ? 'ok' : scorecard.overall >= 50 ? 'warn' : 'danger'}
                size={110}
              />
              <GaugeRing
                value={Math.max(0, 100 - (health.critical || 0) * 15)}
                label="Riesgo OT"
                sub={`${health.critical || 0} prioritarias`}
                tone={(health.critical || 0) > 0 ? 'warn' : 'ok'}
              />
              <GaugeRing
                value={Math.max(0, 100 - (health.alarms || 0) * 12)}
                label="Control"
                sub={`${health.alarms || 0} falla/aviso (no apagadas)`}
                tone={(health.alarms || 0) > 0 ? 'warn' : 'ok'}
              />
              <GaugeRing
                value={Math.min(100, (safeStats.health?.members || 0) * 8)}
                label="Cobertura"
                sub={`${safeStats.health?.members || 0} personas`}
                tone="ok"
              />
            </div>

            <div className="exec-groups">
              <section className="exec-group">
                <div className="exec-group-head">
                  <h3 className="exec-group-title">Indicadores vivos</h3>
                  <p className="exec-group-hint">Operación multi-sede</p>
                </div>
                <ExecKpiGrid items={[...siteKpis, ...opsKpis]} />
              </section>
            </div>

            <div className="exec-split">
              <ExecPanel
                title="Prioridad gerencial (Eisenhower)"
                action={
                  <button type="button" className="ghost small" onClick={() => onNavigate?.('mantenimiento')}>
                    OT →
                  </button>
                }
              >
                {criticalItems.length === 0 ? (
                  <ExecEmpty ok>
                    {safeStats.loading ? 'Cargando…' : 'Sin OT prioritarias. Mantener monitoreo.'}
                  </ExecEmpty>
                ) : (
                  <ExecList items={criticalItems} />
                )}
              </ExecPanel>
              <ExecPanel
                title="Alertas de máquina (falla / aviso)"
                action={
                  <button type="button" className="ghost small" onClick={() => onNavigate?.('supervision')}>
                    Supervisión →
                  </button>
                }
              >
                {(lists.machineAlerts || []).length === 0 ? (
                  <ExecEmpty ok>
                    {safeStats.loading
                      ? 'Cargando…'
                      : `Sin alertas reales hoy.${safeStats.health?.checksOff
                        ? ` (${safeStats.health.checksOff} apagada(s) no cuentan como alerta)`
                        : ''
                      }`}
                  </ExecEmpty>
                ) : (
                  <ExecList items={lists.machineAlerts} />
                )}
              </ExecPanel>
            </div>

            <div className="exec-split">
              <ExecPanel
                title="Lotes activos"
                action={
                  <button type="button" className="ghost small" onClick={() => onNavigate?.('produccion')}>
                    Levantes →
                  </button>
                }
              >
                {(lists.activeBatches || []).length === 0 ? (
                  <ExecEmpty>{safeStats.loading ? 'Cargando…' : 'Sin lotes activos.'}</ExecEmpty>
                ) : (
                  <ExecList items={lists.activeBatches} />
                )}
              </ExecPanel>
              <ExecPanel title="Máquinas apagadas (informativo)">
                {(lists.machineOff || []).length === 0 ? (
                  <ExecEmpty ok>Ninguna marcada apagada hoy.</ExecEmpty>
                ) : (
                  <ExecList items={lists.machineOff} />
                )}
              </ExecPanel>
            </div>

            {mod?.quickLinks?.length > 0 && (
              <section className="exec-group">
                <div className="exec-group-head">
                  <h3 className="exec-group-title">Accesos de dirección</h3>
                </div>
                <ExecLinks links={mod.quickLinks} onNavigate={onNavigate} />
              </section>
            )}
          </>
        )}

        {tab === 'score' && (
          <div className="cockpit-section">
            <div className="scorecard-layout">
              <div className="scorecard-overall">
                <GaugeRing
                  value={scorecard.overall}
                  label="Global"
                  sub="BSC operativo"
                  tone={scorecard.overall >= 70 ? 'ok' : scorecard.overall >= 50 ? 'warn' : 'danger'}
                  size={130}
                />
                <p className="tool-desc" style={{ textAlign: 'center', maxWidth: 220 }}>
                  Balanced scorecard simplificado a partir de OT, personal, checks y recursos de la empresa.
                </p>
              </div>
              <div className="scorecard-bars">
                {scorecard.perspectives.map((p) => (
                  <ScoreBar key={p.id} label={p.label} score={p.score} hint={p.hint} />
                ))}
              </div>
            </div>
            <div className="exec-split" style={{ marginTop: 14 }}>
              <ExecPanel title="Pareto · plantilla por rol">
                <ParetoBars rows={rolePareto} />
              </ExecPanel>
              <ExecPanel title="Pareto · estados de lote">
                <ParetoBars rows={batchPareto.length ? batchPareto : []} />
              </ExecPanel>
            </div>
          </div>
        )}

        {tab === 'decide' && (
          <div className="cockpit-section">
            <ActionLogTool
              orgId={orgId}
              title={isAux ? 'Bitácora de apoyo a gerencia' : 'Bitácora de decisiones de gerencia'}
              storageName="mgmt_actions"
            />
            <div style={{ marginTop: 14 }}>
              <FiveWhysTool orgId={orgId} storageName="mgmt_five_whys" />
            </div>
            <div className="tool-card" style={{ marginTop: 14 }}>
              <h4>Guía rápida de decisión</h4>
              <div className="decision-grid">
                <div>
                  <strong>Hacer ya</strong>
                  <p>OT críticas, fallas, bioseguridad, personal sin cobertura.</p>
                </div>
                <div>
                  <strong>Planificar</strong>
                  <p>Metas, inversiones, cambios de proceso, contratación.</p>
                </div>
                <div>
                  <strong>Delegar</strong>
                  <p>Seguimiento de ronda, OT medias, inventarios de área.</p>
                </div>
                <div>
                  <strong>Monitorear</strong>
                  <p>KPIs estables, sensores en rango, lotes en curso.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'tools' && (
          <div className="cockpit-section">
            <CycleCalculators
              defaultMachines={Number(byLabel['Sensores']?.value) || 12}
              defaultPeople={Math.max(1, Math.round((stats.health?.members || 4) / 4))}
            />
            <div className="tool-grid-2" style={{ marginTop: 14 }}>
              <div className="tool-card">
                <h4>Ratio de capacidad</h4>
                <p className="tool-desc">Relación personal vs. carga operativa (aprox.).</p>
                <div className="tool-result">
                  <strong>{cap.mPerPerson}</strong>
                  <span>unidades de carga / persona</span>
                  <p className={cap.tone === 'danger' ? 'warn-text' : 'ok-text'}>{cap.staffing}</p>
                  <span className="hint" style={{ margin: 0 }}>
                    Lotes/persona: {cap.bPerPerson} · plantilla {stats.health?.members ?? '—'}
                  </span>
                </div>
              </div>
              <div className="tool-card">
                <h4>Mapa de frentes</h4>
                <p className="tool-desc">Dónde mirar según el estado actual.</p>
                <div className="exec-links" style={{ marginTop: 8 }}>
                  <button type="button" className="chip ghost" onClick={() => onNavigate?.('supervision')}>
                    Supervisión
                  </button>
                  <button type="button" className="chip ghost" onClick={() => onNavigate?.('mantenimiento')}>
                    Mantenimiento
                  </button>
                  <button type="button" className="chip ghost" onClick={() => onNavigate?.('plantas')}>
                    Plantas
                  </button>
                  <button type="button" className="chip ghost" onClick={() => onNavigate?.('iot')}>
                    IoT / bioseguridad
                  </button>
                  <button type="button" className="chip ghost" onClick={() => onNavigate?.('ventas')}>
                    Ventas
                  </button>
                  <button type="button" className="chip ghost" onClick={() => onNavigate?.('produccion')}>
                    Levantes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'goals' && (
          <div className="cockpit-section">
            <GoalsTool orgId={orgId} />
            {(mod?.features || []).length > 0 && (
              <div className="tool-card" style={{ marginTop: 14 }}>
                <h4>Alcance de gerencia</h4>
                <ul className="hint" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.55 }}>
                  {mod.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === 'bandeja' && (
          <div className="cockpit-section">
            <div className="tool-card" style={{ marginBottom: 12 }}>
              <h4>Bandeja gerencial</h4>
              <p className="tool-desc" style={{ marginBottom: 0 }}>
                OC, facturas y cotizaciones · reportes de área · solicitudes de líderes. Abre un
                ítem para aprobar, rechazar o archivar. Exporta a Excel/Word/PDF. Las OT de máquina
                no entran aquí (van a planta).
              </p>
            </div>
            <ModuleBoundary name="Bandeja gerencial">
              <SiloReportsPanel
                orgId={orgId}
                userId={userId}
                role={role || 'management'}
                area={area || 'management'}
                location={location}
                isOmniscient={isOmniscient}
                mode="reports"
                onNotify={onNotify}
                orgName={mod?.label ? `Gerencia · ${mod.label}` : 'Gerencia'}
                userName={first || roleName}
              />
            </ModuleBoundary>
          </div>
        )}

        {tab === 'asesor' && (
          <div className="cockpit-section">
            <MgmtExpertChat userName={first || roleName} />
          </div>
        )}
      </div>
    </div>
  )
}
