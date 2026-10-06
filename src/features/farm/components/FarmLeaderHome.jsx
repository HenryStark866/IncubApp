/**
 * Inicio del líder de granja: SOLO su sede (p. ej. G-GRANJA LA FE) y su gente.
 * Nada de la planta ni de otras granjas: sus herramientas, su equipo (personas
 * asignadas a la sede + galponeros) y el Plan AM de la sede con instructivos y manuales.
 * Henry Stark Desarrollador
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { ROLE_LABEL } from '../../../lib/roles'
import { isoWeekOf } from '../../../lib/planCompliance'
import { manualsForSede, sedeOfSite } from '../../../lib/planManuals'
import annualPlan from '../../../data/annualMaintenancePlanData.json'
import PlanAmCenter from '../../maintenance/components/PlanAmCenter'
import '../../shift/components/ShiftHome.css'
import '../../maintenance/components/PlanAmCenter.css'

/** Herramientas del líder de granja, en el orden en que las usa. */
const TOOL_HINTS = {
  'plan-am': 'Actividades, instructivos y manuales',
  granjas: 'Plano y galpones de la granja',
  produccion: 'Lotes en levante y producción',
  huevos: 'Reportes diarios de huevo',
  veterinaria: 'Vacunas, medicina y pruebas',
  inventarios: 'Inventario del área',
  reportes: 'Reportes del área',
  asistencia: 'Mi asistencia',
  misionales: 'Desplazamientos',
  accesos: 'Solicitar acceso a otro módulo',
}
const TOOL_ORDER = Object.keys(TOOL_HINTS)

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

function useSiteTeam(orgId, userId, site) {
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    if (!orgId) return undefined
    const load = async () => {
      setLoading(true)
      let res = await supabase
        .from('organization_members')
        .select('user_id, role, area, site_id, profiles ( full_name, email, phone )')
        .eq('org_id', orgId)
      // Sin la columna site_id (migración pendiente) se muestran solo los galponeros.
      if (res.error) {
        res = await supabase.from('organization_members').select('user_id, role, area, profiles ( full_name, email, phone )').eq('org_id', orgId)
      }
      if (!active) return
      const rows = (res.data || []).filter(
        (m) => m.user_id !== userId && ((site?.id && m.site_id === site.id) || m.role === 'barn_operator')
      )
      setTeam(rows)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [orgId, userId, site?.id])
  return { team, loading }
}

export default function FarmLeaderHome({ orgId, userId, userName, site, navItems = [], onNavigate }) {
  const sede = sedeOfSite(site) || 'GRANJA LA FE'
  const siteName = site?.name || 'G-GRANJA LA FE'
  const { team, loading } = useSiteTeam(orgId, userId, site)

  const week = isoWeekOf(new Date()).week
  const tasks = useMemo(() => (annualPlan.tasks || []).filter((t) => t.sede === sede), [sede])
  const thisWeek = tasks.filter((t) => (t.cronograma?.weeks || []).includes(week))
  const critical = thisWeek.filter((t) => t.isCriticalSecurity).length
  const manuals = manualsForSede(sede)

  const tools = useMemo(() => {
    const ids = new Set(navItems.map((i) => i.id))
    return TOOL_ORDER.filter((id) => ids.has(id)).map((id) => ({ id, label: navItems.find((i) => i.id === id)?.label || id, hint: TOOL_HINTS[id] }))
  }, [navItems])

  const groups = useMemo(() => {
    const map = new Map()
    for (const m of team) {
      const label = ROLE_LABEL[m.role] || m.role
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(m)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [team])

  const firstName = String(userName || '').split(/\s+/)[0] || ''

  return (
    <div className="sh-root pa-root">
      <header className="sh-header">
        <p className="sh-eyebrow">Líder de granja · {siteName}</p>
        <h1 className="sh-title">Hola{firstName ? `, ${firstName}` : ''}</h1>
      </header>
      <div className="sh-body">
        <section className="sh-hero sh-card-pad" aria-label="Resumen de la semana">
          <span className="sh-kicker">Semana {week}</span>
          <div className="fl-kpis">
            <div className="fl-kpi"><strong>24</strong><span>galpones (12 producción · 12 levante)</span></div>
            <div className="fl-kpi"><strong>{thisWeek.length}</strong><span>actividades del Plan AM esta semana</span></div>
            <div className="fl-kpi"><strong>{critical}</strong><span>críticas de seguridad esta semana</span></div>
            <div className="fl-kpi"><strong>{team.length}</strong><span>personas en mi equipo</span></div>
          </div>
        </section>

        {tools.length > 0 && (
          <>
            <div className="sh-section-head">
              <h2 className="sh-h2">Mis herramientas</h2>
              <span className="sh-count">también en el menú ☰</span>
            </div>
            <div className="fl-tools">
              {tools.map((t) => (
                <button key={t.id} type="button" className="fl-tool" onClick={() => onNavigate?.(t.id)}>
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sh-section-head">
          <h2 className="sh-h2">Mi equipo</h2>
          <span className="sh-count">{loading ? 'cargando…' : `${team.length} personas`}</span>
        </div>
        <div className="sh-card">
          {!loading && team.length === 0 && <p className="sh-empty">Aún no hay personas asignadas a {siteName}.</p>}
          {groups.map(([label, people]) => (
            <div key={label}>
              <p className="sh-kicker pa-team-group">{label}</p>
              <ul className="sh-list">
                {people.map((m) => {
                  const name = m.profiles?.full_name || m.profiles?.email || 'Sin nombre'
                  const phone = m.profiles?.phone
                  return (
                    <li key={m.user_id} className="fl-person">
                      <span className="fl-avatar" aria-hidden="true">{initials(name)}</span>
                      <span className="sh-row-main">
                        <span className="sh-row-title">{name}</span>
                        <span className="sh-row-sub">{m.profiles?.email || ''}</span>
                      </span>
                      {phone && <a className="fl-contact" href={`tel:${phone}`}>Llamar</a>}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="sh-section-head">
          <h2 className="sh-h2">Plan AM de la granja</h2>
          <span className="sh-count">{tasks.length} actividades · {manuals.length} documentos</span>
        </div>
        <PlanAmCenter sede={sede} lockSede embedded />
      </div>
    </div>
  )
}
