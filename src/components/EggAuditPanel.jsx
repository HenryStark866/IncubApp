import React, { useState } from 'react'

export default function EggAuditPanel() {
  const [sampleSize, setSampleSize] = useState('180') // 180 eggs standard tray
  const [lotCode, setLotCode] = useState('')
  const [weightAvg, setWeightAvg] = useState('')
  const [tempArrival, setTempArrival] = useState('')
  const [cracked, setCracked] = useState('')
  const [dirty, setDirty] = useState('')
  const [deformed, setDeformed] = useState('')
  const [savedMsg, setSavedMsg] = useState(null)

  const handleSave = (e) => {
    e.preventDefault()
    setSavedMsg('✓ Auditoría registrada con éxito en el sistema.')
    setTimeout(() => setSavedMsg(null), 4000)
  }

  return (
    <div className="module-panel egg-audit-panel">

      <div className="panel-header" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>🔍 Auditoría y Control de Calidad de Huevo</h2>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          Muestreo técnico por lote, medición de peso promedio, temperatura de cáscara, porcentaje de fisuras y suciedad.
        </p>
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3>Nueva Muestra de Auditoría</h3>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <label>
              Lote a Auditar
              <input
                type="text"
                required
                placeholder="Ej: LOTE-ROBB-42"
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
              />
            </label>

            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                Tamaño Muestra (Huevos)
                <select value={sampleSize} onChange={(e) => setSampleSize(e.target.value)}>
                  <option value="90">90 huevos (1/2 caja)</option>
                  <option value="180">180 huevos (1 bandeja est.)</option>
                  <option value="360">360 huevos (1 caja completa)</option>
                </select>
              </label>

              <label>
                Peso Promedio (g/huevo)
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ej: 64.5"
                  value={weightAvg}
                  onChange={(e) => setWeightAvg(e.target.value)}
                />
              </label>
            </div>

            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                Temp. Cáscara (°C)
                <input
                  type="number"
                  step="0.1"
                  placeholder="Ej: 18.2"
                  value={tempArrival}
                  onChange={(e) => setTempArrival(e.target.value)}
                />
              </label>

              <label>
                Huevos Fisurados
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={cracked}
                  onChange={(e) => setCracked(e.target.value)}
                />
              </label>
            </div>

            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                Huevos Sucios
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={dirty}
                  onChange={(e) => setDirty(e.target.value)}
                />
              </label>

              <label>
                Huevos Deformes / Micro
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={deformed}
                  onChange={(e) => setDeformed(e.target.value)}
                />
              </label>
            </div>

            {savedMsg && <p className="msg ok">{savedMsg}</p>}

            <div className="actions row" style={{ marginTop: 8 }}>
              <button type="submit" className="primary small">
                Guardar Auditoría
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Historial de Auditorías Recientes</h3>
          </div>

          <div className="table-responsive" style={{ marginTop: 12 }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Fecha / Lote</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>Muestra</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>% Fisura</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px' }}>% Sucio</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px' }}>Calificación</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <strong>LOTE-ROBB-42</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hoy 09:30 AM</div>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>180</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--accent)' }}>1.1%</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>0.5%</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span className="sh-tag sh-tag-ok">Excelente</span>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <strong>LOTE-COBB-18</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hoy 08:15 AM</div>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>180</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--danger, #ff5722)' }}>3.8%</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>1.2%</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span className="sh-tag sh-tag-fault">Alerta Fisura</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
