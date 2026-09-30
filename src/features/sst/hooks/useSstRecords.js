/**
 * Datos del módulo SST: incidentes (cualquier empleado reporta) e inspecciones
 * (el auxiliar de SST programa y registra). Si el servidor aún no tiene las tablas,
 * `missing` queda en true y la pantalla lo dice sin romperse.
 * Henry Stark Desarrollador
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { uploadOrgFiles } from '../../../lib/orgFiles'
import { isMissingTable } from '../../../lib/missingTable'

const clean = (v) => (typeof v === 'string' ? v.trim() || null : (v ?? null))

export function useSstRecords({ orgId, userId }) {
  const [incidents, setIncidents] = useState([])
  const [inspections, setInspections] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const since = new Date(Date.now() - 180 * 86400000).toISOString()
    const [inc, insp, plants] = await Promise.all([
      supabase
        .from('sst_incidents')
        .select('*')
        .eq('org_id', orgId)
        .or(`status.neq.closed,occurred_at.gte.${since}`)
        .order('occurred_at', { ascending: false })
        .limit(300),
      supabase
        .from('sst_inspections')
        .select('*')
        .eq('org_id', orgId)
        .or(`done_at.is.null,created_at.gte.${since}`)
        .order('scheduled_for', { ascending: false, nullsFirst: false })
        .limit(300),
      supabase.from('plants').select('name').eq('org_id', orgId).order('name').limit(100),
    ])
    const miss = isMissingTable(inc.error) || isMissingTable(insp.error)
    setMissing(miss)
    setIncidents(inc.data || [])
    setInspections(insp.data || [])
    setSites([...new Set((plants.data || []).map((p) => p.name).filter(Boolean))])
    setError(miss ? null : inc.error?.message || insp.error?.message || null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  /** Cualquier empleado: reporta un accidente, incidente, casi accidente o condición insegura. */
  const reportIncident = useCallback(
    async (f, photos = []) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!clean(f.description)) return { error: 'Describa qué pasó' }
      const up = await uploadOrgFiles({ orgId, folder: 'sst-incidentes', files: photos })
      if (up.error) return { error: up.error }
      const row = {
        org_id: orgId,
        occurred_at: f.occurred_at ? new Date(f.occurred_at).toISOString() : new Date().toISOString(),
        site: clean(f.site),
        area: clean(f.area),
        kind: f.kind || 'incident',
        affected_person: clean(f.affected_person),
        description: clean(f.description),
        severity: f.severity || 'low',
        has_disability: Boolean(f.has_disability),
        disability_days: f.has_disability && f.disability_days !== '' ? Number(f.disability_days) || 0 : null,
        photo_paths: up.paths,
        status: 'reported',
        reported_by: userId,
      }
      const { data, error: err } = await supabase.from('sst_incidents').insert(row).select().single()
      if (err) {
        if (up.paths.length) await supabase.storage.from('machine-checks').remove(up.paths)
        return { error: isMissingTable(err) ? 'Falta actualizar la base de datos del servidor.' : err.message }
      }
      setIncidents((l) => [data, ...l])
      return { error: null }
    },
    [orgId, userId],
  )

  /** Líder SST: estado, acción correctiva, responsable y fecha límite. */
  const updateIncident = useCallback(async (id, patch) => {
    const row = { ...patch }
    for (const k of ['corrective_action', 'action_owner']) if (k in row) row[k] = clean(row[k])
    if ('action_due' in row) row.action_due = row.action_due || null
    if (row.status === 'closed') row.closed_at = new Date().toISOString()
    if (row.status && row.status !== 'closed') row.closed_at = null
    const { data, error: err } = await supabase.from('sst_incidents').update(row).eq('id', id).select().single()
    if (err) return { error: err.message }
    setIncidents((l) => l.map((x) => (x.id === id ? data : x)))
    return { error: null }
  }, [])

  /** Auxiliar SST: programa una inspección para una fecha. */
  const scheduleInspection = useCallback(
    async (f) => {
      if (!orgId) return { error: 'Sesión inválida' }
      if (!f.scheduled_for) return { error: 'Indique para qué fecha se programa' }
      const { data, error: err } = await supabase
        .from('sst_inspections')
        .insert({
          org_id: orgId,
          kind: f.kind || 'other',
          kind_other: f.kind === 'other' ? clean(f.kind_other) : null,
          site: clean(f.site),
          scheduled_for: f.scheduled_for,
          responsible_name: clean(f.responsible_name),
          created_by: userId,
        })
        .select()
        .single()
      if (err) return { error: isMissingTable(err) ? 'Falta actualizar la base de datos del servidor.' : err.message }
      setInspections((l) => [data, ...l])
      return { error: null }
    },
    [orgId, userId],
  )

  /**
   * Auxiliar SST: registra una inspección hecha. Si viene `id` completa la programada;
   * si no, crea una nueva ya hecha.
   */
  const recordInspection = useCallback(
    async (f, photos = []) => {
      if (!orgId) return { error: 'Sesión inválida' }
      if (!f.result) return { error: 'Indique el resultado' }
      if (f.result === 'findings' && !clean(f.findings)) return { error: 'Describa los hallazgos' }
      const up = await uploadOrgFiles({ orgId, folder: 'sst-inspecciones', files: photos })
      if (up.error) return { error: up.error }
      const prev = f.id ? inspections.find((x) => x.id === f.id) : null
      const row = {
        kind: f.kind || prev?.kind || 'other',
        kind_other: (f.kind || prev?.kind) === 'other' ? clean(f.kind_other) || prev?.kind_other || null : null,
        site: clean(f.site) || prev?.site || null,
        done_at: f.done_at ? new Date(f.done_at).toISOString() : new Date().toISOString(),
        responsible_name: clean(f.responsible_name) || prev?.responsible_name || null,
        result: f.result,
        findings: clean(f.findings),
        photo_paths: [...(prev?.photo_paths || []), ...up.paths],
      }
      const q = prev
        ? supabase.from('sst_inspections').update(row).eq('id', prev.id)
        : supabase.from('sst_inspections').insert({ ...row, org_id: orgId, created_by: userId })
      const { data, error: err } = await q.select().single()
      if (err) {
        if (up.paths.length) await supabase.storage.from('machine-checks').remove(up.paths)
        return { error: isMissingTable(err) ? 'Falta actualizar la base de datos del servidor.' : err.message }
      }
      setInspections((l) => (prev ? l.map((x) => (x.id === prev.id ? data : x)) : [data, ...l]))
      return { error: null }
    },
    [orgId, userId, inspections],
  )

  return {
    incidents,
    inspections,
    sites,
    loading,
    missing,
    error,
    reload: load,
    reportIncident,
    updateIncident,
    scheduleInspection,
    recordInspection,
  }
}
