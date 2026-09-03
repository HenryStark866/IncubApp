/**
 * =============================================================================
 * ARCHIVO: src/lib/operationConsolidation.js
 * PROPÓSITO: Consolidación estilo Power BI de TODA la operación de incubación.
 *   Arma un modelo en estrella (tablas de dimensiones + tablas de hechos + KPIs
 *   + hoja "Modelo" con las relaciones) a partir de las tablas de Supabase, y lo
 *   exporta a un libro de Excel listo para cargar en Power BI.
 * CÓMO FUNCIONA: buildOperationModel(orgId) consulta las tablas de la operación,
 *   normaliza fechas/lotes y calcula medidas; exportOperationBook(...) escribe el
 *   .xlsx con exportToExcel. Conversión: 336 huevos/bandeja · 16 bandejas/carro.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { supabase } from './supabase'
import { exportToExcel } from './exportExcel'
import { EGGS_PER_TRAY, TRAYS_PER_CART } from './loadMapEngine'

export const EGGS_PER_CART = EGGS_PER_TRAY * TRAYS_PER_CART // 5376

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10
const dayKey = (v) => (v ? String(v).slice(0, 10) : null)
const sumEggs = (postures) => (postures || []).reduce((s, p) => s + (Number(p?.eggs) || 0), 0)

/** Semana ISO de una fecha. */
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return week
}

/** Fila de la dimensión fecha a partir de una clave YYYY-MM-DD. */
function dateRow(key) {
  const d = new Date(key + 'T00:00:00')
  const mes = d.getMonth() + 1
  return {
    Fecha: key,
    Anio: d.getFullYear(),
    Mes: mes,
    MesNombre: MESES[d.getMonth()],
    AnioMes: `${d.getFullYear()}-${String(mes).padStart(2, '0')}`,
    Trimestre: `T${Math.floor(d.getMonth() / 3) + 1}`,
    Semana: isoWeek(d),
    Dia: d.getDate(),
    DiaSemana: DIAS[d.getDay()],
    EsFinDeSemana: d.getDay() === 0 || d.getDay() === 6 ? 'Sí' : 'No',
  }
}

/**
 * Lee la operación de una org y arma el modelo consolidado.
 * @returns {Promise<{ kpis, breakdowns, sheets, counts, generatedAt }>}
 */
export async function buildOperationModel(orgId) {
  if (!orgId) throw new Error('Falta la organización')

  const q = (table, cols, order) => {
    let sel = supabase.from(table).select(cols).eq('org_id', orgId)
    if (order) sel = sel.order(order, { ascending: false })
    return sel.limit(3000)
  }

  const [
    lotsR, arrivalsR, ordersR, classR, mapsR, loadsR, transfersR, hatchesR, machinesR, plantsR, membersR,
  ] = await Promise.all([
    q('incubation_lots', 'id, code, origin, postures, is_treated, expected_arrival_date, status, priority, created_at'),
    q('lot_arrivals', 'id, lot_id, lot_code, arrived_at, received_postures, seal_number, created_at'),
    q('classification_orders', 'id, status, items, group_count, published_at, created_at'),
    q('egg_tape_classifications', 'id, lot, lots, trays, eggs, production_date, cart_number, cart_color_name, load_group, status, classified_at, is_treated'),
    q('load_maps', 'id, machine_name, machine_id, status, payload, approved_at, ordered_at, created_at'),
    q('setter_loads', 'id, plant_id, machine_id, lote, loaded_at, cycle_start_at, tape_color_name, created_at'),
    q('transfers', 'id, plant_id, lote, mode, room_ids, cycle_start_at, transferred_at, created_at'),
    q('hatch_events', 'id, plant_id, lote, mode, incubable_eggs, estimated_chicks, actual_chicks, females_count, males_count, status, started_at, ended_at, created_at'),
    supabase.from('machines').select('id, name, code, type, plant_id').limit(3000),
    supabase.from('plants').select('id, name, code').eq('org_id', orgId).limit(500),
    supabase
      .from('organization_members')
      .select('user_id, role, area, profiles ( full_name, email )')
      .eq('org_id', orgId)
      .limit(1000),
  ])

  const lots = lotsR.data || []
  const arrivals = arrivalsR.data || []
  const orders = ordersR.data || []
  const carts = classR.data || []
  const maps = mapsR.data || []
  const loads = loadsR.data || []
  const transfers = transfersR.data || []
  const hatches = hatchesR.data || []
  const machines = machinesR.data || []
  const plants = plantsR.data || []
  const members = membersR.data || []

  const plantName = (id) => plants.find((p) => p.id === id)?.name || ''
  const machineOf = (id) => machines.find((m) => m.id === id)
  const machineLabel = (id) => {
    const m = machineOf(id)
    return m ? `${m.name} (${m.code})` : ''
  }

  // ── Dimensión Fecha (todas las fechas que aparecen en la operación) ──
  const dateSet = new Set()
  const addDate = (v) => { const k = dayKey(v); if (k) dateSet.add(k) }
  for (const l of lots) { for (const p of l.postures || []) addDate(p.productionDate); addDate(l.expected_arrival_date); addDate(l.created_at) }
  for (const a of arrivals) { addDate(a.arrived_at); for (const p of a.received_postures || []) addDate(p.productionDate) }
  for (const c of carts) { addDate(c.classified_at); addDate(c.production_date) }
  for (const m of maps) { addDate(m.created_at); addDate(m.approved_at); addDate(m.ordered_at) }
  for (const l of loads) { addDate(l.loaded_at); addDate(l.cycle_start_at) }
  for (const t of transfers) addDate(t.transferred_at)
  for (const h of hatches) { addDate(h.started_at); addDate(h.ended_at) }
  const Dim_Fecha = [...dateSet].sort().map(dateRow)

  // ── Dimensión Lote (clave: Código de lote, unión de todas las fuentes) ──
  const lotByCode = new Map()
  for (const l of lots) {
    const eggs = sumEggs(l.postures)
    lotByCode.set(l.code, {
      Codigo: l.code,
      Origen: l.origin || '',
      Tratado: l.is_treated ? 'Sí' : 'No',
      Estado: l.status || '',
      HuevosPlaneados: eggs,
      Bandejas: round1(eggs / EGGS_PER_TRAY),
      Carros: Math.ceil(eggs / EGGS_PER_CART),
      FechaEsperada: l.expected_arrival_date || '',
      Registrado: dayKey(l.created_at) || '',
    })
  }
  const ensureLot = (code) => {
    if (!code) return
    if (!lotByCode.has(code)) {
      lotByCode.set(code, {
        Codigo: code, Origen: '', Tratado: '', Estado: '(sin maestro)',
        HuevosPlaneados: 0, Bandejas: 0, Carros: 0, FechaEsperada: '', Registrado: '',
      })
    }
  }
  for (const c of carts) ensureLot(c.lot)
  for (const l of loads) ensureLot(l.lote)
  for (const t of transfers) ensureLot(t.lote)
  for (const h of hatches) ensureLot(h.lote)
  const Dim_Lote = [...lotByCode.values()]

  // ── Dimensión Máquina / Planta / Usuario ──
  const Dim_Maquina = machines
    .filter((m) => plants.some((p) => p.id === m.plant_id))
    .map((m) => ({ MaquinaID: m.id, Nombre: m.name, Codigo: m.code, Tipo: m.type, PlantaID: m.plant_id, Planta: plantName(m.plant_id) }))
  const Dim_Planta = plants.map((p) => ({ PlantaID: p.id, Nombre: p.name, Codigo: p.code }))
  const Dim_Usuario = members.map((m) => ({
    UsuarioID: m.user_id,
    Nombre: m.profiles?.full_name || m.profiles?.email || '',
    Correo: m.profiles?.email || '',
    Rol: m.role || '',
    Area: m.area || '',
  }))

  // ── Hechos ──
  const Fact_Postura = []
  for (const l of lots) {
    for (const p of l.postures || []) {
      const eggs = Number(p?.eggs) || 0
      if (eggs <= 0) continue
      Fact_Postura.push({
        Codigo: l.code, FechaPostura: dayKey(p.productionDate) || '', HuevosIncubables: eggs,
        Bandejas: round1(eggs / EGGS_PER_TRAY), Carros: round1(eggs / EGGS_PER_CART),
      })
    }
  }

  const Fact_Llegada = []
  for (const a of arrivals) {
    for (const p of a.received_postures || []) {
      const eggs = Number(p?.eggs) || 0
      if (eggs <= 0) continue
      Fact_Llegada.push({
        Codigo: a.lot_code || '', FechaLlegada: dayKey(a.arrived_at) || '',
        FechaPostura: dayKey(p.productionDate) || '', HuevosRecibidos: eggs,
        Sello: a.seal_number || '',
      })
    }
  }

  const Fact_Clasificacion = carts.map((c) => {
    const eggs = Number(c.eggs) || (Number(c.trays) || 0) * EGGS_PER_TRAY
    const lotesCarro = Array.isArray(c.lots) && c.lots.length
      ? c.lots.map((x) => x.lot).filter(Boolean).join(' + ')
      : c.lot || ''
    return {
      Carro: c.cart_number || '', LotePrincipal: c.lot || '', LotesCarro: lotesCarro,
      FechaClasificacion: dayKey(c.classified_at) || '', FechaProduccion: dayKey(c.production_date) || '',
      Bandejas: Number(c.trays) || 0, Huevos: eggs, Tratado: c.is_treated ? 'Sí' : 'No',
      Cinta: c.cart_color_name || '', GrupoCargue: c.load_group == null ? '' : c.load_group + 1,
      Estado: c.status || '',
    }
  })

  const Fact_Cargue = loads.map((l) => {
    const start = l.cycle_start_at ? new Date(l.cycle_start_at).getTime() : null
    const ageH = start ? Math.max(0, (Date.now() - start) / 3_600_000) : null
    return {
      Lote: l.lote || '', MaquinaID: l.machine_id || '', Maquina: machineLabel(l.machine_id),
      PlantaID: l.plant_id || '', Planta: plantName(l.plant_id),
      FechaCargue: dayKey(l.loaded_at) || '', InicioCiclo: l.cycle_start_at ? new Date(l.cycle_start_at).toISOString() : '',
      Cinta: l.tape_color_name || '', EdadHoras: ageH == null ? '' : round1(ageH), EdadDias: ageH == null ? '' : Math.floor(ageH / 24),
    }
  })

  const Fact_MapaCargue = maps.map((m) => {
    const s = m.payload?.summary || {}
    return {
      Maquina: m.machine_name || machineLabel(m.machine_id), Estado: m.status || '',
      Carros: s.cartCount || (m.payload?.slots || []).filter((x) => x?.entry).length || '',
      Huevos: s.totalEggs || '', Bandejas: s.totalTrays ? round1(s.totalTrays) : '',
      Creado: dayKey(m.created_at) || '', Aprobado: dayKey(m.approved_at) || '', Ordenado: dayKey(m.ordered_at) || '',
    }
  })

  const Fact_Transferencia = transfers.map((t) => ({
    Lote: t.lote || '', Modo: t.mode === 'double' ? 'Doble' : 'Sencilla',
    Salas: (t.room_ids || []).length, PlantaID: t.plant_id || '', Planta: plantName(t.plant_id),
    FechaTransferencia: dayKey(t.transferred_at) || '', InicioCiclo: t.cycle_start_at ? new Date(t.cycle_start_at).toISOString() : '',
  }))

  const Fact_Nacimiento = hatches.map((h) => {
    const inc = Number(h.incubable_eggs) || 0
    const real = Number(h.actual_chicks) || 0
    return {
      Lote: h.lote || '', Modo: h.mode === 'double' ? 'Doble' : 'Sencilla', Estado: h.status || '',
      HuevosIncubables: inc, PollitosEstimados: Number(h.estimated_chicks) || 0, PollitosReales: real,
      Hembras: Number(h.females_count) || 0, Machos: Number(h.males_count) || 0,
      PctNacimiento: inc > 0 && real > 0 ? round1((real / inc) * 100) : '',
      Inicio: dayKey(h.started_at) || '', Fin: dayKey(h.ended_at) || '',
    }
  })

  // ── KPIs (medidas) ──
  const totalPlaneados = lots.reduce((s, l) => s + sumEggs(l.postures), 0)
  const totalRecibidos = Fact_Llegada.reduce((s, r) => s + r.HuevosRecibidos, 0)
  const carrosClasificados = carts.length
  const huevosClasificados = Fact_Clasificacion.reduce((s, r) => s + (r.Huevos || 0), 0)
  const mapasAprob = maps.filter((m) => ['approved', 'ordered', 'completed'].includes(m.status)).length
  const ciclosActivos = loads.filter((l) => l.cycle_start_at).length
  const hatchDone = hatches.filter((h) => h.status === 'completed')
  const pollitos = hatchDone.reduce((s, h) => s + (Number(h.actual_chicks) || 0), 0)
  const incEnNac = hatchDone.reduce((s, h) => s + (Number(h.incubable_eggs) || 0), 0)
  const pctNac = incEnNac > 0 ? round1((pollitos / incEnNac) * 100) : 0

  const kpis = [
    { label: 'Lotes registrados', value: lots.length, unit: 'lotes' },
    { label: 'Lotes por clasificar', value: lots.filter((l) => ['planned', 'arrived'].includes(l.status)).length, unit: 'lotes' },
    { label: 'Huevos planeados', value: totalPlaneados, unit: 'huevos' },
    { label: 'Huevos recibidos', value: totalRecibidos, unit: 'huevos' },
    { label: 'Órdenes de clasificación', value: orders.length, unit: 'órdenes' },
    { label: 'Carros clasificados', value: carrosClasificados, unit: 'carros' },
    { label: 'Huevos clasificados', value: huevosClasificados, unit: 'huevos' },
    { label: 'Mapas de cargue aprobados', value: mapasAprob, unit: `de ${maps.length}` },
    { label: 'Ciclos de incubación activos', value: ciclosActivos, unit: 'cargues' },
    { label: 'Transferencias', value: transfers.length, unit: 'a nacedora' },
    { label: 'Nacimientos completados', value: hatchDone.length, unit: 'jornadas' },
    { label: 'Pollitos nacidos', value: pollitos, unit: 'pollitos' },
    { label: '% nacimiento promedio', value: pctNac, unit: '%' },
  ]

  // ── Desgloses para el tablero en la app ──
  const groupCount = (arr, keyFn) => {
    const m = new Map()
    for (const x of arr) { const k = keyFn(x) || '—'; m.set(k, (m.get(k) || 0) + 1) }
    return [...m.entries()].map(([k, v]) => ({ key: k, count: v })).sort((a, b) => b.count - a.count)
  }
  const breakdowns = {
    lotesPorEstado: groupCount(lots, (l) => l.status),
    carguesPorMaquina: groupCount(loads, (l) => machineLabel(l.machine_id) || 'Sin máquina'),
    clasifPorGrupo: groupCount(carts.filter((c) => c.load_group != null), (c) => `Grupo ${c.load_group + 1}`),
  }

  // ── Hoja Modelo: relaciones para Power BI (star schema) ──
  const KPIs = kpis.map((k) => ({ Indicador: k.label, Valor: k.value, Unidad: k.unit }))
  const Modelo = [
    { Tabla: 'Dim_Fecha', Tipo: 'Dimensión', Clave: 'Fecha', Relacion: 'Marcar como TABLA DE FECHAS en Power BI. Relacionar 1:* con cada columna de fecha de los hechos.' },
    { Tabla: 'Dim_Lote', Tipo: 'Dimensión', Clave: 'Codigo', Relacion: 'Dim_Lote[Codigo] 1:* Fact_Postura/Fact_Llegada/Fact_Clasificacion[LotePrincipal]/Fact_Cargue[Lote]/Fact_Transferencia[Lote]/Fact_Nacimiento[Lote]' },
    { Tabla: 'Dim_Maquina', Tipo: 'Dimensión', Clave: 'MaquinaID', Relacion: 'Dim_Maquina[MaquinaID] 1:* Fact_Cargue[MaquinaID]' },
    { Tabla: 'Dim_Planta', Tipo: 'Dimensión', Clave: 'PlantaID', Relacion: 'Dim_Planta[PlantaID] 1:* Fact_Cargue/Fact_Transferencia[PlantaID]' },
    { Tabla: 'Dim_Usuario', Tipo: 'Dimensión', Clave: 'UsuarioID', Relacion: 'Catálogo de personas (rol/área). Relacionar a columnas de usuario si se agregan a los hechos.' },
    { Tabla: 'Fact_Postura', Tipo: 'Hecho', Clave: 'Codigo + FechaPostura', Relacion: 'Huevos planeados por lote y fecha de postura.' },
    { Tabla: 'Fact_Llegada', Tipo: 'Hecho', Clave: 'Codigo + FechaLlegada', Relacion: 'Huevos recibidos en recepción por fecha.' },
    { Tabla: 'Fact_Clasificacion', Tipo: 'Hecho', Clave: 'Carro', Relacion: 'Un carro por fila (bandejas/huevos/cinta/grupo).' },
    { Tabla: 'Fact_Cargue', Tipo: 'Hecho', Clave: 'Lote + Maquina', Relacion: 'Cargues en incubadora + edad del ciclo.' },
    { Tabla: 'Fact_MapaCargue', Tipo: 'Hecho', Clave: 'Maquina', Relacion: 'Mapas Petersime y su estado de aprobación.' },
    { Tabla: 'Fact_Transferencia', Tipo: 'Hecho', Clave: 'Lote', Relacion: 'Paso a nacedoras.' },
    { Tabla: 'Fact_Nacimiento', Tipo: 'Hecho', Clave: 'Lote', Relacion: 'Pollitos por lote + % de nacimiento.' },
  ]

  const sheets = [
    { name: 'KPIs', rows: KPIs },
    { name: 'Modelo', rows: Modelo },
    { name: 'Dim_Fecha', rows: Dim_Fecha },
    { name: 'Dim_Lote', rows: Dim_Lote },
    { name: 'Dim_Maquina', rows: Dim_Maquina },
    { name: 'Dim_Planta', rows: Dim_Planta },
    { name: 'Dim_Usuario', rows: Dim_Usuario },
    { name: 'Fact_Postura', rows: Fact_Postura },
    { name: 'Fact_Llegada', rows: Fact_Llegada },
    { name: 'Fact_Clasificacion', rows: Fact_Clasificacion },
    { name: 'Fact_Cargue', rows: Fact_Cargue },
    { name: 'Fact_MapaCargue', rows: Fact_MapaCargue },
    { name: 'Fact_Transferencia', rows: Fact_Transferencia },
    { name: 'Fact_Nacimiento', rows: Fact_Nacimiento },
  ]

  return {
    kpis,
    breakdowns,
    sheets,
    counts: {
      lots: lots.length, arrivals: arrivals.length, carts: carts.length, maps: maps.length,
      loads: loads.length, transfers: transfers.length, hatches: hatches.length,
      dates: Dim_Fecha.length,
    },
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Construye el modelo y lo exporta a un libro de Excel (una hoja por tabla).
 * Cada hoja de hechos/dimensiones se puede cargar como tabla en Power BI.
 */
export async function exportOperationBook({ orgId, orgName, userName, model } = {}) {
  const built = model || (await buildOperationModel(orgId))
  // Incluir hasta hojas vacías con encabezado mínimo evita perder tablas del modelo.
  const sheets = built.sheets.map((s) => ({
    name: s.name,
    rows: s.rows.length ? s.rows : [{ _vacio: 'sin datos aún' }],
  }))
  await exportToExcel('consolidado-operacion-incubacion', sheets, {
    title: 'Consolidado de operación · Incubación (modelo Power BI)',
    orgName,
    module: 'Datos · Gerencia',
    generatedBy: userName,
  })
  return built
}
