/**
 * Catálogo de inspección pre-operacional — Desplazamientos Misionales.
 * 06-10-2026: igual a la ventana original de Misionales (repo_misionales,
 * app/routes/inspecciones.py y templates/form.html): moto 20 aspectos B/M (N/A en el 5 y
 * el 13), automóvil 24 B/M/N/A y camión 102 B/R/M/N/A. Toda M o R lleva foto.
 * Las listas del formato FOSST22 (13 y 50 ítems) quedan para leer las inspecciones viejas.
 */

export const VEHICLE_TYPES = [
  { id: 'Moto', label: 'Motocicleta', icon: '🏍', titulo: 'Inspección Pre Operacional Motocicleta', datos: 'Datos de la motocicleta' },
  { id: 'Carro', label: 'Automóvil', icon: '🚗', titulo: 'Inspección Pre Operacional Automóvil', datos: 'Datos del automóvil' },
  { id: 'Camion', label: 'Camión', icon: '🚛', titulo: 'Inspección Pre Operacional Camión', datos: 'Datos del camión' },
]

/** Código y versión del formato que muestra la ventana y el PDF */
export const FORMATO_MISIONAL = { codigo: 'FO-SST-063', version: '01' }

export const GRADE_LABEL = {
  B: 'Bien',
  R: 'Regular',
  M: 'Mal',
  'N/A': 'No aplica',
}

export const GRADE_POINTS = { B: 1, R: 0.5, M: 0 }
const ORDEN_VALORES = ['B', 'R', 'M', 'N/A']

export const ASPECTOS_MOTO = [
  'Llantas delantera y trasera — estado, labrado y presión de aire',
  'Rines — sin golpes, fisuras ni deformaciones',
  'Sistema de freno delantero — palanca, recorrido y frenado efectivo',
  'Sistema de freno trasero — pedal, recorrido y frenado efectivo',
  'Nivel de líquido de freno, si aplica (freno de disco)',
  'Luces delanteras — alta y baja',
  'Luces traseras y luz de stop',
  'Direccionales delanteras y traseras',
  'Pito / bocina',
  'Espejos retrovisores — ambos lados, ajustados',
  'Encendido eléctrico y batería',
  'Acelerador — retorno normal y sin trabas',
  'Manija de clutch / embrague, si aplica',
  'Cadena o correa de transmisión — tensión y lubricación',
  'Suspensión delantera y trasera',
  'Nivel de aceite del motor',
  'Fugas de combustible o aceite',
  'Tablero e instrumentos',
  'Casco — buen estado, con barbuquejo asegurado',
  'Chaleco reflectivo — disponible y en buen estado',
]

export const ASPECTOS_CARRO = [
  'Llantas — estado, labrado y presión de aire (las 4 ruedas)',
  'Llanta de repuesto — estado y presión de aire',
  'Frenos — pedal, recorrido y frenado efectivo',
  'Nivel de líquido de freno',
  'Luces altas y bajas',
  'Luces de stop',
  'Direccionales',
  'Luces de parqueo y reversa',
  'Bocina / pito',
  'Espejos retrovisores y laterales',
  'Nivel de aceite del motor',
  'Nivel de líquido refrigerante',
  'Nivel de líquido de dirección hidráulica, si aplica',
  'Fugas de combustible, aceite o líquidos',
  'Correas y mangueras visibles — estado',
  'Batería y sistema eléctrico',
  'Tablero e instrumentos',
  'Limpiaparabrisas — funcionamiento y estado de plumillas',
  'Puertas, seguros y vidrios — funcionamiento',
  'Dirección — funcionamiento normal, sin dureza o juego anormal',
  'Cinturones de seguridad — todos los puestos',
  'Carrocería / estructura — golpes, deterioros o partes sueltas',
  'Extintor — vigente, cargado y en buen estado',
  'Equipo de carretera — botiquín, gato, cruceta, señales y tacos',
]

export const ASPECTOS_CAMION = [
  'Motor — nivel de aceite entre mínimo y máximo',
  'Motor — nivel de refrigerante adecuado',
  'Motor — sin fugas visibles de aceite, combustible o refrigerante',
  'Motor — sin ruidos anormales en ralentí o aceleración',
  'Motor — correas y bandas sin grietas, desgaste o deshilachado',
  'Motor — filtro de aire limpio y bien asegurado',
  'Sistema eléctrico — batería firmemente asegurada',
  'Sistema eléctrico — bornes ajustados y sin sulfatación',
  'Sistema eléctrico — cableado visible sin peladuras ni empalmes sueltos',
  'Sistema eléctrico — alternador y testigo de carga funcionan',
  'Fluidos — nivel de líquido de frenos adecuado, si aplica',
  'Fluidos — nivel de dirección hidráulica adecuado, si aplica',
  'Luces — altas',
  'Luces — bajas',
  'Luces — direccionales delanteras',
  'Luces — direccionales traseras',
  'Luces — parqueo delanteras y traseras',
  'Luces — stop de freno',
  'Luces — reversa y alarma sonora',
  'Luces — laterales o cocuyos',
  'Luces — gálibo, si aplica',
  'Luces — placa',
  'Señalización — reflectivos y cinta reflectiva',
  'Visibilidad — parabrisas sin fracturas que afecten la conducción',
  'Visibilidad — vidrios laterales en buen estado',
  'Limpiaparabrisas — plumilla izquierda',
  'Limpiaparabrisas — plumilla derecha',
  'Lavaparabrisas — depósito, bomba y salida de agua',
  'Espejo — lateral derecho',
  'Espejo — lateral izquierdo',
  'Espejo — retrovisor interior',
  'Espejos — auxiliares o convexos, si aplica',
  'Frenos — freno principal o de servicio',
  'Frenos — freno de parqueo o emergencia',
  'Frenos — pedal con recorrido y respuesta normal',
  'Frenos — sistema de aire comprimido carga y mantiene presión',
  'Frenos — manómetros de presión funcionan',
  'Frenos — purga de tanques sin exceso de agua o aceite',
  'Frenos — mangueras y racores sin fugas ni desgaste',
  'Frenos — pulmones o cámaras en buen estado',
  'Frenos — líneas y mangueras sin grietas, corrosión o abombamientos',
  'Llantas — delanteras: estado, labrado y presión',
  'Llantas — traseras eje 1: estado, labrado y presión',
  'Llantas — traseras eje 2: estado, labrado y presión, si aplica',
  'Llantas — duales sin contacto ni objetos incrustados',
  'Llantas — repuesto en buen estado y con presión adecuada',
  'Llantas — portallanta firme y seguro',
  'Rines — sin fisuras, deformaciones ni soldaduras inseguras',
  'Ruedas — tuercas y pernos completos y ajustados',
  'Ruedas — válvulas y tapas presentes',
  'Dirección — volante sin juego excesivo ni dureza anormal',
  'Dirección — sistema hidráulico sin fugas',
  'Dirección — terminales, barras y crucetas sin desgaste',
  'Suspensión — ballestas o muelles sin hojas partidas',
  'Suspensión — abrazaderas y soportes firmes',
  'Suspensión — amortiguadores sin fugas',
  'Suspensión — bujes sin desgaste excesivo',
  'Suspensión — estabilizadores en buen estado',
  'Suspensión — bolsas de aire sin fisuras ni fugas, si aplica',
  'Cabina — silla del conductor en buen estado y firme',
  'Cabina — silla del acompañante en buen estado y firme',
  'Cabina — apoyacabezas delanteros',
  'Cabina — apoyacabezas traseros, si aplica',
  'Cabina — cinturón del conductor',
  'Cabina — cinturón del acompañante',
  'Cabina — cinturones traseros, si aplica',
  'Cabina — pedales sin desgaste o interferencias',
  'Cabina — piso libre de objetos sueltos',
  'Cabina — puertas, bisagras y seguros',
  'Cabina — pito o bocina',
  'Cabina — tablero e instrumentos',
  'Carrocería — estado general sin golpes o corrosión severa',
  'Carrocería — parachoques en buen estado',
  'Carrocería — guardabarros firmes',
  'Carrocería — bandas antiempotramiento firmes',
  'Carrocería — escalones o estribos firmes',
  'Zona de carga — furgón o platón sin perforaciones',
  'Zona de carga — piso en buen estado',
  'Zona de carga — paredes laterales firmes',
  'Zona de carga — techo sin daños o filtraciones',
  'Zona de carga — puertas y compuertas',
  'Zona de carga — seguros, cierres y pasadores',
  'Zona de carga — carpas y estacas, si aplica',
  'Zona de carga — elementos de amarre en buen estado',
  'Zona de carga — sin elementos sueltos que puedan caer',
  'Acople — quinta rueda o enganche, si aplica',
  'Acople — seguro y king pin, si aplica',
  'Acople — conexiones de aire y eléctricas, si aplica',
  'Acople — patas y pasadores de seguridad, si aplica',
  'Equipo de carretera — alicate',
  'Equipo de carretera — destornillador plano',
  'Equipo de carretera — destornillador de estrella',
  'Equipo de carretera — llave de expansión',
  'Equipo de carretera — juego básico de llaves fijas',
  'Equipo de carretera — cruceta apta para el vehículo',
  'Equipo de carretera — gato con capacidad adecuada',
  'Equipo de carretera — dos tacos aptos para bloqueo',
  'Equipo de carretera — dos señales reflectivas o conos',
  'Equipo de carretera — chaleco reflectivo',
  'Equipo de carretera — linterna funcional',
  'Botiquín — presente, completo y con elementos vigentes',
  'Extintor ABC — vigente, cargado, asegurado y sin daños',
]

export const ASPECTOS_POR_TIPO = {
  Moto: ASPECTOS_MOTO,
  Carro: ASPECTOS_CARRO,
  Camion: ASPECTOS_CAMION,
}

export const VALORES_POR_TIPO = {
  Moto: ['B', 'M'],
  Carro: ['B', 'M', 'N/A'],
  Camion: ['B', 'R', 'M', 'N/A'],
}

/** N/A puntual aunque el tipo no lo permita (1-based). Moto: 5 líquido de freno, 13 clutch. */
export const NA_PERMITIDO = { Moto: [5, 13] }

export function aspectosForTipo(tipo) {
  return ASPECTOS_POR_TIPO[tipo] || ASPECTOS_MOTO
}

export function valoresForTipo(tipo) {
  return VALORES_POR_TIPO[tipo] || ['B', 'M']
}

/** Valores válidos para un aspecto puntual (con las excepciones de N/A). */
export function valoresParaItem(tipo, idx1) {
  const base = valoresForTipo(tipo)
  if ((NA_PERMITIDO[tipo] || []).includes(idx1) && !base.includes('N/A')) {
    return ORDEN_VALORES.filter((v) => base.includes(v) || v === 'N/A')
  }
  return base
}

/** Leyenda «B = Bien · M = Mal …» del encabezado de aspectos. */
export function leyendaValores(tipo) {
  const base = valoresForTipo(tipo)
  const conNa = base.includes('N/A') || (NA_PERMITIDO[tipo] || []).length > 0
  const vals = conNa && !base.includes('N/A') ? [...base, 'N/A'] : base
  return vals.map((v) => `${v} = ${GRADE_LABEL[v]}`).join(' · ')
}

/** Todos los aspectos en B (la ventana original arranca así). */
export function aspectosIniciales(tipo) {
  const out = {}
  aspectosForTipo(tipo).forEach((label, i) => {
    out[String(i + 1)] = { valor: 'B', label }
  })
  return out
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

/** Color del % como en la ventana: ≥90 verde, ≥70 ámbar, si no naranja. */
export function nivelPorcentaje(pct) {
  if (pct == null) return ''
  return pct >= 90 ? 'ok' : pct >= 70 ? 'medio' : 'bajo'
}

export function normalizePlaca(s) {
  if (!s) return ''
  return String(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7)
}

// ── Listas de la ventana original ──────────────────────────────────────────
export const PROCESOS = ['Traslado', 'Mandado', 'Actividad misional']
export const LUGARES = ['La Esperanza', 'La Fe', 'La Planta', 'Municipio']
export const GASOLINA = ['Lleno', '3/4', '1/2', '1/4']
export const ESTADO_DOC = ['Vigente', 'Vencido', 'No tiene']
export const ESTADO_DOC_F = ['Vigente', 'Vencida', 'No tiene']
export const ESTADO_POLIZA = ['No aplica', 'Vigente', 'Vencida', 'No tiene']
export const TIPOS_CARGA = {
  POLLITO_VIVO: 'Pollito vivo',
  ALIMENTO: 'Alimento',
  HUEVO: 'Huevo',
  VIRUTA: 'Viruta',
  ABONO: 'Abono',
  COMPOST: 'Compost',
  CARGA_GENERAL: 'Carga general',
  OTRO: 'Otro',
}
export const LUGARES_DILIGENCIAMIENTO = ['La Planta', 'La Esperanza', 'La Fe']
export const MANTENIMIENTO_CAMION = [
  ['ultimo_cambio_aceite', 'Último cambio de aceite'],
  ['ultima_sincronizacion', 'Última sincronización / calibración'],
  ['ultima_alineacion_balanceo', 'Última alineación y balanceo'],
  ['ultimo_cambio_llantas', 'Último cambio de llantas'],
]
export const PLACEHOLDERS = {
  Moto: { marca: 'ej: Honda, Yamaha', motor: 'ej: 125, 190', linea: 'ej: CB190, YBR', modelo: 'ej: 2021' },
  Carro: { marca: 'ej: Chevrolet, Renault', motor: 'ej: 1400', linea: 'ej: Sail, Logan', modelo: 'ej: 2021' },
  Camion: { marca: 'ej: Freightliner, Kenworth', motor: 'ej: 6000', linea: 'ej: T680', modelo: 'ej: 2019' },
}

/** Días antes del vencimiento en que se avisa (como el original). */
export const UMBRAL_ALERTA_DOCUMENTOS_DIAS = 4

/** Días hasta una fecha AAAA-MM-DD (negativo = vencido). */
export function diasHasta(valor, hoy = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || '')
  if (!m) return null
  const vence = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((vence - h) / 86400000)
}

/** Aviso de vencimiento: { texto, nivel: 'vencido'|'alerta' } o null. */
export function avisoVencimiento(valor, hoy) {
  const dias = diasHasta(valor, hoy)
  if (dias === null) return null
  if (dias < 0) return { texto: `Documento vencido hace ${Math.abs(dias)} día(s)`, nivel: 'vencido' }
  if (dias <= UMBRAL_ALERTA_DOCUMENTOS_DIAS) {
    return { texto: dias === 0 ? 'El documento vence hoy' : `Alerta: vence en ${dias} día(s)`, nivel: 'alerta' }
  }
  return null
}

/** Conteo de M y R de un mapa de aspectos. */
export function contarCriticos(aspectos) {
  let m = 0
  let r = 0
  for (const v of Object.values(aspectos || {})) {
    const val = typeof v === 'object' && v ? v.valor : v
    if (val === 'M') m += 1
    if (val === 'R') r += 1
  }
  return { m, r }
}

/** ¿Algún documento del camión está vencido o no existe? (obliga a NO óptimo) */
export function documentoNoConforme(f, hoy) {
  if (f.tipo !== 'Camion') return false
  return [
    [f.soat, f.soat_venc],
    [f.certificado_emision, f.tecnomecanica_venc],
    [f.poliza_seguro, f.poliza_seguro_venc],
  ].some(([estado, venc]) => ['Vencido', 'Vencida', 'No tiene'].includes(estado) || (diasHasta(venc, hoy) ?? 0) < 0)
}

/**
 * Validación del formulario, igual a la ventana y al servidor original.
 * @param {object} f campos del formulario (nombres del original) + tipo, aspectos, evidencias, firma, gps
 * @returns {Record<string,string>} campo → mensaje («_global» para los avisos generales)
 */
export function validarInspeccion(f, hoy = new Date()) {
  const e = {}
  const t = (v) => String(v ?? '').trim()
  if (normalizePlaca(f.placa).length < 5) e.placa = 'Inválida'
  if (!t(f.proceso)) e.proceso = 'Requerido'
  if (!t(f.desde)) e.desde = 'Requerido'
  if (!t(f.hasta)) e.hasta = 'Requerido'
  if (t(f.marca).length < 2) e.marca = 'Requerido (mínimo 2 caracteres)'
  if (!t(f.gasolina)) e.gasolina = 'Requerido'
  if (t(f.linea).length < 2) e.linea = 'Requerido'
  if (!t(f.porte_propiedad)) e.porte_propiedad = 'Requerido'
  if (!t(f.soat)) e.soat = 'Requerido'
  if (!t(f.certificado_emision)) e.certificado_emision = 'Requerido'
  if (t(f.licencia_num) && t(f.licencia_num).length < 6) e.licencia_num = 'Mínimo 6 caracteres'
  if (t(f.motor) && !/^\d{2,4}$/.test(t(f.motor))) e.motor = 'Solo números (2 a 4 dígitos)'
  if (t(f.modelo) && !/^\d{4}$/.test(t(f.modelo))) e.modelo = 'Año inválido, usa 4 dígitos (ej: 2021)'
  if (t(f.licencia_venc) && (diasHasta(t(f.licencia_venc), hoy) ?? 0) < 0) {
    e.licencia_venc = 'Licencia vencida: debe estar vigente'
  }
  if (f.tipo === 'Camion') {
    if (!/^\d{1,7}$/.test(t(f.kilometraje).replace(/[.,]/g, ''))) e.kilometraje = 'Solo números'
    if (!t(f.numero_interno)) e.numero_interno = 'Requerido para camiones'
    if (!t(f.ciudad)) e.ciudad = 'Requerido para camiones'
    if (!t(f.empresa)) e.empresa = 'Requerido para camiones'
    if (!t(f.ubicacion)) e.ubicacion = 'Requerido'
    if (!ESTADO_POLIZA.includes(f.poliza_seguro)) e.poliza_seguro = 'Seleccione el estado de la póliza'
    if (!TIPOS_CARGA[f.tipo_carga]) e.tipo_carga = 'Seleccione un tipo de carga'
    else if (f.tipo_carga === 'OTRO' && t(f.tipo_carga_otro).length < 3) e.tipo_carga_otro = 'Especifique la carga'
    for (const [estado, venc, nombre] of [
      ['soat', 'soat_venc', 'SOAT'],
      ['certificado_emision', 'tecnomecanica_venc', 'CDA'],
      ['poliza_seguro', 'poliza_seguro_venc', 'póliza'],
    ]) {
      if (f[estado] !== 'No tiene' && !t(f[venc])) e[venc] = `Indique vencimiento de ${nombre}`
    }
    if (f.gps?.lat == null) e.gps = 'GPS obligatorio'
  }
  // Todos los aspectos con un valor válido para su ítem
  const lista = aspectosForTipo(f.tipo)
  const asp = f.aspectos || {}
  const validos = lista.filter((_, i) => {
    const v = asp[String(i + 1)]
    const val = typeof v === 'object' && v ? v.valor : v
    return valoresParaItem(f.tipo, i + 1).includes(val)
  }).length
  if (validos !== lista.length) e._global = `Debes revisar todos los ${lista.length} aspectos. Solo ${validos} completados.`
  // Foto en cada M o R
  const faltan = lista
    .map((_, i) => String(i + 1))
    .filter((k) => ['M', 'R'].includes(asp[k]?.valor ?? asp[k]) && !f.evidencias?.[k])
  if (faltan.length) e._global = '📷 Todo M o R necesita foto de evidencia.'
  if (!f.firma) e.firma = 'Debes firmar'
  const { m, r } = contarCriticos(asp)
  const obs = t(f.observaciones).length
  if (m > 0 && obs < 60) e.observaciones = `Hay M → mínimo 60 caracteres (${obs})`
  else if (r > 0 && obs < 40) e.observaciones = `Hay R → mínimo 40 caracteres (${obs})`
  else if (documentoNoConforme(f, hoy) && obs < 40) {
    e.observaciones = `Un documento vencido o inexistente exige observación de mínimo 40 caracteres (${obs})`
  }
  return e
}

// ── Formato FOSST22 anterior (inspecciones guardadas antes del 06-10-2026) ──
const FOSST22_MOTO = [
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

const FOSST22_VEHICULO = [
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

/** Lista con que se guardó una inspección vieja (13 moto / 50 carro y camión). */
export function aspectosFosst22(tipo) {
  return tipo === 'Moto' ? FOSST22_MOTO : FOSST22_VEHICULO
}
