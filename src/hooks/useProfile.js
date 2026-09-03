/**
 * =============================================================================
 * ARCHIVO: src/hooks/useProfile.js
 * PROPÓSITO: Hook «useProfile»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Perfil del usuario con sincronización bidireccional:
 *  - Lectura inicial desde la base de datos
 *  - Suscripción Realtime: cambios en la DB llegan a la app al instante
 *  - saveProfile: cambios en la app se escriben a la DB (y el eco
 *    Realtime actualiza cualquier otra sesión abierta)
 */
/** Export «useProfile»: API pública de este módulo. Henry Stark Desarrollador */
export function useProfile(userId) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [live, setLive] = useState(false)
  const [error, setError] = useState(null)
  const channelRef = useRef(null)

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, email, full_name, phone, avatar_url, platform_role, is_approved, updated_at')
        .eq('id', userId)
        .maybeSingle()
      if (err) setError(err.message)
      else setProfile(data)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    loadProfile()

    const channel = supabase
      .channel(`profile:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') setProfile(null)
          else setProfile(payload.new)
        }
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      setLive(false)
    }
  }, [userId, loadProfile])

  const saveProfile = useCallback(
    async (fields) => {
      if (!userId) return { error: 'Sin sesión activa' }
      setSaving(true)
      setError(null)

      // upsert: crea el perfil si no existe (primer inicio de sesión)
      const { error: err } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...fields }, { onConflict: 'id' })

      setSaving(false)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [userId]
  )

  // Cambia SOLO los campos dados sobre el perfil existente.
  // OJO: no usar upsert para campos parciales — el INSERT propuesto va con
  // full_name NULL y viola su NOT NULL aunque la fila ya exista.
  const patchProfile = useCallback(
    async (fields) => {
      if (!userId) return { error: 'Sin sesión activa' }
      setSaving(true)
      setError(null)
      const { error: err } = await supabase.from('profiles').update(fields).eq('id', userId)
      setSaving(false)
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      // Eco optimista: el Realtime confirma después
      setProfile((p) => (p ? { ...p, ...fields } : p))
      return { error: null }
    },
    [userId]
  )

  // Sube la foto de perfil (galería o selfie) al bucket público avatars y la guarda
  const uploadAvatar = useCallback(
    async (file) => {
      if (!userId) return { error: 'Sin sesión activa' }
      if (!file || !file.type?.startsWith('image/')) return { error: 'Selecciona una imagen válida' }
      setError(null)
      const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
      if (upErr) {
        const msg = /mime type|not supported/i.test(upErr.message)
          ? 'Formato de imagen no compatible. Usa una foto JPG, PNG o WebP.'
          : upErr.message
        setError(msg)
        return { error: msg }
      }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = pub?.publicUrl ?? null
      const prev = profile?.avatar_url
      const res = await patchProfile({ avatar_url: url })
      if (res.error) {
        await supabase.storage.from('avatars').remove([path])
        return res
      }
      // Borra la foto anterior de nuestro bucket para no acumular archivos
      if (prev && prev.includes('/avatars/')) {
        const oldPath = prev.split('/avatars/')[1]?.split('?')[0]
        if (oldPath && oldPath !== path) supabase.storage.from('avatars').remove([oldPath])
      }
      return { error: null, url }
    },
    [userId, profile, patchProfile]
  )

  const removeAvatar = useCallback(async () => {
    if (!userId) return { error: 'Sin sesión activa' }
    const prev = profile?.avatar_url
    const res = await patchProfile({ avatar_url: null })
    if (!res.error && prev && prev.includes('/avatars/')) {
      const oldPath = prev.split('/avatars/')[1]?.split('?')[0]
      if (oldPath) supabase.storage.from('avatars').remove([oldPath])
    }
    return res
  }, [userId, profile, patchProfile])

  return { profile, loading, saving, live, error, saveProfile, uploadAvatar, removeAvatar, reload: loadProfile }
}
