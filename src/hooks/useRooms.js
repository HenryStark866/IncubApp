/**
 * =============================================================================
 * ARCHIVO: src/hooks/useRooms.js
 * PROPÓSITO: Hook «useRooms»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const GRID = 12 // metros por fila/columna al auto-ubicar una sala nueva

/**
 * Salas de una planta (mapa de piso).
 *  - Lectura + Realtime por planta
 *  - createRoom: auto-ubica la sala en una cuadrícula libre
 *  - moveRoom: persiste la nueva posición (drag & drop del mapa)
 *  - deleteRoom: solo admins/owners (RLS: rooms_delete)
 */
/** Export «useRooms»: API pública de este módulo. Henry Stark Desarrollador */
export function useRooms(plantId, orgId) {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const channelRef = useRef(null)

  const loadRooms = useCallback(async () => {
    if (!plantId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('rooms')
      .select('id, name, code, type, nivel, pos_x, pos_y, width, height, rotation, points, color, doors, parte_de, altura, wall_heights, created_at')
      .eq('plant_id', plantId)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setRooms(data ?? [])
    setLoading(false)
  }, [plantId])

  useEffect(() => {
    if (!plantId) return
    loadRooms()

    const channel = supabase
      .channel(`rooms:${plantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `plant_id=eq.${plantId}` },
        () => loadRooms()
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [plantId, loadRooms])

  const createRoom = useCallback(
    async ({ name, code, type, nivel, pos_x, pos_y, width, height, points, parte_de, altura }) => {
      if (!plantId || !orgId) return { error: 'Selecciona una planta primero' }
      setError(null)

      // Encontrar el número de sala más alto (S<número>) para evitar colisiones de códigos únicos (ej. S24)
      let nextNum = 1
      rooms.forEach((r) => {
        if (r.code && r.code.startsWith('S')) {
          const num = parseInt(r.code.slice(1), 10)
          if (!isNaN(num) && num >= nextNum) {
            nextNum = num + 1
          }
        }
      })
      const generatedCode = code?.trim() || `S${nextNum}`

      // Geometría: si no se pasa una específica (p. ej. polígono dibujado), se auto-ubica en la cuadrícula
      const slot = rooms.length
      const geom =
        pos_x != null
          ? { pos_x, pos_y, width, height, points: points ?? null }
          : { pos_x: (slot % 5) * GRID, pos_y: Math.floor(slot / 5) * GRID, width: 10, height: 10 }

      const { error: err } = await supabase.from('rooms').insert({
        plant_id: plantId,
        org_id: orgId,
        name: name.trim(),
        code: generatedCode,
        type: type || 'other',
        // La sala nace en el nivel que se este dibujando: el entrepiso
        // tiene sus propias salas, encima y sin estorbar a las de abajo.
        nivel: nivel ?? 1,
        // Sub-salas de plenum: cuelgan de una sala anfitriona (parte_de) y
        // traen su propia profundidad (altura), en vez de la del tipo.
        ...(parte_de ? { parte_de } : null),
        ...(altura != null ? { altura } : null),
        ...geom,
      })
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [plantId, orgId, rooms]
  )

  /** Crea varias salas de una vez (p. ej. un módulo de galpones completo). */
  const createRooms = useCallback(
    async (list) => {
      if (!plantId || !orgId) return { error: 'Selecciona una planta primero' }
      if (!list || list.length === 0) return { error: null }
      setError(null)
      const dupes = list.filter((r) => rooms.some((x) => x.code === r.code)).map((r) => r.code)
      if (dupes.length > 0) {
        const msg = `Ya existen salas con estos códigos: ${dupes.join(', ')}`
        setError(msg)
        return { error: msg }
      }
      const rows = list.map((r) => ({
        plant_id: plantId,
        org_id: orgId,
        name: r.name.trim(),
        code: r.code,
        type: r.type || 'other',
        pos_x: r.pos_x,
        pos_y: r.pos_y,
        width: r.width,
        height: r.height,
      }))
      const { error: err } = await supabase.from('rooms').insert(rows)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [plantId, orgId, rooms]
  )

  const updateRoom = useCallback(async (roomId, patch) => {
    setError(null)
    // Actualización optimista
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...patch } : r)))
    const { error: err } = await supabase.from('rooms').update(patch).eq('id', roomId)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  const moveRoom = useCallback(async (roomId, pos_x, pos_y) => {
    // Actualización optimista: el mapa se siente instantáneo, Realtime confirma después
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, pos_x, pos_y } : r)))
    const { error: err } = await supabase.from('rooms').update({ pos_x, pos_y }).eq('id', roomId)
    if (err) setError(err.message)
  }, [])

  const deleteRoom = useCallback(async (roomId) => {
    const { error: err } = await supabase.from('rooms').delete().eq('id', roomId)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  return { rooms, loading, error, createRoom, createRooms, updateRoom, moveRoom, deleteRoom, reload: loadRooms }
}
