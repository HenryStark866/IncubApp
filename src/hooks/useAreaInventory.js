/**
 * =============================================================================
 * ARCHIVO: src/hooks/useAreaInventory.js
 * PROPÓSITO: Hook «useAreaInventory»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  isMissingOpsTable,
  localAdjustInventory,
  localListInventories,
  localListLeads,
  localListMovements,
  localUpsertInventory,
  localUpsertLead,
} from '../lib/opsLocalStore'

/** Export «INV_CATEGORIES»: API pública de este módulo. Henry Stark Desarrollador */
export const INV_CATEGORIES = [
  { value: 'eggs', label: 'Huevos', defaultLead: 'Recepción / granja' },
  { value: 'feed', label: 'Alimento', defaultLead: 'Granja / bodega' },
  { value: 'purchases', label: 'Compras', defaultLead: 'Contabilidad / compras' },
  { value: 'supplies', label: 'Dotación / EPP', defaultLead: 'RR. HH. / SST' },
  { value: 'chicks', label: 'Pollito / producto', defaultLead: 'Ventas / logística' },
  { value: 'other', label: 'Otros', defaultLead: 'Administración' },
]

/** Export «categoryLabel»: API pública de este módulo. Henry Stark Desarrollador */
export const categoryLabel = (c) => INV_CATEGORIES.find((x) => x.value === c)?.label || c

/**
 * Inventarios por área con responsable principal.
 */
/** Export «useAreaInventory»: API pública de este módulo. Henry Stark Desarrollador */
export function useAreaInventory(orgId, userId) {
  const [items, setItems] = useState([])
  const [leads, setLeads] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)
  const [category, setCategory] = useState('eggs')

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)

    const [inv, lead] = await Promise.all([
      supabase
        .from('area_inventories')
        .select(
          'id, org_id, category, item_code, item_name, unit, qty_on_hand, min_qty, location, responsible_user_id, responsible_label, notes, updated_at'
        )
        .eq('org_id', orgId)
        .order('item_name'),
      supabase.from('inventory_area_leads').select('*').eq('org_id', orgId),
    ])

    if (inv.error && isMissingOpsTable(inv.error.message)) {
      setLocalMode(true)
      setItems(localListInventories(orgId))
      setLeads(localListLeads(orgId))
      setMovements(localListMovements(orgId))
      setError(null)
      setLoading(false)
      return
    }
    if (inv.error) {
      setError(inv.error.message)
      setItems([])
    } else {
      setLocalMode(false)
      setItems(inv.data ?? [])
    }
    if (!lead.error) setLeads(lead.data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(
    () => items.filter((i) => i.category === category),
    [items, category]
  )

  const leadFor = useCallback(
    (cat) => leads.find((l) => l.category === cat) || null,
    [leads]
  )

  const saveItem = useCallback(
    async (payload, id = null) => {
      if (!orgId) return { error: 'Sin org' }
      if (!payload.item_name?.trim()) return { error: 'Nombre del ítem obligatorio' }
      const row = {
        org_id: orgId,
        category: payload.category || category,
        item_code: payload.item_code?.trim() || null,
        item_name: payload.item_name.trim(),
        unit: payload.unit?.trim() || 'und',
        qty_on_hand:
          payload.qty_on_hand === '' || payload.qty_on_hand == null
            ? 0
            : Number(payload.qty_on_hand),
        min_qty:
          payload.min_qty === '' || payload.min_qty == null ? 0 : Number(payload.min_qty),
        location: payload.location?.trim() || null,
        responsible_user_id: payload.responsible_user_id || null,
        responsible_label: payload.responsible_label?.trim() || null,
        notes: payload.notes?.trim() || null,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      }

      if (localMode) {
        localUpsertInventory(id ? { ...row, id } : row)
        await load()
        return { error: null, local: true }
      }

      if (id) {
        const { error: err } = await supabase.from('area_inventories').update(row).eq('id', id)
        if (err) {
          if (isMissingOpsTable(err.message)) {
            setLocalMode(true)
            localUpsertInventory({ ...row, id })
            await load()
            return { error: null, local: true }
          }
          return { error: err.message }
        }
      } else {
        const { error: err } = await supabase.from('area_inventories').insert(row)
        if (err) {
          if (isMissingOpsTable(err.message)) {
            setLocalMode(true)
            localUpsertInventory(row)
            await load()
            return { error: null, local: true }
          }
          return { error: err.message }
        }
      }
      await load()
      return { error: null }
    },
    [orgId, userId, category, localMode, load]
  )

  const moveStock = useCallback(
    async ({ inventoryId, movement_type, qty, notes }) => {
      const q = Number(qty)
      if (!inventoryId || !q || q <= 0) return { error: 'Cantidad inválida' }
      // adjust: qty is signed via movement_type in form — for adjust use signed
      const signed =
        movement_type === 'out' ? -Math.abs(q) : movement_type === 'in' ? Math.abs(q) : Number(qty)

      if (localMode) {
        const res = localAdjustInventory(inventoryId, signed, {
          org_id: orgId,
          movement_type,
          notes: notes || null,
          created_by: userId,
        })
        if (res.error) return res
        await load()
        return { error: null, local: true }
      }

      // leer stock actual
      const item = items.find((i) => i.id === inventoryId)
      if (!item) return { error: 'Ítem no encontrado' }
      const next = Number(item.qty_on_hand || 0) + signed
      const { error: uErr } = await supabase
        .from('area_inventories')
        .update({ qty_on_hand: next, updated_at: new Date().toISOString(), updated_by: userId })
        .eq('id', inventoryId)
      if (uErr) {
        if (isMissingOpsTable(uErr.message)) {
          setLocalMode(true)
          localAdjustInventory(inventoryId, signed, {
            org_id: orgId,
            movement_type,
            notes: notes || null,
            created_by: userId,
          })
          await load()
          return { error: null, local: true }
        }
        return { error: uErr.message }
      }
      await supabase.from('inventory_movements').insert({
        org_id: orgId,
        inventory_id: inventoryId,
        movement_type,
        qty: Math.abs(signed),
        notes: notes?.trim() || null,
        created_by: userId,
      })
      await load()
      return { error: null }
    },
    [localMode, items, orgId, userId, load]
  )

  const setLead = useCallback(
    async (cat, { user_id, label }) => {
      const row = {
        org_id: orgId,
        category: cat,
        user_id: user_id || null,
        label: label?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (localMode) {
        localUpsertLead(row)
        await load()
        return { error: null }
      }
      const { error: err } = await supabase
        .from('inventory_area_leads')
        .upsert(row, { onConflict: 'org_id,category' })
      if (err) {
        if (isMissingOpsTable(err.message)) {
          setLocalMode(true)
          localUpsertLead(row)
          await load()
          return { error: null }
        }
        return { error: err.message }
      }
      await load()
      return { error: null }
    },
    [orgId, localMode, load]
  )

  const lowStock = items.filter(
    (i) => Number(i.min_qty) > 0 && Number(i.qty_on_hand) <= Number(i.min_qty)
  )

  return {
    items,
    filtered,
    leads,
    movements,
    category,
    setCategory,
    loading,
    error,
    localMode,
    lowStock,
    leadFor,
    saveItem,
    moveStock,
    setLead,
    reload: load,
  }
}
