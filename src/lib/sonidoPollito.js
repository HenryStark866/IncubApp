/**
 * =============================================================================
 * ARCHIVO: src/lib/sonidoPollito.js
 * PROPÓSITO: El sonido propio de IncubApp — el pío de un pollito de un día.
 * CÓMO FUNCIONA: Sintetiza el pío con WebAudio en el momento, sin archivo de
 * audio que descargar ni que sumar a la CSP, y suena igual sin red. Dos píos en
 * el splash, tres seguidos en cada notificación.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Cómo se hace un pío de pollito recién nacido:
 *
 *   · La voz está arriba, entre 3 y 4 kHz. Un pollito de un día no grazna, silba.
 *   · Dura poco más de una décima de segundo.
 *   · Y lo que de verdad lo delata es el BARRIDO: arranca abajo, sube de golpe
 *     en la primera quinta parte y baja despacio el resto. Sin ese barrido, un
 *     tono de 3 kHz es el pitido de un microondas.
 *   · No es un tono puro: lleva dos armónicos por encima, que son los que le
 *     ponen la caña, y un soplo de ruido de dos centésimas al arrancar, que es
 *     lo que lo hace bicho y no sintetizador.
 *
 * Cada pío sale con una pizca de azar en el tono y en la duración: dos píos
 * exactamente iguales suenan a máquina, y un pollito nunca repite el mismo.
 */

const CLAVE_PREF = 'incubapp_sonido'
const VOLUMEN = 0.18 // el pío es agudo y se oye mucho: bajo de sobra

/** «pi-pí» del splash: el segundo, un pelo más agudo y más corto. */
const SPLASH = [
  { t: 0.0, f0: 3150, dur: 0.14 },
  { t: 0.2, f0: 3520, dur: 0.115 },
]

/** «pío-pío-pío» de una notificación: tres seguidos, el del medio más alto. */
const NOTIFICACION = [
  { t: 0.0, f0: 3280, dur: 0.115 },
  { t: 0.17, f0: 3560, dur: 0.11 },
  { t: 0.34, f0: 3180, dur: 0.135 },
]

let ctx = null
let maestro = null
let bufSoplo = null
/** Saludo del splash que no pudo sonar porque nadie había tocado la página aún. */
let pendiente = null

/** ¿El usuario quiere sonido? Se recuerda en el navegador; por defecto, sí. */
export function sonidoActivo() {
  try {
    return localStorage.getItem(CLAVE_PREF) !== '0'
  } catch {
    return true
  }
}

/** Enciende o apaga el sonido de la app en este dispositivo. */
export function setSonidoActivo(v) {
  try {
    localStorage.setItem(CLAVE_PREF, v ? '1' : '0')
  } catch {
    /* almacenamiento bloqueado: vale con la sesión */
  }
  if (v) despertar()
}

function crear() {
  if (ctx) return ctx
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  ctx = new AC()
  maestro = ctx.createGain()
  maestro.gain.value = VOLUMEN
  maestro.connect(ctx.destination)
  return ctx
}

/**
 * Crea el contexto la primera vez y lo reanuda si quedó suspendido. Ningún
 * navegador deja sonar nada antes de que el usuario toque la página, así que
 * esto se llama también desde el primer gesto que haga.
 */
export function despertar() {
  const c = crear()
  if (!c) return null
  if (c.state === 'suspended') c.resume().catch(() => {})
  return c
}

/** Ruido blanco corto, la base del soplo de arranque. */
function soplo(t0, dur, vol) {
  if (!bufSoplo) {
    const n = Math.floor(ctx.sampleRate * 0.05)
    bufSoplo = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = bufSoplo.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  }
  const s = ctx.createBufferSource()
  s.buffer = bufSoplo
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 4200
  f.Q.value = 1.1
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  s.connect(f)
  f.connect(g)
  g.connect(maestro)
  s.start(t0)
  s.stop(t0 + dur + 0.01)
}

/** Un pío. `t0` es el reloj del contexto, no el del navegador. */
function pio(t0, { f0, dur }) {
  const t1 = t0 + dur
  const salida = ctx.createGain()
  salida.gain.setValueAtTime(0.0001, t0)
  salida.gain.exponentialRampToValueAtTime(1, t0 + 0.008) // ataque de golpe
  salida.gain.setValueAtTime(1, t0 + dur * 0.45)
  salida.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.02)
  salida.connect(maestro)

  // El fundamental y sus dos armónicos, cada uno con el mismo barrido.
  ;[1, 0.26, 0.09].forEach((peso, i) => {
    const n = i + 1
    const o = ctx.createOscillator()
    o.type = i === 0 ? 'sine' : 'triangle'
    o.frequency.setValueAtTime(f0 * 0.78 * n, t0)
    o.frequency.exponentialRampToValueAtTime(f0 * 1.24 * n, t0 + dur * 0.18)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.95 * n, t0 + dur * 0.62)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.8 * n, t1)
    const g = ctx.createGain()
    g.gain.value = peso
    o.connect(g)
    g.connect(salida)
    o.start(t0)
    o.stop(t1 + 0.05)
  })

  soplo(t0, 0.022, 0.05)
}

/** Programa una secuencia entera. Devuelve false si el navegador no deja sonar. */
function reproducir(secuencia) {
  if (!sonidoActivo()) return true // apagado a propósito: no queda nada pendiente
  const c = despertar()
  if (!c || c.state !== 'running') return false
  const t = c.currentTime + 0.02
  const azar = (v, p) => v * (1 + (Math.random() * 2 - 1) * p)
  secuencia.forEach((p) => pio(t + p.t, { f0: azar(p.f0, 0.03), dur: azar(p.dur, 0.08) }))
  return true
}

/** Dos píos: el saludo del splash. */
export function pioSplash() {
  if (reproducir(SPLASH)) return
  // Arranque en frío: el navegador no deja sonar hasta que alguien toque la
  // página, y en el splash todavía no ha tocado nadie. Se deja armado un rato
  // corto —lo que tarda en escribir el correo o pulsar algo—, y si para
  // entonces no ha tocado nada, el saludo se descarta en vez de salir tarde.
  pendiente = { seq: SPLASH, hasta: Date.now() + 12000 }
}

/** Tres píos seguidos: llegó una notificación. */
export function pioNotificacion() {
  reproducir(NOTIFICACION)
}

/**
 * Nodo de salida, ya despierto. Sirve para medir la señal —que es la única
 * forma de comprobar que esto suena a pollito y no a microondas— y para colgarle
 * un control de volumen el día que haga falta.
 */
export function nodoSalida() {
  despertar()
  return maestro
}

function alPrimerGesto() {
  const c = crear()
  if (!c) return
  const seguir = () => {
    if (!pendiente) return
    const p = pendiente
    pendiente = null
    if (Date.now() <= p.hasta) reproducir(p.seq)
  }
  if (c.state === 'suspended') c.resume().then(seguir).catch(() => {})
  else seguir()
}

if (typeof window !== 'undefined') {
  ;['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, alPrimerGesto, { passive: true })
  )
}
