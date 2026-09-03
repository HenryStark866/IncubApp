/**
 * Marcaje de ingreso / salida con foto y GPS (Supabase + fallback local).
 * Henry Stark Desarrollador
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getBestPositionParallel } from '../lib/precisionGps'
import { applyAttendanceWatermark } from '../lib/watermark'
import { isNetworkError, isOnline } from '../lib/network'
import { enqueueInsert, enqueueStorageUpload } from '../lib/offlineQueue'
import { distanceMeters } from './useOrgPresence'
import { DEFAULT_SITE_RADIUS_M } from '../lib/geoMap'

/** Margen de tolerancia (m) que se suma al radio para absorber el error del GPS. */
const ACCURACY_TOLERANCE_CAP_M = 100

/** Sede calibrada más cercana a (lat, lng), o null si ninguna sede del org tiene GPS calibrado. */
function nearestCalibratedSite(sites, lat, lng) {
  const calibrated = (sites || []).filter((s) => s.geo_origin_lat != null && s.geo_origin_lng != null)
  if (!calibrated.length) return null
  let best = null
  for (const s of calibrated) {
    const d = distanceMeters({ lat, lng }, { lat: s.geo_origin_lat, lng: s.geo_origin_lng })
    if (d != null && (!best || d < best.distance)) {
      best = {
        id: s.id,
        name: s.name,
        distance: d,
        radiusM: Number(s.geo_radius_m) > 0 ? Number(s.geo_radius_m) : DEFAULT_SITE_RADIUS_M,
      }
    }
  }
  return best
}

const localKey = (orgId, userId) => `incubapp_attendance_${orgId}_${userId}`

function localList(orgId, userId) {
  try {
    const raw = localStorage.getItem(localKey(orgId, userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function localWrite(orgId, userId, rows) {
  localStorage.setItem(localKey(orgId, userId), JSON.stringify(rows.slice(0, 80)))
}

function localInsert(orgId, userId, row) {
  const rows = localList(orgId, userId)
  const full = {
    id: `local_att_${Date.now()}`,
    ...row,
    org_id: orgId,
    user_id: userId,
    _local: true,
  }
  localWrite(orgId, userId, [full, ...rows])
  return full
}

export function useAttendance({ orgId, userId, userName = '' }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [localMode, setLocalMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sites, setSites] = useState([])

  // Sedes (plantas/granjas) del org con su calibración GPS, para validar que la marca
  // de ingreso/salida ocurra dentro del radio calibrado.
  useEffect(() => {
    if (!orgId) {
      setSites([])
      return
    }
    let cancelled = false
    supabase
      .from('plants')
      .select('id, name, geo_origin_lat, geo_origin_lng, geo_radius_m')
      .eq('org_id', orgId)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setSites([])
          return
        }
        setSites(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const load = useCallback(async () => {
    if (!orgId || !userId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - 14)
    const { data, error: err } = await supabase
      .from('attendance_punches')
      .select(
        'id, org_id, user_id, punch_type, punched_at, photo_path, lat, lng, accuracy_m, device_note, shift_date, site_id, site_name, distance_m, site_verified'
      )
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .gte('punched_at', since.toISOString())
      .order('punched_at', { ascending: false })
      .limit(60)

    if (err) {
      const missing = /does not exist|schema cache|Could not find/i.test(err.message)
      setTableMissing(missing)
      setLocalMode(true)
      setError(missing ? null : err.message)
      setRows(localList(orgId, userId))
    } else {
      setTableMissing(false)
      setLocalMode(false)
      setError(null)
      const cloud = data ?? []
      const localOnly = localList(orgId, userId).filter((r) => r._local)
      const ids = new Set(cloud.map((r) => r.id))
      setRows([...cloud, ...localOnly.filter((r) => !ids.has(r.id))])
    }
    setLoading(false)
  }, [orgId, userId])

  useEffect(() => {
    load()
  }, [load])

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  const todayPunches = useMemo(
    () =>
      rows.filter(
        (r) =>
          (r.shift_date && String(r.shift_date).startsWith(today)) ||
          String(r.punched_at || '').startsWith(today)
      ),
    [rows, today]
  )

  const lastPunch = rows[0] || null
  const isInside = lastPunch?.punch_type === 'in'
  const openSession = isInside ? lastPunch : null

  const punch = useCallback(
    async ({ type, photoFile, note = '', placeLabel = '' }) => {
      if (!orgId || !userId) return { error: 'Sin sesión' }
      if (!photoFile) return { error: 'La selfie es obligatoria' }
      if (type === 'in' && isInside) return { error: 'Ya tienes un ingreso abierto. Marca salida primero.' }
      if (type === 'out' && !isInside) return { error: 'No hay ingreso abierto para marcar salida.' }

      setBusy(true)
      try {
        let pos
        try {
          pos = await getBestPositionParallel(3)
        } catch (e) {
          setBusy(false)
          return {
            error:
              e?.message ||
              'GPS obligatorio. Activa la ubicación de alta precisión e inténtalo de nuevo.',
          }
        }
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const accuracy = pos.coords.accuracy
        const at = new Date()

        // Verificación de sede: si el org tiene al menos una sede con GPS calibrado,
        // solo se permite marcar dentro de su radio (± tolerancia por precisión del GPS).
        const nearest = nearestCalibratedSite(sites, lat, lng)
        let site = null
        if (nearest) {
          const tolerance = Math.min(accuracy || 0, ACCURACY_TOLERANCE_CAP_M)
          const verified = nearest.distance <= nearest.radiusM + tolerance
          if (!verified) {
            setBusy(false)
            return {
              error: `Está a ${Math.round(nearest.distance)} m de ${nearest.name} (radio permitido ${Math.round(nearest.radiusM)} m). Acérquese a la sede para marcar ${type === 'in' ? 'ingreso' : 'salida'}.`,
            }
          }
          site = {
            site_id: nearest.id,
            site_name: nearest.name,
            distance_m: Math.round(nearest.distance),
            site_verified: true,
          }
        }

        // Selfie con marca de agua: operario, fecha, hora, lugar, GPS
        const file = await applyAttendanceWatermark(photoFile, {
          userName: userName || 'Operario',
          userId,
          punchType: type,
          lat,
          lng,
          accuracy,
          placeLabel: placeLabel || undefined,
          at,
        })

        const storagePath = `${orgId}/attendance/${userId}/${Date.now()}_${type}.jpg`
        let path = null
        let offlineUpload = false

        if (!isOnline()) {
          offlineUpload = true
          try {
            await enqueueStorageUpload('machine-checks', storagePath, file, 'image/jpeg')
            path = storagePath
          } catch {
            path = null
          }
        } else {
          try {
            const { error: upErr } = await supabase.storage
              .from('machine-checks')
              .upload(storagePath, file, { contentType: 'image/jpeg', upsert: false })
            if (!upErr) path = storagePath
            else if (isNetworkError(upErr.message)) {
              offlineUpload = true
              await enqueueStorageUpload('machine-checks', storagePath, file, 'image/jpeg')
              path = storagePath
            }
          } catch (e) {
            if (isNetworkError(e?.message)) {
              offlineUpload = true
              try {
                await enqueueStorageUpload('machine-checks', storagePath, file, 'image/jpeg')
                path = storagePath
              } catch {
                path = null
              }
            }
          }
        }

        // Vista previa local si no hay path de storage
        if (!path) {
          try {
            const buf = await file.arrayBuffer()
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.length; i += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
            }
            path = `data:image/jpeg;base64,${btoa(binary)}`
          } catch {
            path = 'local:no-photo'
          }
        }

        const bogotaDate = at.toLocaleDateString('en-CA', {
          timeZone: 'America/Bogota',
        })

        const deviceNote = [
          note || '',
          `selfie_watermark=1`,
          `name=${userName || ''}`,
          offlineUpload ? 'queued_upload=1' : '',
        ]
          .filter(Boolean)
          .join(' | ')

        const cloudPath = String(path).startsWith('data:') ? storagePath : path
        const row = {
          org_id: orgId,
          user_id: userId,
          punch_type: type,
          photo_path: path,
          lat,
          lng,
          accuracy_m: accuracy,
          device_note: deviceNote || null,
          shift_date: bogotaDate,
          punched_at: at.toISOString(),
          site_id: site?.site_id ?? null,
          site_name: site?.site_name ?? null,
          distance_m: site?.distance_m ?? null,
          site_verified: site?.site_verified ?? null,
        }
        const cloudRow = {
          ...row,
          photo_path: String(cloudPath).startsWith('data:') ? 'local-pending' : cloudPath,
        }

        const saveOffline = async (warn) => {
          localInsert(orgId, userId, row)
          try {
            await enqueueInsert('attendance_punches', cloudRow)
          } catch {
            /* local only */
          }
          setLocalMode(true)
          await load()
          setBusy(false)
          return {
            error: null,
            location: { lat, lng, accuracy },
            local: true,
            offline: true,
            warn,
            watermarked: true,
          }
        }

        if (tableMissing || localMode || !isOnline() || offlineUpload) {
          return saveOffline(offlineUpload ? 'Cola offline (se sube al volver la red)' : null)
        }

        const { error: err } = await supabase.from('attendance_punches').insert(cloudRow)
        if (err) {
          if (isNetworkError(err.message)) return saveOffline(err.message)
          localInsert(orgId, userId, row)
          setLocalMode(true)
          await load()
          setBusy(false)
          return {
            error: null,
            location: { lat, lng, accuracy },
            local: true,
            warn: err.message,
            watermarked: true,
          }
        }
        await load()
        setBusy(false)
        return { error: null, location: { lat, lng, accuracy }, watermarked: true }
      } catch (e) {
        setBusy(false)
        return { error: e.message || String(e) }
      }
    },
    [orgId, userId, userName, tableMissing, localMode, isInside, load, sites]
  )

  const signedUrl = useCallback(async (path) => {
    if (!path) return null
    if (String(path).startsWith('data:') || String(path).startsWith('blob:')) return path
    const { data } = await supabase.storage.from('machine-checks').createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  }, [])

  return {
    loading,
    error,
    tableMissing,
    localMode,
    busy,
    rows,
    todayPunches,
    lastPunch,
    isInside,
    openSession,
    punch,
    signedUrl,
    reload: load,
    sitesCalibrated: sites.some((s) => s.geo_origin_lat != null && s.geo_origin_lng != null),
  }
}
