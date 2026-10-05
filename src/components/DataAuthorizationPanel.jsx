import React, { useState } from 'react'

export default function DataAuthorizationPanel() {
  const [selectedItems, setSelectedItems] = useState([])
  const [authMsg, setAuthMsg] = useState(null)

  const pendingAuthorizations = [
    {
      id: 'auth-1',
      type: 'Ajuste de Conteo',
      lot: 'LOTE-ROBB-42',
      farm: 'Granja San Antonio',
      sent: 19400,
      received: 19200,
      diff: -200,
      reason: '200 huevos fisurados en transporte',
      date: 'Hoy 10:15 AM',
    },
    {
      id: 'auth-2',
      type: 'Cambio de Cuarto Frío',
      lot: 'LOTE-COBB-18',
      farm: 'Granja La Palma',
      sent: 28800,
      received: 28800,
      diff: 0,
      reason: 'Reubicación a Cuarto Frío B por capacidad',
      date: 'Hoy 08:45 AM',
    },
  ]

  const handleAuthorize = (id) => {
    setAuthMsg(`✓ Lote ${id} autorizado y registrado en la base de datos oficial.`)
    setTimeout(() => setAuthMsg(null), 4000)
  }

  return (
    <div className="module-panel data-authorization-panel">

      <div className="panel-header" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>✅ Autorización y Validación de Datos</h2>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          Validación formal de diferencias de conteo entre remisión de granja y recepción física, mermas y aprobaciones de ingreso.
        </p>
      </div>

      <div className="card wide">
        <div className="card-head">
          <h3>Autorizaciones Pendientes de Recepción</h3>
          <span className="badge warning">{pendingAuthorizations.length} pendientes</span>
        </div>

        {authMsg && <p className="msg ok" style={{ margin: '12px 0' }}>{authMsg}</p>}

        <div className="table-responsive" style={{ marginTop: 12 }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-card-subtle, rgba(255,255,255,0.02))' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Tipo / Fecha</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Lote / Origen</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Enviado</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Recibido</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Diferencia</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Motivo / Observación</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pendingAuthorizations.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <strong>{item.type}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.date}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div><strong>{item.lot}</strong></div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.farm}</div>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{item.sent.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold' }}>{item.received.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: item.diff < 0 ? 'var(--danger, #ff5722)' : 'inherit' }}>
                    {item.diff === 0 ? '0' : item.diff.toLocaleString('es-CO')}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.reason}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="primary small"
                        onClick={() => handleAuthorize(item.lot)}
                      >
                        ✓ Autorizar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
