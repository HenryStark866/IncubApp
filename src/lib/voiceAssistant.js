/**
 * Asistente de voz de IncubApp: entiende la pregunta, responde y la lee en voz alta.
 *
 * 1. Lo del propio turno («¿qué me toca?», «¿cuántas rondas llevo?», «¿a qué hora
 *    salgo?») y el paso a paso de la app («¿cómo reporto una falla?») se responden
 *    al instante con los datos del inicio, sin internet ni IA.
 * 2. Lo demás va al flujo «Asistente de voz» de n8n (Claude, con el contexto del
 *    turno) por la ruta /asistente del propio servidor.
 * 3. Si eso no responde (sin clave, sin señal), contesta con el manual local.
 * Henry Stark Desarrollador · CDH Maker
 */
import { supabase } from './supabase'
import { retrieveKnowledge } from './incubationKnowledge'
import { getAssistantContext } from './assistantContext'

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const lista = (items = [], max = 4) => {
  const xs = items.filter(Boolean).slice(0, max)
  if (!xs.length) return ''
  if (xs.length === 1) return xs[0]
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
}

/** Paso a paso de la app: siempre igual, para leer en voz alta. */
const COMO = {
  asistencia:
    'Para marcar ingreso, en Inicio toca «Selfie y marcar ingreso»: te pide una selfie y el GPS, y debes estar dentro de la planta. Al terminar el turno, en el mismo lugar marcas la salida.',
  falla:
    'Para reportar una falla, en Inicio toca «Reportar falla», elige qué pasa, la máquina o la sala, la urgencia y toma una foto. Queda como orden de trabajo para mantenimiento. Si hay riesgo para alguien, primero avisa al supervisor.',
  ronda:
    'Para la ronda, en Inicio toca «Continuar ronda», entra a la sala y toma la foto de la pantalla de cada máquina; marca Sin novedad, Alerta o Falla, o «Está apagada». Al terminar la hora, toca «Terminar ronda» y sale el formato FOMAT04.',
  formato:
    'Cada registro llena su formato solo: la ronda sale en el FOMAT04, la orden de trabajo en el FOMAT01, la falla que reportas en el FOMAT06 y la calibración en el FOMAT08. Los ves con el botón «Ver formato» del registro.',
  calibracion:
    'Para calibrar, abre Calibración, elige la máquina y toma la foto de la pantalla y la del calibrador patrón; la app calcula la diferencia y llena el FOMAT08.',
  novedad:
    'Para dejar una novedad o la entrega de turno, en Inicio toca «Escribir novedad» o «Entrega de turno», escribe o dicta lo que pasó y guarda. Cuenta como reporte de ronda.',
  actividad:
    'Tus actividades están en «Me asignaron»: toca Iniciar cuando empieces y Terminar al acabar, con la cantidad, una nota y una foto.',
}

const INTENTS = [
  { id: 'como_asistencia', re: /(como|donde|que hago|ayuda).*(marc|ingreso|entrada|asistencia|salida|selfie)|marcar (ingreso|salida|entrada)/ },
  { id: 'como_falla', re: /(como|donde).*(report|avis|falla|dan|incidencia|orden de trabajo| ot\b)|se (dano|danio|daño|averio)|no (enciende|voltea|prende|funciona)/ },
  { id: 'como_calibracion', re: /calibr/ },
  { id: 'como_novedad', re: /(como|donde).*(novedad|entrega de turno|reporte escrito)/ },
  { id: 'como_ronda', re: /(como|donde).*(ronda|foto|pantalla)/ },
  { id: 'formato', re: /formato|fomat|foinc/ },
  { id: 'como_actividad', re: /(como|donde).*(actividad|tarea asignada|me asignaron)/ },
  { id: 'rondas', re: /cuantas rondas|rondas (llevo|van|tengo|me faltan)|como voy (con|en)? ?(las )?rondas|(la|mi) ronda (de|actual)|falta(n)? (en|de) la ronda/ },
  { id: 'turno', re: /(a que hora|cuando) (salgo|termino|acaba|entro|empieza)|proximo turno|siguiente turno|mi turno|horario|cuanto (falta|queda) (del|de) turno/ },
  { id: 'maquinas', re: /(que|cuales|hay) maquinas?|novedad(es)?|alertas?|fallas? (hay|tiene|en)/ },
  { id: 'pendientes', re: /(que|q) (me toca|tengo|hago|debo|sigue|hay pendiente)|pendiente|mis tareas|por hacer|que falta|siguiente paso|atencion/ },
  { id: 'saludo', re: /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey)\b/ },
]

export function detectIntent(question) {
  const q = ` ${norm(question)} `
  return INTENTS.find((i) => i.re.test(q))?.id || null
}

/**
 * Respuesta local, sin internet. `sure` = se puede responder con certeza aquí.
 * @returns {{ text: string, sure: boolean, intent: string|null } | null}
 */
export function localAnswer(question, ctx = {}) {
  const intent = detectIntent(question)
  const nombre = ctx.nombre ? `${ctx.nombre}, ` : ''
  switch (intent) {
    case 'como_asistencia':
      return { intent, sure: true, text: `${COMO.asistencia}${ctx.asistencia ? ` Ahora: ${ctx.asistencia}.` : ''}` }
    case 'como_falla':
      return { intent, sure: true, text: COMO.falla }
    case 'como_calibracion':
      return { intent, sure: true, text: COMO.calibracion }
    case 'como_novedad':
      return { intent, sure: true, text: COMO.novedad }
    case 'como_ronda':
      return { intent, sure: true, text: COMO.ronda }
    case 'formato':
      return { intent, sure: true, text: COMO.formato }
    case 'como_actividad':
      return { intent, sure: true, text: COMO.actividad }
    case 'rondas':
      if (ctx.rondas) return { intent, sure: true, text: `${nombre}${ctx.rondas}.` }
      break
    case 'turno':
      if (ctx.turno || ctx.proximoTurno)
        return { intent, sure: true, text: [ctx.turno && `Estás en el ${ctx.turno}`, ctx.proximoTurno && `Tu próximo turno: ${ctx.proximoTurno}`].filter(Boolean).join('. ') + '.' }
      break
    case 'maquinas':
      if (Array.isArray(ctx.maquinasNovedad))
        return {
          intent,
          sure: true,
          text: ctx.maquinasNovedad.length
            ? `Con novedad en el turno: ${lista(ctx.maquinasNovedad, 5)}.`
            : 'No hay máquinas con alerta ni falla en el turno por ahora.',
        }
      break
    case 'pendientes':
      if (ctx.siguiente || ctx.pendientes) {
        const resto = (ctx.pendientes || []).filter((p) => p !== ctx.siguiente)
        return {
          intent,
          sure: true,
          text: [
            ctx.siguiente ? `${nombre}lo primero: ${ctx.siguiente}.` : null,
            resto.length ? `Después: ${lista(resto, 4)}.` : !ctx.siguiente ? 'No tienes nada pendiente por ahora.' : null,
          ]
            .filter(Boolean)
            .join(' '),
        }
      }
      break
    case 'saludo':
      return {
        intent,
        sure: true,
        text: `Hola${ctx.nombre ? `, ${ctx.nombre}` : ''}. Pregúntame qué te toca, cuántas rondas llevas o cómo hacer algo en la app.`,
      }
    default:
      break
  }
  return intent ? { intent, sure: false, text: '' } : null
}

/** Respuesta con el manual local (cuando la IA no responde). */
export function knowledgeAnswer(question) {
  const chunk = retrieveKnowledge(question, 1)[0]
  if (!chunk?.text) return null
  const frases = chunk.text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 3).join(' ')
  return frases || null
}

/** Contexto compacto para mandar al servidor (sin datos de más). */
export function compactContext(ctx = {}) {
  const out = {}
  for (const [k, v] of Object.entries(ctx)) {
    if (v == null || v === '' || k === 'actualizado') continue
    out[k] = Array.isArray(v) ? v.slice(0, 8) : typeof v === 'string' ? v.slice(0, 600) : v
  }
  return out
}

/**
 * Responde una pregunta. Devuelve { text, source: 'local'|'ia'|'manual' }.
 * @param {{ question: string, history?: Array<{rol, texto}>, fetchImpl?: Function, timeoutMs?: number }} p
 */
export async function askAssistant({ question, history = [], fetchImpl = typeof fetch !== 'undefined' ? fetch : null, timeoutMs = 25000 }) {
  const ctx = getAssistantContext()
  const local = localAnswer(question, ctx)
  if (local?.sure) return { text: local.text, source: 'local' }

  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  if (online && fetchImpl) {
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (token) {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
        const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
        const res = await fetchImpl('/asistente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pregunta: question, contexto: compactContext(ctx), historial: history.slice(-6) }),
          signal: ctrl?.signal,
        })
        if (timer) clearTimeout(timer)
        if (res.ok) {
          const body = await res.json().catch(() => null)
          if (body?.texto) return { text: body.texto, source: 'ia' }
        }
      }
    } catch {
      /* sin respuesta de la IA: se contesta con lo local */
    }
  }

  const manual = knowledgeAnswer(question)
  if (manual) return { text: manual, source: 'manual' }
  return {
    text: online
      ? 'No tengo esa respuesta ahora. Pregúntame qué te toca, cuántas rondas llevas o cómo hacer algo en la app, o consúltalo con tu supervisor.'
      : 'Sin conexión solo puedo responder sobre tu turno y el paso a paso de la app. Pregúntame qué te toca o cómo hacer algo.',
    source: 'manual',
  }
}

/* ── Voz ─────────────────────────────────────────────────────────────── */

export function speechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'

function spanishVoice() {
  const voices = window.speechSynthesis.getVoices() || []
  const pref = [/^es[-_]CO/i, /^es[-_](US|419|MX)/i, /^es[-_]ES/i, /^es/i]
  for (const re of pref) {
    const v = voices.find((x) => re.test(x.lang))
    if (v) return v
  }
  return null
}

/** Lee el texto en voz alta. Devuelve una promesa que termina cuando acaba de hablar. */
export function speak(text, { onStart, onEnd } = {}) {
  if (!canSpeak() || !text) return Promise.resolve()
  window.speechSynthesis.cancel()
  return new Promise((resolve) => {
    const u = new window.SpeechSynthesisUtterance(String(text).replace(/[«»*_#]/g, ''))
    u.lang = 'es-CO'
    const v = spanishVoice()
    if (v) u.voice = v
    u.rate = 1.02
    u.onstart = () => onStart?.()
    const done = () => {
      onEnd?.()
      resolve()
    }
    u.onend = done
    u.onerror = done
    window.speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel()
}
