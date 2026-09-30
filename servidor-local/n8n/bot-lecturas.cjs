/**
 * Bot de lecturas de IncubApp (corre dentro de n8n).
 *
 * De cada foto de ronda de una incubadora o nacedora Petersime saca las
 * lecturas de la pantalla y decide qué se puede escribir en el formato.
 * La regla es simple: ante la duda, NO se escribe. Un campo solo pasa si
 *   1. dos lecturas independientes de la foto dan exactamente el mismo número,
 *   2. las dos dicen que el número se ve claro (no «---», no tapado por reflejos),
 *   3. el número es físicamente posible para ese campo, y
 *   4. el número de máquina de la pantalla no contradice la máquina elegida.
 * Lo demás queda como «revisar» con el motivo, para que lo vea el líder.
 *
 * Este archivo lo copia generar-flujo.mjs dentro de los nodos Code del flujo;
 * no usa import ni nada fuera de JavaScript puro.
 * Henry Stark Desarrollador · CDH Maker
 */

const MODELO = 'claude-opus-5-5'

/** Campos del formato que se leen de la pantalla, por tipo de máquina. */
const CAMPOS_POR_TIPO = {
  setter: ['temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count'],
  hatcher: ['temp_air', 'humidity', 'co2'],
}

/**
 * Rango físicamente posible de cada lectura (no el rango "bueno" de proceso:
 * una alarma real también debe quedar registrada). Fuera de aquí es un error
 * de lectura, no un dato.
 */
const RANGOS = {
  temp_ovoscan: { min: 60, max: 110, decimales: 1 },
  temp_air: { min: 60, max: 110, decimales: 1 },
  humidity: { min: 40, max: 100, decimales: 1 }, // bulbo húmedo en °F
  co2: { min: 0, max: 2, decimales: 2 },
  turn_count: { min: 0, max: 9999, decimales: 0 },
}

const NOMBRES = {
  temp_ovoscan: 'Temp. ovoscan',
  temp_air: 'Temp. aire',
  humidity: 'Humedad',
  co2: 'CO₂',
  turn_count: 'Volteo',
}

const lecturaCampo = {
  type: 'object',
  additionalProperties: false,
  required: ['legible', 'valor', 'consigna'],
  properties: {
    legible: { type: 'boolean' },
    valor: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    consigna: { anyOf: [{ type: 'number' }, { type: 'null' }] },
  },
}

/** Forma exacta de la respuesta del modelo (structured outputs). */
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pantalla_visible', 'etiqueta_pantalla', 'numero_maquina', 'temp_ovoscan', 'temp_air', 'humidity', 'co2', 'turn_count', 'observaciones'],
  properties: {
    pantalla_visible: { type: 'boolean' },
    etiqueta_pantalla: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    numero_maquina: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    temp_ovoscan: lecturaCampo,
    temp_air: lecturaCampo,
    humidity: lecturaCampo,
    co2: lecturaCampo,
    turn_count: {
      type: 'object',
      additionalProperties: false,
      required: ['legible', 'valor'],
      properties: {
        legible: { type: 'boolean' },
        valor: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
      },
    },
    observaciones: { type: 'string' },
  },
}

const INSTRUCCIONES = `Transcribes lecturas de pantallas de incubadoras y nacedoras Petersime (BioStreamer) a partir de fotos tomadas con celular por los turneros de una planta de incubación. Tu transcripción llena un registro de calidad: un número equivocado es peor que un campo vacío. Si un número no se ve con total claridad, marca legible=false y valor=null. Nunca deduzcas, promedies, completes ni copies un número de otro lugar de la pantalla.

Cómo es la pantalla:
- Barra superior izquierda: etiqueta de la máquina, por ejemplo «2 - 18 XS12SHDOX» o «23 - 9 XS4HHDOX». El segundo número (18, 9) es el número de la máquina: va en numero_maquina. La etiqueta completa va en etiqueta_pantalla.
- Mosaicos de colores. En cada uno el número GRANDE es la lectura real (va en valor) y el número pequeño de abajo es la consigna o setpoint (va en consigna). Nunca pongas la consigna como valor.
  · Rosado, icono de termómetro con gota/huevo: temperatura de cáscara (OvoScan), °F → temp_ovoscan. Solo existe en incubadoras; en nacedoras ese mosaico está gris o vacío.
  · Rojo, icono de termómetro: temperatura de aire, °F → temp_air.
  · Azul, icono de gota: humedad como bulbo húmedo en °F → humidity.
  · Amarillo, icono CO₂: CO₂ en % → co2.
  · Verde, icono de ventilador: ventilación en %. NO se transcribe.
- Abajo, en la sección de volteo, un contador con numeral, por ejemplo «#000386»: es el número de volteos → turn_count (entero sin ceros a la izquierda: 386).

Reglas:
- Si el número grande aparece como «---», está tapado por un reflejo, cortado, borroso o alguna cifra es dudosa: legible=false, valor=null. La consigna sí se anota si se ve clara.
- Si el mosaico no existe en esa máquina: legible=false, valor=null, consigna=null.
- Copia los decimales tal como aparecen (97.8, 0.25). No redondees.
- Si la foto no muestra la pantalla de la máquina (está apagada, es otra cosa, o no se puede leer nada): pantalla_visible=false y todos los campos con legible=false.
- En observaciones escribe en español, en una o dos frases, cualquier cosa que afecte la lectura (reflejos, alarma en pantalla, foto movida). Si todo se ve bien, escribe «Sin novedad».`

const VARIANTES = {
  a: 'Transcribe las lecturas de esta foto.',
  b: 'Transcribe las lecturas de esta foto. Antes de responder, recorre cada mosaico de colores de izquierda a derecha y lee cada número cifra por cifra, incluida la posición del punto decimal.',
}

/** Cuerpo de la llamada a la API de mensajes de Claude para una foto. */
function cuerpoLectura({ imagenBase64, mediaType = 'image/jpeg', maquina, variante }) {
  const tipo = maquina?.machine_type === 'hatcher' ? 'nacedora' : 'incubadora'
  return {
    model: MODELO,
    max_tokens: 16000,
    fallbacks: 'default',
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: ESQUEMA },
    },
    system: INSTRUCCIONES,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imagenBase64 } },
          { type: 'text', text: `Máquina seleccionada en la app: ${maquina?.machine_name || maquina?.machine_code || 'sin nombre'} (${tipo}).\n${VARIANTES[variante] || VARIANTES.a}` },
        ],
      },
    ],
  }
}

/**
 * Saca el JSON de la respuesta de la API. Devuelve { ok, datos, error }.
 * Cualquier cosa que no sea una respuesta completa y válida es un error.
 */
function leerRespuesta(respuesta) {
  if (!respuesta || typeof respuesta !== 'object') return { ok: false, error: 'Sin respuesta de la API' }
  if (respuesta.error) {
    const e = respuesta.error
    return { ok: false, infraestructura: true, error: `API: ${String(typeof e === 'string' ? e : e.message || JSON.stringify(e)).slice(0, 300)}` }
  }
  if (respuesta.stop_reason === 'refusal') return { ok: false, error: 'La API rechazó la lectura' }
  if (respuesta.stop_reason === 'max_tokens') return { ok: false, error: 'Respuesta incompleta (max_tokens)' }
  const texto = (respuesta.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  try {
    return { ok: true, datos: JSON.parse(texto), modelo: respuesta.model || MODELO }
  } catch {
    return { ok: false, error: 'La respuesta no es JSON válido' }
  }
}

/** Número de máquina a partir del código de IncubApp: «INC-18» → 18, «NAC-09» → 9. */
function numeroDeCodigo(codigo) {
  const m = String(codigo || '').match(/(\d+)\s*$/)
  return m ? Number(m[1]) : null
}

const redondear = (n, dec) => Math.round(n * 10 ** dec) / 10 ** dec

/** Un campo de una lectura, normalizado: número o null. */
function valorDe(datos, campo) {
  const c = datos?.[campo]
  if (!c || c.legible !== true || typeof c.valor !== 'number' || !Number.isFinite(c.valor)) return null
  return redondear(c.valor, RANGOS[campo].decimales)
}

/**
 * Decide qué se escribe en el formato a partir de las dos lecturas.
 * @param {object} maquina fila de lecturas_pendientes (check_id, machine_code, machine_type, …)
 * @param {object[]} respuestas respuestas crudas de la API, una por lectura
 * @returns resultado listo para incubapp_bot.guardar_lectura
 */
function decidir(maquina, respuestas) {
  const leidas = respuestas.map(leerRespuesta)
  const base = {
    check_id: maquina.check_id,
    valores: {},
    discrepancias: [],
    etiqueta_pantalla: null,
    modelo: leidas.find((l) => l.ok)?.modelo || MODELO,
    lecturas: leidas.map((l) => (l.ok ? l.datos : { error: l.error })),
  }

  const fallidas = leidas.filter((l) => !l.ok)
  if (leidas.length < 2 || fallidas.length) {
    // Si falló la conexión o la cuenta (clave, saldo, límite, caída de la API) la
    // foto no tiene la culpa: se reintenta sin gastarle intentos.
    const reintentar = fallidas.length > 0 && fallidas.every((l) => l.infraestructura)
    return { ...base, status: 'error', reintentar, motivo: fallidas.map((l) => l.error).join(' · ') || 'Faltan lecturas' }
  }

  const [a, b] = leidas.map((l) => l.datos)
  base.etiqueta_pantalla = a.etiqueta_pantalla || b.etiqueta_pantalla || null

  if (!a.pantalla_visible && !b.pantalla_visible) {
    return { ...base, status: 'sin_lecturas', motivo: `La foto no muestra la pantalla. ${a.observaciones || ''}`.trim() }
  }
  if (a.pantalla_visible !== b.pantalla_visible) {
    return { ...base, status: 'revisar', motivo: 'Las dos lecturas no coinciden en si la pantalla se ve.' }
  }

  // ¿La pantalla es de la máquina que eligió el turnero?
  const esperado = numeroDeCodigo(maquina.machine_code)
  const enPantalla = [a.numero_maquina, b.numero_maquina].filter((n) => Number.isInteger(n))
  const notas = []
  if (enPantalla.length === 2 && enPantalla[0] === enPantalla[1] && esperado != null && enPantalla[0] !== esperado) {
    return {
      ...base,
      status: 'revisar',
      motivo: `La pantalla dice máquina ${enPantalla[0]} y la foto se registró en ${maquina.machine_code}. No se llenó nada.`,
      discrepancias: [{ tipo: 'maquina_distinta', esperada: maquina.machine_code, en_pantalla: enPantalla[0] }],
    }
  }
  if (enPantalla.length < 2 || enPantalla[0] !== enPantalla[1]) notas.push('No se pudo confirmar el número de máquina en la pantalla.')

  const campos = CAMPOS_POR_TIPO[maquina.machine_type] || []
  const valores = {}
  const discrepancias = []
  for (const campo of campos) {
    const va = valorDe(a, campo)
    const vb = valorDe(b, campo)
    if (va == null && vb == null) continue // no se ve: el campo queda vacío
    if (va == null || vb == null || va !== vb) {
      discrepancias.push({ campo, tipo: 'lecturas_distintas', lectura_a: va, lectura_b: vb })
      continue
    }
    const { min, max } = RANGOS[campo]
    if (va < min || va > max) {
      discrepancias.push({ campo, tipo: 'fuera_de_rango', valor: va, min, max })
      continue
    }
    valores[campo] = va
  }

  const leidos = Object.keys(valores)
  if (!leidos.length && !discrepancias.length) {
    return { ...base, status: 'sin_lecturas', motivo: [`No se pudo leer ninguna lectura con certeza.`, ...notas, a.observaciones].filter(Boolean).join(' ') }
  }
  const motivo = [
    leidos.length ? `Confirmado por dos lecturas: ${leidos.map((c) => `${NOMBRES[c]} ${valores[c]}`).join(', ')}.` : null,
    discrepancias.length ? `Sin llenar por duda: ${discrepancias.map((d) => NOMBRES[d.campo] || d.campo).join(', ')}.` : null,
    ...notas,
  ].filter(Boolean).join(' ')

  return { ...base, status: discrepancias.length ? 'revisar' : 'aplicada', valores, discrepancias, motivo }
}

// Para las pruebas en Node; en n8n este bloque no hace nada.
if (typeof module !== 'undefined') {
  module.exports = { MODELO, ESQUEMA, INSTRUCCIONES, CAMPOS_POR_TIPO, RANGOS, cuerpoLectura, leerRespuesta, decidir, numeroDeCodigo }
}
