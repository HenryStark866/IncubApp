/**
 * =============================================================================
 * ARCHIVO: src/hooks/useLatestReadings.js
 * PROPÓSITO: Hook «useLatestReadings»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const INITIAL_WINDOW = 300 // lecturas recientes a revisar al cargar

/**
 * Última lectura por sensor de la organización, actualizada en vivo.
 * Un solo canal Realtime por org (RLS garantiza que solo llegan lecturas propias).
 * Devuelve: { [sensor_id]: { value, recorded_at } }
 *
 * Usar UNA sola vez por vista (ej. en MachineManager) y pasar el mapa hacia abajo,
 * para no duplicar canales con el mismo nombre.
 */
/** Export «useLatestReadings»: API pública de este módulo. Henry Stark Desarrollador */
export function useLatestReadings(orgId) {
  const [latest, setLatest] = useState({})

  useEffect(() => {
    if (!orgId) return
    let cancelled = false

    // Carga inicial: recorre las lecturas recientes y guarda la última por sensor
    const load = async () => {
      const { data, error } = await supabase
        .from('sensor_readings')
        .select('sensor_id, value, recorded_at')
        .eq('org_id', orgId)
        .order('recorded_at', { ascending: false })
        .limit(INITIAL_WINDOW)
      if (error || cancelled) return
      const map = {}
      for (const r of data ?? []) {
        if (!map[r.sensor_id]) map[r.sensor_id] = { value: Number(r.value), recorded_at: r.recorded_at }
      }
      setLatest(map)
    }
    load()

    const channel = supabase
      .channel(`readings:${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const r = payload.new
          setLatest((prev) => {
            const cur = prev[r.sensor_id]
            if (cur && cur.recorded_at > r.recorded_at) return prev
            return { ...prev, [r.sensor_id]: { value: Number(r.value), recorded_at: r.recorded_at } }
          })
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [orgId])

  return latest
}
