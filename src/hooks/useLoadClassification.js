/**
 * Clasificación por cinta de color + mapas de cargue Petersime + flujo de aprobación.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uniqueChannel } from '../lib/realtimeChannel'
import {
  localListTape,
  localInsertTape,
  localUpdateTape,
  localDeleteTape,
  localListMaps,
  localInsertMap,
  localUpdateMap,
} from '../lib/loadClassificationLocalStore'
import {
  normalizeCart,
  buildLoadMap,
  buildLoadGroups,
  renderLoadMapImage,
  summarizeClassification,
  CARTS_PER_MACHINE,
  TRAYS_PER_CART,
  tapeById,
} from '../lib/loadMapEngine'
import { showBrowserNotification } from '../lib/browserNotify'

function missingTable(msg) {
  return /does not exist|schema cache|Could not find|relation|PGRST205|column/i.test(
    String(msg || '')
  )
}

function uid() {
  return `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// Bucket privado compartido con las rondas; el mapa va en su propia carpeta.
// El primer tramo TIENE que ser el org_id: de ahí cuelgan las políticas RLS.
const CARPETA_MAPAS = 'load-maps'

/**
 * Guarda el PNG del mapa en el bucket y devuelve su ruta.
 * Si falla, devuelve null: que no se pueda archivar la imagen no es razón para
 * perder el mapa, que es lo que de verdad importa.
 */
async function uploadMapImage(orgId, mapId, blob) {
  const path = `${orgId}/${CARPETA_MAPAS}/${mapId}.png`
  const { error } = await supabase.storage
    .from('machine-checks')
    .upload(path, blob, { contentType: 'image/png', upsert: true })
  if (error) {
    console.warn('uploadMapImage', error.message)
    return null
  }
  return path
}

/**
 * Cambia las rutas guardadas por URL firmadas, para poder pintar las imágenes
 * de mapas que se generaron en otra sesión (o en otro equipo).
 */
async function signMapImages(lista) {
  const pendientes = lista.filter((m) => m.imagePath && !m.imageDataUrl)
  if (!pendientes.length) return lista
  const { data } = await supabase.storage
    .from('machine-checks')
    .createSignedUrls(pendientes.map((m) => m.imagePath), 3600)
  if (!data) return lista
  const porRuta = new Map(data.map((d) => [d.path, d.signedUrl]))
  return lista.map((m) =>
    m.imagePath && !m.imageDataUrl
      ? { ...m, imageDataUrl: porRuta.get(m.imagePath) || null }
      : m
  )
}

async function backfillMapImages(orgId, lista) {
  const pending = lista.filter((map) => !map.imagePath && !map.imageDataUrl && map.slots?.length);
  if (!pending.length) return lista;

  const completed = await Promise.all(pending.map(async (map) => {
    try {
      const rendered = await renderLoadMapImage(map);
      if (!rendered?.blob) return map;
      const imagePath = await uploadMapImage(orgId, map.id, rendered.blob);
      if (!imagePath) return map;

      const payload = { ...(map.payload || {}), imagePath };
      const { error } = await supabase
        .from('load_maps')
        .update({ image_path: imagePath, payload })
        .eq('id', map.id)
        .eq('org_id', orgId);
      if (error) {
        console.warn('backfillMapImages update', error.message);
        return map;
      }
      return { ...map, imagePath, payload };
    } catch (error) {
      console.warn('backfillMapImages render', error);
      return map;
    }
  }));

  const completedById = new Map(completed.map((map) => [map.id, map]));
  return lista.map((map) => completedById.get(map.id) || map);
}

export function useLoadClassification(orgId, userId) {
  const [entries, setEntries] = useState([])
  const [maps, setMaps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)

    // Intentar cloud
    const [eRes, mRes] = await Promise.all([
      supabase
        .from('egg_tape_classifications')
        .select('*')
        .eq('org_id', orgId)
        .order('classified_at', { ascending: false })
        .limit(500),
      supabase
        .from('load_maps')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (eRes.error && missingTable(eRes.error.message)) {
      setLocalMode(true)
      setEntries(localListTape(orgId).map(normalizeCart))
      setMaps(localListMaps(orgId))
      setLoading(false)
      return
    }

    if (eRes.error) {
      setError(eRes.error.message)
      setEntries(localListTape(orgId).map(normalizeCart))
      setLocalMode(true)
    } else {
      setLocalMode(false)
      setEntries(
        (eRes.data || []).map((r) =>
          normalizeCart({
            id: r.id,
            // `lots` (jsonb) es el formato actual; las columnas planas quedan
            // como respaldo de los registros creados antes del multi-lote.
            lots: Array.isArray(r.lots) && r.lots.length ? r.lots : null,
            kind: r.kind,
            isTreated: r.is_treated || r.kind === 'tratado',
            lot: r.lot,
            colorPrimary: r.color_primary,
            colorSecondary: r.color_secondary,
            trays: r.trays,
            productionDate: r.production_date,
            weightKg: r.weight_kg,
            color: r.cart_color,
            colorName: r.cart_color_name,
            cartLabel: r.cart_label,
            cartNumber: r.cart_number || r.cart_label,
            notes: r.notes,
            classifiedAt: r.classified_at,
            classifiedBy: r.classified_by,
            status: r.status,
            loadGroup: r.load_group,
          })
        )
      )
    }

    if (mRes.error && missingTable(mRes.error.message)) {
      setMaps(localListMaps(orgId))
    } else if (mRes.error) {
      setMaps(localListMaps(orgId))
    } else {
      const lista = (mRes.data || []).map((r) => ({
        id: r.id,
        ...((r.payload && typeof r.payload === 'object' ? r.payload : {}) || {}),
        status: r.status || r.payload?.status || 'draft',
        machineId: r.machine_id || r.payload?.machineId,
        machineName: r.machine_name || r.payload?.machineName,
        plantId: r.plant_id || r.payload?.plantId,
        createdAt: r.created_at || r.payload?.createdAt,
        imagePath: r.image_path || r.payload?.imagePath || null,
        imageDataUrl: r.payload?.imageDataUrl || null,
        approvedAt: r.approved_at,
        approvedBy: r.approved_by,
        orderedAt: r.ordered_at,
        orderedBy: r.ordered_by,
        rejectedReason: r.rejected_reason,
      }))
      const withImages = await backfillMapImages(orgId, lista)
      setMaps(withImages)
      // Las URL firmadas se piden aparte para no demorar el pintado de la lista.
      signMapImages(withImages)
        .then((con) => setMaps((prev) => (prev.length === con.length ? con : prev)))
        .catch((e) => console.warn('signMapImages', e))
    }
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Actualizaciones en vivo: carros clasificados y mapas entre dispositivos
  // (recepción, coordinación y operario ven lo mismo sin recargar).
  useEffect(() => {
    if (!orgId || localMode) return
    const ch = supabase
      .channel(uniqueChannel(`load-class:${orgId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'egg_tape_classifications', filter: `org_id=eq.${orgId}` },
        () => loadAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'load_maps', filter: `org_id=eq.${orgId}` },
        () => loadAll()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [orgId, localMode, loadAll])

  const available = useMemo(
    () => entries.filter((e) => e.status === 'available' || !e.status),
    [entries]
  )

  const summary = useMemo(() => summarizeClassification(available), [available])

  /** Carros disponibles agrupados en cargues de 12 (FIFO por fecha) */
  const groups = useMemo(() => buildLoadGroups(available), [available])

  /** Fila de Supabase a partir de un carro normalizado */
  const cartRow = useCallback(
    (cart) => {
      const main = cart.lots[0] || {}
      return {
        id: cart.id,
        org_id: orgId,
        lots: cart.lots,
        // Columnas planas del lote principal: mantienen legibles los reportes SQL
        kind: cart.isMixed ? 'multi_lote' : main.isTreated ? 'tratado' : 'normal',
        is_treated: cart.isTreated,
        lot: main.lot || null,
        color_primary: main.colorPrimary,
        color_secondary: main.colorSecondary,
        trays: cart.trays,
        eggs: cart.eggs,
        production_date: cart.productionDate,
        weight_kg: cart.weightKg,
        cart_color: cart.color,
        cart_color_name: cart.colorName,
        cart_label: cart.cartLabel || null,
        cart_number: cart.cartNumber || null,
        notes: cart.notes || null,
        classified_at: cart.classifiedAt,
        classified_by: cart.classifiedBy || userId,
        status: cart.status || 'available',
        load_group: cart.loadGroup ?? null,
      }
    },
    [orgId, userId]
  )

  /** Valida un carro antes de guardar. Devuelve mensaje de error o null. */
  const validateCart = useCallback((cart) => {
    if (!cart.cartNumber && !cart.cartLabel) {
      return 'El número del carro es obligatorio (el operario lo usa en el mapa)'
    }
    if (!cart.lots.length) return 'Agregue al menos un lote al carro'
    for (const l of cart.lots) {
      if (!l.lot) return 'Cada lote del carro necesita su número de lote'
      if (!l.isTreated) {
        if (!l.productionDate) return `Lote ${l.lot}: falta la fecha de producción`
        if (!l.trays || l.trays < 1) return `Lote ${l.lot}: indique la cantidad de bandejas`
      }
    }
    if (cart.trays > TRAYS_PER_CART) {
      return `El carro suma ${cart.trays} bandejas y el máximo es ${TRAYS_PER_CART}. Reparta los lotes en otro carro.`
    }
    return null
  }, [])

  /**
   * Registra un carro con uno o varios lotes.
   * `raw.lots` es un arreglo; también acepta el formato plano de un solo lote.
   */
  const addEntry = useCallback(
    async (raw) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      const entry = normalizeCart({
        ...raw,
        id: uid(),
        classifiedAt: new Date().toISOString(),
        classifiedBy: userId,
        status: 'available',
      })

      const invalid = validateCart(entry)
      if (invalid) return { error: invalid }

      // El número de carro no se puede repetir mientras siga disponible
      const dup = available.find(
        (c) => String(c.cartNumber) === String(entry.cartNumber) && c.id !== entry.id
      )
      if (dup) {
        return {
          error: `El carro ${entry.cartNumber} ya está registrado y disponible. Use «Agregar lote» sobre ese carro o cambie el número.`,
        }
      }

      if (localMode) {
        localInsertTape(orgId, entry)
        setEntries((list) => [entry, ...list])
        return { error: null, entry }
      }

      const { error: err } = await supabase
        .from('egg_tape_classifications')
        .insert(cartRow(entry))
      if (err) {
        if (missingTable(err.message)) {
          setLocalMode(true)
          localInsertTape(orgId, entry)
          setEntries((list) => [entry, ...list])
          return { error: null, entry, local: true }
        }
        return { error: err.message }
      }
      setEntries((list) => [entry, ...list])
      return { error: null, entry }
    },
    [orgId, userId, localMode, available, cartRow, validateCart]
  )

  /** Agrega un lote adicional a un carro ya registrado (mitad y mitad, mezclas). */
  const addLotToCart = useCallback(
    async (cartId, rawLot) => {
      const cart = entries.find((c) => c.id === cartId)
      if (!cart) return { error: 'Carro no encontrado' }
      if (cart.status !== 'available') {
        return { error: 'Solo se pueden editar carros disponibles (no reservados ni cargados)' }
      }

      const next = normalizeCart({
        ...cart,
        lots: [...cart.lots, rawLot],
      })
      const invalid = validateCart(next)
      if (invalid) return { error: invalid }

      setEntries((list) => list.map((c) => (c.id === cartId ? next : c)))

      if (localMode) {
        localUpdateTape(orgId, cartId, next)
        return { error: null, entry: next }
      }
      const { error: err } = await supabase
        .from('egg_tape_classifications')
        .update(cartRow(next))
        .eq('id', cartId)
      if (err) {
        if (missingTable(err.message)) {
          setLocalMode(true)
          localUpdateTape(orgId, cartId, next)
          return { error: null, entry: next, local: true }
        }
        // Revertir el estado optimista
        setEntries((list) => list.map((c) => (c.id === cartId ? cart : c)))
        return { error: err.message }
      }
      return { error: null, entry: next }
    },
    [entries, orgId, localMode, cartRow, validateCart]
  )

  /** Quita un lote de un carro (si es el último, el carro queda vacío → se elimina) */
  const removeLotFromCart = useCallback(
    async (cartId, lotId) => {
      const cart = entries.find((c) => c.id === cartId)
      if (!cart) return { error: 'Carro no encontrado' }
      const remaining = cart.lots.filter((l) => l.id !== lotId)
      if (!remaining.length) {
        return { error: 'El carro debe conservar al menos un lote. Elimine el carro completo.' }
      }
      const next = normalizeCart({ ...cart, lots: remaining })
      setEntries((list) => list.map((c) => (c.id === cartId ? next : c)))

      if (localMode) {
        localUpdateTape(orgId, cartId, next)
        return { error: null, entry: next }
      }
      const { error: err } = await supabase
        .from('egg_tape_classifications')
        .update(cartRow(next))
        .eq('id', cartId)
      if (err && !missingTable(err.message)) {
        setEntries((list) => list.map((c) => (c.id === cartId ? cart : c)))
        return { error: err.message }
      }
      if (err) {
        setLocalMode(true)
        localUpdateTape(orgId, cartId, next)
      }
      return { error: null, entry: next }
    },
    [entries, orgId, localMode, cartRow]
  )

  /**
   * Color del CARGUE: el encargado de clasificar pinta los 12 carros de un
   * grupo con el mismo color para diferenciar un cargue de otro en cuarto frío.
   */
  const setGroupColor = useCallback(
    async (groupIndex, color, colorName = null) => {
      const group = groups[groupIndex]
      if (!group?.carts?.length) return { error: 'Cargue sin carros' }
      const ids = group.carts.map((c) => c.id).filter(Boolean)
      const prev = entries

      setEntries((list) =>
        list.map((c) =>
          ids.includes(c.id)
            ? normalizeCart({ ...c, color, colorName, loadGroup: groupIndex })
            : c
        )
      )

      if (localMode) {
        for (const id of ids) {
          const cart = group.carts.find((c) => c.id === id)
          localUpdateTape(orgId, id, { ...cart, color, colorName, loadGroup: groupIndex })
        }
        return { error: null }
      }
      const { error: err } = await supabase
        .from('egg_tape_classifications')
        .update({ cart_color: color, cart_color_name: colorName, load_group: groupIndex })
        .in('id', ids)
      if (err && missingTable(err.message)) {
        setLocalMode(true)
        for (const id of ids) {
          const cart = group.carts.find((c) => c.id === id)
          localUpdateTape(orgId, id, { ...cart, color, colorName, loadGroup: groupIndex })
        }
        return { error: null }
      }
      if (err) {
        setEntries(prev)
        return { error: err.message }
      }
      return { error: null }
    },
    [groups, entries, orgId, localMode]
  )

  /** Cambia el color libre del carro (hex) */
  const setCartColor = useCallback(
    async (cartId, color, colorName) => {
      const cart = entries.find((c) => c.id === cartId)
      if (!cart) return { error: 'Carro no encontrado' }
      const next = normalizeCart({ ...cart, color, colorName: colorName ?? cart.colorName })
      setEntries((list) => list.map((c) => (c.id === cartId ? next : c)))

      if (localMode) {
        localUpdateTape(orgId, cartId, next)
        return { error: null }
      }
      const { error: err } = await supabase
        .from('egg_tape_classifications')
        .update({ cart_color: next.color, cart_color_name: next.colorName })
        .eq('id', cartId)
      if (err && missingTable(err.message)) {
        setLocalMode(true)
        localUpdateTape(orgId, cartId, next)
        return { error: null }
      }
      if (err) {
        setEntries((list) => list.map((c) => (c.id === cartId ? cart : c)))
        return { error: err.message }
      }
      return { error: null }
    },
    [entries, orgId, localMode]
  )

  const removeEntry = useCallback(
    async (id) => {
      if (localMode) {
        localDeleteTape(orgId, id)
        setEntries((list) => list.filter((e) => e.id !== id))
        return { error: null }
      }
      const { error: err } = await supabase.from('egg_tape_classifications').delete().eq('id', id)
      if (err) {
        if (missingTable(err.message)) {
          localDeleteTape(orgId, id)
          setEntries((list) => list.filter((e) => e.id !== id))
          return { error: null }
        }
        return { error: err.message }
      }
      setEntries((list) => list.filter((e) => e.id !== id))
      return { error: null }
    },
    [orgId, localMode]
  )

  const setEntriesStatus = useCallback(
    async (ids, status) => {
      if (!ids?.length) return
      setEntries((list) => list.map((e) => (ids.includes(e.id) ? { ...e, status } : e)))
      for (const id of ids) {
        if (localMode) localUpdateTape(orgId, id, { status })
        else {
          await supabase.from('egg_tape_classifications').update({ status }).eq('id', id)
        }
      }
    },
    [orgId, localMode]
  )

  /**
   * Payload liviano para BD / localStorage.
   * Se conserva la imagen para que el centro de activos pueda renderizar la
   * vista previa desde el fallback local incluso cuando la tabla remota está vacía.
   */
  const slimMapForStorage = useCallback((map) => {
    if (!map) return map
    const slots = (map.slots || []).map((s) => {
      if (!s?.entry) return { ...s, entry: null }
      const e = s.entry
      return {
        ...s,
        entry: {
          id: e.id,
          cartNumber: e.cartNumber,
          cartLabel: e.cartLabel,
          color: e.color,
          colorName: e.colorName,
          trays: e.trays,
          eggs: e.eggs,
          productionDate: e.productionDate,
          heat: e.heat || null,
          lots: (e.lots || []).map((l) => ({
            id: l.id,
            lot: l.lot,
            isTreated: l.isTreated,
            colorPrimary: l.colorPrimary,
            colorSecondary: l.colorSecondary,
            trays: l.trays,
            eggs: l.eggs,
            productionDate: l.productionDate,
            weightKg: l.weightKg,
            eggType: l.eggType,
          })),
          status: e.status,
        },
      }
    })
    const { imageDataUrl: _img, ...rest } = map
    return { ...rest, slots, imageDataUrl: map.imageDataUrl || null, imagePath: map.imagePath || null }
  }, [])

  /**
   * Genera mapa, imagen, y opcionalmente envía a aprobación.
   */
  const generateMap = useCallback(
    async ({
      machineId,
      machineName,
      plantId,
      submitForApproval = false,
      groupIndex = 0,
      flockRegistry = {},
    } = {}) => {
      try {
        if (!orgId || !userId) return { error: 'Sesión inválida' }
        if (available.length < 1) {
          return { error: 'No hay carros clasificados disponibles para armar el mapa' }
        }

        const group = groups[groupIndex]
        if (!group?.carts?.length) {
          return {
            error:
              'No hay cargue para armar. Registre carros en «Clasificar» y vuelva a intentar.',
          }
        }

        const map = buildLoadMap(group.carts, {
          machineId,
          machineName,
          plantId,
          groupIndex,
          flockRegistry,
        })
        map.id = uid()
        map.createdBy = userId
        map.status = submitForApproval ? 'pending_approval' : 'draft'

        // La imagen no va en el JSON de la BD —son ~300 KB por mapa y el
        // payload ya es grande—, sino al bucket privado. En memoria se conserva
        // el dataURL para pintarla de una vez, sin esperar la URL firmada.
        try {
          const img = await renderLoadMapImage(map)
          map.imageDataUrl = img?.dataUrl || null
          if (img?.blob && !localMode) {
            map.imagePath = await uploadMapImage(orgId, map.id, img.blob)
          }
        } catch (e) {
          console.warn('renderLoadMapImage', e)
          map.imageDataUrl = null
        }

        const usedIds = (map.slots || []).map((s) => s.entry?.id).filter(Boolean)
        map.cartIds = usedIds
        await setEntriesStatus(usedIds, 'reserved')

        const stored = slimMapForStorage(map)

        const finishLocal = () => {
          try {
            localInsertMap(orgId, stored)
          } catch (e) {
            console.warn('localInsertMap', e)
          }
          // En UI sí tenemos la imagen generada
          setMaps((list) => [map, ...list.filter((m) => m.id !== map.id)])
          return { error: null, map, local: true }
        }

        if (localMode) {
          const r = finishLocal()
          if (submitForApproval) {
            showBrowserNotification({
              title: 'Mapa de cargue pendiente',
              body: `${machineName || 'Petersime'}: ${map.summary?.totalEggs || 0} huevos · aprobar en Cargue`,
              tag: `loadmap-${map.id}`,
            })
            try {
              await supabase.from('notifications').insert({
                org_id: orgId,
                title: 'Mapa de cargue pendiente de aprobación',
                body: `${machineName || 'Máquina'}: ${(map.summary?.totalEggs || 0).toLocaleString('es-CO')} huevos · ${map.summary?.cartCount || 0} carros. Revisar en Cargue.`,
                kind: 'load_map',
                created_by: userId,
              })
            } catch {
              /* */
            }
          }
          return r
        }

        const { error: err } = await supabase.from('load_maps').insert({
          id: map.id,
          org_id: orgId,
          machine_id: machineId || null,
          machine_name: machineName || null,
          plant_id: plantId || null,
          status: map.status,
          payload: stored,
          image_path: map.imagePath || null,
          created_by: userId,
          created_at: map.createdAt,
        })
        if (err) {
          if (missingTable(err.message) || /payload|too large|413|timeout|statement/i.test(err.message || '')) {
            setLocalMode(true)
            return finishLocal()
          }
          await setEntriesStatus(usedIds, 'available')
          return { error: err.message || 'No se pudo guardar el mapa' }
        }

        localInsertMap(orgId, stored)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('incubapp:load-maps-updated', { detail: { orgId, mapId: map.id, status: map.status } }))
        }

        setMaps((list) => [map, ...list.filter((m) => m.id !== map.id)])

        if (submitForApproval) {
          showBrowserNotification({
            title: 'Mapa de cargue pendiente',
            body: `Aprobar mapa · ${machineName || 'Petersime'}`,
            tag: `loadmap-${map.id}`,
          })
          try {
            await supabase.from('notifications').insert({
              org_id: orgId,
              title: 'Mapa de cargue pendiente de aprobación',
              body: `${machineName || 'Máquina'}: ${(map.summary?.totalEggs || 0).toLocaleString('es-CO')} huevos. Revisar en Cargue.`,
              kind: 'load_map',
              created_by: userId,
            })
          } catch {
            /* */
          }
        }
        return { error: null, map }
      } catch (e) {
        console.error('generateMap', e)
        return { error: e?.message || 'Error al generar el mapa de cargue' }
      }
    },
    [orgId, userId, available, groups, localMode, setEntriesStatus, slimMapForStorage]
  )

  const updateMapStatus = useCallback(
    async (mapId, status, extra = {}) => {
      const patch = {
        status,
        ...extra,
      }
      if (status === 'completed') {
        patch.loaded_at = new Date().toISOString()
        patch.loaded_by = userId
      }
      setMaps((list) => list.map((m) => (m.id === mapId ? { ...m, ...patch } : m)))

      const map = maps.find((m) => m.id === mapId) || localListMaps(orgId).find((m) => m.id === mapId)

      // Guardar SIEMPRE en almacenamiento local para asegurar sincronización con Centro de Activos
      localUpdateMap(orgId, mapId, patch)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('incubapp:load-maps-updated', { detail: { orgId, mapId, status } }))
      }

      if (!localMode) {
        const payload = { ...(map || {}), ...patch }
        const dbPatch = {
          status,
          payload,
          machine_id: extra.machineId || map?.machineId || undefined,
          machine_name: extra.machineName || map?.machineName || undefined,
          plant_id: extra.plantId || map?.plantId || undefined,
          approved_at: status === 'approved' ? new Date().toISOString() : undefined,
          approved_by: status === 'approved' ? userId : undefined,
          ordered_at: status === 'ordered' ? new Date().toISOString() : undefined,
          ordered_by: status === 'ordered' ? userId : undefined,
          loaded_at: status === 'completed' ? new Date().toISOString() : undefined,
          loaded_by: status === 'completed' ? userId : undefined,
          rejected_reason: extra.rejectedReason || null,
        }
        Object.keys(dbPatch).forEach((k) => dbPatch[k] === undefined && delete dbPatch[k])
        const { error: err } = await supabase.from('load_maps').update(dbPatch).eq('id', mapId)
        if (err && missingTable(err.message)) {
          setLocalMode(true)
        } else if (err) {
          return { error: err.message }
        }
      }

      // Liberar carros si se rechaza o cancela
      if (status === 'rejected' || status === 'cancelled') {
        const ids = map?.cartIds || map?.slots?.map((s) => s.entry?.id).filter(Boolean) || []
        await setEntriesStatus(ids, 'available')
      }
      if (status === 'completed' || status === 'ordered') {
        const ids = map?.cartIds || map?.slots?.map((s) => s.entry?.id).filter(Boolean) || []
        if (status === 'completed') {
          await setEntriesStatus(ids, 'loaded')

          // Insertar en setter_loads para cada lote único en el mapa de cargue
          const uniqueLotsMap = new Map()
          const slots = map?.slots || []
          for (const slot of slots) {
            if (!slot.entry) continue
            const entry = slot.entry
            const lotsList = Array.isArray(entry.lots) && entry.lots.length ? entry.lots : [entry]
            for (const l of lotsList) {
              if (!l.lot) continue
              const lotCode = String(l.lot).trim()
              if (!uniqueLotsMap.has(lotCode)) {
                uniqueLotsMap.set(lotCode, {
                  lot: lotCode,
                  colorPrimary: l.colorPrimary,
                })
              }
            }
          }

          const rows = []
          for (const [lotCode, info] of uniqueLotsMap.entries()) {
            const tape = info.colorPrimary ? tapeById(info.colorPrimary) : null
            rows.push({
              org_id: orgId,
              plant_id: extra.plantId || map?.plantId || null,
              machine_id: extra.machineId || map?.machineId || null,
              lote: lotCode,
              loaded_at: extra.loadedAt || new Date().toISOString(),
              cycle_start_at: extra.cycleStartAt || extra.loadedAt || new Date().toISOString(),
              tape_color: tape?.hex || null,
              tape_color_name: tape?.label || null,
              created_by: userId,
            })
          }

          if (rows.length > 0 && !localMode) {
            const { error: insErr } = await supabase.from('setter_loads').insert(rows)
            if (insErr) {
              console.error('Error inserting setter_loads:', insErr.message)
            }
          }
        }
      }

      if (status === 'approved' || status === 'ordered') {
        const title =
          status === 'approved'
            ? 'Mapa de cargue APROBADO'
            : 'ORDEN DE CARGUE — ejecutar en turno'
        const body =
          status === 'approved'
            ? `${map?.machineName || 'Petersime'}: mapa aprobado por producción. ` +
            'Operario de turno: ejecutar el cargue y registrarlo con las dos fotos.'
            : `${map?.machineName || 'Petersime'}: ubicar carros según mapa aprobado.`
        showBrowserNotification({ title, body, tag: `loadmap-${mapId}-${status}` })
        try {
          await supabase.from('notifications').insert({
            org_id: orgId,
            title,
            body,
            kind: 'load_order',
            created_by: userId,
          })
        } catch {
          /* */
        }
      }

      return { error: null }
    },
    [orgId, userId, maps, localMode, setEntriesStatus]
  )

  /**
   * Primera máquina libre para recibir un cargue.
   *
   * «Libre» lo decide la vista ocupacion_maquinas: sin cargue vigente o con más
   * de 21 días desde el último, que es cuando el ciclo ya terminó. Se descartan
   * además las que ya están comprometidas en otro mapa aprobado y sin cargar,
   * para no mandar dos cargues a la misma incubadora.
   */
  const buscarMaquinaLibre = useCallback(
    async (tipo = 'setter') => {
      if (!orgId) return null
      const { data: libres, error: errLibres } = await supabase
        .from('ocupacion_maquinas')
        .select('machine_id, code, tipo, ocupacion')
        .eq('org_id', orgId)
        .eq('tipo', tipo)
        .eq('ocupacion', 'libre')
        .order('code', { ascending: true })
      if (errLibres || !libres?.length) return null

      const { data: comprometidas } = await supabase
        .from('load_maps')
        .select('machine_id')
        .eq('org_id', orgId)
        .in('status', ['approved', 'ordered'])
        .not('machine_id', 'is', null)
      const ocupadasYa = new Set((comprometidas || []).map((m) => m.machine_id))

      const elegida = libres.find((m) => !ocupadasYa.has(m.machine_id))
      if (!elegida) return null

      const { data: maq } = await supabase
        .from('machines')
        .select('id, code, name, plant_id, room_id')
        .eq('id', elegida.machine_id)
        .single()
      return maq
        ? { id: maq.id, code: maq.code, name: `${maq.name} (${maq.code})`, plantId: maq.plant_id }
        : null
    },
    [orgId]
  )

  /**
   * Aprueba el mapa. Si viene sin máquina —desde septiembre los mapas se
   * generaban así y el cargue quedaba sin destino registrado— se le asigna la
   * primera libre antes de aprobarlo.
   */
  const approveMap = useCallback(
    async (mapId) => {
      const mapa = maps.find((m) => m.id === mapId)
      let asignada = null
      if (mapa && !mapa.machineId) {
        asignada = await buscarMaquinaLibre('setter')
        if (asignada) {
          const { error: errAsig } = await supabase
            .from('load_maps')
            .update({ machine_id: asignada.id, machine_name: asignada.name })
            .eq('id', mapId)
          if (errAsig) return { error: `No se pudo asignar la incubadora: ${errAsig.message}` }
          setMaps((list) =>
            list.map((m) =>
              m.id === mapId ? { ...m, machineId: asignada.id, machineName: asignada.name } : m
            )
          )
        }
      }
      const res = await updateMapStatus(mapId, 'approved', {
        approvedAt: new Date().toISOString(),
        approvedBy: userId,
      })
      return asignada ? { ...res, asignada: asignada.name } : res
    },
    [updateMapStatus, userId, maps, buscarMaquinaLibre]
  )

  const rejectMap = useCallback(
    (mapId, reason) =>
      updateMapStatus(mapId, 'rejected', {
        rejectedReason: reason || 'Rechazado por coordinación',
      }),
    [updateMapStatus]
  )

  const orderLoad = useCallback(
    (mapId) =>
      updateMapStatus(mapId, 'ordered', {
        orderedAt: new Date().toISOString(),
        orderedBy: userId,
      }),
    [updateMapStatus, userId]
  )

  const completeLoad = useCallback(
    (mapId, extra) => updateMapStatus(mapId, 'completed', extra),
    [updateMapStatus]
  )

  return {
    entries,
    available,
    groups,
    maps,
    summary,
    loading,
    error,
    localMode,
    cartsPerMachine: CARTS_PER_MACHINE,
    traysPerCart: TRAYS_PER_CART,
    reload: loadAll,
    addEntry,
    addLotToCart,
    removeLotFromCart,
    setCartColor,
    setGroupColor,
    removeEntry,
    generateMap,
    approveMap,
    rejectMap,
    orderLoad,
    completeLoad,
  }
}
