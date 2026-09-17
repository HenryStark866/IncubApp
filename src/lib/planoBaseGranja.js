/**
 * =============================================================================
 * ARCHIVO: src/lib/planoBaseGranja.js
 * PROPÓSITO: Definición del plano base arquitectónico de Granja avícola en IncubApp.
 * Estructura de módulos de Levante y Producción, galpones de 2 pisos, bioseguridad,
 * silos, tanques y vías de circulación con medidas métricas reales.
 * =============================================================================
 */

export const PLANO_BASE_GRANJA = [
  // ── Bioseguridad y Administración ───────────────────────────────────────────
  {
    code: 'BIO-ARC',
    name: 'Arco de Desinfección y Portón',
    type: 'exterior',
    pos_x: 0,
    pos_y: 0,
    width: 14,
    height: 8,
    doors: [{ x: 0, y: 3, w: 4, type: 'open' }, { x: 14, y: 3, w: 4, type: 'open' }],
  },
  {
    code: 'FIL-SAN',
    name: 'Filtro Sanitario y Vestieres',
    type: 'office',
    pos_x: 16,
    pos_y: 0,
    width: 10,
    height: 8,
    doors: [{ x: 1, y: 8, w: 0.9, type: 'normal' }, { x: 8, y: 8, w: 0.9, type: 'normal' }],
  },
  {
    code: 'OFI-GRAN',
    name: 'Oficina y Laboratorio Granja',
    type: 'office',
    pos_x: 28,
    pos_y: 0,
    width: 12,
    height: 8,
    doors: [{ x: 6, y: 8, w: 0.9, type: 'normal' }],
  },
  {
    code: 'BOD-ALM',
    name: 'Bodega de Alimento y Farmacia',
    type: 'egg_storage',
    pos_x: 42,
    pos_y: 0,
    width: 18,
    height: 8,
    doors: [{ x: 9, y: 8, w: 2.2, type: 'loading' }],
  },
  {
    code: 'SILO-CEN',
    name: 'Batería de Silos Centrales',
    type: 'tank',
    pos_x: 62,
    pos_y: 0,
    width: 12,
    height: 8,
    doors: [],
  },
  {
    code: 'TANQ-AGUA',
    name: 'Tanque Reserva y Bombeo de Agua',
    type: 'tank',
    pos_x: 76,
    pos_y: 0,
    width: 10,
    height: 8,
    doors: [],
  },

  // ── Vía principal de circulación ─────────────────────────────────────────────
  {
    code: 'VIA-ACC',
    name: 'Vía Principal de Circulación',
    type: 'road',
    pos_x: 0,
    pos_y: 9,
    width: 130,
    height: 6,
    doors: [],
  },

  // ── MÓDULO 100 "LEVANTE" ─────────────────────────────────────────────────────
  {
    code: 'M100',
    name: 'MODULO 100 "LEVANTE"',
    type: 'levante',
    pos_x: 0,
    pos_y: 18,
    width: 128,
    height: 38,
    doors: [],
  },
  {
    code: 'G101',
    name: 'GALPON 101',
    type: 'levante',
    pos_x: 6,
    pos_y: 22,
    width: 24,
    height: 30,
    doors: [
      { x: 12, y: 0, w: 1.2, lado: 'arriba', type: 'normal' },
      { x: 12, y: 30, w: 1.2, lado: 'abajo', type: 'normal' },
    ],
  },
  {
    code: 'G102',
    name: 'GALPON 102',
    type: 'levante',
    pos_x: 36,
    pos_y: 22,
    width: 24,
    height: 30,
    doors: [
      { x: 12, y: 0, w: 1.2, lado: 'arriba', type: 'normal' },
      { x: 12, y: 30, w: 1.2, lado: 'abajo', type: 'normal' },
    ],
  },
  {
    code: 'G103',
    name: 'GALPON 103',
    type: 'levante',
    pos_x: 66,
    pos_y: 22,
    width: 24,
    height: 30,
    doors: [
      { x: 12, y: 0, w: 1.2, lado: 'arriba', type: 'normal' },
      { x: 12, y: 30, w: 1.2, lado: 'abajo', type: 'normal' },
    ],
  },
  {
    code: 'G104',
    name: 'GALPON 104',
    type: 'levante',
    pos_x: 96,
    pos_y: 22,
    width: 24,
    height: 30,
    doors: [
      { x: 12, y: 0, w: 1.2, lado: 'arriba', type: 'normal' },
      { x: 12, y: 30, w: 1.2, lado: 'abajo', type: 'normal' },
    ],
  },

  // ── MÓDULO 200 "PRODUCCIÓN" ──────────────────────────────────────────────────
  {
    code: 'M200',
    name: 'MODULO 200 "PRODUCCION"',
    type: 'produccion',
    pos_x: 0,
    pos_y: 60,
    width: 128,
    height: 38,
    doors: [],
  },
  {
    code: 'G201',
    name: 'GALPON 201',
    type: 'produccion',
    pos_x: 6,
    pos_y: 64,
    width: 24,
    height: 30,
    doors: [
      { x: 12, y: 0, w: 1.2, lado: 'arriba', type: 'normal' },
      { x: 12, y: 30, w: 1.2, lado: 'abajo', type: 'normal' },
    ],
  },
  {
    code: 'G202',
    name: 'GALPON 202',
    type: 'produccion',
    pos_x: 36,
    pos_y: 64,
    width: 24,
    height: 30,
    doors: [
      { x: 12, y: 0, w: 1.2, lado: 'arriba', type: 'normal' },
      { x: 12, y: 30, w: 1.2, lado: 'abajo', type: 'normal' },
    ],
  },
  {
    code: 'G203',
    name: 'GALPON 203',
    type: 'produccion',
    pos_x: 66,
    pos_y: 64,
    width: 24,
    height: 30,
    doors: [
      { x: 12, y: 0, w: 1.2, lado: 'arriba', type: 'normal' },
      { x: 12, y: 30, w: 1.2, lado: 'abajo', type: 'normal' },
    ],
  },
  {
    code: 'G204',
    name: 'GALPON 204',
    type: 'produccion',
    pos_x: 96,
    pos_y: 64,
    width: 24,
    height: 30,
    doors: [
      { x: 12, y: 0, w: 1.2, lado: 'arriba', type: 'normal' },
      { x: 12, y: 30, w: 1.2, lado: 'abajo', type: 'normal' },
    ],
  },
]

/** Equipos de galpón (Piso 1 y Piso 2 para cada galpón) */
export const GALPONES_BASE_MAQUINAS = [
  // Levante M100
  { num: 101, name: 'Galpón 101' },
  { num: 102, name: 'Galpón 102' },
  { num: 103, name: 'Galpón 103' },
  { num: 104, name: 'Galpón 104' },
  // Producción M200
  { num: 201, name: 'Galpón 201' },
  { num: 202, name: 'Galpón 202' },
  { num: 203, name: 'Galpón 203' },
  { num: 204, name: 'Galpón 204' },
]
