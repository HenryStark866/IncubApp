/**
 * Aceptación de Términos de Uso / Política de Privacidad por versión.
 * Henry Stark Desarrollador · CDH Maker
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
    const { data, error: err } = await supabase
      .from('legal_acceptances')
      .select('doc_type, doc_version')
      .eq('user_id', userId)
      .in('doc_type', ['terms', 'privacy'])

    if (err) {
      setError(err.message)
      setAccepted(false)
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
