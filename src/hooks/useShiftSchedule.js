/**
 * =============================================================================
 * ARCHIVO: src/hooks/useShiftSchedule.js
 * PROPÓSITO: Hook «useShiftSchedule»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uniqueChannel } from '../lib/realtimeChannel'

const iso = (d) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

/**
 * Calendario de turnos rotativos (shift_assignments).
 *  - Carga las asignaciones recientes/futuras de la org (+ Realtime).
 *  - setAssignment: fija T1/T2/T3, descanso, o limpia una celda (por día/operario).
 *  - generateRotation: crea el patrón 15 días de turno + 2 de descanso en lote.
 * Escribe solo la supervisión/gestión (RLS); todos leen.
 */
/** Export «useShiftSchedule»: API pública de este módulo. Henry Stark Desarrollador */
export function useShiftSchedule(orgId, userId) {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const from = new Date()
    from.setDate(from.getDate() - 21)
    const { data, error: err } = await supabase
      .from('shift_assignments')
      .select('id, plant_id, user_id, work_date, shift_number, is_rest')
      .eq('org_id', orgId)
      .gte('work_date', iso(from))
      .order('work_date', { ascending: true })
    if (err) setError(err.message)
    else setAssignments(data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    load()
    const ch = supabase
      .channel(uniqueChannel(`shifts:${orgId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_assignments', filter: `org_id=eq.${orgId}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orgId, load])

  // Fija una celda: shiftNumber 1|2|3, isRest, o ambos vacíos = limpiar (borrar).
  const setAssignment = useCallback(
    async ({ userId: uid, date, shiftNumber, isRest, plantId }) => {
      if (!orgId) return { error: 'Sin organización' }
      setError(null)
      if (!shiftNumber && !isRest) {
        const { error: err } = await supabase
          .from('shift_assignments')
          .delete()
          .eq('org_id', orgId)
          .eq('user_id', uid)
          .eq('work_date', date)
        if (err) { setError(err.message); return { error: err.message } }
      } else {
        const { error: err } = await supabase.from('shift_assignments').upsert(
          {
            org_id: orgId,
            user_id: uid,
            work_date: date,
            shift_number: isRest ? null : shiftNumber,
            is_rest: !!isRest,
            plant_id: plantId || null,
            created_by: userId,
          },
          { onConflict: 'org_id,user_id,work_date' }
        )
        if (err) { setError(err.message); return { error: err.message } }
      }
      await load()
      return { error: null }
    },
    [orgId, userId, load]
  )

  // Patrón 15 días de turno + 2 de descanso (por defecto) para uno o varios operarios.
  const generateRotation = useCallback(
    async ({ userIds, startDate, shiftNumber, plantId, onDays = 15, offDays = 2 }) => {
      if (!orgId) return { error: 'Sin organización' }
      if (!userIds?.length) return { error: 'Selecciona al menos un operario' }
      setError(null)
      const start = new Date(`${startDate}T00:00:00`)
      const rows = []
      for (const uid of userIds) {
        for (let i = 0; i < onDays + offDays; i++) {
          const d = new Date(start)
          d.setDate(start.getDate() + i)
          const rest = i >= onDays
          rows.push({
            org_id: orgId,
            user_id: uid,
            work_date: iso(d),
            shift_number: rest ? null : shiftNumber,
            is_rest: rest,
            plant_id: plantId || null,
            created_by: userId,
          })
        }
      }
      const { error: err } = await supabase
        .from('shift_assignments')
        .upsert(rows, { onConflict: 'org_id,user_id,work_date' })
      if (err) { setError(err.message); return { error: err.message } }
      await load()
      return { error: null }
    },
    [orgId, userId, load]
  )

  return { assignments, loading, error, setAssignment, generateRotation, reload: load }
}
