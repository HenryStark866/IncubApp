/**
 * =============================================================================
 * ARCHIVO: src/components/ManualsCenter.jsx
 * PROPÓSITO: «Manuales e instructivos» dentro de la app. Cada perfil ve primero su
 *   instructivo paso a paso; cada paso con pantalla tiene «Abrir» para ir directo.
 *   Buscador, impresión y el manual completo ilustrado (PDF / versión web) a un toque.
 *   Los manuales de los equipos siguen en «Plan AM y manuales». 12-10-2026.
 * =============================================================================
 */
import { useMemo, useState } from 'react'
import { MANUALS, manualById, manualIdsFor, searchManuals, stepText } from '../lib/userManuals'
import { ROLE_LABEL } from '../lib/roles'
import './ManualsCenter.css'

const FULL_PDF = '/manuales/Manual_de_Usuario_IncubApp.pdf'
const FULL_WEB = '/manuales/Manual_de_Usuario_IncubApp.html'

function Section({ section, onNavigate }) {
  return (
    <section className="mc-section">
      <h3>{section.title}</h3>
      <ol>
        {section.steps.map((s, i) => {
          const tab = typeof s === 'object' ? s.tab : null
          return (
            <li key={i}>
              <span>{stepText(s)}</span>
              {tab && onNavigate && (
                <button type="button" className="mc-open" onClick={() => onNavigate(tab)}>
                  Abrir ›
                </button>
              )}
            </li>
          )
        })}
      </ol>
      {section.tip && <p className="mc-tip">💡 {section.tip}</p>}
    </section>
  )
}

export default function ManualsCenter({ role, area, userName, onNavigate }) {
  const { own, others } = useMemo(() => manualIdsFor(role, area), [role, area])
  const [current, setCurrent] = useState(own[0])
  const [query, setQuery] = useState('')
  const [showWeb, setShowWeb] = useState(false)
  const manual = manualById(current) || MANUALS[0]
  const results = useMemo(() => searchManuals(query), [query])

  const pick = (id) => {
    setCurrent(id)
    setQuery('')
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="card wide mc-root">
      <header className="mc-head">
        <div>
          <h2>📘 Manuales e instructivos</h2>
          <p>
            {userName ? `${userName.split(' ')[0]}, ` : ''}aquí está el paso a paso de tu perfil
            {ROLE_LABEL[role] ? ` (${ROLE_LABEL[role]})` : ''}. Los manuales de los equipos están en «Plan AM y manuales».
          </p>
        </div>
        <div className="mc-head-actions">
          <a className="mc-btn" href={FULL_PDF} target="_blank" rel="noopener noreferrer">
            📄 Manual completo (PDF)
          </a>
          <button type="button" className="mc-btn" onClick={() => setShowWeb((v) => !v)}>
            {showWeb ? 'Ocultar manual web' : '🌐 Manual completo (web)'}
          </button>
          <button type="button" className="mc-btn" onClick={() => window.print()}>
            🖨️ Imprimir este instructivo
          </button>
        </div>
      </header>

      {showWeb && (
        <div className="mc-web">
          <iframe src={FULL_WEB} title="Manual de usuario completo de IncubApp" />
          <a href={FULL_WEB} target="_blank" rel="noopener noreferrer">
            Abrir en otra pestaña ↗
          </a>
        </div>
      )}

      <label className="mc-search">
        <span className="mc-sr">Buscar en los manuales</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar: remisión, OT, traslado, broiler, contraseña…" />
      </label>

      <div className="mc-layout">
        <nav className="mc-nav" aria-label="Instructivos">
          <p className="mc-nav-label">Tu perfil</p>
          {own.map((id) => {
            const m = manualById(id)
            return (
              <button key={id} type="button" className={id === current && !query ? 'active' : ''} onClick={() => pick(id)}>
                <span aria-hidden="true">{m.icon}</span> {m.title}
              </button>
            )
          })}
          <p className="mc-nav-label">Otros perfiles</p>
          {others.map((id) => {
            const m = manualById(id)
            return (
              <button key={id} type="button" className={id === current && !query ? 'active' : ''} onClick={() => pick(id)}>
                <span aria-hidden="true">{m.icon}</span> {m.title}
              </button>
            )
          })}
        </nav>

        <article className="mc-body">
          {query ? (
            results.length === 0 ? (
              <p className="mc-empty">No hay pasos que digan «{query}».</p>
            ) : (
              results.map(({ manual: m, section }, i) => (
                <div key={i}>
                  <button type="button" className="mc-from" onClick={() => pick(m.id)}>
                    {m.icon} {m.title} ›
                  </button>
                  <Section section={section} onNavigate={onNavigate} />
                </div>
              ))
            )
          ) : (
            <>
              <h2 className="mc-title">
                <span aria-hidden="true">{manual.icon}</span> {manual.title}
              </h2>
              <p className="mc-aud">Para: {manual.audience}</p>
              {manual.sections.map((s) => (
                <Section key={s.title} section={s} onNavigate={onNavigate} />
              ))}
            </>
          )}
        </article>
      </div>
    </div>
  )
}
