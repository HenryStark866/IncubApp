import React, { useState } from 'react'

export default function ReceptionRequestsPanel() {
  const [reqType, setReqType] = useState('insumos')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('100')
  const [priority, setPriority] = useState('normal')
  const [submittedMsg, setSubmittedMsg] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmittedMsg('✓ Solicitud enviada correctamente a coordinación de planta.')
    setDescription('')
    setTimeout(() => setSubmittedMsg(null), 4000)
  }

  return (
    <div className="module-panel reception-requests-panel">

      <div className="panel-header" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>📝 Solicitudes y Novedades de Recepción</h2>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          Petición de insumos operativos (bandejas plásticas, separadores, papel, EPP), reporte de daños y solicitudes de turno.
        </p>
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3>Nueva Solicitud</h3>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <label>
              Tipo de Solicitud
              <select value={reqType} onChange={(e) => setReqType(e.target.value)}>
                <option value="insumos">Insumos (Bandejas, separadores, carros)</option>
                <option value="epp">EPP y Dotación de Bioseguridad</option>
                <option value="mantenimiento">Mantenimiento de Equipo (Ovoscopio, balanza, cortina)</option>
                <option value="permiso">Permisos o Novedades de Personal</option>
              </select>
            </label>

            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                Cantidad / Unidad
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>

              <label>
                Prioridad
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente (Afecta turno)</option>
                </select>
              </label>
            </div>

            <label>
              Detalle y Justificación
              <textarea
                rows="3"
                required
                placeholder="Describe los insumos o la novedad necesaria para el área de recepción..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: '100%', borderRadius: 6, border: '1px solid var(--line)', padding: 8 }}
              />
            </label>

            {submittedMsg && <p className="msg ok">{submittedMsg}</p>}

            <div className="actions row" style={{ marginTop: 8 }}>
              <button type="submit" className="primary small">
                Enviar Solicitud
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Mis Solicitudes Activas</h3>
          </div>

          <div className="table-responsive" style={{ marginTop: 12 }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Fecha / Tipo</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Descripción</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <strong>Bandejas Petersime</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hoy 07:30 AM</div>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 13 }}>300 bandejas para recepción granja La Palma</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span className="sh-tag sh-tag-ok">Aprobado</span>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <strong>Guantes de látex y EPP</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ayer 15:40 PM</div>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 13 }}>2 cajas guantes talla M para ovoscopia</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span className="sh-tag sh-tag-accent">En Despacho</span>
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
