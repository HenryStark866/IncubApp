/**
 * =============================================================================
 * ARCHIVO: src/lib/hatchFromCounts.js
 * PROPÓSITO: El eslabón que faltaba (12-10-2026): cuando la auxiliar de vacunación
 *   registra el «Sexaje y conteo» de un lote, el nacimiento de ese lote queda con los
 *   pollitos reales (machos, hembras y total) y, con todos sus lotes contados, cerrado.
 *   Con la «Calidad del pollito» o el «Pesaje del pollito» queda el peso promedio. Así la proyección broiler pasa a
 *   la tasa real sin que nadie digite dos veces.
 * =============================================================================
 */
import { supabase } from './supabase'

const DAY = 86_400_000
/** Formatos que dan el peso del pollito al nacimiento */
export const PESO_KINDS = ['chick_quality', 'chick_weight']
export const HATCH_KINDS = ['sexing_count', ...PESO_KINDS]
const lotsOf = (t) => [...new Set(String(t || '').match(/\d+/g) || [])]
const ms = (v) => {
  const t = Date.parse(v || '')
  return Number.isNaN(t) ? null : t
}

/** Nacimiento al que corresponde un formato: contiene el lote y es de los 3 días anteriores (o de hoy). */
export function hatchForRecord(hatches = [], { lote, sampled_at }) {
  const lot = String(lote || '').trim()
  const at = ms(sampled_at) ?? Date.now()
  return (
    hatches
      .filter((h) => h.status !== 'cancelled' && lotsOf(h.lote).includes(lot))
      .map((h) => ({ h, t: ms(h.ended_at) ?? ms(h.started_at) ?? ms(h.scheduled_at) ?? ms(h.created_at) ?? 0 }))
      .filter(({ t }) => t <= at + DAY && at - t <= 3 * DAY)
      .sort((a, b) => b.t - a.t)[0]?.h || null
  )
}

/**
 * Cambio a aplicar al nacimiento con los formatos de sus lotes.
 * @returns {object|null} patch para hatch_events (null si no hay nada que cambiar)
 */
export function hatchPatchFromRecords(hatch, records = [], { userId = null, now = Date.now() } = {}) {
  if (!hatch) return null
  const lots = lotsOf(hatch.lote)
  if (!lots.length) return null
  const from = (ms(hatch.started_at) ?? ms(hatch.scheduled_at) ?? now) - DAY
  const mine = records.filter((r) => lots.includes(String(r.lote || '').trim()) && (ms(r.sampled_at) ?? 0) >= from)
  // Último conteo de cada lote
  const conteo = new Map()
  for (const r of mine.filter((x) => x.kind === 'sexing_count').sort((a, b) => String(a.sampled_at).localeCompare(String(b.sampled_at)))) {
    conteo.set(String(r.lote).trim(), r.results || {})
  }
  const patch = {}
  if (conteo.size) {
    let mac = 0
    let hem = 0
    for (const v of conteo.values()) {
      mac += Number(v.conteoMac) || 0
      hem += Number(v.conteoHem) || 0
    }
    const total = mac + hem
    if (total > 0) {
      patch.actual_chicks = total
      patch.males_count = mac
      patch.females_count = hem
      if (conteo.size >= lots.length && hatch.status !== 'completed') {
        patch.status = 'completed'
        patch.ended_at = new Date(now).toISOString()
        if (userId) patch.closed_by = userId
      } else if (hatch.status === 'planned') {
        patch.status = 'in_progress'
      }
    }
  }
  const pesos = mine.filter((x) => PESO_KINDS.includes(x.kind) && Number(x.results?.promedio) > 0)
  if (pesos.length) {
    const prom = pesos.reduce((s, r) => s + Number(r.results.promedio), 0) / pesos.length
    patch.avg_chick_weight_g = Math.round(prom * 100) / 100
  }
  return Object.keys(patch).length ? patch : null
}

/** Tras guardar un formato de vacunación / calidad del pollito: actualiza su nacimiento. */
export async function syncHatchFromRecord({ orgId, userId, record, client = supabase }) {
  if (!orgId || !record?.lote || !HATCH_KINDS.includes(record.kind)) return { updated: false }
  const since = new Date(Date.now() - 5 * DAY).toISOString()
  const { data: hatches } = await client
    .from('hatch_events')
    .select('id, lote, status, started_at, scheduled_at, ended_at, created_at')
    .eq('org_id', orgId)
    .or(`scheduled_at.gte.${since},started_at.gte.${since},created_at.gte.${since}`)
    .limit(100)
  const hatch = hatchForRecord(hatches || [], record)
  if (!hatch) return { updated: false, reason: 'sin-nacimiento' }
  const { data: records } = await client
    .from('quality_records')
    .select('kind, lote, sampled_at, results')
    .eq('org_id', orgId)
    .in('kind', HATCH_KINDS)
    .gte('sampled_at', since)
    .limit(500)
  const patch = hatchPatchFromRecords(hatch, records || [], { userId })
  if (!patch) return { updated: false }
  let { error } = await client.from('hatch_events').update(patch).eq('id', hatch.id)
  // Servidor sin la columna del peso (migración 20261012_flujo_produccion pendiente)
  if (error && /avg_chick_weight_g/.test(error.message || '')) {
    const { avg_chick_weight_g: _peso, ...rest } = patch
    ;({ error } = await client.from('hatch_events').update(rest).eq('id', hatch.id))
  }
  return error ? { updated: false, error: error.message } : { updated: true, hatchId: hatch.id, patch }
}
