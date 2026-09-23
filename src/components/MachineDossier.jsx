/**
 * src/components/MachineDossier.jsx
 * Dossier SIG Integral de Máquina (Auditoría SIG / CDH Maker).
 * Integra en un solo componente todos los requerimientos de auditoría y operación:
 * - Hoja de Vida del Equipo (FOMAT03)
 * - Componentes y Vida Útil de Piezas
 * - Plan de Mantenimiento AM y Creación Automática de OTs (FOMAT07)
 * - Órdenes de Trabajo con Técnico Ejecutor y Líder Aprobador (FOMAT01 + Histórico Mantum)
 * - Calibraciones con Lecturas, Deltas y Evidencias Fotográficas (FOMAT08)
 * - Inspecciones de Ronda (FOMAT04)
 * - Estado Operativo en Tiempo Real y Semáforo de Auditoría
 * - Exportación oficial FOMAT03 a Excel
 */

import { useCallback, useState } from 'react'
import { useMachineDossier } from '../hooks/useMachineDossier'
import { exportFomat03Excel } from '../lib/exportFomat03'
import { resolveMantumKeys } from '../data/mantumCatalog'
import { LOCAL_MAINTENANCE_MANUALS } from '../data/maintenanceManuals'
import { buildMaintenanceRecordHtml } from '../lib/maintenanceRecordDocument'
import { manualsForTask } from '../lib/planTaskInstructions'
import { calibrationRecordItem, openEvidenceFormat, openRecordDocument, singleCheckRound, workOrderRecordItem } from '../lib/sigRecordDocuments'
import PlanTaskInstructions from '../features/maintenance/components/PlanTaskInstructions'
import { IncubantSigPill } from './Brand'
import SensorPanel from './SensorPanel'

function SigDocBanner({ code, name, version = '01', date = '18-08-2026', process = 'GESTIÓN DE MANTENIMIENTO', onAction = null, actionLabel = null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 18px',
        background: 'linear-gradient(135deg, rgba(11, 20, 40, 0.95) 0%, rgba(19, 34, 61, 0.95) 100%)',
        border: '1px solid rgba(245, 144, 15, 0.35)',
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        marginBottom: 16,
      }}
    >
      <img
        src="/client-brands/incubant/logo_sig.png"
        alt="SIG"
        style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
        onError={(e) => {
          e.currentTarget.src = '/logo_sig.png'
        }}
      />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#f5900f', letterSpacing: 0.6 }}>
          ANTIOQUEÑA DE INCUBACIÓN S.A.S. · SIG (ISO 9001)
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginTop: 1 }}>
          {code} — {name}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
          Versión: <strong>{version}</strong> · Fecha: <strong>{date}</strong> · Proceso: <strong>{process}</strong> · <em>"Nuestra calidad nos define."</em>
        </div>
      </div>
      {onAction && actionLabel && (
        <button className="chip primary small" onClick={onAction} style={{ fontWeight: 600, flexShrink: 0 }}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}


const TABS = [
  { id: 'resumen', label: '📊 Resumen & Auditoría' },
  { id: 'fomat03', label: '📋 Hoja de Vida (FOMAT03)' },
  { id: 'componentes', label: '⚙️ Componentes & Vida Útil' },
  { id: 'fomat07', label: '📅 Plan AM & OTs Auto (FOMAT07)' },
  { id: 'fomat01', label: '🔧 Órdenes de Trabajo (FOMAT01)' },
  { id: 'fomat08', label: '🎯 Calibraciones (FOMAT08)' },
  { id: 'fomat04', label: '🔍 Rondas (FOMAT04)' },
  { id: 'iot', label: '📡 Sensores IoT' },
]

// Cada registro de las listas abre su formato diligenciado y cada tarea del plan, sus
// instrucciones (22-09-2026). Enlaces visibles sobre el fondo oscuro del dossier.
const RECORD_LINK = { color: '#93c5fd', textDecoration: 'underline', textUnderlineOffset: 2 }
const TASK_BUTTON = { ...RECORD_LINK, background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }

export default function MachineDossier({
  machineId,
  orgId,
  rooms = [],
  canManage = false,
  machinesApi = null,
  latest = null,
  onClose = null,
  initialTab = 'resumen',
}) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [autoOtBusy, setAutoOtBusy] = useState(null)
  const [autoOtMsg, setAutoOtMsg] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [planTask, setPlanTask] = useState(null)
  const closePlanTask = useCallback(() => setPlanTask(null), [])

  const {
    loading,
    error,
    machine,
    room,
    plant,
    opsState,
    calibrations,
    workOrders,
    checks,
    usersMap,
    assetEvidence,
    mantum,
    stats,
    createAutoWorkOrder,
    loadWorkOrderFiles,
  } = useMachineDossier(machineId, orgId)

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: 24, textAlign: 'center' }}>
        <p className="hint">⏳ Cargando expediente SIG completo del activo…</p>
      </div>
    )
  }

  if (error || !machine) {
    return (
      <div className="glass-card" style={{ padding: 24 }}>
        <p className="msg error">❌ {error || 'No se encontró la información del activo'}</p>
        {onClose && (
          <button className="ghost small" onClick={onClose} style={{ marginTop: 8 }}>
            Cerrar
          </button>
        )}
      </div>
    )
  }

  const handleExportExcel = () => {
    exportFomat03Excel({
      machine,
      room,
      plant,
      calibrations,
      workOrders,
      mantum,
      stats,
      assetEvidence,
    })
  }

  const handleCreateAutoOt = async (planTask) => {
    setAutoOtBusy(planTask.plan_code || planTask.activity)
    setAutoOtMsg(null)
    const res = await createAutoWorkOrder(planTask)
    setAutoOtBusy(null)
    if (res.error) {
      setAutoOtMsg({ type: 'error', text: res.error })
    } else {
      setAutoOtMsg({
        type: 'ok',
        text: `✅ OT automática creada con éxito (${res.data?.code || 'Código generado'}). Visible en pestaña Órdenes de Trabajo.`,
      })
      setTimeout(() => setAutoOtMsg(null), 6000)
    }
  }

  // ── Formatos diligenciados e instrucciones ──
  // Cada formato se llena solo con lo que guarda la base; lo que no se registró sale
  // «No registrado». Lo programado sin registro de ejecución no tiene formato.
  const nameOf = (userId) => (userId ? usersMap[userId]?.name || 'No registrado' : null)
  const mantumCode = mantum?.equipo?.mantum_code || null
  const machineCodes = Array.from(new Set([machine.code, machine.mantum_code, mantumCode, ...resolveMantumKeys(machine)].filter(Boolean)))

  const openPlanTask = (task) => setPlanTask({ task, manuals: manualsForTask(task, LOCAL_MAINTENANCE_MANUALS, machineCodes) })

  const openWorkOrderFormat = async (wo) => {
    let files = []
    try {
      files = await loadWorkOrderFiles(wo.id)
    } catch (err) {
      console.warn('Dossier SIG: el FOMAT01 se abre sin las evidencias de la OT.', err)
    }
    openEvidenceFormat(workOrderRecordItem({
      order: wo,
      files: files.map((file) => ({ ...file, uploadedByName: nameOf(file.uploaded_by) })),
      machine,
      createdBy: nameOf(wo.created_by),
      assignedTo: nameOf(wo.assigned_to),
    }))
  }

  const openMantumOtFormat = (ot) => openRecordDocument({
    title: `FOMAT01 · ${ot.code || 'OT Mántum'}`,
    html: buildMaintenanceRecordHtml({
      machineCode: mantumCode && mantumCode !== machine.code ? `${machine.code} · Mántum ${mantumCode}` : machine.code,
      activity: ot.activity,
      description: ot.description,
      feedback: ot.feedback,
      date: ot.completed_at || ot.started_at || ot.created_at || null,
      code: ot.code,
      status: ot.status || (ot.completed_at ? 'Cerrada en Mántum' : 'Registrada en Mántum'),
      technician: ot.technician,
      approver: ot.approver,
    }),
  })

  const openCalibrationFormat = (c) => openEvidenceFormat(calibrationRecordItem({
    calibration: c,
    machine,
    performedByName: nameOf(c.performed_by),
    workOrderCode: workOrders.find((wo) => wo.id === c.work_order_id)?.code || null,
    photos: [
      { url: c.photo_calibrator_url, file_name: 'Foto del calibrador (patrón)' },
      { url: c.photo_screen_url, file_name: 'Foto de la pantalla del equipo' },
    ],
  }))

  const openCheckFormat = (chk) => openEvidenceFormat(singleCheckRound({
    check: chk,
    machine,
    takenByName: nameOf(chk.taken_by),
    photoUrl: chk.photo_url || null,
  }))

  // Semáforo visual
  const semaforoColor = stats?.auditSemaphore === 'green' ? '#10b981' : stats?.auditSemaphore === 'yellow' ? '#f59e0b' : '#ef4444'
  const semaforoBg = stats?.auditSemaphore === 'green' ? 'rgba(16, 185, 129, 0.12)' : stats?.auditSemaphore === 'yellow' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)'

  return (
    <div className="machine-dossier glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #334155)' }}>
      {/* ── HEADER PRINCIPAL AUDITORÍA ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          padding: 24,
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          alignItems: 'center',
        }}
      >
        {/* Imagen del Activo */}
        <div style={{ position: 'relative', width: 140, height: 110, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.15)', background: '#0f172a', flexShrink: 0 }}>
          {mantum?.imageUrl ? (
            <img
              src={mantum.imageUrl}
              alt={machine.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>
              🏭
            </div>
          )}
          {mantum?.imageUrl && (
            <span
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: mantum.isOwnPhoto ? 'rgba(16, 185, 129, 0.9)' : 'rgba(245, 158, 11, 0.9)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 600,
                textAlign: 'center',
                padding: '2px 4px',
              }}
            >
              {mantum.isOwnPhoto ? 'FOTO PROPIA' : 'REFERENCIAL'}
            </span>
          )}
        </div>

        {/* Datos Principales */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f8fafc' }}>{machine.name}</h2>
            <span className="machine-code" style={{ fontSize: 13, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid #3b82f6', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
              {machine.code}
            </span>
            {mantum?.equipo?.mantum_code && (
              <span style={{ fontSize: 11, background: 'rgba(148, 163, 184, 0.2)', color: '#cbd5e1', padding: '2px 6px', borderRadius: 4 }}>
                SIG: {mantum.equipo.mantum_code}
              </span>
            )}
            <span className="pill status" style={{ fontSize: 12 }}>
              {machine.status === 'active' ? '🟢 Operativa' : machine.status === 'maintenance' ? '🟡 En Mtto' : '⚪ ' + machine.status}
            </span>
            <IncubantSigPill text="SIG · Antioqueña de Incubación SAS" />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: '#94a3b8' }}>
            <span>📍 <strong>Ubicación:</strong> {room ? `${room.name} (${room.code})` : 'Sin sala asignada'}</span>
            <span>🏭 <strong>Planta:</strong> {plant?.name || 'Incubadora Principal'}</span>
            <span>🏷️ <strong>Marca/Modelo:</strong> {[machine.brand, machine.model].filter(Boolean).join(' ') || 'Petersime BioStreamer'}</span>
            <span>⭐ <strong>Criticidad:</strong> {machine.criticidad || mantum?.equipo?.criticidad || 'Media'}</span>
          </div>

          {/* Estado Operativo / Fase de Ciclo */}
          {opsState && (
            <div style={{ marginTop: 8, fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap', color: '#38bdf8' }}>
              <span>🔄 <strong>Fase actual:</strong> {opsState.phase}</span>
              {opsState.lote && <span>📦 <strong>Lote:</strong> {opsState.lote}</span>}
              {opsState.age_hours > 0 && <span>⏱️ <strong>Edad ciclo:</strong> {Math.round(opsState.age_hours)}h</span>}
              {opsState.calib_due && <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠️ Ventana de Calibración abierta</span>}
            </div>
          )}
        </div>

        {/* Semáforo de Auditoría SIG & Acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              background: semaforoBg,
              border: `1px solid ${semaforoColor}`,
              color: semaforoColor,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <span style={{ fontSize: 16 }}>{stats?.auditSemaphore === 'green' ? '✅' : stats?.auditSemaphore === 'yellow' ? '⚠️' : '❌'}</span>
            <span>{stats?.auditSummary || 'Conforme con SIG'}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="chip primary small"
              onClick={handleExportExcel}
              title="Descarga la Hoja de Vida oficial del SIG en formato Excel (FOMAT03)"
              style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📥 Exportar Hoja de Vida (FOMAT03)
            </button>
            {onClose && (
              <button className="chip ghost small" onClick={onClose} title="Cerrar ficha">
                ✕ Cerrar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── BARRA DE PESTAÑAS ── */}
      <div
        style={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(15, 23, 42, 0.7)',
          padding: '0 16px',
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '3px solid #3b82f6' : '3px solid transparent',
                color: active ? '#60a5fa' : '#94a3b8',
                fontWeight: active ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Notificación de acciones automáticas */}
      {autoOtMsg && (
        <div style={{ padding: '10px 24px', background: autoOtMsg.type === 'ok' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13 }}>
          {autoOtMsg.text}
        </div>
      )}

      {/* ── CONTENIDO DE PESTAÑAS ── */}
      <div style={{ padding: 24 }}>
        {/* ══ 1. RESUMEN & AUDITORÍA ══ */}
        {activeTab === 'resumen' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {/* Card 1: Estado Metrológico (FOMAT08) */}
            <div className="glass-card" style={{ padding: 18, borderLeft: `4px solid ${stats?.calibColor === 'green' ? '#10b981' : stats?.calibColor === 'red' ? '#ef4444' : '#94a3b8'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>🎯 Calibración de Sensores</strong>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>FOMAT08</span>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: stats?.calibColor === 'green' ? '#10b981' : stats?.calibColor === 'red' ? '#ef4444' : '#cbd5e1' }}>
                {stats?.calibStatusLabel}
              </p>
              {stats?.lastCalibration ? (
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                  <div>📅 Última calibración: {new Date(stats.lastCalibration.calibrated_at).toLocaleDateString('es-CO')}</div>
                  <div>🌡️ Delta Temp: <strong>{stats.lastCalibration.temp_delta_f ?? 'N/A'} °F</strong> (Tolerancia: ±0.3°F)</div>
                  <div>💧 Delta HR: <strong>{stats.lastCalibration.rh_delta_pct ?? 'N/A'} %</strong> (Tolerancia: ±3.0%)</div>
                </div>
              ) : (
                <p className="hint">No registra calibraciones recientes.</p>
              )}
              <button className="chip ghost small" onClick={() => setActiveTab('fomat08')} style={{ marginTop: 12 }}>
                Ver historial y evidencias →
              </button>
            </div>

            {/* Card 2: Rondas de Inspección (FOMAT04) */}
            <div className="glass-card" style={{ padding: 18, borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>🔍 Inspecciones de Ronda</strong>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>FOMAT04</span>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 700, color: '#60a5fa' }}>
                {stats?.checkCompliancePct}% <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>conformidad</span>
              </p>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                <div>Total chequeos registrados: {stats?.totalChecks || 0}</div>
                <div>Sin novedad: {stats?.normalChecks || 0} inspecciones conformes</div>
              </div>
              <button className="chip ghost small" onClick={() => setActiveTab('fomat04')} style={{ marginTop: 12 }}>
                Ver lista de chequeos →
              </button>
            </div>

            {/* Card 3: Órdenes de Trabajo (FOMAT01) */}
            <div className="glass-card" style={{ padding: 18, borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>🔧 Órdenes de Trabajo</strong>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>FOMAT01</span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 22, fontWeight: 700, color: stats?.openWOsCount > 0 ? '#f59e0b' : '#10b981' }}>
                    {stats?.openWOsCount}
                  </span>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Activas</div>
                </div>
                <div>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{stats?.completedWOsCount}</span>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Completadas</div>
                </div>
                <div>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#60a5fa' }}>
                    {(mantum?.historicalOTs || []).length}
                  </span>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Histórico Mantum</div>
                </div>
              </div>
              <button className="chip ghost small" onClick={() => setActiveTab('fomat01')} style={{ marginTop: 12 }}>
                Ver OTs e historial →
              </button>
            </div>

            {/* Card 4: Plan de Mantenimiento AM (FOMAT07) */}
            <div className="glass-card" style={{ padding: 18, borderLeft: '4px solid #ec4899' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>📅 Plan Anual AM</strong>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>FOMAT07</span>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 700, color: '#f472b6' }}>
                {(mantum?.maintenancePlan || []).length} <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>tareas programadas</span>
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                Tareas preventivas y correctivas listas para generar órdenes de trabajo automáticas.
              </p>
              <button className="chip ghost small" onClick={() => setActiveTab('fomat07')} style={{ marginTop: 12 }}>
                Ver Plan y generar OTs →
              </button>
            </div>
          </div>
        )}

        {/* ══ 2. HOJA DE VIDA (FOMAT03) ══ */}
        {activeTab === 'fomat03' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <SigDocBanner
              code="FOMAT03"
              name="HOJA DE VIDA DEL EQUIPO"
              version="01"
              date="18-08-2026"
              actionLabel="📥 Descargar Hoja de Vida (.xlsx)"
              onAction={handleExportExcel}
            />
            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📋</span> 1. Identificación Oficial del Equipo (Placa y Registro)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Código Interno:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{machine.code}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Nombre Oficial:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{machine.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Código Mantum / SIG:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.mantum_code || mantum?.equipo?.mantum_code || 'S/C'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Criticidad SIG:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.criticidad || mantum?.equipo?.criticidad || 'Media'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Marca / Fabricante:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{machine.brand || mantum?.equipo?.brand || 'No registrado en FOMAT02/Mantum'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Modelo:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{machine.model || mantum?.equipo?.model || 'No registrado en FOMAT02/Mantum'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Número de Serie:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.serial_number || mantum?.equipo?.serial_number || 'D0757-D158500084700L'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Capacidad Nominal:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.capacity_eggs ? `${Number(machine.capacity_eggs).toLocaleString('es-CO')} huevos` : 'Estándar'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Fecha de Instalación:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.installed_at ? new Date(machine.installed_at).toLocaleDateString('es-CO') : 'No registrada en FOMAT02/Mantum'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Vida Útil Estimada:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.useful_life_years || 10} años (Renovación periódica de componentes)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Manual Técnico OEM:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>
                    {assetEvidence.some((file) => file.file_type === 'document') ? 'Disponible en Repositorio SIG' : 'No registrado en el repositorio documental'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Proveedor / Adquisición:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.supplier || 'Proveedor no registrado en las fuentes disponibles'}
                    {' · '}
                    {machine.acquisition_date ? new Date(machine.acquisition_date).toLocaleDateString('es-CO') : 'Fecha de adquisición no registrada'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Responsable Técnico:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {mantum?.equipo?.responsable || 'Auxiliar de Mantenimiento / Líder de Planta'}
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#60a5fa' }}>🖼️ Imágenes y documentos relacionados</h3>
              {assetEvidence.length === 0 ? (
                <p className="hint">No hay archivos documentales asociados a este código en el repositorio SIG/Mantum.</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                    {assetEvidence.filter((file) => file.file_type === 'image' && file.url).map((file) => (
                      <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
                        <img src={file.url} alt={file.file_name} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6 }} />
                        <small>{file.file_name}</small>
                      </a>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gap: 6, marginTop: 14 }}>
                    {assetEvidence.filter((file) => file.file_type !== 'image').map((file) => (
                      <a key={file.id} href={file.url || '#'} target="_blank" rel="noopener noreferrer" style={{ color: '#93c5fd' }}>
                        {file.format_code || 'Documento'} · {file.file_name}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Asignación y gestión rápida para Líder */}
            {canManage && (
              <div className="glass-card" style={{ padding: 20 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#cbd5e1' }}>⚙️ Modificación de Ubicación y Estado (Líder / Admin)</h4>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ fontSize: 13, color: '#94a3b8' }}>
                    Sala asignada:
                    <select
                      value={machine.room_id ?? ''}
                      onChange={(e) => machinesApi?.updateMachine?.(machine.id, { room_id: e.target.value || null })}
                      style={{ marginLeft: 8, padding: '4px 8px' }}
                    >
                      <option value="">Sin sala asignada</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.code})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: 13, color: '#94a3b8' }}>
                    Estado del equipo:
                    <select
                      value={machine.status}
                      onChange={(e) => machinesApi?.updateMachine?.(machine.id, { status: e.target.value })}
                      style={{ marginLeft: 8, padding: '4px 8px' }}
                    >
                      <option value="active">Activa (En operación)</option>
                      <option value="idle">En espera</option>
                      <option value="maintenance">En Mantenimiento</option>
                      <option value="decommissioned">Fuera de servicio</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ 3. COMPONENTES & VIDA ÚTIL ══ */}
        {activeTab === 'componentes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                  ⚙️ Desglose de Componentes Críticos y Estado de Vida Útil
                </h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>
                  Información integrada de piezas y partes de recambio según manual Mantum.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '10px 12px' }}>Código</th>
                    <th style={{ padding: '10px 12px' }}>Componente</th>
                    <th style={{ padding: '10px 12px' }}>Especificación Técnica</th>
                    <th style={{ padding: '10px 12px' }}>Referencia OEM</th>
                    <th style={{ padding: '10px 12px' }}>Vida Útil Estimada</th>
                    <th style={{ padding: '10px 12px' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(mantum?.components || []).map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#60a5fa' }}>{c.code}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f8fafc' }}>{c.name}</td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{c.component_spec}</td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{c.reference || 'OEM Estándar'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', height: 8, borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
                            <div
                              style={{
                                width: `${c.useful_life_pct || 80}%`,
                                height: '100%',
                                background: (c.useful_life_pct || 80) > 60 ? '#10b981' : (c.useful_life_pct || 80) > 30 ? '#f59e0b' : '#ef4444',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: '#cbd5e1' }}>{c.useful_life_pct || 80}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="pill status ok" style={{ fontSize: 11 }}>
                          {c.status || 'Operativo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ 4. PLAN DE MANTENIMIENTO AM (FOMAT07) ══ */}
        {activeTab === 'fomat07' && (
          <div>
            <SigDocBanner
              code="FOMAT07"
              name="PLAN ANUAL DE MANTENIMIENTO"
              version="01"
              date="18-08-2026"
              actionLabel="📥 Descargar Plan con Hoja de Vida"
              onAction={handleExportExcel}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                  📅 Tareas Programadas del Plan de Mantenimiento AM (FOMAT07)
                </h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>
                  Haga clic en una actividad para ver cómo se realiza. «⚡ Crear OT Auto» genera su orden de trabajo en IncubApp.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '10px 12px' }}>Código Plan</th>
                    <th style={{ padding: '10px 12px' }}>Actividad Programada</th>
                    <th style={{ padding: '10px 12px' }}>Tipo</th>
                    <th style={{ padding: '10px 12px' }}>Especialidad</th>
                    <th style={{ padding: '10px 12px' }}>Frecuencia</th>
                    <th style={{ padding: '10px 12px' }}>Estado</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(mantum?.maintenancePlan || []).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onClick={() => openPlanTask(p)}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f472b6' }}>{p.plan_code}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f8fafc' }}>
                        <button type="button" style={TASK_BUTTON} title="Ver cómo se realiza esta actividad" onClick={(event) => { event.stopPropagation(); openPlanTask(p) }}>
                          {p.activity || 'Actividad del plan AM'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{p.type}</td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{p.specialty}</td>
                      <td style={{ padding: '10px 12px', color: '#38bdf8', fontWeight: 500 }}>{p.frequency}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="pill status ok" style={{ fontSize: 11 }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button
                          className="chip primary small"
                          onClick={(event) => { event.stopPropagation(); handleCreateAutoOt(p) }}
                          disabled={autoOtBusy === (p.plan_code || p.activity)}
                          style={{ fontSize: 11, padding: '4px 8px' }}
                        >
                          {autoOtBusy === (p.plan_code || p.activity) ? 'Generando…' : '⚡ Crear OT Auto'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ 5. ÓRDENES DE TRABAJO (FOMAT01) ══ */}
        {activeTab === 'fomat01' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <SigDocBanner
              code="FOMAT01"
              name="ORDEN DE TRABAJO DE MANTENIMIENTO"
              version="01"
              date="18-08-2026"
            />
            {/* OTs Vivas de IncubApp */}
            <div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f8fafc' }}>
                📋 Órdenes de Trabajo Activas y Recientes (IncubApp)
              </h3>
              {workOrders.length === 0 ? (
                <p className="hint">No hay órdenes de trabajo abiertas en la plataforma para este equipo.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '8px 12px' }}>Código</th>
                        <th style={{ padding: '8px 12px' }}>Título / Tarea</th>
                        <th style={{ padding: '8px 12px' }}>Tipo</th>
                        <th style={{ padding: '8px 12px' }}>Prioridad</th>
                        <th style={{ padding: '8px 12px' }}>Técnico Asignado</th>
                        <th style={{ padding: '8px 12px' }}>Líder / Autor</th>
                        <th style={{ padding: '8px 12px' }}>Estado</th>
                        <th style={{ padding: '8px 12px' }}>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workOrders.map((wo) => {
                        const assignedUser = usersMap[wo.assigned_to]?.name || wo.technician_name || 'Sin asignar'
                        const creatorUser = usersMap[wo.created_by]?.name || wo.approver_name || 'Sistema SIG'
                        return (
                          <tr key={wo.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#60a5fa' }}>{wo.code || wo.id.slice(0, 8)}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 500, color: '#f8fafc' }}>
                              <a href="#formato" style={RECORD_LINK} title="Abrir el FOMAT01 diligenciado de esta orden" onClick={(event) => { event.preventDefault(); openWorkOrderFormat(wo) }}>
                                {wo.title || 'Orden de trabajo'} ↗
                              </a>
                              {wo.auto_generated && (
                                <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '1px 5px', borderRadius: 4 }}>
                                  Auto-AM
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{wo.type}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span className={`pill ${wo.priority === 'urgent' ? 'off' : 'idle'}`} style={{ fontSize: 11 }}>
                                {wo.priority}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#f8fafc' }}>👨‍🔧 {assignedUser}</td>
                            <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>👔 {creatorUser}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span className={`pill status ${wo.status === 'completed' ? 'ok' : wo.status === 'in_progress' ? 'warn' : 'idle'}`} style={{ fontSize: 11 }}>
                                {wo.status}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                              {new Date(wo.created_at).toLocaleDateString('es-CO')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Histórico Cerrado Mantum */}
            <div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f8fafc' }}>
                📚 Historial Consolidado de Intervenciones (Mantum)
              </h3>
              <p className="hint" style={{ margin: '0 0 12px 0' }}>
                Registro de trazabilidad histórica con el personal técnico ejecutor y líder registrador.
              </p>
              {(mantum?.historicalOTs || []).length === 0 ? (
                <p className="hint">No hay intervenciones históricas registradas para este equipo.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '8px 12px' }}>OT Mantum</th>
                        <th style={{ padding: '8px 12px' }}>Fecha</th>
                        <th style={{ padding: '8px 12px' }}>Actividad Realizada</th>
                        <th style={{ padding: '8px 12px' }}>Técnico que Atendió (Ejecutor)</th>
                        <th style={{ padding: '8px 12px' }}>Líder / Registro</th>
                        <th style={{ padding: '8px 12px' }}>Retroalimentación / Cierre</th>
                        <th style={{ padding: '8px 12px' }}>Costo Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mantum.historicalOTs.map((ot, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f59e0b' }}>{ot.code}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{ot.created_at || ot.started_at}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 500, color: '#f8fafc' }}>
                            {ot.sin_registro ? (
                              <span title="Programada en el plan; no hay registro de ejecución, así que no hay formato diligenciado">{ot.activity}</span>
                            ) : (
                              <a href="#formato" style={RECORD_LINK} title="Abrir el FOMAT01 diligenciado de esta intervención" onClick={(event) => { event.preventDefault(); openMantumOtFormat(ot) }}>
                                {ot.activity || 'Intervención Mántum'} ↗
                              </a>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#60a5fa' }}>{ot.sin_registro ? 'Sin registro de ejecución' : `👨‍🔧 ${ot.technician || 'No registrado'}`}</td>
                          <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{ot.sin_registro ? '—' : `👔 ${ot.approver || 'Líder Mantum'}`}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12, maxWidth: 300 }}>{ot.feedback || ot.description || '-'}</td>
                          <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 600 }}>{ot.sin_registro ? '—' : `$${ot.cost || '0'}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ 6. CALIBRACIONES (FOMAT08) ══ */}
        {activeTab === 'fomat08' && (
          <div>
            <SigDocBanner
              code="FOMAT08"
              name="CALIBRACIÓN DE EQUIPOS"
              version="01"
              date="18-08-2026"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                  🎯 Historial de Calibración de Sensores (FOMAT08)
                </h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>
                  Tolerancia oficial del Sistema Integrado de Gestión: Temperatura <strong>±0.3 °F</strong> · Humedad Relativa <strong>±3.0 %</strong>.
                </p>
              </div>
            </div>

            {calibrations.length === 0 ? (
              <p className="hint">No hay registros de calibración para este equipo en el sistema.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px 12px' }}>Fecha</th>
                      <th style={{ padding: '8px 12px' }}>Alcance</th>
                      <th style={{ padding: '8px 12px' }}>Lectura Pantalla</th>
                      <th style={{ padding: '8px 12px' }}>Lectura Patrón</th>
                      <th style={{ padding: '8px 12px' }}>Delta Hallado</th>
                      <th style={{ padding: '8px 12px' }}>Evaluación SIG</th>
                      <th style={{ padding: '8px 12px' }}>Metrólogo / Ejecutor</th>
                      <th style={{ padding: '8px 12px' }}>Evidencias</th>
                      <th style={{ padding: '8px 12px' }}>Formato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibrations.map((c) => {
                      const isTemp = c.scope === 'temperature' || c.scope === 'both'
                      const isRh = c.scope === 'humidity' || c.scope === 'both'
                      const tempDelta = Math.abs(Number(c.temp_delta_f || 0))
                      const rhDelta = Math.abs(Number(c.rh_delta_pct || 0))
                      const isConforme = (!isTemp || tempDelta <= 0.3) && (!isRh || rhDelta <= 3.0)
                      const performer = usersMap[c.performed_by]?.name || 'Metrólogo / Auxiliar'

                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {new Date(c.calibrated_at).toLocaleDateString('es-CO')}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                            {c.scope === 'both' ? 'T°F y HR%' : c.scope === 'temperature' ? 'Temperatura' : 'Humedad'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isTemp && <div>T: {c.temp_machine_f} °F</div>}
                            {isRh && <div>HR: {c.rh_machine_pct} %</div>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isTemp && <div>T: {c.temp_calibrator_f} °F</div>}
                            {isRh && <div>HR: {c.rh_calibrator_pct} %</div>}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: isConforme ? '#10b981' : '#ef4444' }}>
                            {isTemp && <div>ΔT: {c.temp_delta_f} °F</div>}
                            {isRh && <div>ΔHR: {c.rh_delta_pct} %</div>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span className={`pill status ${isConforme ? 'ok' : 'warn'}`} style={{ fontSize: 11 }}>
                              {isConforme ? '✅ CONFORME' : '⚠️ FUERA TOLERANCIA'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', color: '#f8fafc' }}>
                            👨‍🔬 {performer}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {c.photo_screen_path && (
                                <button
                                  className="chip ghost small"
                                  onClick={() => setSelectedPhoto({ title: 'Evidencia Pantalla', path: c.photo_screen_url || c.photo_screen_path })}
                                  style={{ fontSize: 10, padding: '2px 6px' }}
                                >
                                  📷 Pantalla
                                </button>
                              )}
                              {c.photo_calibrator_path && (
                                <button
                                  className="chip ghost small"
                                  onClick={() => setSelectedPhoto({ title: 'Evidencia Patrón', path: c.photo_calibrator_url || c.photo_calibrator_path })}
                                  style={{ fontSize: 10, padding: '2px 6px' }}
                                >
                                  📷 Patrón
                                </button>
                              )}
                              {!c.photo_screen_path && !c.photo_calibrator_path && <span style={{ color: '#64748b' }}>-</span>}
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            <a href="#formato" style={RECORD_LINK} title="Abrir el FOMAT08 diligenciado de esta calibración" onClick={(event) => { event.preventDefault(); openCalibrationFormat(c) }}>
                              FOMAT08 ↗
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ 7. RONDAS DE INSPECCIÓN (FOMAT04) ══ */}
        {activeTab === 'fomat04' && (
          <div>
            <SigDocBanner
              code="FOMAT04"
              name="LISTA DE CHEQUEO DE INSPECCIÓN DE INFRAESTRUCTURA Y EQUIPOS"
              version="01"
              date="18-08-2026"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                  🔍 Chequeos Operativos de Ronda (FOMAT04)
                </h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>
                  Registro de inspección turno a turno de variables mecánicas y visuales.
                </p>
              </div>
            </div>

            {checks.length === 0 ? (
              <p className="hint">No hay chequeos de ronda registrados para este equipo.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px 12px' }}>Fecha y Hora</th>
                      <th style={{ padding: '8px 12px' }}>Turno / Franja</th>
                      <th style={{ padding: '8px 12px' }}>Condición</th>
                      <th style={{ padding: '8px 12px' }}>Observaciones</th>
                      <th style={{ padding: '8px 12px' }}>Foto</th>
                      <th style={{ padding: '8px 12px' }}>Formato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((chk) => (
                      <tr key={chk.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          {new Date(chk.taken_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                          Turno {chk.shift_number || 1} · {chk.hour_slot || 'Ronda regular'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            className={`pill status ${chk.condition === 'normal' ? 'ok' : chk.condition === 'warning' ? 'warn' : 'off'}`}
                            style={{ fontSize: 11 }}
                          >
                            {chk.condition === 'normal' ? '🟢 Sin novedad' : chk.condition === 'warning' ? '🟡 Alerta' : '🔴 Falla'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{chk.notes || 'Operación conforme'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {chk.photo_url ? <a href={chk.photo_url} target="_blank" rel="noopener noreferrer"><img src={chk.photo_url} alt="Evidencia de ronda" style={{ width: 72, height: 48, objectFit: 'cover', borderRadius: 4 }} /></a> : 'Sin foto'}
                        </td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          <a href="#formato" style={RECORD_LINK} title="Abrir el FOMAT04 diligenciado de este chequeo" onClick={(event) => { event.preventDefault(); openCheckFormat(chk) }}>
                            FOMAT04 ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ 8. SENSORES IoT ══ */}
        {activeTab === 'iot' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#f8fafc' }}>
              📡 Telemetría y Sensores IoT Conectados
            </h3>
            <SensorPanel machineId={machine.id} orgId={orgId} canManage={canManage} latest={latest} />
          </div>
        )}
      </div>

      <PlanTaskInstructions task={planTask?.task} manuals={planTask?.manuals || []} onClose={closePlanTask} />

      {/* Modal visor de foto de evidencia */}
      {selectedPhoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            style={{
              background: '#1e293b',
              padding: 16,
              borderRadius: 8,
              maxWidth: 600,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: '#fff' }}>{selectedPhoto.title}</strong>
              <button className="ghost small" onClick={() => setSelectedPhoto(null)}>✕</button>
            </div>
            <div style={{ textAlign: 'center', background: '#0f172a', borderRadius: 4, padding: 8 }}>
              <img
                src={selectedPhoto.path}
                alt="Evidencia"
                style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
