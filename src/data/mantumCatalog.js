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

  // Fallback para componentes genericos si no hay especificos
  if (components.length === 0) {
    const isSetter = (machine.type === 'setter' || machine.code?.includes('INC'))
    const isHatcher = (machine.type === 'hatcher' || machine.code?.includes('NAC'))
    if (isSetter || isHatcher) {
      components = [
        {
          code: `${machine.code || 'EQ'}-COMP-01`,
          name: 'Motor propulsor / ventilador',
          component_spec: 'Motor trifásico 2.2kW 1500 RPM',
          reference: 'Petersime OEM-M22',
          status: 'Operativo',
          useful_life_pct: 82,
        },
        {
          code: `${machine.code || 'EQ'}-COMP-02`,
          name: 'Sistema de volteo neumático/mecánico',
          component_spec: 'Actuador neumático y vástago de volteo 45°',
          reference: 'Festo / Petersime P-45',
          status: 'Operativo',
          useful_life_pct: 78,
        },
        {
          code: `${machine.code || 'EQ'}-COMP-03`,
          name: 'Sensor PT100 Temperatura',
          component_spec: 'Sonda RTD clase A ±0.1°F',
          reference: 'PT100-SIG-01',
          status: 'Calibrado',
          useful_life_pct: 95,
        },
        {
          code: `${machine.code || 'EQ'}-COMP-04`,
          name: 'Sensor de Humedad Relativa',
          component_spec: 'Transmisor capacitivo 0-100% HR',
          reference: 'HR-CAP-420',
          status: 'Calibrado',
          useful_life_pct: 90,
        },
        {
          code: `${machine.code || 'EQ'}-COMP-05`,
          name: 'Resistencias de calefacción',
          component_spec: 'Elementos calefactores aleteados 3kW',
          reference: 'RES-ALET-3KW',
          status: 'Operativo',
          useful_life_pct: 85,
        },
      ]
    }
  }

  return {
    matchedKey: candidates[0] || machine.code,
    inventory,
    equipo: enrichEquipment(equipo, machine),
    components,
    maintenancePlan,
    historicalOTs,
    imageUrl: inventory?.url || null,
    isOwnPhoto: inventory?.es_foto_propia ?? false,
    imageLabel: inventory?.es_foto_propia ? 'Foto propia del equipo' : 'Foto referencial (catálogo Mantum)',
  }
}
