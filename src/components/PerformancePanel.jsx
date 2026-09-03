/**
 * Cumplimiento: esperado vs reportado, rondas de turno y plan de bonos.
 * Henry Stark Desarrollador
 */
import { useMemo, useState } from 'react'
import { usePerformance } from '../hooks/usePerformance'
import {
  BONUS_FUND_NOTE,
  DEFAULT_MIN_ROUNDS_PER_SHIFT,
  LABOR_KEYS,
} from '../lib/complianceEngine'
import { ROLE_LABEL } from '../lib/roles'
import ExportMenu from './ExportMenu'
import ComplianceAnalyticsView from './ComplianceAnalyticsView'

export default function PerformancePanel({
  orgId,
  userId,
  role,
  area,
  userName,
  orgName = '',
  location,
  isOmniscient,
}) {
  const api = usePerformance({ orgId, userId, role, area })
  const isGerencia =
    role === 'management' ||
    role === 'management_auxiliary' ||
    (role === 'coordinator' && area === 'management')
  const analyticsApi = useMemo(
    () => ({
      ...api,
      userId,
      isGerencia,
    }),
    [api, userId, isGerencia]
  )
  const [tab, setTab] = useState(api.isCoord ? 'equipo' : 'mi')
  const [roundForm, setRoundForm] = useState({ title: '', body: '', shiftCode: 'T1' })
  const [targetForm, setTargetForm] = useState({
    laborKey: 'rounds',
    expected: DEFAULT_MIN_ROUNDS_PER_SHIFT,
    forRole: 'operator',
    label: '',
  })
  const [laborForm, setLaborForm] = useState({ laborKey: 'labors_completed', qty: 1, note: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const s = api.myScore
  const tone = s.bonusEligible ? 'ok' : s.scorePct >= 70 ? 'warn' : 'off'

  const submitRound = async () => {
    setBusy(true)
    setMsg(null)
    const { error, local } = await api.submitRound({
      title: roundForm.title,
      body: roundForm.body,
      shiftCode: roundForm.shiftCode,
      location,
    })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error })
    else {
      setMsg({
        kind: 'ok',
        text: `Ronda registrada (${api.myRoundsToday.length + 1}/${api.minRounds} mín.)${local ? ' · local' : ''}`,
      })
      setRoundForm((f) => ({ ...f, title: '', body: '' }))
    }
  }

  const saveTarget = async () => {
    setBusy(true)
    setMsg(null)
    const meta = LABOR_KEYS.find((k) => k.id === targetForm.laborKey)
    const { error, local } = await api.saveTarget({
      laborKey: targetForm.laborKey,
      label: targetForm.label || meta?.label,
      expected: targetForm.expected,
      unit: meta?.unit || '',
      forRole: targetForm.forRole || null,
    })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error })
    else setMsg({ kind: 'ok', text: `Meta guardada${local ? ' (local)' : ''}.` })
  }

  const reportLabor = async () => {
    setBusy(true)
    setMsg(null)
    const { error } = await api.reportLabor({
      laborKey: laborForm.laborKey,
      qty: laborForm.qty,
      success: true,
      note: laborForm.note,
    })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error })
    else {
      setMsg({ kind: 'ok', text: 'Labor reportada.' })
      setLaborForm((f) => ({ ...f, note: '' }))
    }
  }

  const teamExportRows = useMemo(
    () =>
      api.teamScores.map((m) => ({
        Nombre: m.name,
        Rol: ROLE_LABEL[m.role] || m.role,
        Cumplimiento_pct: m.score.scorePct,
        Dias_continuos: m.score.continuousDays,
        Elegible_90d: m.score.eligibleDays ? 'Sí' : 'No',
        Elegible_95: m.score.eligibleScore ? 'Sí' : 'No',
        Bono: m.score.bonusEligible ? 'Sí' : 'No',
        ...Object.fromEntries(
          m.score.components.map((c) => [`${c.key}_esperado`, c.expected])
        ),
        ...Object.fromEntries(m.score.components.map((c) => [`${c.key}_reportado`, c.actual])),
      })),
    [api.teamScores]
  )

  const laborOpts = useMemo(() => LABOR_KEYS, [])

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>Cumplimiento y bonos</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Esperado (coordinador) vs reportado. Bono desde el día {api.minDays} de uso continuo y ≥
            {api.minScore}% de cumplimiento.
          </p>
        </div>
        <span className={`pill status ${tone}`}>
          {s.scorePct}% hoy
          {s.bonusEligible ? ' · elegible bono' : ''}
        </span>
      </div>

      {(api.tableMissing || api.localMode) && (
        <p className="msg warn" style={{ marginTop: 8 }}>
          Modo local de cumplimiento. Ejecuta{' '}
          <strong>supabase_migration_performance_bonus.sql</strong> para sincronizar en nube.
        </p>
      )}
      {api.error && <p className="msg error">{api.error}</p>}
      {msg && <p className={`msg ${msg.kind}`}>{msg.text}</p>}

      <div className="exec-kpi-grid" style={{ marginTop: 12 }}>
        <div className={`exec-kpi ${s.scorePct >= api.minScore ? 'ok' : 'warn'}`}>
          <span className="exec-kpi-value">{s.scorePct}%</span>
          <span className="exec-kpi-label">Cumplimiento hoy</span>
        </div>
        <div className={`exec-kpi ${s.eligibleDays ? 'ok' : 'warn'}`}>
          <span className="exec-kpi-value">{s.continuousDays}</span>
          <span className="exec-kpi-label">
            Días uso continuo
            {!s.eligibleDays ? ` · faltan ${s.daysToEligibility}` : ' · OK 90d'}
          </span>
        </div>
        <div className="exec-kpi">
          <span className="exec-kpi-value">
            {api.myRoundsToday.length}/{api.minRounds}
          </span>
          <span className="exec-kpi-label">Rondas hoy</span>
        </div>
        <div className={`exec-kpi ${s.bonusEligible ? 'ok' : ''}`}>
          <span className="exec-kpi-value" style={{ fontSize: 16 }}>
            {s.bonusEligible ? 'SÍ' : 'NO'}
          </span>
          <span className="exec-kpi-label">Elegible bono</span>
        </div>
      </div>

      <div className="tool-card" style={{ marginTop: 12 }}>
        <h4 style={{ margin: '0 0 6px' }}>Fondo del bono</h4>
        <p className="hint" style={{ margin: 0, lineHeight: 1.5 }}>
          {BONUS_FUND_NOTE}
        </p>
      </div>

      <div className="cockpit-tabs" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={tab === 'analisis' ? 'cockpit-tab active' : 'cockpit-tab'}
          onClick={() => setTab('analisis')}
        >
          Gráficos / análisis
        </button>
        <button
          type="button"
          className={tab === 'mi' ? 'cockpit-tab active' : 'cockpit-tab'}
          onClick={() => setTab('mi')}
        >
          Mi cumplimiento
        </button>
        <button
          type="button"
          className={tab === 'rondas' ? 'cockpit-tab active' : 'cockpit-tab'}
          onClick={() => setTab('rondas')}
        >
          Rondas de turno
        </button>
        <button
          type="button"
          className={tab === 'labores' ? 'cockpit-tab active' : 'cockpit-tab'}
          onClick={() => setTab('labores')}
        >
          Reportar labor
        </button>
        {(api.isCoord || isOmniscient) && (
          <>
            <button
              type="button"
              className={tab === 'metas' ? 'cockpit-tab active' : 'cockpit-tab'}
              onClick={() => setTab('metas')}
            >
              Metas (coord.)
            </button>
            <button
              type="button"
              className={tab === 'equipo' ? 'cockpit-tab active' : 'cockpit-tab'}
              onClick={() => setTab('equipo')}
            >
              Equipo / bonos
            </button>
          </>
        )}
      </div>

      {tab === 'analisis' && (
        <div style={{ marginTop: 14 }}>
          <ComplianceAnalyticsView
            api={analyticsApi}
            orgName={orgName}
            userName={userName}
            canSeeAll={!!isOmniscient || isGerencia || api.isCoord}
          />
        </div>
      )}

      {tab === 'mi' && (
        <div style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            {userName || 'Usuario'} · {ROLE_LABEL[role] || role} · {s.periodLabel}
          </p>
          <div style={{ marginBottom: 10 }}>
            <ExportMenu
              filename="mi_cumplimiento_hoy"
              sheets={[
                {
                  name: 'Componentes',
                  rows: (s.components || []).map((c) => ({
                    Actividad: c.label,
                    Código: c.key,
                    Esperado: c.expected,
                    Reportado: c.actual,
                    Unidad: c.unit || '',
                    Cumplimiento_pct: c.pct,
                    Cumple: c.ok ? 'SÍ' : 'NO',
                    Usuario: userName || '',
                    Rol: ROLE_LABEL[role] || role,
                    Fecha: new Date().toLocaleDateString('es-CO'),
                  })),
                },
                {
                  name: 'Resumen',
                  rows: [
                    {
                      Cumplimiento_total_pct: s.scorePct,
                      Dias_continuos: s.continuousDays,
                      Elegible_90d: s.eligibleDays ? 'SÍ' : 'NO',
                      Elegible_95: s.eligibleScore ? 'SÍ' : 'NO',
                      Bono: s.bonusEligible ? 'SÍ' : 'NO',
                      Periodo: s.periodLabel,
                    },
                  ],
                },
              ]}
              meta={{
                title: 'Mi cumplimiento (medible y verificable)',
                orgName: orgName || undefined,
                module: 'Cumplimiento',
                generatedBy: userName || undefined,
              }}
              label="Exportar mi score"
              disabled={!s.components?.length}
            />
          </div>
          <div className="admin-list">
            {s.components.map((c) => (
              <div key={c.key} className="admin-row" style={{ flexWrap: 'wrap' }}>
                <div className="admin-row-main" style={{ flex: 1, minWidth: 160 }}>
                  <strong>{c.label}</strong>
                  <span className="hint" style={{ margin: 0 }}>
                    Esperado: {c.expected} {c.unit} · Reportado: {c.actual} {c.unit}
                  </span>
                </div>
                <div style={{ minWidth: 100, textAlign: 'right' }}>
                  <strong style={{ color: c.ok ? 'var(--ok)' : 'var(--amber)' }}>{c.pct}%</strong>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 4,
                      background: 'var(--line)',
                      marginTop: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, c.pct)}%`,
                        height: '100%',
                        background: c.ok ? 'var(--ok)' : 'var(--amber)',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!s.eligibleDays && (
            <p className="msg warn" style={{ marginTop: 12 }}>
              Llevas {s.continuousDays} día(s) de uso continuo. A los {api.minDays} días entras al
              plan de bonos (si mantienes ≥{api.minScore}% de cumplimiento).
            </p>
          )}
          {s.eligibleDays && !s.eligibleScore && (
            <p className="msg warn" style={{ marginTop: 12 }}>
              Ya cumples los {api.minDays} días. Sube el cumplimiento a ≥{api.minScore}% (hoy{' '}
              {s.scorePct}%) para el bono.
            </p>
          )}
          {s.bonusEligible && (
            <p className="msg ok" style={{ marginTop: 12 }}>
              Cumples condiciones de bono en el indicador de hoy (90d + ≥{api.minScore}%). El pago
              se consolida en el periodo de liquidación del programa SaaS.
            </p>
          )}
        </div>
      )}

      {tab === 'rondas' && (
        <div className="inline-form" style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Turneros: mínimo <strong>{api.minRounds} reportes de ronda por turno</strong>
            {api.isShiftWorker ? ' (aplica a tu rol).' : ' (meta por defecto para operarios).'}
          </p>
          <div className="two-col">
            <label>
              Turno
              <select
                value={roundForm.shiftCode}
                onChange={(e) => setRoundForm((f) => ({ ...f, shiftCode: e.target.value }))}
              >
                <option value="T1">T1 (06–14)</option>
                <option value="T2">T2 (14–22)</option>
                <option value="T3">T3 (22–06)</option>
              </select>
            </label>
            <label>
              Título / zona
              <input
                type="text"
                value={roundForm.title}
                onChange={(e) => setRoundForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ej. Ronda nacedoras pasillo B"
              />
            </label>
          </div>
          <label>
            Hallazgos
            <textarea
              rows={3}
              value={roundForm.body}
              onChange={(e) => setRoundForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Novedades, T°, humedad, alarmas, acciones…"
              style={{ width: '100%', marginTop: 6 }}
            />
          </label>
          <button type="button" className="primary" disabled={busy} onClick={submitRound}>
            {busy ? 'Guardando…' : 'Registrar ronda'}
          </button>
          <h3 className="section-title" style={{ marginTop: 16 }}>
            Rondas de hoy ({api.myRoundsToday.length})
          </h3>
          {!api.myRoundsToday.length ? (
            <p className="exec-empty">Aún no hay rondas hoy.</p>
          ) : (
            <div className="admin-list">
              {api.myRoundsToday.map((r) => (
                <div key={r.id} className="admin-row">
                  <div className="admin-row-main">
                    <strong>
                      {r.shift_code || 'T'} · {r.title}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {new Date(r.created_at).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {r.body ? ` · ${r.body.slice(0, 80)}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'labores' && (
        <div className="inline-form" style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Reporta unidades de labor completadas con éxito. El coordinador define cuánto debes
            rendir.
          </p>
          <div className="two-col">
            <label>
              Labor
              <select
                value={laborForm.laborKey}
                onChange={(e) => setLaborForm((f) => ({ ...f, laborKey: e.target.value }))}
              >
                {laborOpts
                  .filter((k) => k.id !== 'shift_adherence')
                  .map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Cantidad
              <input
                type="number"
                min="1"
                value={laborForm.qty}
                onChange={(e) => setLaborForm((f) => ({ ...f, qty: e.target.value }))}
              />
            </label>
          </div>
          <label>
            Nota
            <input
              type="text"
              value={laborForm.note}
              onChange={(e) => setLaborForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Opcional"
            />
          </label>
          <button type="button" className="primary" disabled={busy} onClick={reportLabor}>
            Reportar labor exitosa
          </button>
        </div>
      )}

      {tab === 'metas' && (api.isCoord || isOmniscient) && (
        <div className="inline-form" style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Define cuánto debe rendir cada rol. Ejemplo: turneros = {DEFAULT_MIN_ROUNDS_PER_SHIFT}{' '}
            rondas/turno.
          </p>
          <div className="two-col">
            <label>
              Indicador
              <select
                value={targetForm.laborKey}
                onChange={(e) => {
                  const k = LABOR_KEYS.find((x) => x.id === e.target.value)
                  setTargetForm((f) => ({
                    ...f,
                    laborKey: e.target.value,
                    expected: k?.defaultExpected ?? 0,
                    label: k?.label || '',
                  }))
                }}
              >
                {LABOR_KEYS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rol objetivo
              <select
                value={targetForm.forRole}
                onChange={(e) => setTargetForm((f) => ({ ...f, forRole: e.target.value }))}
              >
                <option value="operator">Operario de turno</option>
                <option value="auxiliary">Auxiliar de turno</option>
                <option value="auxiliary_production">Auxiliar producción</option>
                <option value="reception_operator">Recepción</option>
                <option value="barn_operator">Operario granja</option>
                <option value="supervisor">Supervisor</option>
                <option value="coordinator">Coordinador</option>
                <option value="">Todos (global)</option>
              </select>
            </label>
          </div>
          <div className="two-col">
            <label>
              Valor esperado
              <input
                type="number"
                min="0"
                value={targetForm.expected}
                onChange={(e) => setTargetForm((f) => ({ ...f, expected: e.target.value }))}
              />
            </label>
            <label>
              Etiqueta (opcional)
              <input
                type="text"
                value={targetForm.label}
                onChange={(e) => setTargetForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Se rellena sola"
              />
            </label>
          </div>
          <button type="button" className="primary" disabled={busy} onClick={saveTarget}>
            Guardar meta
          </button>
          <h3 className="section-title" style={{ marginTop: 16 }}>
            Metas activas ({api.targets.length})
          </h3>
          {!api.targets.length ? (
            <p className="exec-empty">
              Sin metas en nube/local: se usan defaults (p. ej. {DEFAULT_MIN_ROUNDS_PER_SHIFT}{' '}
              rondas).
            </p>
          ) : (
            <div className="admin-list">
              {api.targets.map((t) => (
                <div key={t.id} className="admin-row">
                  <div className="admin-row-main">
                    <strong>
                      {t.label || t.labor_key}: {t.expected} {t.unit}
                    </strong>
                    <span className="hint" style={{ margin: 0 }}>
                      Rol: {t.role ? ROLE_LABEL[t.role] || t.role : 'global'}
                      {t.user_id ? ` · usuario ${String(t.user_id).slice(0, 8)}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'equipo' && (api.isCoord || isOmniscient) && (
        <div style={{ marginTop: 14 }}>
          <div className="actions row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
            <button type="button" className="ghost small" onClick={() => api.reload()}>
              Actualizar
            </button>
            <ExportMenu
              filename="cumplimiento_equipo"
              sheets={[
                { name: 'Ranking_hoy', rows: teamExportRows },
                {
                  name: 'Componentes',
                  rows: api.teamScores.flatMap((m) =>
                    (m.score.components || []).map((c) => ({
                      Usuario: m.name,
                      Rol: ROLE_LABEL[m.role] || m.role,
                      Actividad: c.label,
                      Esperado: c.expected,
                      Reportado: c.actual,
                      Cumplimiento_pct: c.pct,
                      Cumple: c.ok ? 'SÍ' : 'NO',
                    }))
                  ),
                },
              ]}
              meta={{
                title: 'Ranking de cumplimiento y elegibilidad de bono',
                orgName: orgName || undefined,
                module: 'Cumplimiento',
                generatedBy: userName || undefined,
              }}
              label="Exportar"
              disabled={!teamExportRows.length}
            />
          </div>
          <p className="hint">
            Ranking del día. Bono solo si 90 días continuos + ≥{api.minScore}% (financiado por SaaS
            a clientes / empresas hermanas).
          </p>
          {api.loading ? (
            <p className="hint">Cargando…</p>
          ) : (
            <div className="admin-list">
              {api.teamScores.map((m) => (
                <div key={m.id} className="admin-row" style={{ flexWrap: 'wrap' }}>
                  <div className="admin-row-main" style={{ flex: 1, minWidth: 160 }}>
                    <strong>{m.name}</strong>
                    <span className="hint" style={{ margin: 0 }}>
                      {ROLE_LABEL[m.role] || m.role} · {m.score.continuousDays}d continuo · rondas{' '}
                      {m.score.components.find((c) => c.key === 'rounds')?.actual ?? 0}
                    </span>
                  </div>
                  <span
                    className={`pill status ${
                      m.score.bonusEligible
                        ? 'ok'
                        : m.score.scorePct >= 70
                          ? 'warn'
                          : 'off'
                    }`}
                  >
                    {m.score.scorePct}%
                    {m.score.bonusEligible ? ' · bono' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
