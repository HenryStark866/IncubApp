/**
 * =============================================================================
 * ARCHIVO: src/hooks/usePlants.js
 * PROPÓSITO: Hook «usePlants»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const toCode = (text) =>
  text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 8)

/**
 * Plantas (sedes físicas) de la organización activa.
 *  - Lectura + Realtime (cambios de cualquier sesión del mismo tenant llegan al instante)
 *  - createPlant: solo admins/owners pueden escribir (lo aplica RLS: plants_write)
 */
/** Export «usePlants»: API pública de este módulo. Henry Stark Desarrollador */
export function usePlants(orgId) {
  const [plants, setPlants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const channelRef = useRef(null)

  const loadPlants = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    let { data, error: err } = await supabase
      .from('plants')
      .select(
        'id, name, code, address, city, status, created_at, geo_origin_lat, geo_origin_lng, geo_rotation_deg, geo_scale, geo_radius_m'
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
    // Si aún no existen columnas GPS, reintentar sin ellas
    if (err && /column|schema cache|does not exist/i.test(err.message)) {
      ;({ data, error: err } = await supabase
        .from('plants')
        .select('id, name, code, address, city, status, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true }))
    }
    if (err) setError(err.message)
    else setPlants(data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadPlants()

    const channel = supabase
      .channel(`plants:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plants', filter: `org_id=eq.${orgId}` },
        () => loadPlants()
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId, loadPlants])

  const createPlant = useCallback(
    async ({ name, address, city }) => {
      if (!orgId) return { error: 'Sin organización activa' }
      setError(null)
      const { data, error: err } = await supabase
        .from('plants')
        .insert({
          org_id: orgId,
          name: name.trim(),
          code: toCode(name) || 'PLANTA',
          address: address?.trim() || null,
          city: city?.trim() || null,
        })
        .select()
        .single()
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      await loadPlants()
      return { error: null, plant: data }
    },
    [orgId, loadPlants]
  )

  const updatePlantGeo = useCallback(
    async (plantId, patch) => {
      if (!plantId) return { error: 'Sin planta' }
      const { error: err } = await supabase.from('plants').update(patch).eq('id', plantId)
      if (err) {
        // Columnas GPS aún no migradas: no es fatal (queda en localStorage)
        if (/column|schema cache|does not exist/i.test(err.message)) {
          return { error: null, offlineOnly: true }
        }
        setError(err.message)
        return { error: err.message }
      }
      await loadPlants()
      return { error: null }
    },
    [loadPlants]
  )

  return { plants, loading, error, createPlant, updatePlantGeo, reload: loadPlants }
}
