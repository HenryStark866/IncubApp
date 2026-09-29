/**
 * Datos del módulo Ambiental: residuos (entregas y retiros programados), lecturas de
 * medidores de agua, energía y gas, y obligaciones con vencimiento. Si el servidor aún
 * no tiene las tablas, `missing` queda en true y la pantalla lo dice sin romperse.
 * Henry Stark Desarrollador
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { uploadOrgFiles } from '../../../lib/orgFiles'
import { isMissingTable } from '../../../lib/missingTable'

const clean = (v) => (typeof v === 'string' ? v.trim() || null : (v ?? null))
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MISSING = 'Falta actualizar la base de datos del servidor.'

export function useEnvRecords({ orgId, userId }) {
  const [waste, setWaste] = useState([])
  const [readings, setReadings] = useState([])
  const [obligations, setObligations] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const since = ymd(new Date(Date.now() - 120 * 86400000))
    const [w, r, o, plants] = await Promise.all([
      supabase
        .from('env_waste')
        .select('*')
        .eq('org_id', orgId)
        .or(`status.eq.scheduled,recorded_on.gte.${since}`)
        .order('recorded_on', { ascending: false })
        .limit(500),
      supabase
        .from('env_meter_readings')
        .select('*')
        .eq('org_id', orgId)
        .gte('read_on', since)
        .order('read_on', { ascending: false })
        .limit(1000),
      supabase.from('env_obligations').select('*').eq('org_id', orgId).order('due_on').limit(300),
      supabase.from('plants').select('name').eq('org_id', orgId).order('name').limit(100),
    ])
    const miss = [w, r, o].some((x) => isMissingTable(x.error))
    setMissing(miss)
    setWaste(w.data || [])
    setReadings(r.data || [])
    setObligations(o.data || [])
    setSites([...new Set((plants.data || []).map((p) => p.name).filter(Boolean))])
    setError(miss ? null : w.error?.message || r.error?.message || o.error?.message || null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  /** Entrega de residuos al gestor, o retiro programado (status «scheduled»). */
  const addWaste = useCallback(
    async (f, files = []) => {
      if (!orgId) return { error: 'Sesión inválida' }
      const scheduled = f.status === 'scheduled'
      const kg = Number(String(f.kg ?? '').replace(',', '.'))
      if (!scheduled && !(kg > 0)) return { error: 'Indique los kilos entregados' }
      const up = await uploadOrgFiles({ orgId, folder: 'ambiental-residuos', files })
      if (up.error) return { error: up.error }
      const { data, error: err } = await supabase
        .from('env_waste')
        .insert({
          org_id: orgId,
          recorded_on: f.recorded_on || ymd(new Date()),
          kind: f.kind,
          kg: Number.isFinite(kg) && kg > 0 ? kg : 0,
          manager: clean(f.manager),
          recovered: Boolean(f.recovered),
          status: scheduled ? 'scheduled' : 'delivered',
          certificate_path: up.paths[0] || null,
          notes: clean(f.notes),
          created_by: userId,
        })
        .select()
        .single()
      if (err) {
        if (up.paths.length) await supabase.storage.from('machine-checks').remove(up.paths)
        return { error: isMissingTable(err) ? MISSING : err.message }
      }
      setWaste((l) => [data, ...l])
      return { error: null }
    },
    [orgId, userId],
  )

  /** Confirma que el retiro programado salió: kilos reales, aprovechado y acta. */
  const confirmPickup = useCallback(
    async (id, f, files = []) => {
      const kg = Number(String(f.kg ?? '').replace(',', '.'))
      if (!(kg > 0)) return { error: 'Indique los kilos entregados' }
      const up = await uploadOrgFiles({ orgId, folder: 'ambiental-residuos', files })
      if (up.error) return { error: up.error }
      const patch = {
        kg,
        recovered: Boolean(f.recovered),
        status: 'delivered',
        recorded_on: f.recorded_on || undefined,
      }
      if (up.paths[0]) patch.certificate_path = up.paths[0]
      if (!patch.recorded_on) delete patch.recorded_on
      const { data, error: err } = await supabase.from('env_waste').update(patch).eq('id', id).select().single()
      if (err) return { error: err.message }
      setWaste((l) => l.map((x) => (x.id === id ? data : x)))
      return { error: null }
    },
    [orgId],
  )

  /** Lectura de un medidor (la pantalla avisa antes si es menor que la anterior). */
  const addReading = useCallback(
    async (f) => {
      if (!orgId) return { error: 'Sesión inválida' }
      const reading = Number(String(f.reading ?? '').replace(',', '.'))
      if (!Number.isFinite(reading) || reading < 0) return { error: 'Escriba la lectura del medidor' }
      const { data, error: err } = await supabase
        .from('env_meter_readings')
        .insert({
          org_id: orgId,
          read_on: f.read_on || ymd(new Date()),
          meter: f.meter,
          site: clean(f.site),
          reading,
          unit: clean(f.unit) || 'm³',
          notes: clean(f.notes),
          created_by: userId,
        })
        .select()
        .single()
      if (err) return { error: isMissingTable(err) ? MISSING : err.message }
      setReadings((l) => [data, ...l])
      return { error: null }
    },
    [orgId, userId],
  )

  const addObligation = useCallback(
    async (f, files = []) => {
      if (!orgId) return { error: 'Sesión inválida' }
      if (!clean(f.name)) return { error: 'Escriba el nombre de la obligación' }
      if (!f.due_on) return { error: 'Indique la fecha de vencimiento' }
      const up = await uploadOrgFiles({ orgId, folder: 'ambiental-obligaciones', files })
      if (up.error) return { error: up.error }
      const { data, error: err } = await supabase
        .from('env_obligations')
        .insert({
          org_id: orgId,
          name: clean(f.name),
          due_on: f.due_on,
          status: f.status || 'pending',
          file_path: up.paths[0] || null,
          notes: clean(f.notes),
          done_at: f.status === 'done' ? new Date().toISOString() : null,
          created_by: userId,
        })
        .select()
        .single()
      if (err) {
        if (up.paths.length) await supabase.storage.from('machine-checks').remove(up.paths)
        return { error: isMissingTable(err) ? MISSING : err.message }
      }
      setObligations((l) => [...l, data].sort((a, b) => String(a.due_on).localeCompare(String(b.due_on))))
      return { error: null }
    },
    [orgId, userId],
  )

  /** Cambia el estado de una obligación y, si trae archivo, lo adjunta (radicado, informe). */
  const updateObligation = useCallback(
    async (id, patch, files = []) => {
      const up = await uploadOrgFiles({ orgId, folder: 'ambiental-obligaciones', files })
      if (up.error) return { error: up.error }
      const row = { ...patch }
      if (up.paths[0]) row.file_path = up.paths[0]
      if (row.status) row.done_at = row.status === 'done' ? new Date().toISOString() : null
      const { data, error: err } = await supabase.from('env_obligations').update(row).eq('id', id).select().single()
      if (err) return { error: err.message }
      setObligations((l) => l.map((x) => (x.id === id ? data : x)))
      return { error: null }
    },
    [orgId],
  )

  return {
    waste,
    readings,
    obligations,
    sites,
    loading,
    missing,
    error,
    reload: load,
    addWaste,
    confirmPickup,
    addReading,
    addObligation,
    updateObligation,
  }
}
