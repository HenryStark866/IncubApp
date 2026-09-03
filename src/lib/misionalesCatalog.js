/**
 * Catálogo de inspección pre-operacional — Desplazamientos Misionales.
 * Fuente: repo_misionales (Motos.xlsx + LISTA PREOPERACIONAL VEHÍCULOS).
 */

export const VEHICLE_TYPES = [
  { id: 'Moto', label: 'Motocicleta', grades: ['B', 'M'] },
  { id: 'Carro', label: 'Automóvil', grades: ['B', 'M', 'N/A'] },
  { id: 'Camion', label: 'Camión', grades: ['B', 'R', 'M', 'N/A'] },
]

export const GRADE_LABEL = {
  B: 'Bueno',
  R: 'Regular',
  M: 'Malo',
  'N/A': 'N/A',
}

export const GRADE_POINTS = { B: 1, R: 0.5, M: 0 }

/** 13 aspectos — Motocicleta */
export const ASPECTOS_MOTO = [
  'Estado de llantas y presión de aire',
  'Encendido eléctrico y de Cran',
  'Luces y Pito',
  'Espejos retrovisores',
  'Manijas de freno y closh',
  'Sistema de frenos',
  'Estado de freno de disco',
  'Nivel de líquido de freno',
  'Revisión sistema tablero',
  'Fugas de combustible y/o aceites',
  'Kit de arrastre',
  'Estado de suspensión',
  'Nivel de aceites',
]

/** 50 aspectos — Automóvil / Camión */
export const ASPECTOS_VEHICULO = [
  '1. Estado de llantas - Delanteras (libres de fisuras, labrado y presión)',
  '1. Estado de llantas - Traseras (libres de fisuras, labrado y presión)',
  '1. Estado de llantas - Repuesto',
  '2. Estado de carrocería y pintura (golpes, deterioros)',
  '3. Niveles de aceite y refrigerante',
  '4. Frenos (fugas de aire o líquido, estado del frenado)',
  '5. Motor (ruidos anormales)',
  '6. Dirección (normal o dura anormal)',
  '7. Luces - Altas',
  '7. Luces - Bajas',
  '7. Luces - Direccional delantera der.',
  '7. Luces - Direccional delantera izq.',
  '7. Luces - Direccional trasera der.',
  '7. Luces - Direccional trasera izq.',
  '7. Luces - Parqueo delanteras',
  '7. Luces - Parqueo traseras',
  '7. Luces - Stop de freno',
  '8. Batería',
  '9. Plumillas (las tiene y funcionan correctamente)',
  '10. Pito (funciona correctamente)',
  '11. Sillas - Apoya cabezas, estado general',
  '11. Sillas - Delanteros y traseros',
  '12. Cinturones de seguridad - Delanteros y traseros',
  '13. Equipo de prevención y seguridad - Botiquín',
  '13. Equipo de prevención y seguridad - Caja de herramientas',
  '13. Equipo de prevención y seguridad - Cruceta',
  '13. Equipo de prevención y seguridad - Tacos de parqueo',
  '13. Equipo de prevención y seguridad - Triángulo de parqueo',
  '13. Equipo de prevención y seguridad - Gato',
  '13. Equipo de prevención y seguridad - Chaleco reflectivo',
  '14. Espejos - Lateral derecho',
  '14. Espejos - Lateral izquierdo',
  '14. Espejos - Retrovisor',
  '15. Extintor ABC - Fecha de vencimiento',
  '15. Extintor ABC - Manómetro',
  '15. Extintor ABC - Sello de seguridad',
  '15. Extintor ABC - Pasador de seguridad',
  '15. Extintor ABC - Boquilla',
  '15. Extintor ABC - Etiqueta',
  '15. Extintor ABC - Sin óxido, golpes y averías',
  '16. Documentación - Documento de identidad',
  '16. Documentación - Licencia de tránsito',
  '16. Documentación - Licencia de conducción',
  '16. Documentación - SOAT',
  '16. Documentación - Revisión tecnomecánica',
  '17. Últimas fichas de mantenimiento - Cambio de aceite',
  '17. Últimas fichas de mantenimiento - Sincronización',
  '17. Últimas fichas de mantenimiento - Alineación y balanceo',
  '17. Últimas fichas de mantenimiento - Batería',
  '17. Últimas fichas de mantenimiento - Llantas',
]

export const ASPECTOS_POR_TIPO = {
  Moto: ASPECTOS_MOTO,
  Carro: ASPECTOS_VEHICULO,
  Camion: ASPECTOS_VEHICULO,
}

export const VALORES_POR_TIPO = {
  Moto: ['B', 'M'],
  Carro: ['B', 'M', 'N/A'],
  Camion: ['B', 'R', 'M', 'N/A'],
}

export function aspectosForTipo(tipo) {
  return ASPECTOS_POR_TIPO[tipo] || ASPECTOS_MOTO
}

export function valoresForTipo(tipo) {
  return VALORES_POR_TIPO[tipo] || ['B', 'M']
}

/** % cumplimiento: B=100, R=50, M=0; N/A no cuenta */
export function calcularPorcentaje(aspectosMap) {
  const vals = Object.values(aspectosMap || {})
    .map((v) => (typeof v === 'object' && v ? v.valor : v))
    .filter((v) => v in GRADE_POINTS)
  if (!vals.length) return 100
  const sum = vals.reduce((s, v) => s + GRADE_POINTS[v], 0)
  return Math.round((100 * sum) / vals.length)
}

export function normalizePlaca(s) {
  if (!s) return ''
  return String(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7)
}
