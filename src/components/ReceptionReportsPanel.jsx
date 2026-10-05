import React, { useState } from 'react'

export default function ReceptionReportsPanel() {
  const [dateRange, setDateRange] = useState('today')

  return (
    <div className="module-panel reception-reports-panel">

      <div className="panel-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>📊 Reportes e Informes de Recepción</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Consolidado de entradas de huevo fértil, balance por granja, estadísticas de mermas y roturas.
            </p>
          </div>
          <div className="actions row" style={{ gap: 8 }}>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)' }}
            >
              <option value="today">Hoy</option>
              <option value="week">Esta Semana</option>
              <option value="month">Este Mes</option>
            </select>
            <button type="button" className="ghost small">
              📥 Exportar Excel
            </button>
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="sh-card sh-stat" style={{ padding: 14 }}>
          <span className="sh-tile-label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Huevos Recibidos</span>
          <span className="sh-stat-num" style={{ fontSize: 24, fontWeight: 'bold', display: 'block', marginTop: 4 }}>76.800</span>
        </div>
        <div className="sh-card sh-stat sh-card-accent" style={{ padding: 14 }}>
          <span className="sh-tile-label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Huevos Incubables (Aptos)</span>
          <span className="sh-stat-num" style={{ fontSize: 24, fontWeight: 'bold', display: 'block', marginTop: 4, color: 'var(--accent)' }}>74.920</span>
        </div>
        <div className="sh-card sh-stat" style={{ padding: 14 }}>
          <span className="sh-tile-label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>% Merma / Descarte</span>
          <span className="sh-stat-num" style={{ fontSize: 24, fontWeight: 'bold', display: 'block', marginTop: 4 }}>2.45%</span>
        </div>
        <div className="sh-card sh-stat" style={{ padding: 14 }}>
          <span className="sh-tile-label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lotes Procesados</span>
          <span className="sh-stat-num" style={{ fontSize: 24, fontWeight: 'bold', display: 'block', marginTop: 4 }}>4</span>
        </div>
      </div>

      <div className="card wide">
        <div className="card-head">
          <h3>Resumen Consolidado por Granja de Origen</h3>
        </div>

        <div className="table-responsive" style={{ marginTop: 12 }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-card-subtle, rgba(255,255,255,0.02))' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Granja</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Lotes</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total Recibido</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Incubable</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Fisurado</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Sucio / Deforme</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>% Aprovechamiento</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>Granja San Antonio</td>
                <td style={{ padding: '10px 12px' }}>LOTE-ROBB-42</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>38.400</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>37.620</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>420</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>360</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--accent)', fontWeight: 'bold' }}>97.97%</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>Granja La Palma</td>
                <td style={{ padding: '10px 12px' }}>LOTE-COBB-18</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>38.400</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>37.300</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>650</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>450</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--accent)', fontWeight: 'bold' }}>97.13%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
