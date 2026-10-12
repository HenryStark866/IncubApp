/**
 * ¿Se está usando la app en un celular? 12-10-2026: el recorrido / mapa 3D es solo para
 * el PC (pesa mucho y en el celular no se maneja bien). Celular = pantalla angosta, o
 * táctil sin mouse hasta tamaño tableta pequeña. Se recalcula al girar o cambiar tamaño.
 */
import { useEffect, useState } from 'react'

export const MOBILE_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse) and (max-width: 1024px)'

export function isMobileDevice() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches
  } catch {
    return false
  }
}

export function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileDevice)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setMobile(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return mobile
}
