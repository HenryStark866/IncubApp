// Asesor IA de IncubApp — el modelo se llama DESDE EL SERVIDOR.
//
// La clave del proveedor vive aquí como secreto de la función y nunca llega al
// navegador. Antes se leía de VITE_XAI_API_KEY, y toda variable VITE_* se
// incrusta en el JavaScript que descarga cualquiera: la clave quedaba publicada.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// `verify_jwt` no basta por sí solo: la plataforma también da por buena la clave
// publicable, y esa viaja en el JavaScript de la app, o sea que la tiene
// cualquiera. Sin esta comprobación la función sería un proxy abierto que
// gastaría la cuenta del proveedor. La firma ya la validó la plataforma antes de
// llegar aquí; lo que falta es exigir que sea el token de una PERSONA con sesión
// abierta en IncubApp, y no una clave anónima.
function esUsuarioConSesion(req: Request): boolean {
  const cabecera = req.headers.get('Authorization') || ''
  const token = cabecera.replace(/^[Bb]earer\s+/, '').trim()
  const partes = token.split('.')
  if (partes.length !== 3) return false   // no es un JWT: p. ej. la clave publicable
  try {
    const relleno = '='.repeat((4 - (partes[1].length % 4)) % 4)
    const carga = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/') + relleno))
    return carga?.role === 'authenticated' && typeof carga?.sub === 'string' && carga.sub.length > 0
  } catch {
    return false
  }
}

// ---------- Claude Fable 5.1 vía Vertex AI (crédito de bienvenida de Google Cloud) ----------
// Prioridad #1: si hay cuenta de servicio de GCP configurada se intenta primero acá,
// así se gasta el crédito de Google Cloud en vez de la cuenta de xAI/Groq/OpenAI de
// abajo. Si no está configurado, o la llamada falla, cae al proveedor de siempre.
let tokenVertexCache: { token: string; vence: number } | null = null

function pemABuffer(pem: string): ArrayBuffer {
  const limpio = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')
  const binario = atob(limpio)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes.buffer
}

function base64url(datos: string | ArrayBuffer): string {
  const binario =
    typeof datos === 'string' ? datos : String.fromCharCode(...new Uint8Array(datos))
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Cuenta de servicio de GCP → access token OAuth2 (flujo JWT-bearer), sin
// dependencias externas. Se cachea en memoria del isolate mientras siga vivo.
async function obtenerTokenVertex(cuentaServicio: { client_email: string; private_key: string }) {
  const ahora = Math.floor(Date.now() / 1000)
  if (tokenVertexCache && tokenVertexCache.vence > ahora + 60) return tokenVertexCache.token

  const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const carga = base64url(
    JSON.stringify({
      iss: cuentaServicio.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: ahora,
      exp: ahora + 3600,
    })
  )
  const sinFirmar = `${cabecera}.${carga}`
  const clave = await crypto.subtle.importKey(
    'pkcs8',
    pemABuffer(cuentaServicio.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(sinFirmar))
  const jwt = `${sinFirmar}.${base64url(firma)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`oauth2 google: ${res.status} ${(await res.text()).slice(0, 300)}`)
  const datos = await res.json()
  tokenVertexCache = { token: datos.access_token, vence: ahora + (datos.expires_in || 3600) }
  return datos.access_token as string
}

function configVertex() {
  const credencial = Deno.env.get('GOOGLE_VERTEX_SERVICE_ACCOUNT')
  const proyecto = Deno.env.get('GOOGLE_VERTEX_PROJECT_ID')
  if (!credencial || !proyecto) return null
  try {
    return { cuentaServicio: JSON.parse(credencial), proyecto }
  } catch {
    console.error('GOOGLE_VERTEX_SERVICE_ACCOUNT no es JSON válido')
    return null
  }
}

async function llamarVertexFable(limpios: { role: string; content: string }[]) {
  const cfg = configVertex()
  if (!cfg) return null

  const modelo = Deno.env.get('GOOGLE_VERTEX_MODEL') || 'claude-fable-5-1'
  const ubicacion = Deno.env.get('GOOGLE_VERTEX_LOCATION') || 'global'
  // Fable 5.1 siempre "piensa": con un tope de tokens bajo (heredado de los
  // proveedores sin thinking) puede gastarlo pensando y cortar sin texto visible.
  // Effort bajo + un tope generoso evita ese corte para un chat de respuesta rápida.
  const maxTokens = Number(Deno.env.get('GOOGLE_VERTEX_MAX_TOKENS') || 4096)
  const effort = Deno.env.get('GOOGLE_VERTEX_EFFORT') || 'low'

  const system = limpios[0]?.role === 'system' ? limpios[0].content : undefined
  const mensajes = limpios
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }))
  if (!mensajes.length) return null

  const token = await obtenerTokenVertex(cfg.cuentaServicio)
  const host = ubicacion === 'global' ? 'aiplatform.googleapis.com' : `${ubicacion}-aiplatform.googleapis.com`
  const url = `https://${host}/v1/projects/${cfg.proyecto}/locations/${ubicacion}/publishers/anthropic/models/${modelo}:rawPredict`

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      anthropic_version: 'vertex-2023-10-16',
      max_tokens: maxTokens,
      output_config: { effort },
      ...(system ? { system } : {}),
      messages: mensajes,
    }),
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) {
    throw new Error(`vertex fable-5.1: ${res.status} ${(await res.text()).slice(0, 500)}`)
  }

  const datos = await res.json()
  if (datos.stop_reason === 'refusal') {
    throw new Error(`fable-5.1 rehusó: ${datos.stop_details?.category || 'sin categoría'}`)
  }
  const texto = (datos.content || [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n')
    .trim()
  return texto || null
}

// El proveedor lo decide el servidor según la clave que tenga configurada.
function proveedor() {
  const xai = Deno.env.get('XAI_API_KEY')
  if (xai) {
    return {
      url: 'https://api.x.ai/v1/chat/completions',
      key: xai,
      model: Deno.env.get('XAI_MODEL') || 'grok-2-latest',
    }
  }
  const groq = Deno.env.get('GROQ_API_KEY')
  if (groq) {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: groq,
      model: Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    }
  }
  const openai = Deno.env.get('OPENAI_API_KEY')
  if (openai) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      key: openai,
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
    }
  }
  return null
}

const ROLES = new Set(['system', 'user', 'assistant'])
const TOPE_MENSAJE = 24000   // caracteres por mensaje
const TOPE_TOTAL = 60000     // caracteres de toda la conversación
const TOPE_MENSAJES = 24

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405)

  if (!esUsuarioConSesion(req)) {
    return json({ error: 'Inicia sesión en IncubApp para usar el asesor.' }, 401)
  }

  const prov = proveedor()
  const vertexCfg = configVertex()
  // Sin ninguna clave configurada no es un error: el asesor sigue con su
  // conocimiento local de incubación, que es el respaldo que ya trae el cliente.
  if (!prov && !vertexCfg) return json({ text: null, motivo: 'sin_proveedor' })

  let cuerpo: { messages?: unknown }
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'Cuerpo JSON inválido' }, 400)
  }

  const messages = cuerpo?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'Faltan los mensajes de la conversación' }, 400)
  }
  if (messages.length > TOPE_MENSAJES) {
    return json({ error: 'Conversación demasiado larga' }, 400)
  }

  let total = 0
  const limpios = []
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role
    const content = (m as { content?: unknown })?.content
    if (typeof role !== 'string' || !ROLES.has(role)) {
      return json({ error: 'Rol de mensaje no permitido' }, 400)
    }
    if (typeof content !== 'string' || content.length > TOPE_MENSAJE) {
      return json({ error: 'Contenido de mensaje inválido o demasiado largo' }, 400)
    }
    total += content.length
    limpios.push({ role, content })
  }
  if (total > TOPE_TOTAL) return json({ error: 'Conversación demasiado larga' }, 400)

  // 1) Claude Fable 5.1 por Vertex AI — se intenta primero si está configurado.
  if (vertexCfg) {
    try {
      const texto = await llamarVertexFable(limpios)
      if (texto) return json({ text: texto })
    } catch (e) {
      console.error('vertex fable-5.1 falló, cae al proveedor de respaldo:', e)
    }
  }
  if (!prov) return json({ text: null, motivo: 'vertex_no_disponible' })

  // 2) xAI / Groq / OpenAI, como antes. El modelo y los topes los fija el
  // servidor: el cliente no los elige.
  let respuesta: Response
  try {
    respuesta = await fetch(prov.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${prov.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: prov.model,
        messages: limpios,
        temperature: 0.55,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(45000),
    })
  } catch (e) {
    console.error('fallo al llamar al proveedor:', e)
    return json({ error: 'No se pudo contactar al asesor. Inténtalo de nuevo.' }, 502)
  }

  if (!respuesta.ok) {
    // El detalle va al log de la función, no al navegador: puede traer datos del
    // proveedor que no tienen por qué salir de aquí.
    console.error('proveedor respondió', respuesta.status, (await respuesta.text()).slice(0, 500))
    return json({ error: 'El asesor no está disponible en este momento.' }, 502)
  }

  const datos = await respuesta.json()
  const texto = datos?.choices?.[0]?.message?.content?.trim() || null
  return json({ text: texto })
})
