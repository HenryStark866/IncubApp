/**
 * Analítica de cumplimiento: medible, verificable, graficable y exportable.
 * Filtros: actividad, área, turno, día/semana/quincena/mes/total, usuario o grupo.
 * Henry Stark Desarrollador
 */
import { useMemo, useState } from 'react'
import {
  GROUP_BY,
  PERIODS,
  aggregateFacts,
  buildFactRows,
  daysAgoStr,
  factsToExportRows,
  aggregatesToExportRows,
  timeSeries,
} from '../lib/complianceAnalytics'
import { bogotaDate } from '../lib/complianceEngine'
import { ROLE_LABEL, areaLabel } from '../lib/roles'
import { BarChart, DonutScore, LineChart } from './ComplianceCharts'
import ExportMenu from './ExportMenu'

const RANGE_PRESETS = [
  { id: '7', label: '7 días', days: 7 },
  { id: '15', label: '15 días', days: 15 },
  { id: '30', label: '30 días', days: 30 },
  { id: '90', label: '90 días', days: 90 },
]

export default function ComplianceAnalyticsView({
  api,
  orgName = '',
  userName = '',
  canSeeAll = false,
}) {
  const [rangeId, setRangeId] = useState('30')
  const [period, setPeriod] = useState('day')
  const [groupBy, setGroupBy] = useState('activity')
  const [filterUser, setFilterUser] = useState('all')
  const [filterRole, setFilterRole] = useState('all')
  const [filterArea, setFilterArea] = useState('all')
  const [filterShift, setFilterShift] = useState('all')
  const [filterActivity, setFilterActivity] = useState('all')

  const days = RANGE_PRESETS.find((r) => r.id === rangeId)?.days || 30
  const fromDate = daysAgoStr(days - 1)
  const toDate = bogotaDate()

  const members = useMemo(() => {
    const list = api.members || []
    if (canSeeAll || api.isCoord) return list
    return list.filter((m) => m.id === api.userId || m.id === list.find((x) => x.id)?.id)
  }, [api.members, api.isCoord, canSeeAll, api.userId])

  // Operario solo ve sus hechos
  const scopeMembers = useMemo(() => {
    if (canSeeAll || api.isCoord || api.isGerencia) return members
    return members.filter((m) => m.id === (api.userId || members[0]?.id))
  }, [members, canSeeAll, api.isCoord, api.isGerencia, api.userId])

  const allFacts = useMemo(
    () =>
      buildFactRows({
        members: scopeMembers.length ? scopeMembers : members,
        rounds: api.rounds || [],
        labors: api.labors || [],
        attendance: api.attendanceHistory || [],
        targets: api.targets || [],
        fromDate,
        toDate,
      }),
    [scopeMembers, members, api.rounds, api.labors, api.attendanceHistory, api.targets, fromDate, toDate]
  )

  const filtered = useMemo(() => {
    return allFacts.filter((f) => {
      if (filterUser !== 'all' && f.userId !== filterUser) return false
      if (filterRole !== 'all' && f.role !== filterRole) return false
      if (filterArea !== 'all' && (f.area || 'general') !== filterArea) return false
      if (filterShift !== 'all' && f.shift !== filterShift) return false
      if (filterActivity !== 'all' && f.activity !== filterActivity) return false
      return true
    })
  }, [allFacts, filterUser, filterRole, filterArea, filterShift, filterActivity])

  const agg = useMemo(
    () => aggregateFacts(filtered, { groupBy, period }),
    [filtered, groupBy, period]
  )

  const series = useMemo(() => timeSeries(filtered, period), [filtered, period])

  const globalPct = useMemo(() => {
    if (!filtered.length) return 0
    return Math.round((filtered.reduce((s, f) => s + f.pct, 0) / filtered.length) * 10) / 10
  }, [filtered])

  const okCount = filtered.filter((f) => f.ok).length

  const roles = useMemo(
    () => [...new Set(allFacts.map((f) => f.role).filter(Boolean))],
    [allFacts]
  )
  const areas = useMemo(
    () => [...new Set(allFacts.map((f) => f.area || 'general'))],
    [allFacts]
  )
  const shifts = useMemo(
    () => [...new Set(allFacts.map((f) => f.shift).filter(Boolean))],
    [allFacts]
  )
  const activities = useMemo(
    () => [...new Set(allFacts.map((f) => f.activity))],
    [allFacts]
  )

  const users = useMemo(() => {
    const map = new Map()
    for (const f of allFacts) map.set(f.userId, f.userName)
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [allFacts])

  const exportFacts = factsToExportRows(filtered)
  const exportAgg = aggregatesToExportRows(agg)
  const exportMeta = {
    title: 'Cumplimiento medible y verificable',
    subtitle: `${fromDate} → ${toDate} · Agrupado por ${GROUP_BY.find((g) => g.id === groupBy)?.label || groupBy} · Periodo ${PERIODS.find((p) => p.id === period)?.label || period}`,
    orgName: orgName || undefined,
    module: 'Cumplimiento · analítica',
    generatedBy: userName || undefined,
  }

  return (
    <div className="comp-analytics">
      <p className="hint" style={{ marginTop: 0 }}>
        Cada fila es un <strong>hecho medible</strong> (esperado vs reportado),{' '}
        <strong>verificable</strong> (ID + evidencia) y <strong>exportable</strong> a Excel o PDF.
        Rango cargado: últimos {days} días ({fromDate} — {toDate}).
      </p>

      <div className="comp-filters">
        <label>
          Rango
          <select value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
            {RANGE_PRESETS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Periodo gráfico
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agrupar por
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUP_BY.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Usuario
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
            <option value="all">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Grupo / rol
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="all">Todos</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r] || r}
              </option>
            ))}
          </select>
        </label>
        <label>
          Área
          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}>
            <option value="all">Todas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {areaLabel(a) || a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Turno
          <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}>
            <option value="all">Todos</option>
            {shifts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Actividad
          <select value={filterActivity} onChange={(e) => setFilterActivity(e.target.value)}>
            <option value="all">Todas</option>
            {activities.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="exec-kpi-grid" style={{ marginTop: 12 }}>
        <div className={`exec-kpi ${globalPct >= 95 ? 'ok' : globalPct >= 70 ? 'warn' : ''}`}>
          <span className="exec-kpi-value">{globalPct}%</span>
          <span className="exec-kpi-label">Cumplimiento (prom.)</span>
        </div>
        <div className="exec-kpi">
          <span className="exec-kpi-value">{filtered.length}</span>
          <span className="exec-kpi-label">Hechos medibles</span>
        </div>
        <div className="exec-kpi ok">
          <span className="exec-kpi-value">{okCount}</span>
          <span className="exec-kpi-label">Cumplen meta</span>
        </div>
        <div className="exec-kpi warn">
          <span className="exec-kpi-value">{filtered.length - okCount}</span>
          <span className="exec-kpi-label">Bajo meta</span>
        </div>
      </div>

      <div className="actions row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
        <ExportMenu
          filename="cumplimiento_hechos"
          sheets={[
            { name: 'Hechos', rows: exportFacts },
            { name: 'Agregado', rows: exportAgg },
            {
              name: 'Serie_temporal',
              rows: series.map((s) => ({
                Periodo: s.label,
                Cumplimiento_pct: s.pct,
                Esperado: s.expected,
                Reportado: s.actual,
                Hechos: s.count,
              })),
            },
          ]}
          meta={exportMeta}
          label="Exportar todo"
          disabled={!filtered.length}
        />
      </div>

      <div className="comp-charts-grid" style={{ marginTop: 16 }}>
        <div className="tool-card">
          <h4>Score del filtro</h4>
          <DonutScore pct={globalPct} label="Promedio del filtro activo" />
        </div>
        <div className="tool-card">
          <h4>
            Por {GROUP_BY.find((g) => g.id === groupBy)?.label || groupBy}
          </h4>
          <BarChart data={agg} />
        </div>
        <div className="tool-card" style={{ gridColumn: '1 / -1' }}>
          <h4>
            Evolución · {PERIODS.find((p) => p.id === period)?.label || period}
          </h4>
          <LineChart data={series} />
        </div>
      </div>

      <h3 className="section-title" style={{ marginTop: 18 }}>
        Detalle verificable ({filtered.length})
      </h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Cada línea tiene ID verificable, esperado, reportado, % y evidencia. Exporta para auditoría.
      </p>
      {!filtered.length ? (
        <p className="exec-empty">
          No hay hechos en este rango. Registre rondas, labores o asistencia.
        </p>
      ) : (
        <div className="admin-list comp-fact-list">
          {filtered.slice(0, 80).map((f) => (
            <div key={f.id} className="admin-row" style={{ flexWrap: 'wrap' }}>
              <div className="admin-row-main" style={{ flex: 1, minWidth: 180 }}>
                <strong>
                  {f.userName} · {f.activityLabel}
                </strong>
                <span className="hint" style={{ margin: 0 }}>
                  {f.date} · {f.shift} · {ROLE_LABEL[f.role] || f.role} · {f.area}
                  {' · '}
                  Esp: {f.expected} / Rep: {f.actual} {f.unit}
                  {' · '}
                  {f.evidence}
                  {' · ID: '}
                  <code style={{ fontSize: 10 }}>{f.id}</code>
                </span>
              </div>
              <span className={`pill status ${f.ok ? 'ok' : 'warn'}`}>{f.pct}%</span>
            </div>
          ))}
          {filtered.length > 80 && (
            <p className="hint">Mostrando 80 de {filtered.length}. Exporta Excel para el total.</p>
          )}
        </div>
      )}
    </div>
  )
}
