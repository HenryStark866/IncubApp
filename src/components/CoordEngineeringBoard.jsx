/**
 * =============================================================================
 * ARCHIVO: src/components/CoordEngineeringBoard.jsx
 * PROPÓSITO: Componente UI «CoordEngineeringBoard»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useMemo, useState } from 'react'
import {
  computeOeeProxy,
  eisenhowerQuadrant,
  pareto,
  woPriorityScore,
} from '../lib/ieTools'
import {
  ActionLogTool,
  CycleCalculators,
  FiveWhysTool,
  GaugeRing,
  GembaFiveSTools,
  ParetoBars,
  ToolTabs,
} from './EngineeringTools'
import {
  ExecEmpty,
  ExecHero,
  ExecKpiGrid,
  ExecList,
  ExecPanel,
  ExecStatus,
} from './ExecBoard'

const TABS = [
  { id: 'live', label: 'Operación en vivo' },
  { id: 'ie', label: 'Ing. industrial' },
  { id: 'quality', label: 'Gemba / 5S / 5W' },
  { id: 'plan', label: 'Plan de acción' },
]

/**
 * Dashboard inmersivo del coordinador de planta con herramientas IE.
 */
export default function CoordEngineeringBoard({
  coordinatorName,
  plant,
  plants,
  plantId,
  onPlantChange,
  hour,
  shiftLabel,
  lastTakeAt,
  op,
  pct,
  doneRound,
  totalRound,
  summary,
  novedades,
  otOpen,
  otProgress,
  otCritical,
  otUnassigned,
  alertMachines,
  recentOrders,
  plantOrders,
  roomName,
  machineName,
  nameOf,
  conditionOf,
  fmtTime,
  PRIORITY_LABEL,
  STATUS_LABEL,
  onNavigate,
  orgId,
  error,
}) {
  const [tab, setTab] = useState('live')
  const first = (coordinatorName || '').trim().split(/\s+/)[0] || ''

  const oee = useMemo(() => {
    const total = totalRound || 0
    const available = total - (summary.off || 0) - (summary.none || 0) * 0.5
    const good = summary.normal || 0
    return computeOeeProxy({
      available: Math.max(0, available),
      total,
      done: doneRound,
      good,
    })
  }, [totalRound, summary, doneRound])

  const machinePareto = useMemo(() => {
    const items = alertMachines.map(({ machine: m, check: c }) => ({
      label: c.condition === 'fault' ? 'Falla' : 'Alerta',
      room: roomName(m.room_id) || 'Sin sala',
    }))
    return {
      byCond: pareto(items, (x) => x.label),
      byRoom: pareto(
        alertMachines.map(({ machine: m }) => ({
          label: roomName(m.room_id) || m.name,
        })),
        (x) => x.label
      ),
    }
  }, [alertMachines, roomName])

  const rankedWO = useMemo(() => {
    return [...(plantOrders || [])]
      .filter((o) => o.status === 'open' || o.status === 'in_progress')
      .map((o) => {
        const score = woPriorityScore(o)
        const q = eisenhowerQuadrant(score)
        return { o, score, q }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  }, [plantOrders])

  const healthTone =
    (summary.fault || 0) > 0 || otCritical > 0
      ? 'danger'
      : novedades > 0 || otUnassigned > 0
        ? 'warn'
        : 'ok'
  const healthText =
    (summary.fault || 0) > 0
      ? `${summary.fault} falla(s) activa(s)`
      : otCritical > 0
        ? `${otCritical} OT crítica(s)`
        : novedades > 0
          ? `${novedades} novedad(es)`
          : 'Planta estable'

  const kpis = [
    {
      label: 'Ronda hora',
      value: `${pct}%`,
      sub: `${doneRound}/${totalRound}`,
      warn: pct < 100 && totalRound > 0,
      ok: pct >= 100 && totalRound > 0,
    },
    {
      label: 'OEE proxy',
      value: `${oee.oee}%`,
      sub: oee.band.label,
      tone: oee.band.tone === 'danger' ? 'danger' : oee.band.tone === 'warn' ? 'warn' : 'ok',
    },
    {
      label: 'Novedades',
      value: novedades,
      sub: `${summary.fault || 0} fallas · ${summary.warning || 0} alertas`,
      warn: novedades > 0,
    },
    {
      label: 'OT activas',
      value: otOpen + otProgress,
      sub: `${otOpen} abiertas · ${otProgress} en curso`,
    },
    {
      label: 'OT críticas',
      value: otCritical,
      sub: otUnassigned ? `${otUnassigned} sin asignar` : 'asignación OK',
      warn: otCritical > 0 || otUnassigned > 0,
    },
  ]

  const attentionItems = [
    ...alertMachines.map(({ machine: m, check: c }) => {
      const cond = conditionOf(c.condition)
      return {
        id: m.id,
        title: `${m.name} (${m.code})`,
        meta: [
          roomName(m.room_id),
          fmtTime(c.taken_at),
          nameOf(c.taken_by),
          c.notes,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: c.condition === 'fault' ? 'danger' : 'warn',
        side: <span className={`pill status ${cond.cls}`}>{cond.label}</span>,
      }
    }),
    ...(plantOrders || [])
      .filter((o) => o.priority === 'critical' && (o.status === 'open' || o.status === 'in_progress'))
      .map((o) => ({
        id: o.id,
        title: `${o.code} · ${o.title}`,
        meta: `OT crítica · ${STATUS_LABEL[o.status] ?? o.status}${
          o.assigned_to ? ` · ${nameOf(o.assigned_to)}` : ' · Sin asignar'
        }`,
        tone: 'danger',
        side: <span className="pill status off">Crítica</span>,
      })),
  ]

  return (
    <div className="card wide cockpit-shell coord-shell">
      <div className="cockpit-ambient coord" aria-hidden="true" />
      <div className="exec-board cockpit-board">
        <ExecHero
          kicker="Coordinación de planta · IE"
          title={first ? `${first} · Centro de control` : 'Centro de control de planta'}
          subtitle={`Ingeniería industrial en vivo · ${shiftLabel} · hora ${String(hour).padStart(2, '0')}:00${
            plant ? ` · ${plant.name}` : ''
          }`}
          status={<ExecStatus tone={healthTone}>{healthText}</ExecStatus>}
          meta={lastTakeAt ? `Última toma ${fmtTime(lastTakeAt)}` : 'Sin tomas en el turno'}
        />

        {plants?.length > 0 && (
          <div className="plant-chips" style={{ margin: 0 }}>
            {plants.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === plantId ? 'chip active' : 'chip'}
                onClick={() => onPlantChange?.(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <ToolTabs tabs={TABS} active={tab} onChange={setTab} />
        {error && <p className="msg error" style={{ margin: 0 }}>{error}</p>}

        {tab === 'live' && (
          <>
            <div className="cockpit-gauges">
              <GaugeRing
                value={pct}
                label="Ronda"
                sub={`${doneRound}/${totalRound}`}
                tone={pct >= 100 ? 'ok' : pct >= 60 ? 'warn' : 'danger'}
                size={110}
              />
              <GaugeRing
                value={oee.oee}
                label="OEE*"
                sub={oee.band.label}
                tone={oee.band.tone}
              />
              <GaugeRing
                value={oee.availability}
                label="Disp."
                sub="A"
                tone={oee.availability >= 80 ? 'ok' : 'warn'}
              />
              <GaugeRing
                value={oee.performance}
                label="Desemp."
                sub="P"
                tone={oee.performance >= 80 ? 'ok' : 'warn'}
              />
              <GaugeRing
                value={oee.quality}
                label="Calidad"
                sub="Q"
                tone={oee.quality >= 85 ? 'ok' : 'warn'}
              />
            </div>
            <p className="hint" style={{ margin: 0, fontSize: 11.5 }}>
              *OEE proxy local: disponibilidad (no off), desempeño (ronda hora) y calidad (máquinas sin novedad).
            </p>

            <ExecKpiGrid items={kpis} />

            <div className="mon-topbar" style={{ marginTop: 4 }}>
              <div className="mon-tile mon-shift">
                <span className="mon-label">Turno</span>
                <strong>{shiftLabel}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  Hora {String(hour).padStart(2, '0')}:00
                </span>
              </div>
              <div className="mon-tile mon-operator">
                <span className="mon-label">Operario en turno</span>
                {op ? (
                  <div className="mon-op">
                    {op.avatar ? (
                      <img className="mon-avatar" src={op.avatar} alt={op.name} />
                    ) : (
                      <div className="mon-avatar ph">
                        {(op.name || '?')
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0]?.toUpperCase() ?? '')
                          .join('')}
                      </div>
                    )}
                    <div className="mon-op-info">
                      <strong>{op.name}</strong>
                      <span className="mon-contact">
                        {op.phone && <a href={`tel:${op.phone}`}>📞 {op.phone}</a>}
                        {op.email && <a href={`mailto:${op.email}`}>✉️ {op.email}</a>}
                      </span>
                    </div>
                  </div>
                ) : (
                  <strong className="hint" style={{ margin: '4px 0 0' }}>
                    Sin registros en este turno
                  </strong>
                )}
              </div>
              <div className="mon-tile mon-progress">
                <span className="mon-label">Avance ronda</span>
                <strong>
                  {doneRound}/{totalRound}
                </strong>
                <div className="mon-bar">
                  <div className="mon-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            <div className="mon-stats">
              <span className="pill status ok">✓ {summary.normal || 0} OK</span>
              <span className="pill status warn">▲ {summary.warning || 0} alerta</span>
              <span className="pill status off">✕ {summary.fault || 0} falla</span>
              <span className="pill status idle">◧ {summary.off || 0} off</span>
              {(summary.none || 0) > 0 && (
                <span className="pill">○ {summary.none} sin registro</span>
              )}
            </div>

            <div className="exec-split">
              <ExecPanel title={`Requiere atención (${attentionItems.length})`}>
                {attentionItems.length === 0 ? (
                  <ExecEmpty ok>Sin novedades críticas en {plant?.name ?? 'sede'}.</ExecEmpty>
                ) : (
                  <ExecList items={attentionItems} />
                )}
              </ExecPanel>
              <ExecPanel
                title="OT recientes"
                action={
                  <button type="button" className="ghost small" onClick={() => onNavigate?.('mantenimiento')}>
                    Mantenimiento →
                  </button>
                }
              >
                {recentOrders.length === 0 ? (
                  <ExecEmpty>No hay OT en esta sede.</ExecEmpty>
                ) : (
                  <ExecList
                    items={recentOrders.map((o) => ({
                      id: o.id,
                      title: `${o.code} · ${o.title}`,
                      meta: `${machineName(o.machine_id)} · ${PRIORITY_LABEL[o.priority] ?? o.priority}${
                        o.assigned_to ? ` · ${nameOf(o.assigned_to)}` : ' · Sin asignar'
                      }`,
                      side: (
                        <span
                          className={`pill status ${
                            o.status === 'completed'
                              ? 'ok'
                              : o.status === 'cancelled'
                                ? 'idle'
                                : o.status === 'in_progress'
                                  ? ''
                                  : 'warn'
                          }`}
                        >
                          {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      ),
                    }))}
                  />
                )}
              </ExecPanel>
            </div>

            <div className="exec-links">
              <button type="button" className="chip ghost" onClick={() => onNavigate?.('monitoreo')}>
                Monitoreo
              </button>
              <button type="button" className="chip ghost" onClick={() => onNavigate?.('mantenimiento')}>
                Órdenes OT
              </button>
              <button type="button" className="chip ghost" onClick={() => onNavigate?.('plantas')}>
                Planos
              </button>
              <button type="button" className="chip ghost" onClick={() => onNavigate?.('supervision')}>
                Supervisión
              </button>
              <button type="button" className="chip ghost" onClick={() => onNavigate?.('horarios')}>
                Horarios
              </button>
            </div>
          </>
        )}

        {tab === 'ie' && (
          <div className="cockpit-section">
            <div className="oee-breakdown">
              <div className="tool-card">
                <h4>Desglose OEE proxy</h4>
                <div className="oee-grid">
                  <div>
                    <em>A · Disponibilidad</em>
                    <strong>{oee.availability}%</strong>
                    <span>Equipos no off / total</span>
                  </div>
                  <div>
                    <em>P · Desempeño</em>
                    <strong>{oee.performance}%</strong>
                    <span>Ronda de la hora</span>
                  </div>
                  <div>
                    <em>Q · Calidad</em>
                    <strong>{oee.quality}%</strong>
                    <span>Sin novedad / total</span>
                  </div>
                </div>
              </div>
              <div className="tool-card">
                <h4>Backlog priorizado (score IE)</h4>
                <p className="tool-desc">Criticidad + estado + sin asignar + antigüedad.</p>
                {rankedWO.length === 0 ? (
                  <p className="cockpit-empty">Sin OT abiertas en la sede.</p>
                ) : (
                  <div className="ranked-wo">
                    {rankedWO.map(({ o, score, q }) => (
                      <div key={o.id} className="ranked-wo-row">
                        <div>
                          <strong>
                            {o.code} · {o.title}
                          </strong>
                          <span>
                            {PRIORITY_LABEL[o.priority] ?? o.priority} · score {score} · {q.label}
                          </span>
                        </div>
                        <span className={`pill ${q.tone ? `status ${q.tone === 'danger' ? 'off' : q.tone === 'warn' ? 'warn' : 'ok'}` : ''}`}>
                          {q.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="exec-split" style={{ marginTop: 14 }}>
              <ExecPanel title="Pareto · tipo de novedad">
                <ParetoBars rows={machinePareto.byCond} />
              </ExecPanel>
              <ExecPanel title="Pareto · sala / equipo">
                <ParetoBars rows={machinePareto.byRoom} />
              </ExecPanel>
            </div>

            <div style={{ marginTop: 14 }}>
              <CycleCalculators defaultMachines={totalRound || 12} defaultPeople={op ? 1 : 2} />
            </div>
          </div>
        )}

        {tab === 'quality' && (
          <div className="cockpit-section">
            <GembaFiveSTools orgId={orgId} />
            <div style={{ marginTop: 14 }}>
              <FiveWhysTool orgId={orgId} storageName="coord_five_whys" />
            </div>
          </div>
        )}

        {tab === 'plan' && (
          <div className="cockpit-section">
            <ActionLogTool
              orgId={orgId}
              title="Plan de acción del coordinador"
              storageName="coord_actions"
            />
            <div className="tool-card" style={{ marginTop: 14 }}>
              <h4>Rutina de coordinación (estándar)</h4>
              <ol className="routine-list">
                <li>Revisar OEE proxy y ronda de la hora.</li>
                <li>Atender fallas → alertas → OT críticas sin asignar.</li>
                <li>Balancear personal de ronda (calculadora).</li>
                <li>Registrar 5 porqués si hay falla repetida.</li>
                <li>Cerrar bitácora y escalar a gerencia si el riesgo es alto.</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
