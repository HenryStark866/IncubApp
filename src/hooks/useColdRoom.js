/**
 * =============================================================================
 * ARCHIVO: src/hooks/useColdRoom.js
 * PROPÓSITO: Hook «useColdRoom»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Cuarto frío (operario de recepción):
 *  - stock: saldos reales por lote + fecha + galpón, con cantidades por tipo
 *    (Incubable, Deforme, Extra, Roto, Sucio). Upsert para cargar/actualizar.
 *  - classifications: actividad de clasificación del huevo (operarios, carros
 *    1..12, sencilla = 12 carros / doble = 24).
 * RLS: escriben gestión + operario de recepción; leen los miembros de la org.
 */

// Tipificación fija del saldo en cuarto frío
/** Export «COLD_ROOM_TYPES»: API pública de este módulo. Henry Stark Desarrollador */
export const COLD_ROOM_TYPES = [
  { code: 'incubable', label: 'Incubable' },
  { code: 'deforme', label: 'Deforme' },
  { code: 'extra', label: 'Extra' },
  { code: 'roto', label: 'Roto' },
  { code: 'sucio', label: 'Sucio' },
]

/** Export «CLASSIFICATION_TYPES»: API pública de este módulo. Henry Stark Desarrollador */
export const CLASSIFICATION_TYPES = [
  { value: 'sencilla', label: 'Sencilla (12 carros)', carts: 12 },
  { value: 'doble', label: 'Doble (24 carros)', carts: 24 },
]

const cleanCounts = (counts) => {
  const clean = {}
  for (const t of COLD_ROOM_TYPES) {
    const v = counts?.[t.code]
    clean[t.code] = v === '' || v == null ? 0 : Number(v)
  }
  return clean
}

/** Export «useColdRoom»: API pública de este módulo. Henry Stark Desarrollador */
export function useColdRoom(orgId, userId) {
  const [stock, setStock] = useState([])
  const [classifications, setClassifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [s, c] = await Promise.all([
      supabase
        .from('cold_room_stock')
        .select('id, batch_id, room_id, stock_date, counts, notes, updated_by, updated_at')
        .eq('org_id', orgId)
        .order('stock_date', { ascending: false })
        .limit(400),
      supabase
        .from('egg_classifications')
        .select('id, batch_id, room_id, activity_date, operators_count, carts_count, classification_type, cart_numbers, notes, created_by, created_at')
        .eq('org_id', orgId)
        .order('activity_date', { ascending: false })
        .limit(200),
    ])
    if (s.error) setError(s.error.message)
    else setStock(s.data ?? [])
    if (c.error) setError(c.error.message)
    else setClassifications(c.data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadAll()
    const channel = supabase
      .channel(`coldroom:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cold_room_stock', filter: `org_id=eq.${orgId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egg_classifications', filter: `org_id=eq.${orgId}` }, () => loadAll())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, loadAll])

  // Cargar o actualizar el saldo del día: upsert por (lote, galpón, fecha)
  const saveStock = useCallback(
    async ({ batchId, roomId, stockDate, counts, notes }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!batchId) return { error: 'El lote es obligatorio' }
      if (!roomId) return { error: 'El galpón es obligatorio' }
      if (!stockDate) return { error: 'La fecha es obligatoria' }
      setError(null)
      const { error: err } = await supabase.from('cold_room_stock').upsert(
        {
          org_id: orgId,
          batch_id: batchId,
          room_id: roomId,
          stock_date: stockDate,
          counts: cleanCounts(counts),
          notes: notes?.trim() || null,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,batch_id,room_id,stock_date' }
      )
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [orgId, userId]
  )

  const deleteStock = useCallback(async (id) => {
    setError(null)
    const { error: err } = await supabase.from('cold_room_stock').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  // Registrar la actividad de clasificación (sencilla 12 / doble 24 carros)
  const saveClassification = useCallback(
    async ({ batchId, roomId, activityDate, operatorsCount, cartsCount, classificationType, cartNumbers, notes }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!activityDate) return { error: 'La fecha es obligatoria' }
      const ops = Number(operatorsCount)
      if (!ops || ops < 1) return { error: 'Indica la cantidad de operarios' }
      const carts = Number(cartsCount)
      if (!carts || carts < 1 || carts > 24) return { error: 'Los carros a clasificar deben estar entre 1 y 24' }
      setError(null)
      const { error: err } = await supabase.from('egg_classifications').insert({
        org_id: orgId,
        batch_id: batchId || null,
        room_id: roomId || null,
        activity_date: activityDate,
        operators_count: ops,
        carts_count: carts,
        classification_type: classificationType,
        cart_numbers: cartNumbers ?? [],
        notes: notes?.trim() || null,
        created_by: userId,
      })
      if (err) {
        setError(err.message)
        return { error: err.message }
      }
      return { error: null }
    },
    [orgId, userId]
  )

  const deleteClassification = useCallback(async (id) => {
    setError(null)
    const { error: err } = await supabase.from('egg_classifications').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    return { error: null }
  }, [])

  return {
    stock,
    classifications,
    loading,
    error,
    reload: loadAll,
    saveStock,
    deleteStock,
    saveClassification,
    deleteClassification,
  }
}
