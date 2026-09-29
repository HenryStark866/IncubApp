/**
 * Historial de OT de Mantum para componentes React: null mientras se descarga,
 * luego el mapa { [codigoEquipo]: OT[] }. Ver src/data/mantumHistory.js.
 */
import { useEffect, useState } from 'react'
import { loadMantumHistory, mantumHistoryLoaded } from '../data/mantumHistory'

export function useMantumHistory(enabled = true) {
  const [history, setHistory] = useState(mantumHistoryLoaded)
  useEffect(() => {
    if (!enabled || history) return
    let cancelled = false
    loadMantumHistory()
      .then((h) => {
        if (!cancelled) setHistory(h)
      })
      .catch((err) => console.warn('Historial Mantum no disponible:', err?.message || err))
    return () => {
      cancelled = true
    }
  }, [enabled, history])
  return history
}
