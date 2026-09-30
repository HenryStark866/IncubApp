/**
 * Asistente de labores de IncubApp (corre dentro de n8n, flujo «Asistente de voz»).
 *
 * El operario, el supervisor o el auxiliar le hablan a la app; la app transcribe y
 * manda la pregunta con un resumen de su turno (rol, pendientes, rondas). Aquí se
 * valida la entrada, se arma el pedido a Claude y se saca el texto que la app lee
 * en voz alta. Las respuestas son cortas y habladas: nada de listas ni símbolos.
 *
 * Seguridad: la sesión del usuario la valida el nodo anterior contra el servidor
 * de cuentas (no se confía en lo que diga el navegador sobre quién es). El
 * contexto lo arma la app con los datos del propio usuario; se limita de tamaño.
 *
 * Este archivo lo copia generar-flujo-asistente.mjs dentro de los nodos Code del
 * flujo; no usa import ni nada fuera de JavaScript puro.
 * Henry Stark Desarrollador · CDH Maker
 */

const MODELO = 'claude-opus-5-5'
const MAX_PREGUNTA = 600
const MAX_CONTEXTO = 5000
const MAX_TURNOS = 6

const INSTRUCCIONES = `Eres el asistente de voz de IncubApp, la app de operación de la planta de incubación de Antioqueña de Incubación (Incubant), en Colombia. Te hablan operarios de turno, auxiliares, supervisores, auxiliares de mantenimiento y líderes de área, casi siempre desde el celular y con las manos ocupadas. La app lee tu respuesta en voz alta.

Cómo respondes:
- En español de Colombia, tuteando, con calidez y sin rodeos.
- Corto: dos o tres frases (máximo unas 70 palabras) salvo que pidan el paso a paso. Primero lo que tiene que hacer, después el porqué si hace falta.
- Texto para escuchar: sin listas con viñetas, sin asteriscos, sin emojis, sin tablas ni enlaces. Si das pasos, dilos en una frase: «primero…, luego…, y al final…».
- Usa el contexto del turno que llega con la pregunta (rol, turno, pendientes, rondas, máquinas con novedad) para responder en concreto: nombres de máquinas, horas, cantidades. No inventes datos que no estén ahí; si no los tienes, dilo y di dónde verlos en la app.
- Si la duda es de proceso o de la empresa y no la sabes con certeza, dilo y sugiere preguntarle al supervisor o al líder del área.
- Seguridad primero: ante una alarma de temperatura, humedad o CO2 fuera de rango, olor a quemado, chispas, fuga de gas o de agua, o alguien lastimado, lo primero es la persona y avisar ya al supervisor; después, reportar la falla en la app.

Lo que se hace en IncubApp (para guiar):
- Asistencia: en Inicio, «Selfie y marcar ingreso» al llegar y «marcar salida» al terminar; pide GPS y hay una tolerancia en minutos que fija el coordinador.
- Ronda: cada hora del turno se toma foto a la pantalla de cada incubadora y nacedora (Inicio → «Continuar ronda»); por cada máquina se marca Sin novedad, Alerta o Falla, o «Está apagada». Las lecturas de la pantalla (temperatura ovoscan y de aire, humedad, CO2, volteos) las puede llenar el bot desde la foto; lo que digita el turnero nunca se reemplaza. Al terminar la ronda sale el formato FOMAT04. El mínimo es de seis rondas por turno.
- Falla o incidencia: Inicio → «Reportar falla»: se elige qué pasa, la máquina o la sala, la urgencia y una foto; queda como OT para mantenimiento y sale en el formato FOMAT06 (solicitud de mantenimiento).
- Novedad escrita y entrega de turno: Inicio → «Escribir novedad» o «Entrega de turno»; cuenta como reporte de ronda.
- Actividades asignadas: en «Me asignaron», Iniciar y luego Terminar con cantidad, nota y foto.
- Mantenimiento: el auxiliar ve el Plan AM de la semana, ejecuta cada tarea con su lista de chequeo (OK, No OK, No aplica) y fotos, y queda la OT cerrada con su formato FOMAT01 o FOMAT04; lo que queda No OK puede abrir una OT correctiva. Las calibraciones van en Calibración y llenan el FOMAT08.
- Supervisor: su tablero muestra el semáforo del turno, lo que pide atención con su botón (crear OT, mandar a revisar, recordar la ronda, reasignar), el mapa de la ronda por sala y hora, el equipo y el informe del turno FOINC02.`

/** Valida y limpia lo que manda la app. */
function validarEntrada(cuerpo) {
  const b = cuerpo && typeof cuerpo === 'object' ? cuerpo : {}
  const pregunta = String(b.pregunta || '').replace(/\s+/g, ' ').trim()
  if (!pregunta) return { ok: false, codigo: 400, mensaje: 'Falta la pregunta.' }
  if (pregunta.length > MAX_PREGUNTA) return { ok: false, codigo: 400, mensaje: 'La pregunta es muy larga.' }
  let contexto = b.contexto && typeof b.contexto === 'object' ? b.contexto : {}
  let texto = JSON.stringify(contexto)
  if (texto.length > MAX_CONTEXTO) {
    // Se conserva lo esencial y se recorta el resto: nunca se rechaza por el contexto.
    contexto = { rol: contexto.rol, nombre: contexto.nombre, pantalla: contexto.pantalla, resumen: String(contexto.resumen || '').slice(0, 1500) }
    texto = JSON.stringify(contexto)
  }
  const historial = (Array.isArray(b.historial) ? b.historial : [])
    .filter((m) => m && (m.rol === 'usuario' || m.rol === 'asistente') && typeof m.texto === 'string' && m.texto.trim())
    .slice(-MAX_TURNOS)
    .map((m) => ({ rol: m.rol, texto: m.texto.slice(0, 800) }))
  return { ok: true, pregunta, contexto, contextoTexto: texto, historial }
}

/** Resultado del nodo que consulta la sesión en el servidor de cuentas. */
function validarSesion(respuesta) {
  const r = respuesta && typeof respuesta === 'object' ? respuesta : {}
  const codigo = Number(r.statusCode || 0)
  const cuerpo = r.body && typeof r.body === 'object' ? r.body : {}
  if (codigo === 200 && typeof cuerpo.id === 'string' && cuerpo.id) return { ok: true, userId: cuerpo.id }
  return { ok: false, codigo: 401, mensaje: 'Tu sesión venció. Vuelve a entrar a IncubApp.' }
}

/** Cuerpo de la llamada a la API de mensajes de Claude. */
function construirPedido({ pregunta, contextoTexto, historial = [] }) {
  const mensajes = historial.map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.texto }))
  // La API pide que el primer mensaje sea del usuario y que se alternen.
  while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift()
  const alternados = []
  for (const m of mensajes) {
    const prev = alternados[alternados.length - 1]
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n${m.content}`
    else alternados.push({ ...m })
  }
  if (alternados.length && alternados[alternados.length - 1].role === 'user') alternados.pop()
  alternados.push({
    role: 'user',
    content: `Contexto de mi turno (datos de la app, JSON):\n${contextoTexto || '{}'}\n\nMi pregunta: ${pregunta}`,
  })
  return {
    model: MODELO,
    max_tokens: 4000,
    fallbacks: 'default',
    // Respuesta hablada y rápida: el esfuerzo bajo alcanza para guiar y responde antes.
    output_config: { effort: 'low' },
    system: INSTRUCCIONES,
    messages: alternados,
  }
}

/** Limpia el texto para leerlo en voz alta (por si el modelo usó marcas). */
function textoHablado(texto) {
  return String(texto || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Saca el texto de la respuesta de la API. Devuelve { ok, texto } o { ok:false, codigo, mensaje }. */
function leerRespuesta(respuesta) {
  if (!respuesta || typeof respuesta !== 'object') return { ok: false, codigo: 502, mensaje: 'El asistente no respondió.' }
  if (respuesta.error) return { ok: false, codigo: 503, mensaje: 'El asistente no está disponible ahora.' }
  if (respuesta.stop_reason === 'refusal') {
    return { ok: true, texto: 'Eso no te lo puedo responder. Pregúntale a tu supervisor.', modelo: respuesta.model || MODELO }
  }
  const texto = textoHablado((respuesta.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''))
  if (!texto) return { ok: false, codigo: 502, mensaje: 'El asistente no respondió.' }
  return { ok: true, texto, modelo: respuesta.model || MODELO }
}

// Para las pruebas en Node; en n8n este bloque no hace nada.
if (typeof module !== 'undefined') {
  module.exports = { MODELO, INSTRUCCIONES, validarEntrada, validarSesion, construirPedido, leerRespuesta, textoHablado }
}
