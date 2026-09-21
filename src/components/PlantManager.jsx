/**
 * =============================================================================
 * ARCHIVO: src/components/PlantManager.jsx
 * PROPÓSITO: Componente UI «PlantManager»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { usePlants } from '../hooks/usePlants'
import { useRooms } from '../hooks/useRooms'
import { useMachines } from '../hooks/useMachines'
import FloorMap from './FloorMap'
import MachineManager from './MachineManager'
import PlantGeoCalibrator from './PlantGeoCalibrator'
import { projectPeopleOnPlan, readPlantGeo } from '../lib/geoMap'

/**
 * Planos: dibujo de salas/máquinas/estructura → solo CDH Maker (consola plataforma).
 * GPS de sedes: líderes de área, gerencia, admin/owner de empresa + staff CDH.
 */
const canEditPlanos = (role, isPlatformStaff) =>
  !!isPlatformStaff || role === 'developer' || role === 'platform_admin'

const canCalibrateGps = (role, isPlatformStaff) =>
  canEditPlanos(role, isPlatformStaff) ||
  ['owner', 'admin', 'management', 'management_auxiliary', 'coordinator', 'supervisor'].includes(
    role
  )

// Ampliar el plano a pantalla completa (solo vista)
const canExpand = (role, isPlatformStaff) =>
  canCalibrateGps(role, isPlatformStaff) ||
  ['maintenance_auxiliary', 'reception_operator', 'operator'].includes(role)

// ─────────────────────────────────────────────────────────────────────────────
// PLANO BASE: medidas reales de la planta incubadora
// Coordenadas en metros. X = ancho (derecha), Y = largo (hacia abajo en pantalla).
// Largo total exterior: 91.5 m · Ancho zona limpia: 21.5 m · Bloque admin: 8 m
// Dos corredores internos de 1.7 m cada uno.
// ─────────────────────────────────────────────────────────────────────────────
const PLANO_BASE_INCUBADORA = [
  // ── Cuarto de vacunas (franja izquierda, X=0, ancho 2.5 m) ──────────────
  // 6.5 m de largo total dividido en sección A (2 m) y sección B (4.5 m)
  { code: 'VAC-A',     name: 'Cuarto de Vacunas A',              type: 'technical',        pos_x: 0,    pos_y: 0,    width: 2.5,  height: 2    },
  { code: 'VAC-B',     name: 'Cuarto de Vacunas B',              type: 'technical',        pos_x: 0,    pos_y: 2,    width: 2.5,  height: 4.5  },

  // ── Sexaje (misma franja, continúa desde Y=6.5) ──────────────────────────
  // Lado angosto 2.5 m, largo 11 m
  { code: 'SEX',       name: 'Sexaje',                            type: 'chick_processing', pos_x: 0,    pos_y: 6.5,  width: 2.5,  height: 11   },

  // ── Corredor zona limpia 1 (X=2.5, ancho 1.7 m) ─────────────────────────
  { code: 'COR-L1',   name: 'Corredor Zona Limpia 1',            type: 'hallway',          pos_x: 2.5,  pos_y: 0,    width: 1.7,  height: 50   },

  // ── Sala de Transferencia (X=4.2, 11 m × 4 m) ───────────────────────────
  // Incluye sala de almacenamiento de la máquina (2.5 m × 4 m) en un extremo
  { code: 'TRANS',     name: 'Sala de Transferencia',            type: 'chick_processing', pos_x: 4.2,  pos_y: 0,    width: 11,   height: 4    },
  { code: 'ALM-TRANS', name: 'Almacén Máquina Transferencia',   type: 'technical',        pos_x: 4.2,  pos_y: 4,    width: 4,    height: 2.5  },

  // ── Nacedoras (11 m × 5.5 m) ─────────────────────────────────────────────
  { code: 'NAC',       name: 'Nacedoras',                         type: 'hatching',         pos_x: 4.2,  pos_y: 6.5,  width: 11,   height: 5.5  },

  // ── Vacunación (11 m × 5.5 m) ───────────────────────────────────────────
  { code: 'VAC-OP',   name: 'Vacunación',                        type: 'chick_processing', pos_x: 4.2,  pos_y: 12,   width: 11,   height: 5.5  },

  // ── Almacén de cajas (7.5 m × 3.5 m) ───────────────────────────────────
  { code: 'ALM-CAJ',  name: 'Almacén de Cajas',                  type: 'egg_storage',      pos_x: 4.2,  pos_y: 17.5, width: 7.5,  height: 3.5  },

  // ── Sala de despacho / almacén pollito (13.5 m × 6 m) ──────────────────
  { code: 'DESP-ALM', name: 'Sala Despacho / Almacén Pollito',  type: 'chick_processing', pos_x: 4.2,  pos_y: 21,   width: 13.5, height: 6    },

  // ── Despacho pollito (4 m × 3.5 m) ─────────────────────────────────────
  { code: 'DESP-P',   name: 'Despacho Pollito',                  type: 'chick_processing', pos_x: 4.2,  pos_y: 27,   width: 4,    height: 3.5  },

  // ── Corredor zona limpia 2 (X=15.2, ancho 1.7 m) ────────────────────────
  { code: 'COR-L2',   name: 'Corredor Zona Limpia 2',            type: 'hallway',          pos_x: 15.2, pos_y: 0,    width: 1.7,  height: 50   },

  // ── Bloque de administración / zona sucia (X=21.5, ancho bloque 8 m) ────
  // Oficina: 4 m de profundidad
  { code: 'OFI',       name: 'Oficina',                           type: 'office',           pos_x: 21.5, pos_y: 0,    width: 8,    height: 4    },
  // Sala Técnica 1: 15 m de largo
  { code: 'SAL-TEC1', name: 'Sala Técnica 1',                    type: 'technical',        pos_x: 21.5, pos_y: 4,    width: 8,    height: 15   },
  // Sala Técnica 2: 11 m de largo
  { code: 'SAL-TEC2', name: 'Sala Técnica 2',                    type: 'technical',        pos_x: 21.5, pos_y: 19,   width: 8,    height: 11   },
]

function NewPlantForm({ onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await onCreate({ name, city, address })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <label>
        Nombre de la planta
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Planta Norte"
          autoFocus
        />
      </label>
      <div className="two-col">
        <label>
          Ciudad
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Medellín" />
        </label>
        <label>
          Dirección
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Opcional" />
        </label>
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || name.trim().length < 2}>
          {busy ? 'Creando…' : 'Crear planta'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function PlantManager({
  orgId,
  role,
  presence,
  currentUserId,
  isPlatformStaff = false,
}) {
  const editPlanos = canEditPlanos(role, isPlatformStaff)
  const calibrateGps = canCalibrateGps(role, isPlatformStaff)
  const expand = canExpand(role, isPlatformStaff)

  const { plants: allPlants, loading, error, createPlant, updatePlantGeo } = usePlants(orgId)
  const plants = allPlants.filter((p) => !(p.code?.startsWith('G') || p.name?.startsWith('G-')))
  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [geoTick, setGeoTick] = useState(0)
  const [geoPickMode, setGeoPickMode] = useState(false)
  const [geoLandmark, setGeoLandmark] = useState(null)

  const selectedPlantId = plants.some((p) => p.id === selectedId) ? selectedId : null
  const roomsApi = useRooms(selectedPlantId, orgId)
  const machinesApi = useMachines(selectedPlantId)
  const [selectedMachineId, setSelectedMachineId] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState(null)

  const handleImportPlano = async () => {
    if (!selectedPlantId) return
    const hasRooms = roomsApi.rooms.length > 0
    const msg = hasRooms
      ? `Ya hay ${roomsApi.rooms.length} sala(s) en este plano.\n¿Agregar el plano base de todas formas? (solo se omiten las que ya tengan el mismo código)\n\nPuedes eliminar las existentes antes si quieres partir de cero.`
      : `¿Importar el plano base con ${PLANO_BASE_INCUBADORA.length} salas reales de la planta?\n\nSe crearán con sus medidas exactas y podrás reposicionarlas con drag-and-drop.`
    if (!window.confirm(msg)) return
    setImporting(true)
    setImportMsg(null)
    const { error: err } = await roomsApi.createRooms(PLANO_BASE_INCUBADORA)
    setImporting(false)
    if (err) setImportMsg({ type: 'error', text: `Error al importar: ${err}` })
    else setImportMsg({ type: 'ok', text: `✅ Plano base importado con ${PLANO_BASE_INCUBADORA.length} salas. Ajusta posiciones con drag-and-drop.` })
  }

  useEffect(() => {
    setGeoLandmark(null)
    setGeoPickMode(false)
  }, [selectedPlantId])

  useEffect(() => {
    if (!selectedId && plants.length > 0) setSelectedId(plants[0].id)
    if (selectedId && !plants.some((p) => p.id === selectedId)) {
      setSelectedId(plants[0]?.id ?? null)
    }
  }, [plants, selectedId])

  const selectedPlant = plants.find((p) => p.id === selectedId) ?? null
  const plantGeo = useMemo(
    () => (selectedPlant ? readPlantGeo(selectedPlant) : null),
    // geoTick fuerza relectura de localStorage tras calibrar
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPlant, geoTick]
  )

  const livePeople = useMemo(
    () =>
      projectPeopleOnPlan({
        peers: presence?.peers || [],
        geo: plantGeo,
        rooms: roomsApi.rooms,
        currentUserId,
        padMeters: 15,
      }),
    [presence?.peers, plantGeo, roomsApi.rooms, currentUserId]
  )

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Plantas y mapa de piso</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {editPlanos
              ? 'Modo CDH Maker: puede dibujar y editar planos.'
              : calibrateGps
                ? 'Líder de área: puede calibrar GPS de la sede. La edición de planos es solo CDH Maker.'
                : 'Solo consulta del plano y presencia en vivo.'}
          </p>
        </div>
      </div>

      {error && <p className="msg error">{error}</p>}

      {loading ? (
        <p className="hint">Cargando plantas…</p>
      ) : (
        <>
          <div className="plant-chips">
            {plants.map((p) => (
              <button
                key={p.id}
                className={p.id === selectedId ? 'chip active' : 'chip'}
                onClick={() => setSelectedId(p.id)}
              >
                {p.name}
                <span className="chip-code">{p.code}</span>
              </button>
            ))}
            {editPlanos && !showForm && (
              <button className="chip ghost" onClick={() => setShowForm(true)}>
                + Nueva planta
              </button>
            )}
            {editPlanos && selectedPlantId && !showForm && (
              <button
                className="chip ghost"
                onClick={handleImportPlano}
                disabled={importing}
                title={`Crea ${PLANO_BASE_INCUBADORA.length} salas con medidas reales de la planta incubadora`}
              >
                {importing ? '⏳ Importando…' : '🏗️ Importar plano base'}
              </button>
            )}
          </div>

          {importMsg && (
            <p className={`msg ${importMsg.type}`} style={{ marginBottom: 8 }}>
              {importMsg.text}
              <button
                className="ghost small"
                style={{ marginLeft: 12 }}
                onClick={() => setImportMsg(null)}
              >
                ✕
              </button>
            </p>
          )}

          {showForm && editPlanos && (
            <NewPlantForm onCreate={createPlant} onCancel={() => setShowForm(false)} />
          )}

          {!showForm && plants.length === 0 && (
            <p className="hint">
              Aún no hay plantas registradas.{' '}
              {editPlanos
                ? 'Crea la primera para mapear salas (trabajo CDH Maker).'
                : 'La estructura de planos la construye CDH Maker; usted podrá calibrar el GPS de cada sede.'}
            </p>
          )}

          {selectedPlant && (
            <>
              <PlantGeoCalibrator
                plant={selectedPlant}
                geo={plantGeo}
                canManage={calibrateGps}
                updatePlantGeo={updatePlantGeo}
                onSaved={() => setGeoTick((n) => n + 1)}
                onPickModeChange={setGeoPickMode}
                pickedLandmark={geoLandmark}
                onClearPick={() => setGeoLandmark(null)}
              />
              <FloorMap
                key={selectedPlant.id}
                canManage={editPlanos}
                canExpand={expand}
                roomsApi={roomsApi}
                machines={machinesApi.machines}
                updateMachine={machinesApi.updateMachine}
                createMachine={machinesApi.createMachine}
                deleteMachine={machinesApi.deleteMachine}
                selectedMachineId={selectedMachineId}
                onSelectMachine={setSelectedMachineId}
                livePeople={livePeople}
                calibrationPickMode={geoPickMode && calibrateGps}
                onCalibrationPick={(xy) => setGeoLandmark(xy)}
                calibrationLandmark={geoLandmark}
              />
              <MachineManager
                key={`m-${selectedPlant.id}`}
                plantId={selectedPlant.id}
                orgId={orgId}
                rooms={roomsApi.rooms}
                canManage={editPlanos}
                machinesApi={machinesApi}
                selectedMachineId={selectedMachineId}
                onSelectMachine={setSelectedMachineId}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
