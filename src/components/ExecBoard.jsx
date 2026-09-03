/**
 * =============================================================================
 * ARCHIVO: src/components/ExecBoard.jsx
 * PROPÓSITO: Componente UI «ExecBoard»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Piezas reutilizables del tablero ejecutivo (admin resumen + gerencia).
 */

export function ExecStatus({ tone = 'ok', children }) {
  return (
    <span className={`exec-status ${tone}`}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  )
}

export function ExecHero({
  kicker = 'Tablero ejecutivo',
  title,
  subtitle,
  status,
  meta,
  actions,
}) {
  return (
    <header className="exec-hero">
      <div className="exec-hero-main">
        {kicker && <p className="exec-kicker">{kicker}</p>}
        {title && <h2>{title}</h2>}
        {subtitle && <p className="exec-hero-sub">{subtitle}</p>}
      </div>
      {(status || meta || actions) && (
        <div className="exec-hero-side">
          {status}
          {actions}
          {meta && <span className="exec-meta-line">{meta}</span>}
        </div>
      )}
    </header>
  )
}

export function ExecGroup({ title, hint, children }) {
  return (
    <section className="exec-group">
      <div className="exec-group-head">
        <h3 className="exec-group-title">{title}</h3>
        {hint && <p className="exec-group-hint">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function ExecKpiGrid({ items = [] }) {
  return (
    <div className="exec-kpi-grid">
      {items.map((k, i) => (
        <div
          // Índice en la clave: los esqueletos de carga repiten label
          // ("Cargando") mientras no hay datos reales todavía, y una clave
          // duplicada rompía la identidad de los hijos en React.
          key={`${k.label}-${i}`}
          className={`exec-kpi${k.tone ? ` ${k.tone}` : k.warn ? ' warn' : k.ok ? ' ok' : ''}`}
        >
          <span className="exec-kpi-value">{k.value}</span>
          <span className="exec-kpi-label">{k.label}</span>
          {k.sub != null && k.sub !== '' && <span className="exec-kpi-sub">{k.sub}</span>}
        </div>
      ))}
    </div>
  )
}

export function ExecPanel({ title, action, children, className = '' }) {
  return (
    <section className={`exec-panel ${className}`.trim()}>
      <div className="exec-panel-head">
        <h3 className="exec-group-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ExecEmpty({ ok, children }) {
  return <p className={`exec-empty${ok ? ' ok' : ''}`}>{children}</p>
}

export function ExecList({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="exec-list">
      {items.map((it) => (
        <div
          key={it.id ?? `${it.title}-${it.meta}`}
          className={`exec-list-item${it.tone ? ` ${it.tone}` : it.warn ? ' warn' : ''}`}
        >
          <div className="exec-list-main">
            <strong>{it.title}</strong>
            {it.meta && <span>{it.meta}</span>}
          </div>
          {(it.side || it.action) && (
            <div className="exec-list-side">
              {it.side}
              {it.action}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function ExecFeatures({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="exec-features">
      {items.map((f) => (
        <div key={f} className="exec-feature">
          <span className="exec-feature-mark" aria-hidden="true" />
          <span>{f}</span>
        </div>
      ))}
    </div>
  )
}

export function ExecLinks({ links = [], onNavigate }) {
  if (!links.length) return null
  return (
    <div className="exec-links">
      {links.map((l) => (
        <button
          key={l.tab || l.label}
          type="button"
          className="chip ghost"
          onClick={() => onNavigate?.(l.tab)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

/** Estado global a partir de contadores de atención */
export function healthTone({ pending = 0, alarms = 0, critical = 0 } = {}) {
  if (alarms > 0 || critical > 0) return 'danger'
  if (pending > 0) return 'warn'
  return 'ok'
}

export function healthLabel({ pending = 0, alarms = 0, critical = 0 } = {}) {
  if (alarms > 0) return `${alarms} alarma${alarms === 1 ? '' : 's'} activa${alarms === 1 ? '' : 's'}`
  if (critical > 0) return `${critical} OT prioritaria${critical === 1 ? '' : 's'}`
  if (pending > 0) return `${pending} pendiente${pending === 1 ? '' : 's'} de revisión`
  return 'Operación estable'
}
