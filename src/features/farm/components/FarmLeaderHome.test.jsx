// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const LA_FE = { id: 'fe', name: 'G-GRANJA LA FE', code: 'G-FE' }
const miembros = [
  { user_id: 'lider', role: 'coordinator', area: 'farm', site_id: 'fe', profiles: { full_name: 'Dario León Villada' } },
  { user_id: 'j1', role: 'maintenance_auxiliary', area: 'general', site_id: 'fe', profiles: { full_name: 'Jorge Arley Vázquez Araque', phone: '300' } },
  { user_id: 'j2', role: 'maintenance_auxiliary', area: 'general', site_id: 'fe', profiles: { full_name: 'Johan Daniel Orrego Flórez' } },
  { user_id: 'g1', role: 'barn_operator', area: 'general', site_id: null, profiles: { full_name: 'Galponero Uno' } },
  { user_id: 'p1', role: 'maintenance_auxiliary', area: 'general', site_id: null, profiles: { full_name: 'Auxiliar De Planta' } },
  { user_id: 'p2', role: 'coordinator', area: 'plant', site_id: null, profiles: { full_name: 'Líder De Planta' } },
]
const query = { select: () => query, eq: async () => ({ data: miembros, error: null }) }
vi.mock('../../../lib/supabase', () => ({ supabase: { from: () => query } }))

const { default: FarmLeaderHome } = await import('./FarmLeaderHome')

let host, root
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(text))

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('inicio del líder de granja', () => {
  it('muestra solo su granja, su equipo y sus herramientas', async () => {
    const onNavigate = vi.fn()
    const navItems = [{ id: 'plan-am', label: 'Plan AM y manuales' }, { id: 'produccion', label: 'Producción' }, { id: 'hoy', label: 'Hoy' }]
    await act(async () => {
      root.render(<FarmLeaderHome orgId="o" userId="lider" userName="Dario León Villada" site={LA_FE} navItems={navItems} onNavigate={onNavigate} />)
    })
    await flush()
    const text = host.textContent
    expect(text).toContain('Hola, Dario')
    expect(text).toContain('G-GRANJA LA FE')
    expect(text).toContain('Jorge Arley Vázquez Araque')
    expect(text).toContain('Johan Daniel Orrego Flórez')
    expect(text).toContain('Galponero Uno')
    expect(text).not.toContain('Auxiliar De Planta')
    expect(text).not.toContain('Líder De Planta')
    expect(text).not.toMatch(/PLANTA INCUBANT|PI-\d{3}/)
    act(() => button('Producción').click())
    expect(onNavigate).toHaveBeenCalledWith('produccion')
  })

  it('el plan trae solo tareas de La Fe y abre el instructivo con el manual', async () => {
    await act(async () => {
      root.render(<FarmLeaderHome orgId="o" userId="lider" userName="Dario" site={LA_FE} navItems={[]} />)
    })
    await flush()
    act(() => button('Plan completo').click())
    const codes = [...host.querySelectorAll('.pa-code')].map((n) => n.textContent)
    expect(codes.length).toBe(58)
    expect(codes.every((c) => c.startsWith('LF-'))).toBe(true)
    act(() => [...host.querySelectorAll('.sh-row')].find((b) => b.textContent.includes('LF-162')).click())
    const modal = document.body.querySelector('.sig-modal')
    expect(modal.textContent).toContain('Cómo se hace')
    expect(modal.textContent).toContain('Seguridad')
    expect(modal.textContent).toContain('MAN-LF-06')
  })
})
