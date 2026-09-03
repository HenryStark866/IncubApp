/**
 * Calibración de incubadoras (INC) y nacedoras.
 *
 * Sensores: temperatura (°F) y humedad (%).
 * INC: ventana 1d12h – 2d12h (36–60 h).
 * Nacedoras: post-nacimiento y pre-transferencia.
 *
 * Henry Stark Desarrollador · CDH Maker
 */

/** 1 día 12 horas */
export const INC_CALIB_MIN_HOURS = 36
/** 2 días 12 horas */
export const INC_CALIB_MAX_HOURS = 60

export const CALIB_SOURCE = 'calibration'

export const CALIB_REASON = {
  inc_window: 'inc_window',
  post_hatch: 'post_hatch',
  pre_transfer: 'pre_transfer',
  manual: 'manual',
}

export const CALIB_REASON_LABEL = {
  inc_window: 'Ventana de ciclo INC (1d12h–2d12h)',
  post_hatch: 'Después de nacimiento',
  pre_transfer: 'Antes de transferencia',
  manual: 'Calibración manual',
}

/** Qué sensores calibrar (el calibrador no siempre da punto en ambos a la vez) */
export const CALIB_SCOPE = {
  temperature: 'temperature',
  humidity: 'humidity',
  both: 'both',
}

export const CALIB_SCOPE_LABEL = {
  temperature: 'Temperatura (°F)',
  humidity: 'Humedad (%)',
  both: 'Temperatura y humedad',
}

/** Roles que ejecutan la calibración y sus líderes. */
export function canPerformCalibration(role) {
  return [
    'operator',
    'auxiliary',
    'auxiliary_production',
    'maintenance_auxiliary',
    'supervisor',
    'coordinator',
    'owner',
    'admin',
    'management',
    'management_auxiliary',
  ].includes(role)
}

/** Coordinador / líder: sincronizar estado de máquinas y ver todos los reportes. */
export function canManageMachineState(role) {
  return [
    'owner',
    'admin',
    'supervisor',
    'coordinator',
    'management',
    'management_auxiliary',
  ].includes(role)
}

export function isIncubatorType(type) {
  return type === 'setter' || type === 'combo'
}

export function isHatcherType(type) {
  return type === 'hatcher' || type === 'combo'
}

export function cycleAgeHours(cycleStartAt) {
  if (!cycleStartAt) return null
  const ms = Date.now() - new Date(cycleStartAt).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  return ms / 3_600_000
}

export function incCalibrationWindow(cycleStartAt) {
  const hours = cycleAgeHours(cycleStartAt)
  if (hours == null) return { inWindow: false, hours: null, label: '—' }
  const d = Math.floor(hours / 24)
  const h = Math.floor(hours % 24)
  const label = `${d}d ${h}h`
  const inWindow = hours >= INC_CALIB_MIN_HOURS && hours < INC_CALIB_MAX_HOURS
  return { inWindow, hours, label }
}

export function calibTag(reason) {
  return `[calib:${reason || CALIB_REASON.manual}]`
}

export function parseCalibReason(description) {
  const m = String(description || '').match(/\[calib:([a-z_]+)\]/i)
  return m?.[1] || null
}

export function buildCalibTitle(machine, reason, scope) {
  const code = machine?.code || machine?.name || 'máquina'
  const why = CALIB_REASON_LABEL[reason] || CALIB_REASON_LABEL.manual
  const sc = scope && scope !== 'both' ? ` · ${CALIB_SCOPE_LABEL[scope] || scope}` : ''
  return `Calibración · ${code} · ${why}${sc}`
}

export function buildCalibDescription(machine, reason, extra, scope) {
  const parts = [
    calibTag(reason),
    scope ? `[scope:${scope}]` : '',
    `Calibrar ${machine?.name || 'máquina'} (${machine?.code || '—'}).`,
    'Sensores: temperatura °F y/o humedad %.',
    'Evidencia: foto del calibrador + foto de la pantalla de la máquina.',
    CALIB_REASON_LABEL[reason] || '',
    extra || '',
  ]
  return parts.filter(Boolean).join(' ')
}

export function formatCalibReadings(row) {
  const bits = []
  if (row.scope === 'temperature' || row.scope === 'both' || row.temp_machine_f != null) {
    bits.push(
      `T° ${fmtN(row.temp_machine_f)}→${fmtN(row.temp_calibrator_f)} °F` +
        (row.temp_delta_f != null ? ` (Δ ${fmtN(row.temp_delta_f)})` : '')
    )
  }
  if (row.scope === 'humidity' || row.scope === 'both' || row.rh_machine_pct != null) {
    bits.push(
      `HR ${fmtN(row.rh_machine_pct)}→${fmtN(row.rh_calibrator_pct)} %` +
        (row.rh_delta_pct != null ? ` (Δ ${fmtN(row.rh_delta_pct)})` : '')
    )
  }
  return bits.join(' · ') || '—'
}

function fmtN(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : '—'
}

/** Valida lecturas según scope */
export function validateCalibReadings({ scope, tempMachineF, tempCalibratorF, rhMachinePct, rhCalibratorPct }) {
  const sc = scope || CALIB_SCOPE.both
  if (sc === CALIB_SCOPE.temperature || sc === CALIB_SCOPE.both) {
    if (tempMachineF === '' || tempMachineF == null) return 'Indique la temperatura de la pantalla (°F)'
    if (tempCalibratorF === '' || tempCalibratorF == null) return 'Indique la temperatura del calibrador (°F)'
    const tm = Number(tempMachineF)
    const tc = Number(tempCalibratorF)
    if (!Number.isFinite(tm) || tm < 50 || tm > 120) return 'Temperatura máquina fuera de rango (50–120 °F)'
    if (!Number.isFinite(tc) || tc < 50 || tc > 120) return 'Temperatura calibrador fuera de rango (50–120 °F)'
  }
  if (sc === CALIB_SCOPE.humidity || sc === CALIB_SCOPE.both) {
    if (rhMachinePct === '' || rhMachinePct == null) return 'Indique la humedad de la pantalla (%)'
    if (rhCalibratorPct === '' || rhCalibratorPct == null) return 'Indique la humedad del calibrador (%)'
    const hm = Number(rhMachinePct)
    const hc = Number(rhCalibratorPct)
    if (!Number.isFinite(hm) || hm < 0 || hm > 100) return 'Humedad máquina fuera de rango (0–100 %)'
    if (!Number.isFinite(hc) || hc < 0 || hc > 100) return 'Humedad calibrador fuera de rango (0–100 %)'
  }
  return null
}
