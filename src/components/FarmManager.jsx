/**
 * =============================================================================
 * ARCHIVO: src/components/FarmManager.jsx
 * PROPÓSITO: Componente UI «FarmManager»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
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

/** Edición de planos de granja: solo CDH Maker. GPS: líderes de área + gobierno empresa. */
const canEditPlanos = (role, isPlatformStaff) =>
  !!isPlatformStaff || role === 'developer' || role === 'platform_admin'

const canCalibrateGps = (role, isPlatformStaff) =>
  canEditPlanos(role, isPlatformStaff) ||
  ['owner', 'admin', 'management', 'management_auxiliary', 'coordinator', 'supervisor'].includes(
    role
  )

const canExpand = (role, isPlatformStaff) =>
  canCalibrateGps(role, isPlatformStaff) || role === 'maintenance_auxiliary'

function NewFarmForm({ onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    // Prefix 'G-' is added to the name to distinguish farms from plants in the same table.
    const { error } = await onCreate({ name: `G-${name.trim()}`, city, address })
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <label>
        Nombre de la granja
        <span className="hint" style={{ margin: '2px 0 4px', display: 'block' }}>
          Se identificará automáticamente con el prefijo G- en el sistema.
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Granja Norte"
          autoFocus
        />
      </label>
      <div className="two-col">
        <label>
          Ciudad / Municipio
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej. Rionegro" />
        </label>
        <label>
          Dirección
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Opcional" />
        </label>
      </div>
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || name.trim().length < 2}>
          {busy ? 'Creando…' : 'Crear granja'}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

/**
 * Crea un módulo completo con sus galpones numerados de un solo paso.
 * Ej.: módulo 200 de producción con 4 galpones → MODULO 200 "PRODUCCION"
 * + GALPONES 201–204, tipificados y ubicados en cuadrícula dentro del módulo.
 */
function NewModuleForm({ roomsApi, onCancel }) {
  const [moduleNum, setModuleNum] = useState('')
  const [stage, setStage] = useState('produccion')
  const [qty, setQty] = useState('4')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const n = parseInt(moduleNum, 10)
  const count = parseInt(qty, 10)
  const valid = Number.isInteger(n) && n >= 1 && Number.isInteger(count) && count >= 1 && count <= 12
  const stageWord = stage === 'produccion' ? 'PRODUCCION' : 'LEVANTE'

  const submit = async () => {
    if (!valid) return
    setBusy(true)
    setErr(null)
    // Geometría: el módulo se ubica debajo de lo ya dibujado y los galpones
    // en cuadrícula dentro de él. Luego se pueden arrastrar en el plano.
    const GW = 42, GH = 30, GAP = 6, PAD = 8, HEAD = 14
    const cols = count > 4 ? 3 : 2
    const rows = Math.ceil(count / cols)
    const baseX = 10
    const baseY = roomsApi.rooms.reduce((m, r) => Math.max(m, Number(r.pos_y) + Number(r.height)), 0) + 10
    const list = [
      {
        name: `MODULO ${n} "${stageWord}"`,
        code: `M${n}`,
        type: stage,
        pos_x: baseX,
        pos_y: baseY,
        width: PAD * 2 + cols * GW + (cols - 1) * GAP,
        height: PAD * 2 + HEAD + rows * GH + (rows - 1) * GAP,
      },
      ...Array.from({ length: count }, (_, i) => ({
        name: `GALPON ${n + 1 + i}`,
        code: `G${n + 1 + i}`,
        type: stage,
        pos_x: baseX + PAD + (i % cols) * (GW + GAP),
        pos_y: baseY + PAD + HEAD + Math.floor(i / cols) * (GH + GAP),
        width: GW,
        height: GH,
      })),
    ]
    const { error } = await roomsApi.createRooms(list)
    setBusy(false)
    if (error) setErr(error)
    else onCancel()
  }

  return (
    <div className="inline-form">
      <p className="component-title" style={{ margin: 0 }}>Nuevo módulo de galpones</p>
      <div className="two-col">
        <label>
          Nº del módulo
          <input
            type="number"
            min="1"
            step="100"
            value={moduleNum}
            onChange={(e) => setModuleNum(e.target.value)}
            placeholder="Ej. 200"
            autoFocus
          />
        </label>
        <label>
          Etapa
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="produccion">Producción</option>
            <option value="levante">Levante</option>
          </select>
        </label>
      </div>
      <label>
        Cantidad de galpones (máx. 12)
        <input type="number" min="1" max="12" value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      {valid && (
        <p className="hint" style={{ margin: 0 }}>
          Se creará <strong>MODULO {n} "{stageWord}"</strong> con los galpones{' '}
          <strong>{n + 1}</strong> al <strong>{n + count}</strong>, listos para distribuir lotes.
        </p>
      )}
      {err && <p className="msg error">{err}</p>}
      <div className="actions row">
        <button className="primary" onClick={submit} disabled={busy || !valid}>
          {busy ? 'Creando…' : `Crear módulo${valid ? ` + ${count} galpones` : ''}`}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function FarmManager({
  orgId,
  role,
  presence,
  currentUserId,
  isPlatformStaff = false,
}) {
  const editPlanos = canEditPlanos(role, isPlatformStaff)
  const calibrateGps = canCalibrateGps(role, isPlatformStaff)
  const expand = canExpand(role, isPlatformStaff)

  // Re-use the usePlants hook; farms are distinguished by their code starting with 'G-'
  const { plants: allPlants, loading, error, createPlant, updatePlantGeo } = usePlants(orgId)
  const farms = allPlants.filter((p) => p.code?.startsWith('G') || p.name?.startsWith('G-'))

  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showModuleForm, setShowModuleForm] = useState(false)
  const [geoTick, setGeoTick] = useState(0)
  const [geoPickMode, setGeoPickMode] = useState(false)
  const [geoLandmark, setGeoLandmark] = useState(null)

  const selectedFarmId = farms.some((f) => f.id === selectedId) ? selectedId : null
  const roomsApi = useRooms(selectedFarmId, orgId)
  const machinesApi = useMachines(selectedFarmId)
  const [selectedMachineId, setSelectedMachineId] = useState(null)

  useEffect(() => {
    if (!selectedId && farms.length > 0) setSelectedId(farms[0].id)
    if (selectedId && !farms.some((f) => f.id === selectedId)) {
      setSelectedId(farms[0]?.id ?? null)
    }
  }, [farms, selectedId])

  useEffect(() => {
    setGeoLandmark(null)
    setGeoPickMode(false)
  }, [selectedFarmId])

  const selectedFarm = farms.find((f) => f.id === selectedId) ?? null
  const farmGeo = useMemo(
    () => (selectedFarm ? readPlantGeo(selectedFarm) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedFarm, geoTick]
  )
  const livePeople = useMemo(
    () =>
      projectPeopleOnPlan({
        peers: presence?.peers || [],
        geo: farmGeo,
        rooms: roomsApi.rooms,
        currentUserId,
        padMeters: 20,
      }),
    [presence?.peers, farmGeo, roomsApi.rooms, currentUserId]
  )

  return (
    <div className="card wide">
      <div className="card-head">
        <h2>Granjas y mapa de módulos</h2>
      </div>

      {error && <p className="msg error">{error}</p>}

      {loading ? (
        <p className="hint">Cargando granjas…</p>
      ) : (
        <>
          <div className="plant-chips">
            {farms.map((f) => (
              <button
                key={f.id}
                className={f.id === selectedId ? 'chip active' : 'chip'}
                onClick={() => setSelectedId(f.id)}
              >
                {f.name}
                <span className="chip-code">{f.code}</span>
              </button>
            ))}
            {editPlanos && !showForm && (
              <button className="chip ghost" onClick={() => setShowForm(true)}>
                + Nueva granja
              </button>
            )}
            {editPlanos && selectedFarm && !showModuleForm && (
              <button className="chip ghost" onClick={() => { setShowModuleForm(true); setShowForm(false) }}>
                + Módulo de galpones
              </button>
            )}
          </div>

          {showForm && editPlanos && (
            <NewFarmForm onCreate={createPlant} onCancel={() => setShowForm(false)} />
          )}
          {showModuleForm && selectedFarm && editPlanos && (
            <NewModuleForm key={selectedFarm.id} roomsApi={roomsApi} onCancel={() => setShowModuleForm(false)} />
          )}

          {!showForm && farms.length === 0 && (
            <p className="hint">
              Aún no hay granjas registradas.{' '}
              {editPlanos
                ? 'Crea la primera (CDH Maker) para mapear módulos y galpones.'
                : 'La estructura de planos la construye CDH Maker; los líderes calibran el GPS de cada sede.'}
            </p>
          )}

          {selectedFarm && (
            <>
              <p className="hint" style={{ margin: '0 0 8px' }}>
                {editPlanos
                  ? 'Modo CDH Maker: edición de planos de granja.'
                  : calibrateGps
                    ? 'Líder de área: calibración GPS de la sede. Sin edición de planos.'
                    : 'Solo consulta.'}
              </p>
              <PlantGeoCalibrator
                plant={selectedFarm}
                geo={farmGeo}
                canManage={calibrateGps}
                updatePlantGeo={updatePlantGeo}
                onSaved={() => setGeoTick((n) => n + 1)}
                onPickModeChange={setGeoPickMode}
                pickedLandmark={geoLandmark}
                onClearPick={() => setGeoLandmark(null)}
              />
              <FloorMap
                key={selectedFarm.id}
                canManage={editPlanos}
                canExpand={expand}
                roomsApi={roomsApi}
                machines={machinesApi.machines}
                updateMachine={machinesApi.updateMachine}
                createMachine={machinesApi.createMachine}
                deleteMachine={machinesApi.deleteMachine}
                selectedMachineId={selectedMachineId}
                onSelectMachine={setSelectedMachineId}
                isFarm={true}
                livePeople={livePeople}
                calibrationPickMode={geoPickMode && calibrateGps}
                onCalibrationPick={(xy) => setGeoLandmark(xy)}
                calibrationLandmark={geoLandmark}
              />
              <MachineManager
                key={`gm-${selectedFarm.id}`}
                plantId={selectedFarm.id}
                orgId={orgId}
                rooms={roomsApi.rooms}
                canManage={editPlanos}
                machinesApi={machinesApi}
                selectedMachineId={selectedMachineId}
                onSelectMachine={setSelectedMachineId}
                isFarm={true}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
