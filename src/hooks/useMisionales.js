/**
 * Desplazamientos misionales — inspecciones pre-operacionales multi-tenant.
 * Supabase + fallback localStorage.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularPorcentaje, normalizePlaca } from '../lib/misionalesCatalog'

const LS_KEY = 'incubapp_misionales_v1'

function readLocal(orgId) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    return Array.isArray(all[orgId]) ? all[orgId] : []
  } catch {
    return []
  }
}

function writeLocal(orgId, list) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    all[orgId] = list
    localStorage.setItem(LS_KEY, JSON.stringify(all))
  } catch {
    /* */
  }
}

function missingTable(msg) {
  return /does not exist|schema cache|relation|PGRST205|Could not find/i.test(String(msg || ''))
}

function uid() {
  return `mis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function useMisionales(orgId, userId, { canSeeAll = false } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    let q = supabase
      .from('mission_inspections')
      .select('*')
      .eq('org_id', orgId)
      .order('inspected_at', { ascending: false })
      .limit(400)

    if (!canSeeAll && userId) {
      q = q.eq('user_id', userId)
    }

    const { data, error: err } = await q
    if (err) {
      if (missingTable(err.message)) {
        setLocalMode(true)
        let list = readLocal(orgId)
        if (!canSeeAll && userId) list = list.filter((r) => r.user_id === userId)
        setRows(list)
        setError(null)
      } else {
        setError(err.message)
        setRows([])
      }
    } else {
      setLocalMode(false)
      setRows(data || [])
    }
    setLoading(false)
  }, [orgId, userId, canSeeAll])

  useEffect(() => {
    load()
  }, [load])

  const createInspection = useCallback(
    async (payload) => {
      if (!orgId || !userId) return { error: 'Sesión inválida' }
      const aspectos = payload.aspectos || {}
      const pct = calcularPorcentaje(aspectos)
      const row = {
        id: uid(),
        org_id: orgId,
        user_id: userId,
        inspected_at: new Date().toISOString(),
        driver_name: (payload.driver_name || '').trim(),
        plate: normalizePlaca(payload.plate),
        vehicle_type: payload.vehicle_type || 'Moto',
        process: payload.process || '',
        origin: payload.origin || '',
        destination: payload.destination || '',
        brand: payload.brand || '',
        model: payload.model || '',
        fuel: payload.fuel || '',
        line: payload.line || '',
        engine: payload.engine || '',
        internal_number: payload.internal_number || '',
        odometer: payload.odometer || '',
        city: payload.city || '',
        license_num: payload.license_num || '',
        license_exp: payload.license_exp || '',
        soat: payload.soat || '',
        property_card: payload.property_card || '',
        gas_cert: payload.gas_cert || '',
        insurance: payload.insurance || '',
        aspects: aspectos,
        optimal: payload.optimal === true || payload.optimal === 'SI',
        observations: payload.observations || '',
        compliance_pct: pct,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        gps_accuracy: payload.gps_accuracy ?? null,
        signature_data: payload.signature_data || null,
        // ES: Datos adicionales del formato FOSST22 (cédula, turno, vencimientos, compromisos…).
        // EN: Extra FOSST22 form data (ID, shift, expiries, commitments…).
        formato: payload.formato || {},
        status: 'submitted',
      }

      if (!row.driver_name) return { error: 'Nombre del conductor obligatorio' }
      if (!row.plate) return { error: 'Placa obligatoria' }
      if (!Object.keys(aspectos).length) return { error: 'Complete los aspectos de revisión' }

      if (localMode) {
        const list = [row, ...readLocal(orgId)]
        writeLocal(orgId, list)
        setRows((prev) => [row, ...prev])
        return { error: null, row, local: true }
      }

      let { error: err } = await supabase.from('mission_inspections').insert(row)
      // ES: Servidor sin la columna «formato» (migración 20261006_misionales_fosst22 pendiente):
      //     se guarda sin ella para no perder la inspección.
      // EN: Server without the "formato" column: save without it so the inspection is not lost.
      if (err && /formato/.test(err.message || '')) {
        const { formato: _sinFormato, ...sinFormato } = row
        ;({ error: err } = await supabase.from('mission_inspections').insert(sinFormato))
      }
      if (err) {
        if (missingTable(err.message)) {
          setLocalMode(true)
          const list = [row, ...readLocal(orgId)]
          writeLocal(orgId, list)
          setRows((prev) => [row, ...prev])
          return { error: null, row, local: true }
        }
        return { error: err.message }
      }
      await load()
      return { error: null, row }
    },
    [orgId, userId, localMode, load]
  )

  const removeInspection = useCallback(
    async (id) => {
      if (localMode) {
        writeLocal(
          orgId,
          readLocal(orgId).filter((r) => r.id !== id)
        )
        setRows((prev) => prev.filter((r) => r.id !== id))
        return { error: null }
      }
      const { error: err } = await supabase.from('mission_inspections').delete().eq('id', id)
      if (err) return { error: err.message }
      await load()
      return { error: null }
    },
    [orgId, localMode, load]
  )

  const stats = {
    total: rows.length,
    today: rows.filter((r) => {
      const d = (r.inspected_at || '').slice(0, 10)
      return d === new Date().toLocaleDateString('sv-SE')
    }).length,
    avgPct:
      rows.length === 0
        ? 100
        : Math.round(
            rows.reduce((s, r) => s + (Number(r.compliance_pct) || 0), 0) / rows.length
          ),
    notOptimal: rows.filter((r) => r.optimal === false).length,
  }

  return {
    rows,
    loading,
    error,
    localMode,
    stats,
    reload: load,
    createInspection,
    removeInspection,
  }
}
