/**
 * =============================================================================
 * ARCHIVO: src/components/ProductionFlowPanel.jsx
 * PROPÓSITO: «Flujo de producción»: la planta de punta a punta con los datos reales —
 *   recepción → cuarto frío y clasificación → mapas y cargue → calibración INC →
 *   transferencia → calibración de nacedoras → nacimiento. Arriba lo que toca ya, con su
 *   responsable y el botón para ir a hacerlo. Cada perfil ve primero su parte (mine) y
 *   puede abrir el flujo completo. 12-10-2026.
 * =============================================================================
 */
import { useMemo, useState } from 'react'
import { useProductionFlow } from '../hooks/useProductionFlow'
import { stagesForRole } from '../lib/productionFlow'
import './ProductionFlowPanel.css'

const STATUS = {
  ok: { label: 'Al día', cls: 'ok' },
  pending: { label: 'Pendiente', cls: 'warn' },
  late: { label: 'Atrasado', cls: 'danger' },
}

function Item({ i, onNavigate }) {
  return (
    <li className={`pf-item tone-${i.tone}`}>
      <span className="pf-dot" aria-hidden="true" />
      <div className="pf-item-main">
        <b>{i.text}</b>
        {i.detail && <span>{i.detail}</span>}
      </div>
      {i.tab && onNavigate && i.tone !== 'ok' && (
        <button type="button" className="pf-go" onClick={() => onNavigate(i.tab)}>
          Ir ›
        </button>
      )}
    </li>
  )
}

export default function ProductionFlowPanel({ orgId, role, onNavigate, compact = false, title = 'Flujo de producción' }) {
  const { flow, loading, warning, updatedAt, reload } = useProductionFlow(orgId)
  const mineIds = useMemo(() => stagesForRole(role), [role])
  const isLead = mineIds.length === 7
  const [all, setAll] = useState(!compact && isLead)

  if (!orgId) return null
  const stages = flow ? flow.stages.filter((s) => all || mineIds.includes(s.id)) : []
  const next = flow ? flow.next.filter((n) => all || mineIds.includes(n.stage)) : []
  const t = flow?.today

  return (
    <section className={`pf-root${compact ? ' is-compact' : ''}`} aria-label={title}>
      <header className="pf-head">
        <div>
          <h2>🔁 {title}</h2>
          {t && (
            <p>
              Hoy {t.weekday} · {t.hatchToday ? '🐣 día de nacimiento' : '📦 día de clasificar'}
              {t.loadTonight ? ` · 🌙 esta noche se carga (nace el ${t.hatchFromTonight?.slice(8)}/${t.hatchFromTonight?.slice(5, 7)})` : ''}
            </p>
          )}
        </div>
        <div className="pf-head-actions">
          {!isLead && (
            <button type="button" className="ghost small" onClick={() => setAll((v) => !v)}>
              {all ? 'Solo mi parte' : 'Ver todo el flujo'}
            </button>
          )}
          <button type="button" className="ghost small" onClick={reload} disabled={loading}>
            {loading ? 'Actualizando…' : '↻'}
          </button>
        </div>
      </header>
      {warning && <p className="pf-msg">{warning}</p>}
      {!flow ? (
        <p className="pf-empty">{loading ? 'Leyendo la planta…' : 'Sin datos todavía.'}</p>
      ) : (
        <>
          <div className="pf-next">
            <h3>{next.length ? `Lo que toca ahora · ${next.length}` : '✔ Nada urgente: todo al día'}</h3>
            {next.length > 0 && (
              <ul>
                {next.slice(0, compact ? 4 : 8).map((i) => (
                  <Item key={i.id} i={{ ...i, detail: `${i.owner} · ${i.detail || i.stageTitle}` }} onNavigate={onNavigate} />
                ))}
              </ul>
            )}
          </div>
          {(!compact || all) && (
            <ol className="pf-stages">
              {stages.map((s) => (
                <li key={s.id} className={`pf-stage st-${s.status}`}>
                  <div className="pf-stage-head">
                    <span className="pf-n">{s.n}</span>
                    <div>
                      <b>{s.title}</b>
                      <span>{s.owner}</span>
                    </div>
                    <em className={`pf-st ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</em>
                  </div>
                  <ul>
                    {s.items.map((i) => (
                      <Item key={i.id} i={i} onNavigate={onNavigate} />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <p className="pf-updated">{updatedAt ? `Actualizado ${updatedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · se actualiza solo con cada registro` : ''}</p>
        </>
      )}
    </section>
  )
}
