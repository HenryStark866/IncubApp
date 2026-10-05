import React, { useState } from 'react'

export default function ReceptionInfoPanel() {
  const [selectedTopic, setSelectedTopic] = useState('bioseguridad')

  return (
    <div className="module-panel reception-info-panel">

      <div className="panel-header" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>ℹ️ Información Técnica y Guías de Recepción</h2>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          Manuales operativos, protocolos de bioseguridad en muelle, tablas de temperatura y parámetros estándar de huevo fértil.
        </p>
      </div>

      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 12 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Temas Operativos</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              type="button"
              className={selectedTopic === 'bioseguridad' ? 'tab active' : 'tab'}
              onClick={() => setSelectedTopic('bioseguridad')}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6 }}
            >
              🛡️ Protocolo de Bioseguridad Muelle
            </button>
            <button
              type="button"
              className={selectedTopic === 'parametros' ? 'tab active' : 'tab'}
              onClick={() => setSelectedTopic('parametros')}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6 }}
            >
              🌡️ Parámetros de Cuarto Frío
            </button>
            <button
              type="button"
              className={selectedTopic === 'criterios' ? 'tab active' : 'tab'}
              onClick={() => setSelectedTopic('criterios')}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6 }}
            >
              🥚 Criterios de Selección y Descarte
            </button>
            <button
              type="button"
              className={selectedTopic === 'contactos' ? 'tab active' : 'tab'}
              onClick={() => setSelectedTopic('contactos')}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6 }}
            >
              📞 Directorio de Soporte y Granjas
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          {selectedTopic === 'bioseguridad' && (
            <div>
              <h3 style={{ marginTop: 0 }}>🛡️ Protocolo de Bioseguridad al Recibir Camión</h3>
              <ul style={{ paddingLeft: 20, lineHeight: '1.7' }}>
                <li><strong>Desinfección de Vehículo:</strong> Todo camión debe pasar por el arco de desinfección y rodiluvio antes de ingresar al muelle.</li>
                <li><strong>Verificación de Precinto/Sello:</strong> Comprobar que el sello de las puertas traseras coincida con la remisión de la granja antes de abrir. Tomar foto como evidencia.</li>
                <li><strong>Dotación del Auxiliar:</strong> Uso obligatorio de bata limpia, cofia, tapabocas y botas de bioseguridad para el área limpia de recepción.</li>
                <li><strong>Inspección de Bandejas:</strong> Rechazar bandejas sucias de materia fecal o con presencia de insectos o plagas.</li>
              </ul>
            </div>
          )}

          {selectedTopic === 'parametros' && (
            <div>
              <h3 style={{ marginTop: 0 }}>🌡️ Parámetros Estándar de Cuarto Frío</h3>
              <div className="table-responsive" style={{ marginTop: 12 }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Días de Almacenamiento</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Temperatura Objetivo</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px' }}>Humedad Relativa (HR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 10px' }}>1 a 3 días</td>
                      <td style={{ padding: '8px 10px' }}>18°C – 20°C (64°F – 68°F)</td>
                      <td style={{ padding: '8px 10px' }}>75% – 80%</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 10px' }}>4 a 7 días</td>
                      <td style={{ padding: '8px 10px' }}>15°C – 17°C (59°F – 63°F)</td>
                      <td style={{ padding: '8px 10px' }}>75% – 80%</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 10px' }}>Más de 7 días</td>
                      <td style={{ padding: '8px 10px' }}>12°C – 14°C (54°F – 57°F)</td>
                      <td style={{ padding: '8px 10px' }}>80% – 85%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedTopic === 'criterios' && (
            <div>
              <h3 style={{ marginTop: 0 }}>🥚 Criterios de Selección y Descarte de Huevo</h3>
              <ul style={{ paddingLeft: 20, lineHeight: '1.7' }}>
                <li><strong>Huevo Apto / Incubable:</strong> Peso entre 52g y 72g, cáscara lisa, limpia y forma simétrica estándar.</li>
                <li><strong>Fisurado / Roto:</strong> Detectado por sonido al repicar o por ovoscopia. Descartar inmediatamente para evitar contaminación.</li>
                <li><strong>Sucio:</strong> Huevos manchados con más del 10% de suciedad o materia orgánica. No lavar con agua fría.</li>
                <li><strong>Deforme / Rugoso:</strong> Cáscara rugosa, porosidad extrema o forma alargada/redonda anormal.</li>
              </ul>
            </div>
          )}

          {selectedTopic === 'contactos' && (
            <div>
              <h3 style={{ marginTop: 0 }}>📞 Directorio de Soporte y Coordinación</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
                <div style={{ border: '1px solid var(--line)', padding: 12, borderRadius: 8 }}>
                  <strong>Líder de Planta</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Coordinación de Cargue y Turnos</div>
                  <div style={{ marginTop: 6, fontWeight: 'bold' }}>Ext. 104 · Cel: 300-123-4567</div>
                </div>
                <div style={{ border: '1px solid var(--line)', padding: 12, borderRadius: 8 }}>
                  <strong>Mantenimiento</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Fallas de Cuarto Frío / Balanzas</div>
                  <div style={{ marginTop: 6, fontWeight: 'bold' }}>Ext. 108 · Cel: 310-987-6543</div>
                </div>
                <div style={{ border: '1px solid var(--line)', padding: 12, borderRadius: 8 }}>
                  <strong>Sanidad y Calidad</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Veterinaria y Bioseguridad</div>
                  <div style={{ marginTop: 6, fontWeight: 'bold' }}>Ext. 105 · Cel: 320-555-0199</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
