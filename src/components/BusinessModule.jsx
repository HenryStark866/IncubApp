/**
 * Módulo de negocio IncubApp — administración del servicio SaaS.
 * Roles, herramientas y garantías para prestar el servicio con máxima certeza.
 * Henry Stark · CEO CDH Maker
 */

import { useMemo, useState } from 'react'
import {
  BUSINESS_MODEL_VERSION,
  BUSINESS_TOOLS,
  CLIENT_LIFECYCLE,
  GO_LIVE_CHECKLIST,
  PLATFORM_STAFF_ROLES,
  SERVICE_PACKAGES,
  SERVICE_PILLARS,
  SUPPORT_SEVERITIES,
  SYSTEM_LAYERS,
  businessModuleSummary,
} from '../lib/businessModule'
import { BRAND } from '../lib/brandIdentity'
import { DEFAULT_CLIENT_TEMPLATE } from '../lib/clientMenuTemplate'

const SECTIONS = [
  { id: 'overview', label: 'Visión del servicio' },
  { id: 'roles', label: 'Roles de plataforma' },
  { id: 'tools', label: 'Herramientas' },
  { id: 'guarantees', label: 'Garantías' },
  { id: 'lifecycle', label: 'Ciclo del cliente' },
  { id: 'golive', label: 'Checklist go-live' },
  { id: 'support', label: 'Soporte y SLA' },
  { id: 'packages', label: 'Empaques' },
]

export default function BusinessModule({ onNavigate, orgCount = 0 }) {
  const [section, setSection] = useState('overview')
  const [checked, setChecked] = useState(() => ({}))
  const summary = useMemo(() => businessModuleSummary(), [])

  const toggleCheck = (id) => setChecked((c) => ({ ...c, [id]: !c[id] }))
  const goLiveDone = GO_LIVE_CHECKLIST.filter((i) => checked[i.id]).length

  return (
    <div className="card wide business-module">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p className="hint" style={{ margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Módulo de negocio · v{BUSINESS_MODEL_VERSION}
          </p>
          <h2 style={{ margin: '4px 0 0' }}>
            {BRAND.productName}: administrar y garantizar el servicio
          </h2>
          <p className="hint" style={{ margin: '6px 0 0' }}>
            {BRAND.slogan}. Este módulo organiza <strong>cómo se presta el SaaS</strong>, no el menú
            de planta del cliente.
          </p>
        </div>
        <img src={BRAND.assets.mark} alt="" width={48} height={48} />
      </div>

      <div className="landing-grid3" style={{ marginTop: 12 }}>
        <div className="landing-card">
          <h3>Tenants</h3>
          <p>{orgCount} empresa(s) en el SaaS</p>
        </div>
        <div className="landing-card">
          <h3>Plantilla</h3>
          <p>
            <code>{summary.defaultTemplate}</code>
          </p>
        </div>
        <div className="landing-card">
          <h3>Go-live (sesión)</h3>
          <p>
            {goLiveDone}/{summary.goLiveItems} ítems marcados
          </p>
        </div>
      </div>

      <div className="tabs" role="tablist" style={{ marginTop: 16, flexWrap: 'wrap' }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            className={section === s.id ? 'tab active' : 'tab'}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <section style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Capas del sistema (no mezclar)</h3>
          <div className="landing-grid3">
            {SYSTEM_LAYERS.map((l) => (
              <article key={l.id} className="landing-card">
                <h3>{l.name}</h3>
                <p className="hint" style={{ margin: '0 0 6px' }}>
                  Dueño: {l.owner}
                </p>
                <p>{l.description}</p>
              </article>
            ))}
          </div>
          <h3 style={{ marginTop: 18 }}>Principio rector</h3>
          <ol className="landing-list">
            <li>
              <strong>CDH Maker</strong> posee y opera el producto {BRAND.productName}.
            </li>
            <li>
              Cada <strong>cliente</strong> es un tenant aislado con su menú operativo (plantilla
              Incubant).
            </li>
            <li>
              La <strong>garantía del servicio</strong> se mide con checklists, roles staff claros y
              herramientas de esta consola — no improvisando dentro del menú del cliente.
            </li>
          </ol>
          <div className="landing-cta-row" style={{ marginTop: 14 }}>
            <button type="button" className="primary" onClick={() => setSection('roles')}>
              Definir roles de plataforma
            </button>
            <button type="button" className="ghost" onClick={() => setSection('golive')}>
              Checklist go-live
            </button>
            <button type="button" className="ghost" onClick={() => onNavigate?.('admin')}>
              Empresas y usuarios
            </button>
          </div>
        </section>
      )}

      {section === 'roles' && (
        <section style={{ marginTop: 14 }}>
          <p className="hint">
            Roles del equipo que <strong>presta</strong> IncubApp. No son roles de organización del
            cliente (esos viven en membership del tenant).
          </p>
          <div className="admin-list" style={{ marginTop: 10 }}>
            {PLATFORM_STAFF_ROLES.map((r) => (
              <div key={r.id} className="admin-card">
                <div className="admin-row" style={{ flexWrap: 'wrap' }}>
                  <div className="admin-row-main">
                    <strong>{r.label}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      id: {r.id}
                      {r.person ? ` · ${r.person}` : ''} · platform_role: {r.platform_role}
                    </span>
                  </div>
                  <span className="pill role">Staff</span>
                </div>
                <ul className="landing-list" style={{ marginTop: 8 }}>
                  {r.powers.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className="hint" style={{ margin: '8px 0 0' }}>
                  Herramientas: {r.tools.join(' · ')}
                </p>
              </div>
            ))}
          </div>
          <p className="msg ok" style={{ marginTop: 12 }}>
            En la práctica actual, el acceso técnico de staff se concentra en{' '}
            <code>profiles.platform_role = admin</code>. Los roles de esta tabla son el{' '}
            <strong>modelo de responsabilidad</strong> del negocio; se pueden especializar después
            con más valores de platform_role.
          </p>
        </section>
      )}

      {section === 'tools' && (
        <section style={{ marginTop: 14 }}>
          <p className="hint">
            Catálogo de herramientas de la consola para administrar y garantizar el servicio.
          </p>
          {['Administración del servicio', 'Ingeniería del servicio', 'Prestación del servicio'].map(
            (group) => (
              <div key={group} style={{ marginTop: 14 }}>
                <p className="component-title" style={{ margin: '0 0 8px' }}>
                  {group}
                </p>
                <div className="landing-grid2">
                  {BUSINESS_TOOLS.filter((t) => t.group === group).map((t) => (
                    <article key={t.id} className="landing-card">
                      <h3>{t.label}</h3>
                      <p>{t.description}</p>
                      {t.tab && (
                        <button
                          type="button"
                          className="primary small"
                          style={{ marginTop: 10 }}
                          onClick={() => onNavigate?.(t.tab)}
                        >
                          Abrir
                        </button>
                      )}
                      {t.action === 'company_picker' && (
                        <p className="hint" style={{ marginTop: 8 }}>
                          Usa la barra superior <strong>Elegir compañía</strong>.
                        </p>
                      )}
                      {t.requiresTenant && (
                        <p className="hint" style={{ marginTop: 6 }}>
                          Requiere compañía seleccionada.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )
          )}
        </section>
      )}

      {section === 'guarantees' && (
        <section style={{ marginTop: 14 }}>
          <p className="hint">Pilares de garantía del servicio {BRAND.productName}.</p>
          <div className="landing-grid2" style={{ marginTop: 10 }}>
            {SERVICE_PILLARS.map((p) => (
              <article key={p.id} className="landing-card">
                <h3>{p.title}</h3>
                <p>
                  <strong>Garantía:</strong> {p.guarantee}
                </p>
                <ul className="landing-list" style={{ marginTop: 8 }}>
                  {p.controls.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      {section === 'lifecycle' && (
        <section style={{ marginTop: 14 }}>
          <p className="hint">
            Ciclo de vida del cliente desde el negocio SaaS. Plantilla operativa:{' '}
            <code>{DEFAULT_CLIENT_TEMPLATE.id}</code>.
          </p>
          <div className="admin-list" style={{ marginTop: 10 }}>
            {CLIENT_LIFECYCLE.map((s, i) => (
              <div key={s.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main">
                    <strong>
                      {i + 1}. {s.label}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {s.description}
                    </span>
                  </div>
                  <span className="pill status idle">{s.staffOwner}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'golive' && (
        <section style={{ marginTop: 14 }}>
          <p className="hint">
            Marca en esta sesión los ítems cumplidos antes de declarar go-live de un cliente. No se
            guarda en servidor aún (playbook operativo).
          </p>
          <p className="hint">
            Progreso: <strong>{goLiveDone}/{GO_LIVE_CHECKLIST.length}</strong>
          </p>
          <div className="admin-list" style={{ marginTop: 10 }}>
            {GO_LIVE_CHECKLIST.map((item) => (
              <label
                key={item.id}
                className="admin-row compact"
                style={{ cursor: 'pointer', gap: 10, alignItems: 'flex-start' }}
              >
                <input
                  type="checkbox"
                  checked={!!checked[item.id]}
                  onChange={() => toggleCheck(item.id)}
                  style={{ marginTop: 4 }}
                />
                <span className="admin-row-main">
                  <strong style={{ fontWeight: checked[item.id] ? 600 : 500 }}>{item.label}</strong>
                </span>
              </label>
            ))}
          </div>
          {goLiveDone === GO_LIVE_CHECKLIST.length && (
            <p className="msg ok" style={{ marginTop: 12 }}>
              Checklist completo en esta sesión. Puedes pasar el tenant a fase «Operación asistida».
            </p>
          )}
        </section>
      )}

      {section === 'support' && (
        <section style={{ marginTop: 14 }}>
          <p className="hint">Severidades y tiempos de respuesta objetivo del servicio.</p>
          <div className="landing-grid2" style={{ marginTop: 10 }}>
            {SUPPORT_SEVERITIES.map((s) => (
              <article key={s.id} className="landing-card">
                <h3>
                  {s.id} · {s.label}
                </h3>
                <p>
                  <strong>SLA:</strong> {s.sla}
                </p>
                <p className="hint">{s.examples}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {section === 'packages' && (
        <section style={{ marginTop: 14 }}>
          <div className="landing-grid3">
            {SERVICE_PACKAGES.map((p) => (
              <article key={p.id} className="landing-card landing-plan">
                <h3>{p.name}</h3>
                <ul className="landing-list">
                  {p.includes.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <p className="hint" style={{ marginTop: 8 }}>
                  Pilares: {p.guaranteeFocus.join(', ')}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
