/**
 * Espacios confinados (Resolución 0491 de 2020 del Ministerio del Trabajo): límites de
 * atmósfera, lista de verificación del permiso de entrada, estados, y los documentos
 * imprimibles (programa de gestión y permiso diligenciado). Funciones puras.
 * La base aplica las mismas reglas (supabase/migrations/20260930_espacios_confinados.sql):
 * si se cambia un límite aquí, se cambia allá.
 * Henry Stark Desarrollador · 30-09-2026
 */
import { escapeHtml, letterheadCss, letterheadHtml } from '../../../lib/corporateBrand'

/** Atmósfera aceptable para entrar. O₂ en %, inflamables en % del LIE, gases en ppm. */
export const LIMITS = {
  o2Min: 19.5,
  o2Max: 23.5,
  lelMax: 10,
  coMax: 25,
  h2sMax: 1,
  hchoMax: 0.1,
}

export const LIMIT_ROWS = [
  ['Oxígeno (O₂)', `entre ${LIMITS.o2Min} % y ${LIMITS.o2Max} %`, 'Menos: asfixia · más: riesgo de incendio'],
  [
    'Gases y vapores inflamables',
    `menos del ${LIMITS.lelMax} % del límite inferior de explosividad (LIE)`,
    'Riesgo de incendio o explosión',
  ],
  ['Monóxido de carbono (CO)', `hasta ${LIMITS.coMax} ppm`, 'TLV-TWA ACGIH'],
  ['Sulfuro de hidrógeno (H₂S)', `hasta ${LIMITS.h2sMax} ppm`, 'TLV-TWA ACGIH'],
  ['Formaldehído (si hubo fumigación)', `hasta ${LIMITS.hchoMax} ppm`, 'TLV-TWA ACGIH'],
]

const n = (v) => (v === '' || v == null ? null : Number(v))

/** Qué está fuera de límites en una medición (vacío = aceptable). */
export function readingIssues(r = {}) {
  const out = []
  const o2 = n(r.o2_pct)
  const lel = n(r.lel_pct)
  if (o2 == null || Number.isNaN(o2)) out.push('Falta el oxígeno')
  else if (o2 < LIMITS.o2Min) out.push(`Oxígeno bajo (${o2} %)`)
  else if (o2 > LIMITS.o2Max) out.push(`Oxígeno alto (${o2} %)`)
  if (lel == null || Number.isNaN(lel)) out.push('Falta el LIE')
  else if (lel >= LIMITS.lelMax) out.push(`Inflamables ${lel} % del LIE`)
  if ((n(r.co_ppm) ?? 0) > LIMITS.coMax) out.push(`CO ${n(r.co_ppm)} ppm`)
  if ((n(r.h2s_ppm) ?? 0) > LIMITS.h2sMax) out.push(`H₂S ${n(r.h2s_ppm)} ppm`)
  if ((n(r.hcho_ppm) ?? 0) > LIMITS.hchoMax) out.push(`Formaldehído ${n(r.hcho_ppm)} ppm`)
  return out
}

export const readingOk = (r) => readingIssues(r).length === 0

/** Lista de verificación: todo debe estar confirmado para autorizar. */
export const CHECKLIST = [
  { key: 'lockout', label: 'Ventiladores, persianas y climatización bloqueados y etiquetados (LOTO)' },
  { key: 'ventilation', label: 'Túnel ventilado antes de entrar (natural o forzada)' },
  { key: 'rescue', label: 'Equipo de rescate en la compuerta y brigada avisada' },
  { key: 'ppe', label: 'EPP completo según la medición (respirador, guantes, gafas, casco, linterna)' },
  { key: 'signage', label: 'Señal «Espacio confinado · no entre sin permiso» y área demarcada' },
  { key: 'training', label: 'Entrantes, vigía y supervisor capacitados y aptos para la tarea' },
  { key: 'communication', label: 'Comunicación vigía–entrantes probada' },
]

export const checklistComplete = (c = {}) => CHECKLIST.every((i) => c?.[i.key] === true)

export const WORK_TYPES = [
  { value: 'cleaning', label: 'Limpieza y desinfección' },
  { value: 'filters', label: 'Cambio de filtros' },
  { value: 'maintenance', label: 'Mantenimiento de ventiladores o persianas' },
  { value: 'inspection', label: 'Inspección' },
  { value: 'other', label: 'Otro' },
]
export const workTypeLabel = (v) => WORK_TYPES.find((w) => w.value === v)?.label || 'Otro'

export const PERMIT_STATUS = {
  draft: { label: 'Por autorizar', tone: 'warn' },
  authorized: { label: 'Autorizado', tone: 'info' },
  active: { label: 'En uso', tone: 'info' },
  suspended: { label: 'Suspendido · salir', tone: 'danger' },
  closed: { label: 'Cerrado', tone: 'ok' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
}
export const permitStatusLabel = (s) => PERMIT_STATUS[s]?.label || s
export const OPEN_STATUSES = ['draft', 'authorized', 'active', 'suspended']

/** Quién hace de supervisor de entrada (autoriza, cancela y cierra). Igual que la base. */
export function canSuperviseEntry({ role, area, isOmniscient = false }) {
  if (isOmniscient) return true
  if (['owner', 'admin', 'management', 'sst_auxiliary', 'hse_auxiliary'].includes(role)) return true
  return role === 'coordinator' && ['sst', 'hse', 'maintenance', 'plant'].includes(String(area || ''))
}

/** Quién edita el inventario de espacios confinados. */
export function canEditSpaces({ role, area, isOmniscient = false }) {
  if (isOmniscient) return true
  if (['owner', 'admin', 'management', 'sst_auxiliary', 'hse_auxiliary'].includes(role)) return true
  return role === 'coordinator' && ['sst', 'hse'].includes(String(area || ''))
}

/** Personas adentro ahora por permiso. */
export function insideByPermit(entries = []) {
  const m = {}
  for (const e of entries) if (!e.exited_at) (m[e.permit_id] ||= []).push(e)
  return m
}

/** Estado de cada espacio para el panel y el mapa 3D. */
export function spaceStatus({ spaces = [], permits = [], entries = [] }) {
  const inside = insideByPermit(entries)
  const open = permits.filter((p) => OPEN_STATUSES.includes(p.status))
  return spaces.map((s) => {
    const mine = open.filter((p) => p.space_id === s.id)
    const people = mine.flatMap((p) => inside[p.id] || [])
    const suspended = mine.find((p) => p.status === 'suspended')
    const live = mine.find((p) => p.status === 'active' || p.status === 'authorized')
    return {
      space: s,
      permits: mine,
      inside: people,
      state: suspended
        ? 'suspended'
        : people.length
          ? 'occupied'
          : live
            ? 'authorized'
            : mine.length
              ? 'draft'
              : 'closed',
    }
  })
}

/** Cifras de los últimos 12 meses para el programa (indicadores). */
export function programStats({ permits = [], readings = [], now = new Date() }) {
  const since = now.getTime() - 365 * 86400000
  const last = permits.filter((p) => new Date(p.created_at || p.valid_from).getTime() >= since)
  const reads = readings.filter((r) => new Date(r.taken_at).getTime() >= since)
  return {
    permits: last.length,
    closed: last.filter((p) => p.status === 'closed').length,
    suspended: last.filter((p) => p.suspended_reason).length,
    readings: reads.length,
    badReadings: reads.filter((r) => r.ok === false || !readingOk(r)).length,
  }
}

/* ── Documentos ─────────────────────────────────────────────────────────── */

const esc = (v) => escapeHtml(v == null || v === '' ? 'No registrado' : v)
const dt = (v) =>
  v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'No registrado'
const m2 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: 2 }))
const ul = (items) => `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
const table = (head, rows) =>
  `<table class="corp-table"><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`

const DOC_CSS = `h2{font-size:12.5px;color:#0b1428;margin:18px 0 6px;border-bottom:2px solid #e0740a;padding-bottom:3px}
h3{font-size:11.5px;margin:12px 0 4px;color:#1e293b} p,li{line-height:1.5} ul{margin:4px 0 8px 18px;padding:0}
.doc-note{margin:12px 0;padding:9px 11px;border:1px solid #e0740a;background:#fff8ef;font-size:10.5px}
.sign{width:100%;border-collapse:collapse;margin-top:26px;font-size:10px;text-align:center}
.sign td{border:1px solid #cbd5e1;padding:6px;vertical-align:bottom}.sign tr:first-child td{background:#f1f5f9;font-weight:700}
.ok{color:#15803d;font-weight:700}.bad{color:#b91c1c;font-weight:700}`

function signatures(roles) {
  return `<table class="sign"><tr>${roles.map((r) => `<td>${escapeHtml(r[0])}</td>`).join('')}</tr><tr style="height:52px">${roles
    .map((r) => `<td style="color:#64748b">${escapeHtml(r[1])}</td>`)
    .join('')}</tr></table>`
}

function doc({ code, title, version = '01', body, plantName }) {
  const meta = { code, title, version, date: '30-09-2026', process: 'SEGURIDAD Y SALUD EN EL TRABAJO', plantName }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${letterheadCss()}${DOC_CSS}</style></head><body>${letterheadHtml(meta)}${body}</body></html>`
}

/** Código provisional: confirmar con la asesora del SIG antes de publicarlo. */
export const PROGRAM_CODE = 'PGSST-EC01'
export const PERMIT_CODE = 'FOSST-EC01'

/**
 * Programa de gestión para trabajo en espacios confinados, armado con el inventario
 * real de la planta. Queda como documento base: lo revisa y aprueba el responsable del
 * SG-SST y se socializa con el COPASST.
 */
export function programHtml({ spaces = [], stats = null, plantName } = {}) {
  const active = spaces.filter((s) => s.active !== false)
  const inventory = table(
    ['Código', 'Espacio', 'Medidas (ancho × largo × alto)', 'Volumen', 'Acceso', 'Tareas típicas'],
    active.map((s) => [
      esc(s.code),
      esc(s.name),
      `${m2(s.width_m)} × ${m2(s.length_m)} × ${m2(s.height_m)} m`,
      s.width_m && s.length_m && s.height_m ? `${m2(s.width_m * s.length_m * s.height_m)} m³` : '—',
      esc(s.access),
      esc((s.typical_tasks || []).join(', ')),
    ]),
  )
  const hazards = active
    .map(
      (s) =>
        `<h3>${escapeHtml(s.code)} · ${escapeHtml(s.name)}</h3><p><b>Peligros:</b></p>${ul(s.hazards || [])}<p><b>Controles:</b></p>${ul(
          s.controls || [],
        )}`,
    )
    .join('')
  const limits = table(
    ['Parámetro', 'Aceptable para entrar', 'Referencia'],
    LIMIT_ROWS.map((r) => r.map((c) => escapeHtml(c))),
  )
  const indicators = stats
    ? table(
        ['Indicador (últimos 12 meses)', 'Valor'],
        [
          ['Permisos de entrada emitidos', stats.permits],
          ['Permisos cerrados correctamente', stats.closed],
          ['Permisos suspendidos por la atmósfera o por el equipo', stats.suspended],
          ['Mediciones de gases registradas', stats.readings],
          ['Mediciones fuera de límites', stats.badReadings],
        ].map(([a, b]) => [escapeHtml(a), escapeHtml(String(b))]),
      )
    : ''

  const body = `
<div class="doc-note"><b>Documento base generado por IncubApp</b> con el inventario de espacios confinados registrado para la planta.
Antes de adoptarlo, el responsable del SG-SST debe revisarlo, ajustarlo a las condiciones reales, confirmar los valores y la
formación exigidos por la norma vigente, firmarlo y socializarlo con el COPASST y los trabajadores.</div>

<h2>1. Objetivo</h2>
<p>Prevenir accidentes, lesiones y muertes en el trabajo dentro de los espacios confinados de la planta de incubación, definiendo
cómo se identifican, cómo se entra, quién autoriza, cómo se controla la atmósfera y cómo se rescata, conforme a la
Resolución 0491 de 2020 del Ministerio del Trabajo y al Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST).</p>

<h2>2. Alcance</h2>
<p>Aplica a todo trabajador directo, en misión, contratista o visitante que deba entrar, vigilar, supervisar o rescatar en los
espacios confinados inventariados en este programa: <b>${active.length} espacio${active.length === 1 ? '' : 's'}</b>
(${escapeHtml(active.map((s) => s.code).join(', ') || 'sin inventario')}). En la planta solo se consideran espacios confinados los
túneles de aire de incubadoras y nacedoras; cualquier otro espacio que cumpla la definición se agrega al inventario antes de
cualquier ingreso.</p>

<h2>3. Marco legal</h2>
${ul([
  'Resolución 0491 de 2020 (MinTrabajo): requisitos mínimos de seguridad para el trabajo en espacios confinados.',
  'Decreto 1072 de 2015, Libro 2, Parte 2, Título 4, Capítulo 6: Sistema de Gestión de Seguridad y Salud en el Trabajo.',
  'Resolución 0312 de 2019: estándares mínimos del SG-SST.',
  'Ley 1562 de 2012: Sistema General de Riesgos Laborales.',
  'Ley 9 de 1979 y Resolución 2400 de 1979: disposiciones de seguridad industrial en los lugares de trabajo.',
  'Resolución 1401 de 2007: investigación de incidentes y accidentes de trabajo.',
  'Valores límite permisibles (TLV) de la ACGIH para los agentes químicos medidos.',
])}

<h2>4. Definiciones</h2>
${ul([
  'Espacio confinado: lugar lo bastante amplio para que una persona entre y trabaje, con medios de entrada y salida limitados o restringidos, y que no está diseñado para ocupación continua.',
  'Atmósfera peligrosa: la que puede causar muerte, incapacidad o lesión por deficiencia o exceso de oxígeno, gases inflamables, o sustancias tóxicas por encima de su valor límite.',
  'Permiso de entrada: autorización escrita, con vigencia definida, que registra los peligros, controles, mediciones y personas de un ingreso.',
  'Supervisor de entrada: persona que verifica las condiciones, autoriza el permiso, lo suspende o lo cierra.',
  'Vigía: persona que permanece afuera todo el tiempo, controla quién está adentro, mantiene la comunicación y activa el rescate. No entra.',
  'Trabajador entrante: persona autorizada en el permiso para entrar y realizar la tarea.',
  'Rescatista: integrante de la brigada entrenado para el rescate en espacios confinados.',
  'LIE: límite inferior de explosividad. LOTO: bloqueo y etiquetado de energías peligrosas.',
])}

<h2>5. Inventario e identificación de los espacios confinados</h2>
${inventory}
<p>Cada compuerta lleva la señal «PELIGRO – ESPACIO CONFINADO – NO ENTRE SIN PERMISO». Los túneles se ven marcados en el mapa 3D de la
planta en IncubApp, con el estado del permiso y las personas adentro en tiempo real.</p>

<h2>6. Peligros y controles por espacio</h2>
${hazards || '<p>Sin espacios en el inventario.</p>'}

<h2>7. Roles y responsabilidades</h2>
<h3>Gerencia (empleador)</h3>
${ul([
  'Asignar los recursos: detector multigás calibrado, ventilación, equipos de rescate, EPP, formación y tiempo para hacerlo bien.',
  'Garantizar que nadie entre sin permiso de entrada y que este programa se cumpla.',
])}
<h3>Responsable del SG-SST</h3>
${ul([
  'Mantener el inventario, la identificación de peligros y este programa; revisarlo al menos una vez al año.',
  'Programar la formación, las evaluaciones médicas y el simulacro anual de rescate.',
  'Hacer seguimiento a los indicadores y a las suspensiones de permisos.',
])}
<h3>Supervisor de entrada (SST, líder de planta o líder de mantenimiento)</h3>
${ul([
  'Verificar la lista de chequeo, las mediciones y la vigencia; autorizar el permiso solo si todo está conforme.',
  'Suspender el trabajo ante cualquier condición insegura y cerrar el permiso cuando todos hayan salido.',
])}
<h3>Vigía</h3>
${ul([
  'Permanecer en la compuerta durante todo el trabajo; registrar entradas y salidas; mantener la comunicación.',
  'Ordenar la salida y activar el rescate ante una medición fuera de límites o cualquier señal de peligro. Nunca entrar a rescatar.',
])}
<h3>Trabajador entrante</h3>
${ul([
  'Entrar solo si está en el permiso vigente, usar el EPP, portar el detector si se le asigna y salir de inmediato cuando se le ordene o note un síntoma.',
])}
<h3>Brigada de emergencias y COPASST</h3>
${ul([
  'Brigada: mantener el equipo de rescate, practicar el rescate sin entrada y con entrada, y atender el llamado del vigía.',
  'COPASST: conocer este programa, participar en las inspecciones y en la investigación de incidentes.',
])}
<p>En IncubApp la base de datos solo deja autorizar, cancelar y cerrar un permiso a quien cumple el rol de supervisor de entrada.</p>

<h2>8. Competencias, formación y aptitud</h2>
${ul([
  'Supervisores, vigías, entrantes y rescatistas con la formación en trabajo en espacios confinados que exige la Resolución 0491 de 2020, vigente y certificada.',
  'Evaluación médica ocupacional con concepto de aptitud para la tarea (incluida la capacidad para usar respirador).',
  'Reentrenamiento cuando cambie la tarea, el espacio o después de un incidente, y simulacro de rescate al menos una vez al año.',
])}

<h2>9. Procedimiento de trabajo seguro</h2>
<h3>Antes de entrar</h3>
${ul([
  'Diligenciar el permiso de entrada en IncubApp (SST → Espacios confinados): tarea, vigencia (máximo 12 horas, dentro del turno), supervisor, vigía y entrantes.',
  'Bloquear y etiquetar ventiladores, persianas y climatización del túnel; confirmar energía cero.',
  'Ventilar el túnel; si hubo fumigación o desinfección, respetar el tiempo de reingreso de la ficha de seguridad del producto.',
  'Medir la atmósfera desde afuera con el detector multigás calibrado (O₂, LIE, CO, H₂S y, si aplica, formaldehído) en la entrada y a lo largo del túnel.',
  'Confirmar la lista de verificación y pedir la autorización al supervisor de entrada.',
])}
<h3>Durante el trabajo</h3>
${ul([
  'El vigía registra cada entrada y salida; solo entran las personas del permiso.',
  'Medir la atmósfera de forma continua o al menos cada 60 minutos y registrar cada medición.',
  'Si una medición sale fuera de límites, IncubApp suspende el permiso: todos salen de inmediato, se ventila, se vuelve a medir y el supervisor decide si reautoriza.',
])}
<h3>Al terminar</h3>
${ul([
  'Todos afuera y contados; retirar herramientas y materiales; cerrar la compuerta.',
  'Retirar el bloqueo y etiquetado según el procedimiento; cerrar el permiso con las observaciones.',
])}

<h2>10. Criterios de atmósfera aceptable</h2>
${limits}
<p>La base de datos de IncubApp no deja autorizar un permiso sin una medición de menos de 60 minutos dentro de estos límites.</p>

<h2>11. Ventilación, aislamiento y equipos</h2>
${ul([
  'Ventilación forzada con ventilador portátil y ducto cuando la natural no mantenga la atmósfera en límites.',
  'Detector multigás con calibración vigente y prueba de respuesta (bump test) antes de cada uso.',
  'Linterna intrínsecamente segura, radio o medio de comunicación, arnés de cuerpo entero y línea de vida para rescate sin entrada.',
])}

<h2>12. Plan de rescate y emergencias</h2>
${ul([
  'Preferir siempre el rescate sin entrada (desde la compuerta con línea de vida). El vigía no entra.',
  'Ante una emergencia: el vigía ordena la salida, llama a la brigada y a la línea de emergencias, y no permite la entrada de personas sin equipo y formación.',
  'El equipo de rescate queda en la compuerta durante todo el trabajo; se revisa antes de autorizar.',
  'Todo incidente o casi accidente se reporta en IncubApp (SST → Reportar incidente) y se investiga.',
])}

<h2>13. Contratistas</h2>
<p>Los contratistas cumplen este programa: presentan la formación y aptitud de su personal, trabajan con permiso de entrada de la empresa
y con un vigía designado, y su supervisor coordina con el supervisor de entrada de la planta.</p>

<h2>14. Registros e indicadores</h2>
<p>IncubApp guarda los permisos, las mediciones y las entradas y salidas, sin permitir borrarlos (trazabilidad).</p>
${indicators}

<h2>15. Revisión</h2>
<p>El programa se revisa al menos una vez al año y siempre que cambie un espacio, una tarea o un equipo, o después de un incidente.</p>

${signatures([
  ['ELABORÓ', 'Responsable del SG-SST'],
  ['REVISÓ', 'COPASST'],
  ['APROBÓ', 'Gerencia / Representante legal'],
])}`
  return doc({ code: PROGRAM_CODE, title: 'PROGRAMA DE GESTIÓN PARA TRABAJO EN ESPACIOS CONFINADOS', body, plantName })
}

/** Permiso de entrada diligenciado con lo registrado en IncubApp. */
export function permitHtml({ permit = {}, space = {}, readings = [], entries = [], plantName } = {}) {
  const check = CHECKLIST.map((i) => [
    escapeHtml(i.label),
    permit.checklist?.[i.key] ? '<span class="ok">Sí</span>' : '<span class="bad">No</span>',
  ])
  const reads = [...readings]
    .sort((a, b) => String(a.taken_at).localeCompare(String(b.taken_at)))
    .map((r) => [
      escapeHtml(dt(r.taken_at)),
      escapeHtml(String(r.o2_pct)),
      escapeHtml(String(r.lel_pct)),
      escapeHtml(r.co_ppm ?? '—'),
      escapeHtml(r.h2s_ppm ?? '—'),
      escapeHtml(r.hcho_ppm ?? '—'),
      esc(r.taken_by_name),
      readingOk(r)
        ? '<span class="ok">Aceptable</span>'
        : `<span class="bad">${escapeHtml(readingIssues(r).join(' · '))}</span>`,
    ])
  const ins = [...entries]
    .sort((a, b) => String(a.entered_at).localeCompare(String(b.entered_at)))
    .map((e) => [
      esc(e.person_name),
      escapeHtml(dt(e.entered_at)),
      e.exited_at ? escapeHtml(dt(e.exited_at)) : '<span class="bad">Adentro</span>',
    ])
  const body = `
<h2>Espacio y trabajo</h2>
${table(
  ['Dato', 'Registro'],
  [
    ['Espacio confinado', esc([space.code, space.name].filter(Boolean).join(' · '))],
    ['Trabajo', esc(permit.work_description)],
    ['Tipo', esc(workTypeLabel(permit.work_type))],
    ['Vigencia', `${escapeHtml(dt(permit.valid_from))} a ${escapeHtml(dt(permit.valid_until))}`],
    ['Estado', esc(permitStatusLabel(permit.status))],
    ['Supervisor de entrada', esc(permit.supervisor_name)],
    ['Vigía', esc(permit.attendant_name)],
    ['Entrantes autorizados', esc((permit.entrants || []).join(', '))],
    ['Ventilación', esc(permit.ventilation)],
    ['Comunicación', esc(permit.communication)],
    ['Plan de rescate', esc(permit.rescue_plan)],
  ].map(([a, b]) => [escapeHtml(a), b]),
)}
<h2>Lista de verificación</h2>
${table(['Condición', 'Confirmada'], check)}
<h2>Mediciones de atmósfera</h2>
<p>Límites: O₂ ${LIMITS.o2Min}–${LIMITS.o2Max} % · LIE &lt; ${LIMITS.lelMax} % · CO ≤ ${LIMITS.coMax} ppm · H₂S ≤ ${LIMITS.h2sMax} ppm · formaldehído ≤ ${LIMITS.hchoMax} ppm.</p>
${reads.length ? table(['Hora', 'O₂ %', 'LIE %', 'CO ppm', 'H₂S ppm', 'HCHO ppm', 'Midió', 'Resultado'], reads) : '<p>Sin mediciones registradas.</p>'}
<h2>Entradas y salidas</h2>
${ins.length ? table(['Persona', 'Entró', 'Salió'], ins) : '<p>Nadie entró con este permiso.</p>'}
<h2>Autorización y cierre</h2>
${table(
  ['Dato', 'Registro'],
  [
    ['Autorizado', permit.authorized_at ? escapeHtml(dt(permit.authorized_at)) : 'No autorizado'],
    ['Suspensión', esc(permit.suspended_reason || 'Ninguna')],
    ['Cerrado', permit.closed_at ? escapeHtml(dt(permit.closed_at)) : 'Abierto'],
    ['Observaciones de cierre', esc(permit.closing_notes)],
  ].map(([a, b]) => [escapeHtml(a), b]),
)}
${signatures([
  ['SUPERVISOR DE ENTRADA', permit.supervisor_name || ''],
  ['VIGÍA', permit.attendant_name || ''],
  ['ENTRANTES', (permit.entrants || []).join(', ')],
])}`
  return doc({ code: PERMIT_CODE, title: 'PERMISO DE ENTRADA A ESPACIO CONFINADO', body, plantName })
}
