/**
 * =============================================================================
 * ARCHIVO: src/components/DataFixPanel.jsx
 * PROPÓSITO: Componente UI «DataFixPanel»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Edición central de datos operativos ingresados por usuarios.
 * Desde lotes de pollas en granja y huevos diarios hasta OT, turnos, CRM, etc.
 * Owner / admin / gerencia / desarrollador (y admin de plataforma).
 */

const fmtDT = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const isoToLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const localToIso = (v) => (v ? new Date(v).toISOString() : null)

const GROUPS = [
  { id: 'granja', label: 'Granja' },
  { id: 'huevos', label: 'Huevos y cuarto frío' },
  { id: 'planta', label: 'Planta e incubación' },
  { id: 'ops', label: 'Operación y mantenimiento' },
  { id: 'turnos', label: 'Turnos y personal' },
  { id: 'comercial', label: 'Comercial' },
  { id: 'maestros', label: 'Maestros (planta / salas / máquinas)' },
  { id: 'sistema', label: 'Sistema' },
]

/** Conjuntos editables: granja → huevo → planta → comercial → maestros */
const DATASETS = {
  bird_batches: {
    group: 'granja',
    label: 'Lotes de aves (levante / producción)',
    table: 'bird_batches',
    select:
      'id, farm_id, code, arrival_date, hens_received, roosters_received, arrival_age_weeks, estimated_levante_days, daily_feed_kg, status, notes, avg_weight_g, grading_notes, levante_started_at, production_started_at, created_at',
    orderBy: 'created_at',
    hasUpdatedAt: true,
    title: (r, maps) => `${r.code || r.id} · ${maps.plants[r.farm_id] ?? 'Granja'}`,
    sub: (r) =>
      `Llegada ${r.arrival_date || '—'} · ${r.hens_received ?? 0} H / ${r.roosters_received ?? 0} M · ${r.status}`,
    fields: [
      { key: 'code', label: 'Código de lote', type: 'text' },
      { key: 'arrival_date', label: 'Fecha de llegada', type: 'date' },
      { key: 'hens_received', label: 'Hembras recibidas', type: 'number' },
      { key: 'roosters_received', label: 'Machos recibidos', type: 'number' },
      { key: 'arrival_age_weeks', label: 'Edad llegada (semanas)', type: 'number' },
      { key: 'estimated_levante_days', label: 'Días levante estimados', type: 'number' },
      { key: 'daily_feed_kg', label: 'Comida diaria (kg)', type: 'number' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['received', 'Recibido / por aprobar'],
          ['levante', 'En levante'],
          ['production', 'En producción (post-grading)'],
          ['closed', 'Cerrado'],
        ],
      },
      { key: 'avg_weight_g', label: 'Peso grading (g)', type: 'number' },
      { key: 'grading_notes', label: 'Notas de grading', type: 'text' },
      { key: 'notes', label: 'Notas', type: 'text' },
      { key: 'levante_started_at', label: 'Inicio levante', type: 'datetime' },
      { key: 'production_started_at', label: 'Inicio producción (tras grading)', type: 'datetime' },
    ],
  },
  batch_placements: {
    group: 'granja',
    label: 'Distribución de lotes por galpón',
    table: 'batch_placements',
    select: 'id, batch_id, room_id, stage, hens, roosters',
    orderBy: 'id',
    title: (r, maps) =>
      `Lote ${maps.batches[r.batch_id] ?? r.batch_id?.slice?.(0, 8)} · ${maps.rooms[r.room_id] ?? 'Galpón'}`,
    sub: (r) => `Etapa ${r.stage} · ${r.hens ?? 0} H / ${r.roosters ?? 0} M`,
    fields: [
      {
        key: 'stage',
        label: 'Etapa',
        type: 'select',
        options: [
          ['levante', 'Levante'],
          ['production', 'Producción'],
        ],
      },
      { key: 'hens', label: 'Hembras', type: 'number' },
      { key: 'roosters', label: 'Machos', type: 'number' },
    ],
  },
  farm_daily_logs: {
    group: 'granja',
    label: 'Registro diario de granja',
    table: 'farm_daily_logs',
    select: 'id, batch_id, room_id, log_date, feed_kg, deaths, notes, recorded_by',
    orderBy: 'log_date',
    title: (r, maps) =>
      `${maps.rooms[r.room_id] ?? 'Galpón'} · ${r.log_date} · lote ${maps.batches[r.batch_id] ?? '—'}`,
    sub: (r, maps) =>
      `Comida ${r.feed_kg ?? '—'} kg · Muertes ${r.deaths ?? 0} · ${maps.people[r.recorded_by] ?? '—'}`,
    fields: [
      { key: 'log_date', label: 'Fecha', type: 'date' },
      { key: 'feed_kg', label: 'Comida (kg)', type: 'number' },
      { key: 'deaths', label: 'Aves muertas', type: 'number' },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  egg_reports: {
    group: 'huevos',
    label: 'Reportes diarios de huevo',
    table: 'egg_reports',
    select:
      'id, farm_id, batch_id, room_id, report_date, status, counts, notes, reported_by, received_counts, verified_by, verified_at, received_by, received_at',
    orderBy: 'report_date',
    hasUpdatedAt: true,
    eggCounts: true,
    title: (r, maps) =>
      `${maps.rooms[r.room_id] ?? 'Galpón'} · ${r.report_date} · lote ${maps.batches[r.batch_id] ?? '—'}`,
    sub: (r, maps) => {
      const c = r.counts || {}
      const parts = Object.entries(c)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${maps.eggCatLabels[k] || k}: ${v}`)
      return `Estado: ${r.status} · ${maps.people[r.reported_by] ?? '—'} · ${parts.join(' · ') || 'sin conteos'}`
    },
    fields: [
      { key: 'report_date', label: 'Fecha del reporte', type: 'date' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['reported', 'Reportado'],
          ['verified', 'Verificado'],
          ['received', 'Recibido'],
        ],
      },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  egg_categories: {
    group: 'huevos',
    label: 'Categorías de huevo (tipificación)',
    table: 'egg_categories',
    select: 'id, code, name, kind, sort_order, active',
    orderBy: 'sort_order',
    orderAsc: true,
    title: (r) => `${r.name} (${r.code})`,
    sub: (r) => `${r.kind || '—'} · orden ${r.sort_order ?? 0} · ${r.active ? 'activa' : 'inactiva'}`,
    fields: [
      { key: 'code', label: 'Código', type: 'text' },
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'kind', label: 'Tipo / clase', type: 'text' },
      { key: 'sort_order', label: 'Orden', type: 'number' },
      {
        key: 'active',
        label: 'Activa',
        type: 'select',
        options: [
          ['true', 'Sí'],
          ['false', 'No'],
        ],
      },
    ],
  },
  cold_room_stock: {
    group: 'huevos',
    label: 'Saldos cuarto frío',
    table: 'cold_room_stock',
    select: 'id, batch_id, room_id, stock_date, counts, notes',
    orderBy: 'stock_date',
    hasUpdatedAt: true,
    eggCounts: true,
    title: (r, maps) =>
      `${maps.rooms[r.room_id] ?? 'Sala'} · ${r.stock_date} · lote ${maps.batches[r.batch_id] ?? '—'}`,
    sub: (r, maps) => {
      const c = r.counts || {}
      return (
        Object.entries(c)
          .filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => `${maps.eggCatLabels[k] || k}: ${v}`)
          .join(' · ') || 'sin conteos'
      )
    },
    fields: [
      { key: 'stock_date', label: 'Fecha', type: 'date' },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  egg_classifications: {
    group: 'huevos',
    label: 'Clasificaciones de huevo',
    table: 'egg_classifications',
    select:
      'id, batch_id, room_id, activity_date, operators_count, carts_count, classification_type, notes',
    orderBy: 'activity_date',
    title: (r) => `${r.activity_date} · ${r.classification_type} · ${r.carts_count} carros`,
    sub: (r, maps) =>
      `Operarios ${r.operators_count} · ${maps.rooms[r.room_id] ?? ''} · lote ${maps.batches[r.batch_id] ?? '—'}`,
    fields: [
      { key: 'activity_date', label: 'Fecha', type: 'date' },
      { key: 'operators_count', label: 'Operarios', type: 'number' },
      { key: 'carts_count', label: 'Carros', type: 'number' },
      {
        key: 'classification_type',
        label: 'Tipo',
        type: 'select',
        options: [
          ['sencilla', 'Sencilla'],
          ['doble', 'Doble'],
        ],
      },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  setter_loads: {
    group: 'planta',
    label: 'Cargues de incubadora',
    table: 'setter_loads',
    select: 'id, lote, machine_id, loaded_at, cycle_start_at, created_by',
    orderBy: 'loaded_at',
    title: (r, maps) => `${r.lote} · ${maps.machines[r.machine_id] ?? 'Máquina'}`,
    sub: (r, maps) =>
      `Cargue ${fmtDT(r.loaded_at)} · Inicio ${fmtDT(r.cycle_start_at)} · ${maps.people[r.created_by] ?? '—'}`,
    fields: [
      { key: 'lote', label: 'Lote', type: 'text' },
      { key: 'loaded_at', label: 'Fecha de cargue', type: 'datetime' },
      { key: 'cycle_start_at', label: 'Inicio de ciclo', type: 'datetime' },
    ],
  },
  transfers: {
    group: 'planta',
    label: 'Transferencias a nacedora',
    table: 'transfers',
    select: 'id, lote, mode, room_ids, weight_diff, cycle_start_at, transferred_at, created_by',
    orderBy: 'transferred_at',
    title: (r) => `${r.lote} · ${r.mode === 'double' ? 'Doble' : 'Sencilla'}`,
    sub: (r, maps) =>
      `Transferida ${fmtDT(r.transferred_at)} · Salas: ${(r.room_ids ?? [])
        .map((id) => maps.rooms[id] ?? '?')
        .join(' + ')} · ${maps.people[r.created_by] ?? '—'}`,
    fields: [
      { key: 'lote', label: 'Lote', type: 'text' },
      {
        key: 'mode',
        label: 'Modo',
        type: 'select',
        options: [
          ['single', 'Sencilla'],
          ['double', 'Doble'],
        ],
      },
      { key: 'weight_diff', label: 'Dif. de peso (%)', type: 'number' },
      { key: 'cycle_start_at', label: 'Inicio de ciclo', type: 'datetime' },
      { key: 'transferred_at', label: 'Fecha de transferencia', type: 'datetime' },
    ],
  },
  hatch_events: {
    group: 'planta',
    label: 'Nacimientos',
    table: 'hatch_events',
    select:
      'id, lote, status, incubable_eggs, estimated_chicks, actual_chicks, females_count, males_count, started_at, ended_at, notes',
    orderBy: 'started_at',
    title: (r) => `${r.lote} · ${r.status}`,
    sub: (r) =>
      `Inició ${fmtDT(r.started_at)} · Cerró ${fmtDT(r.ended_at)} · Pollitos: ${r.actual_chicks ?? '—'}`,
    fields: [
      { key: 'lote', label: 'Lote', type: 'text' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['planned', 'Programado'],
          ['in_progress', 'En curso'],
          ['completed', 'Completado'],
        ],
      },
      { key: 'incubable_eggs', label: 'Huevos incubables', type: 'number' },
      { key: 'estimated_chicks', label: 'Pollitos estimados', type: 'number' },
      { key: 'actual_chicks', label: 'Pollitos reales', type: 'number' },
      { key: 'females_count', label: 'Hembras', type: 'number' },
      { key: 'males_count', label: 'Machos', type: 'number' },
      { key: 'started_at', label: 'Inicio', type: 'datetime' },
      { key: 'ended_at', label: 'Cierre', type: 'datetime' },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  machine_checks: {
    group: 'ops',
    label: 'Rondas de máquina (checks)',
    table: 'machine_checks',
    select:
      'id, machine_id, shift_date, shift_number, hour_slot, condition, notes, taken_at, taken_by',
    orderBy: 'taken_at',
    title: (r, maps) =>
      `${maps.machines[r.machine_id] ?? 'Máquina'} · ${r.shift_date} T${r.shift_number} H${String(r.hour_slot).padStart(2, '0')}`,
    sub: (r, maps) =>
      `${r.condition}${r.notes ? ` · ${r.notes}` : ''} · ${maps.people[r.taken_by] ?? '—'}`,
    fields: [
      { key: 'shift_date', label: 'Fecha de turno', type: 'date' },
      { key: 'shift_number', label: 'Turno (1-3)', type: 'number' },
      { key: 'hour_slot', label: 'Hora (0-23)', type: 'number' },
      {
        key: 'condition',
        label: 'Condición',
        type: 'select',
        options: [
          ['normal', 'Sin novedad'],
          ['warning', 'Alerta'],
          ['fault', 'Falla'],
          ['off', 'Apagada'],
        ],
      },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  machine_calibrations: {
    group: 'ops',
    label: 'Calibraciones de sensores (T°F / HR%)',
    table: 'machine_calibrations',
    select:
      'id, machine_id, scope, reason, temp_machine_f, temp_calibrator_f, rh_machine_pct, rh_calibrator_pct, calibrated_at, notes, performed_by',
    orderBy: 'calibrated_at',
    title: (r, maps) =>
      `${maps.machines[r.machine_id] ?? 'Máquina'} · ${r.scope} · ${r.calibrated_at || ''}`,
    sub: (r, maps) =>
      `T ${r.temp_machine_f ?? '—'}→${r.temp_calibrator_f ?? '—'} °F · HR ${r.rh_machine_pct ?? '—'}→${r.rh_calibrator_pct ?? '—'} % · ${maps.people[r.performed_by] ?? '—'}`,
    fields: [
      {
        key: 'scope',
        label: 'Sensor',
        type: 'select',
        options: [
          ['temperature', 'Temperatura °F'],
          ['humidity', 'Humedad %'],
          ['both', 'Ambos'],
        ],
      },
      { key: 'temp_machine_f', label: 'T pantalla °F', type: 'number' },
      { key: 'temp_calibrator_f', label: 'T calibrador °F', type: 'number' },
      { key: 'rh_machine_pct', label: 'HR pantalla %', type: 'number' },
      { key: 'rh_calibrator_pct', label: 'HR calibrador %', type: 'number' },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  machine_ops_state: {
    group: 'ops',
    label: 'Estado operativo de máquinas',
    table: 'machine_ops_state',
    select:
      'machine_id, phase, lote, age_label, cycle_start_at, calib_due, notes, computed_at',
    orderBy: 'computed_at',
    hasUpdatedAt: true,
    title: (r, maps) =>
      `${maps.machines[r.machine_id] ?? r.machine_id} · ${r.phase} · ${r.lote || '—'}`,
    sub: (r) =>
      `${r.age_label || '—'} · calib ${r.calib_due ? 'sí' : 'no'} · ${r.notes || ''}`,
    fields: [
      {
        key: 'phase',
        label: 'Fase',
        type: 'select',
        options: [
          ['idle', 'Vacía'],
          ['incubating', 'Incubación'],
          ['calib_window', 'Ventana calibración'],
          ['transfer_ready', 'Lista transferencia'],
          ['in_hatcher', 'En nacedora'],
          ['hatching', 'Nacimiento en curso'],
          ['completed', 'Completado'],
        ],
      },
      { key: 'lote', label: 'Lote', type: 'text' },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  work_orders: {
    group: 'ops',
    label: 'Órdenes de trabajo',
    table: 'work_orders',
    select:
      'id, code, title, description, type, priority, status, downtime_minutes, cost, resolution, scheduled_for, started_at, completed_at',
    orderBy: 'created_at',
    hasUpdatedAt: true,
    title: (r) => `${r.code || r.id?.slice?.(0, 8)} · ${r.title}`,
    sub: (r) => `${r.type} · ${r.priority} · ${r.status}`,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'text' },
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        options: [
          ['preventive', 'Preventivo'],
          ['corrective', 'Correctivo'],
          ['inspection', 'Inspección'],
        ],
      },
      {
        key: 'priority',
        label: 'Prioridad',
        type: 'select',
        options: [
          ['low', 'Baja'],
          ['medium', 'Media'],
          ['high', 'Alta'],
          ['critical', 'Crítica'],
        ],
      },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['open', 'Abierta'],
          ['in_progress', 'En ejecución'],
          ['completed', 'Completada'],
          ['cancelled', 'Cancelada'],
        ],
      },
      { key: 'downtime_minutes', label: 'Paro (min)', type: 'number' },
      { key: 'cost', label: 'Costo', type: 'number' },
      { key: 'resolution', label: 'Resolución', type: 'text' },
      { key: 'scheduled_for', label: 'Programada para', type: 'datetime' },
      { key: 'started_at', label: 'Inicio', type: 'datetime' },
      { key: 'completed_at', label: 'Cierre', type: 'datetime' },
    ],
  },
  shift_activities: {
    group: 'ops',
    label: 'Actividades de turno',
    table: 'shift_activities',
    select:
      'id, title, description, status, completion, result_qty, result_note, started_at, completed_at, assigned_to',
    orderBy: 'created_at',
    hasUpdatedAt: true,
    title: (r) => r.title || 'Actividad',
    sub: (r, maps) =>
      `${r.status} · ${maps.people[r.assigned_to] ?? 'sin asignar'}${r.result_qty != null ? ` · qty ${r.result_qty}` : ''}`,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'text' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['pending', 'Pendiente'],
          ['in_progress', 'En curso'],
          ['completed', 'Completada'],
          ['cancelled', 'Cancelada'],
        ],
      },
      {
        key: 'completion',
        label: 'Cierre',
        type: 'select',
        options: [
          ['complete', 'Completa'],
          ['partial', 'Parcial'],
        ],
      },
      { key: 'result_qty', label: 'Cantidad resultado', type: 'number' },
      { key: 'result_note', label: 'Nota de resultado', type: 'text' },
      { key: 'started_at', label: 'Inicio', type: 'datetime' },
      { key: 'completed_at', label: 'Fin', type: 'datetime' },
    ],
  },
  merchandise_receipts: {
    group: 'ops',
    label: 'Mercancía recibida',
    table: 'merchandise_receipts',
    select: 'id, room_id, description, received_at, received_by',
    orderBy: 'received_at',
    title: (r) => r.description || 'Mercancía',
    sub: (r, maps) =>
      `${fmtDT(r.received_at)} · ${maps.rooms[r.room_id] ?? '—'} · ${maps.people[r.received_by] ?? '—'}`,
    fields: [
      { key: 'description', label: 'Descripción', type: 'text' },
      { key: 'received_at', label: 'Fecha de recepción', type: 'datetime' },
    ],
  },
  shift_assignments: {
    group: 'turnos',
    label: 'Asignaciones de turno',
    table: 'shift_assignments',
    select: 'id, plant_id, user_id, work_date, shift_number, is_rest',
    orderBy: 'work_date',
    title: (r, maps) =>
      `${maps.people[r.user_id] ?? r.user_id?.slice?.(0, 8)} · ${r.work_date}`,
    sub: (r, maps) =>
      r.is_rest
        ? `Descanso · ${maps.plants[r.plant_id] ?? ''}`
        : `Turno ${r.shift_number ?? '—'} · ${maps.plants[r.plant_id] ?? ''}`,
    fields: [
      { key: 'work_date', label: 'Fecha', type: 'date' },
      { key: 'shift_number', label: 'Turno (1-3, vacío si descanso)', type: 'number' },
      {
        key: 'is_rest',
        label: 'Es descanso',
        type: 'select',
        options: [
          ['true', 'Sí'],
          ['false', 'No'],
        ],
      },
    ],
  },
  shift_activity_catalog: {
    group: 'turnos',
    label: 'Catálogo de actividades de turno',
    table: 'shift_activity_catalog',
    select: 'id, name, description, active, grants_module',
    orderBy: 'name',
    orderAsc: true,
    title: (r) => r.name,
    sub: (r) =>
      `${r.active ? 'Activa' : 'Inactiva'}${r.grants_module ? ` · módulo ${r.grants_module}` : ''}${r.description ? ` · ${r.description}` : ''}`,
    fields: [
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'description', label: 'Descripción', type: 'text' },
      { key: 'grants_module', label: 'Módulo que habilita', type: 'text' },
      {
        key: 'active',
        label: 'Activa',
        type: 'select',
        options: [
          ['true', 'Sí'],
          ['false', 'No'],
        ],
      },
    ],
  },
  customers: {
    group: 'comercial',
    label: 'Clientes (CRM ventas)',
    table: 'customers',
    select:
      'id, code, name, contact_name, email, phone, city, department, address, website, nit, status, product_interest, buys_day_old_chicks, farm_type, capacity_birds, notes',
    orderBy: 'name',
    orderAsc: true,
    hasUpdatedAt: true,
    title: (r) => r.name,
    sub: (r) =>
      [r.nit && `NIT ${r.nit}`, r.city, r.phone, r.status, r.farm_type].filter(Boolean).join(' · '),
    fields: [
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'code', label: 'Código', type: 'text' },
      { key: 'nit', label: 'NIT', type: 'text' },
      { key: 'contact_name', label: 'Contacto', type: 'text' },
      { key: 'email', label: 'Correo', type: 'text' },
      { key: 'phone', label: 'Teléfono', type: 'text' },
      { key: 'city', label: 'Ciudad', type: 'text' },
      { key: 'department', label: 'Departamento', type: 'text' },
      { key: 'address', label: 'Dirección', type: 'text' },
      { key: 'website', label: 'Sitio web', type: 'text' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['prospect', 'Prospecto'],
          ['active', 'Activo'],
          ['inactive', 'Inactivo'],
          ['blocked', 'Bloqueado'],
        ],
      },
      {
        key: 'product_interest',
        label: 'Interés',
        type: 'select',
        options: [
          ['day_old_chicks', 'Pollito un día'],
          ['eggs', 'Huevo'],
          ['both', 'Ambos'],
          ['other', 'Otro'],
        ],
      },
      {
        key: 'buys_day_old_chicks',
        label: 'Compra pollito 1 día',
        type: 'select',
        options: [
          ['true', 'Sí'],
          ['false', 'No'],
        ],
      },
      { key: 'farm_type', label: 'Tipo granja', type: 'text' },
      { key: 'capacity_birds', label: 'Capacidad aves', type: 'number' },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  sales_orders: {
    group: 'comercial',
    label: 'Pedidos de venta',
    table: 'sales_orders',
    select:
      'id, code, customer_id, product_type, qty_females, qty_males, unit_price, status, requested_date, delivery_date, delivery_address, notes',
    orderBy: 'created_at',
    hasUpdatedAt: true,
    title: (r, maps) =>
      `${r.code || r.id?.slice?.(0, 8)} · ${maps.customers[r.customer_id] ?? 'Cliente'}`,
    sub: (r) =>
      `${r.status} · ${r.qty_females ?? 0}H + ${r.qty_males ?? 0}M · ${r.product_type}`,
    fields: [
      { key: 'code', label: 'Código', type: 'text' },
      {
        key: 'product_type',
        label: 'Producto',
        type: 'select',
        options: [
          ['day_old_chicks', 'Pollito un día'],
          ['eggs', 'Huevo'],
          ['other', 'Otro'],
        ],
      },
      { key: 'qty_females', label: 'Hembras', type: 'number' },
      { key: 'qty_males', label: 'Machos', type: 'number' },
      { key: 'unit_price', label: 'Precio unitario', type: 'number' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['requested', 'Solicitado'],
          ['confirmed', 'Confirmado'],
          ['scheduled', 'Programado'],
          ['dispatched', 'Despachado'],
          ['delivered', 'Entregado'],
          ['cancelled', 'Cancelado'],
        ],
      },
      { key: 'requested_date', label: 'Fecha solicitada', type: 'date' },
      { key: 'delivery_date', label: 'Fecha entrega', type: 'date' },
      { key: 'delivery_address', label: 'Dirección entrega', type: 'text' },
      { key: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  plants: {
    group: 'maestros',
    label: 'Plantas / granjas (sedes)',
    table: 'plants',
    select: 'id, name, code, address, city, status',
    orderBy: 'name',
    orderAsc: true,
    title: (r) => `${r.name} (${r.code})`,
    sub: (r) => [r.city, r.address, r.status].filter(Boolean).join(' · '),
    fields: [
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'code', label: 'Código', type: 'text' },
      { key: 'city', label: 'Ciudad', type: 'text' },
      { key: 'address', label: 'Dirección', type: 'text' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['active', 'Activa'],
          ['inactive', 'Inactiva'],
        ],
      },
    ],
  },
  rooms: {
    group: 'maestros',
    label: 'Salas / galpones',
    table: 'rooms',
    select: 'id, plant_id, name, code, type',
    orderBy: 'code',
    orderAsc: true,
    title: (r, maps) => `${r.name} (${r.code}) · ${maps.plants[r.plant_id] ?? ''}`,
    sub: (r) => `Tipo: ${r.type || '—'}`,
    fields: [
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'code', label: 'Código', type: 'text' },
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        options: [
          ['levante', 'Levante'],
          ['produccion', 'Producción'],
          ['setter', 'Incubadora'],
          ['hatcher', 'Nacedora'],
          ['cold', 'Cuarto frío'],
          ['other', 'Otro'],
        ],
      },
    ],
  },
  machines: {
    group: 'maestros',
    label: 'Máquinas (incubadoras / nacedoras)',
    table: 'machines',
    select: 'id, plant_id, room_id, code, name, type, brand, model, capacity_eggs, status',
    orderBy: 'code',
    orderAsc: true,
    orgScope: 'via_plants',
    title: (r, maps) => `${r.name} (${r.code}) · ${maps.plants[r.plant_id] ?? ''}`,
    sub: (r) =>
      [r.type, r.brand, r.model, r.capacity_eggs && `${r.capacity_eggs} huevos`, r.status]
        .filter(Boolean)
        .join(' · '),
    fields: [
      { key: 'name', label: 'Nombre', type: 'text' },
      { key: 'code', label: 'Código', type: 'text' },
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        options: [
          ['setter', 'Incubadora'],
          ['hatcher', 'Nacedora'],
          ['other', 'Otro'],
        ],
      },
      { key: 'brand', label: 'Marca', type: 'text' },
      { key: 'model', label: 'Modelo', type: 'text' },
      { key: 'capacity_eggs', label: 'Capacidad (huevos)', type: 'number' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['active', 'Activa'],
          ['maintenance', 'Mantenimiento'],
          ['inactive', 'Inactiva'],
          ['fault', 'Falla'],
        ],
      },
    ],
  },
  sensors: {
    group: 'maestros',
    label: 'Sensores',
    table: 'sensors',
    select: 'id, code, kind, unit, min_threshold, max_threshold, status, machine_id',
    orderBy: 'created_at',
    title: (r, maps) => `${r.code} · ${maps.machines[r.machine_id] ?? 'Máquina'}`,
    sub: (r) => `${r.kind} · ${r.unit} · ${r.status}`,
    fields: [
      { key: 'code', label: 'Código', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'text' },
      { key: 'unit', label: 'Unidad', type: 'text' },
      { key: 'min_threshold', label: 'Mínimo', type: 'number' },
      { key: 'max_threshold', label: 'Máximo', type: 'number' },
      {
        key: 'status',
        label: 'Estado',
        type: 'select',
        options: [
          ['active', 'Activo'],
          ['inactive', 'Inactivo'],
          ['fault', 'Falla'],
        ],
      },
    ],
  },
  messages: {
    group: 'sistema',
    label: 'Mensajes de chat',
    table: 'messages',
    select: 'id, sender_id, recipient_id, channel, body, created_at',
    orderBy: 'created_at',
    title: (r) => (r.body || '').slice(0, 80),
    sub: (r, maps) =>
      `${fmtDT(r.created_at)} · ${maps.people[r.sender_id] ?? '—'} · ${r.channel}`,
    fields: [{ key: 'body', label: 'Mensaje', type: 'text' }],
  },
  notifications: {
    group: 'sistema',
    label: 'Notificaciones',
    table: 'notifications',
    select: 'id, title, body, created_at',
    orderBy: 'created_at',
    title: (r) => r.title || 'Aviso',
    sub: (r) => `${fmtDT(r.created_at)} · ${(r.body || '').slice(0, 60)}`,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'body', label: 'Cuerpo', type: 'text' },
    ],
  },
}

const BOOL_KEYS = new Set(['active', 'is_rest', 'buys_day_old_chicks'])

function FieldInput({ field, value, onChange }) {
  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {field.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    )
  }
  if (field.type === 'json') {
    return (
      <textarea
        rows={3}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    )
  }
  const type = field.type === 'datetime' ? 'datetime-local' : field.type
  return (
    <input
      type={type}
      step={field.type === 'number' ? 'any' : undefined}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * @param {{ orgs?: {id,name}[], orgId?: string, canDelete?: boolean }} props
 */
export default function DataFixPanel({ orgs, orgId: fixedOrgId, canDelete = true }) {
  const multi = Array.isArray(orgs) && orgs.length > 0
  const [orgId, setOrgId] = useState(fixedOrgId || orgs?.[0]?.id || '')
  const [dataset, setDataset] = useState('bird_batches')
  const [rows, setRows] = useState([])
  const [maps, setMaps] = useState({
    machines: {},
    rooms: {},
    people: {},
    plants: {},
    batches: {},
    customers: {},
    eggCategories: [],
    eggCatLabels: {},
    plantIds: [],
  })
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({})
  const [countForm, setCountForm] = useState({})
  const [receivedCountForm, setReceivedCountForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [limit, setLimit] = useState(200)

  useEffect(() => {
    if (fixedOrgId) setOrgId(fixedOrgId)
  }, [fixedOrgId])

  const cfg = DATASETS[dataset]

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase
        .from('machines')
        .select('id, name, code, plants!inner(org_id)')
        .eq('plants.org_id', orgId),
      supabase.from('rooms').select('id, name, code').eq('org_id', orgId),
      supabase
        .from('organization_members')
        .select('user_id, profiles ( full_name, email )')
        .eq('org_id', orgId),
      supabase.from('plants').select('id, name, code').eq('org_id', orgId),
      supabase.from('bird_batches').select('id, code').eq('org_id', orgId).limit(500),
      supabase.from('customers').select('id, name').eq('org_id', orgId).limit(500),
      supabase
        .from('egg_categories')
        .select('id, code, name, sort_order, active')
        .eq('org_id', orgId)
        .order('sort_order', { ascending: true }),
    ]).then(([m, r, t, p, b, c, ec]) => {
      const machines = {}
      for (const x of m.data ?? []) machines[x.id] = `${x.name} (${x.code})`
      const rooms = {}
      for (const x of r.data ?? []) rooms[x.id] = x.name
      const people = {}
      for (const x of t.data ?? [])
        people[x.user_id] = x.profiles?.full_name || x.profiles?.email || '—'
      const plants = {}
      const plantIds = []
      for (const x of p.data ?? []) {
        plants[x.id] = x.name
        plantIds.push(x.id)
      }
      const batches = {}
      for (const x of b.data ?? []) batches[x.id] = x.code || x.id.slice(0, 8)
      const customers = {}
      for (const x of c.data ?? []) customers[x.id] = x.name
      const eggCategories = ec.data ?? []
      const eggCatLabels = {}
      for (const cat of eggCategories) {
        eggCatLabels[cat.code] = cat.name
        eggCatLabels[cat.id] = cat.name
      }
      setMaps({ machines, rooms, people, plants, batches, customers, eggCategories, eggCatLabels, plantIds })
    })
  }, [orgId])

  const load = useCallback(async () => {
    if (!orgId || !cfg) return
    setLoading(true)
    setMsg(null)

    let query = supabase.from(cfg.table).select(cfg.select)

    if (cfg.orgScope === 'via_plants') {
      const plantIds = maps.plantIds?.length
        ? maps.plantIds
        : (
            await supabase.from('plants').select('id').eq('org_id', orgId)
          ).data?.map((x) => x.id) ?? []
      if (plantIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }
      query = query.in('plant_id', plantIds)
    } else {
      query = query.eq('org_id', orgId)
    }

    if (cfg.orderBy) query = query.order(cfg.orderBy, { ascending: !!cfg.orderAsc })
    query = query.limit(limit)

    const { data, error } = await query
    if (error) {
      setMsg({
        kind: 'error',
        text: /schema cache|does not exist|column .* does not exist/i.test(error.message)
          ? `No se pudo cargar "${cfg.label}" (${cfg.table}): ${error.message}`
          : error.message,
      })
      setRows([])
    } else setRows(data ?? [])
    setLoading(false)
  }, [orgId, cfg, limit, maps.plantIds])

  useEffect(() => {
    setEditingId(null)
    setCountForm({})
    setReceivedCountForm({})
    load()
  }, [load])

  const visible = useMemo(() => {
    if (!q.trim()) return rows
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => JSON.stringify(Object.values(r)).toLowerCase().includes(needle))
  }, [rows, q])

  const eggKeysForEdit = useMemo(() => {
    const fromCats = (maps.eggCategories || []).map((c) => c.code)
    if (fromCats.length) return fromCats
    // fallback: keys presentes en filas
    const keys = new Set()
    for (const r of rows) {
      for (const k of Object.keys(r.counts || {})) keys.add(k)
      for (const k of Object.keys(r.received_counts || {})) keys.add(k)
    }
    return [...keys]
  }, [maps.eggCategories, rows])

  const startEdit = (r) => {
    const f = {}
    for (const field of cfg.fields) {
      const v = r[field.key]
      if (field.type === 'datetime') f[field.key] = isoToLocal(v)
      else if (field.type === 'json') f[field.key] = v == null ? '' : JSON.stringify(v, null, 1)
      else if (BOOL_KEYS.has(field.key)) f[field.key] = v ? 'true' : 'false'
      else f[field.key] = v ?? ''
    }
    setForm(f)

    if (cfg.eggCounts) {
      const cf = {}
      const rc = {}
      for (const k of eggKeysForEdit) {
        cf[k] = r.counts?.[k] ?? r.counts?.[maps.eggCategories.find((c) => c.code === k)?.id] ?? ''
        if (r.received_counts != null) {
          rc[k] =
            r.received_counts?.[k] ??
            r.received_counts?.[maps.eggCategories.find((c) => c.code === k)?.id] ??
            ''
        }
      }
      // incluir keys extra que no estén en categorías
      for (const [k, v] of Object.entries(r.counts || {})) {
        if (cf[k] === undefined) cf[k] = v
      }
      setCountForm(cf)
      setReceivedCountForm(rc)
    } else {
      setCountForm({})
      setReceivedCountForm({})
    }

    setEditingId(r.id)
    setMsg(null)
  }

  const buildCountsObject = (src) => {
    const out = {}
    for (const [k, v] of Object.entries(src || {})) {
      if (v === '' || v == null) out[k] = 0
      else out[k] = Number(v)
    }
    return out
  }

  const save = async () => {
    const patch = {}
    if (cfg.hasUpdatedAt) patch.updated_at = new Date().toISOString()

    for (const field of cfg.fields) {
      const v = form[field.key]
      if (field.type === 'datetime') patch[field.key] = localToIso(v)
      else if (field.type === 'number') patch[field.key] = v === '' || v == null ? null : Number(v)
      else if (field.type === 'json') {
        if (v === '' || v == null) patch[field.key] = null
        else {
          try {
            patch[field.key] = JSON.parse(v)
          } catch {
            setMsg({ kind: 'error', text: `El campo "${field.label}" no es JSON válido` })
            return
          }
        }
      } else if (field.type === 'date') patch[field.key] = v || null
      else if (BOOL_KEYS.has(field.key)) patch[field.key] = v === 'true' || v === true
      else patch[field.key] = typeof v === 'string' && v.trim() === '' ? null : v
    }

    if (cfg.eggCounts) {
      patch.counts = buildCountsObject(countForm)
      if (Object.keys(receivedCountForm).length > 0 || dataset === 'egg_reports') {
        // solo escribir received_counts si el registro original o el form lo usan
        const original = rows.find((x) => x.id === editingId)
        if (original?.received_counts != null || Object.values(receivedCountForm).some((v) => v !== '' && v != null)) {
          patch.received_counts = buildCountsObject(receivedCountForm)
        }
      }
    }

    setBusy(true)
    const { error } = await supabase.from(cfg.table).update(patch).eq('id', editingId)
    setBusy(false)
    if (error) {
      // reintento sin updated_at si la columna no existe
      if (cfg.hasUpdatedAt && /updated_at/i.test(error.message)) {
        delete patch.updated_at
        setBusy(true)
        const retry = await supabase.from(cfg.table).update(patch).eq('id', editingId)
        setBusy(false)
        if (retry.error) setMsg({ kind: 'error', text: retry.error.message })
        else {
          setMsg({ kind: 'ok', text: 'Registro actualizado' })
          setEditingId(null)
          load()
        }
        return
      }
      setMsg({ kind: 'error', text: error.message })
    } else {
      setMsg({ kind: 'ok', text: 'Registro actualizado' })
      setEditingId(null)
      load()
    }
  }

  const remove = async (r) => {
    if (!canDelete) return
    if (!window.confirm(`¿Eliminar este registro de "${cfg.label}"? Esta acción no se puede deshacer.`))
      return
    setBusy(true)
    const { error } = await supabase.from(cfg.table).delete().eq('id', r.id)
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error.message })
    else {
      setMsg({ kind: 'ok', text: 'Registro eliminado' })
      if (editingId === r.id) setEditingId(null)
      load()
    }
  }

  const groupedOptions = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      items: Object.entries(DATASETS)
        .filter(([, d]) => d.group === g.id)
        .map(([k, d]) => ({ key: k, label: d.label })),
    })).filter((g) => g.items.length > 0)
  }, [])

  return (
    <>
      <p className="hint" style={{ margin: '8px 0' }}>
        Corrección de cualquier dato operativo capturado por el personal: lotes de pollas, distribución
        por galpón, registros diarios, huevos por día, cuarto frío, cargues, nacimientos, rondas, OT,
        turnos, clientes, pedidos, plantas, salas y máquinas. Los cambios se aplican de inmediato.
      </p>
      <div className="two-col">
        {multi && (
          <label>
            Empresa
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Conjunto de datos
          <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
            {groupedOptions.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {g.items.map((it) => (
                  <option key={it.key} value={it.key}>
                    {it.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Máximo a listar
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[100, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Buscar
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lote, galpón, máquina, texto…"
        />
      </label>
      <div className="actions row" style={{ marginTop: 8 }}>
        <button type="button" className="ghost small" onClick={load} disabled={loading}>
          {loading ? 'Cargando…' : 'Recargar'}
        </button>
        <span className="hint" style={{ margin: 0 }}>
          {visible.length} registro{visible.length === 1 ? '' : 's'}
          {q.trim() ? ' (filtrados)' : ''}
        </span>
      </div>

      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}
      {loading ? (
        <p className="hint">Cargando registros…</p>
      ) : visible.length === 0 ? (
        <p className="hint">Sin registros para este conjunto (o la tabla no está disponible).</p>
      ) : (
        <div className="admin-list" style={{ marginTop: 10 }}>
          {visible.map((r) => (
            <div key={r.id} className="admin-card">
              <div className="admin-row">
                <div className="admin-row-main" style={{ flex: 1 }}>
                  <strong>{cfg.title(r, maps)}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    {cfg.sub(r, maps)}
                  </span>
                </div>
                <span className="admin-row-actions">
                  {editingId !== r.id && (
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => startEdit(r)}
                      disabled={busy}
                    >
                      Editar
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="ghost small danger"
                      onClick={() => remove(r)}
                      disabled={busy}
                    >
                      Eliminar
                    </button>
                  )}
                </span>
              </div>
              {editingId === r.id && (
                <div className="inline-form compact">
                  {cfg.fields.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <FieldInput
                        field={field}
                        value={form[field.key]}
                        onChange={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
                      />
                    </label>
                  ))}

                  {cfg.eggCounts && (
                    <>
                      <p className="hint" style={{ margin: '8px 0 4px', gridColumn: '1 / -1' }}>
                        Conteos por categoría
                      </p>
                      <div className="two-col" style={{ gridColumn: '1 / -1' }}>
                        {eggKeysForEdit.map((k) => (
                          <label key={`c-${k}`}>
                            {maps.eggCatLabels[k] || k}
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={countForm[k] ?? ''}
                              onChange={(e) =>
                                setCountForm((f) => ({ ...f, [k]: e.target.value }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      {dataset === 'egg_reports' && (
                        <>
                          <p className="hint" style={{ margin: '8px 0 4px', gridColumn: '1 / -1' }}>
                            Conteos recibidos (recepción / verificación)
                          </p>
                          <div className="two-col" style={{ gridColumn: '1 / -1' }}>
                            {eggKeysForEdit.map((k) => (
                              <label key={`rc-${k}`}>
                                {maps.eggCatLabels[k] || k} (recibido)
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={receivedCountForm[k] ?? ''}
                                  onChange={(e) =>
                                    setReceivedCountForm((f) => ({ ...f, [k]: e.target.value }))
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <div className="actions row">
                    <button type="button" className="primary small" onClick={save} disabled={busy}>
                      {busy ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
