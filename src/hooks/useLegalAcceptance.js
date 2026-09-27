/**
 * Aceptación de Términos de Uso / Política de Privacidad por versión.
 * Henry Stark Desarrollador · CDH Maker
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isNetworkError } from '../lib/offlineAuth'
import { TERMS_VERSION, PRIVACY_VERSION } from '../legal/legalContent'

export function useLegalAcceptance({ userId, orgId }) {
  const [loading, setLoading] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState(null)

  const check = useCallback(async () => {
    if (!userId) {
      setAccepted(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err, status } = await supabase
      .from('legal_acceptances')
      .select('doc_type, doc_version')
      .eq('user_id', userId)
      .in('doc_type', ['terms', 'privacy'])

    if (err) {
      // Sin red o con el servidor caído no se puede consultar ni guardar la aceptación:
      // bloquear ahí dejaría atrapado a quien trabaja sin conexión. Se vuelve a
      // comprobar en la siguiente carga con red. Un error real de la tabla sí muestra
      // el aviso para aceptar de nuevo.
      const offline =
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        isNetworkError(err) ||
        !status ||
        status >= 500
      setError(offline ? null : err.message)
      setAccepted(offline)
      setLoading(false)
      return
    }
    setError(null)
    const rows = data ?? []
    const hasTerms = rows.some((r) => r.doc_type === 'terms' && r.doc_version === TERMS_VERSION)
    const hasPrivacy = rows.some((r) => r.doc_type === 'privacy' && r.doc_version === PRIVACY_VERSION)
    setAccepted(hasTerms && hasPrivacy)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    check()
  }, [check])

  const accept = useCallback(async () => {
    if (!userId) return { error: 'Sin sesión' }
    setError(null)
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null
    const rows = [
      { user_id: userId, org_id: orgId ?? null, doc_type: 'terms', doc_version: TERMS_VERSION, user_agent: ua },
      { user_id: userId, org_id: orgId ?? null, doc_type: 'privacy', doc_version: PRIVACY_VERSION, user_agent: ua },
    ]
    const { error: err } = await supabase
      .from('legal_acceptances')
      .upsert(rows, { onConflict: 'user_id,doc_type,doc_version' })
    if (err) {
      setError(err.message)
      return { error: err.message }
    }
    setAccepted(true)
    return { error: null }
  }, [userId, orgId])

  return { loading, accepted, error, accept, reload: check }
}
