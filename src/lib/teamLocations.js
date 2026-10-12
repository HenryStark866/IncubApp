/**
 * =============================================================================
 * ARCHIVO: src/lib/teamLocations.js
 * PROPÓSITO: «Dónde estoy y para dónde voy» (tabla team_locations, 20261012).
 *   - reportLocation: cada persona reporta su lugar de trabajo (sede, sitio,
 *     actividad u OT) o un traslado (origen → destino).
 *   - reportMissionTrip: lo llama Misionales al guardar el traslado: deja la fila
 *     «en_traslado» que ve el jefe y avisa a SST (notifications, kind mission_trip).
 *   - currentStatusByUser: lo último de cada persona entre su reporte, su traslado
 *     misional y la OT que está ejecutando.
 * Si la instalación aún no tiene la tabla, nada se rompe: se avisa y sigue.
 * 12-10-2026
 * =============================================================================
 */
import { supabase } from './supabase'
import { isMissingTable } from './missingTable'

export const LOCATION_STATUS = {
  en_sitio: 'En sitio',
  en_traslado: 'En traslado',
  fuera: 'Fuera de turno',
}

/** Un traslado misional se considera «en curso» durante este tiempo */
export const TRIP_ACTIVE_HOURS = 10

const clean = (v) => {
  const t = String(v ?? '').trim()
  return t ? t.slice(0, 200) : null
}

/**
 * @param {object} p
 * @returns {Promise<{ error: string|null, missing?: boolean }>}
 */
export async function reportLocation({ orgId, userId, status = 'en_sitio', siteId = null, place, origin, destination, activity, workOrderId = null, missionId = null, coords = null, client = supabase }) {
  if (!orgId || !userId) return { error: 'Sesión inválida' }
  const row = {
    org_id: orgId,
    user_id: userId,
    status,
    site_id: siteId || null,
    place: clean(place),
    origin: clean(origin),
    destination: clean(destination),
    activity: clean(activity),
    work_order_id: workOrderId || null,
    mission_inspection_id: missionId || null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  }
  const { error } = await client.from('team_locations').insert(row)
  if (error) {
    if (isMissingTable(error)) return { error: 'El servidor aún no tiene la migración 20261012_equipo_mantenimiento_traslados.', missing: true }
    return { error: error.message }
  }
  return { error: null }
}

/**
 * Traslado misional guardado → fila «en_traslado» + aviso a SST y al jefe.
 * Nunca bloquea el guardado de la inspección: los errores solo se devuelven.
 */
export async function reportMissionTrip({ orgId, userId, inspection, userName, client = supabase }) {
  if (!orgId || !userId || !inspection) return { error: null }
  const origin = clean(inspection.origin)
  const destination = clean(inspection.destination)
  const coords = inspection.lat != null && inspection.lng != null ? { lat: inspection.lat, lng: inspection.lng } : null
  const loc = await reportLocation({
    orgId,
    userId,
    status: 'en_traslado',
    origin,
    destination,
    activity: clean(inspection.process) ? `Traslado misional · ${inspection.process}` : 'Traslado misional',
    missionId: inspection.id,
    coords,
    client,
  })
  const who = clean(userName) || clean(inspection.driver_name) || 'Un colaborador'
  const vehiculo = [inspection.vehicle_type, inspection.plate].filter(Boolean).join(' ')
  const estado = inspection.optimal === false ? ' · ⚠ vehículo NO apto' : ''
  let notifError = null
  try {
    const { error } = await client.from('notifications').insert({
      org_id: orgId,
      title: `Traslado misional: ${who}`,
      body: `${origin || '¿origen?'} → ${destination || '¿destino?'}${vehiculo ? ` · ${vehiculo}` : ''}${estado}. Registro para SST y su jefe inmediato.`,
      kind: 'mission_trip',
      created_by: userId,
    })
    notifError = error?.message || null
  } catch (e) {
    notifError = e?.message || String(e)
  }
  return { error: loc.error || notifError }
}

const t = (v) => {
  const n = Date.parse(v || '')
  return Number.isNaN(n) ? 0 : n
}

/**
 * Lo último de cada persona.
 * @returns {Map<string, { kind: 'reporte'|'traslado'|'ot', at: string, status: string, text: string, place?: string, origin?: string, destination?: string, row: object }>}
 */
export function currentStatusByUser({ locations = [], trips = [], workOrders = [], sitesById = {}, now = Date.now() }) {
  const out = new Map()
  const offer = (userId, entry) => {
    if (!userId) return
    const prev = out.get(userId)
    if (!prev || t(entry.at) > t(prev.at)) out.set(userId, entry)
  }
  for (const l of locations) {
    const site = sitesById[l.site_id]?.name
    const where = [site, l.place].filter(Boolean).join(' · ')
    offer(l.user_id, {
      kind: 'reporte',
      at: l.reported_at,
      status: l.status,
      origin: l.origin,
      destination: l.destination,
      place: where,
      text:
        l.status === 'en_traslado'
          ? `${l.origin || '¿origen?'} → ${l.destination || '¿destino?'}`
          : `${where || 'Lugar sin nombre'}${l.activity ? ` · ${l.activity}` : ''}`,
      row: l,
    })
  }
  for (const m of trips) {
    // El traslado deja de estar «en curso» después de unas horas
    if (now - t(m.inspected_at) > TRIP_ACTIVE_HOURS * 3_600_000) continue
    offer(m.user_id, {
      kind: 'traslado',
      at: m.inspected_at,
      status: 'en_traslado',
      origin: m.origin,
      destination: m.destination,
      text: `${m.origin || '¿origen?'} → ${m.destination || '¿destino?'}${m.plate ? ` · ${m.plate}` : ''}`,
      row: m,
    })
  }
  for (const o of workOrders) {
    if (o.status !== 'in_progress' || !o.assigned_to) continue
    const site = sitesById[o.plant_id]?.name || o.location_name
    offer(o.assigned_to, {
      kind: 'ot',
      at: o.started_at || o.created_at,
      status: 'en_sitio',
      place: site || '',
      text: `${o.code || 'OT'} · ${o.title || 'Trabajo de mantenimiento'}${site ? ` · ${site}` : ''}`,
      row: o,
    })
  }
  return out
}
