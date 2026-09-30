/**
 * Piezas comunes de los inicios de planta (ShiftHome y OperatorHome): íconos,
 * encabezado, chips, barra inferior y la lista de rondas del turno con su FOMAT04.
 * Henry Stark Desarrollador · CDH Maker
 */
import { useMemo, useState } from 'react'
import { groupChecksIntoRounds } from '../../../lib/roundRecords'
import { openRoundFormat } from '../../../lib/roundFormat'
import { clock } from '../lib/shiftHome'
import { Icon } from './shiftIcons'

/* ── Piezas comunes ─────────────────────────────────────────────────────── */
export function Header({ eyebrow, title, chips, onRefresh, loading }) {
  return (
    <header className="sh-header">
      <div className="sh-header-top">
        <p className="sh-eyebrow">{eyebrow}</p>
        <button type="button" className="sh-icon-btn" onClick={onRefresh} disabled={loading} aria-label="Actualizar">
          <span className={loading ? 'sh-spin' : undefined} style={{ display: 'inline-flex' }}>{Icon.refresh(20)}</span>
        </button>
      </div>
      <h1 className="sh-title">{title}</h1>
      {chips ? <div className="sh-chips">{chips}</div> : null}
    </header>
  )
}

export function AttendanceChip({ punches, go }) {
  const inPunch = [...(punches || [])]
    .filter((p) => p.punch_type === 'in')
    .sort((a, b) => String(a.punched_at).localeCompare(String(b.punched_at)))[0]
  if (inPunch) {
    return (
      <button type="button" className="sh-chip sh-chip-ok" onClick={() => go('asistencia')}>
        <span className="sh-dot" />Ingreso {clock(inPunch.punched_at)}{inPunch.photo_path ? ' con selfie' : ''}
      </button>
    )
  }
  return (
    <button type="button" className="sh-chip sh-chip-warn" onClick={() => go('asistencia')}>
      <span className="sh-dot" />Marcar ingreso
    </button>
  )
}

export function RoundsChip({ done, min, go }) {
  return (
    <button type="button" className={`sh-chip ${done >= min ? 'sh-chip-ok' : 'sh-chip-neutral'}`} onClick={() => go('cumplimiento')}>
      Rondas {done} de {min}
    </button>
  )
}

export function TabBar({ items, go }) {
  return (
    <nav className="sh-tabbar" aria-label="Accesos del turno">
      {items.map((it) => (
        <button key={it.label} type="button" aria-current={it.current ? 'page' : undefined} onClick={() => go(it.tab)}>
          {it.icon(22)}
          {it.label}
        </button>
      ))}
    </nav>
  )
}

export function Note({ error }) {
  return error ? <p className="sh-note" role="status">{error}</p> : null
}

/* ── Rondas del turno con su FOMAT04 ────────────────────────────────────── */
export function ShiftRounds({ orgId, slot, checks, onlyUser = null, loading }) {
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const rounds = useMemo(() => {
    const all = groupChecksIntoRounds(checks || [])
    return onlyUser ? all.filter((r) => r.takenBy.includes(onlyUser)) : all
  }, [checks, onlyUser])

  const open = async (round) => {
    setMsg(null)
    if (navigator.onLine === false) {
      setMsg('Sin conexión: el formato se genera cuando las fotos estén en el servidor.')
      return
    }
    setBusy(round.key)
    const { error } = await openRoundFormat({
      orgId,
      shiftDate: round.shiftDate,
      shiftNumber: round.shiftNumber,
      hour: round.hour,
      plantId: round.plantId,
    })
    setBusy(null)
    if (error) setMsg(error)
  }

  return (
    <>
      <div className="sh-section-head">
        <h2 className="sh-h2">Rondas del turno</h2>
        <span className="sh-count">{rounds.length} ronda{rounds.length === 1 ? '' : 's'}</span>
      </div>
      {msg ? <p className="sh-note" role="status">{msg}</p> : null}
      <div className="sh-card">
        {rounds.length === 0 ? (
          <p className="sh-empty">
            {loading ? 'Cargando…' : `Aún no hay rondas en el turno ${slot.shift}. Cada hora con fotos de máquinas es una ronda.`}
          </p>
        ) : (
          <ul className="sh-list">
            {rounds.map((r) => (
              <li key={r.key}>
                <button type="button" className="sh-row" onClick={() => open(r)} disabled={busy === r.key}>
                  <span className="sh-badge sh-badge-blue">{Icon.doc(18)}</span>
                  <span className="sh-row-main">
                    <span className="sh-row-title">{r.hourSlot || 'Ronda'}</span>
                    <span className="sh-row-sub">
                      {r.photos} foto{r.photos === 1 ? '' : 's'}
                      {r.off ? ` · ${r.off} apagada${r.off === 1 ? '' : 's'}` : ''}
                      {r.takenBy.length > 1 ? ` · ${r.takenBy.length} personas` : ''}
                    </span>
                  </span>
                  <span className="sh-tag sh-tag-accent">{busy === r.key ? 'Generando…' : 'Ver formato'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
