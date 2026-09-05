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
 *   · La voz está arriba, sobre los 3,3 kHz. Un pollito de un día no grazna,
 *     chilla. Bajarla a 2,8 lo volvía agradable pero dejaba de ser un pollito:
 *     sonaba a silbato.
 *   · Dura casi dos décimas, y entre pío y pío pasa casi medio segundo. A un
 *     tercio de eso sonaba a máquina, no a pollito: piar es pausado.
 *   · Y lo que de verdad lo delata es el BARRIDO: arranca abajo, sube de golpe
 *     en la primera quinta parte y baja despacio el resto. Sin ese barrido, un
 *     tono de 3 kHz es el pitido de un microondas.
 *   · No es un tono puro ni sostenido: el segundo armónico pesa, la frecuencia
 *     TIEMBLA —eso es lo que más lo delata— y arranca con un soplo de ruido. Y
 *     el temblor no es uno solo ni va a compás: son dos, rápido y lento, con
 *     las fases corridas, y el lento mueve también el volumen. A la salida, un
 *     filtro suave le quita el filo metálico sin apagar la caña.
 *
 * Cada pío sale con una pizca de azar en el tono y en la duración: dos píos
 * exactamente iguales suenan a máquina, y un pollito nunca repite el mismo.
 */

const CLAVE_PREF = 'incubapp_sonido'
const VOLUMEN = 0.14 // el pío se oye mucho: bajo de sobra, y menos que la
                     // primera versión, que además de picar iba 4 dB más alto

/** «pi-pí» del splash: el segundo, un pelo más agudo y más corto. */
const SPLASH = [
  { t: 0.0, f0: 3250, dur: 0.19 },
  { t: 0.5, f0: 3480, dur: 0.17 },
]

/** «pío-pío-pío» de una notificación: tres seguidos, el del medio más alto. */
const NOTIFICACION = [
  { t: 0.0, f0: 3300, dur: 0.18 },
  { t: 0.46, f0: 3520, dur: 0.17 },
  { t: 0.92, f0: 3180, dur: 0.21 },
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
  // Un filtro suave a la salida: le quita el brillo metálico de arriba sin
  // apagar el pío. Sin él, lo poco que se cuela por encima de 6 kHz es
  // justo lo que picaba en el oído.
  const dulce = ctx.createBiquadFilter()
  dulce.type = 'lowpass'
  dulce.frequency.value = 7600
  dulce.Q.value = 0.7
  maestro.connect(dulce)
  dulce.connect(ctx.destination)
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
  f.frequency.value = 3600
  f.Q.value = 0.9
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  s.connect(f)
  f.connect(g)
  g.connect(maestro)
  s.start(t0)
  s.stop(t0 + dur + 0.01)
}

/**
 * Un pío. `t0` es el reloj del contexto, no el del navegador.
 *
 * Tres cosas hacen que suene a pollito y no a flauta, y las tres hacen falta
 * juntas —la primera versión suave las tenía a medias y sonaba a silbato—:
 *
 *   1. El TEMBLOR. Un pollito no sostiene el tono: le vibra. Un LFO de unos
 *      30 Hz mueve la frecuencia un 3 % arriba y abajo. Esto es lo que más se
 *      nota al quitarlo.
 *   2. El SEGUNDO ARMÓNICO fuerte. Es lo que le da la caña de bicho; con el
 *      fundamental casi solo queda un silbido de olla.
 *   3. La CAÍDA. El pío sube de golpe en la primera sexta parte y luego cae
 *      largo, hasta un cuarto por debajo de donde arrancó. Sin esa cola
 *      descendente es un bip.
 */
function pio(t0, { f0, dur }) {
  const t1 = t0 + dur

  const salida = ctx.createGain()
  // Ataque rápido pero sin chasquido, y una caída larga en vez de una meseta:
  // la meseta plana es lo que sonaba a aparato.
  salida.gain.setValueAtTime(0.0001, t0)
  salida.gain.exponentialRampToValueAtTime(1, t0 + 0.014)
  salida.gain.exponentialRampToValueAtTime(0.55, t0 + dur * 0.55)
  salida.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.06)
  salida.connect(maestro)

  // DOS temblores, no uno. Con un solo LFO el vibrato sale medido y suena a
  // sintetizador: el bicho de verdad no tiembla a compás. Uno rápido de unos
  // 30 Hz y otro lento de 7, con fases que arrancan a destiempo, y entre los
  // dos el pulso deja de ser periódico.
  const rapido = ctx.createOscillator()
  rapido.type = 'sine'
  rapido.frequency.value = 26 + Math.random() * 10
  const lento = ctx.createOscillator()
  lento.type = 'sine'
  lento.frequency.value = 6 + Math.random() * 4
  // Arrancarlos antes del pío les corre la fase: si los dos empiezan en cero
  // en cada pío, los tres de una notificación tiemblan exactamente igual.
  // Nunca antes del reloj: con el contexto recién creado, t0 son dos
  // centésimas y arrancar 0,2 s antes es un tiempo NEGATIVO, que `start()`
  // rechaza con excepción — y ahí se queda el pío sin sonar.
  const desfase = 0.05 + Math.random() * 0.2
  const arranque = Math.max(ctx.currentTime, t0 - desfase)
  ;[rapido, lento].forEach((o) => { o.start(arranque); o.stop(t1 + 0.08) })

  // El vaivén de volumen va con el de tono, como en el bicho: va en su propio
  // nodo, en serie, para que la cola siga muriendo del todo al final.
  const vaiven = ctx.createGain()
  vaiven.gain.value = 1
  const profAm = ctx.createGain()
  profAm.gain.value = 0.09
  lento.connect(profAm)
  profAm.connect(vaiven.gain)
  vaiven.connect(salida)

  ;[1, 0.38, 0.13].forEach((peso, i) => {
    const n = i + 1
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f0 * 0.84 * n, t0)
    o.frequency.exponentialRampToValueAtTime(f0 * 1.08 * n, t0 + dur * 0.16)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.95 * n, t0 + dur * 0.55)
    o.frequency.exponentialRampToValueAtTime(f0 * 0.74 * n, t1)

    const pr = ctx.createGain()
    pr.gain.value = f0 * 0.028 * n
    rapido.connect(pr)
    pr.connect(o.frequency)
    const pl = ctx.createGain()
    pl.gain.value = f0 * 0.013 * n
    lento.connect(pl)
    pl.connect(o.frequency)

    const g = ctx.createGain()
    g.gain.value = peso
    o.connect(g)
    g.connect(vaiven)
    o.start(t0)
    o.stop(t1 + 0.06)
  })

  soplo(t0, 0.035, 0.045)
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
