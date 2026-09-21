/**
 * src/hooks/useMachineDossier.js
 * Hook unificado para el Dossier SIG Integral de Máquina (Auditoría SIG / CDH Maker).
 * Consolida en tiempo real:
 * - Ficha de equipo + datos técnicos (FOMAT03)
 * - Estado operativo en vivo (machine_ops_state)
 * - Historial completo de calibraciones con fotos de evidencia (FOMAT08)
 * - Órdenes de trabajo vivas + históricas de Mantum con ejecutores y aprobadores (FOMAT01)
 * - Rondas de inspección (FOMAT04)
 * - Plan de mantenimiento AM anual + creación automática de OTs (FOMAT07)
 * - Catálogo de componentes y vida útil
 * - Imágenes reales del activo
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getMantumDataForMachine } from '../data/mantumCatalog'

export function useMachineDossier(machineId, orgId) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Datos de base de datos
  const [machine, setMachine] = useState(null)
  const [room, setRoom] = useState(null)
  const [plant, setPlant] = useState(null)
  const [opsState, setOpsState] = useState(null)
  const [calibrations, setCalibrations] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [checks, setChecks] = useState([])
  const [usersMap, setUsersMap] = useState({})
  const [assetEvidence, setAssetEvidence] = useState([])

  const loadDossier = useCallback(async () => {
    if (!machineId) {
      setMachine(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Obtener la máquina (intentamos todas las columnas; si falla alguna nueva columna, hacemos fallback)
      let mData = null
      const fullQuery = await supabase
        .from('machines')
        .select('*')
        .eq('id', machineId)
        .eq('org_id', orgId)
        .maybeSingle()

      if (fullQuery.error) {
        // Fallback a columnas estándar seguras
        const safeQuery = await supabase
          .from('machines')
          .select('id, code, name, type, brand, model, capacity_eggs, status, installed_at, room_id, plant_id')
          .eq('id', machineId)
          .eq('org_id', orgId)
          .maybeSingle()
        if (safeQuery.error) throw safeQuery.error
        mData = safeQuery.data
      } else {
        mData = fullQuery.data
      }

      if (!mData) {
        throw new Error('Equipo no encontrado')
      }
      setMachine(mData)

      // 2. Traer en paralelo los registros complementarios
      const [rRes, pRes, opsRes, calRes, woRes, chkRes, memRes] = await Promise.all([
        // Sala
        mData.room_id
          ? supabase.from('rooms').select('id, name, code, type').eq('id', mData.room_id).maybeSingle()
          : Promise.resolve({ data: null }),
        // Planta
        mData.plant_id
          ? supabase.from('plants').select('id, name, code, city, address').eq('id', mData.plant_id).maybeSingle()
          : Promise.resolve({ data: null }),
        // Estado operativo
        supabase
          .from('machine_ops_state')
          .select('*')
          .eq('machine_id', machineId)
          .maybeSingle(),
        // Calibraciones FOMAT08
        supabase
          .from('machine_calibrations')
          .select('*')
          .eq('machine_id', machineId)
          .eq('org_id', orgId)
          .order('calibrated_at', { ascending: false })
          .limit(50),
        // Órdenes de trabajo FOMAT01
        supabase
          .from('work_orders')
          .select('*')
          .eq('machine_id', machineId)
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(50),
        // Chequeos de ronda FOMAT04
        supabase
          .from('machine_checks')
          .select('*')
          .eq('machine_id', machineId)
          .eq('org_id', orgId)
          .order('taken_at', { ascending: false })
          .limit(60),
        // Miembros de la organización para mapear IDs a nombres
        orgId
          ? supabase
            .from('organization_members')
            .select('user_id, role, profiles ( id, full_name, email )')
            .eq('org_id', orgId)
          : Promise.resolve({ data: [] }),
      ])

      setRoom(rRes?.data || null)
      setPlant(pRes?.data || null)
      setOpsState(opsRes?.data || null)
      const signedCalibration = async (record) => {
        const sign = async (bucket, filePath) => {
          if (!filePath) return null
          const { data } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600)
          return data?.signedUrl || null
        }
        return {
          ...record,
          photo_screen_url: await sign('wo-evidence', record.photo_screen_path),
          photo_calibrator_url: await sign('wo-evidence', record.photo_calibrator_path),
        }
      }
      const signedChecks = await Promise.all((chkRes?.data || []).map(async (check) => {
        if (!check.photo_path) return check
        const { data } = await supabase.storage.from('machine-checks').createSignedUrl(check.photo_path, 3600)
        return { ...check, photo_url: data?.signedUrl || null }
      }))
      setCalibrations(await Promise.all((calRes?.data || []).map(signedCalibration)))
      setWorkOrders(woRes?.data || [])
      setChecks(signedChecks)

      const { data: registry } = await supabase
        .from('sig_evidence')
        .select('id, source, format_code, title, file_name, file_path, file_type, recorded_at')
        .eq('org_id', orgId)
        .or(`machine_id.eq.${machineId},machine_code.eq.${mData.code}`)
        .order('recorded_at', { ascending: false })
      const signedEvidence = await Promise.all((registry || []).map(async (file) => {
        const { data: signed } = await supabase.storage.from('sig-evidence').createSignedUrl(file.file_path, 3600)
        return { ...file, url: signed?.signedUrl || null }
      }))
      setAssetEvidence(signedEvidence)

      // Mapeo de usuarios
      const uMap = {}
      if (memRes?.data) {
        for (const m of memRes.data) {
          const name = m.profiles?.full_name || m.profiles?.email || m.user_id
          uMap[m.user_id] = { name, role: m.role }
        }
      }
      setUsersMap(uMap)
    } catch (err) {
      console.error('Error cargando dossier SIG de máquina:', err)
      setError(err.message || 'Error al cargar los datos del equipo')
    } finally {
      setLoading(false)
    }
  }, [machineId, orgId])

  useEffect(() => {
    loadDossier()
  }, [loadDossier])

  // Datos Mantum cruzados (imagen, ficha Mantum, componentes, plan AM, OTs históricas)
  const mantum = useMemo(() => {
    if (!machine) return null
    return getMantumDataForMachine(machine)
  }, [machine])

  // Cálculo de KPIs y Semáforos SIG para Auditoría
  const stats = useMemo(() => {
    if (!machine) return null

    // 1. Estado de Calibración
    const lastCal = calibrations[0] || null
    let calibStatus = 'sin_datos'
    let calibStatusLabel = 'Sin calibraciones registradas'
    let calibColor = 'gray'

    if (lastCal) {
      const tempDelta = Math.abs(Number(lastCal.temp_delta_f || 0))
      const rhDelta = Math.abs(Number(lastCal.rh_delta_pct || 0))
      // Tolerancia estándar SIG: Temp ±0.3°F, Humedad ±3.0%
      const outOfTol = tempDelta > 0.3 || rhDelta > 3.0
      if (outOfTol) {
        calibStatus = 'fuera_tolerancia'
        calibStatusLabel = 'Fuera de tolerancia SIG'
        calibColor = 'red'
      } else {
        calibStatus = 'en_tolerancia'
        calibStatusLabel = 'Dentro de tolerancia (Conforme)'
        calibColor = 'green'
      }
    }

    // 2. Rondas de inspección (FOMAT04)
    const totalChecks = checks.length
    const normalChecks = checks.filter((c) => c.condition === 'normal').length
    const checkCompliancePct = totalChecks > 0 ? Math.round((normalChecks / totalChecks) * 100) : 100

    // 3. Órdenes de Trabajo (FOMAT01)
    const openWOs = workOrders.filter((w) => w.status === 'open' || w.status === 'in_progress')
    const completedWOs = workOrders.filter((w) => w.status === 'completed')

    // 4. Semáforo Global del Activo para Auditoría
    let auditSemaphore = 'green' // green | yellow | red
    let auditSummary = 'Equipo 100% conforme con estándares SIG'

    if (calibStatus === 'fuera_tolerancia' || machine.status === 'fault' || openWOs.some((w) => w.priority === 'urgent')) {
      auditSemaphore = 'red'
      auditSummary = 'Atención requerida: No conformidad o falla activa'
    } else if (openWOs.length > 0 || checkCompliancePct < 90 || machine.status === 'maintenance') {
      auditSemaphore = 'yellow'
      auditSummary = 'Operativo con observaciones / OTs pendientes'
    }

    return {
      lastCalibration: lastCal,
      calibStatus,
      calibStatusLabel,
      calibColor,
      totalChecks,
      normalChecks,
      checkCompliancePct,
      openWOsCount: openWOs.length,
      completedWOsCount: completedWOs.length,
      auditSemaphore,
      auditSummary,
    }
  }, [machine, calibrations, checks, workOrders])

  // Crear Orden de Trabajo Automática a partir de una tarea del Plan de Mantenimiento AM
  const createAutoWorkOrder = useCallback(
    async (planTask, customNotes = '') => {
      if (!machine || !orgId) return { error: 'Faltan datos del equipo o la organización' }

      try {
        const title = `[AM-SIG] ${planTask.activity || 'Mantenimiento Preventivo'}`
        const code = `OT-AM-${machine.code || 'EQ'}-${Date.now().toString().slice(-4)}`
        const desc = `Generada automáticamente desde el Plan de Mantenimiento AM (FOMAT07).\n` +
          `Código Tarea: ${planTask.plan_code || 'S/C'}\n` +
          `Especialidad: ${planTask.specialty || 'General'}\n` +
          `Frecuencia programada: ${planTask.frequency || 'Periódica'}\n` +
          (customNotes ? `\nObservaciones adicionales: ${customNotes}` : '')

        const row = {
          org_id: orgId,
          plant_id: machine.plant_id || null,
          machine_id: machine.id,
          room_id: machine.room_id || null,
          code,
          title,
          description: desc,
          type: (planTask.type || 'preventive').toLowerCase().includes('corr') ? 'corrective' : 'preventive',
          priority: 'medium',
          status: 'open',
          source: 'maintenance_plan',
          auto_generated: true,
          maintenance_plan_code: planTask.plan_code || null,
        }

        const { data, error: insertErr } = await supabase
          .from('work_orders')
          .insert(row)
          .select()
          .single()

        if (insertErr) throw insertErr

        // Recargar OTs para reflejar inmediatamente la nueva orden
        await loadDossier()
        return { data, error: null }
      } catch (err) {
        console.error('Error al generar OT automática:', err)
        return { data: null, error: err.message || 'No se pudo crear la OT' }
      }
    },
    [machine, orgId, loadDossier]
  )

  return {
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
    reload: loadDossier,
  }
}
