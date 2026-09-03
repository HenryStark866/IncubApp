/**
 * =============================================================================
 * ARCHIVO: src/hooks/useCustomModules.js
 * PROPÓSITO: Hook «useCustomModules»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uniqueChannel } from '../lib/realtimeChannel'

/**
 * Pestañas/módulos personalizados creados desde Diseño (rol desarrollador).
 * Todos los miembros ven los habilitados como pestañas principales; el
 * contenido son bloques JSON (título, texto, lista, enlace, separador).
 */
/** Export «useCustomModules»: API pública de este módulo. Henry Stark Desarrollador */
export function useCustomModules(orgId) {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase
      .from('custom_modules')
      .select('id, title, icon, position, enabled, blocks, created_by, updated_at')
      .eq('org_id', orgId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    setModules(data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    load()
    const ch = supabase
      .channel(uniqueChannel(`cmods:${orgId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_modules', filter: `org_id=eq.${orgId}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orgId, load])

  return { modules, loading, reload: load }
}
