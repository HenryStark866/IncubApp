/**
 * Identidad de producto IncubApp (no del cliente).
 */

import { ABOUT, BRAND, FOUNDER, GO_TO_MARKET, MISSION, VALUES, VISION } from '../lib/brandIdentity'

export default function PlatformProductPanel() {
  return (
    <div className="card wide">
      <div className="card-head" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>{BRAND.productName} · Producto e identidad</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {FOUNDER.name} · {FOUNDER.title} de {FOUNDER.company}
          </p>
        </div>
        <img src={BRAND.assets.logo} alt={BRAND.productName} style={{ height: 48, width: 'auto' }} />
      </div>

      <p className="landing-lead" style={{ marginTop: 12 }}>
        {BRAND.slogan}
      </p>
      <p className="landing-prose">{BRAND.shortPitch}</p>

      <div className="landing-mv" style={{ marginTop: 16 }}>
        <div>
          <h3>Misión</h3>
          <p>{MISSION}</p>
        </div>
        <div>
          <h3>Visión</h3>
          <p>{VISION}</p>
        </div>
      </div>

      <h3 style={{ marginTop: 18 }}>Acerca de</h3>
      {ABOUT.paragraphs.map((p) => (
        <p key={p.slice(0, 24)} className="landing-prose">
          {p}
        </p>
      ))}

      <h3 style={{ marginTop: 18 }}>Valores</h3>
      <div className="landing-grid3">
        {VALUES.map((v) => (
          <article key={v.title} className="landing-card">
            <h3>{v.title}</h3>
            <p>{v.text}</p>
          </article>
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>{GO_TO_MARKET.title}</h3>
      <div className="landing-grid2">
        {GO_TO_MARKET.segments.map((s) => (
          <article key={s.who} className="landing-card">
            <h3>{s.who}</h3>
            <p>{s.why}</p>
            <p className="hint">{s.entry}</p>
          </article>
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>Empaques</h3>
      <div className="landing-grid3">
        {GO_TO_MARKET.packaging.map((p) => (
          <article key={p.name} className="landing-card landing-plan">
            <h3>{p.name}</h3>
            <p>{p.includes}</p>
          </article>
        ))}
      </div>

      <h3 style={{ marginTop: 18 }}>Assets de marca (producto)</h3>
      <ul className="landing-list">
        {Object.entries(BRAND.assets).map(([k, v]) => (
          <li key={k}>
            <code>{k}</code>: {v}
          </li>
        ))}
      </ul>
      <p className="hint">
        Assets de clientes (Incubant, etc.) viven en <code>/client-brands/</code> y no se usan en esta
        consola.
      </p>
    </div>
  )
}
