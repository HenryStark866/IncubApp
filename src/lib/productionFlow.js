/**
 * =============================================================================
 * ARCHIVO: src/lib/productionFlow.js
 * PROPÓSITO: El flujo real de la planta, de punta a punta, calculado con lo que ya se
 *   registra (12-10-2026, definido por planta). Dice qué toca HOY en cada etapa, quién lo
 *   hace y a qué pantalla ir, para que la app vaya dirigiendo la operación:
 *
 *   1. Recepción (operario de recepción): reporta el huevo recibido con la foto de la
 *      etiqueta, lo baja al cuarto frío, lo cuenta y lo coteja con la remisión: visto
 *      bueno o novedad.
 *   2. Clasificación (operario de recepción): los días SIN nacimiento.
 *   3. Cargue (turno / líder): los mapas de cargue entran según el broiler. Se carga la
 *      noche anterior a un día de nacimiento (dom, lun, mié y jue en la noche): lo normal
 *      son dos incubadoras.
 *   4. Calibración de incubadoras: entre 1 día 12 h y 2 días 12 h de incubación.
 *   5. Transferencia (turneros, auxiliares o líderes): día 18.
 *   6. Calibración de nacedoras: DESPUÉS de la transferencia.
 *   7. Nacimiento (auxiliar de vacunación; o supervisor / líder de producción): día 21,
 *      reporta cantidades (sexaje y conteo) y pesos.
 *
 * Función pura: recibe filas y devuelve las etapas. La usa useProductionFlow.
 * =============================================================================
 */
import { computeAllMachineStates } from './machineOpsState'
import { cycleSchedule, dayKey, isHatchDay, nextHatchDay, ROOMS_PER_HATCH_DAY, HATCH_WEEKDAY_LABEL } from './hatchSchedule'
import { INC_CALIB_MAX_HOURS, INC_CALIB_MIN_HOURS, CALIB_SOURCE } from './machineCalibration'
import { botStatus, BOT_ACTIVE_WINDOW_H } from './roundsBot'
import { clockLabel, compareClock, latestClocks } from './machineClock'

const DAY = 86_400_000
const H = 3_600_000
const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const CARTS_PER_SETTER = 12
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const ms = (v) => {
  const t = Date.parse(v || '')
  return Number.isNaN(t) ? null : t
}
const fmt = (n) => Math.round(num(n)).toLocaleString('es-CO')
const lotsOf = (t) => [...new Set(String(t || '').match(/\d+/g) || [])]

/** Quién hace cada etapa (para filtrar «mi parte del flujo») */
export const STAGE_ROLES = {
  rondas: ['operator', 'auxiliary', 'auxiliary_production', 'supervisor'],
  recepcion: ['reception_operator'],
  clasificacion: ['reception_operator'],
  cargue: ['operator', 'auxiliary', 'auxiliary_production', 'supervisor'],
  calib_inc: ['operator', 'auxiliary', 'auxiliary_production', 'maintenance_auxiliary', 'supervisor'],
  transferencia: ['operator', 'auxiliary', 'auxiliary_production', 'supervisor'],
  calib_nac: ['operator', 'auxiliary', 'auxiliary_production', 'maintenance_auxiliary', 'supervisor'],
  nacimiento: ['vaccination_auxiliary', 'supervisor'],
}

/** Etapas que ve cada perfil. Líderes, gerencia y administración ven todo. */
export function stagesForRole(role) {
  const ids = Object.entries(STAGE_ROLES)
    .filter(([, roles]) => roles.includes(role))
    .map(([id]) => id)
  return ids.length ? ids : Object.keys(STAGE_ROLES)
}

function stage(id, n, title, owner, tab, items, okText) {
  const pending = items.filter((i) => i.tone !== 'ok' && i.tone !== 'info')
  return {
    id,
    n,
    title,
    owner,
    tab,
    items: items.length ? items : [{ id: `${id}-ok`, tone: 'ok', text: okText }],
    status: pending.some((i) => i.tone === 'danger') ? 'late' : pending.length ? 'pending' : 'ok',
    pending: pending.length,
  }
}

/**
 * @param {object} p filas de la base (todas opcionales)
 * @returns {{ today: object, stages: object[], next: object[] }}
 */
export function buildProductionFlow({
  now = Date.now(),
  machines = [],
  loads = [],
  transfers = [],
  hatches = [],
  maps = [],
  carts = [],
  arrivals = [],
  remisions = [],
  stock = [],
  quality = [],
  calibOrders = [],
  botChecks = [],
  clockChecks = [],
} = {}) {
  const today = dayKey(now)
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay()
  const hatchToday = isHatchDay(today)
  const tomorrow = dayKey(now + DAY)
  const states = computeAllMachineStates({ machines, loads, transfers, hatches, now })
  const code = new Map(machines.map((m) => [m.id, m.code || m.name || '—']))
  const setters = machines.filter((m) => m.type === 'setter' || m.type === 'combo')
  const hatchers = machines.filter((m) => m.type === 'hatcher')
  const sinceToday = ms(`${today}T00:00:00-05:00`)
  // Reloj del ciclo que muestra cada pantalla (bot de EagleTrax / fotos de ronda)
  const clocks = latestClocks(clockChecks, now)
  const clockCheck = new Map(setters.map((m) => [m.id, compareClock(clocks.get(m.id), states.get(m.id))]))

  // ── 1. Recepción ───────────────────────────────────────────────
  const arrivalsToday = arrivals.filter((a) => (ms(a.arrived_at) ?? 0) >= sinceToday)
  const remToday = remisions.filter((r) => (ms(r.created_at) ?? 0) >= sinceToday)
  const rec = []
  if (!arrivalsToday.length && !remToday.length) {
    rec.push({ id: 'rec-none', tone: 'info', text: 'Sin huevo recibido hoy todavía', detail: 'Cuando llegue: foto de la etiqueta 🏷️ y mensaje de huevo recibido en «Llegada a planta».', tab: 'recepcion' })
  }
  for (const a of arrivalsToday) {
    rec.push({ id: `arr-${a.id}`, tone: 'ok', text: `Llegó el lote ${a.lot_code || '—'}`, detail: a.seal_number ? `Sello ${a.seal_number}` : 'Con foto de la etiqueta', tab: 'recepcion' })
  }
  const sinVerificar = remisions.filter((r) => !r.verificacion && now - (ms(r.created_at) ?? now) < 3 * DAY)
  for (const r of sinVerificar) {
    rec.push({ id: `rv-${r.id}`, tone: 'warn', text: `Remisión Nº ${r.remision_no}: falta el visto bueno`, detail: `${fmt(r.totales?.incubable)} incubables en el papel · cuéntalo en el cuarto frío y da el visto bueno o reporta la novedad`, tab: 'remision-galpon' })
  }
  for (const r of remisions.filter((x) => x.verificacion === 'novedad' && now - (ms(x.created_at) ?? now) < 3 * DAY)) {
    rec.push({ id: `rn-${r.id}`, tone: 'danger', text: `Novedad en la remisión Nº ${r.remision_no}`, detail: r.novedad || 'Ver la remisión', tab: 'remision-galpon' })
  }
  if (arrivalsToday.length && !remToday.length) {
    rec.push({ id: 'rec-rem', tone: 'warn', text: 'Huevo recibido sin remisión registrada', detail: 'Toma la foto de la remisión y coteja las cantidades.', tab: 'remision-galpon' })
  }

  // ── 2. Clasificación ───────────────────────────────────────────
  const available = carts.filter((c) => c.status === 'available')
  const reserved = carts.filter((c) => c.status === 'reserved')
  const stockIncubable = stock.reduce((s, r) => s + num(r.counts?.incubable), 0)
  const cla = []
  if (hatchToday) {
    cla.push({ id: 'cla-hatch', tone: 'info', text: `Hoy (${WEEKDAY[wd]}) hay nacimiento: normalmente no se clasifica`, detail: 'La clasificación se hace los días sin nacimiento (miércoles, sábado y domingo).' })
  } else {
    cla.push({
      id: 'cla-day',
      tone: available.length >= CARTS_PER_SETTER * ROOMS_PER_HATCH_DAY ? 'ok' : 'warn',
      text: `Hoy (${WEEKDAY[wd]}) es día de clasificar`,
      detail: `${available.length} carros clasificados disponibles${stockIncubable ? ` · ${fmt(stockIncubable)} huevos incubables en cuarto frío` : ''}. Para cada cargue van ${CARTS_PER_SETTER} carros.`,
      tab: 'clasificacion',
    })
  }
  if (reserved.length) cla.push({ id: 'cla-res', tone: 'info', text: `${reserved.length} carros ya reservados en mapas de cargue`, tab: 'cargue' })

  // ── 3. Cargue ──────────────────────────────────────────────────
  // Se carga la noche anterior a un día de nacimiento: así el día 21 cae en ese día.
  const nightHatch = cycleSchedule(new Date(`${today}T22:00:00-05:00`).toISOString())
  const loadsTonight = nightHatch?.onSchedule
  const empty = setters.filter((m) => {
    const s = states.get(m.id)
    const corriendo = clockCheck.get(m.id)?.kind === 'sin_registro'
    return m.status !== 'decommissioned' && m.status !== 'maintenance' && !corriendo && (!s || s.phase === 'idle' || s.phase === 'completed')
  })
  const openMaps = maps.filter((m) => ['approved', 'ordered'].includes(m.status))
  const pendingMaps = maps.filter((m) => m.status === 'pending_approval')
  const loadedToday = loads.filter((l) => (ms(l.loaded_at) ?? 0) >= sinceToday)
  const loadedMachinesToday = new Set(loadedToday.map((l) => l.machine_id))
  const car = []
  if (loadsTonight) {
    const need = Math.max(0, ROOMS_PER_HATCH_DAY - loadedMachinesToday.size)
    car.push({
      id: 'car-tonight',
      tone: need === 0 ? 'ok' : openMaps.length >= need ? 'warn' : 'danger',
      text: need === 0 ? 'Cargue de esta noche hecho' : `Esta noche se cargan ${need === 1 ? '1 incubadora' : `${need} incubadoras`}`,
      detail: `Nacen el ${WEEKDAY[new Date(`${nightHatch.hatchDate}T12:00:00Z`).getUTCDay()]} ${nightHatch.hatchDate.slice(8)}/${nightHatch.hatchDate.slice(5, 7)}. Incubadoras libres: ${empty.map((m) => m.code).slice(0, 8).join(', ') || 'ninguna'}. Mapas listos: ${openMaps.length}.`,
      tab: 'cargue',
    })
  } else {
    car.push({ id: 'car-none', tone: 'info', text: 'Esta noche no se carga', detail: `Se carga la noche antes de un día de nacimiento (${HATCH_WEEKDAY_LABEL}). Próximo: ${nextHatchDay(tomorrow)}.` })
  }
  for (const m of setters) {
    const cmp = clockCheck.get(m.id)
    if (!cmp || cmp.kind === 'ok') continue
    const s = states.get(m.id)
    if (cmp.kind === 'sin_registro') {
      car.push({
        id: `clk-${m.id}`,
        tone: 'danger',
        text: `${m.code}: su pantalla lleva ${clockLabel(cmp.clock.ageMin)} de ciclo y en la app está vacía`,
        detail: `Cargue sin registrar (empezó hacia el ${new Date(cmp.clock.startAt).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}). Regístralo con sus lotes.`,
        tab: 'cargue',
      })
    } else {
      car.push({
        id: `clk-${m.id}`,
        tone: 'warn',
        text: `${m.code}: la pantalla dice día ${Math.floor(cmp.clock.day)} y la app día ${s?.age_hours != null ? Math.floor(s.age_hours / 24) : '—'}`,
        detail: `El inicio de ciclo registrado no cuadra con el reloj de la máquina (${Math.round(Math.abs(cmp.diffH ?? 0))} h de diferencia). Revisa el cargue: la máquina manda.`,
        tab: 'cargue',
      })
    }
  }
  for (const m of openMaps) {
    car.push({ id: `map-${m.id}`, tone: 'warn', text: `Mapa listo para cargar: ${m.machine_name || code.get(m.machine_id) || 'incubadora por asignar'}`, detail: m.status === 'ordered' ? 'Orden de cargue dada' : 'Aprobado, falta la orden', tab: 'cargue' })
  }
  for (const m of pendingMaps) car.push({ id: `mapp-${m.id}`, tone: 'warn', text: `Mapa por aprobar: ${m.machine_name || 'incubadora'}`, tab: 'cargue' })
  if (loadsTonight && !openMaps.length && !pendingMaps.length && available.length < CARTS_PER_SETTER) {
    car.push({ id: 'car-nomap', tone: 'danger', text: 'No hay mapas ni carros suficientes para el cargue de esta noche', detail: 'Clasifica y arma los mapas de cargue.', tab: 'clasificacion' })
  }

  // ── 4. Calibración INC (1d12h – 2d12h) ─────────────────────────
  const calibDoneSince = (machineId, at) =>
    calibOrders.some((o) => o.machine_id === machineId && o.status === 'completed' && (ms(o.completed_at) ?? ms(o.created_at) ?? 0) >= at)
  const calInc = []
  for (const m of setters) {
    const s = states.get(m.id)
    if (!s || !['incubating', 'calib_window'].includes(s.phase)) continue
    const start = ms(s.cycle_start_at)
    if (start == null) continue
    const h = (now - start) / H
    if (h < INC_CALIB_MIN_HOURS - 12 || h > INC_CALIB_MAX_HOURS + 12) continue
    if (calibDoneSince(m.id, start)) {
      calInc.push({ id: `ci-${m.id}`, tone: 'ok', text: `${m.code} calibrada`, detail: `Ciclo de ${Math.floor(h / 24)}d ${Math.floor(h % 24)}h` })
      continue
    }
    calInc.push({
      id: `ci-${m.id}`,
      tone: h > INC_CALIB_MAX_HOURS ? 'danger' : h >= INC_CALIB_MIN_HOURS ? 'warn' : 'info',
      text: h < INC_CALIB_MIN_HOURS ? `${m.code}: calibrar desde el día 1 con 12 h` : h > INC_CALIB_MAX_HOURS ? `${m.code}: se pasó la ventana de calibración` : `${m.code}: calibrar ahora`,
      detail: `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h de incubación · ventana 1d12h a 2d12h`,
      tab: 'calibracion',
    })
  }

  // ── 5. Transferencia (día 18) ──────────────────────────────────
  const freeRooms = new Map()
  for (const m of hatchers) {
    const s = states.get(m.id)
    const free = !s || s.phase === 'idle' || s.phase === 'completed'
    if (!freeRooms.has(m.room_id)) freeRooms.set(m.room_id, { free: true, codes: [] })
    const r = freeRooms.get(m.room_id)
    r.free = r.free && free
    r.codes.push(m.code)
  }
  const roomsFree = [...freeRooms.values()]
    .filter((r) => r.free)
    .map((r) => {
      const c = [...r.codes].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      return c.length > 1 ? `${c[0]} a ${c[c.length - 1]}` : c[0]
    })
  const tra = []
  for (const m of setters) {
    const s = states.get(m.id)
    const cmp = clockCheck.get(m.id)
    const running = s && ['incubating', 'transfer_ready', 'calib_window'].includes(s.phase)
    if (!running && cmp?.kind !== 'sin_registro') continue
    // La máquina manda: con reloj fresco se usa su inicio real
    const start = cmp?.clock ? cmp.clock.startAt : ms(s.cycle_start_at)
    const sched = cycleSchedule(start)
    if (!sched) continue
    const due = ms(sched.transferAt)
    const day = (now - start) / DAY
    if (due - now > 1.2 * DAY) continue
    tra.push({
      id: `tr-${m.id}`,
      tone: day > 19 ? 'danger' : 'warn',
      text: `${m.code}: ${day >= 18 ? 'transferir hoy' : 'se transfiere mañana'} · lote ${s?.lote || 'sin registrar'}${cmp?.clock ? ' · según la pantalla' : ''}`,
      detail: `Día ${Math.floor(day)} de incubación · nace el ${sched.hatchDate.slice(8)}/${sched.hatchDate.slice(5, 7)} · salas libres: ${roomsFree.join(', ') || 'ninguna'}`,
      tab: 'supervision',
    })
  }

  // ── 6. Calibración de nacedoras: después de transferir ─────────
  const calNac = []
  for (const t of transfers) {
    const at = ms(t.transferred_at)
    if (at == null || now - at > 3 * DAY) continue
    if (hatches.some((h) => h.transfer_id === t.id && h.status === 'completed')) continue
    const ids = (t.hatcher_ids || []).length ? t.hatcher_ids : hatchers.filter((m) => (t.room_ids || []).includes(m.room_id)).map((m) => m.id)
    for (const id of ids) {
      const done = calibDoneSince(id, at)
      calNac.push({
        id: `cn-${t.id}-${id}`,
        tone: done ? 'ok' : 'warn',
        text: `${code.get(id)}: ${done ? 'calibrada después de la transferencia' : 'calibrar (ya recibió el huevo)'}`,
        detail: `Transferencia del lote ${t.lote || '—'}`,
        tab: done ? undefined : 'calibracion',
      })
    }
  }

  // ── 7. Nacimiento (día 21) ─────────────────────────────────────
  const hatchDayOf = (h) => dayKey(ms(h.scheduled_at) ?? ms(h.started_at) ?? ms(h.created_at) ?? now)
  // Peso promedio: el del nacimiento o el de la «Calidad del pollito» de sus lotes ese día
  const weightOf = (h) => {
    if (num(h.avg_chick_weight_g)) return num(h.avg_chick_weight_g)
    const lots = lotsOf(h.lote)
    const q = quality.find((r) => (r.kind === 'chick_quality' || r.kind === 'chick_weight') && lots.includes(String(r.lote || '').trim()) && dayKey(ms(r.sampled_at) ?? 0) >= hatchDayOf(h))
    return q?.results?.promedio ?? null
  }
  const nac = []
  const todays = hatches.filter((h) => h.status !== 'cancelled' && hatchDayOf(h) === today)
  for (const h of todays) {
    const counted = num(h.actual_chicks) > 0
    nac.push({
      id: `h-${h.id}`,
      tone: counted ? 'ok' : 'warn',
      text: counted ? `Nacimiento lote ${h.lote}: ${fmt(h.actual_chicks)} pollitos` : `Nace hoy el lote ${h.lote}: reportar sexaje, conteo y pesos`,
      detail: counted
        ? weightOf(h)
          ? `Peso promedio ${weightOf(h)} g`
          : 'Falta el peso del pollito (formato «Calidad del pollito»)'
        : 'Lo reporta la auxiliar de vacunación (o el supervisor / líder de producción).',
      tab: 'vacunacion',
    })
  }
  const pendingCount = hatches.filter((h) => h.status !== 'cancelled' && hatchDayOf(h) < today && now - (ms(h.scheduled_at) ?? ms(h.started_at) ?? now) < 10 * DAY && !(num(h.actual_chicks) > 0))
  for (const h of pendingCount) {
    nac.push({ id: `hp-${h.id}`, tone: 'danger', text: `Faltan los pollitos reales del lote ${h.lote} (${hatchDayOf(h).slice(8)}/${hatchDayOf(h).slice(5, 7)})`, detail: 'Sin este dato la proyección broiler no puede usar la tasa real.', tab: 'vacunacion' })
  }
  const nextHatch = hatches
    .filter((h) => h.status === 'planned' && hatchDayOf(h) > today)
    .sort((a, b) => hatchDayOf(a).localeCompare(hatchDayOf(b)))
  if (nextHatch.length) {
    const d = hatchDayOf(nextHatch[0])
    const rooms = nextHatch.filter((h) => hatchDayOf(h) === d).length
    nac.push({
      id: 'h-next',
      tone: 'info',
      text: `${d === tomorrow ? 'Mañana' : 'Próximo nacimiento:'} ${WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)} · ${rooms} sala${rooms === 1 ? '' : 's'}`,
      detail: `Lotes ${nextHatch.filter((h) => hatchDayOf(h) === d).map((h) => h.lote).join(' · ')}`,
    })
  }

  // ── 0. Rondas de cada hora: las hace el bot de EagleTrax ──────
  const bot = botStatus(botChecks, now)
  const ron = []
  if (bot.last) {
    const mins = Math.round((now - ms(bot.last)) / 60000)
    ron.push(
      bot.active
        ? { id: 'bot-ok', tone: 'ok', text: `El bot de EagleTrax hizo la ronda hace ${mins} min`, detail: `${bot.machines} máquinas en su última ronda · el operario solo hace la ronda de recibir el turno` }
        : { id: 'bot-down', tone: 'danger', text: `El bot de EagleTrax no reporta hace ${Math.floor(mins / 60)} h ${mins % 60} min`, detail: `Revisa el PC EAGLETRAX (encendido, sesión abierta, EagleTrax en el plano). Mientras tanto el turno vuelve a hacer las rondas.`, tab: 'supervision' },
    )
  } else {
    ron.push({ id: 'bot-none', tone: 'info', text: 'Rondas a cargo del turno', detail: `Cuando el bot de EagleTrax esté instalado hará las rondas de cada hora (se considera activo si reportó en las últimas ${BOT_ACTIVE_WINDOW_H} h).`, tab: 'supervision' })
  }

  const stages = [
    stage('rondas', 0, 'Rondas de cada hora (bot EagleTrax)', 'Bot EagleTrax · el operario recibe el turno', 'supervision', ron, 'Rondas al día'),
    stage('recepcion', 1, 'Recepción del huevo', 'Operario de recepción', 'recepcion', rec, 'Recepción al día'),
    stage('clasificacion', 2, 'Cuarto frío y clasificación', 'Operario de recepción', 'clasificacion', cla, 'Clasificación al día'),
    stage('cargue', 3, 'Mapas y cargue de incubadoras', 'Turno y líder de planta', 'cargue', car, 'Cargue al día'),
    stage('calib_inc', 4, 'Calibración de incubadoras (1d12h–2d12h)', 'Turno / mantenimiento', 'calibracion', calInc, 'Ninguna incubadora en ventana de calibración'),
    stage('transferencia', 5, 'Transferencia (día 18)', 'Turneros, auxiliares o líderes', 'supervision', tra, 'Ninguna transferencia para hoy ni mañana'),
    stage('calib_nac', 6, 'Calibración de nacedoras (después de transferir)', 'Turno / mantenimiento', 'calibracion', calNac, 'Nacedoras al día'),
    stage('nacimiento', 7, `Nacimiento (día 21 · ${HATCH_WEEKDAY_LABEL})`, 'Auxiliar de vacunación', 'vacunacion', nac, hatchToday ? 'Sin nacimientos programados hoy' : 'Hoy no hay nacimiento'),
  ]
  const toneRank = { danger: 0, warn: 1 }
  const next = stages
    .flatMap((s) => s.items.filter((i) => i.tone in toneRank).map((i) => ({ ...i, stage: s.id, stageTitle: s.title, owner: s.owner })))
    .sort((a, b) => toneRank[a.tone] - toneRank[b.tone])

  return {
    today: { date: today, weekday: WEEKDAY[wd], hatchToday, loadTonight: !!loadsTonight, hatchFromTonight: nightHatch?.hatchDate || null, classifyToday: !hatchToday },
    stages,
    next,
  }
}

export { CALIB_SOURCE }
