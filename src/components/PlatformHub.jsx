/**
 * Hub de plataforma IncubApp / CDH Maker (no menú de cliente).
 * Flujo: listar empresas → elegir o crear → construir desde plantilla base.
 */

import { BRAND, FOUNDER } from '../lib/brandIdentity'
import { DEFAULT_CLIENT_TEMPLATE, listClientTemplates } from '../lib/clientMenuTemplate'

export default function PlatformHub({ onNavigate, orgCount = 0, onSelectTemplate }) {
  const templates = listClientTemplates()

  return (
    <div className="card wide platform-hub">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p className="hint" style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            CDH Maker · consola SaaS
          </p>
          <h2 style={{ margin: '4px 0 0' }}>{BRAND.productName} · Plataforma</h2>
        </div>
        <img src={BRAND.assets.mark} alt="" width={48} height={48} />
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        Usted opera el <strong>SaaS</strong> (CDH Maker), no como empleado de un cliente. Cada
        empresa es un tenant aislado. El menú operativo de planta/granja vive <strong>dentro</strong>{' '}
        de cada compañía elegida.
      </p>

      <h3 style={{ margin: '18px 0 8px' }}>Flujo de trabajo</h3>
      <ol className="landing-list">
        <li>
          Abra <strong>Empresas y usuarios</strong>: vea la lista de tenants, cree uno nuevo o edite
          el existente.
        </li>
        <li>
          Toda empresa nueva nace con la <strong>estructura base</strong> (
          <code>{DEFAULT_CLIENT_TEMPLATE.id}</code> v{DEFAULT_CLIENT_TEMPLATE.version}): menú,
          módulos y roles sugeridos.
        </li>
        <li>
          En la barra superior, <strong>Elegir compañía</strong> → entra en modo desarrollador de
          esa empresa (construir, depurar, ver como rol).
        </li>
        <li>
          Cuando adecúe la estructura del producto, vaya a <strong>Plantillas</strong> y publique la
          base para subir versión y sincronizar metadata.
        </li>
      </ol>

      <div className="landing-grid3" style={{ marginTop: 16 }}>
        <article className="landing-card">
          <h3>1. Empresas</h3>
          <p>
            {orgCount > 0
              ? `${orgCount} empresa(s) en el SaaS.`
              : 'Aún no hay tenants. Cree el primero.'}
          </p>
          <button
            type="button"
            className="primary small"
            style={{ marginTop: 10 }}
            onClick={() => onNavigate?.('admin')}
          >
            Lista · crear · editar
          </button>
        </article>
        <article className="landing-card">
          <h3>2. Estructura base</h3>
          <p>
            {DEFAULT_CLIENT_TEMPLATE.name}. Menú y dominios que se aplican al crear y se actualizan
            al publicar.
          </p>
          <button
            type="button"
            className="ghost small"
            style={{ marginTop: 10 }}
            onClick={() => onNavigate?.('platform-templates')}
          >
            Plantillas
          </button>
        </article>
        <article className="landing-card">
          <h3>3. Desarrollo</h3>
          <p>Studio UI, módulos personalizados y herramientas técnicas del producto.</p>
          <button
            type="button"
            className="ghost small"
            style={{ marginTop: 10 }}
            onClick={() => onNavigate?.('diseno')}
          >
            Studio UI
          </button>
        </article>
      </div>

      <section style={{ marginTop: 22 }}>
        <h3 style={{ margin: '0 0 8px' }}>Plantilla activa en código</h3>
        <div className="admin-list">
          {templates.map((t) => (
            <div key={t.id} className="admin-card">
              <div className="admin-row">
                <div className="admin-row-main">
                  <strong>{t.name}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {t.id} · v{t.version} · {t.menu.length} ítems
                  </span>
                </div>
                <button type="button" className="chip ghost" onClick={() => onSelectTemplate?.(t)}>
                  Detalle
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="hint" style={{ marginTop: 16 }}>
        {FOUNDER.name} · {FOUNDER.title} de {FOUNDER.company} · producto {BRAND.productName}
      </p>
    </div>
  )
}
