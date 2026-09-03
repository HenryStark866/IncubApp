/**
 * =============================================================================
 * ARCHIVO: src/lib/precisionGps.js
 * PROPÓSITO: Geolocalización de alta precisión (varias lecturas GNSS).
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Geolocalización de alta precisión (máximo esfuerzo en web).
 *
 * Nota: el navegador y el chip GNSS del dispositivo ya fusionan GPS/GLONASS/Galileo/BeiDou
 * cuando el SO lo permite. La API web no expone el número de satélites, pero sí la
 * precisión (accuracy en metros). Forzamos:
 *  - enableHighAccuracy (prioriza GNSS multi-constelación)
 *  - maximumAge: 0 (sin caché vieja)
 *  - varias lecturas en paralelo y elegimos la de menor error
 *  - filtro de fixes malos + suavizado para estabilidad tipo “vuelo”
 */

const GNSS_OPTS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000,
}

/** Lecturas en paralelo (varias solicitudes al mismo hardware; se queda la mejor). */
const PARALLEL_SAMPLES = 3
/** Solo aceptar fixes con accuracy (m) por debajo de esto si hay alguno bueno */
const GOOD_ACCURACY_M = 25
/** Suavizado: peso del nuevo fix (0–1) */
const SMOOTH_ALPHA = 0.35

/**
 * Una lectura single-shot.
 * @returns {Promise<GeolocationPosition>}
 */
/** Export «getPositionOnce»: API pública de este módulo. Henry Stark Desarrollador */
export function getPositionOnce(opts = GNSS_OPTS) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no soportada'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { ...GNSS_OPTS, ...opts })
  })
}

/**
 * Lanza N lecturas en paralelo y devuelve la de menor accuracy (más precisa).
 */
/** Export «getBestPositionParallel»: API pública de este módulo. Henry Stark Desarrollador */
export async function getBestPositionParallel(n = PARALLEL_SAMPLES) {
  const jobs = Array.from({ length: n }, () =>
    getPositionOnce().then(
      (p) => p,
      (e) => e
    )
  )
  const results = await Promise.all(jobs)
  const ok = results.filter((r) => r && r.coords)
  if (!ok.length) {
    const err = results.find((r) => r instanceof Error || r?.code)
    throw err || new Error('Sin señal GNSS')
  }
  ok.sort((a, b) => (a.coords.accuracy ?? 9999) - (b.coords.accuracy ?? 9999))
  return ok[0]
}

/**
 * Tracker continuo de máxima precisión.
 * - watchPosition con high accuracy
 * - re-muestreo periódico en paralelo
 * - descarta saltos absurdos si hay buen historial
 * - suaviza lat/lng
 */
/** Export «createPrecisionTracker»: API pública de este módulo. Henry Stark Desarrollador */
export function createPrecisionTracker({
  onUpdate,
  onError,
  parallelIntervalMs = 8000,
  maxJumpMeters = 80,
} = {}) {
  let watchId = null
  let intervalId = null
  let lastGood = null // { lat, lng, accuracy, heading, speed, at, smoothed }
  let stopped = false

  const emit = (pos, source) => {
    const c = pos.coords
    const raw = {
      lat: c.latitude,
      lng: c.longitude,
      accuracy: c.accuracy,
      altitude: c.altitude,
      altitudeAccuracy: c.altitudeAccuracy,
      heading: c.heading,
      speed: c.speed,
      at: new Date(pos.timestamp || Date.now()).toISOString(),
      source,
    }

    // Rechazar fixes peores si ya tenemos uno bueno reciente
    if (
      lastGood &&
      raw.accuracy != null &&
      lastGood.accuracy != null &&
      raw.accuracy > lastGood.accuracy * 2.5 &&
      raw.accuracy > GOOD_ACCURACY_M
    ) {
      return
    }

    // Salto absurdo (teletransporte)
    if (lastGood && maxJumpMeters > 0) {
      const jump = haversineM(lastGood.lat, lastGood.lng, raw.lat, raw.lng)
      const dt = (Date.now() - new Date(lastGood.at).getTime()) / 1000
      // si en < 3s se mueve más de maxJump y accuracy mala, ignorar
      if (dt < 3 && jump > maxJumpMeters && (raw.accuracy || 99) > 15) return
    }

    // Suavizado
    let lat = raw.lat
    let lng = raw.lng
    if (lastGood?.smoothed) {
      lat = lastGood.smoothed.lat * (1 - SMOOTH_ALPHA) + raw.lat * SMOOTH_ALPHA
      lng = lastGood.smoothed.lng * (1 - SMOOTH_ALPHA) + raw.lng * SMOOTH_ALPHA
    }

    const fix = {
      ...raw,
      lat,
      lng,
      smoothed: { lat, lng },
      quality:
        raw.accuracy == null
          ? 'unknown'
          : raw.accuracy <= 8
            ? 'excelente'
            : raw.accuracy <= 15
              ? 'alta'
              : raw.accuracy <= 40
                ? 'media'
                : 'baja',
    }
    lastGood = fix
    onUpdate?.(fix)
  }

  const start = () => {
    if (!navigator.geolocation) {
      onError?.(new Error('Geolocalización no soportada'))
      return
    }
    stopped = false

    // Watch principal
    watchId = navigator.geolocation.watchPosition(
      (p) => emit(p, 'watch'),
      (e) => onError?.(e),
      GNSS_OPTS
    )

    // Ráfaga inicial multi-lectura
    getBestPositionParallel(PARALLEL_SAMPLES)
      .then((p) => {
        if (!stopped) emit(p, 'burst')
      })
      .catch((e) => onError?.(e))

    // Remuestreo periódico en paralelo (mejor fix disponible)
    intervalId = setInterval(() => {
      if (stopped) return
      getBestPositionParallel(PARALLEL_SAMPLES)
        .then((p) => emit(p, 'parallel'))
        .catch(() => {})
    }, parallelIntervalMs)
  }

  const stop = () => {
    stopped = true
    if (watchId != null) navigator.geolocation.clearWatch(watchId)
    if (intervalId) clearInterval(intervalId)
    watchId = null
    intervalId = null
  }

  const getLast = () => lastGood

  return { start, stop, getLast }
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toR = (d) => (d * Math.PI) / 180
  const dLat = toR(lat2 - lat1)
  const dLng = toR(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Export «formatSpeedKmh»: API pública de este módulo. Henry Stark Desarrollador */
export function formatSpeedKmh(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return null
  return Math.round(ms * 3.6)
}

/** Export «formatAccuracy»: API pública de este módulo. Henry Stark Desarrollador */
export function formatAccuracy(m) {
  if (m == null || Number.isNaN(m)) return '—'
  if (m < 1) return `${m.toFixed(1)} m`
  return `±${Math.round(m)} m`
}
