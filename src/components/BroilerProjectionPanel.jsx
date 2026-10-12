/**
 * =============================================================================
 * ARCHIVO: src/components/BroilerProjectionPanel.jsx
 * PROPÓSITO: Proyección real del broiler (pollito de engorde) en pantalla: cuántos
 *   pollitos nacen cada día de las próximas tres semanas, en qué incubadora o
 *   nacedora va cada cargue y cómo vamos contra lo real. En PC: indicadores, gráfico y
 *   tabla; en el celular: indicadores, gráfico desplazable y tarjetas. 12-10-2026.
 * =============================================================================
 */
import { useMemo, useState } from 'react'
import { useBroilerProjection } from '../hooks/useBroilerProjection'
import { exportToExcel } from '../lib/exportExcel'
import { INCUBATION_DAYS } from '../lib/broilerProjection'
import './BroilerProjectionPanel.css'

const n = (v) => Math.round(Number(v) || 0).toLocaleString('es-CO')
const pct = (v) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`
const dayLabel = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
const dateTime = (v) =>
  v ? new Date(v).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '—'

const STAGE = {
  incubando: { label: 'En incubadora', tone: 'info' },
  nacedora: { label: 'En nacedora', tone: 'warn' },
  naciendo: { label: 'Naciendo', tone: 'warn' },
  nacido: { label: 'Nacido', tone: 'ok' },
}
const EGGS_SOURCE = {
  nacimiento: 'del nacimiento',
  mapa: 'del mapa de cargue',
  lote: 'de las posturas del lote',
  'sin-dato': 'sin dato',
}
const PROJ_SOURCE = {
  estimado: 'estimado del supervisor',
  'tasa-real': 'tasa real de la planta',
  referencia: 'tasa de referencia',
}

function Chart({ calendar }) {
  const max = Math.max(1, ...calendar.map((d) => Math.max(d.projected, d.actual || 0)))
  return (
    <div className="bp-chart" role="img" aria-label="Pollitos proyectados por día de nacimiento">
      <div className="bp-bars">
        {calendar.map((d) => (
          <div key={d.date} className={`bp-bar-col${d.isToday ? ' is-today' : ''}`} title={`${dayLabel(d.date)}: ${n(d.projected)} proyectados${d.actual != null ? ` · ${n(d.actual)} reales` : ''}`}>
            <span className="bp-bar-val">{d.projected ? `${Math.round(d.projected / 1000)}k` : ''}</span>
            <div className="bp-bar-track">
              <div className="bp-bar" style={{ height: `${(d.projected / max) * 100}%` }} />
              {d.actual != null && <div className="bp-bar-real" style={{ height: `${(d.actual / max) * 100}%` }} />}
            </div>
            <span className="bp-bar-day">{new Date(`${d.date}T12:00:00`).getDate()}</span>
          </div>
        ))}
      </div>
      <div className="bp-legend">
        <span><i className="bp-dot proj" /> Proyectado</span>
        <span><i className="bp-dot real" /> Real (nacimiento cerrado)</span>
        <span><i className="bp-dot today" /> Hoy</span>
      </div>
    </div>
  )
}

export default function BroilerProjectionPanel({ orgId, compact = false }) {
  const { projection: p, loading, warning, updatedAt, reload } = useBroilerProjection(orgId)
  const [filter, setFilter] = useState('activos')

  const cycles = useMemo(() => {
    if (!p) return []
    const list = filter === 'activos' ? p.cycles.filter((c) => c.stage !== 'nacido') : p.cycles
    return [...list].sort((a, b) => a.hatchDue.localeCompare(b.hatchDue))
  }, [p, filter])

  const exportar = () =>
    exportToExcel(
      'proyeccion-broiler',
      [
        {
          name: 'Por día',
          rows: p.calendar.map((d) => ({ Fecha: d.date, 'Cargues que nacen': d.cycles, 'Huevos incubables': d.eggs, 'Pollitos proyectados': d.projected, 'Pollitos reales': d.actual ?? '' })),
        },
        {
          name: 'Por cargue',
          rows: p.cycles.map((c) => ({
            Lote: c.lote,
            Incubadora: c.machine,
            Cargue: c.loadedAt,
            'Día de incubación': c.day,
            Etapa: STAGE[c.stage]?.label,
            'Transferencia (prevista)': c.transferDue,
            Transferido: c.transferredAt || '',
            'Nacimiento (fecha)': c.hatchDate,
            Huevos: c.eggs,
            'Origen huevos': EGGS_SOURCE[c.eggsSource],
            'Pollitos proyectados': c.projected,
            'Base de la proyección': PROJ_SOURCE[c.projectedSource],
            'Pollitos reales': c.actual ?? '',
          })),
        },
      ],
      { title: 'Proyección broiler', module: 'Producción' },
    )

  if (!orgId) return null
  return (
    <section className={`bp-root${compact ? ' is-compact' : ''}`} aria-label="Proyección broiler">
      <header className="bp-head">
        <div>
          <h2>🐣 Proyección broiler</h2>
          <p>Pollitos que nacen por día, calculados con los cargues, transferencias y nacimientos reales de la planta.</p>
        </div>
        <div className="bp-head-actions">
          {p && (
            <button type="button" className="ghost small" onClick={exportar}>
              ⬇ Excel
            </button>
          )}
          <button type="button" className="ghost small" onClick={reload} disabled={loading}>
            {loading ? 'Actualizando…' : '↻ Actualizar'}
          </button>
        </div>
      </header>

      {warning && <p className="bp-msg">{warning}</p>}
      {!p ? (
        <p className="bp-empty">{loading ? 'Calculando la proyección…' : 'Sin datos todavía.'}</p>
      ) : (
        <>
          {p.rate.source === 'referencia' && (
            <p className="bp-msg">
              La planta aún no tiene nacimientos cerrados con pollitos reales en los últimos 90 días: se usa la tasa de
              referencia de {pct(p.rate.rate)}. En cuanto el supervisor cierre un nacimiento, la proyección pasa a la tasa real.
            </p>
          )}
          <div className="bp-kpis">
            <div className="bp-kpi is-main">
              <span>Próximos 7 días</span>
              <b>{n(p.totals.next7)}</b>
              <small>pollitos proyectados</small>
            </div>
            <div className="bp-kpi">
              <span>Próximos {INCUBATION_DAYS} días</span>
              <b>{n(p.totals.next21)}</b>
              <small>{p.totals.cyclesInProcess} cargues en proceso</small>
            </div>
            <div className="bp-kpi">
              <span>Tasa de nacimiento</span>
              <b>{pct(p.rate.rate)}</b>
              <small>{p.rate.source === 'real' ? `real · ${p.rate.samples} nacimientos (90 días)` : 'referencia'}</small>
            </div>
            <div className="bp-kpi">
              <span>Huevo en proceso</span>
              <b>{n(p.totals.eggsInProcess)}</b>
              <small>
                {p.totals.inSetters} en incubadora · {p.totals.inHatchers} en nacedora
              </small>
            </div>
            {p.accuracy && (
              <div className="bp-kpi">
                <span>Real contra estimado</span>
                <b>{pct(p.accuracy.pct)}</b>
                <small>{p.accuracy.samples} nacimientos cerrados</small>
              </div>
            )}
          </div>
          {p.totals.withoutEggs > 0 && (
            <p className="bp-msg">
              {p.totals.withoutEggs} cargue{p.totals.withoutEggs === 1 ? '' : 's'} sin cantidad de huevo (sin mapa de cargue ni
              posturas del lote): no suman a la proyección hasta que se registre el dato.
            </p>
          )}

          <Chart calendar={p.calendar} />

          {!compact && (
            <>
              <div className="bp-filter" role="tablist" aria-label="Qué cargues ver">
                <button type="button" className={filter === 'activos' ? 'active' : ''} onClick={() => setFilter('activos')}>
                  En proceso
                </button>
                <button type="button" className={filter === 'todos' ? 'active' : ''} onClick={() => setFilter('todos')}>
                  Con los recién nacidos
                </button>
              </div>
              {cycles.length === 0 ? (
                <p className="bp-empty">No hay cargues en proceso en las incubadoras.</p>
              ) : (
                <>
                  <table className="bp-table">
                    <thead>
                      <tr>
                        <th>Nace</th>
                        <th>Lote</th>
                        <th>Máquina</th>
                        <th>Día</th>
                        <th>Etapa</th>
                        <th className="num">Huevos</th>
                        <th className="num">Proyectado</th>
                        <th className="num">Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycles.map((c) => (
                        <tr key={c.id}>
                          <td>{dayLabel(c.hatchDate)}</td>
                          <td>{c.lote}</td>
                          <td>{c.machine}</td>
                          <td>
                            {c.day}/{INCUBATION_DAYS}
                          </td>
                          <td>
                            <span className={`bp-st tone-${STAGE[c.stage].tone}`}>{STAGE[c.stage].label}</span>
                          </td>
                          <td className="num" title={EGGS_SOURCE[c.eggsSource]}>{c.eggs ? n(c.eggs) : '—'}</td>
                          <td className="num" title={PROJ_SOURCE[c.projectedSource]}>{c.projected ? n(c.projected) : '—'}</td>
                          <td className="num">{c.actual != null ? n(c.actual) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="bp-cards">
                    {cycles.map((c) => (
                      <li key={c.id} className="bp-card">
                        <div className="bp-card-top">
                          <b>
                            Lote {c.lote} · {c.machine}
                          </b>
                          <span className={`bp-st tone-${STAGE[c.stage].tone}`}>{STAGE[c.stage].label}</span>
                        </div>
                        <div className="bp-progress" aria-label={`Día ${c.day} de ${INCUBATION_DAYS}`}>
                          <span style={{ width: `${(c.day / INCUBATION_DAYS) * 100}%` }} />
                        </div>
                        <dl>
                          <div>
                            <dt>Nace</dt>
                            <dd>{dayLabel(c.hatchDate)}</dd>
                          </div>
                          <div>
                            <dt>Día</dt>
                            <dd>
                              {c.day}/{INCUBATION_DAYS}
                            </dd>
                          </div>
                          <div>
                            <dt>Huevos</dt>
                            <dd>{c.eggs ? n(c.eggs) : '—'}</dd>
                          </div>
                          <div>
                            <dt>{c.actual != null ? 'Real' : 'Proyectado'}</dt>
                            <dd>{c.actual != null ? n(c.actual) : c.projected ? n(c.projected) : '—'}</dd>
                          </div>
                        </dl>
                        <small>
                          Cargue {dateTime(c.loadedAt)} · {c.transferredAt ? `transferido ${dateTime(c.transferredAt)}` : `transferir ${dateTime(c.transferDue)}`} ·{' '}
                          {PROJ_SOURCE[c.projectedSource]}
                        </small>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          <p className="bp-updated">{updatedAt ? `Actualizado ${updatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · se actualiza solo con cada cargue, transferencia o nacimiento` : ''}</p>
        </>
      )}
    </section>
  )
}
