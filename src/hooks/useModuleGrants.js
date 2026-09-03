/**
 * =============================================================================
 * ARCHIVO: src/hooks/useModuleGrants.js
 * PROPÓSITO: Hook «useModuleGrants»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Módulos habilitados al usuario por una tarea del turno activa.
 * El supervisor asigna una actividad con `grants_module` (ej. 'reception'); mientras
 * esa tarea esté pending/in_progress, el operario obtiene ese módulo. Al completarla,
 * el grant desaparece (Realtime lo refleja al instante).
 * Devuelve un objeto, ej. { reception: true }.
 */
/** Export «useModuleGrants»: API pública de este módulo. Henry Stark Desarrollador */
export function useModuleGrants(orgId, userId) {
  const [modules, setModules] = useState({})

  const load = useCallback(async () => {
    if (!orgId || !userId) { setModules({}); return }
    const { data } = await supabase
      .from('shift_activities')
      .select('grants_module, status')
      .eq('org_id', orgId)
      .eq('assigned_to', userId)
      .in('status', ['pending', 'in_progress'])
      .not('grants_module', 'is', null)
    const m = {}
    for (const a of data ?? []) if (a.grants_module) m[a.grants_module] = true
    setModules(m)
  }, [orgId, userId])

  useEffect(() => {
    if (!orgId || !userId) return
    load()
    const ch = supabase
      .channel(`grants:${orgId}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_activities', filter: `assigned_to=eq.${userId}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orgId, userId, load])

  return modules
}
