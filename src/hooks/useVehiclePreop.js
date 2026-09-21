/**
 * =============================================================================
 * ARCHIVO: src/hooks/useVehiclePreop.js
 * PROPÓSITO: Hook «useVehiclePreop»: inspecciones preoperacionales FOSST22.
 *   El conductor diligencia y consulta SU historial (evidencia); el líder de
 *   logística y gerencia listan, filtran (conductor/fecha/ruta/cliente),
 *   revisan y exportan. RLS garantiza el alcance por rol.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { suggestCompliance } from '../lib/vehiclePreopCatalog'

function missing(msg) {
  return /does not exist|schema cache|Could not find|PGRST205/i.test(String(msg || ''))
}

export function useVehiclePreop({ orgId, userId, canReview = false }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tableMissing, setTableMissing] = useState(false)

  const load = useCallback(async () => {
    if (!orgId || !userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    // RLS ya limita: conductor → solo lo suyo; líder/gerencia → toda la org
    const { data, error: err } = await supabase
      .from('vehicle_preop_reports')
      .select('*')
      .eq('org_id', orgId)
      .order('inspection_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(800)
    if (err) {
      setTableMissing(missing(err.message))
      setError(missing(err.message) ? null : err.message)
      setReports([])
    } else {
      setTableMissing(false)
      setError(null)
      setReports(data ?? [])
    }
    setLoading(false)
  }, [orgId, userId])

  useEffect(() => {
    load()
  }, [load])

  /** Envía la inspección del conductor (queda como evidencia) */
  const submitReport = useCallback(
    async (form) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      if (!form.vehiclePlate?.trim()) return { error: 'La placa del vehículo es obligatoria' }
      if (!form.driverName?.trim()) return { error: 'El nombre del conductor es obligatorio' }

      const { compliant } = suggestCompliance(form.items || [])
      const row = {
        org_id: orgId,
        driver_user_id: userId,
        driver_name: form.driverName.trim(),
        driver_cc: form.driverCc?.trim() || null,
        license_number: form.licenseNumber?.trim() || null,
        license_category: form.licenseCategory?.trim() || null,
        license_expiry: form.licenseExpiry || null,
        work_shift: form.workShift?.trim() || null,
        vehicle_plate: form.vehiclePlate.trim().toUpperCase(),
        vehicle_model: form.vehicleModel?.trim() || null,
        inspection_date: form.inspectionDate || new Date().toLocaleDateString('sv-SE'),
        route_name: form.routeName?.trim() || null,
        client_name: form.clientName?.trim() || null,
        items: form.items || [],
        maintenance_dates: form.maintenanceDates || {},
        compliant: form.compliant ?? compliant,
        commitments: form.commitments?.trim() || null,
        driver_signed: true,
        status: 'submitted',
      }
      const { data, error: err } = await supabase
        .from('vehicle_preop_reports')
        .insert(row)
        .select()
        .single()
      if (err) return { error: err.message }
      setReports((list) => [data, ...list])
      return { error: null, report: data }
    },
    [orgId, userId]
  )

  /** El líder revisa y sella el reporte (queda inmutable) */
  const reviewReport = useCallback(
    async (id, reviewerName) => {
      if (!canReview) return { error: 'Solo el líder de logística o gerencia puede revisar' }
      const patch = {
        status: 'reviewed',
        reviewer_id: userId,
        reviewer_name: reviewerName || null,
        reviewed_at: new Date().toISOString(),
      }
      const { error: err } = await supabase
        .from('vehicle_preop_reports')
        .update(patch)
        .eq('id', id)
      if (err) return { error: err.message }
      setReports((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
      return { error: null }
    },
    [canReview, userId]
  )

  const myReports = useMemo(
    () => reports.filter((r) => r.driver_user_id === userId),
    [reports, userId]
  )

  /** Filtro en memoria para la vista del líder y los exportes */
  const filterReports = useCallback(
    ({ driver = '', from = '', to = '', route = '', client = '', plate = '' } = {}) => {
      const d = driver.trim().toLowerCase()
      const rt = route.trim().toLowerCase()
      const cl = client.trim().toLowerCase()
      const pl = plate.trim().toLowerCase()
      return reports.filter((r) => {
        if (d && !String(r.driver_name || '').toLowerCase().includes(d)) return false
        if (pl && !String(r.vehicle_plate || '').toLowerCase().includes(pl)) return false
        if (rt && !String(r.route_name || '').toLowerCase().includes(rt)) return false
        if (cl && !String(r.client_name || '').toLowerCase().includes(cl)) return false
        if (from && String(r.inspection_date) < from) return false
        if (to && String(r.inspection_date) > to) return false
        return true
      })
    },
    [reports]
  )

  return {
    reports,
    myReports,
    loading,
    error,
    tableMissing,
    reload: load,
    submitReport,
    reviewReport,
    filterReports,
  }
}
