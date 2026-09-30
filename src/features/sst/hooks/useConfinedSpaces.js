/**
 * Datos de espacios confinados: inventario, permisos de entrada, mediciones y entradas.
 * Las reglas duras (quién autoriza, límites de gases, nadie adentro al cerrar) las aplica
 * la base; aquí se devuelven sus mensajes tal cual. Se refresca en vivo (Realtime) para
 * que el vigía, el supervisor y el mapa 3D vean lo mismo.
 * Henry Stark Desarrollador · 30-09-2026
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { isMissingTable } from '../../../lib/missingTable'
import { OPEN_STATUSES } from '../lib/confinedSpaces'

const clean = (v) => (typeof v === 'string' ? v.trim() || null : (v ?? null))
const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))
const errOf = (e) => (e ? e.message || String(e) : null)

export function useConfinedSpaces({ orgId }) {
  const [state, setState] = useState({ spaces: [], permits: [], readings: [], entries: [] })
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState(null)
  const busy = useRef(false)

  const load = useCallback(async () => {
    if (!orgId || busy.current) return
    busy.current = true
    setLoading(true)
    const since = new Date(Date.now() - 365 * 86400000).toISOString()
    const [spaces, permits] = await Promise.all([
      supabase.from('sst_confined_spaces').select('*').eq('org_id', orgId).order('code'),
      supabase
        .from('sst_confined_permits')
        .select('*')
        .eq('org_id', orgId)
        .or(`status.in.(${OPEN_STATUSES.join(',')}),created_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(400),
    ])
    const miss = isMissingTable(spaces.error) || isMissingTable(permits.error)
    setMissing(miss)
    if (miss) {
      setLoading(false)
      busy.current = false
      return
    }
    const ids = (permits.data || []).map((p) => p.id)
    const [readings, entries] = ids.length
      ? await Promise.all([
          supabase
            .from('sst_confined_readings')
            .select('*')
            .in('permit_id', ids)
            .order('taken_at', { ascending: false })
            .limit(3000),
          supabase
            .from('sst_confined_entries')
            .select('*')
            .in('permit_id', ids)
            .order('entered_at', { ascending: false })
            .limit(3000),
        ])
      : [{ data: [] }, { data: [] }]
    setState({
      spaces: spaces.data || [],
      permits: permits.data || [],
      readings: readings.data || [],
      entries: entries.data || [],
    })
    setError(errOf(spaces.error) || errOf(permits.error) || errOf(readings.error) || errOf(entries.error))
    setLoading(false)
    busy.current = false
  }, [orgId])

  useEffect(() => {
    load()
    if (!orgId) return undefined
    const ch = supabase
      .channel(`confinados:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sst_confined_permits', filter: `org_id=eq.${orgId}` },
        load,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sst_confined_entries', filter: `org_id=eq.${orgId}` },
        load,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [load, orgId])

  const run = useCallback(
    async (q) => {
      const { error: err } = await q
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [load],
  )

  const createPermit = useCallback(
    (f) => {
      const entrants = String(f.entrants || '')
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (!f.space_id) return { error: 'Elija el espacio' }
      if (!clean(f.work_description)) return { error: 'Describa el trabajo' }
      if (!clean(f.supervisor_name) || !clean(f.attendant_name))
        return { error: 'Indique supervisor de entrada y vigía' }
      if (!entrants.length) return { error: 'Indique al menos un entrante' }
      if (entrants.some((e) => e.toLowerCase() === String(f.attendant_name).trim().toLowerCase()))
        return { error: 'El vigía no puede ser entrante: se queda afuera todo el tiempo' }
      const from = f.valid_from ? new Date(f.valid_from) : new Date()
      const hours = Math.min(12, Math.max(1, Number(f.hours) || 4))
      return run(
        supabase.from('sst_confined_permits').insert({
          org_id: orgId,
          space_id: f.space_id,
          work_description: clean(f.work_description),
          work_type: f.work_type || 'other',
          valid_from: from.toISOString(),
          valid_until: new Date(from.getTime() + hours * 3600000).toISOString(),
          supervisor_name: clean(f.supervisor_name),
          attendant_name: clean(f.attendant_name),
          entrants,
          rescue_plan: clean(f.rescue_plan),
          communication: clean(f.communication),
          ventilation: clean(f.ventilation),
          checklist: {},
          status: 'draft',
        }),
      )
    },
    [orgId, run],
  )

  const setChecklist = useCallback(
    (permit, key, value) =>
      run(
        supabase
          .from('sst_confined_permits')
          .update({ checklist: { ...(permit.checklist || {}), [key]: value } })
          .eq('id', permit.id),
      ),
    [run],
  )

  const addReading = useCallback(
    (permitId, f) => {
      const o2 = num(f.o2_pct)
      const lel = num(f.lel_pct)
      if (o2 == null || Number.isNaN(o2) || lel == null || Number.isNaN(lel))
        return { error: 'Registre al menos oxígeno y LIE' }
      return run(
        supabase.from('sst_confined_readings').insert({
          org_id: orgId,
          permit_id: permitId,
          o2_pct: o2,
          lel_pct: lel,
          co_ppm: num(f.co_ppm),
          h2s_ppm: num(f.h2s_ppm),
          hcho_ppm: num(f.hcho_ppm),
          instrument: clean(f.instrument),
          taken_by_name: clean(f.taken_by_name),
        }),
      )
    },
    [orgId, run],
  )

  const setStatus = useCallback(
    (permitId, status, extra = {}) =>
      run(
        supabase
          .from('sst_confined_permits')
          .update({ status, ...extra })
          .eq('id', permitId),
      ),
    [run],
  )

  const enter = useCallback(
    (permitId, personName) =>
      run(
        supabase.from('sst_confined_entries').insert({ org_id: orgId, permit_id: permitId, person_name: personName }),
      ),
    [orgId, run],
  )

  const exit = useCallback(
    (entryId) =>
      run(supabase.from('sst_confined_entries').update({ exited_at: new Date().toISOString() }).eq('id', entryId)),
    [run],
  )

  const updateSpace = useCallback(
    (id, patch) => run(supabase.from('sst_confined_spaces').update(patch).eq('id', id)),
    [run],
  )

  return {
    ...state,
    loading,
    missing,
    error,
    reload: load,
    createPermit,
    setChecklist,
    addReading,
    authorize: (id) => setStatus(id, 'authorized'),
    suspend: (id, reason) =>
      setStatus(id, 'suspended', { suspended_reason: clean(reason) || 'Suspendido por el equipo' }),
    close: (id, notes) => setStatus(id, 'closed', { closing_notes: clean(notes) }),
    cancel: (id, notes) => setStatus(id, 'cancelled', { closing_notes: clean(notes) }),
    enter,
    exit,
    updateSpace,
  }
}
