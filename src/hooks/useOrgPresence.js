/**
 * =============================================================================
 * ARCHIVO: src/hooks/useOrgPresence.js
 * PROPÓSITO: Hook «useOrgPresence»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/roles'

const LOC_KEY = 'incubapp_share_location'
const HEARTBEAT_MS = 25_000
const ONLINE_WINDOW_MS = 120_000 // 2 min

/**
 * Presencia en línea + geolocalización por organización.
 * - Canal Realtime Presence (instantáneo entre pestañas abiertas)
 * - Heartbeat opcional a public.member_presence (si existe la tabla)
 * - Ubicación del navegador solo si el usuario activa "Compartir ubicación"
 */
/** Export «useOrgPresence»: API pública de este módulo. Henry Stark Desarrollador */
export function useOrgPresence({ orgId, userId, role, area, userName, forceLocation = false }) {
  const [peers, setPeers] = useState([])
  // Ubicación compartida: opcional (no bloquea el ingreso a la app)
  const [shareLocation, setShareLocationState] = useState(() => {
    if (forceLocation) return true
    try {
      return localStorage.getItem(LOC_KEY) === '1'
    } catch {
      return false
    }
  })
  const [geoStatus, setGeoStatus] = useState('idle') // idle | prompting | granted | denied | unsupported | error
  const [myLocation, setMyLocation] = useState(null) // { lat, lng, accuracy, at }
  const [tableAvailable, setTableAvailable] = useState(null) // null | true | false
  const channelRef = useRef(null)
  const locationRef = useRef(null)
  const shareRef = useRef(shareLocation)

  useEffect(() => {
    shareRef.current = shareLocation
  }, [shareLocation])
  useEffect(() => {
    locationRef.current = myLocation
  }, [myLocation])

  const setShareLocation = useCallback((on) => {
    // Con forceLocation no se permite apagar
    if (forceLocation && !on) return
    setShareLocationState(!!on)
    try {
      localStorage.setItem(LOC_KEY, on ? '1' : '0')
    } catch {
      /* */
    }
    if (!on) {
      setMyLocation(null)
      locationRef.current = null
      setGeoStatus('idle')
    }
  }, [forceLocation])

  // Forzar ON si la política lo exige
  useEffect(() => {
    if (forceLocation && !shareLocation) {
      setShareLocationState(true)
      try {
        localStorage.setItem(LOC_KEY, '1')
      } catch {
        /* */
      }
    }
  }, [forceLocation, shareLocation])

  const buildPayload = useCallback(() => {
    const loc = shareRef.current ? locationRef.current : null
    return {
      user_id: userId,
      name: userName || 'Usuario',
      role: role || null,
      area: area || null,
      role_label: ROLE_LABEL[role] || role || '—',
      online_at: new Date().toISOString(),
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      accuracy: loc?.accuracy ?? null,
      location_at: loc?.at ?? null,
    }
  }, [userId, userName, role, area])

  const trackPresence = useCallback(async () => {
    const ch = channelRef.current
    if (!ch || !userId) return
    try {
      await ch.track(buildPayload())
    } catch {
      /* canal aún no listo */
    }
  }, [userId, buildPayload])

  const upsertDbHeartbeat = useCallback(async () => {
    if (!orgId || !userId || tableAvailable === false) return
    const loc = shareRef.current ? locationRef.current : null
    const row = {
      org_id: orgId,
      user_id: userId,
      last_seen_at: new Date().toISOString(),
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      accuracy_m: loc?.accuracy ?? null,
      location_at: loc?.at ?? null,
      display_name: userName || null,
      role: role || null,
      area: area || null,
    }
    const { error } = await supabase.from('member_presence').upsert(row, {
      onConflict: 'org_id,user_id',
    })
    if (error) {
      if (/schema cache|does not exist|relation/i.test(error.message)) {
        setTableAvailable(false)
      }
      return
    }
    setTableAvailable(true)
  }, [orgId, userId, userName, role, area, tableAvailable])

  const mergePeers = useCallback((presenceMap, dbRows = []) => {
    const byId = new Map()

    // Realtime presence
    for (const metas of Object.values(presenceMap || {})) {
      const list = Array.isArray(metas) ? metas : [metas]
      for (const m of list) {
        if (!m?.user_id) continue
        byId.set(m.user_id, {
          userId: m.user_id,
          name: m.name || 'Usuario',
          role: m.role,
          area: m.area,
          roleLabel: m.role_label || ROLE_LABEL[m.role] || m.role || '—',
          onlineAt: m.online_at || new Date().toISOString(),
          lat: m.lat ?? null,
          lng: m.lng ?? null,
          accuracy: m.accuracy ?? null,
          locationAt: m.location_at ?? null,
          source: 'realtime',
        })
      }
    }

    // DB heartbeat (últimos 2 min) — complementa si Realtime no trae a alguien
    const cutoff = Date.now() - ONLINE_WINDOW_MS
    for (const r of dbRows) {
      if (!r?.user_id) continue
      const t = new Date(r.last_seen_at).getTime()
      if (Number.isNaN(t) || t < cutoff) continue
      const existing = byId.get(r.user_id)
      if (existing) {
        // completar ubicación si solo está en DB
        if (existing.lat == null && r.lat != null) {
          existing.lat = r.lat
          existing.lng = r.lng
          existing.accuracy = r.accuracy_m
          existing.locationAt = r.location_at
        }
        continue
      }
      byId.set(r.user_id, {
        userId: r.user_id,
        name: r.display_name || 'Usuario',
        role: r.role,
        area: r.area,
        roleLabel: ROLE_LABEL[r.role] || r.role || '—',
        onlineAt: r.last_seen_at,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        accuracy: r.accuracy_m ?? null,
        locationAt: r.location_at ?? null,
        source: 'db',
      })
    }

    const list = [...byId.values()].sort((a, b) => {
      // yo primero
      if (a.userId === userId) return -1
      if (b.userId === userId) return 1
      return (a.name || '').localeCompare(b.name || '', 'es')
    })
    setPeers(list)
  }, [userId])

  const loadDbOnline = useCallback(async () => {
    if (!orgId || tableAvailable === false) return []
    const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
    const { data, error } = await supabase
      .from('member_presence')
      .select(
        'user_id, last_seen_at, lat, lng, accuracy_m, location_at, display_name, role, area'
      )
      .eq('org_id', orgId)
      .gte('last_seen_at', since)
    if (error) {
      if (/schema cache|does not exist|relation/i.test(error.message)) {
        setTableAvailable(false)
      }
      return []
    }
    setTableAvailable(true)
    return data ?? []
  }, [orgId, tableAvailable])

  const refreshFromChannel = useCallback(async () => {
    const ch = channelRef.current
    const state = ch?.presenceState?.() || {}
    const dbRows = await loadDbOnline()
    mergePeers(state, dbRows)
  }, [loadDbOnline, mergePeers])

  // Geolocalización
  useEffect(() => {
    if (!shareLocation) return
    if (!navigator.geolocation) {
      setGeoStatus('unsupported')
      return
    }

    let watchId = null

    const applyPosition = (pos) => {
      const next = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: new Date().toISOString(),
      }
      setMyLocation(next)
      locationRef.current = next
      setGeoStatus('granted')
      trackPresence()
      upsertDbHeartbeat()
    }

    const onError = (err) => {
      if (err?.code === 1) setGeoStatus('denied')
      else setGeoStatus('error')
    }

    setGeoStatus('prompting')
    navigator.geolocation.getCurrentPosition(applyPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 60_000,
      timeout: 15_000,
    })

    // Un solo watch continuo: el chip GNSS ya entrega actualizaciones sin que la app
    // tenga que pedir un fix nuevo por su cuenta. El heartbeat de presencia (más abajo)
    // reenvía la última posición cacheada cada HEARTBEAT_MS sin gastar batería en GPS extra.
    watchId = navigator.geolocation.watchPosition(applyPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 20_000,
    })

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
    }
  }, [shareLocation, trackPresence, upsertDbHeartbeat])

  // Canal Realtime + heartbeats
  useEffect(() => {
    if (!orgId || !userId) {
      setPeers([])
      return
    }

    const channel = supabase.channel(`org-presence:${orgId}`, {
      config: {
        presence: { key: userId },
      },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        refreshFromChannel()
      })
      .on('presence', { event: 'join' }, () => {
        refreshFromChannel()
      })
      .on('presence', { event: 'leave' }, () => {
        refreshFromChannel()
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await trackPresence()
          await upsertDbHeartbeat()
          await refreshFromChannel()
        }
      })

    const hb = setInterval(() => {
      trackPresence()
      upsertDbHeartbeat()
      refreshFromChannel()
    }, HEARTBEAT_MS)

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        trackPresence()
        upsertDbHeartbeat()
        refreshFromChannel()
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      clearInterval(hb)
      document.removeEventListener('visibilitychange', onVis)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [orgId, userId, trackPresence, upsertDbHeartbeat, refreshFromChannel])

  // Re-track cuando cambian datos de perfil
  useEffect(() => {
    trackPresence()
  }, [userName, role, area, trackPresence])

  const othersOnline = useMemo(
    () => peers.filter((p) => p.userId !== userId),
    [peers, userId]
  )

  return {
    peers,
    othersOnline,
    onlineCount: peers.length,
    shareLocation,
    setShareLocation,
    geoStatus,
    myLocation,
    tableAvailable,
    refresh: refreshFromChannel,
  }
}

/** Distancia haversine en metros */
export function distanceMeters(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Export «formatDistance»: API pública de este módulo. Henry Stark Desarrollador */
export function formatDistance(m) {
  if (m == null || Number.isNaN(m)) return null
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}

/** Export «mapsUrl»: API pública de este módulo. Henry Stark Desarrollador */
export function mapsUrl(lat, lng) {
  if (lat == null || lng == null) return null
  return `https://www.google.com/maps?q=${lat},${lng}`
}
