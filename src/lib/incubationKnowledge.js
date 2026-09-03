/**
 * Base de conocimiento del Asesor IA — incubación, Petersime, levantes,
 * gerencia avícola y operación de planta. Henry Stark Desarrollador
 */

export const ADVISOR_SYSTEM = `Eres el Asesor de IncubApp, un colega experto y cercano (español de Colombia/Latam),
especializado en:
- Incubación industrial de huevo fértil (setters/incubadoras, hatchers/nacedoras)
- Equipos y filosofía Petersime y buenas prácticas de incubación multi-marca
- Levante de aves (reproductoras), grading y paso a producción
- Bioseguridad, mantenimiento de planta, automatización e IoT ligero
- Gerencia: OC, facturas, cotizaciones, KPIs, no saturar dirección con OT diarias

Estilo: natural, claro, sin relleno corporativo vacío. Usa pasos numerados cuando ayudes a decidir.
Si falta un dato crítico, pregunta UNA cosa concreta. No inventes lecturas de sensores de la planta.
OT y fallas de máquina: orienta a coordinación de planta; gerencia ve reportes verificados y compras.
Si el usuario pide correo/calendar/drive, usa las herramientas cuando estén conectadas; si no, indica cómo conectar.
Responde en español.`

/** Fragmentos recuperables (RAG local simple) */
export const KNOWLEDGE_CHUNKS = [
  {
    id: 'incub-basics',
    tags: ['incubacion', 'setter', 'incubadora', 'ciclo', 'dias', 'embrión'],
    text: `Incubación industrial (pollos de engorde / reproductoras según estirpe):
- Setter (incubadora): ~18–19 días típicos antes de transferir a nacedora (varía por protocolo y especie).
- Hatcher (nacedora): últimos ~2–3 días hasta eclosión (pollito de 1 día).
- Variables clave: temperatura, humedad relativa (HR), volteo, CO₂/ventilación, y perfil de temperatura por etapa.
- No hay un único “número mágico”: siga el protocolo del proveedor genético + manual del equipo (Petersime u otro).
- KPIs: fertilidad, incubabilidad, pollito de 1er día vendible, mermas por etapa, uniformidad.`,
  },
  {
    id: 'petersime',
    tags: ['petersime', 'biostreamer', 'synchro', 'o2', 'airstreamer', 'single-stage', 'multi-stage'],
    text: `Petersime (referencia de industria, no sustituto del manual oficial):
- Líneas conocidas en el mercado: sistemas single-stage y multi-stage; enfoques de control de clima y perfiles de embrión.
- Conceptos frecuentes en la industria asociados a incubación avanzada: control fino de T°/HR, ventilación y trazabilidad de lote.
- Single-stage: un solo lote de edad embrionaria por máquina → perfiles de clima más precisos y limpieza entre ciclos.
- Multi-stage: varios lotes de distinta edad en la misma máquina → más densidad operativa, perfiles de compromiso.
- Buenas prácticas con cualquier marca (incl. Petersime): calibración de sensores, sellado de puertas, mantenimiento de humidificadores/calefactores, no forzar parámetros “de memoria” sin bitácora.
- Ante alarma: contención (puerta, clima, volteo), evidencia (foto de pantalla), OT a mantenimiento/planta, no solo “reset”.
- Siempre prevalece el manual del modelo instalado en planta y el protocolo del cliente genético.`,
  },
  {
    id: 'hatcher-transfer',
    tags: ['nacedora', 'hatcher', 'transferencia', 'candling', 'eclosion', 'pull'],
    text: `Transferencia y nacedora:
- Transferencia setter→hatcher suele planificarse hacia día ~18 (pollos), con control de temperatura del huevo y bioseguridad.
- En nacedora se reduce volteo (bandejas de eclosión); sube foco en HR y ventilación al final.
- “Pull” de pollito: timing, sexaje/vacunación si aplica, y cadena de frío/transporte del pollito de un día.
- Problemas típicos: asfixia (HR/ventilación), picaje temprano/tardío, ombligos mal cicatrizados, deshidratación.
- Registro: lote, máquina origen/destino, hora de transferencia, novedades — en IncubApp vía supervisión/cargue/nacimiento según módulo.`,
  },
  {
    id: 'levante',
    tags: ['levante', 'reproductora', 'grading', 'produccion', 'galpon', 'pollita', 'uniformidad', 'peso'],
    text: `Levante (reproductoras / futuras ponedoras o abuelas según el negocio):
- Objetivo: uniformidad de peso y desarrollo para un encasetamiento a producción exitoso.
- Etapas típicas: recepción → levante → (grading/selección) → producción.
- Controles: peso semanal, uniformidad (CV o % en banda de peso), mortalidad, consumo de alimento/agua, luz (fotoperiodo), vacunación.
- Grading: clasificar por peso/desarrollo; evita que aves dominantes retrasen a las livianas.
- Paso a producción: no adelantar ni retrasar solo por calendario si la uniformidad está mal; alinear con meta de peso y protocolo genético.
- En IncubApp: módulo Levantes (lotes received → levante → production) y reportes de huevo en granja cuando aplique.`,
  },
  {
    id: 'bioseguridad',
    tags: ['bioseguridad', 'epp', 'vacio', 'wet', 'tunnel', 'desinfeccion', 'visita'],
    text: `Bioseguridad en incubación y granja:
- Zonas limpia/sucia, flujo de personal y materiales, control de visitas.
- Duchas/cambio de ropa, EPP, rodiluvios y protocolos de vehículos.
- Vacío sanitario entre lotes en galpón; limpieza profunda de setters/hatchers entre ciclos (single-stage facilita).
- Wet tunnel / muestreo de ambiente: aliado de sanidad, no de “alarma a gerencia por cada placa”.
- Escalamiento a gerencia: brotes, fallas sistémicas de cumplimiento, CAPEX de bioseguridad — no cada checklist diario.`,
  },
  {
    id: 'mantenimiento-planta',
    tags: ['mantenimiento', 'ot', 'falla', 'volteo', 'humificador', 'chiller', 'compresor'],
    text: `Mantenimiento en planta de incubación:
- Críticos: volteo, calefacción/enfriamiento, humidificación, ventiladores, sellos de puerta, UPS/planta eléctrica.
- OT prioritarias las gestiona coordinación de planta/mantenimiento; gerencia ve downtime agregado y CAPEX.
- Predictivo ligero: tendencias de T°/HR fuera de banda, ruidos, vibración, horas de equipo.
- Evidencia: foto de pantalla de máquina + nota en ronda (IncubApp).`,
  },
  {
    id: 'calidad-huevo',
    tags: ['huevo', 'fertil', 'incubable', 'almacenamiento', 'cuarto frio', 'recepcion'],
    text: `Huevo fértil e incubable:
- Recepción: integridad, suciedad, fisuras, temperatura de llegada, trazabilidad de granja/lote.
- Almacenamiento (cuarto frío): T° y HR de conservación; rotación FIFO; no incubar huevo “viejo” fuera de protocolo.
- Clasificación incubable vs. no incubable impacta incubabilidad y costo.
- Cadena: granja → transporte → recepción → frío → cargue a setter.`,
  },
  {
    id: 'gerencia-incubapp',
    tags: ['gerencia', 'oc', 'factura', 'cotizacion', 'kpi', 'modulo', 'escalar'],
    text: `Gerencia en IncubApp:
- Bandeja: OC, facturas, cotizaciones, reportes de área y solicitudes de líderes — preferible ya verificados por el responsable del módulo.
- Qué NO satura gerencia: cada OT, cada ronda incompleta, cada warning de sensor.
- Scorecard útil: incubabilidad, pollito conforme, downtime crítico, costo/pollito, cumplimiento de compras, ausentismo.
- Módulos herméticos: cada área ve lo suyo; accesos temporales vía pestaña Accesos.`,
  },
  {
    id: 'automatizacion',
    tags: ['automatizacion', 'iot', 'sensor', 'scada', 'plc', 'alarma'],
    text: `Automatización e IoT en incubación:
- Prioridad: sensores de T°/HR/CO₂ y estado de volteo con umbrales y alarma a planta.
- Bitácora digital de ronda (IncubApp) evita papel y da timestamp + foto.
- Integrar alarmas a OT evita “se olvidó avisar”.
- No automatizar el caos: primero estandarizar proceso de ronda y 5S en salas técnicas.`,
  },
  {
    id: 'cargue-termico',
    tags: ['cargue', 'mapa de cargue', 'carro', 'fertilidad', 'edad de parvada', 'balance termico', 'zona', 'serpentin', 'centro', 'paredes'],
    text: `Mapa de cargue de 12 carros (norma real Petersime, "How to correctly load incubators with eggs from different flocks"):
- Zona CENTRO (columna central) = menor producción de calor. Zona SERPENTÍN (junto al ventilador) = mayor calor. Zona PAREDES = intermedia. La máquina se carga completa (12/12) y simétrica (mismo nº de carros a cada lado del ventilador).
- IncubApp calcula el calor de cada carro combinando 3 factores reales: (1) fertilidad de la parvada — estimada de la edad en semanas (30–44 sem = parvada "prime"/fertilidad alta; fuera de ese rango, media o baja), guardada una sola vez por lote en el registro de edad de parvadas y actualizada automáticamente con el tiempo; (2) tipo de huevo 1–5 como tamaño/masa (5 = más grande = más calor); (3) tiempo de almacenamiento (huevo más fresco = calor más inmediato; muy almacenado = calor diferido).
- Tolerancias recomendadas por Petersime al mezclar lotes: no exceder 10 semanas de diferencia de edad de parvada, 7 días de diferencia de almacenamiento, ni 10% de diferencia de fertilidad entre los lotes que se mezclan en una misma máquina.
- Nunca iniciar un ciclo con la máquina incompleta: invalida cualquier balance térmico logrado.`,
  },
  {
    id: 'ambiente-clima',
    tags: ['temperatura', 'humedad', 'hr', 'co2', 'ventilacion', 'punto de rocío'],
    text: `Clima de máquina (orientación general):
- Temperatura del aire y del embrión no son lo mismo; equipos avanzados estiman o miden perfiles.
- HR demasiado baja: deshidratación del embrión; muy alta: picaje/retrasos y problemas de ombligo.
- CO₂ alto: puede usarse en protocolos controlados de single-stage; fuera de rango sin protocolo = riesgo.
- Calibre sensores; compare con patrón; registre drift.
- Ante duda de setpoints: manual del equipo + técnico de la marca + protocolo genético.`,
  },
  {
    id: 'herramientas-correo',
    tags: ['correo', 'gmail', 'email', 'calendar', 'drive', 'agenda', 'hoja'],
    text: `Herramientas del asesor (cuando el usuario conecta Google):
- Leer y resumir correos recientes; redactar borradores; enviar solo con confirmación explícita.
- Crear eventos en Google Calendar.
- Listar archivos de Drive; crear documentos/hojas simples vía API cuando haya permiso.
- Nunca envíes correo o borres datos sin que el usuario confirme el borrador en pantalla.`,
  },
]

/**
 * Recupera los fragmentos más relevantes a la pregunta.
 */
export function retrieveKnowledge(query, limit = 4) {
  const q = (query || '').toLowerCase()
  const tokens = q.split(/[^a-záéíóúñ0-9]+/i).filter((t) => t.length > 2)
  const scored = KNOWLEDGE_CHUNKS.map((chunk) => {
    let score = 0
    const hay = `${chunk.tags.join(' ')} ${chunk.text}`.toLowerCase()
    for (const t of tokens) {
      if (hay.includes(t)) score += 2
      if (chunk.tags.some((tag) => tag.includes(t) || t.includes(tag))) score += 3
    }
    // boost known brands/topics
    if (/petersime|biostreamer|airstreamer/i.test(q) && chunk.id === 'petersime') score += 10
    if (/levante|grading|reproduct/i.test(q) && chunk.id === 'levante') score += 8
    if (/nacedora|hatcher|transfer/i.test(q) && chunk.id === 'hatcher-transfer') score += 8
    if (/cargue|mapa de cargue|fertilidad|edad de parvada|serpentin/i.test(q) && chunk.id === 'cargue-termico') score += 10
    if (/gerencia|factura|cotiz|oc\b/i.test(q) && chunk.id === 'gerencia-incubapp') score += 6
    return { chunk, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored.map((x) => x.chunk)
}

export const ADVISOR_SUGGESTIONS = [
  'Explícame la diferencia entre setter y nacedora',
  'Buenas prácticas tipo Petersime / single-stage',
  'Cómo llevar un levante con buena uniformidad',
  'Qué debe ver gerencia y qué no',
  'Revisa mis correos recientes',
  'Redacta un correo de solicitud de cotización',
  'Agenda una reunión de gerencia mañana a las 9',
]
