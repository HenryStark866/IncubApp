/**
 * Desplazamientos misionales — inspecciones pre-operacionales multi-tenant.
 * Supabase + fallback localStorage.
 * 06-10-2026: como la ventana original — fotos de evidencia de cada M/R (bucket
 * machine-checks, {org}/misionales/{id}/…) y consolidado cada 15 inspecciones
 * (mission_reports + mission_consolidar, migración 20261006_misionales_consolidado).
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

/** dataURL → Blob para subir la foto */
function dataUrlABlob(dataUrl) {
  const [cab, b64] = String(dataUrl).split(',')
  const tipo = /data:([^;]+)/.exec(cab)?.[1] || 'image/jpeg'
  const bin = atob(b64 || '')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

/** URL firmada (1 h) de una foto de evidencia guardada en Storage */
export async function urlEvidencia(path) {
  if (!path) return null
  if (/^data:/.test(path)) return path
  const { data } = await supabase.storage.from('machine-checks').createSignedUrl(path, 3600)
  return data?.signedUrl || null
}

function uid() {
  return `mis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function useMisionales(orgId, userId, { canSeeAll = false } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [localMode, setLocalMode] = useState(false)
  const [reports, setReports] = useState([])

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
      // Consolidados de 15 (sin la tabla todavía: lista vacía)
      let rq = supabase
        .from('mission_reports')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (!canSeeAll && userId) rq = rq.eq('user_id', userId)
      const { data: reps } = await rq
      setReports(reps || [])
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

      // Fotos de evidencia (M/R): a Storage; en el registro queda la ruta.
      const evid = payload.evidencias || {}
      const rutas = {}
      for (const [num, dataUrl] of Object.entries(evid)) {
        if (!dataUrl) continue
        const path = `${orgId}/misionales/${row.id}/aspecto-${num}.jpg`
        const { error: upErr } = await supabase.storage
          .from('machine-checks')
          .upload(path, dataUrlABlob(dataUrl), { contentType: 'image/jpeg', upsert: true })
        if (upErr) {
          const subidas = Object.values(rutas)
          if (subidas.length) await supabase.storage.from('machine-checks').remove(subidas)
          return { error: `No se pudo subir la foto del aspecto ${num}: ${upErr.message}` }
        }
        rutas[num] = path
      }
      if (Object.keys(rutas).length) row.formato = { ...row.formato, evidencias: rutas }

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
      // Cada 15 inspecciones del conductor se agrupan en un consolidado.
      let consolidados = []
      const { data: reps, error: repErr } = await supabase.rpc('mission_consolidar', { p_org: orgId })
      if (!repErr && Array.isArray(reps)) consolidados = reps
      await load()
      return { error: null, row, consolidados }
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

  /** Inspecciones de un consolidado (de memoria o consultadas) */
  const filasDeReporte = useCallback(
    async (reportId) => {
      const enMemoria = rows.filter((r) => r.report_id === reportId)
      const rep = reports.find((x) => x.id === reportId)
      if (rep && enMemoria.length >= (rep.total || 15)) return enMemoria
      const { data, error: err } = await supabase
        .from('mission_inspections')
        .select('*')
        .eq('report_id', reportId)
        .order('inspected_at', { ascending: true })
      if (err) return enMemoria
      return data || []
    },
    [rows, reports]
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
    reports,
    loading,
    error,
    localMode,
    stats,
    reload: load,
    createInspection,
    removeInspection,
    filasDeReporte,
  }
}
