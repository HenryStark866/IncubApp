/**
 * =============================================================================
 * ARCHIVO: src/components/OperatorHistoryPanel.jsx
 * PROPÓSITO: Componente UI «OperatorHistoryPanel»: historial de trabajo del
 *   operario / auxiliar con comparativo entre el período actual y el anterior.
 * CÓMO FUNCIONA: Usa useOperatorHistory para traer actividades, rondas y OT del
 *   usuario, muestra KPIs con su delta, una barra diaria de actividad y la
 *   línea de tiempo de lo realizado. Los accesos rápidos llevan a sus herramientas.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useState } from 'react'
import { HISTORY_RANGES, useOperatorHistory } from '../hooks/useOperatorHistory'
import { ROLE_LABEL, areaLabel } from '../lib/roles'

const fmtDay = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })

const fmtDT = (v) =>
  v
    ? new Date(v).toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

/**
 * Chip de variación contra el período anterior.
 * `goodWhenDown` invierte el color (menos alertas es mejor).
 */
function DeltaChip({ delta, goodWhenDown = false, suffix = '' }) {
  if (!delta || delta.diff === 0) {
    return (
      <span className="hist-delta flat" title="Sin cambio frente al período anterior">
        = igual
      </span>
    )
  }
  const up = delta.diff > 0
  const good = goodWhenDown ? !up : up
  return (
    <span
      className={`hist-delta ${good ? 'up' : 'down'}`}
      title={`${up ? '+' : ''}${delta.diff}${suffix} vs. período anterior`}
    >
      {up ? '▲' : '▼'} {Math.abs(delta.diff)}
      {suffix}
      {delta.pct !== 0 && ` (${up ? '+' : ''}${delta.pct}%)`}
    </span>
  )
}

function HistoryKpi({ label, value, sub, delta, goodWhenDown, suffix, warn }) {
  return (
    <div className={`kpi-card${warn ? ' warn' : ''}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      <DeltaChip delta={delta} goodWhenDown={goodWhenDown} suffix={suffix} />
      {sub && (
        <span className="hint" style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

/** Barras diarias — sin librerías: alto relativo al máximo del período */
function DailyBars({ series }) {
  const max = Math.max(1, ...series.map((d) => d.activities + d.checks))
  if (!series.length) return null
  return (
    <div className="hist-bars" role="img" aria-label="Actividad diaria del período">
      {series.map((d) => {
        const total = d.activities + d.checks
        const h = Math.round((total / max) * 100)
        return (
          <div key={d.day} className="hist-bar-col" title={`${fmtDay(d.day)}: ${d.activities} actividad(es), ${d.checks} ronda(s)`}>
            <div className="hist-bar-track">
              <div className="hist-bar-fill" style={{ height: `${Math.max(total ? 6 : 0, h)}%` }}>
                {d.checks > 0 && (
                  <div
                    className="hist-bar-checks"
                    style={{ height: `${Math.round((d.checks / Math.max(total, 1)) * 100)}%` }}
                  />
                )}
              </div>
            </div>
            <span className="hist-bar-label">{fmtDay(d.day).replace('.', '')}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Accesos rápidos a las herramientas del turno.
 * Solo se muestran las que el perfil realmente puede abrir (can).
 */
function ToolShortcuts({ can, onNavigate }) {
  const tools = [
    { tab: 'supervision', label: 'Mis actividades', hint: 'Rondas y tareas del turno' },
    { tab: 'cargue', label: 'Órdenes de cargue', hint: 'Nº de carro → posición' },
    { tab: 'monitoreo', label: 'Monitoreo', hint: 'Estado de máquinas' },
    { tab: 'horarios', label: 'Mis horarios', hint: 'Turnos asignados' },
    { tab: 'mantenimiento', label: 'Órdenes de trabajo', hint: 'OT asignadas' },
    { tab: 'recepcion', label: 'Recepción', hint: 'Cuarto frío' },
    { tab: 'huevos', label: 'Reporte de huevo', hint: 'Registro diario' },
    { tab: 'asistencia', label: 'Asistencia', hint: 'Entrada y salida' },
  ].filter((t) => (typeof can === 'function' ? can(t.tab) : true))

  if (!tools.length) return null

  return (
    <div className="tool-shortcut-grid">
      {tools.map((t) => (
        <button
          key={t.tab}
          type="button"
          className="tool-shortcut"
          onClick={() => onNavigate?.(t.tab)}
        >
          <strong>{t.label}</strong>
          <span className="hint">{t.hint}</span>
        </button>
      ))}
    </div>
  )
}

export default function OperatorHistoryPanel({
  orgId,
  userId,
  role,
  area,
  userName,
  can,
  onNavigate,
}) {
  const [rangeId, setRangeId] = useState('7d')
  const h = useOperatorHistory({ orgId, userId, rangeId })
  const first = (userName || '').trim().split(/\s+/)[0] || ''

  const periodLabel = `${h.windows.current.from.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
  })} → hoy`
  const prevLabel = `${h.windows.previous.from.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
  })} → ${h.windows.previous.to.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ margin: 0 }}>Mi historial de trabajo</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {first ? `${first} · ` : ''}
            {ROLE_LABEL[role] ?? role}
            {area ? ` · ${areaLabel(area)}` : ''}
          </p>
        </div>
        <label className="hist-range">
          <span className="hint" style={{ margin: 0 }}>
            Período
          </span>
          <select value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
            {HISTORY_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost small" disabled={h.loading} onClick={() => h.reload()}>
          {h.loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        Comparando <strong>{periodLabel}</strong> contra el período anterior de igual duración (
        {prevLabel}). Las flechas indican la variación.
      </p>

      {h.error && <p className="msg error">{h.error}</p>}
      {h.missing && (
        <p className="msg" style={{ marginTop: 8 }}>
          Aún no hay registros de turno sincronizados para tu usuario.
        </p>
      )}

      <h3 className="section-title" style={{ margin: '16px 0 8px' }}>
        Mis herramientas
      </h3>
      <ToolShortcuts can={can} onNavigate={onNavigate} />

      <h3 className="section-title" style={{ margin: '20px 0 8px' }}>
        Comparativo del período
      </h3>
      <div className="kpi-grid">
        <HistoryKpi
          label="Actividades completadas"
          value={h.current.completed}
          sub={`${h.previous.completed} en el período anterior`}
          delta={h.deltas.completed}
        />
        <HistoryKpi
          label="Cumplimiento"
          value={`${h.current.completionRate}%`}
          sub={`${h.current.completed} de ${h.current.assigned} asignadas`}
          delta={h.deltas.completionRate}
          suffix=" pp"
          warn={h.current.completionRate < 70 && h.current.assigned > 0}
        />
        <HistoryKpi
          label="Rondas registradas"
          value={h.current.checks}
          sub={`${h.previous.checks} antes`}
          delta={h.deltas.checks}
        />
        <HistoryKpi
          label="Rondas con novedad"
          value={h.current.alertChecks}
          sub="aviso o falla reportada"
          delta={h.deltas.alertChecks}
          goodWhenDown
          warn={h.current.alertChecks > 0}
        />
        <HistoryKpi
          label="Tiempo medio por tarea"
          value={h.current.avgMinutes ? `${h.current.avgMinutes} min` : '—'}
          sub="de inicio a cierre"
          delta={h.deltas.avgMinutes}
          goodWhenDown
          suffix=" min"
        />
        <HistoryKpi
          label="Cierres con evidencia"
          value={`${h.current.photoRate}%`}
          sub={`${h.current.withPhoto} con foto`}
          delta={h.deltas.photoRate}
          suffix=" pp"
        />
        <HistoryKpi
          label="Cierres parciales"
          value={h.current.partialCompleted}
          sub="tareas cerradas incompletas"
          delta={h.deltas.partialCompleted}
          goodWhenDown
          warn={h.current.partialCompleted > 0}
        />
        <HistoryKpi
          label="OT atendidas"
          value={h.current.workOrdersDone}
          sub={`${h.current.workOrders} asignadas`}
          delta={h.deltas.workOrdersDone}
        />
      </div>

      <h3 className="section-title" style={{ margin: '22px 0 8px' }}>
        Actividad por día
      </h3>
      {h.series.some((d) => d.activities + d.checks > 0) ? (
        <>
          <DailyBars series={h.series} />
          <p className="hint" style={{ marginTop: 6, fontSize: '0.78rem' }}>
            Barra completa = actividades cerradas · segmento superior = rondas de máquina.
          </p>
        </>
      ) : (
        <p className="hint">Sin actividad registrada en este período.</p>
      )}

      <h3 className="section-title" style={{ margin: '22px 0 8px' }}>
        Lo que realicé ({h.timeline.length})
      </h3>
      {!h.timeline.length ? (
        <p className="hint">
          {h.loading ? 'Cargando historial…' : 'Aún no hay trabajo cerrado en este período.'}
        </p>
      ) : (
        <div className="admin-list">
          {h.timeline.slice(0, 60).map((row) => (
            <div
              key={row.id}
              className="admin-row compact"
              style={{
                margin: 0,
                borderColor: row.warn ? 'rgba(240, 179, 74, 0.45)' : undefined,
              }}
            >
              <span className="hist-kind" title={row.kind === 'check' ? 'Ronda' : 'Actividad'}>
                {row.kind === 'check' ? '🔍' : '✅'}
              </span>
              <div className="admin-row-main" style={{ flex: 1 }}>
                <strong>{row.title}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  {fmtDT(row.at)}
                  {row.meta ? ` · ${row.meta}` : ''}
                </span>
                {row.note && (
                  <span className="hint" style={{ margin: '2px 0 0', fontStyle: 'italic' }}>
                    {row.note}
                  </span>
                )}
              </div>
            </div>
          ))}
          {h.timeline.length > 60 && (
            <p className="hint" style={{ marginTop: 8 }}>
              Mostrando los 60 registros más recientes de {h.timeline.length}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
