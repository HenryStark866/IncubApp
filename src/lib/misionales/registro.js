/**
 * Misionales · traduce entre el formulario de la ventana original (nombres del
 * repo_misionales: placa, desde, hasta, gasolina…) y la fila de mission_inspections.
 * Lo que no tiene columna propia va en «formato» (jsonb) con version 'misional-v2'.
 * 06-10-2026.
 */
import { calcularPorcentaje, normalizePlaca, TIPOS_CARGA, documentoNoConforme, contarCriticos } from '../misionalesCatalog'

export const VERSION_FORMATO = 'misional-v2'

/** Formulario vacío para un tipo de vehículo */
export function formularioVacio(tipo = 'Moto') {
  return {
    tipo,
    placa: '',
    proceso: '',
    desde: '',
    hasta: '',
    marca: '',
    gasolina: '',
    modelo: '',
    motor: '',
    linea: '',
    licencia_num: '',
    licencia_categoria: '',
    licencia_venc: '',
    porte_propiedad: '',
    soat: '',
    soat_venc: '',
    certificado_emision: '',
    tecnomecanica_venc: '',
    poliza_seguro: '',
    poliza_numero: '',
    poliza_seguro_venc: '',
    kilometraje: '',
    numero_interno: '',
    ciudad: '',
    empresa: '',
    ubicacion_selector: '',
    ubicacion_otro: '',
    tipo_carga: '',
    tipo_carga_otro: '',
    ultimo_cambio_aceite: '',
    ultima_sincronizacion: '',
    ultima_alineacion_balanceo: '',
    ultimo_cambio_llantas: '',
    condiciones_optimas: 'SI',
    observaciones: '',
  }
}

/** Lugar de diligenciamiento según el selector (copiar origen / otro / fijo) */
export function ubicacionDe(f) {
  if (f.ubicacion_selector === 'COPIAR_ORIGEN') return String(f.desde || '').trim()
  if (f.ubicacion_selector === 'OTRO') return String(f.ubicacion_otro || '').trim()
  return f.ubicacion_selector || ''
}

/**
 * Formulario → payload para useMisionales.createInspection.
 * @param {object} f formulario
 * @param {{ aspectos, evidencias, firma, gps, conductor }} extra
 */
export function aRegistro(f, { aspectos, evidencias = {}, firma, gps = {}, conductor = '' }) {
  const camion = f.tipo === 'Camion'
  // Un documento vencido o inexistente obliga a NO óptimo (como el servidor original).
  const { m } = contarCriticos(aspectos)
  const optimo = f.condiciones_optimas === 'SI' && m === 0 && !documentoNoConforme(f)
  const solo = (v) => (camion ? String(v || '').trim() || null : null)
  return {
    driver_name: conductor,
    plate: normalizePlaca(f.placa),
    vehicle_type: f.tipo,
    process: f.proceso,
    origin: f.desde.trim(),
    destination: f.hasta.trim(),
    brand: f.marca.trim(),
    model: f.modelo.trim(),
    fuel: f.gasolina,
    line: f.linea.trim(),
    engine: f.motor.trim(),
    internal_number: camion ? f.numero_interno.trim() : '',
    odometer: camion ? f.kilometraje.replace(/[.,\s]/g, '') : '',
    city: camion ? f.ciudad.trim() : '',
    license_num: f.licencia_num.trim(),
    license_exp: f.licencia_venc,
    soat: f.soat,
    property_card: f.porte_propiedad,
    gas_cert: f.certificado_emision,
    // Moto y automóvil sin póliza marcada: «No aplica» (como el original)
    insurance: f.poliza_seguro || (camion ? '' : 'No aplica'),
    aspectos,
    optimal: optimo,
    observations: f.observaciones.trim(),
    lat: camion ? gps.lat ?? null : null,
    lng: camion ? gps.lng ?? null : null,
    gps_accuracy: camion ? gps.accuracy ?? null : null,
    signature_data: firma || null,
    evidencias,
    formato: {
      version: VERSION_FORMATO,
      empresa: solo(f.empresa),
      ubicacion: camion ? ubicacionDe(f) || null : null,
      tipo_carga: solo(f.tipo_carga),
      tipo_carga_otro: camion && f.tipo_carga === 'OTRO' ? f.tipo_carga_otro.trim() : null,
      licencia_categoria: solo(f.licencia_categoria),
      soat_venc: solo(f.soat_venc),
      tecnomecanica_venc: solo(f.tecnomecanica_venc),
      poliza_numero: solo(f.poliza_numero),
      poliza_seguro_venc: solo(f.poliza_seguro_venc),
      mantenimiento: camion
        ? {
            ultimo_cambio_aceite: f.ultimo_cambio_aceite || null,
            ultima_sincronizacion: f.ultima_sincronizacion || null,
            ultima_alineacion_balanceo: f.ultima_alineacion_balanceo || null,
            ultimo_cambio_llantas: f.ultimo_cambio_llantas || null,
          }
        : null,
      porcentaje: calcularPorcentaje(aspectos),
    },
  }
}

/** ¿La inspección se guardó con la ventana original (v2)? */
export function esFormatoMisional(row) {
  return row?.formato?.version === VERSION_FORMATO
}

/** Texto del tipo de carga */
export function cargaTexto(fx = {}) {
  if (!fx.tipo_carga) return ''
  if (fx.tipo_carga === 'OTRO') return fx.tipo_carga_otro || 'Otro'
  return TIPOS_CARGA[fx.tipo_carga] || fx.tipo_carga
}
