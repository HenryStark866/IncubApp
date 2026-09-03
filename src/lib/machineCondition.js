/**
 * Catálogo de condición de máquina (rondas de supervisión).
 * Antes vivía copiado igual en MonitorMode, LeaderOpsMap, SupervisionPanel y
 * CoordinatorDashboard — una sola fuente evita que se desincronicen.
 * Henry Stark Desarrollador
 */

export const CONDITIONS = [
  { value: 'normal', label: 'Sin novedad', cls: 'ok' },
  { value: 'warning', label: 'Alerta', cls: 'warn' },
  { value: 'fault', label: 'Falla', cls: 'off' },
  { value: 'off', label: 'Apagada', cls: 'idle' },
]

export const conditionOf = (v) => CONDITIONS.find((c) => c.value === v) ?? { label: v, cls: '', value: v }
