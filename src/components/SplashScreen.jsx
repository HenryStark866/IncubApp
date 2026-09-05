/**
 * Splash IncubApp (marca comercial) + firma CDH Maker (operador).
 */

import { useEffect, useRef, useState } from 'react'
import { IncubAppProductMark, CdhSignature, APP_NAME, APP_SLOGAN } from './Brand'
import { pioSplash } from '../lib/sonidoPollito'

const DURATION = 1200
const FADE = 400

export default function SplashScreen() {
  const [phase, setPhase] = useState(() => {
    try {
      return sessionStorage.getItem('cdh_splash_shown') ? 'done' : 'show'
    } catch {
      return 'done'
    }
  })

  // El saludo suena una sola vez por montaje: en desarrollo StrictMode corre
  // este efecto dos veces y si no, el pollito pía cuatro veces en vez de dos.
  const saludado = useRef(false)

  useEffect(() => {
    if (phase !== 'show') return
    try {
      sessionStorage.setItem('cdh_splash_shown', '1')
    } catch {
      /* */
    }
    if (!saludado.current) {
      saludado.current = true
      pioSplash()
    }
    const t1 = setTimeout(() => setPhase('fade'), DURATION)
    const t2 = setTimeout(() => setPhase('done'), DURATION + FADE)
    const t3 = setTimeout(() => setPhase('done'), 2800)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [phase])

  if (phase === 'done') return null

  return (
    <div className={`splash${phase === 'fade' ? ' fade-out' : ''}`} aria-hidden="true">
      <div className="splash-rings">
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
      </div>

      <div className="splash-logo">
        <div className="splash-mark">
          <IncubAppProductMark size={88} />
        </div>
        <div className="splash-name">
          <strong>{APP_NAME.toUpperCase()}</strong>
          <span>{APP_SLOGAN}</span>
        </div>
      </div>

      <div className="splash-bar">
        <span className="splash-bar-fill" />
      </div>

      <div className="splash-sig">
        <CdhSignature label="by" />
      </div>
      <span className="splash-scanline" />
    </div>
  )
}
