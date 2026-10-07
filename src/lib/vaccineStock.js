/**
 * Inventario de vacunas (auxiliar de vacunación · 07-10-2026).
 * Saldo por vacuna y por lote del fabricante a partir de los movimientos:
 *   in (entrada) suma · use (consumo) y discard (baja) restan · adjust suma con su signo.
 * Alertas: stock bajo (menos del mínimo), lotes por vencer (≤ 15 días) y vencidos con saldo.
 */
export const MOV_LABEL = { in: 'Entrada', use: 'Consumo', adjust: 'Ajuste', discard: 'Baja' }
export const STORAGE_LABEL = { nitrogen: 'Nitrógeno líquido', fridge: 'Nevera (2–8 °C)', room: 'Ambiente' }
export const DIAS_POR_VENCER = 15
const DAY = 86400000

const signo = (m) => (m.kind === 'in' ? 1 : m.kind === 'adjust' ? 1 : -1)
const dosis = (m) => (Number(m.doses) || 0) * signo(m)

/** Días hasta la fecha (AAAA-MM-DD), negativo si ya pasó */
export function diasA(fecha, now = new Date()) {
  if (!fecha) return null
  const [y, mo, d] = String(fecha).slice(0, 10).split('-').map(Number)
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((new Date(y, mo - 1, d) - hoy) / DAY)
}

export function stockByProduct({ products = [], movements = [], now = new Date() }) {
  return products
    .map((p) => {
      const movs = movements.filter((m) => m.product_id === p.id)
      const lots = new Map()
      for (const m of movs) {
        const k = m.manufacturer_lot || 'Sin lote'
        if (!lots.has(k)) lots.set(k, { lot: k, doses: 0, expires: null })
        const l = lots.get(k)
        l.doses += dosis(m)
        if (m.kind === 'in' && m.expires_on && (!l.expires || m.expires_on < l.expires)) l.expires = m.expires_on
      }
      const lotes = [...lots.values()]
        .map((l) => ({ ...l, doses: Math.round(l.doses), days: diasA(l.expires, now), vials: Math.round((l.doses / p.doses_per_vial) * 10) / 10 }))
        .filter((l) => l.doses !== 0)
        .sort((a, b) => String(a.expires || '9999').localeCompare(String(b.expires || '9999')))
      const doses = lotes.reduce((s, l) => s + l.doses, 0)
      const last30 = movs.filter((m) => m.kind === 'use' && now - new Date(m.moved_at) < 30 * DAY)
      const usoDiario = last30.reduce((s, m) => s + (Number(m.doses) || 0), 0) / 30
      const alerts = []
      if (p.min_doses && doses < p.min_doses) alerts.push({ tone: 'warn', text: `Stock bajo: ${doses.toLocaleString('es-CO')} dosis (mínimo ${Number(p.min_doses).toLocaleString('es-CO')})` })
      for (const l of lotes) {
        if (l.doses > 0 && l.days != null && l.days < 0) alerts.push({ tone: 'danger', text: `Lote ${l.lot} vencido hace ${-l.days} día(s) con ${l.doses.toLocaleString('es-CO')} dosis` })
        else if (l.doses > 0 && l.days != null && l.days <= DIAS_POR_VENCER) alerts.push({ tone: 'warn', text: `Lote ${l.lot} vence en ${l.days} día(s)` })
        if (l.doses < 0) alerts.push({ tone: 'danger', text: `Lote ${l.lot} con saldo negativo (${l.doses}): falta registrar una entrada` })
      }
      return {
        ...p,
        doses,
        vials: Math.round((doses / p.doses_per_vial) * 10) / 10,
        lots: lotes,
        usoDiario: Math.round(usoDiario),
        diasDeStock: usoDiario > 0 ? Math.floor(doses / usoDiario) : null,
        alerts,
      }
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
}

/** Lote del fabricante a usar primero (el que vence antes y tiene saldo) */
export function loteSugerido(stockItem) {
  return stockItem?.lots?.find((l) => l.doses > 0 && (l.days == null || l.days >= 0))?.lot || ''
}

/**
 * Consumo por lote de pollito: dosis, frascos y pollitos. Cada vacuna se aplica a los
 * mismos pollitos, así que los pollitos del lote son los de la vacuna que más registra
 * (no la suma) y la dosis por pollito es por vacuna aplicada.
 */
export function consumoPorLote({ movements = [], products = [] }) {
  const name = new Map(products.map((p) => [p.id, p.name]))
  const grupos = new Map()
  for (const m of movements.filter((x) => x.kind === 'use')) {
    const k = m.lote || 'Sin lote'
    if (!grupos.has(k)) grupos.set(k, { lote: k, doses: 0, vials: 0, porVacuna: new Map(), last: m.moved_at })
    const g = grupos.get(k)
    g.doses += Number(m.doses) || 0
    g.vials += Number(m.vials) || 0
    const v = g.porVacuna.get(m.product_id) || { doses: 0, chicks: 0 }
    v.doses += Number(m.doses) || 0
    v.chicks += Number(m.chicks) || 0
    g.porVacuna.set(m.product_id, v)
    if (m.moved_at > g.last) g.last = m.moved_at
  }
  return [...grupos.values()]
    .map(({ porVacuna, ...g }) => {
      const chicks = Math.max(0, ...[...porVacuna.values()].map((v) => v.chicks))
      const conPollitos = [...porVacuna.values()].filter((v) => v.chicks > 0)
      const dosisConPollitos = conPollitos.reduce((s, v) => s + v.doses, 0)
      const pollitosAplicados = conPollitos.reduce((s, v) => s + v.chicks, 0)
      return {
        ...g,
        chicks,
        vacunas: [...porVacuna.keys()].map((id) => name.get(id) || 'Vacuna'),
        dosisPorPollito: pollitosAplicados ? Math.round((dosisConPollitos / pollitosAplicados) * 100) / 100 : null,
      }
    })
    .sort((a, b) => String(b.last).localeCompare(String(a.last)))
}

const diaBogota = (v) => (v ? new Date(v).toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }) : '')

/**
 * Lo que le toca hoy al auxiliar de vacunación:
 * - el control PR06-1 de nevera y nitrógeno del día (uno por día);
 * - por cada lote nacido en los últimos días, si ya tiene sexaje/conteo y ombligo.
 */
export function pendientesVacunacion({ formats = [], hatches = [], now = new Date() }) {
  const hoy = diaBogota(now)
  const nitrogenoHoy =
    formats
      .filter((f) => f.kind === 'nitrogen_fridge' && diaBogota(f.sampled_at) === hoy)
      .sort((a, b) => String(b.sampled_at).localeCompare(String(a.sampled_at)))[0] || null
  const hechos = (kind, lote) => formats.some((f) => f.kind === kind && String(f.lote || '').trim() === lote)
  const lotes = new Map()
  for (const h of hatches) {
    if (h.status === 'cancelled') continue
    const at = h.ended_at || h.started_at || h.scheduled_at || h.created_at
    if (!at || new Date(at) > now) continue
    for (const lote of String(h.lote || '').match(/\d+/g) || []) {
      const prev = lotes.get(lote)
      if (!prev || prev.at < at) lotes.set(lote, { lote, at, chicks: Number(h.actual_chicks) || null })
    }
  }
  return {
    nitrogenoHoy,
    lotes: [...lotes.values()]
      .map((l) => ({ ...l, sexaje: hechos('sexing_count', l.lote), ombligo: hechos('navel_quality', l.lote) }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at))),
  }
}
