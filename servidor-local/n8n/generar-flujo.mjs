/**
 * Genera flujo-lecturas.json: el flujo de n8n del bot de lecturas.
 * La lógica vive en bot-lecturas.cjs (con pruebas) y aquí se copia dentro de
 * los nodos Code, para que lo probado sea exactamente lo que corre.
 * Uso: node servidor-local/n8n/generar-flujo.mjs
 * Henry Stark Desarrollador · CDH Maker
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const bot = readFileSync(join(aqui, 'bot-lecturas.cjs'), 'utf8')

// Ids fijos: el instalador crea las credenciales con estos mismos ids.
export const IDS = {
  flujo: 'IncubAppLectura1',
  bd: 'IncubAppBotBD001',
  fotos: 'IncubAppFotos001',
  claude: 'IncubAppClaude01',
}
const FOTOS_POR_CORRIDA = 6

const preparar = `${bot}
// ── Nodo «Preparar lecturas»: una foto → dos pedidos independientes a Claude ──
const maquina = $('Recorrer fotos').itemMatching(0).json
const foto = $input.first()
const binario = foto.binary && foto.binary.data
if (!binario) {
  const e = foto.json && foto.json.error
  return [{ json: { maquina, error_descarga: (e && (e.message || e.description)) || 'No se pudo descargar la foto' } }]
}
const buffer = await this.helpers.getBinaryDataBuffer(0, 'data')
const aceptados = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const mediaType = aceptados.includes(binario.mimeType) ? binario.mimeType : 'image/jpeg'
const imagenBase64 = buffer.toString('base64')
return ['a', 'b'].map((variante) => ({
  json: { maquina, variante, body: cuerpoLectura({ imagenBase64, mediaType, maquina, variante }) },
}))
`

const validar = `${bot}
// ── Nodo «Decidir qué se llena»: compara las dos lecturas y valida ──
const maquina = $('Recorrer fotos').itemMatching(0).json
const entradas = $input.all()
let resultado
if (entradas.length && entradas[0].json.error_descarga) {
  resultado = { check_id: maquina.check_id, status: 'error', valores: {}, discrepancias: [], motivo: 'No se pudo descargar la foto: ' + entradas[0].json.error_descarga }
} else {
  resultado = decidir(maquina, entradas.map((e) => e.json))
}
return [{ json: { resultado, b64: Buffer.from(JSON.stringify(resultado), 'utf8').toString('base64') } }]
`

const nodo = (id, name, type, typeVersion, position, parameters, extra = {}) => ({ id, name, type, typeVersion, position, parameters, ...extra })

const nodes = [
  nodo('n-cada5', 'Cada 5 minutos', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 0], {
    rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] },
  }),
  nodo('n-manual', 'Probar ahora', 'n8n-nodes-base.manualTrigger', 1, [0, 200], {}),
  nodo('n-pend', 'Fotos pendientes', 'n8n-nodes-base.postgres', 2.6, [240, 100], {
    operation: 'executeQuery',
    query: `select * from incubapp_bot.lecturas_pendientes(${FOTOS_POR_CORRIDA});`,
    options: { largeNumbersOutput: 'numbers' },
  }, { credentials: { postgres: { id: IDS.bd, name: 'IncubApp · bot de lecturas (base de datos)' } } }),
  nodo('n-loop', 'Recorrer fotos', 'n8n-nodes-base.splitInBatches', 3, [480, 100], { batchSize: 1, options: {} }),
  nodo('n-desc', 'Descargar foto', 'n8n-nodes-base.httpRequest', 4.2, [720, 200], {
    url: "={{ 'http://supabase-storage:5000/object/authenticated/machine-checks/' + $json.photo_path.split('/').map(encodeURIComponent).join('/') }}",
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    options: { response: { response: { responseFormat: 'file' } }, timeout: 60000 },
  }, {
    credentials: { httpHeaderAuth: { id: IDS.fotos, name: 'IncubApp · fotos de rondas' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueRegularOutput',
  }),
  nodo('n-prep', 'Preparar lecturas', 'n8n-nodes-base.code', 2, [960, 200], { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: preparar }),
  nodo('n-if', '¿Se descargó?', 'n8n-nodes-base.if', 2.2, [1200, 200], {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: 'c-body',
        leftValue: '={{ !!$json.body }}',
        rightValue: '',
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  }),
  nodo('n-claude', 'Claude lee la pantalla', 'n8n-nodes-base.httpRequest', 4.2, [1440, 100], {
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
    options: { timeout: 300000 },
  }, {
    credentials: { httpHeaderAuth: { id: IDS.claude, name: 'IncubApp · Claude (Anthropic)' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput',
  }),
  nodo('n-val', 'Decidir qué se llena', 'n8n-nodes-base.code', 2, [1680, 200], { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: validar }),
  nodo('n-save', 'Llenar formato', 'n8n-nodes-base.postgres', 2.6, [1920, 200], {
    operation: 'executeQuery',
    query: "select incubapp_bot.guardar_lectura(convert_from(decode($1, 'base64'), 'UTF8')::jsonb) as estado;",
    options: { queryReplacement: '={{ $json.b64 }}' },
  }, { credentials: { postgres: { id: IDS.bd, name: 'IncubApp · bot de lecturas (base de datos)' } } }),
  nodo('n-nota', 'Nota', 'n8n-nodes-base.stickyNote', 1, [240, -320], {
    width: 900, height: 280,
    content: '## Bot de lecturas de rondas\nCada 5 minutos toma hasta ' + FOTOS_POR_CORRIDA + ' fotos nuevas de incubadoras y nacedoras, las lee **dos veces por separado** con Claude y solo escribe en el formato (machine_checks) los campos en que ambas lecturas coinciden, que están en rango y que el turnero dejó vacíos.\n\nNunca pisa lo digitado. Si algo no cuadra (lecturas distintas, otra máquina en pantalla, turnero ≠ foto) queda **revisar** en `machine_check_ai_readings` con el motivo.\n\nLógica y pruebas: `servidor-local/n8n/bot-lecturas.cjs`. No edites los nodos Code aquí: cambia ese archivo y corre `generar-flujo.mjs`.',
  }),
]

const conn = (node, index = 0) => ({ node, type: 'main', index })
const connections = {
  'Cada 5 minutos': { main: [[conn('Fotos pendientes')]] },
  'Probar ahora': { main: [[conn('Fotos pendientes')]] },
  'Fotos pendientes': { main: [[conn('Recorrer fotos')]] },
  'Recorrer fotos': { main: [[], [conn('Descargar foto')]] },
  'Descargar foto': { main: [[conn('Preparar lecturas')]] },
  'Preparar lecturas': { main: [[conn('¿Se descargó?')]] },
  '¿Se descargó?': { main: [[conn('Claude lee la pantalla')], [conn('Decidir qué se llena')]] },
  'Claude lee la pantalla': { main: [[conn('Decidir qué se llena')]] },
  'Decidir qué se llena': { main: [[conn('Llenar formato')]] },
  'Llenar formato': { main: [[conn('Recorrer fotos')]] },
}

const flujo = {
  id: IDS.flujo,
  name: 'IncubApp · Bot de lecturas de rondas',
  active: false,
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: 'America/Bogota', saveManualExecutions: true },
  pinData: {},
}

writeFileSync(join(aqui, 'flujo-lecturas.json'), JSON.stringify([flujo], null, 2) + '\n')
console.log('flujo-lecturas.json listo')
