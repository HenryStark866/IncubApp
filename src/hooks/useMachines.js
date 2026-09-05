/**
 * =============================================================================
 * ARCHIVO: src/hooks/useMachines.js
 * PROPÓSITO: Hook «useMachines»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Máquinas incubadoras de una planta.
 *  - Lectura + Realtime por planta (RLS: solo miembros de la org)
 *  - createMachine / updateMachine / deleteMachine: solo admins/owners (RLS)
 *  - Una máquina puede estar asignada a una sala (room_id) o sin ubicar
 */
/** Export «useMachines»: API pública de este módulo. Henry Stark Desarrollador */
export function useMachines(plantId) {
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadMachines = useCallback(async () => {
    if (!plantId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('machines')
      .select('id, code, name, type, brand, model, capacity_eggs, status, room_id, pos_x, pos_y, rotation, width, depth, height, installed_at, created_at')
      .eq('plant_id', plantId)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setMachines(data ?? [])
    setLoading(false)
  }, [plantId])

  useEffect(() => {
    if (!plantId) return
    loadMachines()

    const channel = supabase
      .channel(`machines:${plantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'machines', filter: `plant_id=eq.${plantId}` },
        () => loadMachines()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [plantId, loadMachines])

  const createMachine = useCallback(
    async ({ code, name, type, brand, model, capacity_eggs, room_id, installed_at, pos_x, pos_y }) => {
      if (!plantId) return { error: 'Selecciona una planta primero' }
      setError(null)
      // Devuelve la fila creada: quien la crea desde el plano necesita su id
      // para seleccionarla y escribirle ahí mismo el tipo y la medida.
      const { data, error: err } = await supabase.from('machines').insert({
        plant_id: plantId,
        code: code.trim(),
        name: name.trim(),
        type,
        brand: brand?.trim() || null,
        model: model?.trim() || null,
        capacity_eggs: capacity_eggs ? Number(capacity_eggs) : null,
        room_id: room_id || null,
        installed_at: installed_at || null,
        // Un equipo nace donde se pidió ponerlo. Sin esto, uno creado desde el
        // plano caía en 0,0 —la esquina de su sala— encima de lo que hubiera.
        ...(pos_x != null ? { pos_x } : null),
        ...(pos_y != null ? { pos_y } : null),
      }).select('id, code').single()
      if (err) {
        const msg = err.code === '23505' ? 'Ya existe una máquina con ese código en la planta' : err.message
        setError(msg)
        return { error: msg }
      }
      return { error: null, data }
    },
    [plantId]
  )

  const updateMachine = useCallback(async (machineId, patch) => {
    setError(null)
    // Actualización optimista
    setMachines((prev) => prev.map((m) => (m.id === machineId ? { ...m, ...patch } : m)))
    const { error: err } = await supabase.from('machines').update(patch).eq('id', machineId)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  const deleteMachine = useCallback(async (machineId) => {
    const { error: err } = await supabase.from('machines').delete().eq('id', machineId)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  return { machines, loading, error, createMachine, updateMachine, deleteMachine, reload: loadMachines }
}
