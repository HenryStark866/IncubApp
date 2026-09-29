/**
 * Inicio «qué me toca ahora» de la operación de planta (etapa 1 de la
 * remodelación): operario / auxiliar de turno, auxiliar de producción,
 * operario de recepción y supervisor. Cada rol ve primero su siguiente acción
 * con un botón grande; debajo, su avance del turno y lo que pide atención.
 * Los botones llevan a los módulos que ya existen (rondas, cargue, recepción…).
 * El líder de área conserva su LeaderDashboard: no pasa por aquí.
 * Henry Stark Desarrollador · CDH Maker
 */
import { useMemo } from 'react'
import { ROLE_LABEL } from '../../../lib/roles'
import { usePerformance } from '../../../hooks/usePerformance'
import { bogotaDate } from '../../../lib/complianceEngine'
import { useShiftHome } from '../hooks/useShiftHome'
import {
  SHIFT_WINDOWS,
  clock,
  initials,
  machineHealth,
  productionDay,
  receptionDay,
  shiftHomeKind,
  shiftTimeLeft,
  teamOnShift,
} from '../lib/shiftHome'
import { AttendanceChip, Header, Note, RoundsChip, ShiftRounds, TabBar } from './ShiftHomeUi'
import { Icon } from './shiftIcons'
import OperatorHome from './OperatorHome'
import './ShiftHome.css'

/* ── Auxiliar de producción ─────────────────────────────────────────────── */
const TIMELINE_TAG = {
  done: ['Hecho', 'sh-tag-ok'],
  doing: ['En curso', 'sh-tag-accent'],
  planned: ['Programado', 'sh-tag-muted'],
}

function ProductionView({ home, perf, go }) {
  const { data, loading } = home
  const day = useMemo(() => productionDay(data || {}), [data])
  const next = day.next

  return (
    <>
      <Header
        eyebrow="Producción · hoy"
        title="Ciclo de incubación"
        chips={
          <>
            <AttendanceChip punches={perf.myAttendanceToday} go={go} />
            <RoundsChip done={perf.myRoundsToday.length} min={perf.minRounds} go={go} />
          </>
        }
        onRefresh={home.reload}
        loading={loading}
      />
      <div className="sh-body">
        <Note error={home.error} />
        <div className="sh-grid-3 sh-stats">
          <div className="sh-card sh-stat sh-card-accent">
            <span className="sh-tile-label">Cargues</span>
            <span className="sh-stat-num">
              {day.loads.done}
              <span className="sh-stat-of"> / {day.loads.done + day.loads.pending}</span>
            </span>
          </div>
          <div className="sh-card sh-stat">
            <span className="sh-tile-label">Transferencias</span>
            <span className="sh-stat-num">{day.transfers.done}</span>
          </div>
          <div className="sh-card sh-stat">
            <span className="sh-tile-label">Nacimientos</span>
            <span className="sh-stat-num">
              {day.hatches.done}
              <span className="sh-stat-of"> / {day.hatches.total}</span>
            </span>
          </div>
        </div>

        <section className="sh-card sh-card-pad" aria-label="Siguiente cargue">
          {next ? (
            <>
              <div className="sh-hero-row" style={{ color: 'var(--sh-muted)' }}>
                <span className="sh-kicker" style={{ color: 'var(--sh-accent)' }}>Siguiente</span>
                <span className="sh-tile-label">{next.status === 'ordered' ? 'Orden de cargue emitida' : 'Mapa aprobado'}</span>
              </div>
              <div className="sh-row-main">
                <span className="sh-hero-title">Cargue {next.machine}{next.lote ? ` · Lote ${next.lote}` : ''}</span>
              </div>
              <ol className="sh-steps">
                <li className="sh-step sh-step-done"><span className="sh-step-mark">✓</span>Mapa de cargue aprobado</li>
                <li className="sh-step sh-step-current"><span className="sh-step-mark">2</span>Ubicar carros según el mapa</li>
                <li className="sh-step sh-step-next"><span className="sh-step-mark">3</span>Foto de la pantalla al iniciar el ciclo</li>
              </ol>
              <button type="button" className="sh-btn sh-btn-primary" onClick={() => go('cargue')}>Abrir mapa de cargue</button>
            </>
          ) : (
            <>
              <span className="sh-kicker" style={{ color: 'var(--sh-muted)' }}>Siguiente</span>
              <p className="sh-row-sub" style={{ margin: 0 }}>
                {loading && !data ? 'Cargando…' : 'No hay mapas de cargue aprobados pendientes.'}
              </p>
              <button type="button" className="sh-btn sh-btn-primary" onClick={() => go('cargue')}>Ver órdenes de cargue</button>
            </>
          )}
        </section>

        <h2 className="sh-h2" style={{ padding: '4px 4px 0' }}>Línea del día</h2>
        <div className="sh-card">
          {day.timeline.length === 0 ? (
            <p className="sh-empty">{loading && !data ? 'Cargando…' : 'Aún no hay cargues, transferencias ni nacimientos hoy.'}</p>
          ) : (
            <ul className="sh-list">
              {day.timeline.map((t) => (
                <li key={t.id}>
                  <div className="sh-row sh-row-static">
                    <span className="sh-row-time">{clock(t.at) || '—'}</span>
                    <span className="sh-row-main"><span style={{ fontSize: 14 }}>{t.text}</span></span>
                    <span className={`sh-tag ${TIMELINE_TAG[t.state][1]}`}>{TIMELINE_TAG[t.state][0]}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="sh-spacer" />
      <TabBar
        go={go}
        items={[
          { label: 'Hoy', tab: 'hoy', icon: Icon.clock, current: true },
          { label: 'Mapas', tab: 'cargue', icon: Icon.load },
          { label: 'Rondas', tab: 'supervision', icon: Icon.camera },
          { label: 'Yo', tab: 'perfil', icon: Icon.user },
        ]}
      />
    </>
  )
}

/* ── Operario de recepción ──────────────────────────────────────────────── */
const fmtInt = (n) => (n == null ? null : Number(n).toLocaleString('es-CO'))

function ReceptionView({ home, perf, go }) {
  const { data, loading } = home
  const day = useMemo(() => receptionDay(data || {}), [data])
  const door = day.atDoor
  const cold = data?.coldRoom

  return (
    <>
      <Header
        eyebrow="Recepción · hoy"
        title="Huevo que entra"
        chips={
          <>
            <AttendanceChip punches={perf.myAttendanceToday} go={go} />
            <RoundsChip done={perf.myRoundsToday.length} min={perf.minRounds} go={go} />
          </>
        }
        onRefresh={home.reload}
        loading={loading}
      />
      <div className="sh-body">
        <Note error={home.error} />
        <section className="sh-hero" aria-label="Siguiente por recibir">
          {door ? (
            <>
              <div className="sh-hero-row">
                <span className="sh-kicker">Siguiente por recibir</span>
                <span>{door.late ? 'Atrasado' : 'Esperado hoy'}</span>
              </div>
              <div className="sh-row-main">
                <span className="sh-hero-title">{door.origin}</span>
                <span className="sh-hero-sub">
                  Lote {door.code}{door.postures ? ` · ${fmtInt(door.postures)} posturas esperadas` : ''}
                </span>
              </div>
              <div className="sh-hero-tiles" aria-label="Qué se registra">
                <div className="sh-hero-tile"><span>Posturas</span><span>Contar</span></div>
                <div className="sh-hero-tile"><span>Precinto</span><span>Anotar</span></div>
                <div className="sh-hero-tile"><span>Fisura/sucio</span><span>Foto</span></div>
              </div>
            </>
          ) : (
            <>
              <span className="sh-kicker">Siguiente por recibir</span>
              <span className="sh-hero-sub">
                {loading && !data ? 'Cargando…' : 'No hay lotes pendientes por recibir hoy.'}
              </span>
            </>
          )}
          <button type="button" className="sh-btn sh-btn-hero" onClick={() => go('recepcion')}>
            {door ? 'Registrar recepción' : 'Abrir recepción'}
          </button>
        </section>

        <div className="sh-section-head">
          <h2 className="sh-h2">Esperados hoy</h2>
          <span className="sh-count">{day.received} recibido{day.received === 1 ? '' : 's'} · {day.pending} por recibir</span>
        </div>
        <div className="sh-card">
          {day.expected.length === 0 ? (
            <p className="sh-empty">{loading && !data ? 'Cargando…' : 'No hay lotes programados para hoy.'}</p>
          ) : (
            <ul className="sh-list">
              {day.expected.map((l) => {
                const tag = l.arrival
                  ? [`Recibido ${clock(l.arrival.arrived_at) || ''}`.trim(), 'sh-tag-ok']
                  : l.late
                    ? ['Atrasado', 'sh-tag-fault']
                    : door && l.id === door.id
                      ? ['Siguiente', 'sh-tag-accent']
                      : ['Por recibir', 'sh-tag-muted']
                return (
                  <li key={l.id}>
                    <button type="button" className="sh-row" onClick={() => go('recepcion')}>
                      <span className="sh-row-main">
                        <span className="sh-row-title">{l.origin}</span>
                        <span className="sh-row-sub">Lote {l.code}{l.postures ? ` · ${fmtInt(l.postures)} posturas` : ''}</span>
                      </span>
                      <span className={`sh-tag ${tag[1]}`}>{tag[0]}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <button type="button" className="sh-card sh-tile" onClick={() => go('recepcion')}>
          <span className="sh-row-title">Cuarto frío</span>
          <span className="sh-row-sub">
            {cold
              ? `${cold.waiting} lote${cold.waiting === 1 ? '' : 's'} recibido${cold.waiting === 1 ? '' : 's'} sin clasificar · ${cold.classifying} en clasificación`
              : 'Cargando…'}
          </span>
          {cold && cold.openOrders ? (
            <span className="sh-tag sh-tag-accent">
              {cold.openOrders} orden{cold.openOrders === 1 ? '' : 'es'} de clasificación abierta{cold.openOrders === 1 ? '' : 's'}
            </span>
          ) : null}
        </button>
      </div>
      <div className="sh-spacer" />
      <TabBar
        go={go}
        items={[
          { label: 'Hoy', tab: 'hoy', icon: Icon.clock, current: true },
          { label: 'Llegadas', tab: 'recepcion', icon: Icon.truck },
          { label: 'Cargue', tab: 'cargue', icon: Icon.load },
          { label: 'Yo', tab: 'perfil', icon: Icon.user },
        ]}
      />
    </>
  )
}

/* ── Supervisor ─────────────────────────────────────────────────────────── */
const DOT = { fault: 'var(--sh-fault)', warning: 'var(--sh-warn-dot)' }

function SupervisorView({ home, perf, go, orgId }) {
  const { slot, data, loading } = home
  const today = bogotaDate()
  const health = machineHealth(data?.checks || [], data?.machines || [])

  const team = useMemo(() => {
    const roundsByUser = {}
    for (const r of perf.rounds || []) {
      if (String(r.shift_date || '').startsWith(today)) roundsByUser[r.user_id] = (roundsByUser[r.user_id] || 0) + 1
    }
    const attendance = (perf.attendanceHistory || []).filter(
      (a) => String(a.shift_date || '').startsWith(today) || String(a.punched_at || '').startsWith(today)
    )
    return teamOnShift({
      members: perf.members || [],
      assignments: data?.assignments || [],
      attendance,
      roundsByUser,
      shift: slot.shift,
      shiftDate: slot.shiftDate,
      minRounds: perf.minRounds,
    })
  }, [perf.rounds, perf.attendanceHistory, perf.members, perf.minRounds, data, slot.shift, slot.shiftDate, today])

  const pendingActs = (data?.acts || []).filter((a) => a.status === 'pending')
  const openWO = data?.openWorkOrderMachines || new Set()

  const attention = [
    ...health.attention.map((m) => ({
      key: `m-${m.machineId}`,
      tone: m.condition,
      text: (
        <>
          <b>{m.code} {m.condition === 'fault' ? 'en falla' : 'en alerta'}</b>
          {m.condition === 'fault' ? (openWO.has(m.machineId) ? ' · OT abierta' : ' · sin OT abierta') : m.notes ? ` · ${m.notes}` : ' · en la ronda'}
        </>
      ),
      action: m.condition === 'fault' ? (openWO.has(m.machineId) ? 'Ver OT' : 'Crear OT') : 'Asignar',
      tab: m.condition === 'fault' ? 'mantenimiento' : 'supervision',
    })),
    ...team.absent.map((p) => ({
      key: `a-${p.id}`,
      tone: 'warning',
      text: (<><b>{p.name}</b> · sin marca de ingreso</>),
      action: 'Horarios',
      tab: 'horarios',
    })),
    ...team.behind.map((p) => ({
      key: `b-${p.id}`,
      tone: 'warning',
      text: (<><b>{p.name}</b> · {p.rounds} de {team.expectedNow} rondas a esta hora</>),
      action: 'Ver',
      tab: 'cumplimiento',
    })),
    ...(pendingActs.length
      ? [{
          key: 'acts',
          tone: 'warning',
          text: (<><b>{pendingActs.length} actividad{pendingActs.length === 1 ? '' : 'es'}</b> sin iniciar</>),
          action: 'Revisar',
          tab: 'supervision',
        }]
      : []),
  ]
  const hasFault = attention.some((a) => a.tone === 'fault')

  return (
    <>
      <Header
        eyebrow={`Turno ${slot.shift} · ${SHIFT_WINDOWS[slot.shift]?.label || ''} · ${shiftTimeLeft(slot.shift)}`}
        title="Tablero del turno"
        onRefresh={() => {
          home.reload()
          perf.reload?.()
        }}
        loading={loading}
      />
      <div className="sh-body">
        <Note error={home.error} />
        <section
          className={`sh-card sh-card-pad ${attention.length ? (hasFault ? 'sh-card-alert' : 'sh-card-accent') : 'sh-card-calm'}`}
          aria-label="Pide atención"
        >
          <span className="sh-kicker" style={{ color: attention.length ? (hasFault ? 'var(--sh-fault)' : 'var(--sh-accent)') : 'var(--sh-ok)' }}>
            {attention.length ? `Pide atención · ${attention.length}` : 'Todo en orden por ahora'}
          </span>
          {attention.length === 0 ? (
            <span className="sh-row-sub">
              {loading && !data ? 'Cargando…' : 'Sin máquinas en falla ni alerta, sin ausencias ni atrasos en rondas.'}
            </span>
          ) : (
            attention.slice(0, 6).map((a) => (
              <div key={a.key} className="sh-attention">
                <span className="sh-attention-dot" style={{ background: DOT[a.tone] || DOT.warning }} />
                <span className="sh-attention-main">{a.text}</span>
                <button type="button" className="sh-link" onClick={() => go(a.tab)}>{a.action}</button>
              </div>
            ))
          )}
        </section>

        <div className="sh-section-head">
          <h2 className="sh-h2">Mi equipo</h2>
          <span className="sh-count">{team.present} de {team.total} presentes</span>
        </div>
        <div className="sh-card">
          {team.people.length === 0 ? (
            <p className="sh-empty">
              {perf.loading ? 'Cargando…' : 'Nadie programado en este turno. Asigna el turno en Horarios.'}
            </p>
          ) : (
            <ul className="sh-list">
              {team.people.map((p) => (
                <li key={p.id}>
                  <div className="sh-row sh-row-static">
                    <span className={`sh-avatar${p.present ? '' : ' sh-avatar-off'}`} aria-hidden="true">{initials(p.name)}</span>
                    <span className="sh-row-main">
                      <span className="sh-row-title" style={{ fontSize: 14, color: p.present ? undefined : 'var(--sh-muted)' }}>{p.name}</span>
                      <span className="sh-row-sub" style={{ fontSize: 12 }}>
                        {ROLE_LABEL[p.role] || p.role} · {p.present ? `ingreso ${p.inAt}` : 'sin marca de ingreso'}
                      </span>
                    </span>
                    {p.present ? (
                      <span className={`sh-tag ${p.behind ? 'sh-tag-warn' : 'sh-tag-ok'}`} style={{ fontSize: 14 }}>
                        {p.rounds}/{perf.minRounds}
                      </span>
                    ) : (
                      <span className="sh-tag sh-tag-fault">Ausente</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ShiftRounds orgId={orgId} slot={slot} checks={data?.checks} loading={loading && !data} />

        <div className="sh-grid-2">
          <button type="button" className="sh-btn sh-btn-primary" style={{ fontSize: 15 }} onClick={() => go('supervision')}>
            Asignar actividad
          </button>
          <button type="button" className="sh-btn sh-btn-outline" style={{ fontSize: 15 }} onClick={() => go('supervision')}>
            Terminar ronda
          </button>
        </div>
      </div>
      <div className="sh-spacer" />
      <TabBar
        go={go}
        items={[
          { label: 'Turno', tab: 'hoy', icon: Icon.clock, current: true },
          { label: 'Planta', tab: 'monitoreo', icon: Icon.plant },
          { label: 'OT', tab: 'mantenimiento', icon: Icon.wrench },
          { label: 'Reportes', tab: 'cumplimiento', icon: Icon.bars },
        ]}
      />
    </>
  )
}

/* ── Entrada ────────────────────────────────────────────────────────────── */
export default function ShiftHome({ orgId, userId, role, area, userName, onNavigate, can = () => true }) {
  const kind = shiftHomeKind(role)
  const home = useShiftHome({ kind, orgId, userId })
  const perf = usePerformance({ orgId, userId, role, area })
  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const go = (tab) => onNavigate?.(tab)

  const View = kind === 'supervisor' ? SupervisorView : kind === 'production' ? ProductionView : kind === 'reception' ? ReceptionView : OperatorHome
  return (
    <div className="sh-root" data-kind={kind || 'operator'}>
      <View home={home} perf={perf} first={first} go={go} orgId={orgId} userId={userId} role={role} userName={userName} can={can} />
    </div>
  )
}
