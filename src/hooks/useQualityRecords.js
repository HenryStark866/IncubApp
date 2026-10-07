/**
 * Formatos de calidad (quality_records · 06-10-2026): cargar, registrar con fotos y borrar.
 * Fotos al bucket privado machine-checks bajo {org}/calidad/…
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isMissingTable } from '../lib/missingTable'

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

/** kinds: formatos a cargar (vacío = todos) */
export function useQualityRecords(orgId, kinds = []) {
  const kindsKey = kinds.join(',')
  const [records, setRecords] = useState([])
  const [machines, setMachines] = useState([])
  const [lots, setLots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [r, plants, il, sl] = await Promise.all([
      (kindsKey
        ? supabase.from('quality_records').select('*').eq('org_id', orgId).in('kind', kindsKey.split(','))
        : supabase.from('quality_records').select('*').eq('org_id', orgId)
      )
        .gte('sampled_at', daysAgo(120))
        .order('sampled_at', { ascending: false })
        .limit(800),
      supabase.from('plants').select('id').eq('org_id', orgId),
      supabase.from('incubation_lots').select('code').eq('org_id', orgId).gte('created_at', daysAgo(90)).limit(300),
      supabase.from('setter_loads').select('lote').eq('org_id', orgId).gte('loaded_at', daysAgo(40)).limit(400),
    ])
    if (r.error) {
      if (isMissingTable(r.error)) {
        setMissing(true)
        setRecords([])
      } else setError(r.error.message)
    } else {
      setMissing(false)
      setRecords(r.data || [])
      setError(null)
    }
    const ids = (plants.data || []).map((p) => p.id)
    if (ids.length) {
      const m = await supabase.from('machines').select('id, code, name, type, status').in('plant_id', ids)
      setMachines((m.data || []).filter((x) => x.status !== 'decommissioned'))
    }
    const set = new Set()
    for (const x of il.data || []) if (x.code) set.add(String(x.code).trim())
    for (const x of sl.data || []) for (const t of String(x.lote || '').match(/\d+/g) || []) set.add(t)
    setLots([...set].sort((a, b) => b.localeCompare(a, 'es', { numeric: true })))
    setLoading(false)
  }, [orgId, kindsKey])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback(
    async (row, files = []) => {
      if (!orgId) return { error: 'Sesión inválida' }
      const paths = []
      for (const [i, f] of files.entries()) {
        const ext = (f.name?.split('.').pop() || 'jpg').toLowerCase()
        const path = `${orgId}/calidad/${Date.now()}-${i}.${ext}`
        const { error: e } = await supabase.storage.from('machine-checks').upload(path, f, { contentType: f.type || 'image/jpeg' })
        if (e) {
          if (paths.length) await supabase.storage.from('machine-checks').remove(paths)
          return { error: `No se pudo subir la foto: ${e.message}` }
        }
        paths.push(path)
      }
      const { error: e } = await supabase.from('quality_records').insert({ ...row, org_id: orgId, photo_paths: paths })
      if (e) {
        if (paths.length) await supabase.storage.from('machine-checks').remove(paths)
        return { error: isMissingTable(e) ? 'Falta actualizar el servidor (migración 20261006_formatos_calidad).' : e.message }
      }
      await load()
      return { error: null }
    },
    [orgId, load],
  )

  const remove = useCallback(
    async (id) => {
      const { error: e } = await supabase.from('quality_records').delete().eq('id', id)
      if (e) return { error: e.message }
      await load()
      return { error: null }
    },
    [load],
  )

  const photoUrl = useCallback(async (path) => {
    const { data } = await supabase.storage.from('machine-checks').createSignedUrl(path, 3600)
    return data?.signedUrl || null
  }, [])

  return { records, machines, lots, loading, error, missing, reload: load, create, remove, photoUrl }
}
