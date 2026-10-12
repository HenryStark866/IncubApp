/**
 * =============================================================================
 * ARCHIVO: src/hooks/useBroilerProjection.js
 * PROPÓSITO: Trae cargues, transferencias, nacimientos, mapas de cargue y lotes de la
 *   empresa y arma la proyección broiler (lib/broilerProjection). Se actualiza sola
 *   cuando alguien registra un cargue, una transferencia o un nacimiento, y cada
 *   5 minutos con la pantalla visible. 12-10-2026.
 * =============================================================================
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { queryRows, loadWarning } from '../lib/queryRows'
import { uniqueChannel } from '../lib/realtimeChannel'
import { projectBroiler, RATE_WINDOW_DAYS } from '../lib/broilerProjection'

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString()

async function loadMaps(orgId) {
  const build = (cols) => (q) =>
    q.select(cols).eq('org_id', orgId).gte('created_at', daysAgo(30)).order('created_at', { ascending: false }).limit(80)
  const res = await queryRows('load_maps', build('id, machine_id, status, payload, approved_at, ordered_at, created_at'))
  // Instalaciones sin machine_id en el mapa: se proyecta con las posturas del lote
  if (res.error && /machine_id/.test(res.error)) return { data: [] }
  return res
}

export function useBroilerProjection(orgId) {
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const timer = useRef(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [loads, transfers, hatches, maps, lots, plants] = await Promise.all([
      queryRows('setter_loads', (q) =>
        q.select('id, machine_id, lote, loaded_at, cycle_start_at, created_at').eq('org_id', orgId).gte('loaded_at', daysAgo(26)).limit(400),
      ),
      queryRows('transfers', (q) => q.select('*').eq('org_id', orgId).gte('created_at', daysAgo(26)).limit(400)),
      queryRows('hatch_events', (q) =>
        q
          .select('id, transfer_id, lote, status, incubable_eggs, estimated_chicks, actual_chicks, scheduled_at, started_at, ended_at, created_at')
          .eq('org_id', orgId)
          .gte('created_at', daysAgo(RATE_WINDOW_DAYS + 5))
          .limit(600),
      ),
      loadMaps(orgId),
      queryRows('incubation_lots', (q) => q.select('id, code, postures').eq('org_id', orgId).gte('updated_at', daysAgo(60)).limit(400)),
      queryRows('plants', (q) => q.select('id').eq('org_id', orgId)),
    ])
    const plantIds = plants.data.map((p) => p.id)
    const machines = plantIds.length
      ? await queryRows('machines', (q) => q.select('id, code, name').in('plant_id', plantIds))
      : { data: [] }
    setRaw({
      loads: loads.data,
      transfers: transfers.data,
      hatches: hatches.data,
      maps: maps.data,
      lots: lots.data,
      machines: machines.data,
    })
    setWarning(loadWarning([loads, transfers, hatches, maps, lots, plants, machines].map((r) => r.error).filter(Boolean), { source: 'proyección broiler' }))
    setUpdatedAt(new Date())
    setLoading(false)
  }, [orgId])

  // Varios cambios seguidos (un cargue con su foto…) disparan una sola recarga
  const reloadSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 1200)
  }, [load])

  useEffect(() => {
    if (!orgId) return undefined
    load()
    const channel = supabase.channel(uniqueChannel(`broiler:${orgId}`))
    for (const table of ['setter_loads', 'transfers', 'hatch_events', 'load_maps']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, reloadSoon)
    }
    channel.subscribe()
    const every = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 5 * 60_000)
    return () => {
      clearInterval(every)
      clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [orgId, load, reloadSoon])

  const projection = useMemo(() => (raw ? projectBroiler(raw) : null), [raw])
  return { projection, loading, warning, updatedAt, reload: load }
}
