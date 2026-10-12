/**
 * =============================================================================
 * ARCHIVO: src/lib/userManuals.js
 * PROPÓSITO: Instructivos paso a paso de cada perfil, para leerlos DENTRO de la app
 *   (pestaña «Manuales e instructivos»). Cada perfil ve primero el suyo; los demás
 *   quedan a un toque. El manual completo ilustrado (PDF / web) se abre aparte desde
 *   /manuales/. Actualizado al 12-10-2026 con el SIG separado del líder de planta, la
 *   proyección broiler, «Equipo y sedes» de mantenimiento y los traslados a SST.
 * Cada paso dice en qué pantalla está (`tab`) para abrirla desde el instructivo.
 * =============================================================================
 */

/** @typedef {{ title: string, steps: (string|{ text: string, tab?: string })[], tip?: string }} ManualSection */
/** @typedef {{ id: string, title: string, audience: string, icon: string, sections: ManualSection[] }} Manual */

/** @type {Manual[]} */
export const MANUALS = [
  {
    id: 'basico',
    title: 'Primeros pasos (todos los perfiles)',
    audience: 'Todo el personal',
    icon: '🚀',
    sections: [
      {
        title: 'Entrar a la app',
        steps: [
          'Abre incubapp.cdhmaker.com en el navegador del celular o del PC.',
          'Escribe tu correo y tu contraseña. Si la olvidaste, toca «¿Olvidaste tu contraseña?»; si no te llega el correo, tu líder o el administrador te asigna una contraseña temporal.',
          'La primera vez acepta los términos de uso y permite cámara y ubicación: se usan para las fotos de evidencia y el registro de asistencia.',
          'En el celular, usa «Agregar a pantalla de inicio» para abrirla como una app.',
        ],
        tip: 'Si entraste una vez con señal, la app vuelve a abrir sin conexión con el mismo usuario.',
      },
      {
        title: 'Tu perfil',
        steps: [
          { text: 'Abre «Perfil» (al final del menú).', tab: 'perfil' },
          'Toca «Editar», corrige tu nombre y teléfono y toca «Guardar cambios». Si el servidor no acepta el cambio, la pantalla vuelve a tus datos anteriores y te muestra el error.',
          'Cambia tu foto con la galería o una selfie.',
        ],
      },
      {
        title: 'Asistencia',
        steps: [
          { text: 'Abre «Asistencia» al llegar y al salir.', tab: 'asistencia' },
          'Toma la foto y deja que el teléfono tome la ubicación: el registro dice en qué sede marcaste.',
        ],
      },
      {
        title: 'Traslado misional (salir de la sede en vehículo)',
        steps: [
          { text: 'Antes de salir abre «Desplazamientos misionales».', tab: 'misionales' },
          'Elige el vehículo (moto, carro o camión), escribe la placa, el proceso, DESDE dónde sales y HASTA dónde vas.',
          'Revisa cada aspecto del vehículo; si algo está malo toma la foto de evidencia. Firma y guarda.',
          'Al guardar, el traslado le llega a SST como aviso y tu jefe ve en su tablero que vas «en traslado» de origen a destino.',
        ],
        tip: 'Un documento vencido (SOAT, licencia, técnico-mecánica) marca el vehículo como NO apto y así se le informa a SST.',
      },
      {
        title: 'Sin señal',
        steps: [
          'Lo que registres sin conexión (OT, fotos, rondas) queda en cola en el teléfono.',
          'Al volver la señal sube solo. No borres los datos del navegador mientras haya registros pendientes.',
        ],
      },
    ],
  },
  {
    id: 'lider-planta',
    title: 'Líder de planta (SIG Producción y SIG Mantenimiento)',
    audience: 'Líder / jefe de planta',
    icon: '🏭',
    sections: [
      {
        title: 'Tu inicio: dos SIG por separado',
        steps: [
          { text: 'Abre «Hoy». Arriba están los dos botones: SIG Producción y SIG Mantenimiento.', tab: 'hoy' },
          'La app recuerda cuál dejaste abierto la última vez, en el PC y en el celular.',
        ],
      },
      {
        title: 'SIG Producción (en este orden)',
        steps: [
          '«Necesita tu decisión»: lo urgente primero, cada fila con su botón (pedir OT a mantenimiento, aprobar, abrir el formato).',
          'Indicadores del turno, tu equipo con sus rondas contra el ritmo del turno y el plan del día (cargues, transferencias y nacimientos).',
          'Proyección broiler: pollitos que nacen por día en las próximas tres semanas (ver el instructivo «Proyección broiler»).',
          'Actividad de producción del turno: rondas, actividades, cargues y transferencias; «FORMATO» abre el registro diligenciado.',
          'Evidencias SIG Producción: cargues, transferencias, nacimientos y mapas de cargue con su soporte.',
        ],
      },
      {
        title: 'SIG Mantenimiento (en este orden)',
        steps: [
          'Estado de las máquinas: operativas, en alerta, con falla y OT activas.',
          'Herramientas: Órdenes de trabajo, Plan AM y manuales, Calibraciones y Equipo y sedes.',
          'Órdenes de trabajo recientes y evidencias SIG Mantenimiento (OT, calibraciones, registros SIG y Mantum).',
          'Centro de Activos y dossiers de cada máquina: hoja de vida, historial y documentos.',
        ],
        tip: 'Desde «Equipo y sedes» ves dónde está cada técnico y para dónde va, igual que el líder de mantenimiento.',
      },
    ],
  },
  {
    id: 'broiler',
    title: 'Proyección broiler',
    audience: 'Líder de planta, líder de producción y gerencia',
    icon: '🐣',
    sections: [
      {
        title: 'Qué muestra',
        steps: [
          { text: 'Abre «Proyección broiler» (o SIG Producción en tu inicio).', tab: 'proyeccion-broiler' },
          'Arriba: pollitos de los próximos 7 y 21 días, la tasa de nacimiento y el huevo que hay en proceso.',
          'El gráfico tiene una columna por día de nacimiento: en naranja lo proyectado y en verde lo real cuando el nacimiento ya se cerró. En el celular se desliza a lo ancho.',
          'Debajo, cada cargue: lote, incubadora, día de incubación (de 21), etapa y pollitos. En el PC es una tabla; en el celular, tarjetas.',
        ],
      },
      {
        title: 'De dónde salen los números (es automático)',
        steps: [
          'Cada cargue de incubadora registrado abre un ciclo: transferencia el día 18 y nacimiento el día 21.',
          'Huevos del ciclo: los del nacimiento si ya se anotaron; si no, los del mapa de cargue aprobado de esa incubadora; si no, las posturas del lote.',
          'Pollitos: el estimado que anota el supervisor al programar el nacimiento; si no, huevos × la tasa REAL de la planta (pollitos ÷ huevos de los nacimientos cerrados de los últimos 90 días).',
          'Cuando el supervisor cierra el nacimiento con los pollitos reales, ese dato reemplaza la proyección.',
          'La pantalla se actualiza sola con cada cargue, transferencia o nacimiento, y cada 5 minutos.',
        ],
        tip: 'Si aparece «cargues sin cantidad de huevo», falta el mapa de cargue o las posturas del lote: complétalos y la proyección se corrige sola. «⬇ Excel» descarga el detalle por día y por cargue.',
      },
    ],
  },
  {
    id: 'lider-mantenimiento',
    title: 'Líder de mantenimiento',
    audience: 'Líder de mantenimiento',
    icon: '🛠️',
    sections: [
      {
        title: 'Asignar la sede de cada auxiliar',
        steps: [
          { text: 'Abre «Equipo y sedes».', tab: 'equipo-mantenimiento' },
          'En «Dónde está cada uno», al lado de cada técnico, elige su sede. Con eso su inicio abre el Plan AM de esa sede.',
          '«Todas las sedes» deja al técnico sin sede fija.',
        ],
      },
      {
        title: 'Crear y asignar OT o actividades en cualquier sede',
        steps: [
          'Toca «➕ Crear / asignar OT» (o «Asignar actividad» al lado de un técnico: ya viene con él y su sede).',
          'Elige la sede, la máquina si aplica, escribe qué hay que hacer, el tipo (preventivo/actividad programada, correctivo o inspección), la prioridad y la fecha.',
          'En «Asignar a» elige al técnico, a ti mismo («Yo») o déjala sin asignar para que la tome quien la atienda.',
          'Al guardar, la OT aparece al instante en el inicio del técnico y en «Órdenes de trabajo». Sin señal queda en cola y sube sola.',
          'En «OT sin asignar» puedes repartir las que llegaron de las rondas o de planta.',
        ],
      },
      {
        title: 'Tus propios trabajos y tu lugar de trabajo',
        steps: [
          'En «Mis trabajos» toca «Atender»: la OT pasa a ejecución y tu lugar de trabajo queda reportado solo.',
          { text: 'Para cerrarla con resolución, tiempo de parada y fotos, toca «Cerrar» (abre Órdenes de trabajo).', tab: 'mantenimiento' },
          'En «Mi lugar de trabajo» elige sede, sitio y qué estás haciendo y toca «📍 Estoy aquí».',
          'Si sales de la sede, toca «🚗 Salgo en traslado misional» y diligencia la inspección del vehículo con origen y destino: le llega a SST y queda en el tablero.',
        ],
      },
      {
        title: 'Ver dónde está cada técnico',
        steps: [
          'Cada técnico muestra lo último que se sabe: la OT que está ejecutando, su último reporte de lugar o su traslado misional (origen → destino), con la hora.',
          'El círculo verde es «en sitio»; el ámbar, «en traslado».',
          '«Traslados misionales (24 h)» lista todos los traslados del día con el vehículo y si estaba apto.',
        ],
      },
    ],
  },
  {
    id: 'auxiliar-mantenimiento',
    title: 'Auxiliar de mantenimiento',
    audience: 'Técnicos / auxiliares de mantenimiento',
    icon: '🔧',
    sections: [
      {
        title: 'Tu inicio',
        steps: [
          { text: 'Abre «Hoy»: ves tu sede asignada, el Plan AM de la semana y las OT por atender.', tab: 'hoy' },
          'Toca una actividad del Plan AM para ver sus pasos, diligenciar el chequeo y subir la evidencia.',
        ],
      },
      {
        title: 'Reportar dónde estás',
        steps: [
          'En «📍 Mi lugar de trabajo» elige la sede, el sitio y lo que estás haciendo (o la OT) y toca «Estoy aquí». Tu líder lo ve al instante.',
          'Al terminar la jornada toca «Terminé el turno».',
          'Para salir de la sede usa «🚗 Salgo en traslado misional»: la inspección del vehículo con origen y destino le llega a SST.',
        ],
      },
      {
        title: 'Órdenes de trabajo',
        steps: [
          { text: 'En «Órdenes de trabajo» ves las tuyas y las abiertas sin asignar; «Atender» te la asigna.', tab: 'mantenimiento' },
          'Al cerrar escribe la resolución y el tiempo de parada (0 si el equipo no paró) y sube las fotos.',
        ],
      },
    ],
  },
  {
    id: 'recepcion',
    title: 'Operario de recepción',
    audience: 'Operario de recepción',
    icon: '🚛',
    sections: [
      {
        title: 'Remisión huevos galpón',
        steps: [
          { text: 'Abre «📋 Remisión galpón».', tab: 'remision-galpon' },
          'Toca «📷 Tomar foto con cámara» y fotografía la remisión que llegó con el huevo (o elígela de la galería).',
          'La app intenta leer el número, las fechas y los galpones. Coteja SIEMPRE cada número con la foto («🔍 Ampliar foto»): la lectura automática ayuda, pero puede equivocarse.',
          'Digita o corrige cada galpón: incubable, fisurado, extra, roto, sucio, cajas y cubetas. Puedes escribir 2.240 o 2240.',
          'Revisa los totales, completa fechas y quién despacha / recibe y toca «💾 Guardar remisión».',
          'Abajo, en «Últimas remisiones guardadas», confirma que quedó registrada con su foto.',
        ],
        tip: 'No se puede guardar sin número de remisión ni sin huevo incubable, y una misma remisión no se registra dos veces. La imagen de ejemplo es solo una referencia: nunca la guardes como remisión.',
      },
      {
        title: 'Certificar envíos y llegada a planta',
        steps: [
          { text: 'En «🚛 Recepción» → «📥 Certificar envíos» revisa y certifica cada envío de granja.', tab: 'recepcion' },
          '«🚛 Llegada a planta» registra la foto y el sello del vehículo al llegar.',
          '«Cuarto frío» registra los saldos reales por lote, fecha y galpón.',
        ],
      },
      {
        title: 'Lo demás de tu turno',
        steps: [
          { text: 'Tus rondas siguen en «Supervisión»: el cumplimiento te pide las rondas del turno.', tab: 'supervision' },
          { text: '«Clasificación» tiene los carros, el mapa de cargue y la orden del día.', tab: 'clasificacion' },
          'Rotación de huevo, Encintar, Marcar carros, Liquidar cargues, Auditoría de huevos, Autorizar datos, Solicitudes y Reportes e informes aún están en construcción: la pantalla lo dice, todavía no guarda y te indica a dónde ir mientras tanto.',
        ],
      },
    ],
  },
  {
    id: 'operario',
    title: 'Operario y auxiliar de turno',
    audience: 'Operarios, auxiliares de turno y de producción',
    icon: '👷',
    sections: [
      {
        title: 'Tu turno',
        steps: [
          { text: '«Hoy» te dice qué te toca ahora: rondas pendientes, cargues y actividades.', tab: 'hoy' },
          { text: 'Ronda: en «Supervisión» toma la foto de la pantalla de cada máquina y marca su estado (normal, Alerta, Falla o Apagada).', tab: 'supervision' },
          'Si marcas Falla o Apagada, la app te deja pedir la OT a mantenimiento desde ahí mismo.',
          { text: 'Calibrar máquina: dos fotos (calibrador y pantalla).', tab: 'calibracion' },
          { text: '«Mi historial» muestra lo que hiciste y lo compara entre períodos.', tab: 'historial' },
        ],
      },
    ],
  },
  {
    id: 'sst',
    title: 'SST (seguridad y salud en el trabajo)',
    audience: 'Líder y auxiliares de SST',
    icon: '🦺',
    sections: [
      {
        title: 'Traslados misionales',
        steps: [
          'Cada traslado que alguien guarda en Misionales te llega a la campana de notificaciones como «Traslado misional»: quién, de dónde, para dónde, el vehículo y si estaba apto.',
          { text: 'En «Desplazamientos misionales» → «⚙ Admin» ves todas las inspecciones de la empresa, con filtros y exportación.', tab: 'misionales' },
          'Un vehículo NO apto se marca con ⚠: contacta al conductor y a su jefe antes de que salga.',
        ],
      },
      {
        title: 'Registros de SST',
        steps: [
          { text: 'En «SST» diligencia inspecciones, espacios confinados y demás registros.', tab: 'sst' },
          'El preoperacional de vehículos (FOSST22) lo diligencian los conductores; tú lo consultas y exportas.',
        ],
      },
    ],
  },
  {
    id: 'lider-produccion',
    title: 'Líder de producción',
    audience: 'Líder de producción / calidad',
    icon: '🧪',
    sections: [
      {
        title: 'Tu inicio',
        steps: [
          { text: '«Hoy»: recepción, cuarto frío, mapas de cargue, estado de las máquinas y tu equipo.', tab: 'hoy' },
          { text: '«Proyección broiler»: los pollitos que nacen por día con los datos reales.', tab: 'proyeccion-broiler' },
          { text: '«Calidad de incubación»: peso del huevo, humedad, ovoscopia, embriodiagnóstico y pollito.', tab: 'calidad' },
        ],
      },
    ],
  },
  {
    id: 'gerencia',
    title: 'Gerencia',
    audience: 'Gerencia y dirección',
    icon: '💼',
    sections: [
      {
        title: 'La empresa hoy',
        steps: [
          { text: '«Hoy» resume lo urgente de las diez áreas; toca un área para abrirla.', tab: 'hoy' },
          { text: '«Proyección broiler» da el nacimiento esperado de las próximas tres semanas.', tab: 'proyeccion-broiler' },
          { text: '«Informes gerencia» muestra los datos verificados.', tab: 'informes' },
        ],
      },
    ],
  },
  {
    id: 'conductor',
    title: 'Conductor',
    audience: 'Conductores',
    icon: '🚚',
    sections: [
      {
        title: 'Preoperacional del vehículo (FOSST22)',
        steps: [
          { text: 'Antes de cada salida abre «Preoperacional vehículos».', tab: 'preoperacional' },
          'Revisa cada punto, toma las fotos que pida y firma.',
          'Un punto crítico malo deja el vehículo NO apto: avisa a tu líder antes de salir.',
        ],
      },
    ],
  },
]

/** Instructivo propio de cada perfil (va primero). El resto se ofrece después. */
export function manualIdsFor(role, area) {
  const a = String(area || '').toLowerCase()
  const own = []
  if (role === 'coordinator') {
    if (a === 'maintenance') own.push('lider-mantenimiento')
    else if (a === 'sst' || a === 'hse') own.push('sst')
    else if (a === 'quality' || a === 'production') own.push('lider-produccion', 'broiler')
    else if (!a || a === 'plant' || a === 'general') own.push('lider-planta', 'broiler', 'lider-mantenimiento')
  }
  if (role === 'maintenance_auxiliary') own.push('auxiliar-mantenimiento')
  if (role === 'reception_operator') own.push('recepcion')
  if (['operator', 'auxiliary', 'auxiliary_production', 'quality_auxiliary', 'supervisor'].includes(role)) own.push('operario')
  if (role === 'sst_auxiliary' || role === 'hse_auxiliary') own.push('sst')
  if (role === 'management' || role === 'management_auxiliary' || (role === 'coordinator' && a === 'management')) own.push('gerencia', 'broiler')
  if (role === 'driver') own.push('conductor')
  if (role === 'owner' || role === 'admin') own.push('gerencia', 'lider-planta', 'lider-mantenimiento')
  const ids = [...new Set([...own, 'basico'])]
  return { own: ids, others: MANUALS.map((m) => m.id).filter((id) => !ids.includes(id)) }
}

export const manualById = (id) => MANUALS.find((m) => m.id === id) || null

/** Texto plano de un paso (los pasos pueden traer la pantalla a abrir) */
export const stepText = (s) => (typeof s === 'string' ? s : s?.text || '')

/** Búsqueda simple sin tildes en títulos y pasos */
export function searchManuals(query) {
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(query).trim()
  if (!q) return []
  const out = []
  for (const m of MANUALS) {
    for (const sec of m.sections) {
      const hay = [sec.title, sec.tip, ...sec.steps.map(stepText)].map(norm).join(' ')
      if (hay.includes(q)) out.push({ manual: m, section: sec })
    }
  }
  return out
}
