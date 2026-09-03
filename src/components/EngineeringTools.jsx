/**
 * =============================================================================
 * ARCHIVO: src/components/EngineeringTools.jsx
 * PROPÓSITO: Componente UI «EngineeringTools»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de módulo o pestaña correspondiente.
 * CÓMO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegación hacia otros módulos.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import {
  loadToolState,
  saveToolState,
  taktTime,
  roundLoadEstimate,
} from '../lib/ieTools'

/** Anillo / medidor circular CSS */
export function GaugeRing({ value = 0, label, sub, tone = '', size = 96 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  const r = 40
  const c = 2 * Math.PI * r
  const offset = c - (v / 100) * c
  return (
    <div className={`gauge-ring ${tone}`} style={{ '--gauge-size': `${size}px` }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="gauge-bg" cx="50" cy="50" r={r} />
        <circle
          className="gauge-fg"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-center">
        <strong>{Math.round(v)}</strong>
        <span>{label}</span>
        {sub && <em>{sub}</em>}
      </div>
    </div>
  )
}

export function ScoreBar({ label, score, hint }) {
  const tone = score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'danger'
  return (
    <div className={`score-bar ${tone}`}>
      <div className="score-bar-head">
        <strong>{label}</strong>
        <span>{score}</span>
      </div>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${score}%` }} />
      </div>
      {hint && <p className="score-bar-hint">{hint}</p>}
    </div>
  )
}

export function ParetoBars({ rows = [], max = 6 }) {
  const list = rows.slice(0, max)
  const top = list[0]?.count || 1
  if (!list.length) return <p className="cockpit-empty">Sin datos para Pareto.</p>
  return (
    <div className="pareto-list">
      {list.map((r) => (
        <div key={r.label} className="pareto-row">
          <div className="pareto-meta">
            <strong title={r.label}>{r.label}</strong>
            <span>
              {r.count} · {r.pct}% (Σ {r.cumPct}%)
            </span>
          </div>
          <div className="pareto-track">
            <div
              className="pareto-fill"
              style={{ width: `${Math.max(8, (r.count / top) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Calculadora Takt + balanceo de ronda */
export function CycleCalculators({ defaultMachines = 0, defaultPeople = 1 }) {
  const [machines, setMachines] = useState(defaultMachines)
  const [people, setPeople] = useState(defaultPeople)
  const [minPer, setMinPer] = useState(4)
  const [demand, setDemand] = useState(defaultMachines || 10)
  const [avail, setAvail] = useState(60)

  useEffect(() => {
    setMachines(defaultMachines)
    setDemand(defaultMachines || 10)
  }, [defaultMachines])
  useEffect(() => {
    setPeople(defaultPeople)
  }, [defaultPeople])

  const load = useMemo(
    () => roundLoadEstimate({ machines: Number(machines), minPerMachine: Number(minPer), people: Number(people) }),
    [machines, minPer, people]
  )
  const takt = useMemo(
    () => taktTime({ availableMin: Number(avail), demandUnits: Number(demand) }),
    [avail, demand]
  )

  return (
    <div className="tool-grid-2">
      <div className="tool-card">
        <h4>Balanceo de ronda</h4>
        <p className="tool-desc">Estima si la ronda cabe en la hora (ingeniería de métodos).</p>
        <div className="tool-fields">
          <label>
            Máquinas
            <input type="number" min={0} value={machines} onChange={(e) => setMachines(e.target.value)} />
          </label>
          <label>
            Personas en ronda
            <input type="number" min={1} value={people} onChange={(e) => setPeople(e.target.value)} />
          </label>
          <label>
            Min / máquina
            <input type="number" min={1} step={0.5} value={minPer} onChange={(e) => setMinPer(e.target.value)} />
          </label>
        </div>
        <div className="tool-result">
          <strong>{load.cycleMin} min</strong>
          <span>ciclo con {load.people} persona(s) · carga total {load.totalMin} min</span>
          <p className={load.feasible60 ? 'ok-text' : 'warn-text'}>{load.suggestion}</p>
        </div>
      </div>
      <div className="tool-card">
        <h4>Takt time</h4>
        <p className="tool-desc">Ritmo objetivo: tiempo disponible ÷ demanda del período.</p>
        <div className="tool-fields">
          <label>
            Minutos disponibles
            <input type="number" min={1} value={avail} onChange={(e) => setAvail(e.target.value)} />
          </label>
          <label>
            Unidades / demanda
            <input type="number" min={1} value={demand} onChange={(e) => setDemand(e.target.value)} />
          </label>
        </div>
        <div className="tool-result">
          <strong>{takt.label}</strong>
          <span>takt ≈ {takt.seconds} s por unidad</span>
        </div>
      </div>
    </div>
  )
}

/** 5 porqués (A3 ligero) */
export function FiveWhysTool({ orgId, storageName = 'five_whys' }) {
  const [problem, setProblem] = useState('')
  const [whys, setWhys] = useState(['', '', '', '', ''])
  const [action, setAction] = useState('')

  useEffect(() => {
    const s = loadToolState(orgId, storageName, null)
    if (s) {
      setProblem(s.problem || '')
      setWhys(s.whys || ['', '', '', '', ''])
      setAction(s.action || '')
    }
  }, [orgId, storageName])

  const persist = (next) => {
    saveToolState(orgId, storageName, next)
  }

  return (
    <div className="tool-card full">
      <h4>5 porqués · causa raíz</h4>
      <p className="tool-desc">Documenta un problema operativo hasta la causa raíz y la acción correctiva.</p>
      <label>
        Problema observado
        <input
          type="text"
          value={problem}
          placeholder="Ej. Ronda de la hora incompleta en nacedoras"
          onChange={(e) => {
            const v = e.target.value
            setProblem(v)
            persist({ problem: v, whys, action })
          }}
        />
      </label>
      <div className="why-list">
        {whys.map((w, i) => (
          <label key={i}>
            ¿Por qué {i + 1}?
            <input
              type="text"
              value={w}
              placeholder={i === 0 ? 'Primera causa aparente…' : 'Causa del nivel anterior…'}
              onChange={(e) => {
                const next = whys.map((x, j) => (j === i ? e.target.value : x))
                setWhys(next)
                persist({ problem, whys: next, action })
              }}
            />
          </label>
        ))}
      </div>
      <label>
        Acción correctiva / contención
        <input
          type="text"
          value={action}
          placeholder="Qué se hará, quién y cuándo"
          onChange={(e) => {
            const v = e.target.value
            setAction(v)
            persist({ problem, whys, action: v })
          }}
        />
      </label>
    </div>
  )
}

const GembaItems = [
  '¿Hay desviaciones visibles en proceso o 5S?',
  '¿Los estándares están publicados y se cumplen?',
  '¿El personal conoce el estado de la ronda/OT?',
  '¿Hay cuellos de botella o esperas?',
  '¿Se registran novedades en el sistema?',
  '¿EPP y bioseguridad OK en el área?',
]

const FiveSItems = [
  { k: 'seiri', label: 'Seiri · Clasificar' },
  { k: 'seiton', label: 'Seiton · Ordenar' },
  { k: 'seiso', label: 'Seiso · Limpiar' },
  { k: 'seiketsu', label: 'Seiketsu · Estandarizar' },
  { k: 'shitsuke', label: 'Shitsuke · Disciplina' },
]

export function GembaFiveSTools({ orgId }) {
  const [gemba, setGemba] = useState(() => GembaItems.map(() => false))
  const [fiveS, setFiveS] = useState(() => Object.fromEntries(FiveSItems.map((x) => [x.k, 0])))
  const [note, setNote] = useState('')

  useEffect(() => {
    const s = loadToolState(orgId, 'gemba_5s', null)
    if (s) {
      setGemba(s.gemba || GembaItems.map(() => false))
      setFiveS(s.fiveS || Object.fromEntries(FiveSItems.map((x) => [x.k, 0])))
      setNote(s.note || '')
    }
  }, [orgId])

  const save = (patch) => {
    const next = {
      gemba,
      fiveS,
      note,
      ...patch,
      at: new Date().toISOString(),
    }
    if (patch.gemba) setGemba(patch.gemba)
    if (patch.fiveS) setFiveS(patch.fiveS)
    if (patch.note != null) setNote(patch.note)
    saveToolState(orgId, 'gemba_5s', next)
  }

  const gembaScore = Math.round((gemba.filter(Boolean).length / GembaItems.length) * 100)
  const fiveAvg = Math.round(
    Object.values(fiveS).reduce((a, b) => a + Number(b), 0) / FiveSItems.length
  )

  return (
    <div className="tool-grid-2">
      <div className="tool-card">
        <h4>Gemba walk</h4>
        <p className="tool-desc">Checklist de recorrido en planta · {gembaScore}% cubierto</p>
        <div className="check-tool-list">
          {GembaItems.map((item, i) => (
            <label key={item} className="check-tool-item">
              <input
                type="checkbox"
                checked={!!gemba[i]}
                onChange={(e) => {
                  const next = gemba.map((v, j) => (j === i ? e.target.checked : v))
                  save({ gemba: next })
                }}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="tool-card">
        <h4>5S · auditoría rápida</h4>
        <p className="tool-desc">Puntúa 0–5 cada pilar · promedio {fiveAvg}/5</p>
        <div className="fives-list">
          {FiveSItems.map((x) => (
            <label key={x.k}>
              {x.label}
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={fiveS[x.k] ?? 0}
                onChange={(e) => {
                  const next = { ...fiveS, [x.k]: Number(e.target.value) }
                  save({ fiveS: next })
                }}
              />
              <em>{fiveS[x.k] ?? 0}</em>
            </label>
          ))}
        </div>
        <label>
          Nota de campo
          <input
            type="text"
            value={note}
            placeholder="Hallazgos del recorrido…"
            onChange={(e) => save({ note: e.target.value })}
          />
        </label>
      </div>
    </div>
  )
}

/** Bitácora de decisiones / acciones (gerencia o coord.) */
export function ActionLogTool({ orgId, title = 'Bitácora de decisiones', storageName = 'action_log' }) {
  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [owner, setOwner] = useState('')

  useEffect(() => {
    setItems(loadToolState(orgId, storageName, []))
  }, [orgId, storageName])

  const add = () => {
    const t = text.trim()
    if (!t) return
    const next = [
      {
        id: `${Date.now()}`,
        text: t,
        owner: owner.trim() || '—',
        at: new Date().toISOString(),
        done: false,
      },
      ...items,
    ].slice(0, 40)
    setItems(next)
    saveToolState(orgId, storageName, next)
    setText('')
  }

  const toggle = (id) => {
    const next = items.map((it) => (it.id === id ? { ...it, done: !it.done } : it))
    setItems(next)
    saveToolState(orgId, storageName, next)
  }

  const remove = (id) => {
    const next = items.filter((it) => it.id !== id)
    setItems(next)
    saveToolState(orgId, storageName, next)
  }

  return (
    <div className="tool-card full">
      <h4>{title}</h4>
      <p className="tool-desc">Compromisos y decisiones del día (se guardan en este dispositivo).</p>
      <div className="tool-inline-form">
        <input
          type="text"
          value={text}
          placeholder="Decisión o acción…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          type="text"
          value={owner}
          placeholder="Responsable"
          onChange={(e) => setOwner(e.target.value)}
          style={{ maxWidth: 140 }}
        />
        <button type="button" className="primary small" onClick={add}>
          Añadir
        </button>
      </div>
      {items.length === 0 ? (
        <p className="cockpit-empty">Sin entradas todavía.</p>
      ) : (
        <div className="action-log-list">
          {items.map((it) => (
            <div key={it.id} className={`action-log-item${it.done ? ' done' : ''}`}>
              <label className="check-tool-item" style={{ flex: 1, margin: 0 }}>
                <input type="checkbox" checked={it.done} onChange={() => toggle(it.id)} />
                <span>
                  <strong>{it.text}</strong>
                  <em>
                    {it.owner} ·{' '}
                    {new Date(it.at).toLocaleString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </em>
                </span>
              </label>
              <button type="button" className="ghost small" onClick={() => remove(it.id)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Metas / OKR ligeros */
export function GoalsTool({ orgId }) {
  const [goals, setGoals] = useState([])
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')

  useEffect(() => {
    setGoals(loadToolState(orgId, 'mgmt_goals', []))
  }, [orgId])

  const persist = (next) => {
    setGoals(next)
    saveToolState(orgId, 'mgmt_goals', next)
  }

  const add = () => {
    const t = title.trim()
    if (!t) return
    persist(
      [
        {
          id: `${Date.now()}`,
          title: t,
          target: target.trim() || '—',
          progress: 0,
        },
        ...goals,
      ].slice(0, 12)
    )
    setTitle('')
    setTarget('')
  }

  return (
    <div className="tool-card full">
      <h4>Metas de dirección (OKR ligero)</h4>
      <p className="tool-desc">Objetivos del período con avance 0–100%.</p>
      <div className="tool-inline-form">
        <input
          type="text"
          value={title}
          placeholder="Objetivo…"
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="text"
          value={target}
          placeholder="Meta / KR"
          onChange={(e) => setTarget(e.target.value)}
          style={{ maxWidth: 160 }}
        />
        <button type="button" className="primary small" onClick={add}>
          Añadir
        </button>
      </div>
      {goals.length === 0 ? (
        <p className="cockpit-empty">Define 2–4 metas del trimestre.</p>
      ) : (
        <div className="goals-list">
          {goals.map((g) => (
            <div key={g.id} className="goal-row">
              <div className="goal-head">
                <strong>{g.title}</strong>
                <span>{g.target}</span>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => persist(goals.filter((x) => x.id !== g.id))}
                >
                  Quitar
                </button>
              </div>
              <label className="goal-slider">
                Avance {g.progress}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={g.progress}
                  onChange={(e) =>
                    persist(
                      goals.map((x) =>
                        x.id === g.id ? { ...x, progress: Number(e.target.value) } : x
                      )
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ToolTabs({ tabs, active, onChange }) {
  return (
    <div className="cockpit-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={active === t.id ? 'cockpit-tab active' : 'cockpit-tab'}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
