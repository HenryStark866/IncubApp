/**
 * Clasificación (operario de recepción): lotes que llegaron a planta y esperan
 * clasificación, con datos reales de incubation_lots, y la mesa de clasificación
 * (LoadClassificationWorkspace) para trabajarlos.
 */
import { useMemo, useState } from 'react'
import LoadClassificationWorkspace from './LoadClassificationWorkspace'
import { lotTotals, useIncubationLots } from '../hooks/useIncubationLots'
import { RxHeader } from './ReceptionScaffold'

/** Estados de lote que le importan a recepción (los demás ya salieron de su mesa). */
const ESTADOS = {
  arrived: { texto: 'En planta · por clasificar', clase: 'sh-tag-accent', orden: 0 },
  classifying: { texto: 'En clasificación', clase: 'sh-tag-ok', orden: 1 },
  planned: { texto: 'Programado (aún no llega)', clase: 'sh-tag-muted', orden: 2 },
}

const fmt = new Intl.NumberFormat('es-CO')
const fecha = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—')

export default function ClassificationPanel({ orgId, userId, role }) {
  const { lots, loading, error } = useIncubationLots(orgId, userId)
  const [vista, setVista] = useState('lotes') // 'lotes' | 'mesa'

  const pendientes = useMemo(
    () =>
      (lots || [])
        .filter((l) => ESTADOS[l.status])
        .sort(
          (a, b) =>
            ESTADOS[a.status].orden - ESTADOS[b.status].orden ||
            String(a.expected_arrival_date || '').localeCompare(String(b.expected_arrival_date || ''))
        ),
    [lots]
  )
  const porClasificar = pendientes.filter((l) => l.status === 'arrived').length

  return (
    <div className="module-panel rx-panel">
      <RxHeader
        icon="🥚"
        title="Clasificación de huevos"
        hint="Mesa de ovoscopia, separación por categorías (incubable, fisurado, sucio, deforme) y llenado de bandejas."
      >
        <button type="button" className={vista === 'lotes' ? 'primary small' : 'ghost small'} onClick={() => setVista('lotes')}>
          📋 Lotes por clasificar
        </button>
        <button type="button" className={vista === 'mesa' ? 'primary small' : 'ghost small'} onClick={() => setVista('mesa')}>
          📐 Mesa de clasificación
        </button>
      </RxHeader>

      {vista === 'mesa' ? (
        <LoadClassificationWorkspace orgId={orgId} userId={userId} role={role} />
      ) : (
        <section className="card wide">
          <div className="card-head">
            <h3>Lotes en planta y próximos a llegar</h3>
            <span className="badge info">{porClasificar} por clasificar</span>
          </div>
          {error ? <p className="msg error">No se pudieron cargar los lotes: {String(error.message || error)}</p> : null}
          <div className="table-responsive">
            <table className="table rx-table">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Origen</th>
                  <th>Llegada</th>
                  <th className="num">Huevos</th>
                  <th className="num">Carros</th>
                  <th className="centro">Estado</th>
                  <th className="num">Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading && pendientes.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="rx-vacio">Cargando lotes…</td>
                  </tr>
                ) : pendientes.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="rx-vacio">No hay lotes por clasificar en este momento.</td>
                  </tr>
                ) : (
                  pendientes.map((lot) => {
                    const t = lotTotals(lot.postures)
                    const e = ESTADOS[lot.status]
                    return (
                      <tr key={lot.id}>
                        <td className="fuerte">{lot.code || lot.id.slice(0, 8)}</td>
                        <td>{lot.origin || '—'}</td>
                        <td>{fecha(lot.expected_arrival_date)}</td>
                        <td className="num">{fmt.format(t.eggs)}</td>
                        <td className="num">{t.fullCarts}</td>
                        <td className="centro">
                          <span className={`sh-tag ${e.clase}`}>{e.texto}</span>
                        </td>
                        <td className="num">
                          {lot.status !== 'planned' ? (
                            <button type="button" className="primary small" onClick={() => setVista('mesa')}>
                              Clasificar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
