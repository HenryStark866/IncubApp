/**
 * =============================================================================
 * ARCHIVO: src/hooks/useCoordinatorInventory.js
 * PROPÓSITO: Hook «useCoordinatorInventory»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isMissingOpsTable } from '../lib/opsLocalStore'

const KEY_B = 'incubapp_coord_inv_books_v1'
const KEY_I = 'incubapp_coord_inv_items_v1'

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}
function write(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows))
}
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `ci-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Inventarios personalizados por coordinador (desde cero).
 * Cada coordinador crea sus “libros” de inventario e ítems a medida.
 */
/** Export «useCoordinatorInventory»: API pública de este módulo. Henry Stark Desarrollador */
export function useCoordinatorInventory(orgId, userId, area) {
  const [books, setBooks] = useState([])
  const [items, setItems] = useState([])
  const [bookId, setBookId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)

    const booksQ = supabase
      .from('coord_inventory_books')
      .select(
        'id, org_id, owner_user_id, area, name, description, created_at, updated_at'
      )
      .eq('org_id', orgId)
      .order('name')

    const itemsQ = supabase
      .from('coord_inventory_items')
      .select(
        'id, org_id, book_id, item_code, item_name, unit, qty_on_hand, min_qty, location, notes, custom_label, updated_at'
      )
      .eq('org_id', orgId)
      .order('item_name')

    const [bRes, iRes] = await Promise.all([booksQ, itemsQ])

    if (
      (bRes.error && isMissingOpsTable(bRes.error.message)) ||
      (iRes.error && isMissingOpsTable(iRes.error.message))
    ) {
      setLocalMode(true)
      setBooks(read(KEY_B).filter((x) => x.org_id === orgId))
      setItems(read(KEY_I).filter((x) => x.org_id === orgId))
      setError(null)
      setLoading(false)
      return
    }

    if (bRes.error) {
      setError(bRes.error.message)
      setBooks([])
    } else {
      setLocalMode(false)
      setBooks(bRes.data ?? [])
    }
    if (!iRes.error) setItems(iRes.data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  // Preferir libro del área del coordinador o el primero propio
  const myBooks = useMemo(() => {
    if (!userId) return books
    const mine = books.filter((b) => b.owner_user_id === userId)
    if (mine.length) return mine
    // admins ven todos
    return books
  }, [books, userId])

  const areaBooks = useMemo(() => {
    if (!area) return myBooks
    const byArea = myBooks.filter((b) => b.area === area)
    return byArea.length ? byArea : myBooks
  }, [myBooks, area])

  useEffect(() => {
    if (!bookId && areaBooks[0]) setBookId(areaBooks[0].id)
    if (bookId && areaBooks.length && !areaBooks.some((b) => b.id === bookId)) {
      setBookId(areaBooks[0]?.id ?? null)
    }
  }, [areaBooks, bookId])

  const activeItems = useMemo(
    () => items.filter((i) => i.book_id === bookId),
    [items, bookId]
  )

  const createBook = useCallback(
    async ({ name, description }) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!name?.trim()) return { error: 'Nombre del inventario obligatorio' }
      const row = {
        org_id: orgId,
        owner_user_id: userId,
        area: area || 'general',
        name: name.trim(),
        description: description?.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (localMode) {
        const rec = { id: uid(), ...row }
        write(KEY_B, [rec, ...read(KEY_B)])
        await load()
        setBookId(rec.id)
        return { error: null, book: rec, local: true }
      }

      const { data, error: err } = await supabase
        .from('coord_inventory_books')
        .insert(row)
        .select()
        .single()
      if (err) {
        if (isMissingOpsTable(err.message)) {
          setLocalMode(true)
          const rec = { id: uid(), ...row }
          write(KEY_B, [rec, ...read(KEY_B)])
          await load()
          setBookId(rec.id)
          return { error: null, book: rec, local: true }
        }
        return { error: err.message }
      }
      await load()
      setBookId(data.id)
      return { error: null, book: data }
    },
    [orgId, userId, area, localMode, load]
  )

  const deleteBook = useCallback(
    async (id) => {
      if (localMode) {
        write(
          KEY_B,
          read(KEY_B).filter((b) => b.id !== id)
        )
        write(
          KEY_I,
          read(KEY_I).filter((i) => i.book_id !== id)
        )
        await load()
        return { error: null }
      }
      await supabase.from('coord_inventory_items').delete().eq('book_id', id)
      const { error: err } = await supabase.from('coord_inventory_books').delete().eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [localMode, load]
  )

  const saveItem = useCallback(
    async (payload, id = null) => {
      if (!bookId) return { error: 'Cree o seleccione un inventario primero' }
      if (!payload.item_name?.trim()) return { error: 'Nombre del ítem obligatorio' }
      const row = {
        org_id: orgId,
        book_id: bookId,
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
        notes: payload.notes?.trim() || null,
        custom_label: payload.custom_label?.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (localMode) {
        const all = read(KEY_I)
        if (id) {
          const i = all.findIndex((x) => x.id === id)
          if (i >= 0) all[i] = { ...all[i], ...row, id }
        } else {
          all.push({ id: uid(), created_at: new Date().toISOString(), ...row })
        }
        write(KEY_I, all)
        await load()
        return { error: null, local: true }
      }

      if (id) {
        const { error: err } = await supabase
          .from('coord_inventory_items')
          .update(row)
          .eq('id', id)
        if (err) {
          if (isMissingOpsTable(err.message)) {
            setLocalMode(true)
            return saveItem(payload, id)
          }
          return { error: err.message }
        }
      } else {
        const { error: err } = await supabase.from('coord_inventory_items').insert(row)
        if (err) {
          if (isMissingOpsTable(err.message)) {
            setLocalMode(true)
            return saveItem(payload, null)
          }
          return { error: err.message }
        }
      }
      await load()
      return { error: null }
    },
    [bookId, orgId, localMode, load]
  )

  const adjustQty = useCallback(
    async (itemId, delta) => {
      const item = items.find((i) => i.id === itemId)
      if (!item) return { error: 'Ítem no encontrado' }
      const next = Number(item.qty_on_hand || 0) + Number(delta)
      if (localMode) {
        const all = read(KEY_I)
        const i = all.findIndex((x) => x.id === itemId)
        if (i >= 0) {
          all[i] = { ...all[i], qty_on_hand: next, updated_at: new Date().toISOString() }
          write(KEY_I, all)
        }
        await load()
        return { error: null }
      }
      const { error: err } = await supabase
        .from('coord_inventory_items')
        .update({ qty_on_hand: next, updated_at: new Date().toISOString() })
        .eq('id', itemId)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [items, localMode, load]
  )

  const removeItem = useCallback(
    async (id) => {
      if (localMode) {
        write(
          KEY_I,
          read(KEY_I).filter((x) => x.id !== id)
        )
        await load()
        return { error: null }
      }
      const { error: err } = await supabase.from('coord_inventory_items').delete().eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [localMode, load]
  )

  return {
    books: areaBooks,
    allBooks: books,
    items: activeItems,
    bookId,
    setBookId,
    loading,
    error,
    localMode,
    createBook,
    deleteBook,
    saveItem,
    adjustQty,
    removeItem,
    reload: load,
  }
}
