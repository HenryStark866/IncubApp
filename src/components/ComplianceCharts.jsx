/**
 * Gráficos SVG de cumplimiento (sin dependencias extra).
 * Henry Stark Desarrollador
 */

/** Barras horizontales de % cumplimiento */
export function BarChart({ data = [], maxBars = 12, height = 220 }) {
  const rows = data.slice(0, maxBars)
  if (!rows.length) {
    return <p className="exec-empty">Sin datos para graficar en este filtro.</p>
  }
  const h = Math.max(height, rows.length * 28)
  const w = 360
  const labelW = 110
  const barMax = w - labelW - 48

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="comp-chart" role="img" aria-label="Barras de cumplimiento">
      {rows.map((r, i) => {
        const y = 8 + i * 28
        const pct = Math.min(100, Math.max(0, Number(r.pct) || 0))
        const bw = (pct / 100) * barMax
        const color = pct >= 95 ? '#12855a' : pct >= 70 ? '#b5730a' : '#c53727'
        return (
          <g key={r.key || i}>
            <text x={0} y={y + 12} className="comp-chart-label">
              {String(r.label || r.key).slice(0, 16)}
            </text>
            <rect x={labelW} y={y} width={barMax} height={16} rx={4} className="comp-chart-track" />
            <rect x={labelW} y={y} width={Math.max(2, bw)} height={16} rx={4} fill={color} />
            <text x={labelW + barMax + 6} y={y + 12} className="comp-chart-val">
              {pct}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Línea de evolución temporal */
export function LineChart({ data = [], height = 180 }) {
  if (!data.length) {
    return <p className="exec-empty">Sin serie temporal.</p>
  }
  const w = 400
  const pad = { t: 16, r: 16, b: 36, l: 36 }
  const iw = w - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const n = data.length
  const maxY = 100
  const pts = data.map((d, i) => {
    const x = pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
    const y = pad.t + ih - (Math.min(100, Math.max(0, d.pct)) / maxY) * ih
    return { x, y, ...d }
  })
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="comp-chart" role="img" aria-label="Evolución">
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ih} className="comp-chart-axis" />
      <line x1={pad.l} y1={pad.t + ih} x2={pad.l + iw} y2={pad.t + ih} className="comp-chart-axis" />
      {/* meta 95% */}
      <line
        x1={pad.l}
        y1={pad.t + ih - 0.95 * ih}
        x2={pad.l + iw}
        y2={pad.t + ih - 0.95 * ih}
        className="comp-chart-goal"
      />
      <text x={pad.l + 4} y={pad.t + ih - 0.95 * ih - 4} className="comp-chart-val">
        meta 95%
      </text>
      <path d={path} fill="none" stroke="var(--accent, #e0740a)" strokeWidth="2.5" />
      {pts.map((p, i) => (
        <g key={p.key || i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="var(--accent, #e0740a)" />
          {(n <= 10 || i === 0 || i === n - 1 || i % Math.ceil(n / 6) === 0) && (
            <text
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              className="comp-chart-label"
            >
              {String(p.label || p.key).slice(-7)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

/** Donut simple cumplimiento global */
export function DonutScore({ pct = 0, label = 'Cumplimiento' }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0))
  const r = 42
  const c = 2 * Math.PI * r
  const dash = (p / 100) * c
  const color = p >= 95 ? '#12855a' : p >= 70 ? '#b5730a' : '#c53727'
  return (
    <div className="comp-donut-wrap">
      <svg viewBox="0 0 120 120" className="comp-donut" aria-label={label}>
        <circle cx="60" cy="60" r={r} className="comp-donut-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="64" textAnchor="middle" className="comp-donut-pct">
          {p}%
        </text>
      </svg>
      <span className="hint">{label}</span>
    </div>
  )
}
