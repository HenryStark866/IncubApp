/**
 * Qué es una ronda en IncubApp y cómo se arma su FOMAT04.
 *
 * Una RONDA es una hora del turno en una planta: todas las fotos de máquinas
 * tomadas en esa hora (por una o varias personas) forman una sola ronda, y esa
 * ronda produce un solo formato diligenciado con cada máquina: su condición, sus
 * lecturas, quién la registró y su foto. Las que se marcaron apagadas al
 * terminar la ronda van sin foto (no aplica) y, si se conoce el listado de la
 * planta, las que nadie reportó aparecen como «Sin reportar».
 *
 * Para el cumplimiento, cada persona que tomó al menos una foto en esa hora
 * suma esa ronda. Las marcas de «apagada» sin foto no bastan: cerrar la ronda
 * sin recorrerla no cuenta.
 * Henry Stark Desarrollador · CDH Maker
 */

const pad = (n) => String(n).padStart(2, '0')

export function shiftCodeOf(value) {
  if (value == null || value === '') return null
  return String(value).startsWith('T') ? String(value) : `T${value}`
}

/** «15:00 – 15:59» para la franja de la ronda. */
export function hourSlotLabel(hour) {
  const h = Number(hour)
  if (hour == null || hour === '' || !Number.isFinite(h)) return null
  return `${pad(h)}:00 – ${pad(h)}:59`
}

/** Llave de la ronda: fecha del turno, turno, hora y planta. */
export function roundKeyOf(check = {}) {
  return [check.shift_date || 'sin-fecha', shiftCodeOf(check.shift_number) || 'T?', check.hour_slot ?? 'H?', check.plant_id || ''].join('|')
}

const hasPhoto = (check) => !!check?.photo_path && check.condition !== 'off'

/**
 * Agrupa los chequeos en rondas listas para roundRecordHtml (FOMAT04).
 * @param {object[]} checks filas de machine_checks
 * @param {object} opts
 *   machinesById  máquinas por id (código, nombre, tipo)
 *   nameOf        (userId) => nombre de quien registró
 *   urlOf         (photo_path) => URL firmada o null
 *   expectedByPlant  plantId => ids de máquinas que la ronda debe cubrir; las
 *                    que falten salen como «Sin reportar»
 */
export function groupChecksIntoRounds(checks = [], { machinesById = {}, nameOf = () => null, urlOf = () => null, expectedByPlant = null } = {}) {
  const byKey = new Map()
  for (const check of checks) {
    if (!check) continue
    const key = roundKeyOf(check)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(check)
  }

  const rounds = []
  for (const [key, list] of byKey) {
    const first = list[0]
    // Si una máquina se reportó dos veces en la hora, vale el último registro.
    const latest = new Map()
    for (const c of list) {
      const prev = latest.get(c.machine_id)
      if (!prev || String(c.taken_at || '') > String(prev.taken_at || '')) latest.set(c.machine_id, c)
    }
    const items = [...latest.values()].map((c) => ({
      ...c,
      machine: machinesById[c.machine_id] || null,
      takenByName: c.taken_by ? nameOf(c.taken_by) : null,
      url: c.photo_path ? urlOf(c.photo_path) : null,
    }))
    const expected = expectedByPlant?.[first.plant_id] || []
    for (const machineId of expected) {
      if (latest.has(machineId)) continue
      items.push({ machine_id: machineId, machine: machinesById[machineId] || null, condition: 'unreported', photo_path: null })
    }
    items.sort((a, b) => String(a.machine?.code || a.machine?.name || '').localeCompare(String(b.machine?.code || b.machine?.name || ''), 'es', { numeric: true }))

    const takenAt = list.map((c) => c.taken_at).filter(Boolean).sort()
    const people = [...new Set(list.filter(hasPhoto).map((c) => c.taken_by).filter(Boolean))]
    const shiftCode = shiftCodeOf(first.shift_number)
    const hourSlot = hourSlotLabel(first.hour_slot)
    rounds.push({
      id: `round-${key}`,
      key,
      kind: 'round',
      file_type: 'round',
      formatCode: 'FOMAT04',
      workOrderTitle: 'Ronda de inspección',
      file_name: `Ronda ${first.shift_date || 'sin fecha'} · ${shiftCode || 'turno sin registrar'} · ${hourSlot || 'franja sin registrar'}`,
      created_at: takenAt[takenAt.length - 1] || null,
      startedAt: takenAt[0] || null,
      shiftDate: first.shift_date || null,
      shiftCode,
      shiftNumber: first.shift_number ?? null,
      hourSlot,
      hour: first.hour_slot ?? null,
      plantId: first.plant_id || null,
      takenBy: people,
      photos: list.filter(hasPhoto).length,
      off: items.filter((i) => i.condition === 'off').length,
      unreported: items.filter((i) => i.condition === 'unreported').length,
      note: `${items.length} máquinas en una sola ronda`,
      items,
      reports: [],
      url: items.find((i) => i.url)?.url || null,
    })
  }
  return rounds.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

/**
 * Rondas con foto por persona, con la misma forma que un reporte de ronda
 * (user_id, shift_date, created_at) para que el cumplimiento las cuente.
 */
export function photoRoundsByUser(checks = []) {
  const byKey = new Map()
  for (const c of checks) {
    if (!hasPhoto(c) || !c.taken_by) continue
    const key = `${c.taken_by}|${roundKeyOf(c)}`
    const prev = byKey.get(key)
    if (prev) {
      prev.photos += 1
      if (String(c.taken_at || '') < String(prev.created_at || '')) prev.created_at = c.taken_at
    } else {
      byKey.set(key, {
        id: `photo-round-${key}`,
        source: 'photos',
        user_id: c.taken_by,
        shift_date: c.shift_date,
        shift_code: shiftCodeOf(c.shift_number),
        hour_slot: c.hour_slot,
        created_at: c.taken_at || null,
        title: 'Ronda con fotos',
        photos: 1,
      })
    }
  }
  return [...byKey.values()].map((r) => ({ ...r, body: `${r.photos} máquina${r.photos === 1 ? '' : 's'} con foto` }))
}

/**
 * Rondas que cuentan para el cumplimiento: las rondas con foto más los
 * reportes de ronda escritos que no caen en una hora que ya tiene fotos de la
 * misma persona (un reporte escrito de esa misma ronda no la cuenta dos veces).
 */
export function roundsForCompliance(roundReports = [], photoRounds = []) {
  const covered = new Set(photoRounds.map((r) => `${r.user_id}|${r.shift_date}|${Number(r.hour_slot)}`))
  const extra = roundReports.filter((r) => {
    if (!r?.created_at) return true
    const hour = new Date(r.created_at).getHours()
    return !covered.has(`${r.user_id}|${String(r.shift_date || '').slice(0, 10)}|${hour}`)
  })
  return [...photoRounds, ...extra]
}

/** Tipos de sala que recorre la ronda (incubadoras, nacedoras y cuartos técnicos). */
export const ROUND_ROOM_TYPES = ['incubation', 'hatching', 'technical']

/**
 * Sala donde se hace la lectura de una máquina. Los chillers viven en la
 * plataforma exterior pero su tablero está en la sala técnica: `panel_room_id`.
 */
export const roundRoomOf = (machine) => machine?.panel_room_id || machine?.room_id || null

/**
 * Máquinas que cubre la ronda de una planta: activas y ubicadas en una sala de
 * ronda que tenga equipos. Es la misma lista que recorre Supervisión y la que
 * el FOMAT04 marca como «Sin reportar» cuando falta alguna.
 */
export function roundMachines({ machines = [], rooms = [], plantId }) {
  const eligible = machines.filter((m) => m.plant_id === plantId && m.status !== 'decommissioned' && roundRoomOf(m))
  const withMachine = new Set(eligible.map(roundRoomOf))
  const roundRooms = rooms.filter((r) => r.plant_id === plantId && ROUND_ROOM_TYPES.includes(r.type) && withMachine.has(r.id))
  const roomIds = new Set(roundRooms.map((r) => r.id))
  return { rooms: roundRooms, machines: eligible.filter((m) => roomIds.has(roundRoomOf(m))) }
}
