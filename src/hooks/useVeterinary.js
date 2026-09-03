/**
 * =============================================================================
 * ARCHIVO: src/hooks/useVeterinary.js
 * PROPÓSITO: Hook «useVeterinary»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isMissingOpsTable } from '../lib/opsLocalStore'

const KEY_V = 'incubapp_vet_records_v1'

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY_V) || '[]')
  } catch {
    return []
  }
}
function writeLocal(rows) {
  localStorage.setItem(KEY_V, JSON.stringify(rows))
}
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `vet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Export «VET_KINDS»: API pública de este módulo. Henry Stark Desarrollador */
export const VET_KINDS = [
  { value: 'vaccination', label: 'Vacunación' },
  { value: 'medicine', label: 'Medicina / tratamiento' },
  { value: 'fertility', label: 'Prueba de fertilidad' },
  { value: 'wet_tunnel_lab', label: 'Lab. wet tunnel / ambiente' },
  { value: 'other_lab', label: 'Otra muestra de laboratorio' },
]

/** Export «kindLabel»: API pública de este módulo. Henry Stark Desarrollador */
export const kindLabel = (k) => VET_KINDS.find((x) => x.value === k)?.label || k

/**
 * Registros de sanidad: vacunas, medicina, fertilidad, wet tunnels.
 */
/** Export «useVeterinary»: API pública de este módulo. Henry Stark Desarrollador */
export function useVeterinary(orgId, userId) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)
  const [kind, setKind] = useState('all')

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('veterinary_records')
      .select(
        'id, org_id, kind, title, site, batch_or_lote, sample_point, result, result_status, product_name, dose, units, recorded_at, notes, created_by, created_at'
      )
      .eq('org_id', orgId)
      .order('recorded_at', { ascending: false })
      .limit(500)

    if (err) {
      if (isMissingOpsTable(err.message) || /column|schema cache/i.test(err.message)) {
        setLocalMode(true)
        setRecords(readLocal().filter((r) => r.org_id === orgId))
        setError(null)
      } else {
        setError(err.message)
        setRecords([])
      }
    } else {
      setLocalMode(false)
      setRecords(data ?? [])
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (kind === 'all') return records
    return records.filter((r) => r.kind === kind)
  }, [records, kind])

  const save = useCallback(
    async (payload, id = null) => {
      if (!orgId) return { error: 'Sin organización' }
      if (!payload.title?.trim()) return { error: 'Indique un título o descripción' }
      if (!payload.kind) return { error: 'Seleccione el tipo de registro' }

      const row = {
        org_id: orgId,
        kind: payload.kind,
        title: payload.title.trim(),
        site: payload.site?.trim() || null,
        batch_or_lote: payload.batch_or_lote?.trim() || null,
        sample_point: payload.sample_point?.trim() || null,
        result: payload.result?.trim() || null,
        result_status: payload.result_status || null,
        product_name: payload.product_name?.trim() || null,
        dose: payload.dose === '' || payload.dose == null ? null : Number(payload.dose),
        units: payload.units?.trim() || null,
        recorded_at: payload.recorded_at || new Date().toISOString(),
        notes: payload.notes?.trim() || null,
        created_by: userId || null,
        updated_at: new Date().toISOString(),
      }

      if (localMode) {
        const all = readLocal()
        if (id) {
          const i = all.findIndex((r) => r.id === id)
          if (i >= 0) all[i] = { ...all[i], ...row, id }
        } else {
          all.unshift({
            id: uid(),
            created_at: new Date().toISOString(),
            ...row,
          })
        }
        writeLocal(all)
        await load()
        return { error: null, local: true }
      }

      if (id) {
        const { error: err } = await supabase.from('veterinary_records').update(row).eq('id', id)
        if (err) {
          if (isMissingOpsTable(err.message)) {
            setLocalMode(true)
            return save(payload, id)
          }
          return { error: err.message }
        }
      } else {
        const { error: err } = await supabase.from('veterinary_records').insert(row)
        if (err) {
          if (isMissingOpsTable(err.message)) {
            setLocalMode(true)
            return save(payload, null)
          }
          return { error: err.message }
        }
      }
      await load()
      return { error: null }
    },
    [orgId, userId, localMode, load]
  )

  const remove = useCallback(
    async (id) => {
      if (localMode) {
        writeLocal(readLocal().filter((r) => r.id !== id))
        await load()
        return { error: null }
      }
      const { error: err } = await supabase.from('veterinary_records').delete().eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [localMode, load]
  )

  const stats = useMemo(() => {
    const by = (k) => records.filter((r) => r.kind === k).length
    return {
      vaccination: by('vaccination'),
      medicine: by('medicine'),
      fertility: by('fertility'),
      wet_tunnel_lab: by('wet_tunnel_lab'),
      other_lab: by('other_lab'),
      alert: records.filter((r) => r.result_status === 'alert' || r.result_status === 'fail').length,
    }
  }, [records])

  return {
    records,
    filtered,
    loading,
    error,
    localMode,
    kind,
    setKind,
    stats,
    save,
    remove,
    reload: load,
  }
}
