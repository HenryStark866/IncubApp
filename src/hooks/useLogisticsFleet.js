/**
 * =============================================================================
 * ARCHIVO: src/hooks/useLogisticsFleet.js
 * PROPÓSITO: Hook «useLogisticsFleet»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { gpsDeltaMeters } from '../lib/geoMap'
import {
  isMissingLogisticsTable,
  localContacts,
  localDeliveries,
  localDriverMessages,
  localDrivers,
  localRoutes,
} from '../lib/logisticsLocalStore'

/** Export «ROUTE_STATUS»: API pública de este módulo. Henry Stark Desarrollador */
export const ROUTE_STATUS = {
  planned: 'Planificada',
  en_route: 'En ruta',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

/** Export «DELIVERY_STATUS»: API pública de este módulo. Henry Stark Desarrollador */
export const DELIVERY_STATUS = {
  pending: 'Pendiente',
  departed: 'Salida reportada',
  arrived: 'Llegó',
  skipped: 'Omitida',
  cancelled: 'Cancelada',
}

/** Export «OPERATION_TYPES»: API pública de este módulo. Henry Stark Desarrollador */
export const OPERATION_TYPES = [
  { value: 'delivery', label: 'Entrega a cliente' },
  { value: 'pickup', label: 'Recogida' },
  { value: 'plant_return', label: 'Regreso a planta' },
  { value: 'transfer', label: 'Traslado' },
  { value: 'other', label: 'Otra' },
]

/** Export «CONTACT_KINDS»: API pública de este módulo. Henry Stark Desarrollador */
export const CONTACT_KINDS = [
  { value: 'mechanic', label: 'Mecánico' },
  { value: 'supplier', label: 'Proveedor' },
  { value: 'customer', label: 'Cliente' },
  { value: 'fuel', label: 'Combustible' },
  { value: 'other', label: 'Otro' },
]

/**
 * Flota logística: conductores, rutas, entregas, contactos, mensajes.
 * GPS en ruta + llegada automática a planta por geocerca.
 */
/** Export «useLogisticsFleet»: API pública de este módulo. Henry Stark Desarrollador */
export function useLogisticsFleet(orgId, userId) {
  const [drivers, setDrivers] = useState([])
  const [routes, setRoutes] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [contacts, setContacts] = useState([])
  const [messages, setMessages] = useState([])
  const [plants, setPlants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)

    const [d, r, del, c, p] = await Promise.all([
      supabase
        .from('logistics_drivers')
        .select('*')
        .eq('org_id', orgId)
        .order('full_name'),
      supabase
        .from('logistics_routes')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('logistics_deliveries')
        .select('*')
        .eq('org_id', orgId)
        .order('sequence'),
      supabase
        .from('logistics_contacts')
        .select('*')
        .eq('org_id', orgId)
        .order('name'),
      supabase
        .from('plants')
        .select('id, name, code, city, geo_origin_lat, geo_origin_lng')
        .eq('org_id', orgId),
    ])

    if (
      [d, r, del, c].some((x) => x.error && isMissingLogisticsTable(x.error.message))
    ) {
      setLocalMode(true)
      setDrivers(localDrivers.list(orgId))
      setRoutes(localRoutes.list(orgId))
      setDeliveries(localDeliveries.list(orgId))
      setContacts(localContacts.list(orgId))
      setPlants(p.data ?? [])
      setError(null)
      setLoading(false)
      return
    }

    if (d.error) setError(d.error.message)
    else {
      setLocalMode(false)
      setDrivers(d.data ?? [])
    }
    if (!r.error) setRoutes(r.data ?? [])
    if (!del.error) setDeliveries(del.data ?? [])
    if (!c.error) setContacts(c.data ?? [])
    if (!p.error) setPlants(p.data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  // ── Drivers CRUD ─────────────────────────────────────────
  const saveDriver = useCallback(
    async (payload, id = null) => {
      if (!payload.full_name?.trim()) return { error: 'Nombre del conductor obligatorio' }
      const row = {
        org_id: orgId,
        full_name: payload.full_name.trim(),
        phone: payload.phone?.trim() || null,
        license_id: payload.license_id?.trim() || null,
        vehicle: payload.vehicle?.trim() || null,
        plate: payload.plate?.trim() || null,
        user_id: payload.user_id || null,
        active: payload.active !== false,
        notes: payload.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (localMode) {
        if (id) localDrivers.update(id, row)
        else localDrivers.insert(row)
        await load()
        return { error: null, local: true }
      }
      if (id) {
        const { error: err } = await supabase.from('logistics_drivers').update(row).eq('id', id)
        if (err) {
          if (isMissingLogisticsTable(err.message)) {
            setLocalMode(true)
            return saveDriver(payload, id)
          }
          return { error: err.message }
        }
      } else {
        const { error: err } = await supabase.from('logistics_drivers').insert(row)
        if (err) {
          if (isMissingLogisticsTable(err.message)) {
            setLocalMode(true)
            return saveDriver(payload, null)
          }
          return { error: err.message }
        }
      }
      await load()
      return { error: null }
    },
    [orgId, localMode, load]
  )

  const deleteDriver = useCallback(
    async (id) => {
      if (localMode) {
        localDrivers.remove(id)
        await load()
        return { error: null }
      }
      const { error: err } = await supabase.from('logistics_drivers').delete().eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [localMode, load]
  )

  // ── Routes + deliveries ────────────────────────────────────
  const saveRoute = useCallback(
    async ({ name, driver_id, plant_id, notes, stops = [] }, id = null) => {
      if (!name?.trim()) return { error: 'Nombre de ruta obligatorio' }
      const plant = plants.find((p) => p.id === plant_id)
      const code = id
        ? routes.find((x) => x.id === id)?.code
        : `RUT-${Date.now().toString(36).toUpperCase()}`
      const row = {
        org_id: orgId,
        code,
        name: name.trim(),
        driver_id: driver_id || null,
        plant_id: plant_id || null,
        plant_lat: plant?.geo_origin_lat ?? null,
        plant_lng: plant?.geo_origin_lng ?? null,
        plant_radius_m: 150,
        notes: notes?.trim() || null,
        status: id ? undefined : 'planned',
        created_by: userId,
        updated_at: new Date().toISOString(),
      }
      // clean undefined
      Object.keys(row).forEach((k) => row[k] === undefined && delete row[k])

      if (localMode) {
        let routeId = id
        if (id) localRoutes.update(id, row)
        else {
          const rec = localRoutes.insert({ ...row, status: 'planned' })
          routeId = rec.id
        }
        if (stops.length && routeId) {
          localDeliveries.removeByRoute(routeId)
          stops.forEach((s, i) => {
            localDeliveries.insert({
              org_id: orgId,
              route_id: routeId,
              sequence: i + 1,
              operation_type: s.operation_type || 'delivery',
              label: s.label || `Parada ${i + 1}`,
              address: s.address || null,
              lat: s.lat ?? null,
              lng: s.lng ?? null,
              status: 'pending',
              customer_name: s.customer_name || null,
              remittance_id: s.remittance_id || null,
              notes: s.notes || null,
            })
          })
        }
        await load()
        return { error: null, local: true, routeId }
      }

      let routeId = id
      if (id) {
        const { error: err } = await supabase.from('logistics_routes').update(row).eq('id', id)
        if (err) {
          if (isMissingLogisticsTable(err.message)) {
            setLocalMode(true)
            return saveRoute({ name, driver_id, plant_id, notes, stops }, id)
          }
          return { error: err.message }
        }
      } else {
        const { data, error: err } = await supabase
          .from('logistics_routes')
          .insert({ ...row, status: 'planned' })
          .select('id')
          .single()
        if (err) {
          if (isMissingLogisticsTable(err.message)) {
            setLocalMode(true)
            return saveRoute({ name, driver_id, plant_id, notes, stops }, null)
          }
          return { error: err.message }
        }
        routeId = data.id
      }

      if (stops.length && routeId) {
        await supabase.from('logistics_deliveries').delete().eq('route_id', routeId)
        const rows = stops.map((s, i) => ({
          org_id: orgId,
          route_id: routeId,
          sequence: i + 1,
          operation_type: s.operation_type || 'delivery',
          label: s.label || `Parada ${i + 1}`,
          address: s.address || null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
          status: 'pending',
          customer_name: s.customer_name || null,
          remittance_id: s.remittance_id || null,
          notes: s.notes || null,
        }))
        await supabase.from('logistics_deliveries').insert(rows)
      }
      await load()
      return { error: null, routeId }
    },
    [orgId, userId, plants, routes, localMode, load]
  )

  const setRouteStatus = useCallback(
    async (routeId, status) => {
      const patch = {
        status,
        updated_at: new Date().toISOString(),
        started_at: status === 'en_route' ? new Date().toISOString() : undefined,
        ended_at:
          status === 'completed' || status === 'cancelled'
            ? new Date().toISOString()
            : undefined,
      }
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k])

      const route = routes.find((r) => r.id === routeId)
      if (localMode) {
        localRoutes.update(routeId, patch)
        if (route?.driver_id) {
          localDrivers.update(route.driver_id, {
            on_route: status === 'en_route',
          })
        }
        await load()
        return { error: null }
      }
      const { error: err } = await supabase
        .from('logistics_routes')
        .update(patch)
        .eq('id', routeId)
      if (err) return { error: err.message }
      if (route?.driver_id) {
        await supabase
          .from('logistics_drivers')
          .update({ on_route: status === 'en_route', updated_at: new Date().toISOString() })
          .eq('id', route.driver_id)
      }
      await load()
      return { error: null }
    },
    [routes, localMode, load]
  )

  const deleteRoute = useCallback(
    async (id) => {
      if (localMode) {
        localDeliveries.removeByRoute(id)
        localRoutes.remove(id)
        await load()
        return { error: null }
      }
      await supabase.from('logistics_deliveries').delete().eq('route_id', id)
      const { error: err } = await supabase.from('logistics_routes').delete().eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [localMode, load]
  )

  const reportDeparture = useCallback(
    async (deliveryId, notes) => {
      const patch = {
        status: 'departed',
        departed_at: new Date().toISOString(),
        notes: notes || undefined,
        updated_at: new Date().toISOString(),
      }
      if (localMode) {
        localDeliveries.update(deliveryId, patch)
        await load()
        return { error: null }
      }
      const { error: err } = await supabase
        .from('logistics_deliveries')
        .update(patch)
        .eq('id', deliveryId)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [localMode, load]
  )

  const markArrived = useCallback(
    async (deliveryId, source = 'manual') => {
      const patch = {
        status: 'arrived',
        arrived_at: new Date().toISOString(),
        notes:
          source === 'gps'
            ? 'Llegada automática por GPS'
            : undefined,
        updated_at: new Date().toISOString(),
      }
      if (localMode) {
        const prev = localDeliveries.list(orgId).find((d) => d.id === deliveryId)
        localDeliveries.update(deliveryId, {
          ...patch,
          notes:
            source === 'gps'
              ? [prev?.notes, 'Llegada automática por GPS'].filter(Boolean).join(' · ')
              : prev?.notes,
        })
        await load()
        return { error: null }
      }
      const { error: err } = await supabase
        .from('logistics_deliveries')
        .update(patch)
        .eq('id', deliveryId)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [orgId, localMode, load]
  )

  /** Actualiza GPS del conductor; si está en ruta, evalúa geocerca de planta y paradas */
  const updateDriverGps = useCallback(
    async (driverId, { lat, lng, accuracy, heading, speed }) => {
      if (lat == null || lng == null) return { error: 'Sin coordenadas' }
      const patch = {
        last_lat: lat,
        last_lng: lng,
        last_location_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      // columnas opcionales si existen en el futuro
      void accuracy
      void heading
      void speed
      if (localMode) {
        localDrivers.update(driverId, patch)
      } else {
        const { error: err } = await supabase
          .from('logistics_drivers')
          .update(patch)
          .eq('id', driverId)
        if (err && !isMissingLogisticsTable(err.message)) return { error: err.message }
        if (err && isMissingLogisticsTable(err.message)) {
          setLocalMode(true)
          localDrivers.update(driverId, patch)
        }
      }

      // Geocerca: rutas en_route de este conductor
      const activeRoutes = (localMode ? localRoutes.list(orgId) : routes).filter(
        (r) => r.driver_id === driverId && r.status === 'en_route'
      )
      const allDel = localMode ? localDeliveries.list(orgId) : deliveries

      for (const route of activeRoutes) {
        // Llegada a planta
        if (route.plant_lat != null && route.plant_lng != null) {
          const d = gpsDeltaMeters(
            { lat: route.plant_lat, lng: route.plant_lng },
            { lat, lng }
          )
          const radius = Number(route.plant_radius_m) || 150
          if (d && d.distance <= radius) {
            const plantStops = allDel.filter(
              (x) =>
                x.route_id === route.id &&
                x.operation_type === 'plant_return' &&
                x.status !== 'arrived'
            )
            for (const s of plantStops) {
              await markArrived(s.id, 'gps')
            }
            // Si todas las paradas llegaron, completar ruta
            const remaining = allDel.filter(
              (x) =>
                x.route_id === route.id &&
                !['arrived', 'skipped', 'cancelled'].includes(x.status)
            )
            if (remaining.length === 0 || plantStops.length) {
              // only auto-complete if all non-cancelled done
              const still = allDel.filter(
                (x) =>
                  x.route_id === route.id &&
                  x.status !== 'arrived' &&
                  x.status !== 'skipped' &&
                  x.status !== 'cancelled'
              )
              if (still.length === 0) {
                await setRouteStatus(route.id, 'completed')
              }
            }
          }
        }
        // Llegada a paradas con lat/lng
        for (const stop of allDel.filter(
          (x) =>
            x.route_id === route.id &&
            x.lat != null &&
            x.lng != null &&
            x.status !== 'arrived' &&
            x.status !== 'cancelled'
        )) {
          const d = gpsDeltaMeters({ lat: stop.lat, lng: stop.lng }, { lat, lng })
          if (d && d.distance <= 80) {
            await markArrived(stop.id, 'gps')
          }
        }
      }

      await load()
      return { error: null }
    },
    [orgId, routes, deliveries, localMode, load, markArrived, setRouteStatus]
  )

  // ── Contacts ─────────────────────────────────────────────
  const saveContact = useCallback(
    async (payload, id = null) => {
      if (!payload.name?.trim()) return { error: 'Nombre obligatorio' }
      const row = {
        org_id: orgId,
        name: payload.name.trim(),
        kind: payload.kind || 'other',
        phone: payload.phone?.trim() || null,
        email: payload.email?.trim() || null,
        city: payload.city?.trim() || null,
        notes: payload.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (localMode) {
        if (id) localContacts.update(id, row)
        else localContacts.insert(row)
        await load()
        return { error: null }
      }
      if (id) {
        const { error: err } = await supabase.from('logistics_contacts').update(row).eq('id', id)
        if (err) {
          if (isMissingLogisticsTable(err.message)) {
            setLocalMode(true)
            return saveContact(payload, id)
          }
          return { error: err.message }
        }
      } else {
        const { error: err } = await supabase.from('logistics_contacts').insert(row)
        if (err) {
          if (isMissingLogisticsTable(err.message)) {
            setLocalMode(true)
            return saveContact(payload, null)
          }
          return { error: err.message }
        }
      }
      await load()
      return { error: null }
    },
    [orgId, localMode, load]
  )

  const deleteContact = useCallback(
    async (id) => {
      if (localMode) {
        localContacts.remove(id)
        await load()
        return { error: null }
      }
      const { error: err } = await supabase.from('logistics_contacts').delete().eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [localMode, load]
  )

  // ── Driver messages ──────────────────────────────────────
  const loadMessages = useCallback(
    async (driverId) => {
      if (!orgId || !driverId) {
        setMessages([])
        return
      }
      if (localMode) {
        setMessages(localDriverMessages.list(orgId, driverId))
        return
      }
      const { data, error: err } = await supabase
        .from('logistics_driver_messages')
        .select('*')
        .eq('org_id', orgId)
        .eq('driver_id', driverId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (err) {
        if (isMissingLogisticsTable(err.message)) {
          setLocalMode(true)
          setMessages(localDriverMessages.list(orgId, driverId))
        }
        return
      }
      setMessages(data ?? [])
    },
    [orgId, localMode]
  )

  const sendDriverMessage = useCallback(
    async (driverId, body) => {
      if (!body?.trim()) return { error: 'Mensaje vacío' }
      const row = {
        org_id: orgId,
        driver_id: driverId,
        sender_id: userId,
        sender_role: 'logistics',
        body: body.trim(),
        created_at: new Date().toISOString(),
      }
      if (localMode) {
        localDriverMessages.insert(row)
        await loadMessages(driverId)
        return { error: null }
      }
      const { error: err } = await supabase.from('logistics_driver_messages').insert(row)
      if (err) {
        if (isMissingLogisticsTable(err.message)) {
          setLocalMode(true)
          localDriverMessages.insert(row)
          await loadMessages(driverId)
          return { error: null }
        }
        return { error: err.message }
      }
      await loadMessages(driverId)
      return { error: null }
    },
    [orgId, userId, localMode, loadMessages]
  )

  const deliveriesByRoute = useCallback(
    (routeId) =>
      deliveries
        .filter((d) => d.route_id === routeId)
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
    [deliveries]
  )

  const enRouteDrivers = useMemo(
    () => drivers.filter((d) => d.on_route || d.last_lat != null),
    [drivers]
  )

  const activeRoutes = useMemo(
    () => routes.filter((r) => r.status === 'en_route' || r.status === 'planned'),
    [routes]
  )

  return {
    drivers,
    routes,
    deliveries,
    contacts,
    messages,
    plants,
    loading,
    error,
    localMode,
    enRouteDrivers,
    activeRoutes,
    deliveriesByRoute,
    saveDriver,
    deleteDriver,
    saveRoute,
    setRouteStatus,
    deleteRoute,
    reportDeparture,
    markArrived,
    updateDriverGps,
    saveContact,
    deleteContact,
    loadMessages,
    sendDriverMessage,
    reload: load,
  }
}
