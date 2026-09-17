/**
 * =============================================================================
 * ARCHIVO: src/lib/controlDiarioFormat.js
 * PROPÓSITO: Emite los registros FOINC01 (control diario de incubadoras) y
 *   FONAC01 (nacedoras) del SIG, ya diligenciados con las rondas de turno.
 * CÓMO FUNCIONA: un documento por cargue — cubre una sola máquina desde el día
 *   del cargue hasta la transferencia (día 18) o hasta el día antes del
 *   siguiente cargue. Lee las rondas de ese rango, arma una hoja del formato
 *   por día y descarga un .doc con el encabezado del SIG (logo, código,
 *   versión, fecha), control de los cambios y firmas.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { supabase } from './supabase'
import { escapeHtml } from './corporateBrand'
import { SIG_LOGO_DATA_URI } from './sigLogo'

/**
 * Vigencia del enlace a la foto de cada toma: un año, el mismo tiempo de
 * conservación que exige la Res. ICA 3650/2014 Art. 6.2.9 para el registro.
 * Quien tenga el documento abre la evidencia sin necesidad de cuenta.
 */
export const VIGENCIA_ENLACE_FOTO = 365 * 24 * 3600

/** Día 0 = día del cargue; la transferencia a nacedora va el día 18. */
export const DIAS_INCUBACION = 18
/** Nacimiento el día 21, igual que el programa BROILER. */
export const DIAS_A_NACIMIENTO = 21

export const FECHA_FORMATO = '15-09-2026'
export const VERSION_FORMATO = '01'

const CODIGO = { setter: 'FOINC01', hatcher: 'FONAC01' }
const TITULO = {
  setter: 'CONTROL DIARIO DE INCUBADORAS',
  hatcher: 'CONTROL DIARIO DE NACEDORAS',
}
const EQUIPO = { setter: 'Incubadora', hatcher: 'Nacedora' }
const ROTULO = { setter: 'INCUBADORA N.º', hatcher: 'NACEDORA N.º' }

const ESTADO = {
  normal: 'No',
  warning: 'Sí — alerta',
  fault: 'Sí — falla',
  off: 'Apagada',
}

const FILAS_MIN = 24 // una por hora de la jornada

/* ── fechas ─────────────────────────────────────────────────────────────── */

const iso = (d) => d.toLocaleDateString('sv-SE')
const desdeIso = (s) => new Date(`${s}T12:00:00`)
const sumarDias = (s, n) => {
  const d = desdeIso(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
const diffDias = (a, b) => Math.round((desdeIso(a) - desdeIso(b)) / 86_400_000)

/** Fecha local de la toma: `taken_at` manda, no la fecha con que se rotula el turno. */
export const fechaLocalDeToma = (check) => new Date(check.taken_at).toLocaleDateString('sv-SE')

const fmtFecha = (s) => {
  const [a, m, d] = String(s).split('-')
  return `${d}/${m}/${a}`
}
const fmtHora = (t) =>
  new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Nombre y primer apellido: es lo que cabe en la columna del formato. */
const nombreCorto = (completo) => {
  const p = String(completo || '').trim().split(/\s+/).filter(Boolean)
  return p.length > 2 ? p.slice(0, 2).join(' ') : p.join(' ')
}

const num = (v, dec = 1) => (v == null || v === '' ? '' : Number(v).toFixed(dec))
const numeroDe = (machine) => {
  const m = String(machine.code || machine.name || '').match(/(\d+)\s*$/)
  return m ? m[1] : machine.code || ''
}

/* ── ciclos ─────────────────────────────────────────────────────────────── */

/**
 * Export «construirCiclos»: arma un ciclo por cargue a partir de las filas de
 * `setter_loads`. Hay varias filas por cargue —una por lote—, así que se agrupan
 * por máquina y fecha. El ciclo termina el día 18 o el día antes del siguiente
 * cargue de esa misma máquina, lo que ocurra primero.
 *
 * @param {Array<{machine_id:string, lote:string, loaded_at:string}>} filas
 * @param {string} [hoy] fecha 'YYYY-MM-DD' contra la que se decide si sigue abierto
 */
export function construirCiclos(filas, hoy = iso(new Date())) {
  const porMaquina = new Map()
  for (const r of filas ?? []) {
    const fecha = new Date(r.loaded_at).toLocaleDateString('sv-SE')
    if (!porMaquina.has(r.machine_id)) porMaquina.set(r.machine_id, new Map())
    const cargues = porMaquina.get(r.machine_id)
    if (!cargues.has(fecha)) cargues.set(fecha, new Set())
    if (r.lote) cargues.get(fecha).add(r.lote)
  }

  const ciclos = []
  for (const [machineId, cargues] of porMaquina) {
    const fechas = [...cargues.keys()].sort()
    fechas.forEach((cargue, i) => {
      let fin = sumarDias(cargue, DIAS_INCUBACION)
      if (i + 1 < fechas.length) {
        const previo = sumarDias(fechas[i + 1], -1)
        if (previo < fin) fin = previo
      }
      ciclos.push({
        machineId,
        cargue,
        fin,
        lotes: [...cargues.get(cargue)].sort().join(', '),
        nacimiento: sumarDias(cargue, DIAS_A_NACIMIENTO),
        abierto: fin >= hoy,
      })
    })
  }
  ciclos.sort((a, b) => b.cargue.localeCompare(a.cargue))
  return ciclos
}

/**
 * Export «listarCiclos»: los cargues de las máquinas indicadas, ya en ciclos.
 * @returns {Promise<{error:?string, ciclos:Array}>}
 */
export async function listarCiclos({ machineIds, desde } = {}) {
  let q = supabase
    .from('setter_loads')
    .select('machine_id, lote, loaded_at')
    .order('loaded_at', { ascending: true })
  if (machineIds?.length) q = q.in('machine_id', machineIds)
  if (desde) q = q.gte('loaded_at', desde)
  const { data, error } = await q
  if (error) return { error: error.message, ciclos: [] }
  return { error: null, ciclos: construirCiclos(data) }
}

/* ── tabla del formato ──────────────────────────────────────────────────── */

const CSS = `
  @page { size: Letter; margin: 1.5cm 1.5cm 1.5cm 2cm; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; }
  table { border-collapse: collapse; }
  table.marco, table.datos, table.fmt, table.cambios, table.firmas { width: 100%; }
  table.marco td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
  table.marco .titulo { font-size: 13pt; font-weight: 700; text-align: center; }
  table.marco .etq { font-size: 10pt; font-weight: 700; }
  table.marco .val { font-size: 10pt; text-align: center; }
  .instruccion { font-size: 9.5pt; font-style: italic; text-align: justify; margin: 10px 0; }
  table.datos td { border: 1px solid #000; padding: 3px 5px; font-size: 9.5pt; height: 0.6cm; }
  table.datos td.e { background: #D9D9D9; font-weight: 700; width: 24%; }
  h3 { font-size: 11pt; margin: 14px 0 4px; }
  table.fmt { table-layout: fixed; }
  table.fmt th, table.fmt td {
    border: 1px solid #000; padding: 0 2px; font-size: 7.5pt;
    text-align: center; vertical-align: middle; word-wrap: break-word; line-height: 1;
  }
  table.fmt th { background: #D9D9D9; font-weight: 700; font-size: 8pt; height: 0.55cm; }
  table.fmt td { height: 0.42cm; }
  table.fmt tr.par td { background: #F2F2F2; }
  .nota { font-size: 8.5pt; font-style: italic; margin: 4px 0 0; }
  a.ev { color: #0B1428; text-decoration: underline; }
  .hoja { page-break-before: always; }
  table.cambios th, table.cambios td, table.firmas th, table.firmas td {
    border: 1px solid #000; padding: 3px 5px; font-size: 10pt;
  }
  table.cambios th, table.firmas th { background: #D9D9D9; }
  table.firmas td { text-align: center; }
  .pie { font-size: 8pt; color: #595959; text-align: center; margin-top: 10px; }
`

const CABECERA = {
  setter: `
    <tr>
      <th rowspan="2">Fecha</th><th rowspan="2">Hora</th><th rowspan="2">Días de incubación</th>
      <th colspan="2">Temperatura</th><th rowspan="2">Humedad relativa</th><th rowspan="2">Co 2</th>
      <th colspan="2">Volteo</th><th rowspan="2">Alarma</th><th rowspan="2">Responsable</th>
    </tr>
    <tr><th>ovoscan</th><th>Aire</th><th>Numero</th><th>Posición</th></tr>`,
  hatcher: `
    <tr>
      <th>Fecha</th><th>Hora</th><th>Día de Incubación</th><th>Temperatura</th>
      <th>Humedad relativa</th><th>CO2</th><th>Responsable</th>
    </tr>`,
}

// anchos del formato en papel, en porcentaje del ancho útil
const ANCHOS = {
  setter: [8.8, 8.1, 10.9, 8.9, 7.6, 11.4, 6.3, 8.9, 8.9, 8.6, 11.6],
  hatcher: [12.6, 11.3, 18.4, 14.1, 18.3, 9.9, 15.4],
}

/** La hora es el enlace a la foto de esa toma: es lo que la identifica. */
function celdaHora(c, fotos) {
  const hora = fmtHora(c.taken_at)
  const url = c.photo_path ? fotos[c.photo_path] : null
  if (!url) return `<td>${hora}</td>`
  return `<td><a class="ev" href="${escapeHtml(url)}" title="Ver la foto de la pantalla en esta toma">${hora}</a></td>`
}

function filaFormato(tipo, c, dia, persona, par, fotos) {
  const clase = par ? ' class="par"' : ''
  if (tipo === 'setter') {
    return `<tr${clase}>
      <td>${fmtFecha(fechaLocalDeToma(c))}</td>${celdaHora(c, fotos)}<td>${dia ?? ''}</td>
      <td>${num(c.temp_ovoscan)}</td><td>${num(c.temp_air)}</td><td>${num(c.humidity)}</td>
      <td>${num(c.co2, 2)}</td><td>${c.turn_count ?? ''}</td>
      <td>${escapeHtml(c.turn_position || '')}</td>
      <td>${escapeHtml(ESTADO[c.condition] ?? c.condition ?? '')}</td>
      <td>${escapeHtml(persona)}</td>
    </tr>`
  }
  return `<tr${clase}>
    <td>${fmtFecha(fechaLocalDeToma(c))}</td>${celdaHora(c, fotos)}<td>${dia ?? ''}</td>
    <td>${num(c.temp_air)}</td><td>${num(c.humidity)}</td><td>${num(c.co2, 2)}</td>
    <td>${escapeHtml(persona)}</td>
  </tr>`
}

function hojaDelDia(tipo, fecha, tomas, dia, people, primera, fotos = {}) {
  const anchos = ANCHOS[tipo]
  const encendido = tomas.some((c) => c.condition !== 'off')
  const cuerpo = tomas
    .map((c, i) =>
      filaFormato(tipo, c, encendido ? dia : null, nombreCorto(people[c.taken_by]?.name || ''), i % 2 === 1, fotos)
    )
    .join('')
  const vacias = Math.max(0, FILAS_MIN - tomas.length)
  const relleno = `<tr>${anchos.map(() => '<td>&nbsp;</td>').join('')}</tr>`.repeat(vacias)

  const apagadas = tomas.filter((c) => c.condition === 'off')
  const alarmas = tomas.filter((c) => c.condition !== 'normal' && c.condition !== 'off')
  const avisos = []
  if (apagadas.length && apagadas.length === tomas.length) {
    avisos.push(`Equipo apagado durante toda la jornada (${tomas.length} tomas).`)
  } else if (apagadas.length) {
    avisos.push(`Equipo apagado en ${apagadas.length} de ${tomas.length} tomas.`)
  }
  for (const c of alarmas) {
    avisos.push(`Alarma a las ${fmtHora(c.taken_at)}: ${escapeHtml(c.notes || 'sin detalle')}.`)
  }

  return `<div${primera ? '' : ' class="hoja"'}>
    <h3>DÍA ${fmtFecha(fecha)}</h3>
    <table class="fmt">
      <colgroup>${anchos.map((w) => `<col style="width:${w}%" />`).join('')}</colgroup>
      <thead>${CABECERA[tipo]}</thead>
      <tbody>${cuerpo}${relleno}</tbody>
    </table>
    ${avisos.length ? `<p class="nota">${avisos.join(' ')}</p>` : ''}
  </div>`
}

/* ── armazón del documento SIG ──────────────────────────────────────────── */

function marcoSig(tipo) {
  const codigo = CODIGO[tipo]
  return `<table class="marco">
    <tr>
      <td rowspan="3" style="width:3.2cm;text-align:center">
        <img src="${SIG_LOGO_DATA_URI}" style="width:2.9cm" alt="Incubant" />
      </td>
      <td rowspan="3" class="titulo">${TITULO[tipo]}</td>
      <td class="etq" style="width:2.4cm">Código:</td><td class="val" style="width:3cm">${codigo}</td>
    </tr>
    <tr><td class="etq">Versión:</td><td class="val">${VERSION_FORMATO}</td></tr>
    <tr><td class="etq">Fecha:</td><td class="val">${FECHA_FORMATO}</td></tr>
  </table>`
}

const FIRMAS = [
  ['REALIZÓ', 'Elkin Cavadia', 'Líder de Planta'],
  ['REVISÓ', 'Catalina Ospina García', 'Asesora de SIG'],
  ['APROBÓ', 'Miguel Castrillón', 'Gerente General'],
]

function cierreSig(tipo) {
  const codigo = CODIGO[tipo]
  const hoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `
  <p class="nota">Emitido el ${hoy} desde los registros de ronda de IncubApp. La fecha y la hora
    de cada línea son las de la toma; el responsable es quien la registró en la aplicación.</p>
  <h3>Control de los cambios</h3>
  <table class="cambios">
    <tr><th style="width:2.6cm">Fecha</th><th>Cambio realizado</th><th style="width:1.8cm">Versión</th></tr>
    <tr><td>${FECHA_FORMATO}</td>
        <td>Creación del documento. Se emite con las rondas registradas en IncubApp.</td>
        <td>${VERSION_FORMATO}</td></tr>
  </table>
  <table class="firmas" style="margin-top:10px">
    <tr>${FIRMAS.map(([e]) => `<th>${e}</th>`).join('')}</tr>
    <tr>${FIRMAS.map(([, n]) => `<td>${n}</td>`).join('')}</tr>
    <tr>${FIRMAS.map(([, , c]) => `<td>${c}</td>`).join('')}</tr>
  </table>
  <p class="pie">ANTIOQUEÑA DE INCUBACIÓN S.A.S. · NIT 900.762.687 · Hispania, Antioquia
    &nbsp;|&nbsp; ${codigo} v${VERSION_FORMATO}
    &nbsp;|&nbsp; Documento controlado del SIG — la copia impresa es no controlada</p>`
}

function documento(tipo, titulo, cuerpo) {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(titulo)}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>${CSS}</style>
</head>
<body>${marcoSig(tipo)}${cuerpo}${cierreSig(tipo)}</body>
</html>`
}

function descargar(html, nombre) {
  const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/* ── rondas del rango ───────────────────────────────────────────────────── */

async function rondasDe(machineId, desde, hasta) {
  const { data, error } = await supabase
    .from('machine_checks')
    .select(
      'taken_at, taken_by, condition, notes, photo_path, ' +
        'temp_ovoscan, temp_air, humidity, co2, turn_count, turn_position'
    )
    .eq('machine_id', machineId)
    .gte('taken_at', `${desde}T00:00:00-05:00`)
    .lte('taken_at', `${hasta}T23:59:59-05:00`)
    .order('taken_at', { ascending: true })
  if (error) return { error: error.message, tomas: [] }
  return { error: null, tomas: data ?? [] }
}

/**
 * Export «firmarFotos»: enlaces a las fotos de esas tomas, válidos un año.
 * El bucket es privado, así que el enlace firmado es la única forma de que el
 * documento abra la evidencia sin exigir cuenta. Si alguna falla, esa fila
 * simplemente queda sin enlace.
 * @returns {Promise<Record<string,string>>} photo_path → url
 */
export async function firmarFotos(tomas) {
  const rutas = [...new Set(tomas.map((c) => c.photo_path).filter(Boolean))]
  const urls = {}
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100)
    const { data, error } = await supabase.storage
      .from('machine-checks')
      .createSignedUrls(lote, VIGENCIA_ENLACE_FOTO)
    if (error) continue
    for (const f of data ?? []) {
      if (f?.signedUrl && !f.error) urls[f.path] = f.signedUrl
    }
  }
  return urls
}

function agruparPorDia(tomas) {
  const mapa = new Map()
  for (const c of tomas) {
    const f = fechaLocalDeToma(c)
    if (!mapa.has(f)) mapa.set(f, [])
    mapa.get(f).push(c)
  }
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function bloqueDatos(pares) {
  return `<table class="datos">${pares
    .map(
      ([e1, v1, e2, v2]) =>
        `<tr><td class="e">${escapeHtml(e1)}</td><td>${escapeHtml(v1)}</td>` +
        `<td class="e">${escapeHtml(e2)}</td><td>${escapeHtml(v2)}</td></tr>`
    )
    .join('')}</table>`
}

function bloqueResumen(tomas, extra = []) {
  const filas = [
    ['Días con registro de ronda', String(new Set(tomas.map(fechaLocalDeToma)).size)],
    ['Tomas registradas', String(tomas.length)],
    ['Tomas con foto (enlace en la hora)', String(tomas.filter((c) => c.photo_path).length)],
    ['Tomas con el equipo apagado', String(tomas.filter((c) => c.condition === 'off').length)],
    [
      'Tomas con alarma reportada',
      String(tomas.filter((c) => c.condition !== 'normal' && c.condition !== 'off').length),
    ],
    ...extra,
  ]
  return `<table class="datos" style="margin-top:8px">${filas
    .map(([a, b]) => `<tr><td class="e">${escapeHtml(a)}</td><td colspan="3">${escapeHtml(b)}</td></tr>`)
    .join('')}</table>`
}

const INSTRUCCION_INC =
  'Registro diario de un cargue: cubre una sola incubadora desde el día del cargue hasta la ' +
  'transferencia a nacedora, con una línea por cada toma de ronda del turno. El día de ' +
  'incubación son días calendario desde la fecha del cargue, con el día del cargue como día 0 ' +
  '— la misma aritmética del programa BROILER (cargue + 21 = nacimiento). Se diligencia ' +
  'automáticamente con las rondas cargadas en IncubApp; la evidencia de cada toma es la foto ' +
  'de la pantalla del equipo: la hora de cada línea es un enlace a esa foto, así que la ' +
  'evidencia de la lectura se abre con un clic desde este mismo formato. Conservar mínimo ' +
  'un (1) año en la instalación — Res. ICA 3650/2014 Art. 6.2.9.'

const INSTRUCCION_NAC =
  'Registro diario del equipo, con una línea por cada toma de ronda del turno. Se diligencia ' +
  'automáticamente con las rondas cargadas en IncubApp; la evidencia de cada toma es la foto ' +
  'de la pantalla del equipo. Mientras la transferencia de incubadora a nacedora no se registre ' +
  'en la aplicación, el documento no se puede separar por nacimiento ni calcular el día de ' +
  'incubación. La hora de cada línea es un enlace a la foto de esa toma. Conservar mínimo ' +
  'un (1) año en la instalación — Res. ICA 3650/2014 Art. 6.2.9.'

/* ── armado de cada registro ────────────────────────────────────────────── */

/**
 * Registro FOINC01 de un cargue, ya armado.
 * @returns {Promise<{error:?string, nombre?:string, html?:string, dias?:number, tomas?:number}>}
 */
async function armarRegistroCargue({ machine, ciclo, people = {}, sala = '' }) {
  const { error, tomas } = await rondasDe(machine.id, ciclo.cargue, ciclo.fin)
  if (error) return { error }
  if (!tomas.length) return { error: 'Este cargue todavía no tiene rondas registradas' }

  const fotos = await firmarFotos(tomas)
  const numero = numeroDe(machine)
  const dias = agruparPorDia(tomas)
  const cubiertos = diffDias(ciclo.fin, ciclo.cargue) + 1
  const extra = [['Días del ciclo cubiertos', `${cubiertos} de ${DIAS_INCUBACION + 1}`]]
  if (cubiertos < DIAS_INCUBACION + 1) {
    extra.push([
      ciclo.abierto ? 'Ciclo en curso' : 'Ciclo cortado',
      ciclo.abierto
        ? 'El registro se completa a medida que avanzan las rondas.'
        : 'La máquina volvió a cargarse antes del día 18.',
    ])
  }

  const cuerpo =
    `<p class="instruccion">${INSTRUCCION_INC}</p>` +
    bloqueDatos([
      ['Sede', 'PLANTA INCUBANT', 'Equipo', `${EQUIPO.setter} ${Number(numero)} (${machine.code})`],
      ['Sala', sala || '—', ROTULO.setter, numero],
      ['Fecha de cargue', fmtFecha(ciclo.cargue), 'Nacimiento programado', fmtFecha(ciclo.nacimiento)],
      [
        'Lote(s) cargado(s)',
        ciclo.lotes || '—',
        'Periodo del registro',
        `${fmtFecha(ciclo.cargue)} a ${fmtFecha(ciclo.fin)}`,
      ],
    ]) +
    bloqueResumen(tomas, extra) +
    dias
      .map(([fecha, delDia], i) =>
        hojaDelDia('setter', fecha, delDia, diffDias(fecha, ciclo.cargue), people, i === 0, fotos)
      )
      .join('')

  const nombre = `${CODIGO.setter} ${machine.code} cargue ${ciclo.cargue}`
  return {
    error: null,
    nombre,
    html: documento('setter', nombre, cuerpo),
    dias: dias.length,
    tomas: tomas.length,
  }
}

/** Registro FONAC01 de una nacedora en un rango, ya armado. */
async function armarRegistroNacedora({ machine, desde, hasta, people = {}, sala = '' }) {
  const { error, tomas } = await rondasDe(machine.id, desde, hasta)
  if (error) return { error }
  if (!tomas.length) return { error: 'No hay rondas registradas en ese rango' }

  const fotos = await firmarFotos(tomas)
  const numero = numeroDe(machine)
  const dias = agruparPorDia(tomas)
  const cuerpo =
    `<p class="instruccion">${INSTRUCCION_NAC}</p>` +
    bloqueDatos([
      ['Sede', 'PLANTA INCUBANT', 'Equipo', `${EQUIPO.hatcher} ${Number(numero)} (${machine.code})`],
      ['Sala', sala || '—', ROTULO.hatcher, numero],
      ['Periodo del registro', `${fmtFecha(desde)} a ${fmtFecha(hasta)}`, 'Separación por nacimiento', 'Pendiente — faltan las transferencias'],
    ]) +
    bloqueResumen(tomas) +
    dias.map(([fecha, delDia], i) => hojaDelDia('hatcher', fecha, delDia, null, people, i === 0, fotos)).join('')

  const nombre = `${CODIGO.hatcher} ${machine.code} ${desde} a ${hasta}`
  return {
    error: null,
    nombre,
    html: documento('hatcher', `${CODIGO.hatcher} ${machine.code}`, cuerpo),
    dias: dias.length,
    tomas: tomas.length,
  }
}

/* ── exportaciones públicas ─────────────────────────────────────────────── */

/**
 * Export «exportRegistroCargue»: descarga el registro FOINC01 de un cargue.
 * @param {object} d
 * @param {{id:string, code:string, name:string, type:string}} d.machine
 * @param {{cargue:string, fin:string, lotes:string, nacimiento:string}} d.ciclo
 * @param {Record<string,{name:string}>} d.people
 * @param {string} [d.sala]
 */
export async function exportRegistroCargue(d) {
  const r = await armarRegistroCargue(d)
  if (r.error) return r
  descargar(r.html, r.nombre)
  return { error: null, dias: r.dias, tomas: r.tomas }
}

/** Export «exportRegistroNacedora»: descarga el registro FONAC01 de una nacedora. */
export async function exportRegistroNacedora(d) {
  const r = await armarRegistroNacedora(d)
  if (r.error) return r
  descargar(r.html, r.nombre)
  return { error: null, dias: r.dias, tomas: r.tomas }
}

/**
 * Export «exportTodoElPeriodo»: todos los registros en un ZIP, con la misma
 * estructura de carpetas del entregable. Es lo que hay que correr cuando se
 * quiere el set completo con los enlaces a las fotos ya firmados.
 *
 * @param {object} d
 * @param {object[]} d.ciclos de listarCiclos
 * @param {Record<string,object>} d.porId máquina por id
 * @param {(m:object)=>string} d.salaDe
 * @param {Record<string,{name:string}>} d.people
 * @param {object[]} d.hatchers nacedoras a incluir
 * @param {string} d.desde 'YYYY-MM-DD' para el rango de las nacedoras
 * @param {string} d.hasta
 * @param {(hecho:number, total:number, que:string)=>void} [d.onProgress]
 */
export async function exportTodoElPeriodo({
  ciclos = [],
  porId = {},
  salaDe = () => '',
  people = {},
  hatchers = [],
  desde,
  hasta,
  onProgress = () => {},
}) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const total = ciclos.length + hatchers.length
  let hecho = 0
  let fallos = 0

  for (const ciclo of ciclos) {
    const machine = porId[ciclo.machineId]
    hecho += 1
    if (!machine) continue
    onProgress(hecho, total, `${machine.code} · cargue ${ciclo.cargue}`)
    const r = await armarRegistroCargue({ machine, ciclo, people, sala: salaDe(machine) })
    if (r.error) {
      fallos += 1
      continue
    }
    zip.file(`${CODIGO.setter} INCUBADORAS/${machine.code}/${r.nombre}.doc`, '﻿' + r.html)
  }

  for (const machine of hatchers) {
    hecho += 1
    onProgress(hecho, total, machine.code)
    const r = await armarRegistroNacedora({ machine, desde, hasta, people, sala: salaDe(machine) })
    if (r.error) {
      fallos += 1
      continue
    }
    zip.file(`${CODIGO.hatcher} NACEDORAS/${r.nombre}.doc`, '﻿' + r.html)
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `SIG CONTROL DIARIO ${desde} a ${hasta}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return { error: null, documentos: total - fallos, fallos }
}
