/**
 * =============================================================================
 * ARCHIVO: src/hooks/useNotifications.js
 * PROPÓSITO: Hook «useNotifications»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { canSeeNotification } from '../lib/notificationPolicy'
import { ensureNotifyPermission, showBrowserNotification } from '../lib/browserNotify'

/**
 * Notificaciones de la organización + push del navegador.
 * Filtrado por módulo (OT no van a gerencia).
 */
/** Export «useNotifications»: API pública de este módulo. Henry Stark Desarrollador */
export function useNotifications(orgId, userId, { role, area, isOmniscient } = {}) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [perm, setPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const knownIds = useRef(new Set())
  const primed = useRef(false)

  const loadAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('notifications')
        .select('id, title, body, kind, created_by, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(80)
      if (err) {
        // Tabla ausente o sin permiso: no tumbar la bandeja
        const missing = /does not exist|schema cache|Could not find|relation|PGRST/i.test(
          err.message || ''
        )
        setError(missing ? null : err.message)
        setNotifications([])
      } else {
        const list = data ?? []
        if (!primed.current) {
          knownIds.current = new Set(list.map((n) => n.id))
          primed.current = true
        }
        setNotifications(list)
        setError(null)
      }
    } catch (e) {
      setError(null)
      setNotifications([])
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadAll()
    let channel
    try {
      channel = supabase
        .channel(`notifications:${orgId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `org_id=eq.${orgId}`,
          },
          (payload) => {
            const n = payload.new
            if (!n?.id || knownIds.current.has(n.id)) return
            knownIds.current.add(n.id)
            setNotifications((prev) => [n, ...prev].slice(0, 80))
            if (n.created_by !== userId && canSeeNotification(n, role, area, isOmniscient)) {
              try {
                showBrowserNotification({
                  title: n.title,
                  body: n.body || '',
                  tag: n.id,
                })
              } catch {
                /* */
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `org_id=eq.${orgId}`,
          },
          () => loadAll()
        )
        .subscribe()
    } catch {
      /* realtime opcional */
    }
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch {
          /* */
        }
      }
    }
  }, [orgId, userId, role, area, isOmniscient, loadAll])

  const enableBrowserPush = useCallback(async () => {
    const p = await ensureNotifyPermission()
    setPerm(p)
    if (p === 'granted') {
      showBrowserNotification({
        title: 'IncubApp',
        body: 'Notificaciones activadas en este dispositivo.',
        tag: 'incubapp-welcome',
      })
    }
    return p
  }, [])

  const notify = useCallback(
    async ({ title, body, kind }) => {
      if (!orgId || !userId) return { error: null } // no bloquear bandeja
      if (!title?.trim()) return { error: null }
      setError(null)
      try {
        const { error: err } = await supabase.from('notifications').insert({
          org_id: orgId,
          title: title.trim(),
          body: body?.trim() || null,
          kind: kind || 'general',
          created_by: userId,
        })
        if (err) {
          // silencioso si falta tabla
          if (!/does not exist|schema cache|Could not find|relation/i.test(err.message || '')) {
            setError(err.message)
            return { error: err.message }
          }
          return { error: null }
        }
        return { error: null }
      } catch {
        return { error: null }
      }
    },
    [orgId, userId]
  )

  const remove = useCallback(async (id) => {
    setError(null)
    const { error: err } = await supabase.from('notifications').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  const visible = notifications.filter((n) =>
    canSeeNotification(n, role, area, isOmniscient)
  )

  return {
    notifications: visible,
    allNotifications: notifications,
    loading,
    error,
    notify,
    remove,
    reload: loadAll,
    browserPermission: perm,
    enableBrowserPush,
  }
}
