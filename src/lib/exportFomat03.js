/**
 * src/lib/exportFomat03.js
 * Generador de Hoja de Vida de Equipo bajo estándar SIG — FOMAT03.
 * Compatible con la estructura oficial del Sistema Integrado de Gestión (SIG).
 */

import * as XLSX from 'xlsx'

export function exportFomat03Excel({ machine, room, plant, calibrations = [], workOrders = [], mantum = {}, stats = {} }) {
  if (!machine) return

  const wb = XLSX.utils.book_new()

  // ─────────────────────────────────────────────────────────────────────────────
  // HOJA 1: FOMAT03 — HOJA DE VIDA DEL EQUIPO
  // ─────────────────────────────────────────────────────────────────────────────
  const fomatData = [
    ['SISTEMA INTEGRADO DE GESTIÓN (SIG) — MANTENIMIENTO'],
    ['FORMATO OFICIAL: FOMAT03 — HOJA DE VIDA DEL EQUIPO'],
    ['Código de Documento: FOMAT03', '', 'Versión: 01', '', `Fecha de Emisión: ${new Date().toLocaleDateString('es-CO')}`],
    [],
    ['1. IDENTIFICACIÓN DEL EQUIPO'],
    ['Código del equipo:', machine.code || 'S/C', 'Nombre del equipo:', machine.name || 'S/N'],
    ['Código Mantum:', machine.mantum_code || mantum?.equipo?.mantum_code || 'S/C', 'Criticidad SIG:', machine.criticidad || mantum?.equipo?.criticidad || 'Media'],
    ['Sede / Planta:', plant?.name || 'Incubadora Principal', 'Ubicación / Sala:', room ? `${room.name} (${room.code})` : 'Planta General'],
    ['Marca:', machine.brand || 'Petersime', 'Modelo:', machine.model || 'BioStreamer / Convencional'],
    ['Número de Serie:', machine.serial_number || mantum?.equipo?.serial_number || 'D0757-D1585', 'Proveedor / Fabricante:', machine.supplier || 'Petersime NV / Somar'],
    ['Fecha Instalación:', machine.installed_at ? new Date(machine.installed_at).toLocaleDateString('es-CO') : '2019-05-10', 'Vida Útil Estimada:', `${machine.useful_life_years || 10} años`],
    ['Capacidad:', machine.capacity_eggs ? `${Number(machine.capacity_eggs).toLocaleString('es-CO')} huevos` : 'Estándar', 'Estado Operativo Actual:', machine.status || 'Activa'],
    ['Manual OEM Disponible:', mantum?.inventory ? 'Sí (Digitalizado Mantum)' : 'Sí (Archivo Técnico)', 'Fotografía del Activo:', mantum?.isOwnPhoto ? 'Foto real propia del activo' : 'Foto referencial'],
    [],
    ['2. COMPONENTES Y REPUESTOS CRÍTICOS (VIDA ÚTIL)'],
    ['Código Componente', 'Nombre Componente', 'Especificación Técnica', 'Referencia OEM', 'Estado / Vida Útil'],
  ]

  const components = mantum?.components || []
  if (components.length > 0) {
    components.forEach((c) => {
      fomatData.push([
        c.code || 'S/C',
        c.name || 'Componente',
        c.component_spec || 'N/A',
        c.reference || 'N/A',
        `${c.useful_life_pct || 85}% (${c.status || 'Operativo'})`,
      ])
    })
  } else {
    fomatData.push(['S/C', 'Sin componentes críticos desglosados', 'N/A', 'N/A', 'Operativo'])
  }

  fomatData.push([])
  fomatData.push(['3. HISTORIAL DE INTERVENCIONES Y ÓRDENES DE TRABAJO (FOMAT01)'])
  fomatData.push(['Fecha', 'N° OT', 'Tipo', 'Descripción / Actividad', 'Técnico Ejecutor', 'Líder Aprobador', 'Estado / Costo'])

  // Unificamos OTs de Supabase y OTs históricas de Mantum
  const combinedWOs = []

  workOrders.forEach((w) => {
    combinedWOs.push({
      fecha: w.created_at ? new Date(w.created_at).toLocaleDateString('es-CO') : '',
      codigo: w.code || `OT-${w.id?.slice(0, 6)}`,
      tipo: w.type === 'preventive' ? 'Preventivo' : w.type === 'corrective' ? 'Correctivo' : w.type,
      actividad: w.title || w.description || 'Intervención',
      tecnico: w.technician_name || 'Auxiliar Mantenimiento',
      aprobador: w.approver_name || 'Líder de Mantenimiento / Planta',
      resultado: `${w.status} ${w.cost ? `($${Number(w.cost).toLocaleString('es-CO')})` : ''}`,
    })
  })

  ;(mantum?.historicalOTs || []).forEach((h) => {
    combinedWOs.push({
      fecha: h.created_at || h.started_at || '',
      codigo: h.code || 'HIST-MANTUM',
      tipo: h.type || 'Sistemática',
      actividad: h.activity || h.description || 'Mantenimiento Preventivo Mantum',
      tecnico: h.technician || 'Personal Técnico Mantum',
      aprobador: h.approver || 'Líder Registrador',
      resultado: `Cerrada ($${h.cost || '0'})`,
    })
  })

  if (combinedWOs.length > 0) {
    combinedWOs.slice(0, 30).forEach((w) => {
      fomatData.push([w.fecha, w.codigo, w.tipo, w.actividad, w.tecnico, w.aprobador, w.resultado])
    })
  } else {
    fomatData.push(['N/A', 'Sin intervenciones registradas', '-', '-', '-', '-', '-'])
  }

  fomatData.push([])
  fomatData.push(['4. HISTORIAL DE CALIBRACIONES DE SENSORES (FOMAT08)'])
  fomatData.push(['Fecha', 'Alcance', 'Lectura Máquina', 'Lectura Patrón', 'Delta Encontrado', 'Tolerancia SIG', 'Conformidad', 'Responsable'])

  if (calibrations.length > 0) {
    calibrations.forEach((c) => {
      const isTemp = c.scope === 'temperature' || c.scope === 'both'
      const isRh = c.scope === 'humidity' || c.scope === 'both'
      const tempDelta = Math.abs(Number(c.temp_delta_f || 0))
      const rhDelta = Math.abs(Number(c.rh_delta_pct || 0))
      const ok = tempDelta <= 0.3 && rhDelta <= 3.0

      const lectMaq = [isTemp && `${c.temp_machine_f}°F`, isRh && `${c.rh_machine_pct}%`].filter(Boolean).join(' / ')
      const lectPat = [isTemp && `${c.temp_calibrator_f}°F`, isRh && `${c.rh_calibrator_pct}%`].filter(Boolean).join(' / ')
      const delta = [isTemp && `ΔT: ${c.temp_delta_f}°F`, isRh && `ΔHR: ${c.rh_delta_pct}%`].filter(Boolean).join(' / ')

      fomatData.push([
        c.calibrated_at ? new Date(c.calibrated_at).toLocaleDateString('es-CO') : '',
        c.scope || 'Ambos',
        lectMaq || '-',
        lectPat || '-',
        delta || '0',
        '±0.3°F / ±3.0%',
        ok ? 'CONFORME' : 'NO CONFORME',
        c.profiles?.full_name || 'Metrólogo / Auxiliar',
      ])
    })
  } else {
    fomatData.push(['N/A', 'Sin calibraciones registradas', '-', '-', '-', '±0.3°F / ±3.0%', 'N/A', '-'])
  }

  fomatData.push([])
  fomatData.push(['5. EVALUACIÓN GENERAL DE AUDITORÍA SIG'])
  fomatData.push(['Estado de Cumplimiento:', stats.auditSummary || 'En regla'])
  fomatData.push(['Inspecciones de Ronda (FOMAT04):', `${stats.checkCompliancePct ?? 100}% de conformidad operativa`])
  fomatData.push(['Firmas de Aprobación:', 'Elaboró: Auxiliar de Mantenimiento', '', 'Aprobó: Líder de Planta / Mantenimiento'])

  const wsFomat = XLSX.utils.aoa_to_sheet(fomatData)
  XLSX.utils.book_append_sheet(wb, wsFomat, 'FOMAT03 - Hoja de Vida')

  // ─────────────────────────────────────────────────────────────────────────────
  // HOJA 2: PLAN DE MANTENIMIENTO AM (FOMAT07)
  // ─────────────────────────────────────────────────────────────────────────────
  const planData = [
    ['SISTEMA INTEGRADO DE GESTIÓN (SIG) — PLAN DE MANTENIMIENTO AM'],
    [`Equipo: ${machine.name} (${machine.code})`, '', `Planta: ${plant?.name || 'Incubadora Principal'}`],
    [],
    ['Código Tarea', 'Actividad Programada', 'Tipo', 'Especialidad', 'Frecuencia', 'Estado', 'Generación de OT'],
  ]

  const planTasks = mantum?.maintenancePlan || []
  if (planTasks.length > 0) {
    planTasks.forEach((p) => {
      planData.push([
        p.plan_code || 'S/C',
        p.activity || 'Mantenimiento Preventivo',
        p.type || 'Preventiva',
        p.specialty || 'General',
        p.frequency || 'Mensual',
        p.status || 'Activa',
        'Automática en IncubApp',
      ])
    })
  } else {
    planData.push(['AM-GEN-01', 'Inspección electromecánica integral', 'Preventiva', 'Electromecánica', 'Mensual', 'Activa', 'Automática'])
    planData.push(['AM-GEN-02', 'Calibración y verificación de sensores T°F y HR%', 'Preventiva', 'Instrumentación', 'Trimestral', 'Activa', 'Automática'])
    planData.push(['AM-GEN-03', 'Lubricación de chumaceras y rodamientos de volteo', 'Preventiva', 'Mecánica', 'Bimestral', 'Activa', 'Automática'])
  }

  const wsPlan = XLSX.utils.aoa_to_sheet(planData)
  XLSX.utils.book_append_sheet(wb, wsPlan, 'FOMAT07 - Plan Mantenimiento')

  // Descarga del archivo
  const safeCode = (machine.code || 'EQUIPO').replace(/[^a-zA-Z0-9_-]/g, '_')
  const fileName = `FOMAT03_${safeCode}_HOJA_DE_VIDA_SIG.xlsx`
  XLSX.writeFile(wb, fileName)
}
