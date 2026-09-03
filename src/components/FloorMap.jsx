/**
 * =============================================================================
 * ARCHIVO: src/components/FloorMap.jsx
 * PROPÓSITO: Componente UI «FloorMap»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const SCALE_DEFAULT = 14 // px por metro (zoom base)
const SCALE_MIN = 4
const SCALE_MAX = 40
const MIN_W = 640
const MIN_H = 360
const clampScale = (s) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))

const ROOM_TYPES = [
  { value: 'incubation', label: 'Incubación' },
  { value: 'hatching', label: 'Nacedora' },
  { value: 'egg_storage', label: 'Bodega de huevo' },
  { value: 'chick_processing', label: 'Proceso de pollito' },
  { value: 'washing', label: 'Lavado' },
  { value: 'technical', label: 'Cuarto técnico' },
  { value: 'office', label: 'Oficina' },
  { value: 'hallway', label: 'Pasillo' },
  { value: 'parking', label: 'Parqueadero' },
  { value: 'exterior', label: 'Exterior / Patio' },
  { value: 'green_area', label: 'Zona verde' },
  { value: 'tank', label: 'Tanque / Silo' },
  { value: 'road', label: 'Vía rural / Camino' },
  { value: 'plenum', label: 'Plenum (técnico)' },
  // Tipos exclusivos de granja
  { value: 'produccion', label: 'Producción' },
  { value: 'levante', label: 'Levante' },
  { value: 'other', label: 'Otro' },
]

const typeLabel = (t) => ROOM_TYPES.find((r) => r.value === t)?.label ?? t

// Etiquetas para el detalle de la sala y sus componentes (máquinas/equipos)
const MACHINE_TYPE_LABELS = {
  setter: 'Incubadora',
  hatcher: 'Nacedora',
  combo: 'Combinada',
  chiller: 'Chiller',
  compressor: 'Compresor',
  other: 'Equipo',
}
const MACHINE_STATUS = {
  active: { label: 'Activa', cls: 'ok' },
  idle: { label: 'En espera', cls: 'idle' },
  maintenance: { label: 'Mantenimiento', cls: 'warn' },
  decommissioned: { label: 'Fuera de servicio', cls: 'off' },
}

// Color por defecto de cada tipo de sala (coincide con index.css) para prellenar el selector
const DEFAULT_ROOM_COLOR = {
  incubation: '#35d6e8',
  hatching: '#f0b34a',
  egg_storage: '#57d9a3',
  chick_processing: '#f07070',
  washing: '#8fa3c8',
  technical: '#b48cf0',
  office: '#6b7896',
  hallway: '#55627e',
  parking: '#7d8aa5',
  exterior: '#c9a06a',
  green_area: '#5bbf6a',
  tank: '#6fb2c8',
  road: '#a98a5b',
  plenum: '#5c6f8f',
  produccion: '#f39c12',
  levante: '#27ae60',
  other: '#55627e',
}

// Convierte #rrggbb a rgba(r,g,b,a) para teñir el fondo de la sala
function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return null
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`
}

// Puertas del plano: tamaño en metros y tipos disponibles
const DOOR_SIZE = 1.6
// Dos decimales: las coordenadas son metros de planta, no hace falta más, y
// así no se cuelan colas de coma flotante al mover una sala.
const round2 = (v) => Math.round(v * 100) / 100
const doorSpan = (d) => Number(d?.w) || (d?.type === 'window' ? 1 : DOOR_SIZE)

// En qué muro de la sala queda el vano. Se guarda con la puerta en vez de
// deducirlo cada vez: el muro es una decisión del plano, no una consecuencia de
// cuánto mida la sala. Mientras se dedujo por distancia, reescalar una sala
// bastaba para que una puerta se pasara sola al muro de al lado.
const LADOS = ['arriba', 'abajo', 'izquierda', 'derecha']
const EJE_LADO = { arriba: 'H', abajo: 'H', izquierda: 'V', derecha: 'V' }
function ladoDeVano(room, d) {
  const a = doorSpan(d)
  const x = Number(d.x) || 0
  const y = Number(d.y) || 0
  const dist = {
    arriba: y, abajo: Number(room.height) - a - y,
    izquierda: x, derecha: Number(room.width) - a - x,
  }
  const min = Math.min(...LADOS.map((l) => dist[l]))
  const empatados = LADOS.filter((l) => Math.abs(dist[l] - min) < 0.05)
  if (empatados.length === 1) return empatados[0]
  const q = ((Math.round((Number(d.rot) || 0) / 90) * 90) % 360 + 360) % 360
  const eje = q === 0 || q === 180 ? 'H' : 'V'
  return empatados.find((l) => EJE_LADO[l] === eje) ?? empatados[0]
}
const DOOR_TYPES = [
  { value: 'normal', label: 'Puerta normal' },
  { value: 'sliding', label: 'Puerta corredera' },
  { value: 'loading', label: 'Puerta de carga (muelle)' },
  // Paso sin hoja: el muro se abre pero no hay puerta que colgar. Es el caso
  // del vano entre las dos salas de incubadoras, que solo tiene marco.
  { value: 'open', label: 'Vano sin puerta (solo marco)' },
  // Ventana de vidrio: el hueco no llega al piso, queda antepecho debajo. Las
  // de los comedores son de 2 m de ancho y el resto de 1, así que la ventana
  // guarda su propio ancho en `w`.
  { value: 'window', label: 'Ventana de vidrio' },
]
const DOOR_LABEL = Object.fromEntries(DOOR_TYPES.map((t) => [t.value, t.label]))
const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `d${Date.now()}${Math.random().toString(36).slice(2, 7)}`)

function NewRoomForm({ onCreate, onCancel, defaultType = 'incubation', heading, isFarm = false }) {
  const [name, setName] = useState('')
  const [type, setType] = useState(defaultType)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onCreate({ name, type })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      {heading && <p className="component-title" style={{ margin: '0 0 8px' }}>{heading}</p>}
      <div className="two-col">
        <label>
          {isFarm ? 'Nombre del módulo' : 'Nombre de la sala'}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isFarm ? 'Ej. Módulo 1' : 'Ej. Sala de incubación 1'}
            autoFocus
          />
        </label>
        <label>
          {isFarm ? 'Tipo de zona' : 'Tipo'}
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {ROOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || name.trim().length < 2}>
          {busy ? 'Agregando…' : isFarm ? 'Agregar módulo' : 'Agregar sala'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function EditRoomForm({ room, onSave, onCancel, onAddDoor, onStartPlenum, isFarm = false }) {
  const poly = isPoly(room)
  const [form, setForm] = useState({
    name: room.name,
    code: room.code,
    type: room.type,
    width: room.width,
    height: room.height,
    rotation: Number(room.rotation) || 0,
    useColor: !!room.color,
    color: room.color || DEFAULT_ROOM_COLOR[room.type] || '#35d6e8',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const doorCount = (room.doors ?? []).length

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const patch = {
      name: form.name.trim(),
      code: form.code.trim(),
      type: form.type,
      rotation: ((Math.round(Number(form.rotation) || 0) % 360) + 360) % 360,
      color: form.useColor ? form.color : null,
    }
    // Las salas de forma libre conservan su bounding box; solo las rectangulares editan tamaño
    if (!poly) {
      // Medio metro, no dos. El tope de 2 m impedia escribir el tamano real de
      // media planta: el corredor exterior junto al comedor mide 0,70 de ancho,
      // los cuartos de maquinas 1,80 de fondo y los W.C. 1,00. Aunque se
      // escribiera el numero, esto lo subia a 2 al guardar.
      patch.width = Math.max(0.5, Number(form.width) || room.width)
      patch.height = Math.max(0.5, Number(form.height) || room.height)
    }
    const { error } = await onSave(room.id, patch)
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form compact">
      <div className="two-col">
        <label>
          {isFarm ? 'Nombre del módulo' : 'Nombre de la sala'}
          <input type="text" value={form.name} onChange={set('name')} autoFocus />
        </label>
        <label>
          Código
          <input type="text" value={form.code} onChange={set('code')} />
        </label>
      </div>
      <div className="two-col">
        <label>
          Tipo
          <select value={form.type} onChange={set('type')}>
            {ROOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {poly ? (
          <label>
            Tamaño
            <input type="text" value="Forma libre (dibujada)" disabled />
          </label>
        ) : (
          <label>
            Tamaño (ancho × alto, metros)
            <span style={{ display: 'flex', gap: 6 }}>
              <input type="number" min="0.5" step="0.1" value={form.width} onChange={set('width')} style={{ width: '50%' }} />
              <input type="number" min="0.5" step="0.1" value={form.height} onChange={set('height')} style={{ width: '50%' }} />
            </span>
          </label>
        )}
      </div>

      {/* Rotación / orientación */}
      <div className="room-rot-row">
        <span className="hint" style={{ margin: 0 }}>Orientación</span>
        <button type="button" className="ghost small" onClick={() => setForm((f) => ({ ...f, rotation: (((Math.round(Number(f.rotation) || 0) - 15) % 360) + 360) % 360 }))}>↺ −15°</button>
        <input
          type="number" min="0" max="359" value={form.rotation} onChange={set('rotation')}
          style={{ width: 74 }} aria-label="Grados de rotación"
        />
        <span className="hint" style={{ margin: 0 }}>°</span>
        <button type="button" className="ghost small" onClick={() => setForm((f) => ({ ...f, rotation: (((Math.round(Number(f.rotation) || 0) + 15) % 360) + 360) % 360 }))}>+15° ↻</button>
        <button type="button" className="ghost small" onClick={() => setForm((f) => ({ ...f, rotation: 0 }))}>0°</button>
      </div>

      {/* Color de fondo de la sala */}
      <div className="room-color-row">
        <label className="check-inline">
          <input
            type="checkbox"
            checked={form.useColor}
            onChange={(e) => setForm((f) => ({ ...f, useColor: e.target.checked }))}
          />
          Color de fondo personalizado
        </label>
        {form.useColor && (
          <>
            <input
              type="color"
              value={form.color}
              onChange={set('color')}
              title="Elegir color de la sala"
              aria-label="Color de la sala"
            />
            <button
              type="button"
              className="ghost small"
              onClick={() => setForm((f) => ({ ...f, useColor: false }))}
            >
              Quitar color
            </button>
          </>
        )}
      </div>

      {/* Puertas de la sala */}
      <div className="room-door-row">
        <span className="hint" style={{ margin: 0 }}>
          Puertas: {doorCount}. Agrégalas y arrástralas en el plano al punto donde estén; ✕ para quitarlas.
        </span>
        <div className="actions row" style={{ marginTop: 0 }}>
          {DOOR_TYPES.map((d) => (
            <button key={d.value} type="button" className="chip ghost" onClick={() => onAddDoor?.(d.value)}>
              + {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plenum sobre esta sala: dibuja a mano alzada un vacío técnico que
          cuelga del cielo raso de ESTA sala (queda como su anfitriona). */}
      {!isFarm && room.type !== 'plenum' && onStartPlenum && (
        <div className="room-door-row">
          <span className="hint" style={{ margin: 0 }}>
            ¿Necesitas un vacío técnico sobre el cielo raso de esta sala (ductos, retorno de aire)?
          </span>
          <div className="actions row" style={{ marginTop: 0 }}>
            <button type="button" className="chip ghost" onClick={() => onStartPlenum(room)}>
              🧩 Crear plenum sobre esta sala
            </button>
          </div>
        </div>
      )}

      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy || form.name.trim().length < 2}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Plenum: sub-sala de forma libre colgada de una sala anfitriona ─────────
// A diferencia de una sala normal, un plenum no arranca del piso: vive sobre
// el cielo raso de la sala que lo aloja (parte_de) y trae su propia
// profundidad (altura). Se dibuja con la misma herramienta de forma libre.
const PLENUM_DEPTH_DEFAULT = 0.6

function PlenumRoomForm({ hostRooms, initialHostId, onCreate, onCancel }) {
  const initialHost = initialHostId ? hostRooms.find((r) => r.id === initialHostId) : null
  const [name, setName] = useState(initialHost ? `Plenum ${initialHost.code}` : '')
  const [nameTouched, setNameTouched] = useState(false)
  const [hostId, setHostId] = useState(initialHostId || '')
  const [depth, setDepth] = useState(PLENUM_DEPTH_DEFAULT)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const pickHost = (id) => {
    setHostId(id)
    if (!nameTouched) {
      const host = hostRooms.find((r) => r.id === id)
      if (host) setName(`Plenum ${host.code}`)
    }
  }

  const submit = async () => {
    if (!hostId) { setErr('Elige la sala anfitriona'); return }
    setBusy(true)
    setErr(null)
    const { error } = await onCreate({
      name: name.trim() || `Plenum ${hostRooms.find((r) => r.id === hostId)?.code || ''}`,
      type: 'plenum',
      parte_de: hostId,
      altura: Math.max(0.2, Number(depth) || PLENUM_DEPTH_DEFAULT),
    })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <p className="component-title" style={{ margin: '0 0 8px' }}>Nuevo plenum de forma libre</p>
      <p className="hint" style={{ margin: '0 0 12px' }}>
        Vacío técnico sobre el cielo raso de una sala (ductos, retorno de aire). Se apoya en la
        altura de su sala anfitriona, no en el piso.
      </p>
      <div className="two-col">
        <label>
          Sala anfitriona
          <select value={hostId} onChange={(e) => pickHost(e.target.value)}>
            <option value="">Elige una sala…</option>
            {hostRooms.filter((r) => r.type !== 'plenum').map((r) => (
              <option key={r.id} value={r.id}>{r.code} · {r.name}</option>
            ))}
          </select>
        </label>
        <label>
          Profundidad del plenum (m)
          <input
            type="number" min="0.2" step="0.1" value={depth}
            onChange={(e) => setDepth(e.target.value)}
          />
        </label>
      </div>
      <label style={{ marginTop: 8, display: 'block' }}>
        Nombre
        <input
          type="text" value={name}
          onChange={(e) => { setName(e.target.value); setNameTouched(true) }}
          placeholder="Ej. Plenum SN3"
        />
      </label>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !hostId}>
          {busy ? 'Agregando…' : 'Agregar plenum'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// Etiqueta legible del valor guardado en wall_heights para un muro.
const wallHeightLabel = (v) =>
  v == null ? 'automático (regla de siempre)' : v === 'techo' ? 'hasta la cubierta' : `${v} m fijo`

// Tamaño fijo por tipo de máquina (en metros). Todas se ubican manualmente con drag.
// Medidas tomadas en planta: la incubadora es 4 de ancho por 3.5 de fondo y la
// nacedora 3.5 por 1.8. `h` es el fondo, que en el plano se ve como alto.
const MACHINE_SIZES = {
  setter: { w: 4.0, h: 3.5 }, // incubadora
  combo: { w: 4.0, h: 3.5 }, // combinada
  hatcher: { w: 3.5, h: 1.8 }, // nacedora
  chiller: { w: 2.6, h: 1.8 },
  compressor: { w: 2.6, h: 1.8 },
}
const DEFAULT_SIZE = { w: 2.6, h: 1.8 }
const machineSize = (m) => {
  if (m.brand === 'galpon_p1' || m.brand === 'galpon_p2') {
    // El largo real varía por edificio y se guarda en `model` como ANCHOxLARGO (ej. "14x80")
    const mm = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(m.model || '')
    if (mm) return { w: Number(mm[1]), h: Number(mm[2]) }
    return { w: 14, h: 100 } // por defecto: galpón estándar
  }
  return MACHINE_SIZES[m.type] ?? DEFAULT_SIZE
}

// ── Geometría de forma libre y rotación ──────────────────────
// clip-path en % a partir de los vértices del polígono y su bounding box (ancho×alto)
function polyClip(points, W, H) {
  if (!Array.isArray(points) || points.length < 3 || !W || !H) return null
  return `polygon(${points.map((p) => `${((p.x / W) * 100).toFixed(2)}% ${((p.y / H) * 100).toFixed(2)}%`).join(', ')})`
}
const polyStr = (points) => points.map((p) => `${p.x},${p.y}`).join(' ')
const isPoly = (room) => Array.isArray(room.points) && room.points.length >= 3
// Redondea a 5° con imán a los múltiplos de 90°
const snapDeg = (deg) => {
  let d = (((Math.round(deg / 5) * 5) % 360) + 360) % 360
  for (const k of [0, 90, 180, 270]) if (Math.abs(d - k) <= 4 || Math.abs(d - 360) <= 4) d = k
  return d
}

// Parte visual de cada máquina (chiller / compresor / incubadora genérica / galpones)
function MachineGlyph({ m }) {
  if (m.brand === 'galpon_p1' || m.brand === 'galpon_p2') {
    const isP2 = m.brand === 'galpon_p2'
    return (
      <div className={`mach-galpon ${isP2 ? 'p2' : 'p1'}`}>
        <div className="galpon-roof-bar" />
        <div className="galpon-windows-row">
          <span className="galpon-win" />
          <span className="galpon-win" />
          {isP2 ? <span className="galpon-win" /> : <div className="galpon-door-bar" />}
          <span className="galpon-win" />
          <span className="galpon-win" />
        </div>
        <div className="mach-code-overlay">{m.code}</div>
      </div>
    )
  }
  if (m.type === 'chiller') {
    return (
      <div className="mach-chiller">
        <div className="chiller-fans">
          <div className="chiller-fan"></div>
          <div className="chiller-fan"></div>
        </div>
        <div className="chiller-grill">
          <div className="chiller-coils"></div>
        </div>
        <div className="chiller-bottom">
          <div className="chiller-tank"></div>
          <div className="chiller-control-box">
            <div className="chiller-screen">
              <div className="chiller-screen-display"></div>
            </div>
            <div className="chiller-estop"></div>
          </div>
        </div>
        <div className="mach-code-overlay">{m.code}</div>
      </div>
    )
  }
  if (m.type === 'compressor') {
    return (
      <div className="mach-compressor">
        <div className="comp-left">
          <div className="comp-screen-box">
            <div className="comp-screen">
              <div className="comp-screen-display"></div>
            </div>
            <div className="comp-estop"></div>
          </div>
          <div className="comp-decor-dots"></div>
        </div>
        <div className="comp-right">
          <div className="comp-cutout">
            <div className="comp-internal-tank"></div>
            <div className="comp-internal-motor"></div>
            <div className="comp-internal-filter"></div>
          </div>
        </div>
        <div className="mach-code-overlay">{m.code}</div>
      </div>
    )
  }
  return (
    <>
      <div className="mach-door mach-door-left">
        <div className="mach-window"></div>
        <div className="mach-handle left-handle"></div>
      </div>
      <div className="mach-center-pillar">
        <div className="mach-brand-logo"></div>
        <div className="mach-control-screen">
          <div className="mach-screen-display"></div>
        </div>
        <div className="mach-status-indicator"></div>
        <div className="mach-estop-btn"></div>
      </div>
      <div className="mach-door mach-door-right">
        <div className="mach-window"></div>
        <div className="mach-handle right-handle"></div>
      </div>
      <div className="mach-code-overlay">{m.code}</div>
    </>
  )
}


export default function FloorMap({
  canManage,
  canExpand = false,
  roomsApi,
  machines = [],
  updateMachine,
  selectedMachineId,
  onSelectMachine,
  isFarm = false,
  /** Personas proyectadas en el plano (metros): { userId, name, roleLabel, isMe, x, y, accuracy } */
  livePeople = [],
  /** Calibración 2 puntos: clic en el plano para marcar el hito */
  calibrationPickMode = false,
  onCalibrationPick,
  calibrationLandmark = null,
  /** Estado real por máquina (rondas): { [machineId]: { cls, label } } — badge opcional */
  conditionByMachine = null,
  /** Set de ids de sala a resaltar (filtros dinámicos); las demás se atenúan. null/vacío = sin resaltar ninguna. */
  highlightRoomIds = null,
}) {
  const { rooms: allRooms, loading, error, createRoom, updateRoom, moveRoom, deleteRoom } = roomsApi
  // En granjas, los galpones "lógicos" (unidades para distribuir lotes: GALPON 201, 202…)
  // no se dibujan: los edificios reales ya están en el plano como glifos galpon_p1/p2
  // (piso 1 y piso 2). Así el módulo se ve como en la vida real y los datos no estorban.
  const visibles = isFarm ? allRooms.filter((r) => !/^GALPON/i.test(r.name || '')) : allRooms

  // Nivel que se está dibujando. La planta tiene entrepiso sobre el ala de
  // incubadoras, y sus salas viven aparte: se editan sin estorbar a las de
  // abajo, que quedan de guía para calcarlas.
  const [nivel, setNivel] = useState(1)
  const nivelDe = (r) => Number(r.nivel) || 1
  const rooms = useMemo(() => visibles.filter((r) => nivelDe(r) === nivel), [visibles, nivel])
  const debajo = useMemo(
    () => (nivel === 2 ? visibles.filter((r) => nivelDe(r) === 1) : []),
    [visibles, nivel]
  )

  const [drag, setDrag] = useState(null)
  const [mdrag, setMdrag] = useState(null) // drag de miniatura de máquina
  const [ddrag, setDdrag] = useState(null) // drag de puerta
  const [rotDrag, setRotDrag] = useState(null) // giro de sala con el tirador
  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [scale, setScale] = useState(SCALE_DEFAULT) // px por metro (zoom)
  const [expanded, setExpanded] = useState(false) // vista de plano completo (pantalla completa)
  // Dibujo de área de forma libre (polígono punto a punto)
  const [drawing, setDrawing] = useState(false)
  const [drawingPlenum, setDrawingPlenum] = useState(false) // el trazo en curso es un plenum, no un área
  const [plenumHost, setPlenumHost] = useState(null) // sala preseleccionada al abrir "Crear plenum" desde Editar sala
  const [draftPoints, setDraftPoints] = useState([])
  const [cursor, setCursor] = useState(null)
  const [pendingShape, setPendingShape] = useState(null)
  // Muro en edición: qué lado de qué sala tiene abierto el selector de altura
  const [wallEdit, setWallEdit] = useState(null) // { roomId, lado }
  const [wallHeightInput, setWallHeightInput] = useState('')
  const containerRef = useRef(null)
  const wrapRef = useRef(null)     // contenedor con scroll: permite desplazar el plano arrastrando
  const didPanRef = useRef(false)  // marca si el último gesto fue un desplazamiento (para no seleccionar sala al soltar)

  const selectedRoom = rooms.find((r) => r.id === selectedId) ?? null
  // Todos los componentes de la sala seleccionada (incluye fuera de servicio, para el detalle)
  const selectedRoomMachines = selectedRoom ? machines.filter((m) => m.room_id === selectedRoom.id) : []

  const { canvasW, canvasH } = useMemo(() => {
    // Cuenta tambien lo de abajo: si no, al pasar a un nivel 2 vacio el lienzo
    // se encogeria y no habria donde dibujar.
    const todas = rooms.concat(debajo)
    const maxX = todas.reduce((m, r) => Math.max(m, (r.pos_x + r.width) * scale), 0)
    const maxY = todas.reduce((m, r) => Math.max(m, (r.pos_y + r.height) * scale), 0)
    return { canvasW: Math.max(MIN_W, maxX + 80), canvasH: Math.max(MIN_H, maxY + 80) }
  }, [rooms, debajo, scale])

  // El canvas de granja también es PLANO (el "3D" son solo sombras/estilo), así que
  // las coordenadas se calculan igual que en planta. La antigua matemática isométrica
  // inversa desplazaba los puntos y dañaba el dibujo libre y el arrastre en granjas.
  const getMapCoords = (e) => {
    const rect = containerRef.current.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
  }

  // Ajusta el zoom para que todo el plano quepa en la pantalla ("ver completo")
  const fitToScreen = useCallback(() => {
    const w = rooms.reduce((m, r) => Math.max(m, r.pos_x + r.width), 0)
    const h = rooms.reduce((m, r) => Math.max(m, r.pos_y + r.height), 0)
    if (w <= 0 || h <= 0) return
    const availW = window.innerWidth - 40
    const availH = window.innerHeight - 150 // descuenta cabecera + controles
    setScale(clampScale(Math.min(availW / (w + 3), availH / (h + 3))))
  }, [rooms])

  const zoomIn = () => setScale((s) => clampScale(s * 1.2))
  const zoomOut = () => setScale((s) => clampScale(s / 1.2))

  const toggleExpand = () => {
    setExpanded((v) => {
      if (v) setScale(SCALE_DEFAULT) // al cerrar, vuelve al zoom base
      return !v
    })
  }

  // En modo pantalla completa: ajusta al abrir, re-ajusta al redimensionar y cierra con Escape
  useEffect(() => {
    if (!expanded) return
    fitToScreen()
    const onKey = (e) => { if (e.key === 'Escape') { setExpanded(false); setScale(SCALE_DEFAULT) } }
    const onResize = () => fitToScreen()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [expanded, fitToScreen])

  // Al abrir el selector de un muro, precarga el campo numérico con su valor
  // actual (si ya tenía una cifra fija) para poder ajustarlo sin retipear.
  useEffect(() => {
    if (!wallEdit) { setWallHeightInput(''); return }
    const v = selectedRoom?.wall_heights?.[wallEdit.lado]
    setWallHeightInput(typeof v === 'number' ? String(v) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallEdit])

  // Empuje con las flechas del teclado. Arrastrar con el ratón sirve para
  // llevar una sala de un sitio a otro, pero para dejarla a ras de su vecina
  // hace falta ir de a un paso: media pulsación de más y ya se pasó. Cada
  // flecha mueve medio metro, el mismo paso del arrastre; con Shift, diez
  // centímetros.
  useEffect(() => {
    if (!canManage || !selectedRoom) return
    const PASOS = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    }
    const onFlecha = (e) => {
      const paso = PASOS[e.key]
      if (!paso) return
      // Las flechas son de quien esté escribiendo, si hay alguien escribiendo.
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      const d = e.shiftKey ? 0.1 : 0.5
      moveRoom(
        selectedRoom.id,
        Math.max(0, round2(Number(selectedRoom.pos_x) + paso[0] * d)),
        Math.max(0, round2(Number(selectedRoom.pos_y) + paso[1] * d))
      )
    }
    window.addEventListener('keydown', onFlecha)
    return () => window.removeEventListener('keydown', onFlecha)
  }, [canManage, selectedRoom, moveRoom])

  const startDrag = (e, room) => {
    if (!canManage) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const coords = getMapCoords(e)
    setDrag({
      id: room.id,
      offsetX: coords.x - room.pos_x,
      offsetY: coords.y - room.pos_y,
      x: room.pos_x,
      y: room.pos_y,
      // De dónde salió, para poder redondear el DESPLAZAMIENTO y no la posición.
      x0: room.pos_x,
      y0: room.pos_y,
      moved: false,
    })
  }

  const onMove = (e) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const coords = getMapCoords(e)

    if (drawing) {
      // Previsualiza la línea hacia el cursor mientras se dibuja el área
      setCursor({
        x: Math.round(coords.x * 2) / 2,
        y: Math.round(coords.y * 2) / 2,
      })
      return
    }
    if (rotDrag) {
      const dx = e.clientX - rect.left - rotDrag.cx
      const dy = e.clientY - rect.top - rotDrag.cy
      const deg = snapDeg((Math.atan2(dy, dx) * 180) / Math.PI + 90)
      setRotDrag((d) => (d ? { ...d, rot: deg } : d))
      return
    }
    if (ddrag) {
      if (!canManage) return
      const room = rooms.find((r) => r.id === ddrag.roomId)
      if (!room) return
      const rawX = coords.x - room.pos_x - ddrag.offsetX
      const rawY = coords.y - room.pos_y - ddrag.offsetY
      const snappedX = Math.round(rawX * 5) / 5
      const snappedY = Math.round(rawY * 5) / 5
      // La puerta se mueve por el interior/perímetro de la sala
      const span = doorSpan(ddrag ?? {})
      const nx = Math.min(Math.max(0, snappedX), Math.max(0, room.width - span))
      const ny = Math.min(Math.max(0, snappedY), Math.max(0, room.height - span))
      setDdrag((d) =>
        d ? { ...d, x: nx, y: ny, moved: d.moved || Math.abs(nx - d.x) > 0.05 || Math.abs(ny - d.y) > 0.05 } : d
      )
      return
    }
    if (mdrag) {
      if (!canManage) return // los no administradores solo seleccionan
      // Arrastre de máquina: limitado al interior de su sala
      const room = rooms.find((r) => r.id === mdrag.roomId)
      if (!room) return
      const rawX = coords.x - room.pos_x - mdrag.offsetX
      const rawY = coords.y - room.pos_y - mdrag.offsetY
      // Snap to 0.2m grid during dragging
      const snappedX = Math.round(rawX * 5) / 5
      const snappedY = Math.round(rawY * 5) / 5
      // Limitar el arrastre para que la máquina no salga de la sala
      const nx = Math.min(Math.max(0, snappedX), Math.max(0, room.width - mdrag.w))
      const ny = Math.min(Math.max(0, snappedY), Math.max(0, room.height - mdrag.h))
      setMdrag((d) =>
        d ? { ...d, x: nx, y: ny, moved: d.moved || Math.abs(nx - d.x) > 0.05 || Math.abs(ny - d.y) > 0.05 } : d
      )
      return
    }
    if (!drag) return
    // La sala se mueve de medio metro en medio metro. Antes iba de metro en
    // metro —era el único elemento del plano así; las máquinas y las puertas
    // van a 0,2 y el trazado de áreas a 0,5— y había ubicaciones que
    // sencillamente no se podían alcanzar.
    //
    // Se redondea el DESPLAZAMIENTO, no la posición: las salas están en
    // coordenadas medidas en sitio (9,73 · 41,09 · 70,82) y redondear la
    // posición las arrancaría de esa retícula y descuadraría el plano entero.
    // Así una sala en 9,73 pasa a 10,23, que es moverla medio metro de verdad.
    const dx = Math.round((coords.x - drag.offsetX - drag.x0) * 2) / 2
    const dy = Math.round((coords.y - drag.offsetY - drag.y0) * 2) / 2
    const nx = Math.max(0, round2(drag.x0 + dx))
    const ny = Math.max(0, round2(drag.y0 + dy))
    setDrag((d) => (d ? { ...d, x: nx, y: ny, moved: d.moved || nx !== d.x || ny !== d.y } : d))
  }

  const startMachineDrag = (e, machine, room) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const coords = getMapCoords(e)
    const { w, h } = machineSize(machine)
    setMdrag({
      id: machine.id,
      roomId: room.id,
      w,
      h,
      offsetX: coords.x - room.pos_x - (Number(machine.pos_x) || 0),
      offsetY: coords.y - room.pos_y - (Number(machine.pos_y) || 0),
      x: Number(machine.pos_x) || 0,
      y: Number(machine.pos_y) || 0,
      moved: false,
    })
  }

  const endMachineDrag = (e, machine) => {
    e.stopPropagation()
    if (!mdrag) return
    if (mdrag.moved && canManage) {
      updateMachine?.(machine.id, {
        pos_x: Math.round(mdrag.x * 5) / 5,
        pos_y: Math.round(mdrag.y * 5) / 5,
      })
    } else {
      onSelectMachine?.(machine.id === selectedMachineId ? null : machine.id)
    }
    setMdrag(null)
  }

  const endDrag = (room) => {
    if (!drag) return
    if (drag.moved) {
      moveRoom(room.id, drag.x, drag.y)
    } else {
      setSelectedId(room.id)
    }
    setDrag(null)
  }

  // ── Puertas ────────────────────────────────────────────────
  const addDoor = (type) => {
    if (!selectedRoom) return
    // Nace centrada en la pared superior, y con su muro ya escrito: si se
    // quedara sin `lado`, el 3D volvería a deducirlo por distancia y una
    // re-medida de la sala podría cambiársela de sitio.
    const ancho = type === 'window' ? 1 : DOOR_SIZE
    const door = {
      id: newId(),
      type,
      x: Math.max(0, (Number(selectedRoom.width) - ancho) / 2),
      y: 0,
      lado: 'arriba',
      ...(type === 'window' ? { w: 1 } : null),
    }
    updateRoom(selectedRoom.id, { doors: [...(selectedRoom.doors ?? []), door] })
  }

  const removeDoor = (room, doorId) => {
    updateRoom(room.id, { doors: (room.doors ?? []).filter((d) => d.id !== doorId) })
  }

  const startDoorDrag = (e, room, door) => {
    if (!canManage) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const coords = getMapCoords(e)
    setDdrag({
      doorId: door.id,
      roomId: room.id,
      offsetX: coords.x - room.pos_x - (Number(door.x) || 0),
      offsetY: coords.y - room.pos_y - (Number(door.y) || 0),
      x: Number(door.x) || 0,
      y: Number(door.y) || 0,
      moved: false,
    })
  }

  const endDoorDrag = (e, room, door) => {
    e.stopPropagation()
    if (!ddrag) return
    if (ddrag.moved && canManage) {
      const doors = (room.doors ?? []).map((d) => {
        if (d.id !== door.id) return d
        const movida = { ...d, x: Math.round(ddrag.x * 5) / 5, y: Math.round(ddrag.y * 5) / 5 }
        // Donde el usuario la suelta es el muro que queda escrito.
        return { ...movida, lado: ladoDeVano(room, movida) }
      })
      updateRoom(room.id, { doors })
    }
    setDdrag(null)
  }

  const rotateDoor = (room, door) => {
    const rot = ((Number(door.rot) || 0) + 90) % 360
    const doors = (room.doors ?? []).map((d) => (d.id === door.id ? { ...d, rot } : d))
    updateRoom(room.id, { doors })
  }

  // ── Altura por muro ─────────────────────────────────────────
  // null/ausente = automático (la regla de siempre, por tipo de sala y
  // fachada); 'techo' = fuerza el muro hasta la cubierta aunque la regla
  // automática no lo haría; un número = altura fija en metros, sin sobremuro.
  const setWallHeight = (room, lado, value) => {
    const wh = { ...(room.wall_heights || {}) }
    if (value == null) delete wh[lado]
    else wh[lado] = value
    updateRoom(room.id, { wall_heights: Object.keys(wh).length ? wh : null })
  }

  // ── Rotación de salas y máquinas ───────────────────────────
  const startRotate = (e, room) => {
    if (!canManage) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setRotDrag({
      roomId: room.id,
      cx: (Number(room.pos_x) + Number(room.width) / 2) * scale,
      cy: (Number(room.pos_y) + Number(room.height) / 2) * scale,
      rot: Number(room.rotation) || 0,
    })
  }

  const endRotate = (room) => {
    if (!rotDrag) return
    updateRoom(room.id, { rotation: rotDrag.rot })
    setRotDrag(null)
  }

  const rotateMachine = (m, delta) => {
    const rot = (((Number(m.rotation) || 0) + delta) % 360 + 360) % 360
    updateMachine?.(m.id, { rotation: rot })
  }

  // ── Dibujo de área de forma libre ──────────────────────────
  const onCanvasPointerDown = (e) => {
    if (!drawing) return
    const coords = getMapCoords(e)
    setDraftPoints((pts) => [
      ...pts,
      {
        x: Math.round(coords.x * 2) / 2,
        y: Math.round(coords.y * 2) / 2,
      },
    ])
  }

  // Observadores: arrastrar con el mouse para desplazar el plano (además del zoom y el scroll nativo).
  // En pantalla completa esto hace el plano "navegable" como un mapa.
  const startPan = (e) => {
    const wrap = wrapRef.current
    if (!wrap) return
    didPanRef.current = false
    const start = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop }
    const move = (ev) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPanRef.current = true
      wrap.scrollLeft = start.left - dx
      wrap.scrollTop = start.top - dy
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      containerRef.current?.classList.remove('panning')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    containerRef.current?.classList.add('panning')
  }

  const handleMapPointerDown = (e) => {
    onCanvasPointerDown(e) // dibujo de área de forma libre (solo activo en modo edición)
    if (canManage || drawing) return
    if (e.pointerType && e.pointerType !== 'mouse') return // en táctil basta el scroll nativo
    startPan(e)
  }

  const undoPoint = () => setDraftPoints((pts) => pts.slice(0, -1))

  const cancelDraw = () => {
    setDrawing(false)
    setDrawingPlenum(false)
    setPlenumHost(null)
    setDraftPoints([])
    setCursor(null)
  }

  // Atajo desde "Editar sala": arranca el dibujo de plenum con esta sala ya
  // elegida como anfitriona, para no tener que buscarla de nuevo en el select.
  const startPlenumFor = (room) => {
    setPlenumHost(room.id)
    setDrawing(true)
    setDrawingPlenum(true)
    setEditing(false)
  }

  const closeArea = () => {
    if (draftPoints.length < 3) return
    const xs = draftPoints.map((p) => p.x)
    const ys = draftPoints.map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const width = Math.max(1, Math.max(...xs) - minX)
    const height = Math.max(1, Math.max(...ys) - minY)
    const points = draftPoints.map((p) => ({ x: +(p.x - minX).toFixed(2), y: +(p.y - minY).toFixed(2) }))
    setPendingShape({ pos_x: minX, pos_y: minY, width, height, points })
    setDrawing(false)
    setDraftPoints([])
    setCursor(null)
  }

  const onDelete = async () => {
    if (!selectedRoom) return
    if (!window.confirm(`¿Eliminar el ${isFarm ? 'módulo' : 'sala'} "${selectedRoom.name}"? Esta acción no se puede deshacer.`)) return
    const { error: err } = await deleteRoom(selectedRoom.id)
    if (!err) setSelectedId(null)
  }

  return (
    <div className={`floor-map-wrap${expanded ? ' expanded' : ''}`} ref={wrapRef}>
      <div className="floor-map-toolbar">
        <span className="hint" style={{ margin: 0 }}>
          {canManage 
            ? (isFarm ? 'Arrastra los módulos para reubicarlos en el plano.' : 'Arrastra las salas para reubicarlas en el plano.') 
            : (isFarm ? 'Vista de solo lectura del plano de granja.' : 'Vista de solo lectura del plano de planta.')}
        </span>
        <div className="floor-map-tools">
          {!isFarm && (
            // La planta tiene entrepiso sobre el ala de incubadoras. Se dibuja
            // un nivel a la vez; el de abajo queda de calco.
            <div className="zoom-controls" role="group" aria-label="Nivel del plano">
              <button
                className={`chip ${nivel === 1 ? '' : 'ghost'}`}
                onClick={() => { setNivel(1); setSelectedId(null) }}
                title="Planta baja"
              >
                Nivel 1
              </button>
              <button
                className={`chip ${nivel === 2 ? '' : 'ghost'}`}
                onClick={() => { setNivel(2); setSelectedId(null) }}
                title="Entrepiso sobre el ala de incubadoras"
              >
                Nivel 2
              </button>
            </div>
          )}
          <div className="zoom-controls" role="group" aria-label="Zoom del plano">
            <button className="chip ghost" onClick={zoomOut} title="Alejar" aria-label="Alejar">−</button>
            <button className="chip ghost" onClick={fitToScreen} title="Ajustar a la pantalla">Ajustar</button>
            <button className="chip ghost" onClick={zoomIn} title="Acercar" aria-label="Acercar">+</button>
          </div>
          {canExpand && (
            <button className="chip ghost" onClick={toggleExpand} title={expanded ? 'Cerrar vista completa' : 'Ver el plano completo'}>
              {expanded ? '✕ Cerrar' : '⤢ Ver completo'}
            </button>
          )}
          {canManage && !showForm && !pendingShape && (
            drawing ? (
              <div className="draw-controls" role="group" aria-label="Dibujar área">
                <span className="hint" style={{ margin: 0 }}>
                  {drawingPlenum ? 'Toca las esquinas del plenum…' : 'Toca las esquinas del área…'}
                </span>
                <button className="chip ghost" onClick={undoPoint} disabled={draftPoints.length === 0}>↶ Punto</button>
                <button className="chip ghost" onClick={cancelDraw}>✕ Cancelar</button>
                <button className="chip primary" onClick={closeArea} disabled={draftPoints.length < 3}>✓ Cerrar área</button>
              </div>
            ) : (
              <>
                <button
                  className="chip ghost"
                  onClick={() => { setDrawing(true); setDrawingPlenum(false); setEditing(false) }}
                  title={isFarm ? "Dibujar un módulo con forma libre" : "Dibujar un área con forma libre"}
                >
                  ✏️ Dibujar área
                </button>
                {!isFarm && (
                  <button
                    className="chip ghost"
                    onClick={() => { setPlenumHost(null); setDrawing(true); setDrawingPlenum(true); setEditing(false) }}
                    title="Dibujar un plenum de forma libre, colgado de una sala"
                  >
                    🧩 Crear plenum
                  </button>
                )}
                <button className="chip ghost" onClick={() => setShowForm(true)}>
                  {isFarm ? '+ Nuevo módulo' : '+ Nueva sala'}
                </button>
              </>
            )
          )}
        </div>
      </div>

      {showForm && <NewRoomForm onCreate={(vals) => createRoom({ ...vals, nivel })} onCancel={() => setShowForm(false)} isFarm={isFarm} />}
      {pendingShape && (
        drawingPlenum ? (
          <PlenumRoomForm
            hostRooms={rooms}
            initialHostId={plenumHost}
            onCreate={(vals) => createRoom({ ...vals, ...pendingShape, nivel })}
            onCancel={() => { setPendingShape(null); setDrawingPlenum(false); setPlenumHost(null) }}
          />
        ) : (
          <NewRoomForm
            heading="Nueva área de forma libre"
            defaultType={isFarm ? 'road' : 'parking'}
            onCreate={(vals) => createRoom({ ...vals, ...pendingShape, nivel })}
            onCancel={() => setPendingShape(null)}
            isFarm={isFarm}
          />
        )
      )}
      {!isFarm && nivel === 2 && rooms.length === 0 && (
        <p className="hint" style={{ marginTop: 8 }}>
          El entrepiso está vacío. Dibuja aquí sus salas: el plano de abajo queda
          de calco, y lo que agregues vive solo en este nivel.
        </p>
      )}
      {error && <p className="msg error">{error}</p>}

      {loading ? (
        <p className="hint">{isFarm ? 'Cargando módulos…' : 'Cargando salas…'}</p>
      ) : rooms.length === 0 && !showForm ? (
        <p className="hint">{isFarm ? 'Esta granja todavía no tiene módulos en el mapa.' : 'Esta planta todavía no tiene salas en el mapa.'}</p>
      ) : (
        <div
          className={`floor-map${drawing ? ' drawing' : ''}${isFarm ? ' is-farm-3d' : ''}${!canManage ? ' pannable' : ''}${livePeople?.length ? ' has-live-people' : ''}${calibrationPickMode ? ' geo-pick' : ''}`}
          ref={containerRef}
          style={{ width: canvasW, height: canvasH }}
          onPointerMove={onMove}
          onPointerDown={(e) => {
            if (calibrationPickMode && onCalibrationPick) {
              e.stopPropagation()
              const coords = getMapCoords(e)
              const x = Math.round(coords.x * 10) / 10
              const y = Math.round(coords.y * 10) / 10
              onCalibrationPick({ x: Math.max(0, x), y: Math.max(0, y) })
              return
            }
            handleMapPointerDown(e)
          }}
        >
          {debajo.map((room) => (
            // Calco del piso de abajo: solo el contorno, sin nombre ni asas, y
            // sin capturar el raton para que no estorbe al dibujar arriba.
            <div
              key={`calco-${room.id}`}
              className="room-calco"
              style={{
                left: room.pos_x * scale,
                top: room.pos_y * scale,
                width: (Number(room.width) || 0) * scale,
                height: (Number(room.height) || 0) * scale,
                transform: `rotate(${Number(room.rotation) || 0}deg)`,
              }}
            />
          ))}
          {rooms.map((room) => {
            const isDragging = drag?.id === room.id
            const isRotating = rotDrag?.roomId === room.id
            const x = isDragging ? drag.x : room.pos_x
            const y = isDragging ? drag.y : room.pos_y
            const W = Number(room.width) || 0
            const H = Number(room.height) || 0
            const rot = isRotating ? rotDrag.rot : Number(room.rotation) || 0
            const pts = isPoly(room) ? room.points : null
            const selected = room.id === selectedId
            const editableRoom = canManage && editing && selected
            const roomMachines = machines.filter((m) => m.room_id === room.id && m.status !== 'decommissioned')
            const colorStyle = room.color
              ? { '--room-tint': hexToRgba(room.color, 0.32), '--room-edge': room.color }
              : null

            return (
              <div
                key={room.id}
                className={`room-group${isDragging ? ' dragging' : ''}${isRotating ? ' rotating' : ''}${highlightRoomIds && highlightRoomIds.size > 0 ? (highlightRoomIds.has(room.id) ? ' room-highlighted' : ' room-dimmed') : ''}`}
                style={{ left: x * scale, top: y * scale, width: W * scale, height: H * scale, transform: `rotate(${rot}deg)` }}
              >
                <div
                  className={`room-box room-${room.type}${selected ? ' selected' : ''}${isDragging ? ' dragging' : ''}${pts ? ' poly' : ''}`}
                  style={{ ...colorStyle, ...(pts ? { clipPath: polyClip(pts, W, H) } : null) }}
                  onPointerDown={(e) => startDrag(e, room)}
                  onPointerUp={() => endDrag(room)}
                  onPointerCancel={() => setDrag(null)}
                  onClick={() => {
                    if (canManage) return
                    if (didPanRef.current) { didPanRef.current = false; return } // se estaba desplazando, no seleccionar
                    setSelectedId(room.id)
                  }}
                >
                  {pts && (
                    <svg className="room-poly-outline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                      <polygon points={polyStr(pts)} vectorEffect="non-scaling-stroke" />
                    </svg>
                  )}
                  {/* El nombre corre a lo largo del lado más extenso de la sala (vertical si es más alta que ancha) */}
                  <span
                    className={`room-name${H > W ? ' vertical' : ''}`}
                    style={{ maxWidth: Math.max(24, (H > W ? H : W) * scale - 12) }}
                  >
                    {room.name}
                  </span>
                  <span className="room-code">{room.code}</span>
                </div>

                {/* Máquinas de la sala (giran junto con ella) */}
                {roomMachines.map((m) => {
                  const isMdrag = mdrag?.id === m.id
                  const { w: mW, h: mH } = machineSize(m)
                  const mx = isMdrag ? mdrag.x : Math.round((Number(m.pos_x) || 0) * 5) / 5
                  const my = isMdrag ? mdrag.y : Math.round((Number(m.pos_y) || 0) * 5) / 5
                  const mSelected = m.id === selectedMachineId
                  return (
                    <Fragment key={m.id}>
                      <div
                        className={`machine-mini st-${m.status}${mSelected ? ' selected' : ''}${isMdrag ? ' dragging' : ''}${(m.brand === 'galpon_p1' || m.brand === 'galpon_p2') ? ' galpon-wrapper' : ''}`}
                        style={{
                          left: mx * scale,
                          top: my * scale,
                          width: mW * scale,
                          height: mH * scale,
                          transform: `rotate(${Number(m.rotation) || 0}deg)`,
                        }}
                        title={`${m.name} (${m.code})`}
                        onPointerDown={(e) => startMachineDrag(e, m, room)}
                        onPointerUp={(e) => endMachineDrag(e, m)}
                        onPointerCancel={() => setMdrag(null)}
                      >
                        <MachineGlyph m={m} />
                        {conditionByMachine?.[m.id] && (
                          <span
                            className={`mach-cond-badge cond-${conditionByMachine[m.id].cls}`}
                            title={conditionByMachine[m.id].label}
                          />
                        )}
                      </div>
                      {/* Controles de giro fuera de la miniatura (que recorta su contenido) */}
                      {canManage && mSelected && (
                        <div
                          className="obj-rotate"
                          style={{ left: (mx + mW / 2) * scale, top: my * scale }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <button title="Girar −15°" onClick={(e) => { e.stopPropagation(); rotateMachine(m, -15) }}>↺</button>
                          <button title="Girar +15°" onClick={(e) => { e.stopPropagation(); rotateMachine(m, 15) }}>↻</button>
                        </div>
                      )}
                    </Fragment>
                  )
                })}

                {/* Puertas de la sala */}
                {(room.doors ?? []).map((d) => {
                  const isDdrag = ddrag?.doorId === d.id
                  const dx = isDdrag ? ddrag.x : Number(d.x) || 0
                  const dy = isDdrag ? ddrag.y : Number(d.y) || 0
                  return (
                    <div
                      key={d.id}
                      className={`door door-${d.type}${isDdrag ? ' dragging' : ''}${editableRoom ? ' editable' : ''}`}
                      style={{
                        left: dx * scale,
                        top: dy * scale,
                        width: doorSpan(d) * scale,
                        height: doorSpan(d) * scale,
                        transform: `rotate(${Number(d.rot) || 0}deg)`,
                      }}
                      title={DOOR_LABEL[d.type] ?? 'Puerta normal'}
                      onPointerDown={(e) => editableRoom && startDoorDrag(e, room, d)}
                      onPointerUp={(e) => editableRoom && endDoorDrag(e, room, d)}
                      onPointerCancel={() => setDdrag(null)}
                    >
                      <span className="door-glyph" aria-hidden="true" />
                      {editableRoom && (
                        <>
                          <button
                            className="door-rot"
                            title="Girar puerta 90°"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); rotateDoor(room, d) }}
                          >
                            ⟳
                          </button>
                          <button
                            className="door-del"
                            title="Eliminar puerta"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); removeDoor(room, d.id) }}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Muros seleccionables: cada lado se puede fijar en automático,
                    hasta la cubierta, o una altura específica en metros. */}
                {!isFarm && editableRoom && LADOS.map((lado) => (
                  <div
                    key={lado}
                    className={`room-wall room-wall-${lado}${room.wall_heights?.[lado] != null ? ' overridden' : ''}${wallEdit?.roomId === room.id && wallEdit?.lado === lado ? ' active' : ''}`}
                    title={`Muro ${lado}: ${wallHeightLabel(room.wall_heights?.[lado])}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setWallEdit({ roomId: room.id, lado }) }}
                  />
                ))}

                {/* Tirador de giro de la sala */}
                {canManage && selected && !isDragging && !drawing && (
                  <div
                    className="room-rotate-handle"
                    title={isFarm ? "Girar el módulo (arrastra)" : "Girar la sala (arrastra)"}
                    onPointerDown={(e) => startRotate(e, room)}
                    onPointerUp={() => endRotate(room)}
                    onPointerCancel={() => setRotDrag(null)}
                  />
                )}
              </div>
            )
          })}

          {/* Trazo en curso del área de forma libre */}
          {drawing && (
            <svg className="draw-overlay" width={canvasW} height={canvasH} aria-hidden="true">
              {draftPoints.length > 0 && (
                <polyline
                  className="draw-line"
                  points={
                    draftPoints.map((p) => `${p.x * scale},${p.y * scale}`).join(' ') +
                    (cursor ? ` ${cursor.x * scale},${cursor.y * scale}` : '')
                  }
                />
              )}
              {draftPoints.length >= 2 && cursor && (
                <line
                  className="draw-close"
                  x1={draftPoints[0].x * scale}
                  y1={draftPoints[0].y * scale}
                  x2={cursor.x * scale}
                  y2={cursor.y * scale}
                />
              )}
              {draftPoints.map((p, i) => (
                <circle key={i} className="draw-pt" cx={p.x * scale} cy={p.y * scale} r="4" />
              ))}
            </svg>
          )}

          {/* Hito de calibración GPS (2 puntos) */}
          {calibrationLandmark && (
            <div
              className="geo-landmark-marker"
              style={{
                left: calibrationLandmark.x * scale,
                top: calibrationLandmark.y * scale,
              }}
              title={`Hito calibración (${calibrationLandmark.x} m, ${calibrationLandmark.y} m)`}
            >
              <span className="geo-landmark-cross" aria-hidden="true" />
              <span className="geo-landmark-label">Hito</span>
            </div>
          )}

          {/* Personal en el recinto (GPS → plano, tiempo real) */}
          {(livePeople || []).map((p) => (
            <div
              key={p.userId}
              className={`live-person-dot${p.isMe ? ' me' : ''}`}
              style={{
                left: p.x * scale,
                top: p.y * scale,
              }}
              title={`${p.name}${p.roleLabel ? ` · ${p.roleLabel}` : ''}${
                p.accuracy != null ? ` · ±${Math.round(p.accuracy)} m` : ''
              }`}
            >
              <span className="live-person-pulse" aria-hidden="true" />
              <span className="live-person-core" aria-hidden="true" />
              <span className="live-person-label">{p.isMe ? 'Usted' : (p.name || '').split(/\s+/)[0]}</span>
            </div>
          ))}
        </div>
      )}

      {calibrationPickMode && (
        <p className="msg ok" style={{ marginTop: 8 }}>
          Modo calibración: toque en el plano el segundo hito (esquina de sala, portón, etc.).
        </p>
      )}

      {(livePeople || []).length > 0 && (
        <p className="hint" style={{ margin: '8px 0 0' }}>
          <span className="pill live" style={{ marginRight: 8 }}>
            <span className="dot" />
            {(livePeople || []).length} en el plano
          </span>
          Puntos en vivo por geolocalización (solo quienes comparten ubicación y están dentro del
          recinto calibrado).
        </p>
      )}

      {selectedRoom && (
        <>
          <div className="room-detail">
            <div style={{ flex: 1, minWidth: 220 }}>
              <strong>{selectedRoom.name}</strong>
              <span className="hint" style={{ margin: '2px 0 0', display: 'block' }}>
                {selectedRoom.code} · {typeLabel(selectedRoom.type)}{isFarm ? ' (granja)' : ''} · {selectedRoom.width}m × {selectedRoom.height}m
                {Number(selectedRoom.rotation) ? ` · girada ${Math.round(Number(selectedRoom.rotation))}°` : ''}
                {` · ${(selectedRoom.doors ?? []).length} puerta(s)`}
                {` · ${selectedRoomMachines.length} ${isFarm ? 'componente(s)' : 'máquina(s)'}`}
              </span>
              {canManage && (
                <span className="hint" style={{ margin: '2px 0 0', display: 'block', opacity: 0.75 }}>
                  En {selectedRoom.pos_x} m, {selectedRoom.pos_y} m · flechas para empujar 0,5 m — con Shift, 0,1 m
                </span>
              )}
            </div>
            <div className="actions row" style={{ marginTop: 0 }}>
              {canManage && (
                <>
                  <button className="ghost" onClick={() => setEditing(!editing)}>
                    {editing ? 'Cerrar edición' : (isFarm ? 'Editar módulo' : 'Editar sala')}
                  </button>
                  <button className="ghost danger" onClick={onDelete}>
                    {isFarm ? 'Eliminar módulo' : 'Eliminar sala'}
                  </button>
                </>
              )}
              <button className="ghost" onClick={() => { setSelectedId(null); setEditing(false); setWallEdit(null) }}>
                Cerrar
              </button>
            </div>
          </div>

          {/* Componentes de la sala: clic en uno lo selecciona en el plano y en el listado de equipos */}
          {selectedRoomMachines.length > 0 && (
            <div className="room-detail-components">
              {selectedRoomMachines.map((m) => {
                const st = MACHINE_STATUS[m.status] ?? { label: m.status, cls: '' }
                return (
                  <button
                    key={m.id}
                    className={`room-comp${m.id === selectedMachineId ? ' active' : ''}`}
                    onClick={() => onSelectMachine?.(m.id === selectedMachineId ? null : m.id)}
                    title="Ver este equipo en el plano y en el listado"
                  >
                    <strong>{m.name}</strong>
                    <span>{m.code} · {MACHINE_TYPE_LABELS[m.type] ?? m.type}{m.capacity_eggs ? ` · ${Number(m.capacity_eggs).toLocaleString('es-CO')} huevos` : ''}</span>
                    <span className={`pill status ${st.cls}`}>{st.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {editing && canManage && (
            <EditRoomForm
              key={selectedRoom.id}
              room={selectedRoom}
              onSave={updateRoom}
              onCancel={() => setEditing(false)}
              onAddDoor={addDoor}
              onStartPlenum={startPlenumFor}
              isFarm={isFarm}
            />
          )}
          {editing && canManage && wallEdit && wallEdit.roomId === selectedRoom.id && (
            <div className="inline-form compact">
              <p className="component-title" style={{ margin: '0 0 4px' }}>
                Muro «{wallEdit.lado}» de {selectedRoom.name}
              </p>
              <p className="hint" style={{ margin: '0 0 10px' }}>
                Ahora: {wallHeightLabel(selectedRoom.wall_heights?.[wallEdit.lado])}
              </p>
              <div className="actions row" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                <button className="chip ghost" onClick={() => setWallHeight(selectedRoom, wallEdit.lado, null)}>
                  Automático
                </button>
                <button className="chip ghost" onClick={() => setWallHeight(selectedRoom, wallEdit.lado, 'techo')}>
                  Hasta la cubierta
                </button>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number" min="0.5" step="0.1" placeholder="metros"
                    value={wallHeightInput}
                    onChange={(e) => setWallHeightInput(e.target.value)}
                    style={{ width: 90 }}
                  />
                  <button
                    className="chip primary"
                    disabled={!wallHeightInput}
                    onClick={() => { setWallHeight(selectedRoom, wallEdit.lado, Number(wallHeightInput)); setWallHeightInput('') }}
                  >
                    Aplicar
                  </button>
                </span>
              </div>
              <div className="actions row">
                <button className="ghost" onClick={() => setWallEdit(null)}>Cerrar</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
