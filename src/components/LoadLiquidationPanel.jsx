import React, { useState } from 'react'

export default function LoadLiquidationPanel() {
  const [search, setSearch] = useState('')

  return (
    <div className="module-panel load-liquidation-panel">

      <div className="panel-header" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>⚖️ Liquidación de Cargues</h2>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          Cierre numérico de carros cargados, balance de bandejas útiles vs sobrantes y confirmación antes de entrada a incubadora.
        </p>
      </div>

      <div className="card wide">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h3>Órdenes y Carros Listos para Liquidar</h3>
          <input
            type="search"
            placeholder="Buscar por lote, máquina o carro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)' }}
          />
        </div>

        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, margin: '16px 0' }}>
          <div className="sh-card sh-stat sh-card-accent" style={{ padding: 14 }}>
            <span className="sh-tile-label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargues en Proceso</span>
            <span className="sh-stat-num" style={{ fontSize: 24, fontWeight: 'bold', display: 'block', marginTop: 4 }}>3</span>
          </div>
          <div className="sh-card sh-stat" style={{ padding: 14 }}>
            <span className="sh-tile-label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carros Pendientes Liquidación</span>
            <span className="sh-stat-num" style={{ fontSize: 24, fontWeight: 'bold', display: 'block', marginTop: 4 }}>12</span>
          </div>
          <div className="sh-card sh-stat" style={{ padding: 14 }}>
            <span className="sh-tile-label" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Huevos Cargados Hoy</span>
            <span className="sh-stat-num" style={{ fontSize: 24, fontWeight: 'bold', display: 'block', marginTop: 4, color: 'var(--accent)' }}>57.600</span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-card-subtle, rgba(255,255,255,0.02))' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Orden / Máquina</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Lote / Edad</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>Carros</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total Huevos</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>Estado</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px', fontWeight: '600' }}>ORD-2026-1004 · INC-01</td>
                <td style={{ padding: '10px 12px' }}>LOTE-ROBB-42 (36 sem)</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>4 / 4 carros</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>19.200</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <span className="sh-tag sh-tag-accent">Listo para Liquidar</span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <button type="button" className="primary small">Liquidar</button>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px', fontWeight: '600' }}>ORD-2026-1005 · INC-03</td>
                <td style={{ padding: '10px 12px' }}>LOTE-COBB-18 (44 sem)</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>6 / 8 carros</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600' }}>28.800</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <span className="sh-tag sh-tag-muted">Llenando Carros</span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <button type="button" className="ghost small">Ver Detalle</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
