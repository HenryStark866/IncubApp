/**
 * Genera flujo-asistente.json: el flujo de n8n del asistente de voz de IncubApp.
 * La lógica vive en asistente.cjs (con pruebas) y aquí se copia dentro de los
 * nodos Code, para que lo probado sea exactamente lo que corre.
 * Uso: node servidor-local/n8n/generar-flujo-asistente.mjs
 *
 * La app llega por nginx: POST /asistente → http://incubapp-n8n:5678/webhook/asistente
 * con la sesión del usuario (Authorization: Bearer …). El panel de n8n no se expone.
 * Henry Stark Desarrollador · CDH Maker
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const logica = readFileSync(join(aqui, 'asistente.cjs'), 'utf8')

// Ids fijos: la credencial de Claude es la misma del bot de lecturas.
export const IDS = { flujo: 'IncubAppAsisten1', webhook: '6c1f8f0e-3b7a-4d1e-9a52-5b0e7c2a9d11', claude: 'IncubAppClaude01' }

const preparar = `${logica}
// ── Nodo «Preparar pregunta»: sesión válida + pregunta válida → pedido a Claude ──
const entrada = $('Pregunta').first().json.body
const sesion = validarSesion($input.first().json)
if (!sesion.ok) return [{ json: { listo: false, codigo: sesion.codigo, respuesta: { error: sesion.mensaje } } }]
const v = validarEntrada(entrada)
if (!v.ok) return [{ json: { listo: false, codigo: v.codigo, respuesta: { error: v.mensaje } } }]
return [{ json: { listo: true, userId: sesion.userId, body: construirPedido(v) } }]
`

const armar = `${logica}
// ── Nodo «Armar respuesta»: texto para leer en voz alta ──
const r = leerRespuesta($input.first().json)
return [{ json: r.ok ? { codigo: 200, respuesta: { texto: r.texto, modelo: r.modelo } } : { codigo: r.codigo, respuesta: { error: r.mensaje } } }]
`

const nodo = (id, name, type, typeVersion, position, parameters, extra = {}) => ({ id, name, type, typeVersion, position, parameters, ...extra })

const nodes = [
  nodo('a-hook', 'Pregunta', 'n8n-nodes-base.webhook', 2, [0, 100], {
    httpMethod: 'POST',
    path: 'asistente',
    responseMode: 'responseNode',
    options: {},
  }, { webhookId: IDS.webhook }),
  // La sesión se valida contra el servidor de cuentas (GoTrue), no se confía en el navegador.
  nodo('a-sesion', 'Validar sesión', 'n8n-nodes-base.httpRequest', 4.2, [240, 100], {
    url: 'http://supabase-auth:9999/user',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Authorization', value: "={{ $json.headers.authorization || '' }}" }] },
    options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 8000 },
  }, { onError: 'continueRegularOutput' }),
  nodo('a-prep', 'Preparar pregunta', 'n8n-nodes-base.code', 2, [480, 100], { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: preparar }),
  nodo('a-if', '¿Lista para Claude?', 'n8n-nodes-base.if', 2.2, [720, 100], {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: 'c-listo',
        leftValue: '={{ $json.listo === true }}',
        rightValue: '',
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  }),
  nodo('a-claude', 'Claude responde', 'n8n-nodes-base.httpRequest', 4.2, [960, 0], {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'anthropic-version', value: '2023-06-01' },
        { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
      ],
    },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.body) }}',
    // Respuesta hablada: si tarda más de 45 s la app contesta con lo que sabe sin conexión.
    options: { timeout: 45000 },
  }, {
    credentials: { httpHeaderAuth: { id: IDS.claude, name: 'IncubApp · Claude (Anthropic)' } },
    onError: 'continueRegularOutput',
  }),
  nodo('a-armar', 'Armar respuesta', 'n8n-nodes-base.code', 2, [1200, 0], { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: armar }),
  nodo('a-resp', 'Responder', 'n8n-nodes-base.respondToWebhook', 1.1, [1440, 100], {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify($json.respuesta) }}',
    options: { responseCode: '={{ $json.codigo || 200 }}' },
  }),
  nodo('a-nota', 'Nota', 'n8n-nodes-base.stickyNote', 1, [0, -300], {
    width: 900, height: 250,
    content: '## Asistente de voz de IncubApp\nLa app transcribe lo que dice el usuario y manda la pregunta con un resumen de su turno (rol, pendientes, rondas). Aquí se valida la sesión contra el servidor de cuentas, se arma el pedido a Claude (respuesta corta, para leer en voz alta) y se responde.\n\nSi esto no responde (sin clave, sin internet), la app contesta con lo que sabe del turno y del manual sin conexión.\n\nLógica y pruebas: `servidor-local/n8n/asistente.cjs`. No edites los nodos Code aquí: cambia ese archivo y corre `generar-flujo-asistente.mjs`.',
  }),
]

const conn = (node, index = 0) => ({ node, type: 'main', index })
const connections = {
  Pregunta: { main: [[conn('Validar sesión')]] },
  'Validar sesión': { main: [[conn('Preparar pregunta')]] },
  'Preparar pregunta': { main: [[conn('¿Lista para Claude?')]] },
  '¿Lista para Claude?': { main: [[conn('Claude responde')], [conn('Responder')]] },
  'Claude responde': { main: [[conn('Armar respuesta')]] },
  'Armar respuesta': { main: [[conn('Responder')]] },
}

const flujo = {
  id: IDS.flujo,
  name: 'IncubApp · Asistente de voz',
  active: false,
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: 'America/Bogota', saveDataSuccessExecution: 'none', saveManualExecutions: true },
  pinData: {},
}

writeFileSync(join(aqui, 'flujo-asistente.json'), JSON.stringify([flujo], null, 2) + '\n')
console.log('flujo-asistente.json listo')
