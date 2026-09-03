/**
 * =============================================================================
 * ARCHIVO: src/hooks/useEvidence.js
 * PROPÓSITO: Hook «useEvidence»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DOC_MIMES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']

/**
 * Evidencias (fotos y documentos) de las órdenes de trabajo de una org.
 * Bucket privado wo-evidence con ruta org_id/work_order_id/archivo.
 * Ver/descargar: supervisores, coordinadores, admins, owners (o quien subió).
 */
/** Export «useEvidence»: API pública de este módulo. Henry Stark Desarrollador */
export function useEvidence(orgId, userId) {
  const [evidence, setEvidence] = useState([]) // todas las de la org visibles para mí
  const [error, setError] = useState(null)

  const loadEvidence = useCallback(async () => {
    if (!orgId) return
    const { data, error: err } = await supabase
      .from('wo_evidence')
      .select('id, work_order_id, uploaded_by, file_path, file_name, file_type, note, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setEvidence(data ?? [])
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadEvidence()
    const channel = supabase
      .channel(`evidence:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wo_evidence', filter: `org_id=eq.${orgId}` },
        () => loadEvidence()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, loadEvidence])

  /** Sube un archivo (foto o documento) como evidencia de una OT. */
  const uploadEvidence = useCallback(
    async (workOrderId, file, note) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!file) return { error: 'Selecciona un archivo' }
      setError(null)

      const isImage = file.type.startsWith('image/')
      const isDoc = DOC_MIMES.includes(file.type)
      if (!isImage && !isDoc) {
        const msg = 'Formato no permitido: usa fotos (JPG/PNG/WebP) o documentos (PDF/Word/Excel)'
        setError(msg)
        return { error: msg }
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
      const path = `${orgId}/${workOrderId}/${Date.now()}-${safeName}`

      const { error: upErr } = await supabase.storage
        .from('wo-evidence')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        setError(upErr.message)
        return { error: upErr.message }
      }

      const { error: insErr } = await supabase.from('wo_evidence').insert({
        org_id: orgId,
        work_order_id: workOrderId,
        uploaded_by: userId,
        file_path: path,
        file_name: file.name,
        file_type: isImage ? 'image' : 'document',
        note: note?.trim() || null,
      })
      if (insErr) {
        await supabase.storage.from('wo-evidence').remove([path])
        setError(insErr.message)
        return { error: insErr.message }
      }
      return { error: null }
    },
    [orgId, userId]
  )

  /** URL firmada (1 hora) para ver o descargar un archivo. */
  const getFileUrl = useCallback(async (path, download = false) => {
    const { data, error: err } = await supabase.storage
      .from('wo-evidence')
      .createSignedUrl(path, 3600, download ? { download: true } : undefined)
    if (err) return null
    return data?.signedUrl ?? null
  }, [])

  const deleteEvidence = useCallback(async (item) => {
    const { error: err } = await supabase.from('wo_evidence').delete().eq('id', item.id)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    await supabase.storage.from('wo-evidence').remove([item.file_path])
    return { error: null }
  }, [])

  return { evidence, error, loadEvidence, uploadEvidence, getFileUrl, deleteEvidence }
}

/** Catálogo de actividades predeterminadas de la organización. */
export function useActivityCatalog(orgId) {
  const [catalog, setCatalog] = useState([])

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('activity_catalog')
      .select('id, name, description, wo_type')
      .eq('org_id', orgId)
      .eq('active', true)
      .order('name')
      .then(({ data }) => setCatalog(data ?? []))
  }, [orgId])

  return catalog
}
