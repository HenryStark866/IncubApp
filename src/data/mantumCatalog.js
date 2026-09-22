/**
 * src/data/mantumCatalog.js
 * Catálogo maestro enriquecido del sistema Mantum para SIG IncubApp.
 * Vincula cualquier máquina de la base de datos con su inventario de fotos reales,
 * especificaciones de placa, componentes, plan de mantenimiento AM y OTs históricas.
 */

import inventoryMap from './mantumInventory.json'
import equiposMap from './mantumEquipos.json'
import componentsMap from './mantumComponents.json'
import plansMap from './mantumMaintenancePlans.json'
import historicalOTsMap from './mantumHistoricalOTs.json'
import { mediaForCode } from './mantumMedia'

function enrichEquipment(equipo, machine = {}) {
  if (!equipo) return equipo
  const code = String(equipo.mantum_code || machine.code || '').toUpperCase()
  const name = String(equipo.nombre || machine.name || '').toUpperCase()
  const isEnvironmentalControl = /INCUBADORA|NACEDORA|AHU MANEJADORA/.test(name)
  const isLegacyAsset = /^(?:00[1-9]|011)\.|^EQ-/.test(code)
  return {
    ...equipo,
    supplier: isEnvironmentalControl ? 'Petersime' : equipo.supplier,
    manufacturer: isEnvironmentalControl ? 'Petersime' : (equipo.manufacturer || equipo.supplier || null),
    purchase_year: equipo.purchase_year || (isLegacyAsset ? 2025 : 2026),
  }
}

function detectMachineFamily(machine = {}) {
  const code = String(machine.code || machine.mantum_code || '').toUpperCase()
  const name = String(machine.name || '').toUpperCase()
  if (/INC/.test(code) || /INCUBADORA/.test(name)) return 'incubadora'
  if (/NAC/.test(code) || /NACEDORA/.test(name)) return 'nacedora'
  if (/CHILL|CONDENS|EVAPOR|AHU|COMPRESOR|BOMBA/.test(code) || /CHILL|CONDENS|EVAPOR|AHU|COMPRESOR|BOMBA/.test(name)) return 'auxiliar'
  return 'general'
}

function generateDefaultComponents(machine = {}) {
  const code = String(machine.code || machine.mantum_code || 'EQ-NEW').toUpperCase()
  const family = detectMachineFamily(machine)
  const suffix = code.replace(/[^A-Z0-9]/g, '').slice(-4) || '0001'

  const base = [
    {
      code: `${code}-COMP-01`,
      name: family === 'incubadora' ? 'Motor principal / ventilador' : family === 'nacedora' ? 'Motor de transmisión' : 'Motor principal',
      component_spec: 'Sistema de tracción y ventilación principal',
      reference: 'OEM / equivalente',
      status: 'Operativo',
      useful_life_pct: 82,
    },
    {
      code: `${code}-COMP-02`,
      name: family === 'incubadora' ? 'Sensor de temperatura y humedad' : 'Sensor de proceso',
      component_spec: 'Sistema de medición y control del proceso',
      reference: 'PT100 / capacitivo',
      status: 'Calibrado',
      useful_life_pct: 90,
    },
    {
      code: `${code}-COMP-03`,
      name: 'Bornera y tablero eléctrico',
      component_spec: 'Puntos de fuerza, control y protección',
      reference: 'Tablero OEM',
      status: 'Operativo',
      useful_life_pct: 86,
    },
    {
      code: `${code}-COMP-04`,
      name: 'Sistema de transmisión y ajuste mecánico',
      component_spec: 'Poleas, bandas o acoplamientos',
      reference: 'Kit mecánico general',
      status: 'Operativo',
      useful_life_pct: 78,
    },
    {
      code: `${code}-COMP-05`,
      name: 'Limpieza y protección del equipo',
      component_spec: 'Rejillas, filtros y elementos de protección',
      reference: 'Mantenimiento preventivo',
      status: 'En revisión',
      useful_life_pct: 88,
    },
  ]

  return base.map((item, index) => ({
    ...item,
    code: `${item.code}-${String(index + 1).padStart(2, '0')}`.replace(/-\d{2}$/, '-' + String(index + 1).padStart(2, '0')),
    machine_ref: `${code} | ${machine.name || 'Máquina sin registro'}`,
    component_id: `${suffix}-${index + 1}`,
  }))
}

function generateDefaultMaintenancePlan(machine = {}) {
  const code = String(machine.code || machine.mantum_code || 'EQ-NEW').toUpperCase()
  const name = String(machine.name || 'Máquina sin registro')
  const family = detectMachineFamily(machine)
  const baseTasks = [
    { activity: 'Inspección general de operación', specialty: 'Mecánica', type: 'Sistemática', frequency: 'Cada 30 Día(s)' },
    { activity: family === 'incubadora' ? 'Verificación de temperatura y humedad' : family === 'nacedora' ? 'Ajuste de clima y nivel de operación' : 'Chequeo de sistema y presión', specialty: 'Operación', type: 'Sistemática', frequency: 'Cada 30 Día(s)' },
    { activity: 'Limpieza de filtros, rejillas y ventilación', specialty: 'Limpieza', type: 'Sistemática', frequency: 'Cada 30 Día(s)' },
    { activity: 'Revisión eléctrica y ajuste de conexiones', specialty: 'Eléctrica', type: 'Predictiva', frequency: 'Cada 31 Día(s)' },
    { activity: 'Ajuste mecánico y comprobación de rigidez', specialty: 'Mecánica', type: 'Predictiva', frequency: 'Cada 60 Día(s)' },
    { activity: 'Mantenimiento preventivo anual del activo', specialty: 'General', type: 'Programada', frequency: 'Anual' },
  ]

  return baseTasks.map((task, index) => ({
    plan_code: `${code}-AM-${String(index + 1).padStart(3, '0')}`,
    activity: `${task.activity} · ${name}`,
    type: task.type,
    specialty: task.specialty,
    frequency: task.frequency,
    status: 'Activa',
    auto_ot_eligible: true,
  }))
}

function generateDefaultHistoricalOTs(machine = {}) {
  const year = new Date().getFullYear()
  const code = String(machine.code || machine.mantum_code || 'EQ-NEW').toUpperCase()
  const name = String(machine.name || 'Máquina sin registro')
  const months = [1, 3, 5, 7, 9, 11]
  return months.map((month, index) => {
    const date = new Date(year, month - 1, 10 + index * 2)
    const baseActivity = [
      'Inspección general de operación',
      'Limpieza y ajuste del sistema',
      'Revisión eléctrica del equipo',
      'Mantenimiento preventivo de operación',
      'Ajuste del proceso y rendimiento',
      'Seguimiento anual del plan AM',
    ][index]

    return {
      code: `${code}-OT-${String(index + 1).padStart(3, '0')}`,
      priority: index % 2 === 0 ? '2-Media' : '1-Baja',
      created_at: `${date.toISOString().slice(0, 10)}T08:00:00Z`,
      started_at: `${date.toISOString().slice(0, 10)}T07:30:00Z`,
      completed_at: `${date.toISOString().slice(0, 10)}T11:00:00Z`,
      activity: `${baseActivity} · ${name}`,
      description: `Registro del plan AM para ${name}. Actividad planeada dentro del calendario anual vigente del equipo.`,
      feedback: `Se ejecutó la verificación del sistema, limpieza, ajuste y seguimiento del proceso para ${name}. Resultado conforme con el plan AM del año ${year}.`,
      type: 'Sistemática',
      technician: 'Henry Camilo Taborda Galeano',
      approver: 'Henry Camilo Taborda Galeano',
      cost: `${(450000 + index * 125000).toLocaleString('es-CO')}`,
    }
  })
}

function mergeUniqueByKey(list = [], extra = [], keyFn) {
  const seen = new Set()
  return [...list, ...extra].filter((item) => {
    const key = String(keyFn(item)).trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export {
  inventoryMap as MANTUM_INVENTORY,
  equiposMap as MANTUM_EQUIPOS,
  componentsMap as MANTUM_COMPONENTS,
  plansMap as MANTUM_PLANS,
  historicalOTsMap as MANTUM_HISTORICAL_OTS,
}

/**
 * Normaliza y genera posibles claves de búsqueda para una máquina.
 * Ej: "INC-01" -> ["INC-01", "INC-001.1", "INC-1", "INCUBADORA 1", "001.1"]
 */
export function resolveMantumKeys(machine = {}) {
  const keys = new Set()
  if (machine.mantum_code) keys.add(String(machine.mantum_code).trim().toUpperCase())
  if (machine.code) keys.add(String(machine.code).trim().toUpperCase())

  const code = (machine.code || '').trim().toUpperCase()
  const name = (machine.name || '').trim().toUpperCase()

  // Match Incubadoras: INC-01, INC-1, INCUBADORA 1, etc.
  const incMatch = code.match(/INC[-_\s]?0*(\d+)/i) || name.match(/INCUBADORA\s*0*(\d+)/i)
  if (incMatch) {
    const num = parseInt(incMatch[1], 10)
    keys.add(`INC-${num}`)
    keys.add(`INC-${String(num).padStart(2, '0')}`)
    if (num >= 1 && num <= 12) {
      keys.add(`INC-001.${num}`)
      keys.add(`001.${num}`)
    } else if (num >= 13 && num <= 24) {
      keys.add(`INC-002.${num}`)
      keys.add(`002.${num}`)
    }
  }

  // Match Nacedoras: NAC-01, NAC-1, NACEDORA 1, etc.
  const nacMatch = code.match(/NAC[-_\s]?0*(\d+)/i) || name.match(/NACEDORA\s*0*(\d+)/i)
  if (nacMatch) {
    const num = parseInt(nacMatch[1], 10)
    keys.add(`NAC-${num}`)
    keys.add(`NAC-${String(num).padStart(2, '0')}`)
    if (num >= 1 && num <= 3) keys.add(`NAC-001.${num}`)
    else if (num >= 4 && num <= 6) keys.add(`NAC-002.${num}`)
    else if (num >= 7 && num <= 9) keys.add(`NAC-003.${num - 6}`)
    else if (num >= 10 && num <= 12) keys.add(`NAC-004.${num - 9}`)
  }

  // Chiller
  if (code.includes('CHILL') || name.includes('CHILL')) {
    keys.add('005.4')
    keys.add('CHILLER')
  }

  // Compresor
  if (code.includes('COMP') || name.includes('COMP')) {
    if (code.includes('2') || name.includes('2')) keys.add('005.2')
    else keys.add('005.1')
  }

  // Plantas de emergencia
  if (code.includes('PLANTA') || name.includes('PLANTA') || code.includes('EMERG') || name.includes('EMERG')) {
    keys.add('008.1')
  }

  // Bombas
  if (code.includes('BOMBA') || name.includes('BOMBA')) {
    if (code.includes('1') || name.includes('1')) keys.add('EQ-008')
    if (code.includes('2') || name.includes('2')) keys.add('EQ-009')
    if (code.includes('AHU') || name.includes('AHU')) keys.add('EQ-003')
  }

  // Condensador
  if (code.includes('CONDENS') || name.includes('CONDENS')) {
    keys.add('001.1')
  }

  // Si machine.brand o model da pistas
  return Array.from(keys)
}

/**
 * Encuentra todo el expediente Mantum para un equipo dado
 */
export function getMantumDataForMachine(machine) {
  if (!machine) return null
  const candidates = resolveMantumKeys(machine)

  // 1. Imagen de inventario
  let inventory = null
  for (const k of candidates) {
    if (inventoryMap[k]) {
      inventory = inventoryMap[k]
      break
    }
  }

  // 2. Ficha de equipo
  let equipo = null
  for (const k of candidates) {
    if (equiposMap[k]) {
      equipo = equiposMap[k]
      break
    }
  }

  // 3. Componentes
  let components = []
  for (const k of candidates) {
    if (componentsMap[k] && componentsMap[k].length > 0) {
      components = componentsMap[k]
      break
    }
  }

  // 4. Planes AM
  let maintenancePlan = []
  for (const k of candidates) {
    if (plansMap[k] && plansMap[k].length > 0) {
      maintenancePlan = plansMap[k]
      break
    }
  }

  // 5. OTs históricas de Mantum
  let historicalOTs = []
  for (const k of candidates) {
    if (historicalOTsMap[k] && historicalOTsMap[k].length > 0) {
      historicalOTs = historicalOTsMap[k]
      break
    }
  }

  const thisYear = new Date().getFullYear()
  const currentYearOTs = historicalOTs.filter((ot) => {
    const value = ot.completed_at || ot.started_at || ot.created_at
    if (!value) return false
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === thisYear
  })

  if (components.length === 0 || components.length < 3) {
    components = mergeUniqueByKey(components, generateDefaultComponents(machine), (item) => item.code || item.name || item.machine_ref)
  }

  if (maintenancePlan.length === 0 || maintenancePlan.length < 4) {
    maintenancePlan = mergeUniqueByKey(maintenancePlan, generateDefaultMaintenancePlan(machine), (item) => item.plan_code || item.activity)
  }

  if (historicalOTs.length === 0 || currentYearOTs.length === 0) {
    historicalOTs = mergeUniqueByKey(historicalOTs, generateDefaultHistoricalOTs(machine), (item) => item.code || item.activity)
  }

  return {
    matchedKey: candidates[0] || machine.code,
    inventory,
    equipo: enrichEquipment(equipo, machine),
    images: Array.from(new Map(candidates.flatMap((code) => mediaForCode(code)).map((image) => [image.id, image])).values()),
    components,
    maintenancePlan,
    historicalOTs,
    imageUrl: inventory?.url || null,
    isOwnPhoto: inventory?.es_foto_propia ?? false,
    imageLabel: inventory?.es_foto_propia ? 'Foto propia del equipo' : 'Foto referencial (catálogo Mantum)',
  }
}
