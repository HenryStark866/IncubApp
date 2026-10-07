/**
 * Inicio de la líder de producción (06-10-2026). Funciones puras sobre los datos que carga
 * useLeaderHome (kind «production»): recepción, cuarto frío desglosable, mapas de cargue
 * por revisar, estado de las máquinas y su contenido, transferencias, nacimientos y lo
 * que registra cada auxiliar de su equipo.
 * Equipo: auxiliar de producción, de calidad, de vacunación y operario de recepción.
 */
import { stockByProduct, MOV_LABEL } from '../../../lib/vaccineStock'

export const PRODUCTION_TEAM_ROLES = ['auxiliary_production', 'quality_auxiliary', 'vaccination_auxiliary', 'reception_operator']

export const COLD_TYPES = [
  ['incubable', 'Incubable'],
  ['deforme', 'Deforme'],
  ['extra', 'Extra'],
  ['roto', 'Roto'],
  ['sucio', 'Sucio'],
]

const DAY = 86400000
const QUALITY_LABEL = {
  egg_weight: 'peso del huevo',
  moisture_loss: 'pérdida de humedad',
  candling: 'ovoscopia',
  breakout: 'embriodiagnóstico',
  chick_quality: 'calidad del pollito',
  nitrogen_fridge: 'nevera y nitrógeno',
  sexing_count: 'sexaje y conteo',
  navel_quality: 'ombligo y cicatrización',
}
/** Formatos del auxiliar de vacunación (van a la pestaña Vacunación) */
export const VAC_KINDS = ['nitrogen_fridge', 'sexing_count', 'navel_quality']
const tabOfQuality = (kind) => (VAC_KINDS.includes(kind) ? 'vacunacion' : 'calidad')
const num = (n) => Number(n || 0).toLocaleString('es-CO')
const dayKey = (v) => (v ? new Date(v).toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }) : '')
export const fmtDay = (v) =>
  v
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v).toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
        timeZone: 'America/Bogota',
      })
    : '—'
export const fmtTime = (v) =>
  v ? new Date(v).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : ''

/** Posturas de un lote: número o lista [{ eggs }] */
export function posturesOf(p) {
  if (Array.isArray(p)) return p.reduce((s, x) => s + (Number(x?.eggs) || 0), 0)
  return Number(p) || 0
}

/** Lotes de un mapa de cargue (carros → lots[].lot o entry.lot) */
export function lotsOfMap(map) {
  const out = new Set()
  const payload = map?.payload || map || {}
  for (const s of payload.slots || []) {
    const e = s?.entry
    if (!e) continue
    const list = Array.isArray(e.lots) && e.lots.length ? e.lots : [e]
    for (const l of list) if (l?.lot) out.add(String(l.lot).trim())
  }
  for (const l of payload.lots || []) if (l) out.add(String(l.lot || l).trim())
  return [...out].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

/** Lotes que dice un texto «41 + 43», «Lote 45» … */
export const lotsOfText = (t) => [...new Set(String(t || '').match(/\d+/g) || [])]

// ─────────────────────────── Cuarto frío ───────────────────────────
const totalOf = (counts) => COLD_TYPES.reduce((s, [k]) => s + (Number(counts?.[k]) || 0), 0)

/**
 * Saldos del cuarto frío agrupados por lote, fecha, granja o galpón.
 * Devuelve grupos con total por tipo y sus filas (detalle desglosable).
 */
export function coldRoomGroups({ stock = [], batches = [], farms = [], rooms = [], groupBy = 'batch' }) {
  const batchById = new Map(batches.map((b) => [b.id, b]))
  const farmById = new Map(farms.map((f) => [f.id, f]))
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const rows = stock
    .filter((s) => totalOf(s.counts) > 0)
    .map((s) => {
      const b = batchById.get(s.batch_id)
      const farm = b ? farmById.get(b.farm_id) : null
      const room = roomById.get(s.room_id)
      return {
        id: s.id,
        lote: b?.code || 'Sin lote',
        fecha: s.stock_date,
        granja: farm?.name || 'Sin granja',
        galpon: room ? room.name || room.code : 'Sin galpón',
        counts: s.counts || {},
        total: totalOf(s.counts),
        updatedAt: s.updated_at,
      }
    })
  const keyOf = {
    batch: (r) => r.lote,
    date: (r) => r.fecha || 'Sin fecha',
    farm: (r) => r.granja,
    barn: (r) => `${r.granja} · ${r.galpon}`,
  }[groupBy] || ((r) => r.lote)
  const groups = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    if (!groups.has(k)) groups.set(k, { key: k, rows: [], counts: {}, total: 0 })
    const g = groups.get(k)
    g.rows.push(r)
    g.total += r.total
    for (const [t] of COLD_TYPES) g.counts[t] = (g.counts[t] || 0) + (Number(r.counts[t]) || 0)
  }
  const list = [...groups.values()]
  for (const g of list) g.rows.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || a.lote.localeCompare(b.lote))
  list.sort((a, b) =>
    groupBy === 'date' ? String(b.key).localeCompare(String(a.key)) : String(a.key).localeCompare(String(b.key), 'es', { numeric: true }),
  )
  const totals = { total: 0 }
  for (const [t] of COLD_TYPES) totals[t] = 0
  for (const g of list) {
    totals.total += g.total
    for (const [t] of COLD_TYPES) totals[t] += g.counts[t] || 0
  }
  return { groups: list, totals, rows }
}

// ─────────────────────────── Máquinas ───────────────────────────
/**
 * Estado de cada máquina con su contenido.
 * Incubadora: cargues de los últimos 21 días que no han salido (sin transferencia
 * posterior) → lotes, inicio de ciclo y día de incubación.
 * Nacedora: transferencias de los últimos 4 días que la incluyen → lotes y hora.
 */
export function machineStates({ machines = [], loads = [], transfers = [], checks = [], workOrders = [], now = new Date() }) {
  const t = now.getTime()
  const lastCheck = new Map()
  for (const c of [...checks].sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)))) {
    if (!lastCheck.has(c.machine_id)) lastCheck.set(c.machine_id, c)
  }
  const openWo = new Map()
  for (const w of workOrders) if (['open', 'in_progress'].includes(w.status) && w.machine_id) openWo.set(w.machine_id, (openWo.get(w.machine_id) || 0) + 1)
  return machines
    .filter((m) => m.status !== 'decommissioned')
    .map((m) => {
      const isHatcher = m.type === 'hatcher' || /^NAC/i.test(m.code || '')
      const chk = lastCheck.get(m.id) || null
      let lots = []
      let since = null
      let day = null
      let detail = []
      if (!isHatcher) {
        const out = transfers
          .filter((x) => x.source_machine_id === m.id)
          .map((x) => new Date(x.transferred_at).getTime())
        const lastOut = out.length ? Math.max(...out) : 0
        const active = loads.filter((l) => {
          const at = new Date(l.loaded_at || l.created_at).getTime()
          return l.machine_id === m.id && t - at < 21 * DAY && at > lastOut
        })
        if (active.length) {
          lots = [...new Set(active.flatMap((l) => lotsOfText(l.lote)))]
          since = active.map((l) => l.cycle_start_at || l.loaded_at).sort()[0]
          day = Math.max(0, Math.floor((t - new Date(since).getTime()) / DAY))
          detail = active.map((l) => ({ lote: l.lote, at: l.loaded_at, cycle: l.cycle_start_at }))
        }
      } else {
        const inn = transfers.filter(
          (x) => (x.hatcher_ids || []).includes(m.id) && t - new Date(x.transferred_at).getTime() < 4 * DAY,
        )
        if (inn.length) {
          for (const x of inn) {
            const a = (x.allocations || []).find((al) => al.hatcher_id === m.id)
            const ls = a?.lots?.length ? a.lots.map((l) => String(l.lot || l)) : lotsOfText(x.lote)
            lots.push(...ls)
            detail.push({ lote: ls.join(' + '), at: x.transferred_at })
          }
          lots = [...new Set(lots)]
          since = inn.map((x) => x.transferred_at).sort()[0]
          day = Math.floor((t - new Date(since).getTime()) / DAY)
        }
      }
      const condition = chk?.condition || null
      return {
        id: m.id,
        code: m.code || m.name,
        name: m.name,
        kind: isHatcher ? 'hatcher' : 'setter',
        occupied: lots.length > 0,
        lots,
        since,
        day,
        detail,
        condition,
        lastCheckAt: chk?.taken_at || null,
        temp: chk?.temp_air ?? chk?.temperature ?? null,
        humidity: chk?.humidity ?? null,
        openOrders: openWo.get(m.id) || 0,
        // Incubadora entre el día 18 y 19: lista para transferir
        dueTransfer: !isHatcher && day != null && day >= 18,
      }
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || String(a.code).localeCompare(String(b.code), 'es', { numeric: true }))
}

// ─────────────────────────── Equipo y formatos ───────────────────────────
/**
 * Registros recientes de cada persona del equipo (lo que «sube» cada auxiliar).
 */
export function teamRecords({ members = [], arrivals = [], stock = [], classifications = [], maps = [], vet = [], tasks = [], loads = [], transfers = [], hatches = [], quality = [], vaccineMovements = [], vaccineProducts = [] }) {
  const add = (list, by, item) => {
    if (!by) return
    if (!list.has(by)) list.set(by, [])
    list.get(by).push(item)
  }
  const byUser = new Map()
  for (const a of arrivals) add(byUser, a.received_by, { kind: 'Recepción de lote', at: a.arrived_at || a.created_at, text: `Lote ${a.lot_code || '—'} · ${num(a.received_postures)} huevos${a.photo_paths?.length ? ` · ${a.photo_paths.length} foto(s)` : ''}`, tab: 'recepcion' })
  for (const s of stock) add(byUser, s.updated_by, { kind: 'Saldo cuarto frío', at: s.updated_at, text: `${num(totalOf(s.counts))} huevos · ${fmtDay(s.stock_date)}`, tab: 'clasificacion' })
  for (const c of classifications) add(byUser, c.created_by, { kind: 'Clasificación', at: c.created_at, text: `${c.carts_count || 0} carros · ${c.classification_type || ''}`, tab: 'clasificacion' })
  for (const m of maps) add(byUser, m.created_by || m.payload?.createdBy, { kind: 'Mapa de cargue', at: m.created_at, text: `${m.machine_name || 'Máquina'} · ${lotsOfMap(m).join(', ') || 'sin lotes'}`, tab: 'cargue' })
  for (const v of vet) add(byUser, v.created_by, { kind: v.kind === 'vaccination' ? 'Vacunación' : 'Registro veterinario', at: v.recorded_at || v.created_at, text: [v.title, v.product_name, v.batch_or_lote && `Lote ${v.batch_or_lote}`, v.result_status].filter(Boolean).join(' · '), tab: 'veterinaria' })
  for (const l of loads) add(byUser, l.created_by, { kind: 'Cargue de incubadora', at: l.loaded_at || l.created_at, text: `Lote ${l.lote || '—'}${l.machine_code ? ` · ${l.machine_code}` : ''}`, tab: 'cargue' })
  for (const x of transfers) add(byUser, x.created_by, { kind: 'Transferencia', at: x.transferred_at, text: `Lote ${x.lote || '—'}`, tab: 'supervision' })
  for (const h of hatches) add(byUser, h.created_by, { kind: 'Nacimiento', at: h.ended_at || h.started_at || h.created_at, text: `Lote ${h.lote || '—'}${h.actual_chicks ? ` · ${num(h.actual_chicks)} pollitos` : ''}`, tab: 'supervision' })
  for (const q of quality) add(byUser, q.created_by, { kind: `Calidad · ${QUALITY_LABEL[q.kind] || q.kind}`, at: q.sampled_at, text: `Lote ${q.lote || '—'} · ${q.results?.resumen || ''}${q.status === 'alert' ? ' · ⚠ alerta' : q.status === 'watch' ? ' · vigilar' : ''}`, tab: tabOfQuality(q.kind) })
  const vacuna = new Map(vaccineProducts.map((p) => [p.id, p.name]))
  for (const v of vaccineMovements) add(byUser, v.created_by, { kind: `Vacuna · ${MOV_LABEL[v.kind] || v.kind}`, at: v.moved_at, text: `${vacuna.get(v.product_id) || 'Vacuna'} · ${num(Math.abs(Number(v.doses)))} dosis${v.lote ? ` · lote ${v.lote}` : ''}${v.manufacturer_lot ? ` · fab. ${v.manufacturer_lot}` : ''}`, tab: 'vacunacion' })
  for (const t of tasks) {
    if (t.status === 'completed' || t.status === 'done') add(byUser, t.assigned_to, { kind: 'Tarea cerrada', at: t.completed_at || t.updated_at, text: `${t.title}${t.result_note ? ` · ${t.result_note}` : ''}`, tab: 'supervision', photo: t.photo_path })
  }
  return members
    .filter((m) => PRODUCTION_TEAM_ROLES.includes(m.role))
    .map((m) => {
      const recs = (byUser.get(m.id) || []).sort((a, b) => String(b.at).localeCompare(String(a.at)))
      const mine = tasks.filter((t) => t.assigned_to === m.id)
      return {
        ...m,
        records: recs,
        last: recs[0] || null,
        pending: mine.filter((t) => t.status === 'pending' || t.status === 'in_progress'),
      }
    })
}

// ─────────────────────────── Tablero ───────────────────────────
export function productionBoard({ lots = [], arrivals = [], stockGroups, maps = [], states = [], transfers = [], hatches = [], tasks = [], quality = [], vaccineProducts = [], vaccineMovements = [], now = new Date() }) {
  const today = dayKey(now)
  const decisions = []

  for (const m of maps.filter((x) => x.status === 'pending_approval')) {
    decisions.push({
      id: `map-${m.id}`,
      tone: 'warn',
      title: `Mapa de cargue por revisar · ${m.machine_name || 'sin máquina'}`,
      detail: `${num(m.payload?.summary?.totalEggs)} huevos · lotes ${lotsOfMap(m).join(', ') || '—'} · enviado ${fmtDay(m.created_at)} ${fmtTime(m.created_at)}`,
      mapId: m.id,
    })
  }
  // Recepción con diferencia > 2 % contra lo esperado
  const lotById = new Map(lots.map((l) => [l.id, l]))
  for (const a of arrivals.filter((x) => dayKey(x.arrived_at) === today)) {
    const esperado = posturesOf(lotById.get(a.lot_id)?.postures)
    if (esperado && a.received_postures != null) {
      const diff = Number(a.received_postures) - esperado
      if (Math.abs(diff) / esperado > 0.02) {
        decisions.push({
          id: `rec-${a.id}`,
          tone: 'warn',
          title: `Lote ${a.lot_code} llegó con ${diff > 0 ? '+' : ''}${num(diff)} huevos de diferencia`,
          detail: `Esperado ${num(esperado)} · recibido ${num(a.received_postures)} · ${fmtTime(a.arrived_at)}`,
          tab: 'recepcion',
        })
      }
    }
  }
  for (const s of states) {
    if (s.occupied && s.condition === 'fault') {
      decisions.push({
        id: `fault-${s.id}`,
        tone: 'danger',
        title: `${s.code} con falla y huevo adentro`,
        detail: `Lotes ${s.lots.join(', ')} · día ${s.day ?? '—'}${s.openOrders ? ` · ${s.openOrders} OT abierta(s)` : ' · sin OT'}`,
        tab: 'monitoreo',
      })
    }
    if (s.dueTransfer) {
      decisions.push({
        id: `due-${s.id}`,
        tone: s.day >= 19 ? 'danger' : 'info',
        title: `${s.code} en día ${s.day}: lista para transferir`,
        detail: `Lotes ${s.lots.join(', ')} · ciclo desde ${fmtDay(s.since)}`,
        tab: 'supervision',
      })
    }
  }
  // Muestreos de calidad en alerta de los últimos 2 días
  for (const q of quality.filter((x) => x.status === 'alert' && now - new Date(x.sampled_at) < 2 * DAY)) {
    decisions.push({
      id: `cal-${q.id}`,
      tone: 'warn',
      title: `${VAC_KINDS.includes(q.kind) ? 'Vacunación' : 'Calidad'} en alerta · ${QUALITY_LABEL[q.kind] || q.kind}${q.lote ? ` · lote ${q.lote}` : ''}`,
      detail: `${q.results?.resumen || ''} · ${fmtDay(q.sampled_at)} ${fmtTime(q.sampled_at)}`,
      tab: tabOfQuality(q.kind),
    })
  }
  // Inventario de vacunas: stock bajo, lotes por vencer o vencidos con saldo
  for (const p of stockByProduct({ products: vaccineProducts.filter((x) => x.active), movements: vaccineMovements, now })) {
    p.alerts.forEach((a, i) =>
      decisions.push({ id: `vac-${p.id}-${i}`, tone: a.tone === 'danger' ? 'danger' : 'warn', title: `Vacuna ${p.name}: ${a.text}`, detail: `${num(p.doses)} dosis en total${p.diasDeStock != null ? ` · alcanza para ${p.diasDeStock} día(s)` : ''}`, tab: 'vacunacion' }),
    )
  }
  const late = tasks.filter((t) => t.status === 'pending' && now - new Date(t.created_at) > 4 * 3600000)
  if (late.length) {
    decisions.push({
      id: 'late-tasks',
      tone: 'info',
      title: `${late.length} tarea(s) de tu equipo sin iniciar hace más de 4 horas`,
      detail: late.slice(0, 3).map((t) => t.title).join(' · '),
    })
  }
  const order = { danger: 0, warn: 1, info: 2 }
  decisions.sort((a, b) => order[a.tone] - order[b.tone])

  const recibidoHoy = arrivals.filter((a) => dayKey(a.arrived_at) === today)
  const setters = states.filter((s) => s.kind === 'setter')
  const hatchers = states.filter((s) => s.kind === 'hatcher')
  const weekAgo = now.getTime() - 7 * DAY
  const kpis = [
    {
      label: 'Recibido hoy',
      value: num(recibidoHoy.reduce((s, a) => s + (Number(a.received_postures) || 0), 0)),
      sub: `${recibidoHoy.length} lote(s) · ${lots.filter((l) => l.expected_arrival_date === today && l.status !== 'arrived').length} por llegar`,
    },
    {
      label: 'Cuarto frío',
      value: num(stockGroups?.totals?.incubable),
      sub: `incubable · ${num(stockGroups?.totals?.total)} en total`,
    },
    {
      label: 'Incubadoras cargadas',
      value: `${setters.filter((s) => s.occupied).length} de ${setters.length}`,
      sub: `${setters.filter((s) => s.dueTransfer).length} para transferir · ${hatchers.filter((s) => s.occupied).length} nacedoras con huevo`,
      tone: setters.some((s) => s.dueTransfer && s.day >= 19) ? 'warn' : null,
    },
    {
      label: 'Semana',
      value: `${transfers.filter((x) => new Date(x.transferred_at) > weekAgo).length} · ${hatches.filter((h) => new Date(h.ended_at || h.started_at || h.scheduled_at || h.created_at) > weekAgo).length}`,
      sub: 'transferencias · nacimientos',
    },
  ]
  return { decisions, kpis }
}
