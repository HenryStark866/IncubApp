/**
 * =============================================================================
 * ARCHIVO: src/hooks/useChat.js
 * PROPÓSITO: Hook «useChat»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { enqueueInsert } from '../lib/offlineQueue'
import { isNetworkError } from '../lib/network'

/**
 * Chat de la organización:
 *  - Canal general (todos los miembros) + mensajes directos entre dos usuarios.
 *  - Lectura + envío + Realtime. El backend (RLS) decide qué puede ver cada uno:
 *    el general de su org y los directos donde participa.
 */
/** Export «useChat»: API pública de este módulo. Henry Stark Desarrollador */
export function useChat(orgId, userId) {
  const [members, setMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const seenIds = useRef(new Set())

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [mem, msg] = await Promise.all([
      supabase
        .from('organization_members')
        .select('user_id, role, profiles ( id, full_name, email, avatar_url )')
        .eq('org_id', orgId),
      supabase
        .from('messages')
        .select('id, sender_id, recipient_id, channel, body, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .limit(1000),
    ])
    if (!mem.error) {
      setMembers(
        (mem.data ?? []).map((row) => ({
          id: row.user_id,
          role: row.role,
          name: row.profiles?.full_name || row.profiles?.email || 'Usuario',
          email: row.profiles?.email || null,
          avatar: row.profiles?.avatar_url || null,
        }))
      )
    }
    if (msg.error) setError(msg.error.message)
    else {
      seenIds.current = new Set((msg.data ?? []).map((m) => m.id))
      setMessages(msg.data ?? [])
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadAll()
    const channel = supabase
      .channel(`messages:${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const m = payload.new
          if (seenIds.current.has(m.id)) return
          seenIds.current.add(m.id)
          setMessages((prev) => [...prev, m])
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `org_id=eq.${orgId}` },
        (payload) => {
          seenIds.current.delete(payload.old.id)
          setMessages((prev) => prev.filter((x) => x.id !== payload.old.id))
        }
      )
      .subscribe()
    // Al recuperar conexión, recargar: el Realtime no reenvía lo perdido sin señal
    const onOnline = () => loadAll()
    window.addEventListener('online', onOnline)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('online', onOnline)
    }
  }, [orgId, loadAll])

  const sendMessage = useCallback(
    async ({ body, recipientId }) => {
      if (!orgId || !userId) return { error: 'Sin sesión' }
      const text = body?.trim()
      if (!text) return { error: 'Mensaje vacío' }
      setError(null)
      const row = {
        org_id: orgId,
        sender_id: userId,
        recipient_id: recipientId || null,
        channel: recipientId ? 'direct' : 'general',
        body: text,
      }
      const { error: err } = await supabase.from('messages').insert(row)
      if (err) {
        if (isNetworkError(err.message)) {
          await enqueueInsert('messages', {
            ...row,
            created_at: new Date().toISOString(),
          })
          return { error: null, offline: true }
        }
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [orgId, userId]
  )

  const deleteMessage = useCallback(async (id) => {
    const { error: err } = await supabase.from('messages').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  return { members, messages, loading, error, sendMessage, deleteMessage, reload: loadAll }
}
