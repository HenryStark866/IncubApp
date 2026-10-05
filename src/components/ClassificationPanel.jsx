import React, { useState } from 'react'
import LoadClassificationWorkspace from './LoadClassificationWorkspace'
import { useIncubationLots } from '../hooks/useIncubationLots'

export default function ClassificationPanel({ orgId, userId, role }) {
  const lotsApi = useIncubationLots(orgId)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'workspace'
  const [selectedBatch, setSelectedBatch] = useState(null)

  return (
    <div className="module-panel classification-panel">

      <div className="panel-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>🥚 Clasificación de Huevos</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              Mesa de ovoscopia, separación por categorías (incubable, fisurado, sucio, deforme) y llenado de bandejas.
            </p>
          </div>
          <div className="actions row" style={{ gap: 8 }}>
            <button
              type="button"
              className={viewMode === 'list' ? 'primary small' : 'ghost small'}
              onClick={() => setViewMode('list')}
            >
              📋 Lotes en Cuarto Frío
            </button>
            <button
              type="button"
              className={viewMode === 'workspace' ? 'primary small' : 'ghost small'}
              onClick={() => setViewMode('workspace')}
            >
              📐 Mesa de Clasificación
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'workspace' ? (
        <LoadClassificationWorkspace orgId={orgId} userId={userId} role={role} />
      ) : (
        <div className="card wide">
          <div className="card-head">
            <h3>Lotes pendientes por clasificar en cuarto frío</h3>
            <span className="badge info">{lotsApi.lots?.length || 0} lotes disponibles</span>
          </div>

          <p className="hint">
            Selecciona un lote recibido para iniciar su clasificación o abrir la mesa de trabajo:
          </p>

          <div className="table-responsive" style={{ marginTop: 12 }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Lote / Código</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>Granja de Origen</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Huevos Recibidos</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>Estado</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {(!lotsApi.lots || lotsApi.lots.length === 0) ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                      No hay lotes pendientes de clasificación en este momento.
                    </td>
                  </tr>
                ) : (
                  lotsApi.lots.map((lot) => (
                    <tr key={lot.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 'bold' }}>{lot.code || lot.batch_number || lot.id.slice(0, 8)}</td>
                      <td style={{ padding: '8px 12px' }}>{lot.farm_name || lot.origin || 'Granja central'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{(lot.total_eggs || lot.quantity || 0).toLocaleString('es-CO')}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span className="sh-tag sh-tag-accent">Por Clasificar</span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="primary small"
                          onClick={() => {
                            setSelectedBatch(lot)
                            setViewMode('workspace')
                          }}
                        >
                          Clasificar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
