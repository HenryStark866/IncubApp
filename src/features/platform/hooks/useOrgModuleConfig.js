/**
 * =============================================================================
 * ARCHIVO: src/hooks/useOrgModuleConfig.js
 * PROPÓSITO: Hook «useOrgModuleConfig»: configuración de módulos por empresa.
 * CÓMO FUNCIONA: Carga organizations.settings del tenant, expone qué módulos
 * están apagados (disabled_menu_ids) y permite a la consola de plataforma
 * encender/apagar módulos guardando el settings fusionado. Se suscribe a
 * cambios Realtime de la fila para que el cliente pierda/recupere módulos al
 * instante, sin recargar sesión.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uniqueChannel } from '../lib/realtimeChannel'
import {
  disabledModulesSettingsPatch,
  isCoreModule,
  isModuleTabEnabled,
  readDisabledMenuIds,
} from '../lib/orgModules'

/** Export «useOrgModuleConfig»: API pública de este módulo. Henry Stark Desarrollador */
export function useOrgModuleConfig(orgId) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(!!orgId)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orgId) {
      setSettings(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .maybeSingle()
    if (err) {
      setError(err.message)
    } else {
      setError(null)
      setSettings(data?.settings ?? {})
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  // Cambios de settings en vivo (la consola apaga un módulo → el cliente lo pierde ya)
  useEffect(() => {
    if (!orgId) return
    const ch = supabase
      .channel(uniqueChannel(`org-modules:${orgId}`))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'organizations', filter: `id=eq.${orgId}` },
        (payload) => {
          if (payload?.new?.settings) setSettings(payload.new.settings)
          else load()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orgId, load])

  const disabledMenuIds = useMemo(() => readDisabledMenuIds(settings), [settings])

  const moduleEnabled = useCallback(
    (tab) => isModuleTabEnabled(disabledMenuIds, tab),
    [disabledMenuIds]
  )

  /**
   * Enciende/apaga un módulo del catálogo para esta empresa (solo consola).
   * Registra el cambio en dev_changes (bitácora inmutable).
   */
  const setModuleDisabled = useCallback(
    async (menuId, disabled, { userId, orgName, label } = {}) => {
      if (!orgId) return { error: 'Sin empresa seleccionada' }
      if (isCoreModule(menuId)) {
        return { error: 'Este módulo es parte del núcleo y no se puede apagar' }
      }
      const next = new Set(disabledMenuIds)
      if (disabled) next.add(menuId)
      else next.delete(menuId)

      const merged = {
        ...(settings || {}),
        ...disabledModulesSettingsPatch(next, { userId }),
      }
      const { error: err } = await supabase
        .from('organizations')
        .update({ settings: merged })
        .eq('id', orgId)
      if (err) return { error: err.message }

      setSettings(merged)
      if (userId) {
        await supabase.from('dev_changes').insert({
          org_id: orgId,
          actor: userId,
          area: 'module',
          action: disabled ? 'desactivar módulo' : 'activar módulo',
          target: label || menuId,
          description: `Módulo «${label || menuId}» ${disabled ? 'desactivado' : 'activado'} para ${orgName || 'la empresa'} desde la consola de plataforma`,
          diff: { modulo: menuId, deshabilitado: disabled },
        })
      }
      return { error: null }
    },
    [orgId, settings, disabledMenuIds]
  )

  return {
    settings,
    loading,
    error,
    disabledMenuIds,
    moduleEnabled,
    setModuleDisabled,
    reload: load,
  }
}
