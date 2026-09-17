/**
 * =============================================================================
 * ARCHIVO: src/lib/sonidoPollito.js
 * PROPÓSITO: Sintetizador acústico ultra-realista del pío de un pollito de 1 día.
 * MODELO ACÚSTICO: Simula la siringe, cavidad del pico, soplo respiratorio
 * y vibrato característico del pío de un ave recién nacida en granja.
 * Documentado y mantenido por: Henry Stark Desarrollador - IncubApp SIG
 * =============================================================================
 */

const CLAVE_PREF = 'incubapp_sonido'
const VOLUMEN_MAESTRO = 0.16

/** Secuencia «pi-pí» del splash: 2 píos naturales */
const SPLASH = [
  { t: 0.0, fPeak: 4250, dur: 0.165, pitchVar: 1.0 },
  { t: 0.38, fPeak: 4500, dur: 0.150, pitchVar: 1.06 },
]

/** Secuencia «pío-pío-pío» de notificación: 3 píos rítmicos reales */
const NOTIFICACION = [
  { t: 0.0, fPeak: 4180, dur: 0.155, pitchVar: 0.98 },
  { t: 0.32, fPeak: 4480, dur: 0.145, pitchVar: 1.04 },
  { t: 0.68, fPeak: 4050, dur: 0.180, pitchVar: 0.94 },
]

let ctx = null
let maestro = null
let bufSoplo = null
let bufChasquido = null
let pendiente = null

/** ¿El usuario tiene activado el sonido? */
export function sonidoActivo() {
  try {
    return localStorage.getItem(CLAVE_PREF) !== '0'
  } catch {
    return true
  }
}

/** Enciende o apaga el sonido de la app */
export function setSonidoActivo(v) {
  try {
    localStorage.setItem(CLAVE_PREF, v ? '1' : '0')
  } catch {}
  if (v) despertar()
}

function crear() {
  if (ctx) return ctx
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  ctx = new AC()
  maestro = ctx.createGain()
  maestro.gain.value = VOLUMEN_MAESTRO

  // Filtro de salida suavizador (Simula acústica ambiente de incubadora/ambiente natural)
  const filtroAmbiente = ctx.createBiquadFilter()
  filtroAmbiente.type = 'lowpass'
  filtroAmbiente.frequency.value = 8500
  filtroAmbiente.Q.value = 0.65

  maestro.connect(filtroAmbiente)
  filtroAmbiente.connect(ctx.destination)
  return ctx
}

/** Reanuda o inicializa el AudioContext */
export function despertar() {
  const c = crear()
  if (!c) return null
  if (c.state === 'suspended') c.resume().catch(() => {})
  return c
}

/** Genera el micro-chasquido inicial al abrir el pico el pollito (transitorio de 3-5ms) */
function chasquidoPico(t0) {
  if (!bufChasquido) {
    const samples = Math.floor(ctx.sampleRate * 0.005)
    bufChasquido = ctx.createBuffer(1, samples, ctx.sampleRate)
    const data = bufChasquido.getChannelData(0)
    for (let i = 0; i < samples; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (samples * 0.3))
    }
  }
  const s = ctx.createBufferSource()
  s.buffer = bufChasquido

  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 4500

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.025, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.005)

  s.connect(f)
  f.connect(g)
  g.connect(maestro)

  s.start(t0)
  s.stop(t0 + 0.006)
}

/** Soplo de aire siringeal sutil durante el pío */
function soploSiringe(t0, dur, vol) {
  if (!bufSoplo) {
    const n = Math.floor(ctx.sampleRate * 0.15)
    bufSoplo = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = bufSoplo.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  }
  const s = ctx.createBufferSource()
  s.buffer = bufSoplo

  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 4200
  f.Q.value = 1.8

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.25)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  s.connect(f)
  f.connect(g)
  g.connect(maestro)

  s.start(t0)
  s.stop(t0 + dur + 0.01)
}

/**
 * Sintetiza un pío individual de pollito real de 1 día.
 * @param {number} t0 - Tiempo en AudioContext
 * @param {Object} config - Parámetros del pío
 */
function pioReal(t0, { fPeak, dur, pitchVar }) {
  const t1 = t0 + dur

  // Variaciones orgánicas aleatorias por pío (micro-diferencias del ser vivo)
  const factorOrg = 1 + (Math.random() * 2 - 1) * 0.025
  const peakFreq = fPeak * pitchVar * factorOrg
  const startFreq = peakFreq * 0.72
  const midFreq = peakFreq * 0.88
  const endFreq = peakFreq * 0.58

  // Envelope de volumen principal del pío (Ataque rápido, envolvente de pico y caída)
  const salida = ctx.createGain()
  salida.gain.setValueAtTime(0.0001, t0)
  salida.gain.linearRampToValueAtTime(0.9, t0 + 0.012)
  salida.gain.exponentialRampToValueAtTime(0.45, t0 + dur * 0.5)
  salida.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.02)

  // Filtro de Resonancia del Pico (Resonancia de la cavidad bucal del pollito)
  const filtroPico = ctx.createBiquadFilter()
  filtroPico.type = 'bandpass'
  filtroPico.frequency.setValueAtTime(startFreq, t0)
  filtroPico.frequency.exponentialRampToValueAtTime(peakFreq, t0 + dur * 0.22)
  filtroPico.frequency.exponentialRampToValueAtTime(endFreq, t1)
  filtroPico.Q.value = 2.4

  salida.connect(filtroPico)
  filtroPico.connect(maestro)

  // LFO 1: Vibrato rápido siringeal (36-42 Hz) - temblor rápido de garganta
  const lfoRapido = ctx.createOscillator()
  lfoRapido.type = 'sine'
  lfoRapido.frequency.value = 36 + Math.random() * 8

  // LFO 2: Modulación lenta de timbre (8-12 Hz)
  const lfoLento = ctx.createOscillator()
  lfoLento.type = 'sine'
  lfoLento.frequency.value = 8 + Math.random() * 4

  const tStartLFO = Math.max(ctx.currentTime, t0 - 0.05)
  lfoRapido.start(tStartLFO)
  lfoLento.start(tStartLFO)
  lfoRapido.stop(t1 + 0.05)
  lfoLento.stop(t1 + 0.05)

  // Osciladores Armónicos Siringeales (Fundamental + 2do armónico de resonancia)
  const armónicos = [
    { n: 1, gain: 0.85, type: 'sine' },       // Tono siringeal puro fundamental
    { n: 2, gain: 0.28, type: 'sine' },       // 2do armónico brillante
    { n: 1.5, gain: 0.12, type: 'triangle' }, // Formante interna suave
  ]

  armónicos.forEach(({ n, gain, type }) => {
    const osc = ctx.createOscillator()
    osc.type = type

    // Trayectoria de frecuencia parabólica/deslizable real
    osc.frequency.setValueAtTime(startFreq * n, t0)
    osc.frequency.exponentialRampToValueAtTime(peakFreq * n, t0 + dur * 0.22)
    osc.frequency.exponentialRampToValueAtTime(midFreq * n, t0 + dur * 0.6)
    osc.frequency.exponentialRampToValueAtTime(endFreq * n, t1)

    // Acoplar Vibrato rápido
    const gainVib = ctx.createGain()
    gainVib.gain.value = peakFreq * 0.024 * n
    lfoRapido.connect(gainVib)
    gainVib.connect(osc.frequency)

    // Acoplar Modulación lenta
    const gainLento = ctx.createGain()
    gainLento.gain.value = peakFreq * 0.012 * n
    lfoLento.connect(gainLento)
    gainLento.connect(osc.frequency)

    const gArm = ctx.createGain()
    gArm.gain.value = gain
    osc.connect(gArm)
    gArm.connect(salida)

    osc.start(t0)
    osc.stop(t1 + 0.03)
  })

  // Chasquido inicial del pico + soplo de respiración siringeal
  chasquidoPico(t0)
  soploSiringe(t0, dur * 0.8, 0.025)
}

/** Reproduce una secuencia de píos */
function reproducir(secuencia) {
  if (!sonidoActivo()) return true
  const c = despertar()
  if (!c || c.state !== 'running') return false

  const t0 = c.currentTime + 0.02
  secuencia.forEach((p) => {
    pioReal(t0 + p.t, p)
  })
  return true
}

/** Pío de bienvenida del Splash Screen */
export function pioSplash() {
  if (reproducir(SPLASH)) return
  pendiente = { seq: SPLASH, hasta: Date.now() + 12000 }
}

/** Pío de Notificación de la aplicación */
export function pioNotificacion() {
  reproducir(NOTIFICACION)
}

/** Devuelve el nodo maestro de salida audio */
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
