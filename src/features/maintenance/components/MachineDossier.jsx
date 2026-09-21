/**
 * src/components/MachineDossier.jsx
 * Dossier SIG Integral de MÃ¡quina (AuditorÃ­a SIG / CDH Maker).
 * Integra en un solo componente todos los requerimientos de auditorÃ­a y operaciÃ³n:
 * - Hoja de Vida del Equipo (FOMAT03)
 * - Componentes y Vida Ãštil de Piezas
 * - Plan de Mantenimiento AM y CreaciÃ³n AutomÃ¡tica de OTs (FOMAT07)
 * - Ã“rdenes de Trabajo con TÃ©cnico Ejecutor y LÃ­der Aprobador (FOMAT01 + HistÃ³rico Mantum)
 * - Calibraciones con Lecturas, Deltas y Evidencias FotogrÃ¡ficas (FOMAT08)
 * - Inspecciones de Ronda (FOMAT04)
 * - Estado Operativo en Tiempo Real y SemÃ¡foro de AuditorÃ­a
 * - ExportaciÃ³n oficial FOMAT03 a Excel
 */

import { useState } from 'react'
import { useMachineDossier } from '../features/maintenance/hooks/useMachineDossier'
import { exportFomat03Excel } from '../lib/exportFomat03'
import { IncubantSigPill } from './Brand'
import SensorPanel from './SensorPanel'

function SigDocBanner({ code, name, version = '01', date = '18-08-2026', process = 'GESTIÃ“N DE MANTENIMIENTO', onAction = null, actionLabel = null }) {
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
          ANTIOQUEÃ‘A DE INCUBACIÃ“N S.A.S. Â· SIG (ISO 9001)
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginTop: 1 }}>
          {code} â€” {name}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
          VersiÃ³n: <strong>{version}</strong> Â· Fecha: <strong>{date}</strong> Â· Proceso: <strong>{process}</strong> Â· <em>"Nuestra calidad nos define."</em>
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
  { id: 'resumen', label: 'ðŸ“Š Resumen & AuditorÃ­a' },
  { id: 'fomat03', label: 'ðŸ“‹ Hoja de Vida (FOMAT03)' },
  { id: 'componentes', label: 'âš™ï¸ Componentes & Vida Ãštil' },
  { id: 'fomat07', label: 'ðŸ“… Plan AM & OTs Auto (FOMAT07)' },
  { id: 'fomat01', label: 'ðŸ”§ Ã“rdenes de Trabajo (FOMAT01)' },
  { id: 'fomat08', label: 'ðŸŽ¯ Calibraciones (FOMAT08)' },
  { id: 'fomat04', label: 'ðŸ” Rondas (FOMAT04)' },
  { id: 'iot', label: 'ðŸ“¡ Sensores IoT' },
]

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
    mantum,
    stats,
    createAutoWorkOrder,
    reload,
  } = useMachineDossier(machineId, orgId)

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: 24, textAlign: 'center' }}>
        <p className="hint">â³ Cargando expediente SIG completo del activoâ€¦</p>
      </div>
    )
  }

  if (error || !machine) {
    return (
      <div className="glass-card" style={{ padding: 24 }}>
        <p className="msg error">âŒ {error || 'No se encontrÃ³ la informaciÃ³n del activo'}</p>
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
        text: `âœ… OT automÃ¡tica creada con Ã©xito (${res.data?.code || 'CÃ³digo generado'}). Visible en pestaÃ±a Ã“rdenes de Trabajo.`,
      })
      setTimeout(() => setAutoOtMsg(null), 6000)
    }
  }

  // SemÃ¡foro visual
  const semaforoColor = stats?.auditSemaphore === 'green' ? '#10b981' : stats?.auditSemaphore === 'yellow' ? '#f59e0b' : '#ef4444'
  const semaforoBg = stats?.auditSemaphore === 'green' ? 'rgba(16, 185, 129, 0.12)' : stats?.auditSemaphore === 'yellow' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)'

  return (
    <div className="machine-dossier glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-color, #334155)' }}>
      {/* â”€â”€ HEADER PRINCIPAL AUDITORÃA â”€â”€ */}
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
              ðŸ­
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
              {machine.status === 'active' ? 'ðŸŸ¢ Operativa' : machine.status === 'maintenance' ? 'ðŸŸ¡ En Mtto' : 'âšª ' + machine.status}
            </span>
            <IncubantSigPill text="SIG Â· AntioqueÃ±a de IncubaciÃ³n SAS" />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: '#94a3b8' }}>
            <span>ðŸ“ <strong>UbicaciÃ³n:</strong> {room ? `${room.name} (${room.code})` : 'Sin sala asignada'}</span>
            <span>ðŸ­ <strong>Planta:</strong> {plant?.name || 'Incubadora Principal'}</span>
            <span>ðŸ·ï¸ <strong>Marca/Modelo:</strong> {[machine.brand, machine.model].filter(Boolean).join(' ') || 'Petersime BioStreamer'}</span>
            <span>â­ <strong>Criticidad:</strong> {machine.criticidad || mantum?.equipo?.criticidad || 'Media'}</span>
          </div>

          {/* Estado Operativo / Fase de Ciclo */}
          {opsState && (
            <div style={{ marginTop: 8, fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap', color: '#38bdf8' }}>
              <span>ðŸ”„ <strong>Fase actual:</strong> {opsState.phase}</span>
              {opsState.lote && <span>ðŸ“¦ <strong>Lote:</strong> {opsState.lote}</span>}
              {opsState.age_hours > 0 && <span>â±ï¸ <strong>Edad ciclo:</strong> {Math.round(opsState.age_hours)}h</span>}
              {opsState.calib_due && <span style={{ color: '#f59e0b', fontWeight: 600 }}>âš ï¸ Ventana de CalibraciÃ³n abierta</span>}
            </div>
          )}
        </div>

        {/* SemÃ¡foro de AuditorÃ­a SIG & Acciones */}
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
            <span style={{ fontSize: 16 }}>{stats?.auditSemaphore === 'green' ? 'âœ…' : stats?.auditSemaphore === 'yellow' ? 'âš ï¸' : 'âŒ'}</span>
            <span>{stats?.auditSummary || 'Conforme con SIG'}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="chip primary small"
              onClick={handleExportExcel}
              title="Descarga la Hoja de Vida oficial del SIG en formato Excel (FOMAT03)"
              style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              ðŸ“¥ Exportar Hoja de Vida (FOMAT03)
            </button>
            {onClose && (
              <button className="chip ghost small" onClick={onClose} title="Cerrar ficha">
                âœ• Cerrar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* â”€â”€ BARRA DE PESTAÃ‘AS â”€â”€ */}
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

      {/* NotificaciÃ³n de acciones automÃ¡ticas */}
      {autoOtMsg && (
        <div style={{ padding: '10px 24px', background: autoOtMsg.type === 'ok' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13 }}>
          {autoOtMsg.text}
        </div>
      )}

      {/* â”€â”€ CONTENIDO DE PESTAÃ‘AS â”€â”€ */}
      <div style={{ padding: 24 }}>
        {/* â•â• 1. RESUMEN & AUDITORÃA â•â• */}
        {activeTab === 'resumen' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {/* Card 1: Estado MetrolÃ³gico (FOMAT08) */}
            <div className="glass-card" style={{ padding: 18, borderLeft: `4px solid ${stats?.calibColor === 'green' ? '#10b981' : stats?.calibColor === 'red' ? '#ef4444' : '#94a3b8'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>ðŸŽ¯ CalibraciÃ³n de Sensores</strong>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>FOMAT08</span>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: stats?.calibColor === 'green' ? '#10b981' : stats?.calibColor === 'red' ? '#ef4444' : '#cbd5e1' }}>
                {stats?.calibStatusLabel}
              </p>
              {stats?.lastCalibration ? (
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                  <div>ðŸ“… Ãšltima calibraciÃ³n: {new Date(stats.lastCalibration.calibrated_at).toLocaleDateString('es-CO')}</div>
                  <div>ðŸŒ¡ï¸ Delta Temp: <strong>{stats.lastCalibration.temp_delta_f ?? 'N/A'} Â°F</strong> (Tolerancia: Â±0.3Â°F)</div>
                  <div>ðŸ’§ Delta HR: <strong>{stats.lastCalibration.rh_delta_pct ?? 'N/A'} %</strong> (Tolerancia: Â±3.0%)</div>
                </div>
              ) : (
                <p className="hint">No registra calibraciones recientes.</p>
              )}
              <button className="chip ghost small" onClick={() => setActiveTab('fomat08')} style={{ marginTop: 12 }}>
                Ver historial y evidencias â†’
              </button>
            </div>

            {/* Card 2: Rondas de InspecciÃ³n (FOMAT04) */}
            <div className="glass-card" style={{ padding: 18, borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>ðŸ” Inspecciones de Ronda</strong>
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
                Ver lista de chequeos â†’
              </button>
            </div>

            {/* Card 3: Ã“rdenes de Trabajo (FOMAT01) */}
            <div className="glass-card" style={{ padding: 18, borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>ðŸ”§ Ã“rdenes de Trabajo</strong>
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
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>HistÃ³rico Mantum</div>
                </div>
              </div>
              <button className="chip ghost small" onClick={() => setActiveTab('fomat01')} style={{ marginTop: 12 }}>
                Ver OTs e historial â†’
              </button>
            </div>

            {/* Card 4: Plan de Mantenimiento AM (FOMAT07) */}
            <div className="glass-card" style={{ padding: 18, borderLeft: '4px solid #ec4899' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 15, color: '#f8fafc' }}>ðŸ“… Plan Anual AM</strong>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>FOMAT07</span>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 700, color: '#f472b6' }}>
                {(mantum?.maintenancePlan || []).length} <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>tareas programadas</span>
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                Tareas preventivas y correctivas listas para generar Ã³rdenes de trabajo automÃ¡ticas.
              </p>
              <button className="chip ghost small" onClick={() => setActiveTab('fomat07')} style={{ marginTop: 12 }}>
                Ver Plan y generar OTs â†’
              </button>
            </div>
          </div>
        )}

        {/* â•â• 2. HOJA DE VIDA (FOMAT03) â•â• */}
        {activeTab === 'fomat03' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <SigDocBanner
              code="FOMAT03"
              name="HOJA DE VIDA DEL EQUIPO"
              version="01"
              date="18-08-2026"
              actionLabel="ðŸ“¥ Descargar Hoja de Vida (.xlsx)"
              onAction={handleExportExcel}
            />
            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>ðŸ“‹</span> 1. IdentificaciÃ³n Oficial del Equipo (Placa y Registro)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>CÃ³digo Interno:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{machine.code}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Nombre Oficial:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{machine.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>CÃ³digo Mantum / SIG:</div>
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
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{machine.brand || 'Petersime'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Modelo:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{machine.model || 'BioStreamer 24S / Convencional'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>NÃºmero de Serie:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.serial_number || mantum?.equipo?.serial_number || 'D0757-D158500084700L'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Capacidad Nominal:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.capacity_eggs ? `${Number(machine.capacity_eggs).toLocaleString('es-CO')} huevos` : 'EstÃ¡ndar'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Fecha de InstalaciÃ³n:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.installed_at ? new Date(machine.installed_at).toLocaleDateString('es-CO') : '2019-05-10'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Vida Ãštil Estimada:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {machine.useful_life_years || 10} aÃ±os (RenovaciÃ³n periÃ³dica de componentes)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Manual TÃ©cnico OEM:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>
                    Disponible en Repositorio SIG (Digitalizado Mantum)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Responsable TÃ©cnico:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {mantum?.equipo?.responsable || 'Auxiliar de Mantenimiento / LÃ­der de Planta'}
                  </div>
                </div>
              </div>
            </div>

            {/* AsignaciÃ³n y gestiÃ³n rÃ¡pida para LÃ­der */}
            {canManage && (
              <div className="glass-card" style={{ padding: 20 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#cbd5e1' }}>âš™ï¸ ModificaciÃ³n de UbicaciÃ³n y Estado (LÃ­der / Admin)</h4>
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
                      <option value="active">Activa (En operaciÃ³n)</option>
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

        {/* â•â• 3. COMPONENTES & VIDA ÃšTIL â•â• */}
        {activeTab === 'componentes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                  âš™ï¸ Desglose de Componentes CrÃ­ticos y Estado de Vida Ãštil
                </h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>
                  InformaciÃ³n integrada de piezas y partes de recambio segÃºn manual Mantum.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '10px 12px' }}>CÃ³digo</th>
                    <th style={{ padding: '10px 12px' }}>Componente</th>
                    <th style={{ padding: '10px 12px' }}>EspecificaciÃ³n TÃ©cnica</th>
                    <th style={{ padding: '10px 12px' }}>Referencia OEM</th>
                    <th style={{ padding: '10px 12px' }}>Vida Ãštil Estimada</th>
                    <th style={{ padding: '10px 12px' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(mantum?.components || []).map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#60a5fa' }}>{c.code}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f8fafc' }}>{c.name}</td>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{c.component_spec}</td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{c.reference || 'OEM EstÃ¡ndar'}</td>
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

        {/* â•â• 4. PLAN DE MANTENIMIENTO AM (FOMAT07) â•â• */}
        {activeTab === 'fomat07' && (
          <div>
            <SigDocBanner
              code="FOMAT07"
              name="PLAN ANUAL DE MANTENIMIENTO"
              version="01"
              date="18-08-2026"
              actionLabel="ðŸ“¥ Descargar Plan con Hoja de Vida"
              onAction={handleExportExcel}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                  ðŸ“… Tareas Programadas del Plan de Mantenimiento AM (FOMAT07)
                </h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>
                  Seleccione cualquier tarea para generar automÃ¡ticamente la Orden de Trabajo correspondiente en IncubApp.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '10px 12px' }}>CÃ³digo Plan</th>
                    <th style={{ padding: '10px 12px' }}>Actividad Programada</th>
                    <th style={{ padding: '10px 12px' }}>Tipo</th>
                    <th style={{ padding: '10px 12px' }}>Especialidad</th>
                    <th style={{ padding: '10px 12px' }}>Frecuencia</th>
                    <th style={{ padding: '10px 12px' }}>Estado</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>AcciÃ³n</th>
                  </tr>
                </thead>
                <tbody>
                  {(mantum?.maintenancePlan || []).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f472b6' }}>{p.plan_code}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f8fafc' }}>{p.activity}</td>
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
                          onClick={() => handleCreateAutoOt(p)}
                          disabled={autoOtBusy === (p.plan_code || p.activity)}
                          style={{ fontSize: 11, padding: '4px 8px' }}
                        >
                          {autoOtBusy === (p.plan_code || p.activity) ? 'Generandoâ€¦' : 'âš¡ Crear OT Auto'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* â•â• 5. Ã“RDENES DE TRABAJO (FOMAT01) â•â• */}
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
                ðŸ“‹ Ã“rdenes de Trabajo Activas y Recientes (IncubApp)
              </h3>
              {workOrders.length === 0 ? (
                <p className="hint">No hay Ã³rdenes de trabajo abiertas en la plataforma para este equipo.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '8px 12px' }}>CÃ³digo</th>
                        <th style={{ padding: '8px 12px' }}>TÃ­tulo / Tarea</th>
                        <th style={{ padding: '8px 12px' }}>Tipo</th>
                        <th style={{ padding: '8px 12px' }}>Prioridad</th>
                        <th style={{ padding: '8px 12px' }}>TÃ©cnico Asignado</th>
                        <th style={{ padding: '8px 12px' }}>LÃ­der / Autor</th>
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
                              {wo.title}
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
                            <td style={{ padding: '8px 12px', color: '#f8fafc' }}>ðŸ‘¨â€ðŸ”§ {assignedUser}</td>
                            <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>ðŸ‘” {creatorUser}</td>
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

            {/* HistÃ³rico Cerrado Mantum */}
            <div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#f8fafc' }}>
                ðŸ“š Historial Consolidado de Intervenciones (Mantum)
              </h3>
              <p className="hint" style={{ margin: '0 0 12px 0' }}>
                Registro de trazabilidad histÃ³rica con el personal tÃ©cnico ejecutor y lÃ­der registrador.
              </p>
              {(mantum?.historicalOTs || []).length === 0 ? (
                <p className="hint">No hay intervenciones histÃ³ricas registradas para este equipo.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '8px 12px' }}>OT Mantum</th>
                        <th style={{ padding: '8px 12px' }}>Fecha</th>
                        <th style={{ padding: '8px 12px' }}>Actividad Realizada</th>
                        <th style={{ padding: '8px 12px' }}>TÃ©cnico que AtendiÃ³ (Ejecutor)</th>
                        <th style={{ padding: '8px 12px' }}>LÃ­der / Registro</th>
                        <th style={{ padding: '8px 12px' }}>RetroalimentaciÃ³n / Cierre</th>
                        <th style={{ padding: '8px 12px' }}>Costo Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mantum.historicalOTs.map((ot, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f59e0b' }}>{ot.code}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{ot.created_at || ot.started_at}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 500, color: '#f8fafc' }}>{ot.activity}</td>
                          <td style={{ padding: '8px 12px', color: '#60a5fa' }}>ðŸ‘¨â€ðŸ”§ {ot.technician}</td>
                          <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>ðŸ‘” {ot.approver || 'LÃ­der Mantum'}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12, maxWidth: 300 }}>{ot.feedback || ot.description || '-'}</td>
                          <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 600 }}>${ot.cost || '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* â•â• 6. CALIBRACIONES (FOMAT08) â•â• */}
        {activeTab === 'fomat08' && (
          <div>
            <SigDocBanner
              code="FOMAT08"
              name="CALIBRACIÃ“N DE EQUIPOS"
              version="01"
              date="18-08-2026"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                  ðŸŽ¯ Historial de CalibraciÃ³n de Sensores (FOMAT08)
                </h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>
                  Tolerancia oficial del Sistema Integrado de GestiÃ³n: Temperatura <strong>Â±0.3 Â°F</strong> Â· Humedad Relativa <strong>Â±3.0 %</strong>.
                </p>
              </div>
            </div>

            {calibrations.length === 0 ? (
              <p className="hint">No hay registros de calibraciÃ³n para este equipo en el sistema.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px 12px' }}>Fecha</th>
                      <th style={{ padding: '8px 12px' }}>Alcance</th>
                      <th style={{ padding: '8px 12px' }}>Lectura Pantalla</th>
                      <th style={{ padding: '8px 12px' }}>Lectura PatrÃ³n</th>
                      <th style={{ padding: '8px 12px' }}>Delta Hallado</th>
                      <th style={{ padding: '8px 12px' }}>EvaluaciÃ³n SIG</th>
                      <th style={{ padding: '8px 12px' }}>MetrÃ³logo / Ejecutor</th>
                      <th style={{ padding: '8px 12px' }}>Evidencias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibrations.map((c) => {
                      const isTemp = c.scope === 'temperature' || c.scope === 'both'
                      const isRh = c.scope === 'humidity' || c.scope === 'both'
                      const tempDelta = Math.abs(Number(c.temp_delta_f || 0))
                      const rhDelta = Math.abs(Number(c.rh_delta_pct || 0))
                      const isConforme = (!isTemp || tempDelta <= 0.3) && (!isRh || rhDelta <= 3.0)
                      const performer = usersMap[c.performed_by]?.name || 'MetrÃ³logo / Auxiliar'

                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {new Date(c.calibrated_at).toLocaleDateString('es-CO')}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                            {c.scope === 'both' ? 'TÂ°F y HR%' : c.scope === 'temperature' ? 'Temperatura' : 'Humedad'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isTemp && <div>T: {c.temp_machine_f} Â°F</div>}
                            {isRh && <div>HR: {c.rh_machine_pct} %</div>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {isTemp && <div>T: {c.temp_calibrator_f} Â°F</div>}
                            {isRh && <div>HR: {c.rh_calibrator_pct} %</div>}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: isConforme ? '#10b981' : '#ef4444' }}>
                            {isTemp && <div>Î”T: {c.temp_delta_f} Â°F</div>}
                            {isRh && <div>Î”HR: {c.rh_delta_pct} %</div>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span className={`pill status ${isConforme ? 'ok' : 'warn'}`} style={{ fontSize: 11 }}>
                              {isConforme ? 'âœ… CONFORME' : 'âš ï¸ FUERA TOLERANCIA'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', color: '#f8fafc' }}>
                            ðŸ‘¨â€ðŸ”¬ {performer}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {c.photo_screen_path && (
                                <button
                                  className="chip ghost small"
                                  onClick={() => setSelectedPhoto({ title: 'Evidencia Pantalla', path: c.photo_screen_path })}
                                  style={{ fontSize: 10, padding: '2px 6px' }}
                                >
                                  ðŸ“· Pantalla
                                </button>
                              )}
                              {c.photo_calibrator_path && (
                                <button
                                  className="chip ghost small"
                                  onClick={() => setSelectedPhoto({ title: 'Evidencia PatrÃ³n', path: c.photo_calibrator_path })}
                                  style={{ fontSize: 10, padding: '2px 6px' }}
                                >
                                  ðŸ“· PatrÃ³n
                                </button>
                              )}
                              {!c.photo_screen_path && !c.photo_calibrator_path && <span style={{ color: '#64748b' }}>-</span>}
                            </div>
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

        {/* â•â• 7. RONDAS DE INSPECCIÃ“N (FOMAT04) â•â• */}
        {activeTab === 'fomat04' && (
          <div>
            <SigDocBanner
              code="FOMAT04"
              name="LISTA DE CHEQUEO DE INSPECCIÃ“N DE INFRAESTRUCTURA Y EQUIPOS"
              version="01"
              date="18-08-2026"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
                  ðŸ” Chequeos Operativos de Ronda (FOMAT04)
                </h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>
                  Registro de inspecciÃ³n turno a turno de variables mecÃ¡nicas y visuales.
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
                      <th style={{ padding: '8px 12px' }}>CondiciÃ³n</th>
                      <th style={{ padding: '8px 12px' }}>Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((chk) => (
                      <tr key={chk.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          {new Date(chk.taken_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                          Turno {chk.shift_number || 1} Â· {chk.hour_slot || 'Ronda regular'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            className={`pill status ${chk.condition === 'normal' ? 'ok' : chk.condition === 'warning' ? 'warn' : 'off'}`}
                            style={{ fontSize: 11 }}
                          >
                            {chk.condition === 'normal' ? 'ðŸŸ¢ Sin novedad' : chk.condition === 'warning' ? 'ðŸŸ¡ Alerta' : 'ðŸ”´ Falla'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{chk.notes || 'OperaciÃ³n conforme'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* â•â• 8. SENSORES IoT â•â• */}
        {activeTab === 'iot' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#f8fafc' }}>
              ðŸ“¡ TelemetrÃ­a y Sensores IoT Conectados
            </h3>
            <SensorPanel machineId={machine.id} orgId={orgId} canManage={canManage} latest={latest} />
          </div>
        )}
      </div>

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
              <button className="ghost small" onClick={() => setSelectedPhoto(null)}>âœ•</button>
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

