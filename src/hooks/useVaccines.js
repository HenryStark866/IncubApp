/**
 * Inventario y consumo de vacunas (auxiliar de vacunación · 07-10-2026).
 * Carga el catálogo (vaccine_products), los movimientos de los últimos 400 días
 * (vaccine_movements), lo que el auxiliar tiene para hoy (formatos, nacimientos y tareas)
 * y se actualiza en vivo.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isMissingTable } from '../lib/missingTable'

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

export function useVaccines(orgId, userId) {
  const [products, setProducts] = useState([])
  const [movements, setMovements] = useState([])
  const [today, setToday] = useState({ formats: [], hatches: [], tasks: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [p, m, f, h, t] = await Promise.all([
      supabase.from('vaccine_products').select('*').eq('org_id', orgId).order('name'),
      supabase.from('vaccine_movements').select('*').eq('org_id', orgId).gte('moved_at', daysAgo(400)).order('moved_at', { ascending: false }).limit(3000),
      supabase
        .from('quality_records')
        .select('id, kind, sampled_at, lote, status, results')
        .eq('org_id', orgId)
        .in('kind', ['nitrogen_fridge', 'sexing_count', 'navel_quality'])
        .gte('sampled_at', daysAgo(7)),
      supabase
        .from('hatch_events')
        .select('*')
        .eq('org_id', orgId)
        .or(`scheduled_at.gte.${daysAgo(5)},started_at.gte.${daysAgo(5)},created_at.gte.${daysAgo(5)}`)
        .limit(100),
      userId
        ? supabase
            .from('shift_activities')
            .select('id, title, description, status, created_at, started_at, completed_at')
            .eq('org_id', orgId)
            .eq('assigned_to', userId)
            .gte('created_at', daysAgo(7))
            .order('created_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),
    ])
    if (p.error || m.error) {
      const e = p.error || m.error
      if (isMissingTable(e)) {
        setMissing(true)
        setProducts([])
        setMovements([])
      } else setError(e.message)
    } else {
      setMissing(false)
      setError(null)
      setProducts(p.data || [])
      setMovements(m.data || [])
    }
    setToday({ formats: f.data || [], hatches: h.data || [], tasks: t.data || [] })
    setLoading(false)
  }, [orgId, userId])

  useEffect(() => {
    load()
    if (!orgId) return undefined
    let espera = null
    const canal = supabase.channel(`vacunas-${orgId}-${Math.random().toString(36).slice(2, 7)}`)
    for (const table of ['vaccine_products', 'vaccine_movements', 'quality_records']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, () => {
        clearTimeout(espera)
        espera = setTimeout(() => load(), 1200)
      })
    }
    canal.subscribe()
    return () => {
      clearTimeout(espera)
      supabase.removeChannel(canal)
    }
  }, [load, orgId])

  const falta = (e) => (isMissingTable(e) ? 'Falta actualizar el servidor (migración 20261007_vacunacion).' : e.message)

  const saveProduct = useCallback(
    async (row, id = null) => {
      const q = id
        ? supabase.from('vaccine_products').update(row).eq('id', id).select('id')
        : supabase.from('vaccine_products').insert({ ...row, org_id: orgId }).select('id')
      const { data, error: e } = await q
      if (e) return { error: falta(e) }
      if (id && !data?.length) return { error: 'No tiene permiso para cambiar esta vacuna.' }
      await load()
      return { error: null }
    },
    [orgId, load],
  )

  const addMovement = useCallback(
    async (row) => {
      const { error: e } = await supabase.from('vaccine_movements').insert({ ...row, org_id: orgId })
      if (e) return { error: falta(e) }
      await load()
      return { error: null }
    },
    [orgId, load],
  )

  const removeMovement = useCallback(
    async (id) => {
      const { data, error: e } = await supabase.from('vaccine_movements').delete().eq('id', id).select('id')
      if (e) return { error: e.message }
      if (!data?.length) return { error: 'Solo quien lo registró o un líder puede borrarlo.' }
      await load()
      return { error: null }
    },
    [load],
  )

  return { products, movements, today, loading, error, missing, reload: load, saveProduct, addMovement, removeMovement }
}
