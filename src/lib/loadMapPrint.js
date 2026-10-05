/**
 * Formato impreso «Mapa de cargue de incubadora» (carta horizontal).
 *
 * Es la hoja que el operario lleva a la máquina: los dos compartimentos con el
 * ventilador central, cada posición con su zona (color + texto, para que se lea
 * también en blanco y negro), el N° de CARRO grande, los lotes con bandejas,
 * huevos y fecha de postura, la marca TRATADO, el resumen por lote y por fecha,
 * el balance izquierda/derecha y la guía rápida «N° carro → ubicación» con
 * casilla para ir marcando, más las firmas (clasificó / aprobó / cargó).
 *
 * Recibe la fila de `load_maps` tal como viene de la base o el mapa armado en
 * memoria por buildLoadMap(): los dos pasan por normalizeLoadMapRecord().
 * Todo dato se escapa para HTML (lotes y nombres pueden traer cualquier texto) y
 * la hoja no pide nada a internet: sirve sin conexión.
 *
 * Uso desde una pantalla (en el manejador del clic, para que el navegador no
 * bloquee la ventana):
 *   if (!openLoadMapPrint(mapa, { plantName, people })) avisar('Permita ventanas emergentes…')
 */

import { letterheadHtml, SIG_FORMATS } from './corporateBrand'
import {
  CARTS_PER_MACHINE,
  MACHINE_SLOTS,
  ZONE_LABEL,
  normalizeCartColor,
  normalizeLoadMapRecord,
} from './loadMapEngine'

export { normalizeLoadMapRecord }

/** Formato SIG de la hoja (código por confirmar con la asesora del SIG). */
export const LOAD_MAP_FORMAT = SIG_FORMATS.FOINC03

export const LOAD_MAP_STATUS_LABEL = {
  draft: 'Borrador',
  pending_approval: 'Pendiente de aprobación',
  approved: 'Aprobado',
  ordered: 'Orden de cargue dada',
  completed: 'Cargue completado',
  rejected: 'Rechazado',
  cancelled: 'Anulado',
}

/** Estados en los que la hoja ya sirve para cargar la máquina. */
const READY_TO_LOAD = new Set(['approved', 'ordered', 'completed'])

/** Zonas en orden de calor (de menos a más), con su color y su explicación. */
const ZONES_PRINT = [
  { id: 'centro', color: '#15803d', tint: '#f0fdf4', hint: 'fechas más viejas · menor calor' },
  { id: 'paredes', color: '#1d4ed8', tint: '#eff6ff', hint: 'fechas intermedias · junto a la pared' },
  { id: 'serpentin', color: '#c2410c', tint: '#fff7ed', hint: 'fechas más nuevas · mayor calor · junto al ventilador' },
]

const TIME_ZONE = 'America/Bogota'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Escapa texto para contenido y atributos HTML. */
function esc(value) {
  return String(value ?? '').replace(
    /[&<>"'`]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]
  )
}

function fmtInt(n) {
  return (Number(n) || 0).toLocaleString('es-CO')
}

function fmtDateTime(value) {
  const d = value ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleString('es-CO', {
      timeZone: TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}

/** Fecha de postura «AAAA-MM-DD» sin pasar por zona horaria (un Date la correría un día). */
function postureDate(iso, long = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return iso ? String(iso) : 's/f'
  return long ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`
}

function personName(id, opts) {
  if (id == null || id === '') return ''
  const key = String(id)
  let name = null
  const people = opts.people
  if (people instanceof Map) name = people.get(key)
  else if (people && typeof people === 'object') name = people[key]
  if (!name && typeof opts.resolveName === 'function') {
    try {
      name = opts.resolveName(key)
    } catch {
      name = null
    }
  }
  if (name && typeof name === 'object') name = name.full_name || name.name || name.nombre || null
  if (name) return String(name)
  // Un uuid sin nombre no le dice nada a quien lee la hoja.
  return UUID_RE.test(key) ? '' : key
}

function zoneClass(zone) {
  return ZONES_PRINT.some((z) => z.id === zone) ? `z-${zone}` : 'z-centro'
}

function lotName(l) {
  return l.lot || '?'
}

/** Lote en la celda: el tratado lleva «*» (se lee también en blanco y negro). */
function lotCellName(l) {
  if (!l.isTreated) return lotName(l)
  return /^trat/i.test(l.lot || '') ? 'TRAT.*' : `${lotName(l)}*`
}

/** «Izq · Fondo · Pared» */
function slotPlace(pos) {
  return MACHINE_SLOTS.find((m) => m.pos === pos)?.short || ''
}

function treatedTag() {
  return '<span class="trat">TRATADO</span>'
}

function swatch(color) {
  return `<span class="sw" style="background:${esc(normalizeCartColor(color))}"></span>`
}

/* ─── Piezas de la hoja ──────────────────────────────────────── */

function slotCell(slot) {
  const zone = slot.zone
  const zoneTxt = (ZONE_LABEL[zone] || zone || '').toUpperCase()
  const head = `<div class="pos-cab"><span class="pos-n">Pos. ${esc(slot.machinePos)}</span><span class="zona">${esc(zoneTxt)}</span></div>`
  const e = slot.entry
  if (!e) {
    return `<div class="pos ${zoneClass(zone)} vacia">${head}<div class="vacia-txt">VACÍA<small>No va carro en esta posición</small></div></div>`
  }
  const lots = e.lots || []
  const rows = lots
    .map(
      (l) => `<tr${l.isTreated ? ' class="es-trat"' : ''}><td class="l">${esc(lotCellName(l))}</td><td>${esc(l.trays)}</td><td>${esc(fmtInt(l.eggs))}</td><td>${esc(postureDate(l.productionDate))}</td></tr>`
    )
    .join('')
  return `<div class="pos ${zoneClass(zone)}">
  ${head}
  <div class="carro">${swatch(e.color)}<span class="carro-l">CARRO</span><span class="carro-n">${esc(slot.cartNo || e.cartNumber || '?')}</span>${e.hasTreated ? treatedTag() : ''}</div>
  <table class="lotes"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup><thead><tr><th class="l">Lote</th><th>Band.</th><th>Huevos</th><th>Post.</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="pos-tot"><span>${lots.length > 1 ? `${lots.length} lotes` : '1 lote'}</span><span>${esc(fmtInt(e.trays))} b · ${esc(fmtInt(e.eggs))} h</span></div>
</div>`
}

function compartment(title, rowsByPos, colTitles, side, slotByPos) {
  const label = (txt) => `<div class="fila-tit"><span>${esc(txt)}</span></div>`
  const heads = colTitles.map((t) => `<div class="col-tit">${esc(t)}</div>`).join('')
  const rowHtml = (name, positions) => {
    const cells = positions.map((p) => slotCell(slotByPos.get(p))).join('')
    return side === 'left' ? `${label(name)}${cells}` : `${cells}${label(name)}`
  }
  return `<div class="comp comp-${side}">
  <div class="comp-tit">${esc(title)}</div>
  <div class="comp-grid">
    ${side === 'left' ? '<div></div>' : ''}${heads}${side === 'left' ? '' : '<div></div>'}
    ${rowHtml('Fondo', rowsByPos[0])}
    ${rowHtml('Frente', rowsByPos[1])}
  </div>
</div>`
}

function guideTable(map) {
  const rows = map.placementGuide
    .map((r) => {
      const lots = (r.lots || [])
        .map((l) => `${esc(lotCellName(l))} (${esc(l.trays)}b)`)
        .join(' + ')
      return `<tr>
  <td class="ck"><span class="casilla"></span></td>
  <td class="n">${swatch(r.color)}${esc(r.cartNo)}</td>
  <td class="va"><b>Pos. ${esc(r.machinePos)}</b> <span class="zona-txt ${zoneClass(r.zone)}">${esc(ZONE_LABEL[r.zone] || r.zone)}</span></td>
  <td>${esc(slotPlace(r.machinePos))}</td>
  <td>${lots}</td>
</tr>`
    })
    .join('')
  const empty = `<tr><td colspan="5" class="sin">Este mapa no tiene carros asignados.</td></tr>`
  return `<section class="guia">
  <h2>Guía rápida del operario (N° carro → ubicación)</h2>
  <table class="tabla guia-t">
    <thead><tr><th class="ck">✓</th><th>Carro</th><th>Va en</th><th>Lugar</th><th>Lotes (bandejas)</th></tr></thead>
    <tbody>${rows || empty}</tbody>
  </table>
  <p class="nota">Marque la casilla cuando el carro quede en su posición. * = lote tratado. No reubique carros sin autorización del coordinador.</p>
</section>`
}

function naturalLotOrder(a, b) {
  if (!!a.treated !== !!b.treated) return a.treated ? 1 : -1
  return String(a.lot).localeCompare(String(b.lot), 'es', { numeric: true })
}

function summaryTables(map) {
  const s = map.summary
  const lots = [...(s.lots || [])].sort(naturalLotOrder)
  const lotRows = lots
    .map(
      (l) => `<tr><td class="l">${esc(l.lot)}${l.treated ? ` ${treatedTag()}` : ''}</td><td>${esc(l.carts)}</td><td>${esc(fmtInt(l.trays))}</td><td>${esc(fmtInt(l.eggs))}</td><td class="l">${esc((l.dates || []).map((d) => postureDate(d)).join(', ') || 's/f')}</td></tr>`
    )
    .join('')
  const dateRows = (s.dates || [])
    .map(
      (d) => `<tr><td class="l">${esc(postureDate(d.date, true))}</td><td class="l">${esc((d.lots || []).join(', '))}</td><td>${esc(d.carts)}</td><td>${esc(fmtInt(d.trays))}</td><td>${esc(fmtInt(d.eggs))}</td></tr>`
    )
    .join('')
  const total = `<tr class="tot"><td class="l">Total</td><td>${esc(s.cartCount)}</td><td>${esc(fmtInt(s.totalTrays))}</td><td>${esc(fmtInt(s.totalEggs))}</td><td class="l">${s.treatedEggs ? `${esc(fmtInt(s.treatedEggs))} h tratado` : ''}</td></tr>`
  return `<section class="resumen">
  <h2>Resumen por lote</h2>
  <table class="tabla"><thead><tr><th class="l">Lote</th><th>Carros</th><th>Band.</th><th>Huevos</th><th class="l">Posturas</th></tr></thead>
  <tbody>${lotRows || '<tr><td colspan="5" class="sin">Sin lotes.</td></tr>'}${total}</tbody></table>
  <h2>Resumen por fecha de postura</h2>
  <table class="tabla"><thead><tr><th class="l">Postura</th><th class="l">Lotes</th><th>Carros</th><th>Band.</th><th>Huevos</th></tr></thead>
  <tbody>${dateRows || '<tr><td colspan="5" class="sin">Sin fechas.</td></tr>'}</tbody></table>
  <p class="nota">Un carro con varios lotes cuenta en cada lote y en cada fecha que lleva.</p>
</section>`
}

function balanceBlock(map) {
  const b = map.balance
  const zoneRows = ZONES_PRINT.map(({ id }) => {
    const z = b.perZone?.[id] || { left: 0, right: 0, total: 0 }
    const even = z.left === z.right
    return `<tr><td class="l"><span class="zona-txt ${zoneClass(id)}">${esc(ZONE_LABEL[id])}</span></td><td>${esc(z.left)}</td><td>${esc(z.right)}</td><td class="${even ? 'bien' : 'mal'}">${even ? 'Parejo' : 'DESPAREJO'}</td></tr>`
  }).join('')
  const warnings = b.warnings?.length
    ? `<p class="mal">⚠ ${esc(b.warnings.length)} aviso(s) de balance: vea la franja roja arriba de la máquina.</p>`
    : `<p class="ok">Sin advertencias: carga completa y simétrica.</p>`
  return `<section class="balance">
  <h2>Balance izquierda / derecha</h2>
  <table class="tabla"><thead><tr><th class="l">Zona</th><th>Izq.</th><th>Der.</th><th></th></tr></thead>
  <tbody>${zoneRows}<tr class="tot"><td class="l">Total</td><td>${esc(b.left)}</td><td>${esc(b.right)}</td><td>${esc(b.filled)}/${CARTS_PER_MACHINE}</td></tr></tbody></table>
  ${warnings}
</section>`
}

function warningsStrip(map) {
  const list = map.balance.warnings || []
  if (!list.length) return ''
  return `<section class="franja-avisos"><b>⚠ Avisos de balance (Petersime):</b><ul>${list.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>`
}

function signatureBox(title, role, name, when) {
  return `<div class="firma">
  <div class="f-tit">${esc(title)}</div><span>Nombre</span><b>${esc(name)}</b><span>Firma</span><b></b>
  <div class="f-rol">${esc(role)}</div><span>Fecha/hora</span><b class="ancha">${esc(when)}</b>
</div>`
}

/*
 * Red de seguridad para que la hoja quepa en UNA carta horizontal aunque traiga muchos
 * avisos o lotes de nombre largo: mide el contenido (en pantalla tiene el mismo ancho
 * útil que en papel, 263,4 mm) y, si pasa del alto útil (201,9 mm), lo reduce al imprimir.
 */
const FIT_SCRIPT = `(function () {
  function ajustar() {
    var h = document.querySelector('.hoja');
    if (!h || !h.firstElementChild) return;
    var alto = h.lastElementChild.getBoundingClientRect().bottom - h.firstElementChild.getBoundingClientRect().top;
    var util = 199 * 96 / 25.4;
    var f = alto > util ? Math.max(0.6, util / alto) : 1;
    document.documentElement.style.setProperty('--ajuste', String(f));
  }
  window.addEventListener('load', ajustar);
  window.addEventListener('beforeprint', ajustar);
})();`

/* ─── Documento ──────────────────────────────────────────────── */

const PRINT_CSS = `
@page { size: letter landscape; margin: 7mm 8mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: #e5e7eb; color: #111827; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 8pt; line-height: 1.25;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.barra { max-width: 279.4mm; margin: 10px auto 0; display: flex; gap: 10px; align-items: center; font-size: 10pt; color: #374151; }
.barra button { font: inherit; font-weight: 700; padding: 6px 14px; border: 1px solid #0b1428; background: #0b1428; color: #fff; border-radius: 6px; cursor: pointer; }
.hoja { width: 279.4mm; min-height: 215.9mm; margin: 10px auto 20px; padding: 7mm 8mm; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18);
  display: flex; flex-direction: column; gap: 1.5mm; }
h2 { font-size: 8.5pt; margin: 0 0 1mm; text-transform: uppercase; letter-spacing: .04em; color: #0b1428; }
.membrete header { margin-bottom: 0 !important; }
.membrete header table td { padding: 1px 5px !important; line-height: 1.15 !important; }
.membrete header table td div { margin: 0 !important; padding-top: 0 !important; }
.membrete header table td:nth-child(2) div { font-size: 7.5pt !important; }
.membrete header table td:nth-child(2) div:last-child { font-size: 9pt !important; }
.membrete header table td:last-child div { display: inline-block; margin-right: 2.5mm !important; font-size: 6.8pt !important; }
.membrete header img { height: 26px !important; }
.membrete header > div { margin-top: 0 !important; font-size: 7pt !important; }
.aviso-estado { border: 2px solid #b91c1c; background: #fef2f2; color: #7f1d1d; font-weight: 800; padding: 1.2mm 2.5mm; font-size: 9pt; }
.aviso-estado.listo { border-color: #15803d; background: #f0fdf4; color: #14532d; }
.datos { display: grid; grid-template-columns: 1.3fr 1.15fr 1.05fr 1.2fr 1.05fr 1.25fr 1.25fr 1.75fr; border: 1px solid #94a3b8; }
.dato { padding: .5mm 1.4mm; border-right: 1px solid #cbd5e1; min-width: 0; }
.dato:last-child { border-right: 0; }
.dato span { display: block; font-size: 6pt; text-transform: uppercase; letter-spacing: .05em; color: #475569; }
.dato b { display: block; font-size: 8pt; overflow-wrap: anywhere; }
.dato.maq b { font-size: 10.5pt; }
.dato .linea { display: block; border-bottom: 1px solid #111; height: 4mm; }
.regular { font-size: 7pt; color: #374151; border-left: 3px solid #94a3b8; padding-left: 2mm; }
.leyenda { display: flex; flex-wrap: wrap; gap: .5mm 3.5mm; font-size: 6.8pt; align-items: center; }
.leyenda .vista { color: #475569; margin-left: auto; }
.maquina { display: grid; grid-template-columns: 1fr 9mm 1fr; gap: 1.5mm; break-inside: avoid; }
.comp { border: 1.5px solid #0b1428; padding: 1mm; }
.comp-tit { font-weight: 800; text-transform: uppercase; font-size: 7.5pt; letter-spacing: .05em; text-align: center; margin-bottom: .5mm; }
.comp-grid { display: grid; gap: 1mm; }
.comp-left .comp-grid { grid-template-columns: 4mm repeat(3, minmax(0, 1fr)); }
.comp-right .comp-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) 4mm; }
.col-tit { text-align: center; font-size: 6pt; text-transform: uppercase; color: #475569; letter-spacing: .04em; line-height: 1; }
.fila-tit { display: flex; align-items: center; justify-content: center; }
.fila-tit span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 6.5pt; text-transform: uppercase; color: #475569; letter-spacing: .08em; }
.ventilador { border: 1.5px dashed #c2410c; display: flex; align-items: center; justify-content: center; background: repeating-linear-gradient(0deg, #fff7ed 0 3mm, #fff 3mm 6mm); }
.ventilador span { writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 800; font-size: 8pt; letter-spacing: .14em; color: #9a3412; }
.pos { --z: #15803d; --zt: #f0fdf4; border: 2px solid var(--z); background: var(--zt); padding: .7mm 1.2mm; display: flex; flex-direction: column; gap: .3mm; min-height: 27mm; min-width: 0; break-inside: avoid; }
.z-centro { --z: #15803d; --zt: #f0fdf4; }
.z-paredes { --z: #1d4ed8; --zt: #eff6ff; }
.z-serpentin { --z: #c2410c; --zt: #fff7ed; }
.pos.z-centro { border-style: double; border-width: 3.5px; }
.pos.z-serpentin { border-style: dashed; }
.pos-cab { display: flex; justify-content: space-between; align-items: center; gap: 1mm; }
.pos-n { font-weight: 800; font-size: 7.5pt; }
.zona { background: var(--z); color: #fff; font-weight: 800; font-size: 6.5pt; letter-spacing: .05em; padding: 0 1.2mm; border-radius: .8mm; }
.carro { display: flex; align-items: center; gap: 1.2mm; flex-wrap: wrap; }
.carro-l { font-weight: 700; font-size: 8pt; letter-spacing: .05em; }
.carro-n { font-weight: 900; font-size: 18pt; line-height: 1; }
.sw { display: inline-block; width: 3.2mm; height: 3.2mm; border: 1px solid #111; vertical-align: middle; margin-right: 1mm; flex: none; }
.trat { display: inline-block; border: 1.3px solid #111; background: #fde047; color: #111; font-weight: 900; font-size: 6.5pt; padding: 0 1mm; letter-spacing: .04em; }
table { border-collapse: collapse; }
.lotes { width: 100%; font-size: 6.8pt; table-layout: fixed; line-height: 1.15; }
.lotes col.c1 { width: 31%; } .lotes col.c2 { width: 17%; } .lotes col.c3 { width: 27%; } .lotes col.c4 { width: 25%; }
.lotes th { font-size: 5.5pt; text-transform: uppercase; color: #475569; font-weight: 700; text-align: right; border-bottom: 1px solid #94a3b8; white-space: nowrap; overflow: hidden; }
.lotes td { text-align: right; padding: 0; overflow-wrap: anywhere; }
.lotes .l { text-align: left; }
.lotes tr.es-trat td { font-weight: 800; }
.pos-tot { margin-top: auto; display: flex; justify-content: space-between; gap: 1mm; font-size: 6.8pt; font-weight: 700; border-top: 1px dotted #64748b; padding-top: .2mm; white-space: nowrap; }
.vacia-txt { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 900; font-size: 11pt; color: #6b7280; letter-spacing: .1em; }
.vacia-txt small { font-size: 6.5pt; font-weight: 600; letter-spacing: 0; }
.abajo { display: grid; grid-template-columns: 40fr 34fr 26fr; gap: 2.5mm; align-items: start; }
.tabla { width: 100%; font-size: 7pt; margin-bottom: 1mm; line-height: 1.15; }
.tabla th { background: #0b1428; color: #fff; font-size: 6pt; text-transform: uppercase; letter-spacing: .04em; padding: .4mm 1mm; text-align: right; }
.tabla td { border: 1px solid #cbd5e1; padding: .3mm 1mm; text-align: right; vertical-align: middle; overflow-wrap: anywhere; }
.tabla .l, .tabla th.l { text-align: left; }
.tabla tr.tot td { font-weight: 800; background: #f1f5f9; }
.tabla .sin { text-align: center; color: #6b7280; }
.guia-t td, .guia-t th { text-align: left; }
.guia-t td { font-size: 7pt; }
.guia-t td.va { white-space: nowrap; }
.guia-t .ck { width: 6mm; text-align: center; }
.guia-t .n { font-weight: 900; font-size: 10.5pt; white-space: nowrap; }
.casilla { display: inline-block; width: 3.4mm; height: 3.4mm; border: 1.3px solid #111; background: #fff; vertical-align: middle; }
.zona-txt { font-weight: 800; color: var(--z); text-transform: uppercase; font-size: 6.8pt; }
.bien { color: #14532d; font-weight: 700; }
.mal { color: #b91c1c; font-weight: 900; }
.franja-avisos { border: 2px solid #b91c1c; background: #fef2f2; color: #7f1d1d; padding: .6mm 2mm; font-size: 7.2pt; display: flex; gap: 2mm; align-items: baseline; }
.franja-avisos b { white-space: nowrap; }
.franja-avisos ul { margin: 0; padding-left: 4mm; font-weight: 700; }
p.mal, .ok { margin: 0; font-size: 7pt; }
.ok { color: #14532d; font-weight: 700; }
.nota { margin: 0; font-size: 6.5pt; color: #475569; }
.firmas { display: flex; flex-direction: column; gap: 1mm; margin-top: 1mm; }
.firma { border: 1px solid #64748b; padding: .4mm 1.4mm .9mm; display: grid; grid-template-columns: 15mm auto 1fr auto 1fr; grid-auto-rows: 4.6mm; align-items: end; column-gap: 1mm; font-size: 6.5pt; }
.f-tit { font-weight: 800; font-size: 7pt; text-transform: uppercase; }
.f-rol { color: #475569; font-size: 6pt; line-height: 1.05; }
.firma > span { color: #475569; }
.firma > b { border-bottom: 1px solid #111; min-height: 3.4mm; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.firma > b.ancha { grid-column: 3 / 6; }
.pie { display: flex; justify-content: space-between; gap: 4mm; font-size: 6.3pt; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: .8mm; }
@media print {
  body { background: #fff; }
  .barra { display: none !important; }
  .hoja { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; zoom: var(--ajuste, 1); }
}
`

/**
 * HTML completo (documento) del formato «Mapa de cargue» listo para imprimir.
 *
 * @param {object} map  fila de load_maps ({ id, status, machine_name, payload, … }) o mapa de buildLoadMap()
 * @param {{
 *   orgName?: string,
 *   plantName?: string,
 *   people?: Record<string,string>|Map<string,string>,  // uuid → nombre (clasificó / aprobó / cargó)
 *   resolveName?: (id: string) => string|null,
 *   printedAt?: Date|string,
 * }} [opts]
 * @returns {string}
 */
export function buildLoadMapPrintHtml(map, opts = {}) {
  const o = opts || {}
  const m = normalizeLoadMapRecord(map)
  const slotByPos = new Map(m.slots.map((s) => [s.machinePos, s]))
  const status = m.status || 'draft'
  const statusLabel = LOAD_MAP_STATUS_LABEL[status] || status
  const machine = m.machineName || 'Máquina sin asignar'
  const created = fmtDateTime(m.createdAt)
  const loaded = fmtDateTime(m.loadedAt)
  const printed = fmtDateTime(o.printedAt || new Date())
  const s = m.summary

  const who = (id, at, pending) => {
    if (!at && !id) return pending
    return [personName(id, o), fmtDateTime(at)].filter(Boolean).join(' · ') || 'Registrado en IncubApp'
  }
  const approved = who(m.approvedBy, m.approvedAt, 'Pendiente')
  const ordered = who(m.orderedBy, m.orderedAt, 'Pendiente')

  let banner = ''
  if (status === 'rejected' || status === 'cancelled') {
    banner = `<div class="aviso-estado">${esc(statusLabel.toUpperCase())} — NO USAR ESTA HOJA PARA CARGAR.${m.rejectedReason ? ` Motivo: ${esc(m.rejectedReason)}` : ''}</div>`
  } else if (!READY_TO_LOAD.has(status)) {
    banner = `<div class="aviso-estado">${esc(statusLabel.toUpperCase())} — Este mapa todavía no está aprobado: no cargue la máquina con esta hoja hasta que el líder lo apruebe y dé la orden.</div>`
  }

  const reg = m.regularizado && typeof m.regularizado === 'object' ? m.regularizado : null
  const regularizado = reg
    ? `<div class="regular"><b>Regularizado</b>${reg.fecha ? ` el ${esc(fmtDateTime(reg.fecha))}` : ''}${reg.por ? ` por ${esc(reg.por)}` : ''}${reg.motivo ? `: ${esc(reg.motivo)}` : ''}</div>`
    : ''

  const legend = ZONES_PRINT.map(
    (z) => `<span><span class="zona-txt z-${z.id}">■ ${esc(ZONE_LABEL[z.id])}</span> ${esc(z.hint)}</span>`
  ).join('')

  const title = `Mapa de cargue · ${machine}${created ? ` · ${created.slice(0, 10)}` : ''}`
  const format = LOAD_MAP_FORMAT || { code: 'Por asignar', name: 'MAPA DE CARGUE DE INCUBADORA' }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="barra"><button type="button" onclick="window.print()">Imprimir</button><span>Hoja carta horizontal · ${esc(format.code)} · Mapa ${esc(m.id || '')}</span></div>
<main class="hoja">
<div class="membrete">${letterheadHtml({
    fomatCode: format.code,
    title: format.name,
    plantName: o.plantName || undefined,
    orgName: o.orgName || undefined,
  })}</div>
${banner}
<section class="datos">
  <div class="dato maq"><span>Máquina</span><b>${esc(machine)}</b></div>
  <div class="dato"><span>Fecha de cargue</span>${loaded ? `<b>${esc(loaded)}</b>` : '<i class="linea"></i>'}</div>
  <div class="dato"><span>Estado</span><b>${esc(statusLabel)}</b></div>
  <div class="dato"><span>ID del mapa</span><b>${esc(m.id || '—')}</b></div>
  <div class="dato"><span>Generado</span><b>${esc(created || '—')}</b></div>
  <div class="dato"><span>Aprobó</span><b>${esc(approved)}</b></div>
  <div class="dato"><span>Orden de cargue</span><b>${esc(ordered)}</b></div>
  <div class="dato"><span>Carga</span><b>${esc(s.cartCount)} carros · ${esc(fmtInt(s.totalTrays))} band. · ${esc(fmtInt(s.totalEggs))} huevos</b></div>
</section>
${regularizado}
<div class="leyenda">${legend}<span>${treatedTag()} huevo tratado</span><span class="vista">Vista superior de la máquina</span></div>
${warningsStrip(m)}
<section class="maquina">
${compartment('Compartimento izquierdo', [[1, 2, 3], [4, 5, 6]], ['Pared', 'Centro', 'Ventilador'], 'left', slotByPos)}
<div class="ventilador"><span>VENTILADOR CENTRAL</span></div>
${compartment('Compartimento derecho', [[10, 11, 12], [7, 8, 9]], ['Ventilador', 'Centro', 'Pared'], 'right', slotByPos)}
</section>
<div class="abajo">
${guideTable(m)}
${summaryTables(m)}
<div>
${balanceBlock(m)}
<section class="firmas">
${signatureBox('Clasificó', 'operario de recepción', personName(m.createdBy, o), created)}
${signatureBox('Aprobó', 'líder', personName(m.approvedBy, o), fmtDateTime(m.approvedAt))}
${signatureBox('Cargó', 'operario', personName(m.loadedBy, o), loaded)}
</section>
</div>
</div>
<div class="pie"><span>${esc(o.orgName || 'Antioqueña de Incubación S.A.S.')} · IncubApp · ${esc(format.code)} · Mapa ${esc(m.id || '—')}</span><span>Solo fíjese en el NÚMERO del carro y la POSICIÓN.</span><span>Impreso ${esc(printed)}</span></div>
</main>
<script>${FIT_SCRIPT}</script>
</body>
</html>`
}

/**
 * Abre la hoja en una ventana nueva y lanza la impresión cuando carga.
 * Llámela dentro del manejador del clic (si no, el navegador bloquea la ventana).
 *
 * @returns {boolean} false si el navegador no dejó abrir la ventana (para que la pantalla avise).
 */
export function openLoadMapPrint(map, opts = {}) {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  const html = buildLoadMapPrintHtml(map, opts)
  let w = null
  try {
    // Sin «noopener»: con él, window.open devuelve null y no se puede escribir la hoja.
    w = window.open('', '_blank')
  } catch {
    w = null
  }
  if (!w || !w.document) return false
  try {
    w.document.open()
    w.document.write(html)
    w.document.close()
  } catch {
    try {
      w.close()
    } catch {
      /* nada */
    }
    return false
  }
  try {
    w.opener = null
  } catch {
    /* nada */
  }

  let launched = false
  const launch = () => {
    if (launched) return
    launched = true
    try {
      w.focus()
      w.print()
    } catch {
      /* la hoja queda abierta: se puede imprimir con el botón o Ctrl+P */
    }
  }
  if (w.document.readyState === 'complete') {
    setTimeout(launch, 300)
  } else {
    try {
      w.addEventListener('load', () => setTimeout(launch, 150), { once: true })
    } catch {
      /* nada */
    }
    // Por si el evento load no llega (logo que no carga, navegador antiguo).
    setTimeout(launch, 2500)
  }
  return true
}
