import { describe, it, expect } from 'vitest'
import { manualKind, manualsForSede, manualsForTask, sedeOfSite } from '../planManuals'
import { effectiveTabsFor } from '../privacyScopes'
import annualPlan from '../../data/annualMaintenancePlanData.json'

const doc = (name, folder = 'MANUALES GRANJA LA FE', type = 'document') => ({
  id: name,
  file_name: name,
  file_type: type,
  sourcePath: `../assets/manuales/sig/${folder}/${name}`,
  url: `/x/${name}`,
})
const LIBRARY = [
  doc('MAN-LF-01 Banda recolectora de huevo.docx'),
  doc('MAN-LF-03 Sistema de alimentación - silos, tolvas, canal y cadena.docx'),
  doc('MAN-LF-06 Tableros eléctricos, motobombas, tanques de agua y chumaceras.docx'),
  doc('Indicaciones de cada actividad - Plan AM Granja La Fe.docx'),
  doc('PRGMAT01 Programa de mantenimiento preventivo.xlsx', 'PROCEDIMIENTOS', 'spreadsheet'),
  doc('PRGMAT01 Programa de mantenimiento preventivo.pdf', 'PROCEDIMIENTOS', 'pdf'),
  doc('EQ-003__bomba.pdf', 'mantum', 'pdf'),
]

describe('manuales del Plan AM', () => {
  it('la sede asignada «G-GRANJA LA FE» es la sede «GRANJA LA FE» del plan', () => {
    expect(sedeOfSite({ name: 'G-GRANJA LA FE' })).toBe('GRANJA LA FE')
    expect(sedeOfSite({ name: 'PLANTA INCUBANT' })).toBe('PLANTA INCUBANT')
    expect(sedeOfSite(null)).toBe(null)
  })

  it('una sede trae sus manuales, el instructivo y el programa en Excel; nada de la planta', () => {
    const names = manualsForSede('GRANJA LA FE', LIBRARY).map((m) => m.file_name)
    expect(names).toHaveLength(5)
    expect(names).toContain('PRGMAT01 Programa de mantenimiento preventivo.xlsx')
    expect(names).not.toContain('EQ-003__bomba.pdf')
    expect(manualsForSede('PLANTA INCUBANT', LIBRARY)).toEqual([])
  })

  it('cada tarea abre el manual que cita', () => {
    const t = { sede: 'GRANJA LA FE', manual: 'MAN-LF-03 §8.3' }
    expect(manualsForTask(t, LIBRARY).map((m) => m.file_name)).toEqual(['MAN-LF-03 Sistema de alimentación - silos, tolvas, canal y cadena.docx'])
    expect(manualsForTask({ sede: 'GRANJA LA FE', manual: 'Todos (MAN-LF-01 a 06)' }, LIBRARY)).toHaveLength(3)
    expect(manualKind(LIBRARY[3])).toBe('Instructivo')
  })

  it('todas las tareas de La Fe tienen instructivo técnico y manual', () => {
    const lf = annualPlan.tasks.filter((t) => t.sede === 'GRANJA LA FE')
    expect(lf.length).toBe(58)
    for (const t of lf) {
      expect(t.technicalSteps.length).toBeGreaterThan(0)
      expect(t.code).toMatch(/^LF-\d{3}$/)
    }
    // Rige desde la semana 42: no hay semanas anteriores que cobren incumplimiento.
    expect(lf.every((t) => (t.cronograma.weeks || []).every((w) => w >= 42))).toBe(true)
  })

  it('el Plan AM y manuales es del líder de granja y de mantenimiento, no del galponero', () => {
    expect(effectiveTabsFor({ role: 'coordinator', area: 'farm' }).has('plan-am')).toBe(true)
    expect(effectiveTabsFor({ role: 'maintenance_auxiliary', area: 'general' }).has('plan-am')).toBe(true)
    expect(effectiveTabsFor({ role: 'barn_operator', area: 'general' }).has('plan-am')).toBe(false)
  })
})
