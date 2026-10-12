/**
 * Flujo de producción en vivo (lib/productionFlow): trae lo que registra cada etapa —
 * recepción, cuarto frío, clasificación, mapas, cargues, calibraciones, transferencias y
 * nacimientos— y arma qué toca hoy. Se actualiza solo con cada registro y cada 3 minutos
 * con la pantalla visible. Las tablas que falten en el servidor no rompen nada. 12-10-2026.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { queryRows, loadWarning } from '../lib/queryRows'
import { uniqueChannel } from '../lib/realtimeChannel'
import { isMissingTable } from '../lib/missingTable'
import { buildProductionFlow } from '../lib/productionFlow'

const ago = (d) => new Date(Date.now() - d * 86_400_000).toISOString()
const ahead = (d) => new Date(Date.now() + d * 86_400_000).toISOString()

async function optional(table, build) {
  const r = await queryRows(table, build)
  if (r.error && isMissingTable({ message: r.error.replace(/^[a-z_]+: /, '') })) return { data: [] }
  return r
}

const TABLES = ['setter_loads', 'transfers', 'hatch_events', 'load_maps', 'egg_tape_classifications', 'lot_arrivals', 'reception_remisions', 'cold_room_stock', 'quality_records', 'work_orders']

export function useProductionFlow(orgId) {
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const timer = useRef(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const plants = await queryRows('plants', (q) => q.select('id').eq('org_id', orgId))
    const ids = plants.data.map((p) => p.id)
    const [machines, loads, transfers, hatches, maps, carts, arrivals, remisions, stock, quality, calib, botChecks] = await Promise.all([
      ids.length ? queryRows('machines', (q) => q.select('id, plant_id, room_id, code, name, type, status').in('plant_id', ids)) : { data: [] },
      queryRows('setter_loads', (q) => q.select('id, machine_id, lote, loaded_at, cycle_start_at, created_at').eq('org_id', orgId).gte('loaded_at', ago(60)).limit(1500)),
      queryRows('transfers', (q) => q.select('id, lote, mode, room_ids, hatcher_ids, transferred_at, cycle_start_at, source_machine_id').eq('org_id', orgId).gte('transferred_at', ago(60)).limit(600)),
      queryRows('hatch_events', (q) =>
        q.select('*').eq('org_id', orgId).or(`scheduled_at.gte.${ago(15)},started_at.gte.${ago(15)},created_at.gte.${ago(15)}`).lte('started_at', ahead(30)).limit(300),
      ),
      queryRows('load_maps', (q) => q.select('id, machine_id, machine_name, status, created_at, approved_at, ordered_at').eq('org_id', orgId).in('status', ['pending_approval', 'approved', 'ordered']).limit(60)),
      optional('egg_tape_classifications', (q) => q.select('id, status, lot, eggs, classified_at').eq('org_id', orgId).in('status', ['available', 'reserved']).limit(1500)),
      optional('lot_arrivals', (q) => q.select('id, lot_code, arrived_at, seal_number, received_by').eq('org_id', orgId).gte('arrived_at', ago(3)).limit(100)),
      optional('reception_remisions', (q) => q.select('*').eq('org_id', orgId).gte('created_at', ago(3)).limit(100)),
      optional('cold_room_stock', (q) => q.select('id, stock_date, counts').eq('org_id', orgId).gte('stock_date', ago(7).slice(0, 10)).limit(300)),
      optional('quality_records', (q) => q.select('id, kind, lote, sampled_at, results').eq('org_id', orgId).in('kind', ['chick_quality', 'sexing_count']).gte('sampled_at', ago(15)).limit(300)),
      queryRows('work_orders', (q) => q.select('id, machine_id, status, created_at, completed_at').eq('org_id', orgId).eq('source', 'calibration').gte('created_at', ago(25)).limit(600)),
      // Rondas del bot de EagleTrax de las últimas horas
      queryRows('machine_checks', (q) =>
        q.select('machine_id, taken_at, notes').eq('org_id', orgId).like('notes', '[bot-eagletrax]%').gte('taken_at', new Date(Date.now() - 12 * 3_600_000).toISOString()).order('taken_at', { ascending: false }).limit(200),
      ),
    ])
    setRaw({
      machines: machines.data.filter((m) => m.status !== 'decommissioned'),
      loads: loads.data,
      transfers: transfers.data,
      hatches: hatches.data,
      maps: maps.data,
      carts: carts.data,
      arrivals: arrivals.data,
      remisions: remisions.data,
      stock: stock.data,
      quality: quality.data,
      calibOrders: calib.data,
      botChecks: botChecks.data,
    })
    setWarning(loadWarning([plants, machines, loads, transfers, hatches, maps, calib].map((r) => r.error).filter(Boolean), { source: 'flujo de producción' }))
    setUpdatedAt(new Date())
    setLoading(false)
  }, [orgId])

  const reloadSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 1500)
  }, [load])

  useEffect(() => {
    if (!orgId) return undefined
    load()
    const ch = supabase.channel(uniqueChannel(`flujo:${orgId}`))
    for (const table of TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, reloadSoon)
    ch.subscribe()
    const every = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 180_000)
    return () => {
      clearInterval(every)
      clearTimeout(timer.current)
      supabase.removeChannel(ch)
    }
  }, [orgId, load, reloadSoon])

  const flow = useMemo(() => (raw ? buildProductionFlow(raw) : null), [raw])
  return { flow, loading, warning, updatedAt, reload: load }
}
