/**
 * =============================================================================
 * ARCHIVO: src/components/SupervisionPanel.jsx
 * PROPÃ“SITO: Componente UI Â«SupervisionPanelÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useMachineChecks, currentSlot } from '../features/maintenance/hooks/useMachineChecks'
import { useLoads } from '../features/production/hooks/useLoads'
import { useHatches } from '../hooks/useHatches'
import { useEggReports } from '../features/production/hooks/useEggReports'
import { useNotifications } from '../shared/hooks/useNotifications'
import ListControls, { useListControls } from './ListControls'
import { IncidentReportView, WorkOrdersView, ShiftActivitiesView, MerchandiseView } from './ShiftOpsPanels'
import { conditionOf } from '../lib/machineCondition'
import { compressImage } from '../lib/image'
import { canOperatePlantRounds, canSupervisePlant } from '../lib/roles'
import {
  READING_COLUMNS,
  readingFieldsFor,
  readingsFromCheck,
} from '../lib/machineReadings'

// Incubadoras (cargue)
const SETTER_TYPES = ['setter', 'combo']
// Transferencia y nacimiento operan por SALÃ“N de nacedoras (rooms.type = hatching)
const HATCHING_ROOM_TYPE = 'hatching'
// Estimado de pollitos a nacer sobre el huevo incubable (ajustable)
const HATCH_RATE = 0.82
// DÃ­a 21 del ciclo (504 h): listo para nacimiento
const HATCH_READY_HOURS = 504
// MÃ­nimo de dÃ­as de incubaciÃ³n para habilitar la transferencia de una mÃ¡quina
// (evita transferir por error una incubadora reciÃ©n cargada)
const MIN_TRANSFER_DAYS = 10
const MODE_LABEL = { single: 'Sencilla (1 salÃ³n)', double: 'Doble (2 salones)' }

function hatchBadge(ageHours) {
  if (ageHours == null) return null
  if (ageHours >= HATCH_READY_HOURS) return { text: 'âœ… Listo para nacimiento', cls: 'pill status ok' }
  const daysLeft = Math.max(0, Math.ceil((HATCH_READY_HOURS - ageHours) / 24))
  return { text: `â³ Faltan ~${daysLeft} d para el dÃ­a 21`, cls: 'pill status idle' }
}

// CronÃ³metro: "Xh YYm" transcurridos entre dos instantes (o hasta ahora)
function elapsedLabel(fromIso, toMs) {
  if (!fromIso) return 'â€”'
  const ms = (toMs ?? Date.now()) - new Date(fromIso).getTime()
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}
// Valor para <input type="datetime-local"> a partir de ahora (hora local)
const nowLocalInput = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const fmtDateTimeFull = (iso) =>
  iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'â€”'

/* â”€â”€ Hitos de ciclo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function cycleAge(cycleStartAt) {
  if (!cycleStartAt) return null
  const diffMs = Date.now() - new Date(cycleStartAt).getTime()
  if (diffMs < 0) return null
  const hours = diffMs / 3_600_000
  const d = Math.floor(hours / 24)
  const h = Math.floor(hours % 24)
  return { hours, label: `${d}d ${h}h` }
}
function milestoneBadge(ageHours) {
  if (ageHours == null) return null
  if (ageHours >= 432) return { text: 'âœ… Listo para transferencia', cls: 'pill status ok' }
  if (ageHours >= 36 && ageHours < 60) return { text: 'âš ï¸ CalibraciÃ³n obligatoria', cls: 'pill status warn' }
  return null
}

const MACHINE_TYPE_LABEL = {
  setter: 'Incubadora',
  hatcher: 'Nacedora',
  combo: 'Combinada',
  chiller: 'Chiller',
  compressor: 'Compresor',
  other: 'Otro equipo',
}

const ALARM_TYPES = [
  'ðŸŒ¡ï¸ Temperatura fuera de rango',
  'ðŸ’§ Humedad fuera de rango',
  'ðŸ”„ Falla de volteo',
  'âš¡ Falla elÃ©ctrica',
  'ðŸ”Š Ruido anormal',
  'ðŸšª Puerta / sello',
  'â„ï¸ RefrigeraciÃ³n',
  'âš ï¸ Otra novedad',
]

const SHIFT_LABEL = { 1: 'T1 (06â€“14)', 2: 'T2 (14â€“22)', 3: 'T3 (22â€“06)' }

// La ronda del turno solo cubre salas de incubadoras, nacedoras y cuartos tÃ©cnicos
const ROUND_ROOM_TYPES = ['incubation', 'hatching', 'technical']

const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

/* â”€â”€ Miniatura con URL firmada â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function PhotoThumb({ path, getPhotoUrl }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    getPhotoUrl(path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [path, getPhotoUrl])

  if (!path) return <div className="check-thumb placeholder">ðŸ”Œ</div>
  if (!url) return <div className="check-thumb placeholder">ðŸ“·</div>
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Ver foto completa">
      <img className="check-thumb" src={url} alt="Foto de la interfaz" loading="lazy" />
    </a>
  )
}

/* â”€â”€ Captura directa: cÃ¡mara â†’ foto â†’ âœ“ / âœ— â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function MachineCapture({ machine, mc, onDone }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [askAlarm, setAskAlarm] = useState(false)
  const [alarmType, setAlarmType] = useState('')
  const [alarmNote, setAlarmNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [err, setErr] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)
  const openedRef = useRef(false)

  /* â”€â”€ Lecturas de pantalla del FORMATO CONTROL DIARIO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   * Opcionales: la ronda vale con la foto sola. Vienen prellenadas con la Ãºltima
   * toma de esa misma mÃ¡quina para que el turnero solo corrija lo que se moviÃ³.
   */
  const campos = readingFieldsFor(machine.type)
  const ultima = useMemo(
    () =>
      mc.checks.find(
        (c) => c.machine_id === machine.id && READING_COLUMNS.some((k) => c[k] != null)
      ),
    [mc.checks, machine.id]
  )
  const [readings, setReadings] = useState(() => readingsFromCheck(ultima))
  const setReading = (key, value) => setReadings((prev) => ({ ...prev, [key]: value }))

  // Abrir la cÃ¡mara al montar (reintento corto si el input aÃºn no estÃ¡ listo)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!openedRef.current) {
        openedRef.current = true
        try {
          inputRef.current?.click()
        } catch { /* */ }
      }
    }, 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const retake = () => {
    setFile(null)
    setPreview(null)
    setErr(null)
    setStatusMsg(null)
    setAskAlarm(false)
    setAlarmType('')
    setAlarmNote('')
    // reset input para permitir misma foto de nuevo
    if (inputRef.current) inputRef.current.value = ''
    setTimeout(() => {
      try {
        inputRef.current?.click()
      } catch { /* */ }
    }, 50)
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      // CancelÃ³ la cÃ¡mara: no cerrar de golpe â€” ofrecer reintentar
      setErr(null)
      setStatusMsg('No se tomÃ³ foto. Pulsa Â«Tomar fotoÂ» para abrir la cÃ¡mara.')
      return
    }
    if (!f.size) {
      setErr('La cÃ¡mara entregÃ³ un archivo vacÃ­o. Intenta de nuevo.')
      return
    }
    setCompressing(true)
    setErr(null)
    setStatusMsg(null)
    try {
      const compressed = await compressImage(f, 1280, 0.7)
      if (!compressed || compressed.size === 0) {
        setErr('No se pudo procesar la imagen. Vuelve a tomar la foto.')
        setCompressing(false)
        return
      }
      setFile(compressed)
    } catch {
      // Usar original si falla compresiÃ³n
      setFile(f)
    }
    setCompressing(false)
  }

  const save = async (condition, notes) => {
    if (!file || file.size === 0) {
      setErr('Falta la foto. TÃ³mala de nuevo antes de confirmar.')
      return
    }
    setBusy(true)
    setErr(null)
    setStatusMsg('Guardando fotoâ€¦')
    try {
      const { error, offline } = await mc.createCheck({
        plantId: machine.plant_id,
        machineId: machine.id,
        file,
        condition,
        notes,
        readings,
      })
      if (error) {
        setErr(error)
        setStatusMsg(null)
        setBusy(false)
        return
      }
      if (offline) {
        setStatusMsg('Guardado en el dispositivo Â· se subirÃ¡ al sincronizar')
        // breve feedback y cerrar
        setTimeout(() => onDone(true), 450)
      } else {
        onDone(true)
      }
    } catch (e) {
      setErr(e?.message || 'Error al guardar')
      setStatusMsg(null)
    }
    setBusy(false)
  }

  const confirmOk = () => save('normal', 'Sin novedad reportada')

  const confirmAlarm = () => {
    if (!alarmType) return
    save('fault', `${alarmType}${alarmNote.trim() ? ` â€” ${alarmNote.trim()}` : ''}`)
  }

  return (
    <div className="capture-panel">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFile}
      />

      {!file && !compressing && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p className="hint" style={{ margin: 0 }}>
            {statusMsg || 'Abriendo la cÃ¡maraâ€¦'}
          </p>
          <button type="button" className="primary" onClick={retake}>
            Tomar foto
          </button>
          <button type="button" className="ghost" onClick={() => onDone(false)}>
            Cancelar
          </button>
        </div>
      )}
      {compressing && <p className="hint" style={{ margin: 0 }}>Comprimiendo imagenâ€¦</p>}

      {preview && !askAlarm && (
        <>
          <img className="capture-preview" src={preview} alt="Vista previa" />
          {campos.length > 0 && (
            <div className="capture-readings">
              <p className="hint" style={{ margin: '6px 0 4px' }}>
                Lecturas de la pantalla <span style={{ opacity: 0.7 }}>(opcional â€” llenan el formato de control diario)</span>
              </p>
              <div className="readings-grid">
                {campos.map((c) => (
                  <label key={c.key} className="reading-field">
                    <span>
                      {c.label}
                      {c.unidad ? ` (${c.unidad})` : ''}
                    </span>
                    <input
                      type={c.tipo === 'texto' ? 'text' : 'number'}
                      inputMode={c.tipo === 'entero' ? 'numeric' : c.tipo === 'numero' ? 'decimal' : 'text'}
                      step={c.paso}
                      value={readings[c.key] ?? ''}
                      onChange={(e) => setReading(c.key, e.target.value)}
                      disabled={busy}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="hint" style={{ margin: '4px 0 0', textAlign: 'center' }}>
            Â¿La mÃ¡quina estÃ¡ bien?
          </p>
          <div className="capture-actions">
            <button className="capture-btn ok" onClick={confirmOk} disabled={busy} title="Sin novedad">
              âœ“
            </button>
            <button className="capture-btn bad" onClick={() => setAskAlarm(true)} disabled={busy} title="Reportar alarma">
              âœ—
            </button>
          </div>
          <button type="button" className="ghost" onClick={retake} disabled={busy} style={{ marginTop: 6 }}>
            Volver a tomar foto
          </button>
          {(busy || statusMsg) && (
            <p className="hint" style={{ textAlign: 'center' }}>
              {statusMsg || 'Guardandoâ€¦'}
            </p>
          )}
        </>
      )}

      {preview && askAlarm && (
        <>
          <img className="capture-preview small" src={preview} alt="Vista previa" />
          <p className="hint" style={{ margin: '4px 0 2px' }}>Â¿QuÃ© tipo de alarma registras?</p>
          <div className="alarm-grid">
            {ALARM_TYPES.map((t) => (
              <button
                key={t}
                className={alarmType === t ? 'chip active' : 'chip'}
                onClick={() => setAlarmType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="alarm-note"
            value={alarmNote}
            onChange={(e) => setAlarmNote(e.target.value)}
            placeholder="Detalle adicional (opcional)"
          />
          <div className="actions row">
            <button className="primary" onClick={confirmAlarm} disabled={busy || !alarmType}>
              {busy ? 'Guardandoâ€¦' : 'ðŸš¨ Registrar alarma'}
            </button>
            <button className="ghost" onClick={() => setAskAlarm(false)} disabled={busy}>
              Volver
            </button>
          </div>
        </>
      )}

      {err && <p className="msg error">{err}</p>}
      {!busy && (
        <button className="ghost" style={{ justifySelf: 'center' }} onClick={() => onDone(false)}>
          Cancelar
        </button>
      )}
    </div>
  )
}

/* â”€â”€ Vista de ronda del turno actual â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function RoundView({ mc, plants, rooms, machines }) {
  const { hour, shift, shiftDate } = currentSlot()
  // Recordar dÃ³nde iba la ronda (misma hora/turno) si el operario sale de la app un momento
  const saved = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('round_ui_state') || 'null')
      return s && s.shiftDate === shiftDate && s.hour === hour ? s : null
    } catch { return null }
  })()
  const [plantId, setPlantId] = useState(saved?.plantId ?? null)
  const [roomId, setRoomId] = useState(saved?.roomId ?? null)
  const [captureId, setCaptureId] = useState(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('round_ui_state', JSON.stringify({ shiftDate, hour, plantId, roomId })) } catch { /* sin almacenamiento */ }
  }, [shiftDate, hour, plantId, roomId])

  useEffect(() => {
    if (!plantId && plants.length > 0) setPlantId(plants[0].id)
  }, [plants, plantId])

  // La ronda solo cubre salas de incubadoras/nacedoras/cuartos tÃ©cnicos QUE tengan
  // mÃ¡quinas que revisar; asÃ­ los cuartos vacÃ­os (bodegas, pasillos, sexajeâ€¦) no aparecen.
  //
  // La sala de la RONDA no es siempre donde estÃ¡ montado el equipo: los chillers
  // viven en la plataforma exterior pero sus tableros â€”donde se hace la lectura y
  // la fotoâ€” estÃ¡n en la sala tÃ©cnica. Para eso estÃ¡ `panel_room_id`; sin Ã©l la
  // sala se quedaba sin equipos y desaparecÃ­a de la lista del operario.
  const roundRoomOf = (m) => m.panel_room_id || m.room_id
  const eligibleMachines = machines.filter(
    (m) => m.plant_id === plantId && m.status !== 'decommissioned' && roundRoomOf(m)
  )
  const roomsWithMachine = new Set(eligibleMachines.map(roundRoomOf))
  const plantRooms = rooms.filter(
    (r) => r.plant_id === plantId && ROUND_ROOM_TYPES.includes(r.type) && roomsWithMachine.has(r.id)
  )
  const roundRoomIds = new Set(plantRooms.map((r) => r.id))
  const plantMachines = eligibleMachines.filter((m) => roundRoomIds.has(roundRoomOf(m)))

  const roomMachines = plantMachines.filter((m) => roundRoomOf(m) === roomId)

  const checksNow = mc.checks.filter(
    (c) => c.shift_date === shiftDate && Number(c.hour_slot) === Number(hour)
  )
  const checkOf = (machineId) => checksNow.find((c) => c.machine_id === machineId)
  const pendingPlant = plantMachines.filter((m) => !checkOf(m.id))
  const doneInRoom = (rid) => plantMachines.filter((m) => roundRoomOf(m) === rid && checkOf(m.id)).length
  const totalInRoom = (rid) => plantMachines.filter((m) => roundRoomOf(m) === rid).length

  const finishRound = async () => {
    const n = pendingPlant.length
    const ok = window.confirm(
      n === 0
        ? 'Â¿Terminar la ronda? Todas las mÃ¡quinas fueron reportadas.'
        : `Â¿Terminar la ronda?\n\n${n} mÃ¡quina(s) NO fueron reportadas y quedarÃ¡n registradas como APAGADAS en el reporte de esta ronda.`
    )
    if (!ok) return
    setClosing(true)
    await mc.closeRound(plantId, pendingPlant.map((m) => m.id))
    setClosing(false)
    setRoomId(null)
  }

  return (
    <>
      <div className="round-banner">
        <span>
          Turno <strong>{SHIFT_LABEL[shift]}</strong> Â· Hora <strong>{String(hour).padStart(2, '0')}:00</strong>
        </span>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <span className={pendingPlant.length === 0 ? 'pill status ok' : 'pill status warn'}>
            {pendingPlant.length === 0 ? 'Ronda completa' : `${pendingPlant.length} pendiente(s)`}
          </span>
          <button className="chip ghost" onClick={finishRound} disabled={closing || plantMachines.length === 0}>
            {closing ? 'Cerrandoâ€¦' : 'ðŸ Terminar ronda'}
          </button>
        </span>
      </div>

      {plants.length > 1 && (
        <div className="plant-chips">
          {plants.map((p) => (
            <button
              key={p.id}
              className={p.id === plantId ? 'chip active' : 'chip'}
              onClick={() => { setPlantId(p.id); setRoomId(null); setCaptureId(null) }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* SelecciÃ³n de sala */}
      <p className="hint" style={{ margin: '10px 0 6px' }}>
        {roomId ? 'Sala actual â€” toca otra para cambiar:' : 'Selecciona la sala a la que vas a entrar:'}
      </p>
      <div className="room-grid">
        {plantRooms.map((r) => {
          const done = doneInRoom(r.id)
          const total = totalInRoom(r.id)
          const complete = total > 0 && done === total
          return (
            <button
              key={r.id}
              className={`room-pick${roomId === r.id ? ' active' : ''}${complete ? ' complete' : ''}`}
              onClick={() => { setRoomId(r.id); setCaptureId(null) }}
            >
              <strong>{r.name}</strong>
              <span>{complete ? 'âœ“ Completa' : `${done}/${total} registradas`}</span>
            </button>
          )
        })}
        {plantRooms.length === 0 && (
          <p className="hint">No hay salas de incubadoras, nacedoras o cuartos tÃ©cnicos en esta planta.</p>
        )}
      </div>

      {/* MÃ¡quinas de la sala seleccionada */}
      {roomId && (
        <div className="admin-list" style={{ marginTop: 12 }}>
          {roomMachines.length === 0 && <p className="hint">Esta sala no tiene mÃ¡quinas.</p>}
          {roomMachines.map((m) => {
            const check = checkOf(m.id)
            const cond = check ? conditionOf(check.condition) : null
            return (
              <div key={m.id} className={`admin-card${check ? ' check-done' : ''}`}>
                <div className="admin-row">
                  <div className="admin-row-main">
                    <strong>{m.name}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {m.code} Â· {MACHINE_TYPE_LABEL[m.type] ?? m.type}
                      {check?.notes ? ` Â· ${check.notes}` : ''}
                    </span>
                  </div>
                  {check ? (
                    <span
                      className={`pill status ${cond.cls}`}
                      title={
                        check.offline
                          ? check.has_local_photo
                            ? 'Foto guardada en este telÃ©fono â€” se sube sola al sincronizar'
                            : 'Guardado en el telÃ©fono â€” se sube al volver la seÃ±al'
                          : undefined
                      }
                    >
                      {cond.label}
                      {check.offline
                        ? check.has_local_photo
                          ? ' Â· ðŸ“· en cola'
                          : ' Â· â³ por subir'
                        : ''}
                    </span>
                  ) : (
                    captureId !== m.id && (
                      <button className="primary" onClick={() => setCaptureId(m.id)}>
                        ðŸ“· Registrar
                      </button>
                    )
                  )}
                </div>
                {captureId === m.id && !check && (
                  <MachineCapture
                    machine={m}
                    mc={mc}
                    onDone={() => setCaptureId(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* â”€â”€ Historial (supervisor / coordinador / admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function HistoryView({ mc, machines, team, canDelete }) {
  const [fMachine, setFMachine] = useState('')
  const [fDate, setFDate] = useState('')
  const [fShift, setFShift] = useState('')

  const machineOf = (id) => machines.find((m) => m.id === id)
  const nameOf = (id) => team.find((t) => t.id === id)?.name ?? 'â€”'

  /* Los filtros van al servidor: en memoria solo estÃ¡n las Ãºltimas 400 rondas,
   * asÃ­ que buscar por una fecha vieja no devolvÃ­a nada aunque el registro
   * existiera. Al limpiar los filtros se vuelve a la vista por defecto. */
  const { loadChecks } = mc
  useEffect(() => {
    loadChecks({
      machineId: fMachine || undefined,
      shiftDate: fDate || undefined,
      shiftNumber: fShift || undefined,
    })
  }, [fMachine, fDate, fShift, loadChecks])

  const filtered = mc.checks.filter(
    (c) =>
      (!fMachine || c.machine_id === fMachine) &&
      (!fDate || c.shift_date === fDate) &&
      (!fShift || String(c.shift_number) === fShift)
  )

  const lc = useListControls(filtered, (c, q) => {
    const m = machineOf(c.machine_id)
    return [m?.name, m?.code, nameOf(c.taken_by), c.notes].some((v) => v?.toLowerCase().includes(q))
  }, 25)

  const groups = useMemo(() => {
    const g = new Map()
    for (const c of lc.visible) {
      const key = `${c.shift_date} Â· ${SHIFT_LABEL[c.shift_number]}`
      if (!g.has(key)) g.set(key, [])
      g.get(key).push(c)
    }
    return [...g.entries()]
  }, [lc.visible])

  const onDelete = async (c) => {
    if (!window.confirm('Â¿Eliminar este registro y su foto? Esta acciÃ³n no se puede deshacer.')) return
    await mc.deleteCheck(c)
  }

  return (
    <>
      <div className="check-filters">
        <select value={fMachine} onChange={(e) => setFMachine(e.target.value)}>
          <option value="">Todas las mÃ¡quinas</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
          ))}
        </select>
        <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
        <select value={fShift} onChange={(e) => setFShift(e.target.value)}>
          <option value="">Todos los turnos</option>
          {[1, 2, 3].map((s) => (
            <option key={s} value={s}>{SHIFT_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <ListControls lc={lc} placeholder="Buscar por mÃ¡quina, operario u observaciÃ³nâ€¦" />

      {lc.visible.length === 0 ? (
        <p className="hint">No hay registros con esos filtros.</p>
      ) : (
        groups.map(([label, rows]) => (
          <div key={label}>
            <p className="component-title" style={{ margin: '14px 0 8px' }}>{label}</p>
            <div className="check-grid">
              {rows.map((c) => {
                const m = machineOf(c.machine_id)
                const cond = conditionOf(c.condition)
                return (
                  <div key={c.id} className={`check-card cond-${c.condition}`}>
                    <PhotoThumb path={c.photo_path} getPhotoUrl={mc.getPhotoUrl} />
                    <div className="check-info">
                      <strong>{m ? `${m.name} (${m.code})` : 'MÃ¡quina eliminada'}</strong>
                      <span className="hint" style={{ margin: 0 }}>
                        {String(c.hour_slot).padStart(2, '0')}:00 Â· {fmtTime(c.taken_at)} Â· ðŸ‘¤ {nameOf(c.taken_by)}
                      </span>
                      {c.notes && <span className="check-notes">{c.notes}</span>}
                      <span className="check-foot">
                        <span className={`pill status ${cond.cls}`}>{cond.label}</span>
                        {canDelete && (
                          <button className="ghost danger" onClick={() => onDelete(c)}>
                            Eliminar
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </>
  )
}

/* Captura de foto (pantalla de la mÃ¡quina) reutilizable en cargue y transferencia */
function PhotoCapture({ file, setFile }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [compressing, setCompressing] = useState(false)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleChange = async (e) => {
    const f = e.target.files?.[0] ?? null
    if (f) {
      setCompressing(true)
      const compressed = await compressImage(f)
      setCompressing(false)
      setFile(compressed)
    } else {
      setFile(null)
    }
  }

  return (
    <div className="photo-field">
      <span className="hint" style={{ margin: 0 }}>Foto de la pantalla de la mÃ¡quina</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      {preview ? (
        <div className="photo-thumb-wrap">
          <img className="photo-thumb" src={preview} alt="Foto de la pantalla" />
          <button type="button" className="ghost small" onClick={() => inputRef.current?.click()} disabled={compressing}>
            {compressing ? 'âŒ› Comprimiendo...' : 'Repetir foto'}
          </button>
        </div>
      ) : (
        <button type="button" className="chip ghost" onClick={() => inputRef.current?.click()} disabled={compressing}>
          {compressing ? 'âŒ› Comprimiendo...' : 'ðŸ“· Tomar foto de la pantalla'}
        </button>
      )}
    </div>
  )
}

function PhotoLink({ path, getPhotoUrl }) {
  if (!path) return null
  const open = async () => {
    const url = await getPhotoUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
  }
  return <button type="button" className="ghost small" onClick={open}>ðŸ“· Ver foto</button>
}

/* â”€â”€ Reporte de cargue de incubadora â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function LoadView({ loads, machines, team, plants, onCreateLoad, getPhotoUrl }) {
  const [plantId, setPlantId] = useState(null)
  const [machineId, setMachineId] = useState('')
  const [lote, setLote] = useState('')
  const [preIncubHours, setPreIncubHours] = useState(0)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!plantId && plants.length > 0) setPlantId(plants[0].id)
  }, [plants, plantId])

  const setters = machines.filter(
    (m) => m.plant_id === plantId && SETTER_TYPES.includes(m.type) && m.status !== 'decommissioned'
  )
  const machineLabel = (id) => {
    const m = machines.find((x) => x.id === id)
    return m ? `${m.name} (${m.code})` : 'â€”'
  }
  const opName = (id) => team.find((t) => t.id === id)?.name ?? 'â€”'

  const submit = async () => {
    setBusy(true)
    setErr(null)
    setOk(false)
    const { error } = await onCreateLoad({
      plantId,
      machineId,
      lote,
      cycleStartAt: (() => {
        const h = parseFloat(preIncubHours) || 0
        const base = new Date()
        return new Date(base.getTime() + h * 3_600_000).toISOString()
      })(),
      file,
    })
    setBusy(false)
    if (error) setErr(error)
    else {
      setOk(true)
      setLote('')
      setMachineId('')
      setPreIncubHours(0)
      setFile(null)
    }
  }

  const recent = loads.filter((l) => l.plant_id === plantId).slice(0, 30)

  return (
    <>
      {plants.length > 1 && (
        <div className="plant-chips">
          {plants.map((p) => (
            <button
              key={p.id}
              className={p.id === plantId ? 'chip active' : 'chip'}
              onClick={() => { setPlantId(p.id); setMachineId('') }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="inline-form">
        <div className="two-col">
          <label>
            Lote
            <input type="text" value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Ej. L-2045" />
          </label>
          <label>
            Incubadora
            <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
              <option value="">Seleccionaâ€¦</option>
              {setters.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Pre-incubaciÃ³n (horas antes del inicio del ciclo)
          <input
            type="number" min="0" max="72" step="0.5"
            value={preIncubHours}
            onChange={(e) => setPreIncubHours(e.target.value)}
            placeholder="0"
          />
        </label>
        {parseFloat(preIncubHours) > 0 && (
          <p className="hint" style={{ margin: '2px 0 4px', color: 'var(--accent)' }}>
            â„¹ï¸ Inicio de ciclo calculado: <strong>
              {fmtDateTimeFull(new Date(Date.now() + parseFloat(preIncubHours) * 3_600_000).toISOString())}
            </strong>
          </p>
        )}
        <PhotoCapture file={file} setFile={setFile} />
        <p className="hint" style={{ margin: '2px 0 0' }}>
          ðŸ•’ La fecha y hora de cargue y tu nombre se registran automÃ¡ticamente al guardar.
        </p>
        {err && <p className="msg error">{err}</p>}
        {ok && <p className="msg ok">Cargue registrado.</p>}
        <div className="actions row">
          <button className="primary" onClick={submit} disabled={busy || !machineId || lote.trim().length < 1 || !file}>
            {busy ? 'Registrandoâ€¦' : 'Registrar cargue'}
          </button>
        </div>
      </div>

      <p className="component-title" style={{ margin: '16px 0 6px' }}>Cargues recientes</p>
      {setters.length === 0 && <p className="hint">Esta planta no tiene incubadoras registradas.</p>}
      {recent.length === 0 ? (
        <p className="hint">AÃºn no hay cargues registrados en esta planta.</p>
      ) : (
        <div className="report-list">
        {recent.map((l) => {
            const age   = cycleAge(l.cycle_start_at)
            const badge = age ? milestoneBadge(age.hours) : null
            return (
              <div key={l.id} className="report-row">
                <div className="report-main">
                  <strong>Lote {l.lote}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    ðŸ¥š {machineLabel(l.machine_id)} Â· Cargue: {fmtDateTimeFull(l.loaded_at)}
                    {l.cycle_start_at ? ` Â· Inicio ciclo: ${fmtDateTimeFull(l.cycle_start_at)}` : ''}
                    {age ? ` Â· Edad: ${age.label}` : ''}
                  </span>
                  {badge && <span className={badge.cls} style={{ marginTop: 4 }}>{badge.text}</span>}
                </div>
                <span className="report-side">
                  <PhotoLink path={l.photo_path} getPhotoUrl={getPhotoUrl} />
                  <span className="hint" style={{ margin: 0 }}>ðŸ‘¤ {opName(l.created_by)}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* â”€â”€ Reporte de transferencia (lote â†’ salÃ³n de nacedoras) â”€â”€â”€â”€ */
function TransferView({ loads, transfers, rooms, team, onCreateTransfer, getPhotoUrl }) {
  const [lote, setLote] = useState('')
  const [mode, setMode] = useState('single')
  const [roomIds, setRoomIds] = useState([])
  const [weight, setWeight] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)

  const opName = (id) => team.find((t) => t.id === id)?.name ?? 'â€”'
  const roomName = (id) => rooms.find((r) => r.id === id)?.name ?? 'Sala'
  const expected = mode === 'double' ? 2 : 1

  // Lotes con cargue activo que aÃºn no se han transferido (agregado por lote)
  const pendingLotes = useMemo(() => {
    const transferred = new Set(transfers.map((t) => t.lote))
    const map = new Map()
    for (const l of loads) {
      if (transferred.has(l.lote)) continue
      const cur = map.get(l.lote) ?? { lote: l.lote, batchId: l.batch_id ?? null, plantId: l.plant_id, cycleStart: l.cycle_start_at ?? null, loadedAt: l.loaded_at ?? null, loads: 0 }
      cur.loads += 1
      if (l.cycle_start_at && (!cur.cycleStart || new Date(l.cycle_start_at) < new Date(cur.cycleStart))) cur.cycleStart = l.cycle_start_at
      if (l.loaded_at && (!cur.loadedAt || new Date(l.loaded_at) < new Date(cur.loadedAt))) cur.loadedAt = l.loaded_at
      if (!cur.batchId && l.batch_id) cur.batchId = l.batch_id
      map.set(l.lote, cur)
    }
    return [...map.values()]
  }, [loads, transfers])

  // Solo se habilitan para transferencia las mÃ¡quinas con â‰¥ MIN_TRANSFER_DAYS dÃ­as
  // de incubaciÃ³n (evita transferir una incubadora reciÃ©n cargada por error).
  const incubationDays = (x) => {
    const start = x.cycleStart || x.loadedAt
    if (!start) return null
    return (Date.now() - new Date(start).getTime()) / 86400000
  }
  const eligibleLotes = pendingLotes.filter((x) => {
    const d = incubationDays(x)
    return d != null && d >= MIN_TRANSFER_DAYS
  })
  const blockedCount = pendingLotes.length - eligibleLotes.length

  const selected = eligibleLotes.find((x) => x.lote === lote) || null
  const age = selected ? cycleAge(selected.cycleStart) : null
  const transferBadge = age ? milestoneBadge(age.hours) : null

  // Salas de nacedoras de la planta del lote; marca las ocupadas por transferencias previas
  const occupied = useMemo(() => {
    const s = new Set()
    for (const t of transfers) for (const rid of t.room_ids ?? []) s.add(rid)
    return s
  }, [transfers])
  const hatchingRooms = rooms.filter(
    (r) => r.type === HATCHING_ROOM_TYPE && (!selected || r.plant_id === selected.plantId)
  )

  const toggleRoom = (id) => {
    setRoomIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= expected) return [...prev.slice(1), id] // reemplaza el mÃ¡s antiguo
      return [...prev, id]
    })
  }
  // Al cambiar de modo recorta la selecciÃ³n de salas
  useEffect(() => { setRoomIds((prev) => prev.slice(0, mode === 'double' ? 2 : 1)) }, [mode])

  const pickLote = (v) => { setLote(v); setRoomIds([]) }

  const submit = async () => {
    setBusy(true); setErr(null); setOk(false)
    const { error } = await onCreateTransfer({
      plantId: selected?.plantId,
      batchId: selected?.batchId,
      lote,
      mode,
      roomIds,
      weightDiff: weight,
      cycleStartAt: selected?.cycleStart,
      file,
    })
    setBusy(false)
    if (error) setErr(error)
    else { setOk(true); setLote(''); setMode('single'); setRoomIds([]); setWeight(''); setFile(null) }
  }

  const recent = transfers.slice(0, 30)

  return (
    <>
      <div className="inline-form">
        <label>
          Lote a transferir
          <select value={lote} onChange={(e) => pickLote(e.target.value)}>
            <option value="">Selecciona un lote cargadoâ€¦</option>
            {eligibleLotes.map((x) => {
              const d = incubationDays(x)
              return (
                <option key={x.lote} value={x.lote}>
                  Lote {x.lote} â€” {x.loads} cargue{x.loads === 1 ? '' : 's'}{d != null ? ` Â· ${d.toFixed(1)} dÃ­as` : ''}
                </option>
              )
            })}
          </select>
        </label>
        {pendingLotes.length === 0 && <p className="hint" style={{ margin: '2px 0 0' }}>No hay lotes pendientes de transferir.</p>}
        {blockedCount > 0 && (
          <p className="hint" style={{ margin: '2px 0 0' }}>
            ðŸ”’ {blockedCount} lote{blockedCount === 1 ? '' : 's'} cargado{blockedCount === 1 ? '' : 's'} no aparece{blockedCount === 1 ? '' : 'n'} aÃºn:
            se habilitan al cumplir {MIN_TRANSFER_DAYS} dÃ­as de incubaciÃ³n.
          </p>
        )}

        {selected && (
          <div className="report-prefill">
            <span className="hint" style={{ margin: 0 }}>Datos del lote (automÃ¡ticos):</span>
            <div><strong>Lote {selected.lote}</strong> Â· {selected.loads} cargue{selected.loads === 1 ? '' : 's'}</div>
            <span className="hint" style={{ margin: 0 }}>
              {selected.cycleStart ? `Inicio ciclo: ${fmtDateTimeFull(selected.cycleStart)}` : 'Sin inicio de ciclo'}
              {age ? ` Â· Edad: ${age.label}` : ''}
            </span>
            {transferBadge && <span className={transferBadge.cls} style={{ marginTop: 4 }}>{transferBadge.text}</span>}
          </div>
        )}

        <label>
          Modo de transferencia
          <div className="actions row" style={{ marginTop: 4 }}>
            {['single', 'double'].map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? 'chip active' : 'chip ghost'}
                onClick={() => setMode(m)}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </label>

        <label>
          Sala(s) de nacedoras â€” elige {expected} ({roomIds.length}/{expected})
          <div className="room-grid" style={{ marginTop: 4 }}>
            {hatchingRooms.map((r) => {
              const on = roomIds.includes(r.id)
              const busyRoom = occupied.has(r.id) && !on
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`room-pick${on ? ' active' : ''}`}
                  onClick={() => toggleRoom(r.id)}
                  disabled={!selected}
                >
                  <strong>{r.name}</strong>
                  <span>{on ? 'âœ“ Seleccionada' : busyRoom ? 'â— Ocupada' : 'Libre'}</span>
                </button>
              )
            })}
            {hatchingRooms.length === 0 && <p className="hint">Esta planta no tiene salas de nacedoras.</p>}
          </div>
        </label>

        <label>
          Diferencia de peso (%) <span className="hint" style={{ margin: 0 }}>(opcional)</span>
          <input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Ej. 12.5" disabled={!selected} />
        </label>

        {selected && <PhotoCapture file={file} setFile={setFile} />}
        <p className="hint" style={{ margin: '2px 0 0' }}>
          ðŸ•’ La fecha y hora de transferencia y tu nombre se registran automÃ¡ticamente al guardar.
        </p>
        {err && <p className="msg error">{err}</p>}
        {ok && <p className="msg ok">Transferencia registrada.</p>}
        <div className="actions row">
          <button className="primary" onClick={submit} disabled={busy || !selected || roomIds.length !== expected || !file}>
            {busy ? 'Registrandoâ€¦' : 'Registrar transferencia'}
          </button>
        </div>
      </div>

      <p className="component-title" style={{ margin: '16px 0 6px' }}>Transferencias recientes</p>
      {recent.length === 0 ? (
        <p className="hint">AÃºn no hay transferencias registradas.</p>
      ) : (
        <div className="report-list">
          {recent.map((t) => (
            <div key={t.id} className="report-row">
              <div className="report-main">
                <strong>Lote {t.lote}</strong>
                <span className="hint" style={{ margin: 0 }}>
                  âž¡ï¸ {(t.room_ids ?? []).map(roomName).join(' + ') || 'Sin sala'} Â· {MODE_LABEL[t.mode] ?? t.mode} Â· {fmtDateTimeFull(t.transferred_at)}
                  {t.weight_diff != null ? ` Â· Î” peso: ${t.weight_diff}%` : ''}
                </span>
              </div>
              <span className="report-side">
                <PhotoLink path={t.photo_path} getPhotoUrl={getPhotoUrl} />
                <span className="hint" style={{ margin: 0 }}>ðŸ‘¤ {opName(t.created_by)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* â”€â”€ Formulario: iniciar nacimiento (dotaciÃ³n de la jornada) â”€â”€ */
function StartHatchForm({ lote, mode, roomsLabel, incubable, estimated, onStart, onCancel }) {
  const [sexing, setSexing] = useState('')
  const [vacc, setVacc] = useState('')
  const [extra, setExtra] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    setBusy(true); setErr(null)
    const { error } = await onStart({ sexingOps: sexing, vaccinationOps: vacc, extraOps: extra, file })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form compact">
      <div className="report-prefill">
        <span className="hint" style={{ margin: 0 }}>El sistema pone en proceso (automÃ¡tico):</span>
        <div><strong>Lote {lote}</strong> Â· {MODE_LABEL[mode] ?? mode}</div>
        <span className="hint" style={{ margin: 0 }}>ðŸ­ SalÃ³n(es): {roomsLabel}</span>
        <span className="hint" style={{ margin: 0 }}>
          ðŸ¥š Incubable: {incubable == null ? 'â€”' : incubable.toLocaleString('es-CO')}
          {' Â· '}ðŸ¤ Estimado a nacer: {estimated == null ? 'â€”' : `${estimated.toLocaleString('es-CO')} (${Math.round(HATCH_RATE * 100)}%)`}
        </span>
      </div>
      <p className="hint" style={{ margin: 0 }}>DotaciÃ³n de la jornada:</p>
      <div className="two-col">
        <label>Operarios en sexaje<input type="number" min="0" value={sexing} onChange={(e) => setSexing(e.target.value)} placeholder="0" /></label>
        <label>Operarios en vacunadoras<input type="number" min="0" value={vacc} onChange={(e) => setVacc(e.target.value)} placeholder="0" /></label>
      </div>
      <label>Operarios adicionales<input type="number" min="0" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" /></label>
      <PhotoCapture file={file} setFile={setFile} />
      <p className="hint" style={{ margin: '2px 0 0' }}>ðŸ•’ Al iniciar arranca el cronÃ³metro de la jornada.</p>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy}>{busy ? 'Iniciandoâ€¦' : 'â–¶ï¸ Iniciar nacimiento'}</button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â”€â”€ Formulario: programar la hora del nacimiento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ScheduleHatchForm({ onSchedule, onCancel }) {
  const [when, setWhen] = useState(nowLocalInput())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async () => {
    setBusy(true); setErr(null)
    const { error } = await onSchedule(new Date(when).toISOString())
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }
  return (
    <div className="inline-form compact">
      <label>Fecha y hora del nacimiento<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
      <p className="hint" style={{ margin: 0 }}>Se enviarÃ¡ una notificaciÃ³n a todos los usuarios.</p>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary small" onClick={submit} disabled={busy || !when}>{busy ? 'Programandoâ€¦' : 'ðŸ“£ Programar y notificar'}</button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â”€â”€ Formulario: cerrar jornada con pollitos por sexo â”€â”€â”€â”€â”€â”€â”€â”€ */
function CloseHatchForm({ hatch, onClose, onCancel }) {
  const [females, setFemales] = useState('')
  const [males, setMales] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const total = (Number(females) || 0) + (Number(males) || 0)

  const submit = async () => {
    setBusy(true); setErr(null)
    const { error } = await onClose(hatch.id, { femalesCount: females, malesCount: males, notes, file })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form compact">
      <p className="hint" style={{ margin: 0 }}>Pollitos que salieron (total para la venta):</p>
      <div className="two-col">
        <label>Hembras<input type="number" min="0" value={females} onChange={(e) => setFemales(e.target.value)} placeholder="0" autoFocus /></label>
        <label>Machos<input type="number" min="0" value={males} onChange={(e) => setMales(e.target.value)} placeholder="0" /></label>
      </div>
      <p className="hint" style={{ margin: 0 }}>Total: <strong>{total.toLocaleString('es-CO')}</strong> pollitos</p>
      <label>Observaciones<input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></label>
      <PhotoCapture file={file} setFile={setFile} />
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || (females === '' && males === '')}>{busy ? 'Cerrandoâ€¦' : 'ðŸ Cerrar jornada'}</button>
        <button className="ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

/* â”€â”€ Nacimiento (dÃ­a 21): lo programa e inicia el supervisor â”€â”€ */
function NacimientoView({ orgId, userId, transfers, hatch, rooms, team }) {
  const er = useEggReports(orgId, userId)
  const nt = useNotifications(orgId, userId)
  const [startingId, setStartingId] = useState(null)   // id de transferencia (inicio directo) o hatch (planned)
  const [schedulingId, setSchedulingId] = useState(null)
  const [closingId, setClosingId] = useState(null)
  const [now, setNow] = useState(Date.now())

  const roomName = (id) => rooms.find((r) => r.id === id)?.name ?? 'Sala'
  const roomsLabel = (ids) => (ids ?? []).map(roomName).join(' + ') || 'Sin sala'
  const opName = (id) => team.find((t) => t.id === id)?.name ?? 'â€”'

  const inProgress = hatch.hatches.filter((h) => h.status === 'in_progress')
  const planned = hatch.hatches.filter((h) => h.status === 'planned')
  const completed = hatch.hatches.filter((h) => h.status === 'completed')
  const usedTransferIds = new Set(hatch.hatches.map((h) => h.transfer_id).filter(Boolean))
  const pending = transfers.filter((t) => !usedTransferIds.has(t.id))

  useEffect(() => {
    if (inProgress.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [inProgress.length])

  // Huevo incubable certificado del lote (cuarto frÃ­o) â†’ base del estimado
  const incubableForBatch = (batchId) => {
    if (!batchId) return null
    let inc = 0
    let found = false
    for (const r of er.reports) {
      if (r.batch_id !== batchId || r.status !== 'received') continue
      found = true
      const counts = r.received_counts ?? r.counts
      for (const cat of er.categories) if (cat.kind === 'incubable') inc += Number(counts?.[cat.code] || 0)
    }
    return found ? inc : null
  }
  const estimatedFor = (inc) => (inc == null ? null : Math.round(inc * HATCH_RATE))

  // Programar + notificar a todos
  const scheduleAndNotify = async (t, inc, est, scheduledAtIso) => {
    const { error } = await hatch.scheduleHatch({ transfer: t, scheduledAt: scheduledAtIso, incubableEggs: inc, estimatedChicks: est })
    if (error) return { error }
    await nt.notify({
      title: `Nacimiento programado Â· Lote ${t.lote}`,
      body: `SalÃ³n(es): ${roomsLabel(t.room_ids)} Â· ${fmtDateTimeFull(scheduledAtIso)}`,
      kind: 'hatch_scheduled',
    })
    return { error: null }
  }

  return (
    <>
      {(hatch.error || nt.error) && <p className="msg error">{hatch.error || nt.error}</p>}

      {/* Jornadas en curso (cronÃ³metro) */}
      {inProgress.length > 0 && (
        <>
          <p className="component-title" style={{ margin: '4px 0 6px' }}>Nacimientos en curso</p>
          <div className="admin-list">
            {inProgress.map((h) => (
              <div key={h.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>Lote {h.lote} Â· {MODE_LABEL[h.mode] ?? h.mode}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      ðŸ­ {roomsLabel(h.room_ids)} Â· â±ï¸ {elapsedLabel(h.started_at, now)}
                      {' Â· '}ðŸ‘¥ sexaje {h.sexing_ops ?? 0} Â· vacuna {h.vaccination_ops ?? 0} Â· extra {h.extra_ops ?? 0}
                    </span>
                    <span className="hint" style={{ margin: 0 }}>
                      ðŸ¤ Estimado: {h.estimated_chicks == null ? 'â€”' : h.estimated_chicks.toLocaleString('es-CO')} Â· IniciÃ³ {opName(h.started_by)}
                    </span>
                  </div>
                  <span className="pill live"><span className="dot" /> En curso</span>
                  {closingId !== h.id && (
                    <span className="admin-row-actions">
                      <button className="primary small" onClick={() => setClosingId(h.id)}>Cerrar jornada</button>
                    </span>
                  )}
                </div>
                {closingId === h.id && (
                  <CloseHatchForm hatch={h} onClose={hatch.closeHatch} onCancel={() => setClosingId(null)} />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Programados (planned) â†’ iniciar con dotaciÃ³n */}
      {planned.length > 0 && (
        <>
          <p className="component-title" style={{ margin: '16px 0 6px' }}>Programados</p>
          <div className="admin-list">
            {planned.map((h) => (
              <div key={h.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>Lote {h.lote} Â· {MODE_LABEL[h.mode] ?? h.mode}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      ðŸ­ {roomsLabel(h.room_ids)} Â· ðŸ“£ Programado {fmtDateTimeFull(h.scheduled_at)}
                    </span>
                    <span className="hint" style={{ margin: 0 }}>
                      ðŸ¤ Estimado: {h.estimated_chicks == null ? 'â€”' : h.estimated_chicks.toLocaleString('es-CO')}
                    </span>
                  </div>
                  <span className="pill status warn">Programado</span>
                  {startingId !== `h-${h.id}` && (
                    <span className="admin-row-actions">
                      <button className="primary small" onClick={() => setStartingId(`h-${h.id}`)}>Iniciar</button>
                      <button className="ghost danger" onClick={() => { if (window.confirm('Â¿Cancelar la programaciÃ³n?')) hatch.cancelHatch(h.id) }}>âœ•</button>
                    </span>
                  )}
                </div>
                {startingId === `h-${h.id}` && (
                  <StartHatchForm
                    lote={h.lote}
                    mode={h.mode}
                    roomsLabel={roomsLabel(h.room_ids)}
                    incubable={h.incubable_eggs}
                    estimated={h.estimated_chicks}
                    onStart={(vals) => hatch.beginPlanned(h.id, vals)}
                    onCancel={() => setStartingId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Transferencias listas â†’ programar o iniciar directo */}
      <p className="component-title" style={{ margin: '16px 0 6px' }}>Listas para nacimiento</p>
      {pending.length === 0 ? (
        <p className="hint">No hay transferencias pendientes de nacimiento. Aparecen aquÃ­ al registrar una transferencia.</p>
      ) : (
        <div className="admin-list">
          {pending.map((t) => {
            const age = cycleAge(t.cycle_start_at)
            const badge = hatchBadge(age?.hours ?? null)
            const inc = incubableForBatch(t.batch_id)
            const est = estimatedFor(inc)
            const openStart = startingId === `t-${t.id}`
            const openSched = schedulingId === t.id
            return (
              <div key={t.id} className="admin-card">
                <div className="admin-row">
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>Lote {t.lote} Â· {MODE_LABEL[t.mode] ?? t.mode}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      ðŸ­ {roomsLabel(t.room_ids)} Â· Transferido {fmtDateTimeFull(t.transferred_at)}
                      {age ? ` Â· Edad: ${age.label}` : ''}
                    </span>
                    <span className="hint" style={{ margin: 0 }}>
                      ðŸ¥š Incubable: {inc == null ? 'â€”' : inc.toLocaleString('es-CO')} Â· ðŸ¤ Estimado: {est == null ? 'â€”' : est.toLocaleString('es-CO')}
                    </span>
                  </div>
                  {badge && <span className={badge.cls}>{badge.text}</span>}
                  {!openStart && !openSched && (
                    <span className="admin-row-actions">
                      <button className="chip ghost" onClick={() => { setSchedulingId(t.id); setStartingId(null) }}>ðŸ“£ Programar</button>
                      <button className="primary small" onClick={() => { setStartingId(`t-${t.id}`); setSchedulingId(null) }}>Iniciar</button>
                    </span>
                  )}
                </div>
                {openSched && (
                  <ScheduleHatchForm
                    onSchedule={(iso) => scheduleAndNotify(t, inc, est, iso)}
                    onCancel={() => setSchedulingId(null)}
                  />
                )}
                {openStart && (
                  <StartHatchForm
                    lote={t.lote}
                    mode={t.mode}
                    roomsLabel={roomsLabel(t.room_ids)}
                    incubable={inc}
                    estimated={est}
                    onStart={(vals) => hatch.startHatch({ transfer: t, incubableEggs: inc, estimatedChicks: est, ...vals })}
                    onCancel={() => setStartingId(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Nacimientos cerrados */}
      {completed.length > 0 && (
        <>
          <p className="component-title" style={{ margin: '16px 0 6px' }}>Nacimientos recientes</p>
          <div className="admin-list">
            {completed.slice(0, 20).map((h) => {
              const pct = h.incubable_eggs && h.actual_chicks != null ? Math.round((h.actual_chicks / h.incubable_eggs) * 100) : null
              return (
                <div key={h.id} className="admin-row compact" style={{ margin: 0 }}>
                  <span>ðŸ¤</span>
                  <div className="admin-row-main" style={{ flex: 1 }}>
                    <strong>Lote {h.lote} Â· {h.actual_chicks == null ? 'â€”' : h.actual_chicks.toLocaleString('es-CO')} pollitos</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      â™€ {h.females_count == null ? 'â€”' : h.females_count.toLocaleString('es-CO')} hembras Â· â™‚ {h.males_count == null ? 'â€”' : h.males_count.toLocaleString('es-CO')} machos
                      {' Â· '}{roomsLabel(h.room_ids)} Â· DuraciÃ³n {elapsedLabel(h.started_at, h.ended_at ? new Date(h.ended_at).getTime() : null)}
                      {pct != null ? ` Â· Nacimiento ${pct}%` : ''} Â· CerrÃ³ {opName(h.closed_by)}
                    </span>
                  </div>
                  {pct != null && <span className={`pill status ${pct >= 80 ? 'ok' : pct >= 65 ? 'warn' : 'off'}`}>{pct}%</span>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

/* â”€â”€ Panel principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function SupervisionPanel({ orgId, userId, role, area }) {
  // Gerencia + coordinador de planta + supervisor (+ plataforma): potestad completa
  const canSupervise = canSupervisePlant(role, area)
  const canOperate = canOperatePlantRounds(role, area)
  // Los auxiliares (de turno y de producciÃ³n) SOLO cumplen las actividades que
  // les asignan â†’ ven Ãºnicamente esa sub-pestaÃ±a.
  const isShiftAux = role === 'auxiliary' || role === 'auxiliary_production'
  const mc = useMachineChecks(orgId, userId, { canSupervise })
  const flow = useLoads(orgId, userId)
  const hatch = useHatches(orgId, userId)
  const [plants, setPlants] = useState([])
  const [rooms, setRooms] = useState([])
  const [machines, setMachines] = useState([])
  const [team, setTeam] = useState([])
  // Gerencia / coord. planta entran por ronda (tomar fotos) o historial
  const [view, setView] = useState(
    isShiftAux ? 'actividades' : canSupervise ? 'ronda' : 'ronda'
  )

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('created_at'),
      supabase.from('rooms').select('id, plant_id, name, code, type').order('code'),
      supabase.from('machines').select('id, plant_id, room_id, panel_room_id, name, code, type, status'),
      supabase.from('organization_members').select('user_id, profiles ( full_name, email )').eq('org_id', orgId),
    ]).then(([p, r, m, t]) => {
      setPlants(p.data ?? [])
      setRooms(r.data ?? [])
      setMachines(m.data ?? [])
      setTeam(
        (t.data ?? []).map((row) => ({
          id: row.user_id,
          name: row.profiles?.full_name || row.profiles?.email || row.user_id,
        }))
      )
    })
  }, [orgId])

  if (!canOperate) {
    return (
      <div className="card wide">
        <div className="card-head">
          <h2>SupervisiÃ³n y monitoreo</h2>
        </div>
        <p className="hint">Tu rol de observador no tiene acceso a este mÃ³dulo.</p>
      </div>
    )
  }

  const isShiftOperator = role === 'operator' || isShiftAux

  return (
    <div className="card wide">
      <div className="card-head">
        <h2>{isShiftOperator ? 'Mis actividades' : 'SupervisiÃ³n y monitoreo'}</h2>
      </div>

      <nav className="subtabs-rail" aria-label={isShiftOperator ? 'Herramientas del turno' : 'Secciones de supervisiÃ³n'}>
        <div className="subtabs-rail-head">
          <p className="subtabs-rail-label">
            {isShiftOperator ? 'Herramientas del turno' : 'Secciones'}
          </p>
          <p className="subtabs-rail-hint">
            {isShiftOperator ? 'Elija la tarea a realizar' : 'Navegue entre mÃ³dulos'}
          </p>
        </div>
        <div className="tabs subtabs" role="tablist">
          {!isShiftAux && (
            <>
              <button type="button" className={view === 'ronda' ? 'tab active' : 'tab'} onClick={() => setView('ronda')}>
                Ronda del turno
              </button>
              <button type="button" className={view === 'cargue' ? 'tab active' : 'tab'} onClick={() => setView('cargue')}>
                Cargue
              </button>
              <button type="button" className={view === 'transferencia' ? 'tab active' : 'tab'} onClick={() => setView('transferencia')}>
                Transferencia
              </button>
              {canSupervise && (
                <button type="button" className={view === 'nacimiento' ? 'tab active' : 'tab'} onClick={() => setView('nacimiento')}>
                  Nacimiento
                </button>
              )}
              <button type="button" className={view === 'incidencias' ? 'tab active' : 'tab'} onClick={() => setView('incidencias')}>
                Reporte de incidencias
              </button>
              <button type="button" className={view === 'ot' ? 'tab active' : 'tab'} onClick={() => setView('ot')}>
                OT
              </button>
            </>
          )}
          <button type="button" className={view === 'actividades' ? 'tab active' : 'tab'} onClick={() => setView('actividades')}>
            {isShiftAux ? 'Mis actividades' : 'Actividades del turno'}
          </button>
          {!isShiftAux && (
            <>
              <button type="button" className={view === 'mercancia' ? 'tab active' : 'tab'} onClick={() => setView('mercancia')}>
                MercancÃ­a recibida
              </button>
              {canSupervise && (
                <button type="button" className={view === 'historial' ? 'tab active' : 'tab'} onClick={() => setView('historial')}>
                  Historial
                </button>
              )}
            </>
          )}
        </div>
      </nav>

      {mc.error && <p className="msg error">{mc.error}</p>}
      {flow.error && <p className="msg error">{flow.error}</p>}
      {view === 'cargue' ? (
        <LoadView loads={flow.loads} machines={machines} team={team} plants={plants} onCreateLoad={flow.createLoad} getPhotoUrl={flow.getPhotoUrl} />
      ) : view === 'transferencia' ? (
        <TransferView loads={flow.loads} transfers={flow.transfers} rooms={rooms} team={team} onCreateTransfer={flow.createTransfer} getPhotoUrl={flow.getPhotoUrl} />
      ) : view === 'nacimiento' && canSupervise ? (
        <NacimientoView orgId={orgId} userId={userId} transfers={flow.transfers} hatch={hatch} rooms={rooms} team={team} />
      ) : view === 'incidencias' ? (
        <IncidentReportView orgId={orgId} userId={userId} plants={plants} rooms={rooms} machines={machines} />
      ) : view === 'ot' ? (
        <WorkOrdersView orgId={orgId} userId={userId} role={role} rooms={rooms} machines={machines} />
      ) : view === 'actividades' ? (
        <ShiftActivitiesView orgId={orgId} userId={userId} role={role} area={area} plants={plants} rooms={rooms} machines={machines} team={team} />
      ) : view === 'mercancia' ? (
        <MerchandiseView orgId={orgId} userId={userId} plants={plants} rooms={rooms} />
      ) : mc.loading && mc.checks.length === 0 ? (
        <p className="hint">Cargandoâ€¦</p>
      ) : view === 'ronda' ? (
        <RoundView mc={mc} plants={plants} rooms={rooms} machines={machines} />
      ) : (
        <HistoryView mc={mc} machines={machines} team={team} canDelete={['owner', 'admin'].includes(role)} />
      )}
    </div>
  )
}

