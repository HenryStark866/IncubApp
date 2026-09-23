/**
 * Sonido de las puertas — PLANTA 3D INCUBANT
 *
 * Todo se sintetiza con WebAudio en el momento: no hay archivos de audio que
 * descargar ni que sumar a la CSP, y el recorrido sigue funcionando sin red.
 *
 * Los navegadores no dejan sonar nada hasta que el usuario toca la página, así
 * que el contexto se crea (o se reanuda) en el primer clic o tecla.
 */
window.Sonido = (function () {
  'use strict'

  let ctx = null
  let maestro = null
  // Arranca apagado (23-09-2026): se enciende en el menú, «Sonido de puertas».
  let activo = false

  /** Crea el contexto la primera vez; después solo lo reanuda si quedó suspendido. */
  function despertar() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      maestro = ctx.createGain()
      maestro.gain.value = 0.5
      maestro.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  // Con el sonido apagado ni siquiera se crea el contexto de audio: el
  // navegador avisaba en consola de un AudioContext que nadie iba a usar.
  ;['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, () => { if (activo) despertar() }, { passive: true })
  )

  /** Ruido blanco reutilizable: es la base del roce y del rodamiento. */
  let bufRuido = null
  function ruido() {
    if (!bufRuido) {
      const n = Math.floor(ctx.sampleRate * 1.2)
      bufRuido = ctx.createBuffer(1, n, ctx.sampleRate)
      const d = bufRuido.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    }
    const s = ctx.createBufferSource()
    s.buffer = bufRuido
    s.loop = true
    return s
  }

  /** Envolvente lineal sencilla: sube en `ataque`, se mantiene y cae. */
  function envolvente(g, t0, pico, ataque, sostiene, caida) {
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(pico, t0 + ataque)
    g.gain.setValueAtTime(pico, t0 + ataque + sostiene)
    g.gain.linearRampToValueAtTime(0.0001, t0 + ataque + sostiene + caida)
  }

  /** Golpe corto y seco: el pestillo de una puerta peatonal. */
  function chasquido(t0, vol) {
    const s = ruido()
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 2400
    f.Q.value = 1.4
    const g = ctx.createGain()
    envolvente(g, t0, 0.5 * vol, 0.002, 0.004, 0.05)
    s.connect(f); f.connect(g); g.connect(maestro)
    s.start(t0); s.stop(t0 + 0.09)
  }

  /** Roce del sello de caucho contra el marco, al abrir una peatonal. */
  function roce(t0, vol) {
    const s = ruido()
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(700, t0)
    f.frequency.exponentialRampToValueAtTime(1500, t0 + 0.45)
    f.Q.value = 0.9
    const g = ctx.createGain()
    envolvente(g, t0, 0.16 * vol, 0.07, 0.16, 0.28)
    s.connect(f); f.connect(g); g.connect(maestro)
    s.start(t0); s.stop(t0 + 0.6)
  }

  /** Rodamiento de la corredera sobre el riel: grave, largo y con cuerpo. */
  function rodar(t0, vol, dur) {
    const s = ruido()
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(240, t0)
    f.frequency.linearRampToValueAtTime(430, t0 + dur * 0.4)
    f.frequency.linearRampToValueAtTime(260, t0 + dur)
    f.Q.value = 3
    const g = ctx.createGain()
    envolvente(g, t0, 0.3 * vol, 0.1, dur * 0.6, dur * 0.4)
    s.connect(f); f.connect(g); g.connect(maestro)
    s.start(t0); s.stop(t0 + dur + 0.2)

    // Zumbido del motor del portón, apenas perceptible bajo el rodamiento.
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(52, t0)
    o.frequency.linearRampToValueAtTime(61, t0 + dur * 0.5)
    o.frequency.linearRampToValueAtTime(48, t0 + dur)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 180
    const go = ctx.createGain()
    envolvente(go, t0, 0.1 * vol, 0.12, dur * 0.6, dur * 0.35)
    o.connect(lp); lp.connect(go); go.connect(maestro)
    o.start(t0); o.stop(t0 + dur + 0.2)
  }

  /** Tope metálico del final de carrera. */
  function tope(t0, vol) {
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(150, t0)
    o.frequency.exponentialRampToValueAtTime(72, t0 + 0.14)
    const g = ctx.createGain()
    envolvente(g, t0, 0.36 * vol, 0.004, 0.01, 0.16)
    o.connect(g); g.connect(maestro)
    o.start(t0); o.stop(t0 + 0.22)
  }

  /**
   * Suena una puerta.
   * @param {'corre'|'gira'} tipo   corrediza/portón, o peatonal de bisagra
   * @param {'abre'|'cierra'} accion
   * @param {number} dist  metros hasta el visitante (atenúa el volumen)
   */
  function puerta(tipo, accion, dist) {
    if (!activo || !ctx || ctx.state !== 'running') return
    // Más allá de 14 m no se oye; de cerca no satura.
    const vol = Math.max(0, Math.min(1, 1 - (dist || 0) / 14))
    if (vol <= 0.02) return
    const t = ctx.currentTime + 0.01

    if (tipo === 'corre') {
      const dur = accion === 'abre' ? 1.1 : 0.95
      rodar(t, vol, dur)
      tope(t + dur, vol * (accion === 'cierra' ? 1 : 0.55))
    } else if (accion === 'abre') {
      chasquido(t, vol)          // el pestillo suelta…
      roce(t + 0.04, vol)        // …y la hoja se despega del marco
    } else {
      roce(t, vol * 0.8)
      chasquido(t + 0.34, vol)   // al cerrar, el pestillo entra al final
      tope(t + 0.34, vol * 0.5)
    }
  }

  return {
    puerta,
    despertar,
    /** Nodo de salida: sirve para medir la señal o colgar un control de volumen. */
    get salida() { return maestro },
    get activo() { return activo },
    set activo(v) {
      activo = !!v
      if (activo) despertar()
    },
  }
})()
