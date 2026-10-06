/**
 * Inicio del líder de área (etapa 3, maqueta «Líderes de área»): arriba lo que
 * necesita su decisión, cada fila con su botón; luego cuatro indicadores, el
 * equipo y el plan del día. Va ENCIMA del tablero «Hoy» que ya existía: no quita
 * ni oculta nada de lo anterior.
 * Henry Stark Desarrollador
 */
import { useMemo, useState } from 'react'
import { ROLE_LABEL, canSupervisePlant } from '../../../lib/roles'
import { usePerformance } from '../../../hooks/usePerformance'
import { bogotaDate } from '../../../lib/complianceEngine'
import { requestWorkOrderFromRound } from '../../../lib/roundActions'
import { openEvidenceFormat, workOrderRecordItem } from '../../../lib/sigRecordDocuments'
import { clock, initials, teamOnShift } from '../../shift/lib/shiftHome'
import {
  environmentalLeaderBoard,
  leaderKind,
  logisticsLeaderBoard,
  maintenanceLeaderBoard,
  plantLeaderBoard,
  sstLeaderBoard,
  veterinaryLeaderBoard,
  hrLeaderBoard,
  accountingLeaderBoard,
  salesLeaderBoard,
  managementBoard,
} from '../lib/leaderHome'
import { approveWorkOrder, assignWorkOrder, useLeaderHome } from '../hooks/useLeaderHome'
import BotReadingsReview from './BotReadingsReview'
import WorkOrdersSheet from './WorkOrdersSheet'
import './LeaderAreaHome.css'

const TITLES = {
  plant: {
    team: 'Mi equipo en el turno',
    teamSub: 'rondas con foto contra el ritmo del turno',
    plan: 'Hoy en planta',
    planSub: 'cargues, transferencias y nacimientos',
  },
  maintenance: {
    team: 'Técnicos',
    teamSub: 'OT en curso y cerradas hoy',
    plan: 'Programado en la semana',
    planSub: 'preventivos y calibraciones',
  },
  sst: {
    team: 'Conductores',
    teamSub: 'preoperacional del vehículo hoy',
    plan: 'Hoy y esta semana',
    planSub: 'preoperacionales (FOSST22) e inspecciones',
    empty: 'No hay conductores activos registrados.',
  },
  environmental: {
    team: 'Sensores de ambiente',
    teamSub: 'última lectura de cada uno',
    plan: 'Hoy y próximos días',
    planSub: 'sensores fuera de rango, retiros de residuos y vencimientos',
    empty: 'No hay sensores registrados. Se agregan en IoT.',
  },
  logistics: {
    team: 'Conductores',
    teamSub: 'ruta y preoperacional de hoy',
    plan: 'Despachos de hoy y mañana',
    planSub: 'remisiones',
    empty: 'No hay conductores activos registrados.',
  },
}

TITLES.veterinary = {
  team: 'Equipo de sanidad',
  teamSub: 'registros de hoy',
  plan: 'Calendario sanitario',
  planSub: 'nacimientos de hoy y mañana',
  empty: 'No hay veterinarios ni auxiliares de vacunación registrados.',
}

TITLES.hr = {
  team: 'Cobertura por área',
  teamSub: 'presentes hoy contra quienes tienen turno',
  plan: 'Turnos de mañana',
  planSub: 'personas programadas',
  empty: 'No hay personal registrado.',
}
TITLES.accounting = {
  team: 'Equipo de contabilidad',
  teamSub: 'exportes del mes',
  plan: 'Envíos a Siesa',
  planSub: 'últimos',
  empty: 'No hay auxiliares de contabilidad registrados.',
}
TITLES.sales = {
  team: 'Disponibilidad por nacimiento',
  teamSub: 'pollitos vendidos contra proyectados',
  plan: 'Entregas de hoy y mañana',
  planSub: 'pedidos comprometidos',
  empty: 'No hay nacimientos programados en los próximos días.',
}

TITLES.management = {
  team: 'Áreas de la empresa',
  teamSub: 'lo pendiente de cada líder · toca un área para abrirla',
  plan: 'Hoy en la empresa',
  planSub: 'planta, despachos, entregas y sanidad',
  empty: 'Sin datos de las áreas todavía.',
}

const BOARDS = {
  hr: hrLeaderBoard,
  accounting: accountingLeaderBoard,
  sales: salesLeaderBoard,
  veterinary: veterinaryLeaderBoard,
  maintenance: maintenanceLeaderBoard,
  sst: sstLeaderBoard,
  environmental: environmentalLeaderBoard,
  logistics: logisticsLeaderBoard,
}

function Decision({ d, busy, onAction, technicians }) {
  const [tech, setTech] = useState('')
  const assign = d.action.kind === 'assign'
  return (
    <div className={`lh-dec tone-${d.tone}`}>
      <span className="lh-sev" aria-hidden="true" />
      <div className="lh-dec-main">
        <b>{d.title}</b>
        {d.detail && <span>{d.detail}</span>}
      </div>
      <div className="lh-dec-actions">
        {d.secondary && (
          <button type="button" className="lh-btn" disabled={busy} onClick={() => onAction(d.secondary, d)}>
            {d.secondary.label}
          </button>
        )}
        {assign ? (
          <>
            <label className="lh-sr" htmlFor={`tech-${d.id}`}>
              Técnico
            </label>
            <select id={`tech-${d.id}`} className="lh-select" value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="">Técnico…</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="lh-btn lh-btn-p"
              disabled={busy || !tech}
              onClick={() => onAction({ ...d.action, technicianId: tech }, d)}
            >
              {busy ? 'Guardando…' : 'Asignar'}
            </button>
          </>
        ) : (
          <button type="button" className="lh-btn lh-btn-p" disabled={busy} onClick={() => onAction(d.action, d)}>
            {busy ? 'Guardando…' : d.action.label}
          </button>
        )}
      </div>
    </div>
  )
}

function Section({ title, sub, children }) {
  return (
    <section className="lh-section">
      <div className="lh-sec-head">
        <h2>{title}</h2>
        {sub && <span>{sub}</span>}
      </div>
      {children}
    </section>
  )
}

export default function LeaderAreaHome({ orgId, userId, role, area, userName, onNavigate, peopleName = {} }) {
  const kind = leaderKind(area)
  const home = useLeaderHome({ kind, orgId })
  // Cumplimiento del turno (misma fuente que «Cumplimiento»); solo lo usa planta.
  // Optimización: los demás líderes no lo usan; sin orgId el hook no consulta nada.
  const perf = usePerformance({ orgId: kind === 'plant' ? orgId : null, userId, role, area })
  const [busyId, setBusyId] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [msg, setMsg] = useState(null)
  const { data, slot } = home
  const today = bogotaDate()

  const board = useMemo(() => {
    if (!data) return null
    if (kind === 'management') return managementBoard({ areas: data.areas || {}, slot })
    if (BOARDS[kind]) return BOARDS[kind]({ ...data })
    return plantLeaderBoard({ ...data, slot })
  }, [data, kind, slot])

  const team = useMemo(() => {
    if (kind !== 'plant') return board?.team || []
    const roundsByUser = {}
    for (const r of perf.rounds || []) {
      if (String(r.shift_date || '').startsWith(today)) roundsByUser[r.user_id] = (roundsByUser[r.user_id] || 0) + 1
    }
    const attendance = (perf.attendanceHistory || []).filter(
      (a) => String(a.shift_date || '').startsWith(today) || String(a.punched_at || '').startsWith(today),
    )
    const t = teamOnShift({
      members: perf.members || [],
      attendance,
      roundsByUser,
      shift: slot.shift,
      shiftDate: slot.shiftDate,
      minRounds: perf.minRounds,
      shiftRoles: ['supervisor', 'operator', 'auxiliary', 'auxiliary_production', 'reception_operator'],
    })
    const lastBy = new Map()
    for (const c of data?.checks || []) if (c.taken_by && !lastBy.has(c.taken_by)) lastBy.set(c.taken_by, c)
    const codeOf = new Map((data?.machines || []).map((m) => [m.id, m.code || m.name]))
    return t.people.map((p) => {
      const last = lastBy.get(p.id)
      const pct = t.expectedNow ? Math.min(100, Math.round((p.rounds / t.expectedNow) * 100)) : p.rounds ? 100 : 0
      return {
        id: p.id,
        name: p.name,
        role: ROLE_LABEL[p.role] || p.role,
        doing: !p.present
          ? 'Sin marcar ingreso'
          : last
            ? `Última foto: ${codeOf.get(last.machine_id) || 'máquina'} · ${clock(last.taken_at)}`
            : `Ingresó ${p.inAt || ''} · sin fotos en el turno`,
        pct,
        value: `${p.rounds} rondas`,
        online: p.present,
        behind: p.behind,
      }
    })
  }, [
    kind,
    board,
    perf.rounds,
    perf.attendanceHistory,
    perf.members,
    perf.minRounds,
    data,
    slot.shift,
    slot.shiftDate,
    today,
  ])

  if (!kind) return null

  const titles = TITLES[kind]
  const machinesById = Object.fromEntries((data?.machines || []).map((m) => [m.id, m]))

  const onAction = async (action, d) => {
    setMsg(null)
    if (action.kind === 'nav') {
      onNavigate?.(action.tab)
      return
    }
    if (action.kind === 'format') {
      const order = (data?.workOrders || []).find((w) => w.id === action.orderId)
      if (order)
        openEvidenceFormat(
          workOrderRecordItem({
            order,
            machine: machinesById[order.machine_id] || null,
            createdBy: peopleName[order.created_by] || null,
            assignedTo: peopleName[order.assigned_to] || null,
          }),
        )
      return
    }
    setBusyId(d.id)
    let res = { error: null }
    let ok = ''
    if (action.kind === 'request-ot') {
      res = await requestWorkOrderFromRound({
        orgId,
        userId,
        machine: machinesById[action.machineId],
        condition: action.condition,
        note: action.note ? `${action.note} · pedida por el líder de planta` : 'Pedida por el líder de planta',
      })
      ok = 'OT pedida a mantenimiento'
    } else if (action.kind === 'assign') {
      res = await assignWorkOrder(action.orderId, action.technicianId)
      ok = 'OT asignada'
    } else if (action.kind === 'approve') {
      res = await approveWorkOrder(action.orderId, { userId, userName })
      ok = 'Cierre aprobado'
    }
    setBusyId(null)
    setMsg(res.error ? { kind: 'error', text: res.error } : { kind: 'ok', text: ok })
    if (!res.error) home.reload()
  }

  const decisions = board?.decisions || []
  return (
    <div className="lh-root" data-kind={kind}>
      {sheet && (
        <WorkOrdersSheet
          workOrders={data?.workOrders || []}
          machines={data?.machines || []}
          technicians={data?.technicians || []}
          peopleName={peopleName}
          filtroInicial={sheet.filter}
          onCerrar={() => setSheet(null)}
          onCambio={() => home.reload()}
        />
      )}
      {kind === 'management' && (
        <header className="lh-head">
          <h1>La empresa hoy</h1>
          <span>lo urgente de las nueve áreas, cómo va cada una y lo programado</span>
        </header>
      )}
      {home.error && <p className="lh-msg is-error">{home.error}</p>}
      {msg && <p className={`lh-msg ${msg.kind === 'error' ? 'is-error' : 'is-ok'}`}>{msg.text}</p>}
      <div className="lh-grid">
        <div className="lh-col">
          <Section title={`Necesita tu decisión · ${decisions.length}`} sub="lo más urgente primero">
            <div className="lh-card">
              {!board ? (
                <p className="lh-empty">{home.loading ? 'Cargando…' : 'Sin datos todavía.'}</p>
              ) : decisions.length === 0 ? (
                <p className="lh-empty">Nada pendiente de tu decisión. Todo en orden.</p>
              ) : (
                decisions.map((d) => (
                  <Decision
                    key={d.id}
                    d={d}
                    busy={busyId === d.id}
                    onAction={onAction}
                    technicians={data?.technicians || []}
                  />
                ))
              )}
            </div>
          </Section>

          {(kind === 'plant' || kind === 'management') && canSupervisePlant(role, area) && (
            <BotReadingsReview orgId={orgId} peopleName={peopleName} />
          )}

          {board && (
            <div className="lh-kpis">
              {board.kpis.map((k) =>
                k.open?.kind === 'work-orders' && data?.workOrders ? (
                  // Tocar abre el listado de OT para asignar técnico
                  <button
                    type="button"
                    key={k.label}
                    className={`lh-card lh-kpi lh-kpi-btn${k.tone ? ` tone-${k.tone}` : ''}`}
                    onClick={() => setSheet(k.open)}
                    title="Ver y asignar"
                  >
                    <span>{k.label}</span>
                    <b>{k.value}</b>
                    <small>{k.sub}</small>
                    <em className="lh-kpi-ir">Ver y asignar ›</em>
                  </button>
                ) : (
                  <div key={k.label} className={`lh-card lh-kpi${k.tone ? ` tone-${k.tone}` : ''}`}>
                    <span>{k.label}</span>
                    <b>{k.value}</b>
                    <small>{k.sub}</small>
                  </div>
                ),
              )}
            </div>
          )}

          <Section title={titles.team} sub={titles.teamSub}>
            <div className="lh-card">
              {team.length === 0 ? (
                <p className="lh-empty">
                  {kind === 'maintenance'
                    ? 'No hay técnicos de mantenimiento en la empresa.'
                    : titles.empty || 'Nadie programado ni con ingreso en este turno.'}
                </p>
              ) : (
                team.map((p) => {
                  const row = (
                    <>
                      <span className={`lh-av${p.online ? ' is-on' : ''}`} aria-hidden="true">
                        {initials(p.name)}
                      </span>
                      <span className="lh-person-main">
                        <b>{p.name}</b>
                        <span>{p.role}</span>
                      </span>
                      <span className="lh-person-doing">{p.doing}</span>
                      {p.pct != null ? (
                        <span className="lh-person-bar" title={p.value}>
                          <span className="lh-mini">
                            <span
                              style={{ width: `${p.pct}%` }}
                              className={p.over ? 'is-over' : p.pct < 60 ? 'is-low' : ''}
                            />
                          </span>
                          <b>{p.value}</b>
                        </span>
                      ) : (
                        <span className={`lh-person-value${p.tone ? ` lh-st tone-${p.tone}` : ''}`}>{p.value}</span>
                      )}
                    </>
                  )
                  // Gerencia: cada área abre su módulo.
                  return p.tab ? (
                    <button
                      key={p.id}
                      type="button"
                      className="lh-person lh-person-link"
                      onClick={() => onNavigate?.(p.tab)}
                    >
                      {row}
                    </button>
                  ) : (
                    <div key={p.id} className="lh-person">
                      {row}
                    </div>
                  )
                })
              )}
            </div>
          </Section>
        </div>

        <div className="lh-col">
          <Section title={titles.plan} sub={titles.planSub}>
            <div className="lh-card">
              {!board?.plan?.length ? (
                <p className="lh-empty">Nada programado.</p>
              ) : (
                board.plan.map((r) => (
                  <div key={r.id} className="lh-row">
                    <span className="lh-t">{r.at}</span>
                    <span className="lh-row-text">{r.text}</span>
                    <span className={`lh-st tone-${r.tone}`}>{r.state}</span>
                  </div>
                ))
              )}
            </div>
          </Section>
          <p className="lh-updated">
            {home.updatedAt ? `Actualizado ${clock(home.updatedAt)}` : ''}{' '}
            <button type="button" className="lh-link" onClick={home.reload} disabled={home.loading}>
              {home.loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
