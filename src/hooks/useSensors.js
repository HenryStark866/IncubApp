/**
 * =============================================================================
 * ARCHIVO: src/hooks/useSensors.js
 * PROPÓSITO: Hook «useSensors»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Sensores de una máquina.
 *  - Lectura + Realtime (RLS: miembros de la org)
 *  - createSensor / updateSensor / deleteSensor: solo admins/owners (RLS)
 *  - ingestReading: RPC seguro (owner/admin/supervisor/operator)
 */
/** Export «useSensors»: API pública de este módulo. Henry Stark Desarrollador */
export function useSensors(machineId, orgId) {
  const [sensors, setSensors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadSensors = useCallback(async () => {
    if (!machineId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('sensors')
      .select('id, code, kind, unit, min_threshold, max_threshold, status, device_id, created_at')
      .eq('machine_id', machineId)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setSensors(data ?? [])
    setLoading(false)
  }, [machineId])

  useEffect(() => {
    if (!machineId) return
    loadSensors()

    const channel = supabase
      .channel(`sensors:${machineId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sensors', filter: `machine_id=eq.${machineId}` },
        () => loadSensors()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [machineId, loadSensors])

  const createSensor = useCallback(
    async ({ code, kind, unit, min_threshold, max_threshold, device_id }) => {
      if (!machineId || !orgId) return { error: 'Máquina no válida' }
      setError(null)
      const { error: err } = await supabase.from('sensors').insert({
        org_id: orgId,
        machine_id: machineId,
        code: code.trim(),
        kind,
        unit: unit.trim(),
        min_threshold: min_threshold === '' ? null : Number(min_threshold),
        max_threshold: max_threshold === '' ? null : Number(max_threshold),
        device_id: device_id?.trim() || null,
      })
      if (err) {
        const msg = err.code === '23505' ? 'Ya existe un sensor con ese código' : err.message
        setError(msg)
        return { error: msg }
      }
      return { error: null }
    },
    [machineId, orgId]
  )

  const updateSensor = useCallback(async (sensorId, patch) => {
    setError(null)
    setSensors((prev) => prev.map((s) => (s.id === sensorId ? { ...s, ...patch } : s)))
    const { error: err } = await supabase.from('sensors').update(patch).eq('id', sensorId)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  const deleteSensor = useCallback(async (sensorId) => {
    const { error: err } = await supabase.from('sensors').delete().eq('id', sensorId)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  const ingestReading = useCallback(async (sensorId, value) => {
    const { error: err } = await supabase.rpc('ingest_reading', {
      p_sensor_id: sensorId,
      p_value: value,
    })
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  return { sensors, loading, error, createSensor, updateSensor, deleteSensor, ingestReading, reload: loadSensors }
}
