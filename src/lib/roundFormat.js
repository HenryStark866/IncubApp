/**
 * Carga las rondas de un turno desde Supervisión (machine_checks) y abre el
 * FOMAT04 de una de ellas con todas sus fotos, lecturas, las máquinas apagadas
 * y las que nadie reportó. La definición de ronda está en roundRecords.
 * Henry Stark Desarrollador · CDH Maker
 */
import { supabase } from './supabase'
import { READING_COLUMNS } from './machineReadings'
import { groupChecksIntoRounds, roundMachines } from './roundRecords'
import { openEvidenceFormat } from './sigRecordDocuments'

const CHECK_COLUMNS = `id, machine_id, plant_id, taken_by, taken_at, shift_date, shift_number, hour_slot, condition, notes, photo_path, ${READING_COLUMNS.join(', ')}`

/**
 * Rondas del turno (o de una hora, si se da `hour`) con todo lo necesario para
 * su formato. Devuelve { rounds, error }.
 */
export async function loadShiftRounds({ orgId, shiftDate, shiftNumber, hour = null, plantId = null }) {
  if (!orgId || !shiftDate) return { rounds: [], error: 'Falta la empresa o la fecha del turno' }
  let q = supabase.from('machine_checks').select(CHECK_COLUMNS).eq('org_id', orgId).eq('shift_date', shiftDate)
  if (shiftNumber != null) q = q.eq('shift_number', shiftNumber)
  if (hour != null) q = q.eq('hour_slot', hour)
  if (plantId) q = q.eq('plant_id', plantId)
  const { data: checks, error } = await q.order('taken_at', { ascending: true }).limit(2000)
  if (error) return { rounds: [], error: error.message }
  if (!checks?.length) return { rounds: [], error: null }

  const plantIds = [...new Set(checks.map((c) => c.plant_id).filter(Boolean))]
  const userIds = [...new Set(checks.map((c) => c.taken_by).filter(Boolean))]
  const paths = [...new Set(checks.map((c) => c.photo_path).filter(Boolean))]

  const [machines, rooms, members, signed] = await Promise.all([
    plantIds.length
      ? supabase.from('machines').select('id, plant_id, room_id, panel_room_id, code, name, type, status').in('plant_id', plantIds)
      : { data: [] },
    plantIds.length ? supabase.from('rooms').select('id, plant_id, type').in('plant_id', plantIds) : { data: [] },
    userIds.length
      ? supabase.from('organization_members').select('user_id, profiles ( full_name, email )').eq('org_id', orgId).in('user_id', userIds)
      : { data: [] },
    paths.length ? supabase.storage.from('machine-checks').createSignedUrls(paths, 3600) : { data: [] },
  ])

  const machineList = machines.data || []
  const machinesById = Object.fromEntries(machineList.map((m) => [m.id, m]))
  const names = new Map((members.data || []).map((m) => [m.user_id, m.profiles?.full_name || m.profiles?.email || null]))
  const urls = new Map((signed.data || []).filter((s) => s?.signedUrl).map((s) => [s.path, s.signedUrl]))
  const expectedByPlant = {}
  for (const pid of plantIds) {
    expectedByPlant[pid] = roundMachines({ machines: machineList, rooms: rooms.data || [], plantId: pid }).machines.map((m) => m.id)
  }

  const rounds = groupChecksIntoRounds(checks, {
    machinesById,
    nameOf: (id) => names.get(id) || null,
    urlOf: (path) => urls.get(path) || null,
    expectedByPlant,
  })
  return { rounds, error: null }
}

/** Abre el FOMAT04 de la ronda de esa hora. Devuelve { error } si no hay ronda. */
export async function openRoundFormat({ orgId, shiftDate, shiftNumber, hour, plantId = null }) {
  const { rounds, error } = await loadShiftRounds({ orgId, shiftDate, shiftNumber, hour, plantId })
  if (error) return { error }
  if (!rounds.length) return { error: 'Esa ronda todavía no tiene registros guardados en el servidor.' }
  openEvidenceFormat(rounds[0])
  return { error: null }
}
