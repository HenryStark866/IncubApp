/**
 * =============================================================================
 * ARCHIVO: src/components/ReceptionScaffold.jsx
 * PROPÓSITO: Piezas comunes de las pantallas del operario de recepción.
 *   - RxHeader: título, explicación y acciones de cada pantalla.
 *   - RxPending: pantalla «en construcción» HONESTA: dice que todavía no guarda,
 *     qué va a hacer (funciones, campos del formato) y a dónde ir mientras tanto.
 *     Reemplaza los formularios que mostraban «✓ registrado» sin guardar nada
 *     (05-10-2026): un operario no puede creer que dejó una auditoría o una
 *     autorización que en realidad se perdió.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

export function RxHeader({ icon, title, hint, children }) {
  return (
    <header className="rx-head">
      <div>
        <h2>
          {icon ? <span aria-hidden="true">{icon} </span> : null}
          {title}
        </h2>
        {hint ? <p className="hint">{hint}</p> : null}
      </div>
      {children ? <div className="rx-head-actions">{children}</div> : null}
    </header>
  )
}

/**
 * @param {object} p
 * @param {string[]} p.functions  Lo que hará la pantalla (lenguaje del operario).
 * @param {string[]} [p.fields]   Campos propuestos del formato (a confirmar con el formato oficial).
 * @param {{tab: string, label: string}[]} [p.links]  Pantallas que ya funcionan, para usar mientras tanto.
 * @param {(tab: string) => void} [p.onNavigate]
 */
export function RxPending({ functions = [], fields = [], links = [], onNavigate }) {
  return (
    <section className="card wide rx-pending" aria-live="polite">
      <div className="rx-pending-banner">
        <strong>Pantalla en construcción.</strong> Todavía no guarda datos: se está armando con el formato
        oficial y las actividades del operario de recepción.
      </div>
      <div className="rx-grid-2">
        <div>
          <h3>Lo que va a hacer</h3>
          <ul className="rx-list">
            {functions.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        {fields.length > 0 && (
          <div>
            <h3>Campos propuestos</h3>
            <p className="hint">Se confirman contra el formato en papel antes de habilitar el guardado.</p>
            <ul className="rx-chips">
              {fields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {links.length > 0 && onNavigate && (
        <div className="rx-pending-links">
          <span className="hint">Mientras tanto:</span>
          {links.map((l) => (
            <button key={l.tab} type="button" className="ghost small" onClick={() => onNavigate(l.tab)}>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
