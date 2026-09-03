/**
 * =============================================================================
 * ARCHIVO: src/hooks/useHighPrecisionGps.js
 * PROPÓSITO: Hook «useHighPrecisionGps»: encapsula estado, carga de datos Supabase/Realtime y acciones reutilizables para los paneles que lo consumen.
 * CÓMO FUNCIONA: Exporta un hook React que, al montarse, consulta Supabase (y a veces Realtime), expone loading/error/datos y funciones mutadoras; el componente se re-renderiza al cambiar el estado.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createPrecisionTracker,
  formatAccuracy,
  formatSpeedKmh,
  getBestPositionParallel,
} from '../lib/precisionGps'

/**
 * Hook de GPS de máxima precisión (multi-muestra + watch continuo).
 */
/** Export «useHighPrecisionGps»: API pública de este módulo. Henry Stark Desarrollador */
export function useHighPrecisionGps({ enabled = false, onFix } = {}) {
  const [fix, setFix] = useState(null)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const trackerRef = useRef(null)
  const onFixRef = useRef(onFix)
  onFixRef.current = onFix

  const start = useCallback(() => {
    if (trackerRef.current) return
    setError(null)
    setRunning(true)
    const t = createPrecisionTracker({
      onUpdate: (f) => {
        setFix(f)
        onFixRef.current?.(f)
      },
      onError: (e) => {
        setError(e?.message || String(e))
      },
      parallelIntervalMs: 6000,
    })
    trackerRef.current = t
    t.start()
  }, [])

  const stop = useCallback(() => {
    trackerRef.current?.stop()
    trackerRef.current = null
    setRunning(false)
  }, [])

  const burst = useCallback(async () => {
    try {
      setError(null)
      const p = await getBestPositionParallel(4)
      const f = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
        altitude: p.coords.altitude,
        heading: p.coords.heading,
        speed: p.coords.speed,
        at: new Date().toISOString(),
        source: 'burst',
        quality:
          p.coords.accuracy <= 8
            ? 'excelente'
            : p.coords.accuracy <= 15
              ? 'alta'
              : p.coords.accuracy <= 40
                ? 'media'
                : 'baja',
      }
      setFix(f)
      onFixRef.current?.(f)
      return f
    } catch (e) {
      setError(e?.message || String(e))
      return null
    }
  }, [])

  useEffect(() => {
    if (enabled) start()
    else stop()
    return () => stop()
  }, [enabled, start, stop])

  return {
    fix,
    error,
    running,
    start,
    stop,
    burst,
    accuracyLabel: formatAccuracy(fix?.accuracy),
    speedKmh: formatSpeedKmh(fix?.speed),
    quality: fix?.quality || null,
  }
}
