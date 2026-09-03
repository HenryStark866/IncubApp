/**
 * Motor del Asesor IA: RAG local + LLM opcional + herramientas Google.
 * Henry Stark Desarrollador
 */

import {
  ADVISOR_SYSTEM,
  retrieveKnowledge,
  ADVISOR_SUGGESTIONS,
} from './incubationKnowledge'
import {
  gmailListMessages,
  gmailSend,
  calendarCreateEvent,
  calendarListUpcoming,
  driveListFiles,
  sheetsCreate,
  driveCreateDoc,
  loadStoredToken,
} from './googleWorkspace'

export { ADVISOR_SUGGESTIONS }

function llmConfigured() {
  try {
    return Boolean(
      import.meta.env.VITE_XAI_API_KEY ||
        import.meta.env.VITE_OPENAI_API_KEY ||
        import.meta.env.VITE_GROQ_API_KEY
    )
  } catch {
    return false
  }
}

/**
 * Detecta intención de herramienta en lenguaje natural.
 */
export function detectToolIntent(text) {
  const q = (text || '').toLowerCase()
  if (/conecta(r)? google|autoriza google|login google/.test(q)) {
    return { tool: 'connect_google' }
  }
  if (/desconecta(r)? google|cerrar google/.test(q)) {
    return { tool: 'disconnect_google' }
  }
  if (
    /(lee|revisa|muestra|lista).*(correo|email|gmail|bandeja)|correos recientes|inbox/.test(q)
  ) {
    return { tool: 'gmail_list', args: { max: 6 } }
  }
  if (/(env[ií]a|manda).*(correo|email|mail)/.test(q) || /correo a\s+\S+@/.test(q)) {
    const email = (text.match(/[\w.+-]+@[\w.-]+\.\w+/) || [])[0]
    return {
      tool: 'gmail_send_draft',
      args: {
        to: email || '',
        subject: '',
        body: text,
        needsConfirm: true,
      },
    }
  }
  if (/(redacta|escribe|borrador).*(correo|email)/.test(q)) {
    return { tool: 'gmail_draft_only', args: { prompt: text } }
  }
  if (/(agenda|programa|crea).*(reuni[oó]n|evento|cita)/.test(q) || /calendar/.test(q)) {
    return { tool: 'calendar_create_draft', args: { prompt: text, needsConfirm: true } }
  }
  if (/(qu[eé] tengo|pr[oó]ximos eventos|mi agenda|calendario)/.test(q)) {
    return { tool: 'calendar_list' }
  }
  if (/(lista|muestra).*(drive|archivos|documentos en drive)/.test(q)) {
    return { tool: 'drive_list' }
  }
  if (/(crea|genera).*(hoja|spreadsheet|excel en drive|google sheet)/.test(q)) {
    return { tool: 'sheets_create', args: { prompt: text } }
  }
  if (/(crea|guarda).*(doc|documento|nota en drive)/.test(q)) {
    return { tool: 'drive_doc', args: { prompt: text } }
  }
  return null
}

function parseWhen(prompt) {
  const now = new Date()
  const p = (prompt || '').toLowerCase()
  let day = new Date(now)
  if (/pasado ma[nñ]ana/.test(p)) day.setDate(day.getDate() + 2)
  else if (/ma[nñ]ana/.test(p)) day.setDate(day.getDate() + 1)
  else if (/hoy/.test(p)) {
    /* today */
  }
  const hm = p.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  let h = 9
  let m = 0
  if (hm) {
    h = Number(hm[1])
    m = Number(hm[2] || 0)
    if (hm[3] === 'pm' && h < 12) h += 12
    if (hm[3] === 'am' && h === 12) h = 0
  }
  day.setHours(h, m, 0, 0)
  const end = new Date(day.getTime() + 60 * 60 * 1000)
  return { start: day, end }
}

function localAnswer(userText, history = []) {
  const chunks = retrieveKnowledge(userText, 4)
  const ctx = chunks.map((c) => c.text).join('\n\n')
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.text

  // Conversational openers
  if (/^(hola|buenas|buen d[ií]a|hey|qui[eé]n eres)/i.test(userText.trim())) {
    return {
      text:
        'Hola. Soy el Asesor de IncubApp: incubación (setters/nacedoras), referencias tipo Petersime, levantes, bioseguridad, mantenimiento y gerencia. ' +
        'También puedo ayudarte con Gmail, Calendar y Drive si conectas Google. ¿En qué te enfoco?',
      sources: chunks.map((c) => c.id),
    }
  }

  if (!ctx) {
    return {
      text:
        'Puedo orientarte en incubación industrial, equipos (p. ej. filosofía Petersime / single-stage vs multi-stage), levantes y grading, bioseguridad, mantenimiento de planta y gerencia en IncubApp. ' +
        'También: «revisa mis correos», «redacta un correo…», «agenda reunión mañana 9am», «crea una hoja en Drive». ' +
        (lastUser ? `Siguiendo tu hilo anterior: «${lastUser.slice(0, 80)}…» — ` : '') +
        '¿Me das un poco más de detalle (máquina, lote, síntoma o decisión)?',
      sources: [],
    }
  }

  // Build natural answer from chunks
  let lead = 'Te resumo con base en buenas prácticas de incubación/levante y el diseño de IncubApp:\n\n'
  if (/petersime/i.test(userText)) {
    lead =
      'Sobre Petersime y equipos de incubación avanzada (siempre manda el manual de tu modelo instalado):\n\n'
  } else if (/levante|grading/i.test(userText)) {
    lead = 'En levantes y uniformidad, esto es lo que más suele mover la aguja:\n\n'
  } else if (/nacedora|transfer|hatcher/i.test(userText)) {
    lead = 'En transferencia y nacedora, enfócate en esto:\n\n'
  }

  const body = chunks
    .map((c, i) => `${i + 1}) ${c.text.split('\n').filter(Boolean).slice(0, 4).join(' ')}`)
    .join('\n\n')

  const tail =
    '\n\nSi me das el modelo de máquina, la etapa del embrión/lote o el síntoma (T°, HR, picaje, mortalidad), afino la recomendación. ' +
    'Para operación diaria de fallas, coordina con planta/mantenimiento en IncubApp.'

  return { text: lead + body + tail, sources: chunks.map((c) => c.id) }
}

async function callLlm({ userText, history, knowledgeText, toolNote }) {
  const xai = import.meta.env.VITE_XAI_API_KEY
  const openai = import.meta.env.VITE_OPENAI_API_KEY
  const groq = import.meta.env.VITE_GROQ_API_KEY

  let url
  let key
  let model
  if (xai) {
    url = 'https://api.x.ai/v1/chat/completions'
    key = xai
    model = import.meta.env.VITE_XAI_MODEL || 'grok-2-latest'
  } else if (groq) {
    url = 'https://api.groq.com/openai/v1/chat/completions'
    key = groq
    model = import.meta.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile'
  } else if (openai) {
    url = 'https://api.openai.com/v1/chat/completions'
    key = openai
    model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
  } else {
    return null
  }

  const msgs = [
    {
      role: 'system',
      content:
        ADVISOR_SYSTEM +
        '\n\nConocimiento recuperado:\n' +
        (knowledgeText || '(sin fragmentos)') +
        (toolNote ? `\n\nResultado de herramientas:\n${toolNote}` : ''),
    },
    ...history.slice(-10).map((m) => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.text,
    })),
    { role: 'user', content: userText },
  ]

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: msgs,
      temperature: 0.55,
      max_tokens: 1200,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LLM ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || null
}

/**
 * Ejecuta una herramienta (o prepara borrador a confirmar).
 */
export async function runAdvisorTool(intent, { confirmPayload } = {}) {
  const googleOn = Boolean(loadStoredToken()?.access_token)

  if (intent.tool === 'connect_google') {
    return { type: 'action', action: 'connect_google' }
  }
  if (intent.tool === 'disconnect_google') {
    return { type: 'action', action: 'disconnect_google' }
  }

  if (!googleOn && intent.tool !== 'gmail_draft_only') {
    return {
      type: 'text',
      text:
        'Para eso necesito que conectes tu cuenta de Google (botón «Conectar Google»). ' +
        'Pedirá permiso de Gmail, Calendar y Drive/Hojas. No guardo tu contraseña: solo un token temporal en este navegador.',
    }
  }

  switch (intent.tool) {
    case 'gmail_list': {
      const list = await gmailListMessages({ max: intent.args?.max || 6 })
      if (!list.length) {
        return { type: 'text', text: 'No encontré correos recientes en la bandeja con ese criterio.' }
      }
      const summary = list
        .map(
          (m, i) =>
            `${i + 1}. **${m.subject || '(sin asunto)'}**\n   De: ${m.from}\n   ${m.snippet || m.body.slice(0, 140)}`
        )
        .join('\n\n')
      return {
        type: 'text',
        text: `Aquí tienes un resumen de tus correos recientes:\n\n${summary}\n\n¿Quieres que redacte una respuesta a alguno (indica el número)?`,
        data: list,
      }
    }
    case 'gmail_draft_only': {
      const prompt = intent.args?.prompt || ''
      const draft = {
        to: (prompt.match(/[\w.+-]+@[\w.-]+\.\w+/) || [])[0] || '',
        subject: /asunto[:\s]+(.+)/i.test(prompt)
          ? prompt.match(/asunto[:\s]+(.+)/i)[1].slice(0, 120)
          : 'Seguimiento IncubApp / planta',
        body:
          `Buen día,\n\n` +
          `Escribo respecto a: ${prompt.replace(/redacta|escribe|borrador|correo|email/gi, '').trim() || 'el tema acordado'}.\n\n` +
          `Quedo atento(a) a sus comentarios.\n\nSaludos cordiales,\n`,
      }
      return {
        type: 'confirm',
        tool: 'gmail_send',
        title: 'Borrador de correo (revisa antes de enviar)',
        payload: draft,
        text: `Borrador listo${draft.to ? ` para ${draft.to}` : ''}.\nAsunto: ${draft.subject}\n\n${draft.body}\n\nSi está bien, confirma el envío (completa el destinatario si falta).`,
      }
    }
    case 'gmail_send_draft': {
      const draft = {
        to: intent.args?.to || '',
        subject: intent.args?.subject || 'Mensaje desde IncubApp',
        body: intent.args?.body || '',
      }
      return {
        type: 'confirm',
        tool: 'gmail_send',
        title: 'Confirmar envío de correo',
        payload: draft,
        text: `¿Envío este correo?\nPara: ${draft.to || '(falta email)'}\nAsunto: ${draft.subject}\n\n${draft.body}`,
      }
    }
    case 'gmail_send': {
      const p = confirmPayload || intent.args
      if (!p?.to) throw new Error('Falta destinatario (to)')
      await gmailSend(p)
      return { type: 'text', text: `Correo enviado a ${p.to}.` }
    }
    case 'calendar_list': {
      const ev = await calendarListUpcoming({ max: 8 })
      if (!ev.length) return { type: 'text', text: 'No hay eventos próximos en tu calendario principal.' }
      return {
        type: 'text',
        text:
          'Próximos eventos:\n' +
          ev.map((e, i) => `${i + 1}. ${e.summary || '(sin título)'} — ${e.start}`).join('\n'),
        data: ev,
      }
    }
    case 'calendar_create_draft': {
      const { start, end } = parseWhen(intent.args?.prompt)
      const summary =
        intent.args?.prompt?.replace(/agenda|programa|crea|reunión|reunion|evento|cita/gi, '').trim() ||
        'Reunión IncubApp'
      const payload = {
        summary: summary.slice(0, 120) || 'Reunión',
        description: 'Creado desde Asesor IncubApp',
        startIso: start.toISOString(),
        endIso: end.toISOString(),
      }
      return {
        type: 'confirm',
        tool: 'calendar_create',
        title: 'Confirmar evento en Calendar',
        payload,
        text: `¿Creo este evento?\n${payload.summary}\nInicio: ${start.toLocaleString('es-CO')}\nFin: ${end.toLocaleString('es-CO')}`,
      }
    }
    case 'calendar_create': {
      const p = confirmPayload || intent.args
      const ev = await calendarCreateEvent(p)
      return {
        type: 'text',
        text: `Evento creado: ${p.summary}. ${ev.htmlLink ? `Abrir: ${ev.htmlLink}` : ''}`,
        data: ev,
      }
    }
    case 'drive_list': {
      const files = await driveListFiles({ max: 10 })
      if (!files.length) return { type: 'text', text: 'No veo archivos recientes en Drive (con el permiso actual).' }
      return {
        type: 'text',
        text:
          'Archivos en Drive:\n' +
          files
            .map((f, i) => `${i + 1}. ${f.name} (${f.mimeType?.split('.').pop() || 'file'})`)
            .join('\n'),
        data: files,
      }
    }
    case 'sheets_create': {
      const title =
        intent.args?.prompt?.replace(/crea|genera|hoja|spreadsheet|google|sheet|en drive/gi, '').trim() ||
        `IncubApp ${new Date().toLocaleDateString('es-CO')}`
      const sheet = await sheetsCreate({
        title,
        headers: ['Fecha', 'Tema', 'Nota', 'Responsable'],
        rows: [[new Date().toISOString().slice(0, 10), 'Seguimiento', '', '']],
      })
      return {
        type: 'text',
        text: `Hoja de cálculo creada: «${title}».\n${sheet.url}`,
        data: sheet,
      }
    }
    case 'drive_doc': {
      const name =
        intent.args?.prompt?.replace(/crea|guarda|doc|documento|nota|en drive/gi, '').trim() ||
        'Nota IncubApp'
      const doc = await driveCreateDoc({
        name: name.slice(0, 80),
        content: intent.args?.prompt || 'Nota creada desde Asesor IncubApp',
      })
      return {
        type: 'text',
        text: `Documento creado: ${doc.name}\n${doc.url}`,
        data: doc,
      }
    }
    default:
      return { type: 'text', text: 'No reconocí esa herramienta.' }
  }
}

/**
 * Turno completo del asesor.
 */
export async function askAdvisor({ userText, history = [], executeConfirm }) {
  const text = (userText || '').trim()
  if (!text && !executeConfirm) {
    return { text: 'Escribe tu consulta o elige una sugerencia.', role: 'bot' }
  }

  // Confirmación de herramienta pendiente
  if (executeConfirm) {
    try {
      const result = await runAdvisorTool(
        { tool: executeConfirm.tool, args: executeConfirm.payload },
        { confirmPayload: executeConfirm.payload }
      )
      return { ...result, role: 'bot' }
    } catch (e) {
      return { text: `No pude completar la acción: ${e.message}`, role: 'bot', error: true }
    }
  }

  const intent = detectToolIntent(text)
  if (intent) {
    try {
      const result = await runAdvisorTool(intent)
      if (result.type === 'action') return { ...result, role: 'bot' }
      if (result.type === 'confirm') return { ...result, role: 'bot' }
      // Optionally polish tool result with LLM
      if (llmConfigured() && result.type === 'text' && result.text) {
        try {
          const polished = await callLlm({
            userText: text,
            history,
            knowledgeText: retrieveKnowledge(text, 3)
              .map((c) => c.text)
              .join('\n'),
            toolNote: result.text,
          })
          if (polished) return { text: polished, role: 'bot', data: result.data }
        } catch {
          /* keep raw tool result */
        }
      }
      return { ...result, role: 'bot' }
    } catch (e) {
      return { text: `Error de herramienta: ${e.message}`, role: 'bot', error: true }
    }
  }

  // Knowledge + LLM / local
  const chunks = retrieveKnowledge(text, 5)
  const knowledgeText = chunks.map((c) => c.text).join('\n\n')

  // Grok/OpenAI/Groq son 100% opcionales. Si fallan o no hay key → conocimiento local.
  if (llmConfigured()) {
    try {
      const answer = await Promise.race([
        callLlm({ userText: text, history, knowledgeText }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout LLM')), 12000)),
      ])
      if (answer) {
        return { text: answer, role: 'bot', sources: chunks.map((c) => c.id), mode: 'llm' }
      }
    } catch (e) {
      const fallback = localAnswer(text, history)
      return {
        text: `${fallback.text}\n\n_(Asesor en modo local — Grok no disponible: ${e.message})_`,
        role: 'bot',
        sources: fallback.sources,
        mode: 'local',
      }
    }
  }

  const fallback = localAnswer(text, history)
  return { ...fallback, role: 'bot', mode: 'local' }
}

export function advisorStatus() {
  return {
    llm: llmConfigured(),
    llmProvider: import.meta.env.VITE_XAI_API_KEY
      ? 'xAI'
      : import.meta.env.VITE_GROQ_API_KEY
        ? 'Groq'
        : import.meta.env.VITE_OPENAI_API_KEY
          ? 'OpenAI'
          : null,
    google: Boolean(loadStoredToken()?.access_token),
    googleClientConfigured: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID),
  }
}
