/**
 * Evidencia de producción (cargue, transferencia, nacimiento) para el Centro SIG.
 * Vive aparte de MachineAssetHub para que el tablero del líder la use sin cargar
 * el Centro de Activos completo (historial Mantum, ~7 MB), que ahí se abre diferido.
 */

const HATCH_MODE_LABEL = { single: 'sencilla', double: 'doble' }

export function formatDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('es-CO')
}

// Los registros de producción ya guardan quién, cuándo, qué lote y la foto de la pantalla de la
// máquina: son la evidencia de que el cargue, la transferencia o el nacimiento ocurrieron. Se
// muestran tal cual están en la base; si falta la foto se dice, no se rellena.
export function buildProductionEvidence({ loads = [], transfers = [], hatches = [], machines = {}, people = {}, photoUrls = new Map(), now = new Date() } = {}) {
  const nowTime = now.getTime()
  const happened = (value) => {
    if (!value) return false
    const time = new Date(value).getTime()
    return Number.isFinite(time) && time <= nowTime
  }
  const personName = (userId) => people[userId] || 'No registrado'
  const photoOf = (path) => (path ? photoUrls.get(path) || null : null)
  const photoItem = (id, path, label) => {
    const url = photoOf(path)
    return { id, file_name: label, url, notes: url ? '' : path ? 'La foto no se pudo abrir' : 'Registro sin foto adjunta' }
  }
  const photoStatus = (path) => (path ? (photoOf(path) ? 'Adjunta' : 'Adjunta, no se pudo abrir') : 'Sin foto')
  const count = (value) => (value != null ? Number(value).toLocaleString('es-CO') : null)
  const records = []

  for (const load of loads) {
    const when = load.loaded_at || load.created_at
    // Un cargue planeado para más adelante todavía no es evidencia de nada.
    if (!happened(when)) continue
    const machine = machines[load.machine_id] || {}
    const machineLabel = machine.code || machine.name || 'Incubadora'
    const lot = load.lote || 'sin lote'
    const tape = load.tape_color_name || load.tape_color
    const detail = [`Lote ${lot}`, machineLabel, tape ? `Cinta ${tape}` : null, `Registró: ${personName(load.created_by)}`].filter(Boolean).join(' · ')
    const cycleStart = formatDateTime(load.cycle_start_at)
    records.push({
      id: `production-load-${load.id}`,
      file_name: `Cargue ${machineLabel} · Lote ${lot}`,
      file_type: 'production',
      formatCode: 'PRODUCCIÓN · CARGUE',
      workOrderTitle: 'Registro de cargue de incubadora',
      recordTitle: 'REGISTRO DE CARGUE DE INCUBADORA',
      recordFields: [
        ['Lote', load.lote || null],
        ['Incubadora', [machine.code, machine.name].filter(Boolean).join(' · ') || null],
        ['Fecha y hora del cargue', formatDateTime(when)],
        ['Inicio del ciclo', cycleStart],
        ['Cinta / clasificación', tape || null],
        ['Registró', personName(load.created_by)],
        ['Foto de la pantalla', photoStatus(load.photo_path)],
      ],
      machineCode: machine.code || null,
      note: detail,
      created_at: when,
      source: 'incubapp',
      kind: 'production',
      uploaded_by: load.created_by || null,
      items: [photoItem(`${load.id}-photo`, load.photo_path, 'Foto de la pantalla')],
      reports: [{ id: `${load.id}-detail`, title: 'Detalle del cargue', body: cycleStart ? `${detail} · Inicio de ciclo ${cycleStart}` : detail }],
      url: photoOf(load.photo_path),
    })
  }

  for (const transfer of transfers) {
    const when = transfer.transferred_at || transfer.created_at
    if (!happened(when)) continue
    const lot = transfer.lote || 'sin lote'
    const mode = HATCH_MODE_LABEL[transfer.mode]
    const detail = [`Lote ${lot}`, mode ? `Transferencia ${mode}` : null, transfer.weight_diff != null ? `Diferencia de peso ${transfer.weight_diff}` : null, `Registró: ${personName(transfer.created_by)}`].filter(Boolean).join(' · ')
    records.push({
      id: `production-transfer-${transfer.id}`,
      file_name: `Transferencia a nacedora · Lote ${lot}`,
      file_type: 'production',
      formatCode: 'PRODUCCIÓN · TRANSFERENCIA',
      workOrderTitle: 'Registro de transferencia incubadora → nacedora',
      recordTitle: 'REGISTRO DE TRANSFERENCIA A NACEDORA',
      recordFields: [
        ['Lote', transfer.lote || null],
        ['Modalidad', mode ? `Transferencia ${mode}` : null],
        ['Fecha y hora', formatDateTime(when)],
        ['Diferencia de peso', transfer.weight_diff != null ? String(transfer.weight_diff) : null],
        ['Registró', personName(transfer.created_by)],
        ['Foto', photoStatus(transfer.photo_path)],
      ],
      note: detail,
      created_at: when,
      source: 'incubapp',
      kind: 'production',
      uploaded_by: transfer.created_by || null,
      items: [photoItem(`${transfer.id}-photo`, transfer.photo_path, 'Foto de la transferencia')],
      reports: [{ id: `${transfer.id}-detail`, title: 'Detalle de la transferencia', body: detail }],
      url: photoOf(transfer.photo_path),
    })
  }

  for (const hatch of hatches) {
    const when = hatch.ended_at || hatch.started_at || hatch.created_at
    if (!happened(when)) continue
    const lot = hatch.lote || 'sin lote'
    const closed = hatch.status === 'completed'
    const responsible = closed ? hatch.closed_by || hatch.started_by : hatch.started_by
    const detail = [
      `Lote ${lot}`,
      closed ? 'Nacimiento completado' : 'Nacimiento en curso',
      hatch.actual_chicks != null ? `${Number(hatch.actual_chicks).toLocaleString('es-CO')} pollitos nacidos` : null,
      hatch.estimated_chicks != null ? `${Number(hatch.estimated_chicks).toLocaleString('es-CO')} estimados` : null,
      `${closed ? 'Cerró' : 'Inició'}: ${personName(responsible)}`,
    ].filter(Boolean).join(' · ')
    records.push({
      id: `production-hatch-${hatch.id}`,
      file_name: `Nacimiento · Lote ${lot}`,
      file_type: 'production',
      formatCode: 'PRODUCCIÓN · NACIMIENTO',
      workOrderTitle: 'Registro de nacimiento',
      recordTitle: 'REGISTRO DE NACIMIENTO',
      recordFields: [
        ['Lote', hatch.lote || null],
        ['Estado', closed ? 'Completado' : 'En curso'],
        ['Modalidad', HATCH_MODE_LABEL[hatch.mode] || null],
        ['Inicio', formatDateTime(hatch.started_at)],
        ['Fin', formatDateTime(hatch.ended_at)],
        ['Huevos incubables', count(hatch.incubable_eggs)],
        ['Pollitos estimados', count(hatch.estimated_chicks)],
        ['Pollitos nacidos', count(hatch.actual_chicks)],
        ['Inició', personName(hatch.started_by)],
        ['Cerró', hatch.closed_by ? personName(hatch.closed_by) : null],
        ['Foto', photoStatus(hatch.photo_path)],
      ],
      note: detail,
      created_at: when,
      source: 'incubapp',
      kind: 'production',
      uploaded_by: responsible || null,
      items: [photoItem(`${hatch.id}-photo`, hatch.photo_path, 'Foto del nacimiento')],
      reports: [{ id: `${hatch.id}-detail`, title: 'Detalle del nacimiento', body: detail }],
      url: photoOf(hatch.photo_path),
    })
  }

  return records
}
