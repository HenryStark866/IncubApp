import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function storageLocation(src) {
  if (!src || typeof src !== 'string') return null
  try {
    const url = new URL(src, window.location.origin)
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+)$/)
    if (!match) return null
    return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) }
  } catch {
    return null
  }
}

export default function StorageImage({ src, bucket, path, alt = '', fallback = null, ...props }) {
  const [displaySrc, setDisplaySrc] = useState(src || null)
  const [failed, setFailed] = useState(!src)
  const retried = useRef(false)

  useEffect(() => {
    setDisplaySrc(src || null)
    setFailed(!src)
    retried.current = false
  }, [src])

  const handleError = async () => {
    if (retried.current) {
      setFailed(true)
      return
    }
    retried.current = true
    const location = (bucket && path) ? { bucket, path } : storageLocation(displaySrc)
    if (!location?.bucket || !location.path) {
      setFailed(true)
      return
    }
    try {
      const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 3600)
      if (error || !data?.signedUrl) throw error || new Error('No se pudo renovar la URL de la imagen')
      setDisplaySrc(data.signedUrl)
    } catch {
      setFailed(true)
    }
  }

  if (failed || !displaySrc) return fallback
  return <img {...props} src={displaySrc} alt={alt} onError={handleError} />
}
