/**
 * =============================================================================
 * ARCHIVO: src/lib/vehiclePreopCatalog.js
 * PROPÓSITO: Digitalización del formato FOSST22 «LISTA PREOPERACIONAL VEHÍCULOS»
 *   (código FOSST22 · versión 01 · 07-02-2026) de docs/FOSST22-PREOPERACIONAL
 *   DE VEHICULOS.xlsx. Catálogo de criterios de inspección B/M, fechas de
 *   mantenimiento y estándares de seguridad para conductores.
 * CÓMO FUNCIONA: Constantes importadas por el panel preoperacional y el hook.
 *   Cada criterio genera una fila { id, group, label, status, observation,
 *   correctiveAction, correctiveDate } en vehicle_preop_reports.items.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

export const PREOP_FORM_CODE = 'FOSST22'
export const PREOP_FORM_VERSION = '01'
export const PREOP_FORM_TITLE = 'Lista preoperacional de vehículos'

/**
 * Criterios de inspección (estado B = bueno, M = malo).
 * `group` replica el numeral del formato físico para que el exporte
 * conserve el orden y la trazabilidad del documento SST.
 */
export const PREOP_ITEMS = [
  // 1. Llantas
  { id: 'llantas_delanteras', group: '1. Estado de llantas', label: 'Delanteras (fisuras, labrado, presión)' },
  { id: 'llantas_traseras', group: '1. Estado de llantas', label: 'Traseras (fisuras, labrado, presión)' },
  { id: 'llantas_repuesto', group: '1. Estado de llantas', label: 'Repuesto' },

  { id: 'carroceria', group: '2. Carrocería y pintura', label: 'Golpes, deterioros' },
  { id: 'niveles', group: '3. Niveles', label: 'Aceite y refrigerante · fugas' },
  { id: 'frenos', group: '4. Frenos', label: 'Fugas de aire o líquido, estado del frenado' },
  { id: 'motor', group: '5. Motor', label: 'Ruidos anormales' },
  { id: 'direccion', group: '6. Dirección', label: 'Normal o dura anormal' },

  // 7. Luces
  { id: 'luces_altas', group: '7. Luces', label: 'Altas' },
  { id: 'luces_bajas', group: '7. Luces', label: 'Bajas' },
  { id: 'dir_del_der', group: '7. Luces', label: 'Direccional delantera derecha' },
  { id: 'dir_del_izq', group: '7. Luces', label: 'Direccional delantera izquierda' },
  { id: 'dir_tras_der', group: '7. Luces', label: 'Direccional trasera derecha' },
  { id: 'dir_tras_izq', group: '7. Luces', label: 'Direccional trasera izquierda' },
  { id: 'parqueo_del', group: '7. Luces', label: 'Parqueo delanteras' },
  { id: 'parqueo_tras', group: '7. Luces', label: 'Parqueo traseras' },
  { id: 'stop_freno', group: '7. Luces', label: 'Stop de freno' },

  { id: 'bateria', group: '8. Batería', label: 'Estado general' },
  { id: 'plumillas', group: '9. Plumillas', label: 'Las tiene y funcionan correctamente' },
  { id: 'pito', group: '10. Pito', label: 'Funciona correctamente' },
  { id: 'sillas', group: '11. Sillas', label: 'Delanteras y traseras · apoyacabezas, estado general' },
  { id: 'cinturones', group: '12. Cinturones de seguridad', label: 'Delanteros y traseros' },

  // 13. Equipo de prevención y seguridad
  { id: 'botiquin', group: '13. Equipo de prevención y seguridad', label: 'Botiquín (vigente y en buen estado)' },
  { id: 'herramientas', group: '13. Equipo de prevención y seguridad', label: 'Caja de herramientas' },
  { id: 'cruceta', group: '13. Equipo de prevención y seguridad', label: 'Cruceta' },
  { id: 'tacos', group: '13. Equipo de prevención y seguridad', label: 'Tacos de parqueo' },
  { id: 'triangulo', group: '13. Equipo de prevención y seguridad', label: 'Triángulo de parqueo' },
  { id: 'gato', group: '13. Equipo de prevención y seguridad', label: 'Gato' },
  { id: 'chaleco', group: '13. Equipo de prevención y seguridad', label: 'Chaleco reflectivo' },

  // 14. Espejos
  { id: 'espejo_der', group: '14. Espejos', label: 'Lateral derecho' },
  { id: 'espejo_izq', group: '14. Espejos', label: 'Lateral izquierdo' },
  { id: 'retrovisor', group: '14. Espejos', label: 'Retrovisor' },

  // 15. Extintor (tipo ABC multipropósito)
  { id: 'ext_vencimiento', group: '15. Extintor ABC', label: 'Fecha de vencimiento vigente' },
  { id: 'ext_manometro', group: '15. Extintor ABC', label: 'Manómetro' },
  { id: 'ext_sello', group: '15. Extintor ABC', label: 'Sello de seguridad' },
  { id: 'ext_pasador', group: '15. Extintor ABC', label: 'Pasador de seguridad' },
  { id: 'ext_boquilla', group: '15. Extintor ABC', label: 'Boquilla' },
  { id: 'ext_etiqueta', group: '15. Extintor ABC', label: 'Etiqueta' },
  { id: 'ext_estado', group: '15. Extintor ABC', label: 'Sin óxido, golpes ni averías' },

  // 16. Documentación
  { id: 'doc_identidad', group: '16. Documentación', label: 'Documento de identidad' },
  { id: 'doc_transito', group: '16. Documentación', label: 'Licencia de tránsito (tarjeta de propiedad)' },
  { id: 'doc_conduccion', group: '16. Documentación', label: 'Licencia de conducción vigente', dateLabel: 'Fecha de vencimiento' },
  { id: 'doc_soat', group: '16. Documentación', label: 'SOAT vigente', dateLabel: 'Fecha de vencimiento' },
  { id: 'doc_tecnico', group: '16. Documentación', label: 'Revisión tecnicomecánica vigente', dateLabel: 'Fecha de vencimiento' },
]

/** 17. Últimas fechas de mantenimiento (DD/MM/AAAA en el formato físico) */
export const PREOP_MAINTENANCE_FIELDS = [
  { id: 'oil_change', label: 'Cambio de aceite' },
  { id: 'sync', label: 'Sincronización' },
  { id: 'alignment', label: 'Alineación / balanceo' },
  { id: 'battery_change', label: 'Cambio de batería' },
  { id: 'tire_change', label: 'Cambio de llantas' },
]

/** Grupos en orden del formato físico */
export const PREOP_GROUPS = [...new Set(PREOP_ITEMS.map((i) => i.group))]

/** Fila vacía del checklist para el formulario */
export function emptyPreopItems() {
  return PREOP_ITEMS.map((i) => ({
    id: i.id,
    group: i.group,
    label: i.label,
    status: 'B', // B | M
    observation: '',
    correctiveAction: '',
    correctiveDate: i.dateLabel ? '' : undefined,
  }))
}

/** ¿El checklist permite aprobar el vehículo? (ningún criterio crítico en M) */
export function suggestCompliance(items = []) {
  const bad = items.filter((i) => i.status === 'M')
  return { compliant: bad.length === 0, badCount: bad.length, bad }
}

/**
 * Estándar de seguridad para conductores (hoja 2 del FOSST22) — resumen
 * operativo que se muestra al conductor antes de diligenciar.
 */
export const DRIVER_SAFETY_REMINDER =
  'Antes de usar el vehículo realice la revisión preoperacional («los 5 minutos de vida»). ' +
  'Use siempre el cinturón, respete los límites (residencial 30 · urbana 60 · carretera 80 km/h), ' +
  'mantenga distancia segura, ambas manos al volante y nada de celular, comida o lectura mientras conduce. ' +
  'En caso de falla o accidente: informe de inmediato a la empresa, señalice y no mueva el vehículo hasta el informe de la autoridad.'
