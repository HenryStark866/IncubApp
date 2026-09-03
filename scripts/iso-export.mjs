/**
 * Paquete de evidencias ISO 9001 — Antioqueña de Incubación S.A.S.
 *
 * Arma en el escritorio una carpeta ISO90001 con:
 *   1. Mapas de cargue/        un SVG por mapa, numerados en orden cronológico
 *   2. Registros de máquinas/  Excel con todas las rondas y sus evidencias
 *   3. Evidencias fotográficas/ las fotos del bucket privado machine-checks
 *
 * Es re-ejecutable: no vuelve a bajar una foto que ya esté en disco con el
 * mismo peso, así que una segunda corrida solo trae lo nuevo.
 *
 *   node scripts/iso-export.mjs            todo
 *   node scripts/iso-export.mjs mapas      solo los mapas
 *   node scripts/iso-export.mjs excel      solo el Excel
 *   node scripts/iso-export.mjs fotos      solo las fotos
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import * as XLSX from 'xlsx'

const RAIZ = join(homedir(), 'OneDrive', 'Escritorio', 'ISO90001')
const DIR_MAPAS = join(RAIZ, '1. Mapas de cargue')
const DIR_EXCEL = join(RAIZ, '2. Registros de máquinas')
const DIR_FOTOS = join(RAIZ, '3. Evidencias fotográficas')

// ─────────────────────────────────────────── credenciales
const ENVS = ['.env.planta3d', '.env.migrate', '.env.local', '.env']
const env = {}
for (const ruta of ENVS) {
  if (!existsSync(ruta)) continue
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(linea)
    if (!m) continue
    const v = m[2].trim().replace(/^["']|["']$/g, '')
    if (v !== '' && env[m[1]] === undefined) env[m[1]] = v
  }
}
const URL_SB = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SB || !LLAVE) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (revisa .env.planta3d).')
  process.exit(1)
}

const cabeceras = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` }

/** Trae una tabla completa paginando de a 1000 (PostgREST no da más por página). */
async function traer(tabla, query = '') {
  const salida = []
  const PASO = 1000
  for (let desde = 0; ; desde += PASO) {
    const url = `${URL_SB}/rest/v1/${tabla}?${query}`
    const r = await fetch(url, {
      headers: { ...cabeceras, Range: `${desde}-${desde + PASO - 1}`, Prefer: 'count=exact' },
    })
    if (!r.ok) throw new Error(`${tabla} ${r.status} ${await r.text()}`)
    const lote = await r.json()
    salida.push(...lote)
    if (lote.length < PASO) break
  }
  return salida
}

// ─────────────────────────────────────────── utilidades
const dirDe = (p) => { mkdirSync(p, { recursive: true }) ; return p }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
/** Windows no admite \ / : * ? " < > | en nombres de archivo. */
const limpio = (s) => String(s ?? '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
const dosDig = (n) => String(n).padStart(2, '0')

/** Fecha/hora en la zona de la planta (Bogotá), sin depender del reloj del PC. */
const BOGOTA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
function enBogota(iso) {
  if (!iso) return { fecha: '', hora: '', sello: '' }
  const p = Object.fromEntries(BOGOTA.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  const fecha = `${p.year}-${p.month}-${p.day}`
  const hora = `${p.hour}:${p.minute}:${p.second}`
  return { fecha, hora, sello: `${fecha} ${hora}` }
}

const ZONA_COLOR = { centro: '#f5900f', paredes: '#35d6e8', serpentin: '#7c5cff' }
const ZONA_NOMBRE = { centro: 'Centro', paredes: 'Paredes', serpentin: 'Serpentín' }
const ZONA_PISTA = {
  centro: 'fechas más viejas · menor calor',
  paredes: 'fechas intermedias · calor medio',
  serpentin: 'fechas más nuevas · mayor calor',
}
const ESTADO = { draft: 'Borrador', pending_approval: 'Pendiente de aprobación', completed: 'Ejecutado', ordered: 'Ordenado', approved: 'Aprobado', rejected: 'Rechazado' }
const CONDICION = { normal: 'Normal', warning: 'Alerta', fault: 'Falla', off: 'Apagada' }

// Vista superior Petersime: fila de fondo arriba, fila de frente abajo,
// ventilador central entre los dos compartimentos.
const REJILLA = [
  { fila: 'Fondo', izq: [1, 2, 3], der: [10, 11, 12] },
  { fila: 'Frente', izq: [4, 5, 6], der: [7, 8, 9] },
]
const ZONA_DE_POS = {}
for (const [z, lista] of Object.entries({ paredes: [1, 4, 9, 12], centro: [2, 5, 8, 11], serpentin: [3, 6, 7, 10] })) {
  for (const p of lista) ZONA_DE_POS[p] = z
}

// ─────────────────────────────────────────── 1. mapas de cargue (SVG)
function dibujarMapa(mapa, indice, total) {
  const pay = mapa.payload || {}
  const guia = pay.placementGuide || []
  const slots = pay.slots || []
  const res = pay.summary || {}
  const bal = pay.balance || {}
  const creado = enBogota(mapa.created_at)

  // Un mismo carro puede venir descrito en placementGuide o en slots; se indexa por posición.
  const porPos = new Map()
  for (const s of slots) if (s?.machinePos) porPos.set(s.machinePos, {
    cartNo: s.cartNo, zone: s.zone, entry: s.entry || {}, location: s.location,
  })
  for (const g of guia) if (g?.machinePos) porPos.set(g.machinePos, {
    ...(porPos.get(g.machinePos) || {}),
    cartNo: g.cartNo, zone: g.zone, location: g.location,
    color: g.color, lotsLabel: g.lotsLabel, trays: g.trays, eggs: g.eggs,
    productionDate: g.productionDate, isTreated: g.isTreated, heatLabel: g.heatLabel,
  })

  const W = 1240, H = 1000
  const o = []
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, system-ui, sans-serif">`)
  o.push(`<rect width="${W}" height="${H}" fill="#0b1428"/>`)

  // Encabezado
  o.push(`<text x="32" y="46" fill="#e8eefc" font-size="27" font-weight="700">MAPA DE CARGUE — Nº de carro → ubicación</text>`)
  o.push(`<text x="32" y="72" fill="#8fa3c8" font-size="15">${esc(mapa.machine_name || 'Incubadora')} · ${esc(creado.sello)} · ${esc(ESTADO[mapa.status] || mapa.status || '')}</text>`)
  o.push(`<text x="32" y="94" fill="#8fa3c8" font-size="14">Operario: busque el número del carro y colóquelo en la posición indicada de la máquina.</text>`)
  o.push(`<text x="${W - 32}" y="46" fill="#e0740a" font-size="20" font-weight="700" text-anchor="end">Registro ${dosDig(indice)} de ${total}</text>`)
  o.push(`<text x="${W - 32}" y="70" fill="#5f7191" font-size="13" text-anchor="end">Antioqueña de Incubación S.A.S. · ISO 9001</text>`)
  o.push(`<line x1="32" y1="110" x2="${W - 32}" y2="110" stroke="#1e2c47"/>`)

  // Leyenda de zonas
  let lx = 32
  for (const z of ['centro', 'paredes', 'serpentin']) {
    o.push(`<rect x="${lx}" y="126" width="15" height="15" rx="3" fill="${ZONA_COLOR[z]}"/>`)
    o.push(`<text x="${lx + 23}" y="139" fill="#c5d0e6" font-size="13">${ZONA_NOMBRE[z]} (${ZONA_PISTA[z]})</text>`)
    lx += 380
  }

  // Máquina: dos compartimentos de 3×2 con el ventilador en medio
  const X0 = 60, Y0 = 190, CW = 168, CH = 148, GAP = 14, VENT = 62
  const anchoComp = 3 * CW + 2 * GAP
  const xDer = X0 + anchoComp + VENT + 2 * GAP

  o.push(`<rect x="${X0 - 22}" y="${Y0 - 44}" width="${2 * anchoComp + VENT + 4 * GAP + 44}" height="${2 * CH + GAP + 74}" rx="14" fill="#0e1930" stroke="#26365a" stroke-width="2"/>`)
  o.push(`<text x="${X0 + anchoComp / 2}" y="${Y0 - 20}" fill="#7f93b8" font-size="13" font-weight="600" text-anchor="middle">COMPARTIMENTO IZQUIERDO</text>`)
  o.push(`<text x="${xDer + anchoComp / 2}" y="${Y0 - 20}" fill="#7f93b8" font-size="13" font-weight="600" text-anchor="middle">COMPARTIMENTO DERECHO</text>`)

  // Ventilador central
  const vx = X0 + anchoComp + GAP
  o.push(`<rect x="${vx}" y="${Y0}" width="${VENT}" height="${2 * CH + GAP}" rx="8" fill="#152238" stroke="#2f4269"/>`)
  o.push(`<text x="${vx + VENT / 2}" y="${Y0 + CH}" fill="#6f83a8" font-size="13" font-weight="600" text-anchor="middle" transform="rotate(-90 ${vx + VENT / 2} ${Y0 + CH})">VENTILADOR CENTRAL</text>`)

  REJILLA.forEach((fila, fi) => {
    const y = Y0 + fi * (CH + GAP)
    o.push(`<text x="${X0 - 30}" y="${y + CH / 2}" fill="#5f7191" font-size="12" text-anchor="middle" transform="rotate(-90 ${X0 - 30} ${y + CH / 2})">${fila.fila.toUpperCase()}</text>`)
    const dibujarCelda = (pos, x) => {
      const d = porPos.get(pos)
      const z = d?.zone || ZONA_DE_POS[pos]
      const borde = ZONA_COLOR[z] || '#3a4a6b'
      o.push(`<rect x="${x}" y="${y}" width="${CW}" height="${CH}" rx="10" fill="${d ? '#152238' : '#101c31'}" stroke="${borde}" stroke-width="${d ? 3 : 1.5}"${d ? '' : ' stroke-dasharray="5 4"'}/>`)
      o.push(`<text x="${x + 10}" y="${y + 22}" fill="#6f83a8" font-size="12" font-weight="600">POS. ${pos}</text>`)
      o.push(`<text x="${x + CW - 10}" y="${y + 22}" fill="${borde}" font-size="12" font-weight="700" text-anchor="end">${ZONA_NOMBRE[z] || ''}</text>`)
      if (!d) {
        o.push(`<text x="${x + CW / 2}" y="${y + CH / 2 + 8}" fill="#3c4c6d" font-size="17" text-anchor="middle">vacío</text>`)
        return
      }
      // Número de carro: es lo único que el operario necesita leer de lejos.
      const cinta = d.color || d.entry?.color || '#78909c'
      o.push(`<rect x="${x + 10}" y="${y + 32}" width="46" height="46" rx="8" fill="${esc(cinta)}"/>`)
      o.push(`<text x="${x + CW / 2 + 16}" y="${y + 70}" fill="#ffffff" font-size="40" font-weight="800" text-anchor="middle">${esc(d.cartNo ?? d.entry?.cartNumber ?? '')}</text>`)
      const lotes = d.lotsLabel || (d.entry?.lots || []).map((l) => `${l.lot} (${l.trays}b T${l.eggType})`).join(' + ')
      const band = d.trays ?? d.entry?.trays ?? ''
      const huev = d.eggs ?? d.entry?.eggs ?? 0
      o.push(`<text x="${x + 10}" y="${y + 98}" fill="#c5d0e6" font-size="12">${esc(String(lotes).slice(0, 30))}</text>`)
      o.push(`<text x="${x + 10}" y="${y + 116}" fill="#8fa3c8" font-size="12">${band} bandejas · ${Number(huev).toLocaleString('es-CO')} huevos</text>`)
      const fpd = d.productionDate || d.entry?.productionDate || ''
      o.push(`<text x="${x + 10}" y="${y + 134}" fill="#8fa3c8" font-size="12">Postura ${esc(fpd)}${d.isTreated || d.entry?.isTreated ? ' · TRATADO' : ''}</text>`)
    }
    fila.izq.forEach((pos, i) => dibujarCelda(pos, X0 + i * (CW + GAP)))
    fila.der.forEach((pos, i) => dibujarCelda(pos, xDer + i * (CW + GAP)))
  })

  // Tabla carro → ubicación
  let ty = Y0 + 2 * CH + GAP + 84
  o.push(`<text x="32" y="${ty}" fill="#e8eefc" font-size="17" font-weight="700">Orden de cargue</text>`)
  ty += 24
  o.push(`<text x="32" y="${ty}" fill="#6f83a8" font-size="12" font-weight="600">CARRO</text>`)
  o.push(`<text x="120" y="${ty}" fill="#6f83a8" font-size="12" font-weight="600">UBICACIÓN EN LA MÁQUINA</text>`)
  o.push(`<text x="640" y="${ty}" fill="#6f83a8" font-size="12" font-weight="600">CARGA</text>`)
  ty += 8
  const filas = [...porPos.entries()].sort((a, b) => a[0] - b[0])
  for (const [pos, d] of filas) {
    ty += 21
    if (ty > H - 60) break
    const z = d.zone || ZONA_DE_POS[pos]
    o.push(`<text x="32" y="${ty}" fill="${ZONA_COLOR[z]}" font-size="13" font-weight="700">${esc(d.cartNo ?? '')}</text>`)
    o.push(`<text x="120" y="${ty}" fill="#c5d0e6" font-size="13">${esc(d.location || '')}</text>`)
    const lotes = d.lotsLabel || (d.entry?.lots || []).map((l) => `${l.lot} (${l.trays}b)`).join(' + ')
    o.push(`<text x="640" y="${ty}" fill="#8fa3c8" font-size="13">${esc(String(lotes).slice(0, 62))}</text>`)
  }

  // Pie: totales y balance
  const avisos = bal.warnings || []
  o.push(`<line x1="32" y1="${H - 46}" x2="${W - 32}" y2="${H - 46}" stroke="#1e2c47"/>`)
  o.push(`<text x="32" y="${H - 24}" fill="#8fa3c8" font-size="13">Total: ${Number(res.totalEggs || 0).toLocaleString('es-CO')} huevos · ${res.totalTrays || 0} bandejas · ${res.cartCount || filas.length} carros · balance ${bal.left ?? '?'}/${bal.right ?? '?'}</text>`)
  o.push(`<text x="${W - 32}" y="${H - 24}" fill="${avisos.length ? '#ffb020' : '#3ecf8e'}" font-size="13" text-anchor="end">${avisos.length ? esc('⚠ ' + avisos.join(' · ').slice(0, 70)) : '✓ Carga balanceada (Petersime)'}</text>`)
  o.push('</svg>')
  return o.join('\n')
}

async function exportarMapas() {
  const mapas = await traer('load_maps', 'select=*&order=created_at.asc')
  dirDe(DIR_MAPAS)
  const filas = []
  mapas.forEach((m, i) => {
    const n = i + 1
    const f = enBogota(m.created_at)
    const nombre = `${String(n).padStart(3, '0')} · ${f.fecha} · ${limpio(m.machine_name || 'máquina')} · ${ESTADO[m.status] || m.status}.svg`
    writeFileSync(join(DIR_MAPAS, nombre), dibujarMapa(m, n, mapas.length), 'utf8')
    const res = m.payload?.summary || {}
    filas.push({
      'Nº': n, Archivo: nombre, Fecha: f.fecha, Hora: f.hora,
      Máquina: m.machine_name || '', Estado: ESTADO[m.status] || m.status || '',
      Carros: res.cartCount ?? '', Bandejas: res.totalTrays ?? '', Huevos: res.totalEggs ?? '',
      'Huevo tratado': res.treatedEggs ?? '', 'Carros mixtos': res.mixedCarts ?? '',
      Balance: m.payload?.balance?.ok === false ? 'Con avisos' : 'Correcto',
      'Motivo de rechazo': m.rejected_reason || '', ID: m.id,
    })
  })
  console.log(`  ${mapas.length} mapas → ${DIR_MAPAS}`)
  return filas
}

// ─────────────────────────────────────────── 2. Excel de registros
/** Ruta relativa donde queda (o quedará) la evidencia de un registro. */
function rutaEvidencia(chk, maq) {
  if (!chk.photo_path) return ''
  const f = enBogota(chk.taken_at)
  const mes = f.fecha.slice(0, 7)
  const cod = limpio(maq?.code || 'sin-código')
  const ext = (chk.photo_path.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0]
  const hora = f.hora.replace(/:/g, '')
  return `${mes}/${cod}/${f.fecha}_${hora}_T${chk.shift_number ?? '?'}H${chk.hour_slot ?? '?'}_${chk.condition || ''}${ext}`
}

/** Ruta relativa de una de las dos fotos de una calibración. */
function rutaCalibracion(c, maq, cual) {
  const origen = cual === 'patrón' ? c.photo_calibrator_path : c.photo_screen_path
  if (!origen) return ''
  const f = enBogota(c.calibrated_at || c.created_at)
  const ext = (origen.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0]
  return `Calibraciones/${limpio(maq?.code || 'sin-código')}/${f.fecha}_${f.hora.replace(/:/g, '')}_${cual}${ext}`
}

async function exportarExcel(filasMapas) {
  const [checks, maquinas, salas, perfiles, orgs, plantas, calibs] = await Promise.all([
    traer('machine_checks', 'select=*&order=taken_at.asc'),
    traer('machines', 'select=id,code,name,type,brand,model,status,room_id,panel_room_id,capacity_eggs,installed_at,last_calib_at,current_lote,current_phase'),
    traer('rooms', 'select=id,name,code'),
    traer('profiles', 'select=id,full_name,email'),
    traer('organizations', 'select=id,name,legal_name,nit'),
    traer('plants', 'select=id,name,code,city'),
    traer('machine_calibrations', 'select=*&order=created_at.asc'),
  ])
  const idx = (arr) => new Map(arr.map((x) => [x.id, x]))
  const M = idx(maquinas), S = idx(salas), P = idx(perfiles), PL = idx(plantas)

  const registros = checks.map((c) => {
    const m = M.get(c.machine_id)
    const f = enBogota(c.taken_at)
    const sala = S.get(m?.panel_room_id || m?.room_id)
    return {
      Fecha: f.fecha, Hora: f.hora,
      Turno: c.shift_number ?? '', 'Franja horaria': c.hour_slot ?? '',
      'Fecha de turno': c.shift_date || '',
      Sala: sala?.name || '', Máquina: m?.code || '', 'Nombre de la máquina': m?.name || '',
      Tipo: m?.type || '', Marca: m?.brand || '', Modelo: m?.model || '',
      Condición: CONDICION[c.condition] || c.condition || '',
      Observaciones: c.notes || '',
      Operario: P.get(c.taken_by)?.full_name || '',
      Evidencia: c.photo_path ? rutaEvidencia(c, m) : 'sin foto',
      Planta: PL.get(c.plant_id)?.name || '',
      'ID del registro': c.id,
    }
  })

  // Resumen por máquina: lo que un auditor mira primero.
  const porMaquina = new Map()
  for (const r of registros) {
    const k = r.Máquina || '(sin máquina)'
    const a = porMaquina.get(k) || { Máquina: k, Sala: r.Sala, Tipo: r.Tipo, Registros: 0, Normal: 0, Alerta: 0, Falla: 0, Apagada: 0, 'Con evidencia': 0, Desde: r.Fecha, Hasta: r.Fecha }
    a.Registros++
    if (a[r.Condición] !== undefined) a[r.Condición]++
    if (r.Evidencia !== 'sin foto') a['Con evidencia']++
    if (r.Fecha < a.Desde) a.Desde = r.Fecha
    if (r.Fecha > a.Hasta) a.Hasta = r.Fecha
    porMaquina.set(k, a)
  }
  const resumen = [...porMaquina.values()].sort((a, b) => String(a.Máquina).localeCompare(String(b.Máquina), 'es'))
  for (const r of resumen) r['% cobertura fotográfica'] = r.Registros ? Math.round((r['Con evidencia'] / r.Registros) * 100) + '%' : ''

  const ALCANCE = { both: 'Temperatura y humedad', temp: 'Temperatura', rh: 'Humedad' }
  const calibraciones = calibs.map((c) => {
    const m = M.get(c.machine_id)
    const f = enBogota(c.calibrated_at || c.created_at)
    return {
      Fecha: f.fecha, Hora: f.hora,
      Máquina: m?.code || '', 'Nombre de la máquina': m?.name || '', Sala: S.get(m?.panel_room_id || m?.room_id)?.name || '',
      Alcance: ALCANCE[c.scope] || c.scope || '', Motivo: c.reason === 'manual' ? 'Manual' : c.reason || '',
      'Temp. máquina (°F)': c.temp_machine_f, 'Temp. patrón (°F)': c.temp_calibrator_f, 'Desviación temp. (°F)': c.temp_delta_f,
      'HR máquina (%)': c.rh_machine_pct, 'HR patrón (%)': c.rh_calibrator_pct, 'Desviación HR (%)': c.rh_delta_pct,
      Ejecutó: P.get(c.performed_by)?.full_name || '',
      'Evidencia · patrón': rutaCalibracion(c, m, 'patrón'),
      'Evidencia · pantalla': rutaCalibracion(c, m, 'pantalla'),
      'ID de la calibración': c.id,
    }
  })

  const org = orgs[0] || {}
  const rango = registros.length ? `${registros[0].Fecha} a ${registros[registros.length - 1].Fecha}` : '—'
  const portada = [
    { Campo: 'Documento', Valor: 'Paquete de evidencias — Sistema de Gestión de Calidad ISO 9001' },
    { Campo: 'Organización', Valor: org.legal_name || org.name || '' },
    { Campo: 'NIT', Valor: org.nit || '' },
    { Campo: 'Planta', Valor: plantas.map((p) => p.name).join(', ') },
    { Campo: 'Generado', Valor: enBogota(new Date().toISOString()).sello + ' (hora de Bogotá)' },
    { Campo: 'Origen de los datos', Valor: 'IncubApp · base de datos de producción' },
    { Campo: '', Valor: '' },
    { Campo: 'Registros de máquinas (rondas)', Valor: `${registros.length} · periodo ${rango}` },
    { Campo: 'Registros con evidencia fotográfica', Valor: `${registros.filter((r) => r.Evidencia !== 'sin foto').length}` },
    { Campo: 'Máquinas cubiertas', Valor: `${resumen.length}` },
    { Campo: 'Mapas de cargue', Valor: `${filasMapas.length}` },
    { Campo: 'Calibraciones', Valor: `${calibraciones.length}` },
    { Campo: '', Valor: '' },
    { Campo: 'Cómo leer la columna Evidencia', Valor: 'Es la ruta del archivo dentro de la carpeta «3. Evidencias fotográficas».' },
  ]

  const libro = XLSX.utils.book_new()
  const hoja = (nombre, datos, anchos) => {
    const h = XLSX.utils.json_to_sheet(datos)
    if (anchos) h['!cols'] = anchos.map((w) => ({ wch: w }))
    if (datos.length) h['!autofilter'] = { ref: h['!ref'] }
    XLSX.utils.book_append_sheet(libro, h, nombre)
  }
  hoja('Portada', portada, [34, 76])
  hoja('Registros de máquinas', registros, [11, 10, 7, 8, 13, 22, 12, 26, 14, 12, 14, 11, 40, 24, 46, 16, 38])
  hoja('Resumen por máquina', resumen, [12, 22, 14, 11, 9, 9, 8, 10, 14, 12, 12, 20])
  hoja('Mapas de cargue', filasMapas, [5, 62, 11, 10, 14, 12, 8, 10, 10, 14, 14, 12, 30, 38])
  if (calibraciones.length) hoja('Calibraciones', calibraciones, [11, 12, 26, 16, 16, 16, 16])

  dirDe(DIR_EXCEL)
  const destino = join(DIR_EXCEL, 'Registros de máquinas y evidencias.xlsx')
  XLSX.writeFile(libro, destino)
  console.log(`  ${registros.length} registros → ${destino}`)
  return { checks, M, calibs }
}

// ─────────────────────────────────────────── 3. evidencias fotográficas
async function exportarFotos(checks, M, calibs) {
  // Cada pendiente es {bucket, origen, destino relativo}: las rondas viven en
  // machine-checks y las calibraciones en wo-evidence.
  const pendientes = checks
    .filter((c) => c.photo_path)
    .map((c) => ({ bucket: 'machine-checks', origen: c.photo_path, rel: rutaEvidencia(c, M.get(c.machine_id)) }))
  for (const c of calibs || []) {
    for (const cual of ['patrón', 'pantalla']) {
      const origen = cual === 'patrón' ? c.photo_calibrator_path : c.photo_screen_path
      if (origen) pendientes.push({ bucket: 'wo-evidence', origen, rel: rutaCalibracion(c, M.get(c.machine_id), cual) })
    }
  }
  dirDe(DIR_FOTOS)
  let bajadas = 0, saltadas = 0, fallidas = 0, bytes = 0
  const CONCURRENCIA = 8
  let cursor = 0

  async function trabajador() {
    for (;;) {
      const i = cursor++
      if (i >= pendientes.length) return
      const c = pendientes[i]
      const destino = join(DIR_FOTOS, ...c.rel.split('/'))
      if (existsSync(destino) && statSync(destino).size > 0) { saltadas++; continue }
      try {
        const r = await fetch(
          `${URL_SB}/storage/v1/object/${c.bucket}/${c.origen.split('/').map(encodeURIComponent).join('/')}`,
          { headers: cabeceras }
        )
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const buf = Buffer.from(await r.arrayBuffer())
        dirDe(dirname(destino))
        writeFileSync(destino, buf)
        bajadas++; bytes += buf.length
      } catch (e) {
        fallidas++
        if (fallidas <= 5) console.warn(`  ✗ ${c.bucket}/${c.origen}: ${e.message}`)
      }
      const hechas = bajadas + saltadas + fallidas
      if (hechas % 250 === 0) {
        console.log(`  ${hechas}/${pendientes.length} · ${bajadas} nuevas · ${saltadas} ya estaban · ${(bytes / 1e6).toFixed(0)} MB`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador))
  console.log(`  ${bajadas} bajadas · ${saltadas} ya estaban · ${fallidas} fallidas · ${(bytes / 1e6).toFixed(0)} MB → ${DIR_FOTOS}`)
}

// ─────────────────────────────────────────── índice del paquete
function escribirIndice(filasMapas, conteos) {
  const hoy = enBogota(new Date().toISOString())
  const t = [
    'PAQUETE DE EVIDENCIAS — SISTEMA DE GESTIÓN DE CALIDAD ISO 9001',
    'Antioqueña de Incubación S.A.S. · Planta Incubant',
    `Generado el ${hoy.sello} (hora de Bogotá) desde IncubApp.`,
    '',
    '───────────────────────────────────────────────────────────────',
    'QUÉ HAY EN CADA CARPETA',
    '───────────────────────────────────────────────────────────────',
    '',
    '1. Mapas de cargue',
    `   ${filasMapas.length} mapas, uno por archivo, numerados 001…${String(filasMapas.length).padStart(3, '0')} en`,
    '   orden cronológico. El nombre lleva el número, la fecha, la máquina y el',
    '   estado en que quedó el mapa.',
    '   Son archivos SVG: se abren con doble clic en cualquier navegador y se',
    '   imprimen sin perder nitidez porque son vectoriales.',
    '   Cada mapa muestra la vista superior de la máquina (los dos compartimentos',
    '   con el ventilador en medio), qué carro va en cada una de las 12 posiciones,',
    '   la zona térmica de cada posición y la tabla carro → ubicación.',
    '',
    '2. Registros de máquinas',
    '   Un solo libro de Excel con cinco hojas:',
    '     · Portada — de dónde salen los datos y cuánto abarca el paquete.',
    '     · Registros de máquinas — una fila por lectura de ronda.',
    '     · Resumen por máquina — totales y % de cobertura fotográfica.',
    '     · Mapas de cargue — el listado de la carpeta 1, con sus totales.',
    '     · Calibraciones — contraste contra patrón, con sus desviaciones.',
    '   En «Registros de máquinas» y en «Calibraciones» la columna Evidencia trae',
    '   la ruta exacta del archivo dentro de la carpeta 3.',
    '',
    '3. Evidencias fotográficas',
    '   Las fotos que tomó el operario en cada ronda, organizadas por mes y por',
    '   máquina. El nombre de cada foto es la fecha, la hora, el turno, la franja',
    '   horaria y la condición reportada, de modo que la foto se sostiene sola',
    '   como evidencia aunque se saque del paquete.',
    '   Las calibraciones van aparte, en la subcarpeta «Calibraciones».',
    '',
    '───────────────────────────────────────────────────────────────',
    'CONTENIDO DE ESTA ENTREGA',
    '───────────────────────────────────────────────────────────────',
    '',
    ...Object.entries(conteos).map(([k, v]) => `   ${k.padEnd(42, '.')} ${v}`),
    '',
    'Para actualizar el paquete se vuelve a ejecutar el exportador: solo trae lo',
    'que haya salido nuevo, no vuelve a descargar lo que ya está aquí.',
    '',
  ]
  writeFileSync(join(RAIZ, 'LÉAME — cómo está organizado este paquete.txt'), t.join('\r\n'), 'utf8')
}

// ─────────────────────────────────────────── orquestación
const fase = process.argv[2] || 'todo'
dirDe(RAIZ)

console.log(`Paquete ISO 9001 → ${RAIZ}\n`)

let filasMapas = []
if (fase === 'todo' || fase === 'mapas') {
  console.log('1. Mapas de cargue')
  filasMapas = await exportarMapas()
}
if (fase === 'excel' || fase === 'fotos' || fase === 'todo') {
  // La hoja «Mapas de cargue» nombra el archivo SVG de cada mapa, así que se
  // generan siempre: es barato y garantiza que el Excel y la carpeta coincidan.
  if (!filasMapas.length) {
    console.log('1. Mapas de cargue')
    filasMapas = await exportarMapas()
  }
  console.log('\n2. Registros de máquinas')
  const { checks, M, calibs } = await exportarExcel(filasMapas)
  if (fase === 'fotos' || fase === 'todo') {
    console.log('\n3. Evidencias fotográficas')
    await exportarFotos(checks, M, calibs)
  }
  escribirIndice(filasMapas, {
    'Mapas de cargue': filasMapas.length,
    'Registros de ronda': checks.length,
    'Registros con evidencia fotográfica': checks.filter((c) => c.photo_path).length,
    'Calibraciones': calibs.length,
    'Periodo cubierto': checks.length
      ? `${enBogota(checks[0].taken_at).fecha} a ${enBogota(checks[checks.length - 1].taken_at).fecha}`
      : '—',
  })
}
console.log('\nListo.')
