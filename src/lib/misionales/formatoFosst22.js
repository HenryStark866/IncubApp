/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/misionales/formatoFosst22.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * FECHA / DATE:   06-10-2026
 *
 * ES: Datos fijos del formato real del SIG «LISTA PREOPERACIONAL VEHÍCULOS»
 *     (FOSST22, versión 01, 07-02-2026 — docs/FOSST22-PREOPERACIONAL DE VEHICULOS.xlsx):
 *     encabezado y texto de cada criterio tal como está en el formato.
 * EN: Fixed data of the real SIG form «LISTA PREOPERACIONAL VEHÍCULOS» (FOSST22,
 *     version 01, 2026-02-07): header and each criterion's text as in the form.
 * =============================================================================
 */

/** ES: Encabezado del formato. EN: Form header. */
export const FOSST22 = {
  codigo: 'FOSST22',
  version: '01',
  fecha: '07-02-2026',
  titulo: 'LISTA PREOPERACIONAL VEHÍCULOS',
}

/** ES: Texto del criterio por número, igual al formato. EN: Criterion text by number, as in the form. */
export const CRITERIOS_FOSST22 = {
  1: '1. ESTADO DE LLANTAS: Están libres de fisuras, profundidad de labrado apropiada y presión',
  2: '2. ESTADO DE CARROCERÍA Y PINTURA: Golpes, deterioros',
  3: '3. NIVELES DE ACEITE Y REFRIGERANTE: Fugas',
  4: '4. FRENOS: Fugas de aire o líquido, estado del frenado',
  5: '5. MOTOR: Ruidos anormales',
  6: '6. DIRECCIÓN: Normal o dura anormal',
  7: '7. LUCES: Encienden y funcionan correctamente',
  8: '8. BATERÍA',
  9: '9. PLUMILLAS: Las tiene y funcionan correctamente',
  10: '10. PITO: Funciona correctamente',
  11: '11. Sillas (Delanteros y traseros)',
  12: '12. Cinturones de seguridad',
  13: '13. EQUIPO DE PREVENCIÓN Y SEGURIDAD: Cada elemento se encuentra vigente y en buen estado',
  14: '14. ESPEJOS',
  15: '15. EXTINTOR: Es de tipo ABC Multipropósito y cada uno de sus componentes se encuentra en buen estado',
  16: '16. DOCUMENTACIÓN: Tiene todos los documentos que exige la normatividad legal vigente en el momento de la inspección',
  17: '17. Últimas fechas de mantenimiento',
}

/** ES: Fechas de mantenimiento del punto 17 (clave del formulario → texto). EN: Item 17 dates. */
export const MANTENIMIENTOS_FOSST22 = [
  ['aceite', 'Cambio de aceite'],
  ['sincronizacion', 'Sincronización'],
  ['alineacion', 'Alineación - Balanceo'],
  ['bateria', 'Cambio de batería'],
  ['llantas', 'Cambio de llantas'],
]

/** ES: Turnos de trabajo. EN: Work shifts. */
export const TURNOS = ['Turno 1', 'Turno 2', 'Turno 3', 'Administrativo']
