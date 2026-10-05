/**
 * Información (operario de recepción): guías de consulta rápida en el muelle.
 * Los valores son de referencia general del sector: deben confirmarse con Sanidad y
 * Calidad antes de usarse como norma. El directorio no lleva teléfonos inventados
 * (05-10-2026): se llenará con las extensiones reales de la planta.
 */
import { useState } from 'react'
import { RxHeader } from './ReceptionScaffold'

const TEMAS = [
  {
    id: 'bioseguridad',
    icono: '🛡️',
    titulo: 'Protocolo de bioseguridad al recibir el camión',
    puntos: [
      ['Desinfección del vehículo', 'Todo camión pasa por el arco de desinfección y el rodiluvio antes de entrar al muelle.'],
      ['Precinto o sello', 'Compruebe que el sello de las puertas coincida con la remisión de la granja antes de abrir. Tome foto como evidencia.'],
      ['Dotación', 'Bata limpia, cofia, tapabocas y botas de bioseguridad en el área limpia de recepción.'],
      ['Bandejas', 'Rechace bandejas sucias de materia fecal o con insectos o plagas.'],
    ],
  },
  {
    id: 'parametros',
    icono: '🌡️',
    titulo: 'Parámetros de cuarto frío',
    tabla: {
      columnas: ['Días de almacenamiento', 'Temperatura objetivo', 'Humedad relativa'],
      filas: [
        ['1 a 3 días', '18 °C – 20 °C', '75 % – 80 %'],
        ['4 a 7 días', '15 °C – 17 °C', '75 % – 80 %'],
        ['Más de 7 días', '12 °C – 14 °C', '80 % – 85 %'],
      ],
    },
  },
  {
    id: 'criterios',
    icono: '🥚',
    titulo: 'Criterios de selección y descarte',
    puntos: [
      ['Apto / incubable', 'Peso entre 52 g y 72 g, cáscara lisa y limpia, forma simétrica.'],
      ['Fisurado / roto', 'Se detecta al repicar o en la ovoscopia. Se descarta de inmediato para evitar contaminación.'],
      ['Sucio', 'Más del 10 % de la cáscara manchada o con materia orgánica. No lavar con agua fría.'],
      ['Deforme / rugoso', 'Cáscara rugosa, porosidad extrema o forma muy alargada o redonda.'],
    ],
  },
  {
    id: 'contactos',
    icono: '📞',
    titulo: 'A quién acudir',
    contactos: [
      ['Líder de planta', 'Coordinación de cargue y turnos'],
      ['Mantenimiento', 'Fallas de cuarto frío, ovoscopio y balanzas'],
      ['Sanidad y calidad', 'Veterinaria y bioseguridad'],
    ],
  },
]

export default function ReceptionInfoPanel() {
  const [temaId, setTemaId] = useState(TEMAS[0].id)
  const tema = TEMAS.find((t) => t.id === temaId) || TEMAS[0]

  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="ℹ️"
        title="Información y guías de recepción"
        hint="Protocolos de bioseguridad en el muelle, parámetros de cuarto frío y criterios del huevo fértil."
      />
      <div className="rx-info">
        <nav className="card rx-temas" aria-label="Temas">
          {TEMAS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === temaId ? 'tab active' : 'tab'}
              aria-pressed={t.id === temaId}
              onClick={() => setTemaId(t.id)}
            >
              <span aria-hidden="true">{t.icono}</span> {t.titulo}
            </button>
          ))}
        </nav>

        <section className="card rx-tema">
          <h3>
            <span aria-hidden="true">{tema.icono}</span> {tema.titulo}
          </h3>
          {tema.puntos && (
            <ul className="rx-list">
              {tema.puntos.map(([t, d]) => (
                <li key={t}>
                  <strong>{t}:</strong> {d}
                </li>
              ))}
            </ul>
          )}
          {tema.tabla && (
            <div className="table-responsive">
              <table className="table rx-table">
                <thead>
                  <tr>
                    {tema.tabla.columnas.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tema.tabla.filas.map((f) => (
                    <tr key={f[0]}>
                      {f.map((v) => (
                        <td key={v}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tema.contactos && (
            <>
              <div className="rx-contactos">
                {tema.contactos.map(([quien, para]) => (
                  <div key={quien} className="rx-contacto">
                    <strong>{quien}</strong>
                    <span className="hint">{para}</span>
                    <span className="rx-pendiente">Extensión y celular: por confirmar</span>
                  </div>
                ))}
              </div>
              <p className="hint">Los números se cargarán con los datos reales de la planta.</p>
            </>
          )}
          {(tema.tabla || tema.id === 'criterios') && (
            <p className="hint rx-nota">
              Valores de referencia general: confírmelos con Sanidad y Calidad antes de usarlos como norma de la planta.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
