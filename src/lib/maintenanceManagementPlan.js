/**
 * =============================================================================
 * ARCHIVO: src/lib/maintenanceManagementPlan.js
 * PROPÓSITO: Contenido y cálculo de indicadores del "Plan de Gestión del
 *   Mantenimiento" (MTO-PLA-001) para exportarlo a Excel EN VIVO desde
 *   IncubApp. El documento oficial (política firmada, marco de referencia
 *   narrativo, PDF para auditoría) vive en la carpeta MANTENIMIENTO como
 *   MTO-PLA-001 v1.0 OFICIAL; este módulo reutiliza su misma estructura de
 *   contenido pero recalcula los resultados/indicadores con datos actuales
 *   de la base de datos, no con el corte estático del documento.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

export const PLAN_CODE = 'MTO-PLA-001'
export const PLAN_TECH_DOC = 'MTO-PRG-001 v2.1 OFICIAL'

export const MAINTENANCE_POLICY =
  'ANTIOQUEÑA DE INCUBACIÓN S.A.S. se compromete a mantener sus instalaciones, equipos e infraestructura en ' +
  'condiciones que garanticen la continuidad operativa, el cumplimiento de la normativa sanitaria del ICA ' +
  '(Res. 3650 y 3651 de 2014), la seguridad de las personas y el uso eficiente de los recursos de mantenimiento, ' +
  'con un enfoque PREDOMINANTEMENTE PREVENTIVO apoyado en trazabilidad digital (IncubApp) y mejora continua ' +
  'basada en datos reales de operación.'

export const MAINTENANCE_OBJECTIVES = [
  { Objetivo: 'Disponibilidad de equipos críticos', 'Meta medible': 'Disponibilidad de incubadoras/nacedoras en incubación activa ≥ 98 %', Frecuencia: 'Mensual' },
  { Objetivo: 'Cumplimiento del programa preventivo', 'Meta medible': 'Ejecutar ≥ 95 % de las tareas preventivas programadas dentro de la semana asignada', Frecuencia: 'Mensual' },
  { Objetivo: 'Trazabilidad y calibración', 'Meta medible': 'Calibrar el 100 % de los instrumentos críticos con evidencia fotográfica y tolerancia en IncubApp', Frecuencia: 'Mensual' },
  { Objetivo: 'Migración a mantenimiento planeado', 'Meta medible': 'Relación preventivo/correctivo ≥ 80/20 en 12 meses', Frecuencia: 'Trimestral' },
  { Objetivo: 'Costeo del mantenimiento', 'Meta medible': 'Registrar el costo de todas las OT para tener línea base en 6 meses', Frecuencia: 'Semestral' },
  { Objetivo: 'Cobertura total del inventario', 'Meta medible': 'Completar el levantamiento de G-GRANJA LA ESPERANZA', Frecuencia: 'Una vez, 90 días' },
]

export const MAINTENANCE_FRAMEWORK = [
  { Aspecto: 'Estándar de referencia adoptado', Descripción: 'ISO 55001:2014 «Gestión de activos» (NTC-ISO 55001), como marco internacional de mejores prácticas mientras la Gerencia define la entidad certificadora específica.' },
  { Aspecto: 'Relación con la normativa ICA vigente', Descripción: 'Las Res. ICA 3650/2014 y 3651/2014 ya exigen POE de mantenimiento, periodicidad y registros ≥ 1 año (cumplidos en MTO-PRG-001 v2.1). Este plan eleva esa base técnica a un sistema de GESTIÓN.' },
  { Aspecto: 'Documento técnico asociado', Descripción: `${PLAN_TECH_DOC} contiene el inventario de 65 equipos, la matriz RACI, los planes de tarea por sede y el cronograma de 52 semanas. Este plan referencia ese detalle, no lo repite.` },
]

export const MAINTENANCE_STRATEGY_TYPES = [
  { Tipo: 'Preventivo', Definición: 'Intervención programada por tiempo o uso, antes de la falla.', 'Dónde vive': `${PLAN_TECH_DOC} hojas 06.1–06.3 y cronograma hoja 07.` },
  { Tipo: 'Predictivo', Definición: 'Medición del estado real del equipo para anticipar la falla.', 'Dónde vive': 'Calibración de temperatura/humedad con evidencia fotográfica en IncubApp.' },
  { Tipo: 'Detectivo / por ronda', Definición: 'Verificación periódica del estado sin intervención.', 'Dónde vive': 'Rondas de supervisión (módulo Monitoreo/Supervisión de IncubApp).' },
  { Tipo: 'Correctivo', Definición: 'Intervención después de la falla o de una novedad detectada en ronda.', 'Dónde vive': 'Órdenes de trabajo tipo "corrective" en IncubApp.' },
]

export const MAINTENANCE_RISKS = [
  { Riesgo: 'Costo de mantenimiento no se registra', Probabilidad: 'Alta', Impacto: 'Alto — imposibilita presupuestar y demostrar eficiencia', 'Mitigación / acción': 'Hacer obligatorio el campo de costo al cerrar cada OT.' },
  { Riesgo: 'G-GRANJA LA ESPERANZA sin inventario', Probabilidad: 'Alta', Impacto: 'Alto — esa sede queda fuera del sistema de gestión', 'Mitigación / acción': 'Levantamiento de inventario en 90 días.' },
  { Riesgo: 'Roles clave sin titular (mantenimiento, farm, auxiliares)', Probabilidad: 'Alta', Impacto: 'Alto — sin responsable nominal no hay quién rinda cuentas', 'Mitigación / acción': 'Asignación administrativa inmediata por Gerencia/RR.HH.' },
  { Riesgo: 'Relación preventivo/correctivo por debajo de meta', Probabilidad: 'Media', Impacto: 'Medio — mayor exposición a fallas no anticipadas', 'Mitigación / acción': 'Formalizar clasificación de OT de inspección y reforzar el cronograma.' },
  { Riesgo: 'Backlog de órdenes abiertas', Probabilidad: 'Media', Impacto: 'Medio — riesgo de acumulación si no se gestiona', 'Mitigación / acción': 'Revisión de backlog en cada comité de mantenimiento.' },
]

export const MAINTENANCE_REVIEW_CYCLE = [
  { Instancia: 'Comité de mantenimiento', Periodicidad: 'Mensual', Participantes: 'Coordinación de mantenimiento + Coordinación de planta/granja', Entradas: 'Indicadores del mes, backlog de OT, novedades de ronda, calibraciones pendientes', Salidas: 'Ajustes de programación' },
  { Instancia: 'Revisión gerencial del sistema', Periodicidad: 'Semestral', Participantes: 'Gerencia + Coordinación de mantenimiento', Entradas: 'Cumplimiento de objetivos, resultados del periodo, riesgos', Salidas: 'Decisiones de recursos, cambios de política' },
  { Instancia: 'Revisión anual del plan', Periodicidad: 'Anual', Participantes: 'Gerencia + Coordinaciones', Entradas: 'Todo lo anterior + vigencia normativa', Salidas: 'Nueva versión del plan' },
]

export const MAINTENANCE_DOC_MAP = [
  { Código: PLAN_CODE, Versión: '1.0', Documento: 'Plan de Gestión del Mantenimiento', 'Dónde está': 'Carpeta MANTENIMIENTO (PDF/Excel oficial) + este export en vivo desde IncubApp' },
  { Código: 'MTO-PRG-001', Versión: '2.1', Documento: 'Programa de Mantenimiento Preventivo', 'Dónde está': 'Carpeta MANTENIMIENTO' },
  { Código: 'POE núm. 1.9 / Formato 2.2.10', Versión: 'Vigente', Documento: 'Procedimiento y formato de calibración exigidos por el ICA', 'Dónde está': 'Res. ICA 3650/2014 y 3651/2014' },
  { Código: 'IncubApp', Versión: 'Producción', Documento: 'Sistema de gestión de operación y mantenimiento', 'Dónde está': 'incubant-app.vercel.app' },
]

const TEMP_TOLERANCE_F = 0.2 // ≈ ±0,1 °C
const RH_TOLERANCE_PCT = 2

/** Cuenta rondas por condición (normal/warning/fault/off). */
export function summarizeChecks(checks = []) {
  const s = { normal: 0, warning: 0, fault: 0, off: 0 }
  for (const c of checks) s[c.condition] = (s[c.condition] ?? 0) + 1
  const total = checks.length
  const activeTotal = total - s.off
  const conformidad = activeTotal > 0 ? (s.normal / activeTotal) * 100 : null
  return { total, ...s, activeTotal, conformidadPct: conformidad }
}

/** Compone el resumen de órdenes de trabajo (tipo, estado, MTTR proxy, downtime, costo). */
export function summarizeWorkOrders(orders = []) {
  const byType = {}
  const byStatus = {}
  let downtimeTotal = 0
  let costTotal = 0
  let resolvedCount = 0
  let resolvedHoursSum = 0
  for (const o of orders) {
    byType[o.type] = (byType[o.type] ?? 0) + 1
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1
    if (o.downtime_minutes) downtimeTotal += Number(o.downtime_minutes) || 0
    if (o.cost) costTotal += Number(o.cost) || 0
    if (o.completed_at && o.created_at) {
      const hrs = (new Date(o.completed_at) - new Date(o.created_at)) / 3_600_000
      if (Number.isFinite(hrs) && hrs >= 0) {
        resolvedCount += 1
        resolvedHoursSum += hrs
      }
    }
  }
  const preventive = byType.preventive ?? 0
  const corrective = byType.corrective ?? 0
  const inspection = byType.inspection ?? 0
  const pcRatioPct = preventive + corrective > 0 ? (preventive / (preventive + corrective)) * 100 : null
  return {
    total: orders.length,
    byType,
    byStatus,
    preventive,
    corrective,
    inspection,
    pcRatioPct,
    mttrHours: resolvedCount > 0 ? resolvedHoursSum / resolvedCount : null,
    resolvedCount,
    downtimeMinutesTotal: downtimeTotal,
    costTotal,
  }
}

/** Marca cada calibración como dentro/fuera de tolerancia y arma la fila de reporte. */
export function summarizeCalibrations(calibrations = [], machineName = {}) {
  const rows = calibrations.map((c) => {
    const tOk = c.temp_delta_f == null || Math.abs(Number(c.temp_delta_f)) <= TEMP_TOLERANCE_F
    const hOk = c.rh_delta_pct == null || Math.abs(Number(c.rh_delta_pct)) <= RH_TOLERANCE_PCT
    return {
      Equipo: machineName[c.machine_id] || c.machine_id,
      Alcance: c.scope,
      'Δ Temperatura (°F)': c.temp_delta_f ?? '—',
      'Δ Humedad (pp)': c.rh_delta_pct ?? '—',
      'Dentro de tolerancia': tOk && hOk ? 'Sí' : 'No',
      Fecha: c.calibrated_at ? c.calibrated_at.slice(0, 10) : '—',
    }
  })
  const withinTolerance = rows.filter((r) => r['Dentro de tolerancia'] === 'Sí').length
  return { rows, total: rows.length, withinTolerance }
}

/**
 * Construye la hoja "Resultados reales" e "Indicadores" con datos vivos.
 * @returns {{ resultsRows: object[], indicatorRows: object[] }}
 */
export function buildLiveResultsAndIndicators({ checks, orders, calibrations, machineName, corte }) {
  const chk = summarizeChecks(checks)
  const wo = summarizeWorkOrders(orders)
  const cal = summarizeCalibrations(calibrations, machineName)

  const resultsRows = [
    { Métrica: 'Rondas de supervisión registradas', Valor: chk.total, Nota: 'Total histórico disponible en IncubApp' },
    { Métrica: 'Condición de las rondas', Valor: `${chk.normal} sin novedad · ${chk.off} apagada/fuera de ciclo · ${chk.fault} falla`, Nota: `Sobre ${chk.total} rondas` },
    { Métrica: 'Conformidad sobre máquinas activas', Valor: chk.conformidadPct != null ? `${chk.conformidadPct.toFixed(1)} %` : '—', Nota: 'Excluye rondas de máquinas apagadas' },
    { Métrica: 'Órdenes de trabajo totales', Valor: wo.total, Nota: `${wo.byStatus.completed ?? 0} completadas · ${(wo.byStatus.open ?? 0) + (wo.byStatus.in_progress ?? 0)} abiertas/en curso` },
    { Métrica: 'Composición por tipo', Valor: `${wo.preventive} preventivas · ${wo.corrective} correctivas · ${wo.inspection} de inspección`, Nota: 'Fuente: work_orders' },
    { Métrica: 'Tiempo promedio de resolución (MTTR proxy)', Valor: wo.mttrHours != null ? `${wo.mttrHours.toFixed(1)} horas` : 'Sin datos', Nota: `Sobre ${wo.resolvedCount} OT con fecha de cierre` },
    { Métrica: 'Tiempo de parada acumulado', Valor: `${wo.downtimeMinutesTotal} minutos`, Nota: 'Suma de downtime_minutes registrado' },
    { Métrica: 'Calibraciones ejecutadas', Valor: cal.total, Nota: `${cal.withinTolerance} de ${cal.total} dentro de tolerancia` },
    { Métrica: 'Costo de mantenimiento registrado', Valor: `$ ${wo.costTotal.toLocaleString('es-CO')}`, Nota: wo.costTotal === 0 ? 'HALLAZGO: el costo no se está registrando' : '' },
  ]

  const indicatorRows = [
    { Indicador: 'Cumplimiento de calibración', Meta: '100 %', 'Valor real': `${cal.withinTolerance} de ${cal.total} conformes`, 'Brecha / acción': cal.total === 0 ? 'Sin calibraciones registradas aún' : (cal.withinTolerance === cal.total ? 'Cumple' : 'Revisar las no conformes') },
    { Indicador: 'Disponibilidad (proxy por rondas)', Meta: '≥ 98 %', 'Valor real': chk.conformidadPct != null ? `${chk.conformidadPct.toFixed(1)} %` : '—', 'Brecha / acción': chk.conformidadPct != null && chk.conformidadPct >= 98 ? 'Cumple' : 'Investigar fallas registradas' },
    { Indicador: 'MTTR', Meta: 'Tendencia decreciente', 'Valor real': wo.mttrHours != null ? `${wo.mttrHours.toFixed(1)} h` : 'Sin datos', 'Brecha / acción': 'Registrar downtime en el 100 % de las OT' },
    { Indicador: 'Relación preventivo/correctivo', Meta: '≥ 80 %', 'Valor real': wo.pcRatioPct != null ? `${wo.pcRatioPct.toFixed(0)} %` : 'Sin datos', 'Brecha / acción': wo.pcRatioPct != null && wo.pcRatioPct >= 80 ? 'Cumple' : 'Formalizar clasificación de inspecciones y reforzar el cronograma' },
    { Indicador: 'Costo de mantenimiento', Meta: 'Línea base a definir', 'Valor real': `$ ${wo.costTotal.toLocaleString('es-CO')}`, 'Brecha / acción': wo.costTotal === 0 ? 'Exigir el campo de costo al cerrar OT' : 'Consolidar tendencia' },
    { Indicador: 'Backlog de OT abiertas', Meta: 'Tendencia decreciente', 'Valor real': (wo.byStatus.open ?? 0) + (wo.byStatus.in_progress ?? 0), 'Brecha / acción': 'Revisar en el comité mensual (hoja Revisión por la dirección)' },
  ]

  return { resultsRows, indicatorRows, corte }
}
