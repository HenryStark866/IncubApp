/**
 * IoT y bioseguridad — checklist operativo por sede + semáforo consolidado.
 * Telemetría en vivo se conecta cuando haya dispositivos; checklist ya es usable.
 * Henry Stark Desarrollador
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL, areaLabel } from '../lib/roles'

export const IOT_DASHBOARDS = [
  {
    id: 'arcos',
    title: 'Arcos de desinfección',
    blurb:
      'Un arco por sede: estado operativo, ciclos, bomba y nivel de solución (checklist de campo).',
    icon: 'A',
  },
  {
    id: 'porterias',
    title: 'Porterías de sedes',
    blurb: 'Control de acceso vehicular/peatonal, bitácora y barreras (checklist de campo).',
    icon: 'P',
  },
  {
    id: 'ambiente',
    title: 'Control y monitoreo de ambiente',
    blurb: 'T°, humedad, CO₂ y umbrales — checklist y lectura de sensores cuando existan.',
    icon: 'M',
  },
  {
    id: 'aspersion',
    title: 'Sistema de desinfección por aspersión',
    blurb: 'Presión, programas y cobertura de zonas (checklist de campo).',
    icon: 'S',
  },
  {
    id: 'bioseguridad',
    title: 'Bioseguridad total',
    blurb: 'Semáforo consolidado de la sede a partir de los checklists de cada tablero.',
    icon: 'B',
  },
]

const CHECKS = {
  arcos: ['Arco energizado', 'Bomba operativa', 'Nivel de solución OK', 'Boquillas sin obstrucción'],
  porterias: ['Cámaras online', 'Barrera operativa', 'Bitácora del día', 'Comunicación con vigilancia'],
  ambiente: ['Sensores T°/HR online', 'Umbrales configurados', 'Alarmas revisadas', 'Calibración al día'],
  aspersion: ['Presión de línea OK', 'Programa del día activo', 'Zonas cubiertas', 'Fugas revisadas'],
  bioseguridad: ['EPP en portería', 'Rodiluvios con solución', 'Control de visitas', 'Vacíos programados'],
}

function riskTone(pct) {
  if (pct >= 85) return { label: 'Bajo riesgo', cls: 'ok', value: 'Verde' }
  if (pct >= 60) return { label: 'Riesgo medio', cls: 'warn', value: 'Ámbar' }
  return { label: 'Riesgo alto', cls: 'off', value: 'Rojo' }
}

function loadDash(orgId, siteId, dashId) {
  try {
    const raw = localStorage.getItem(`incubapp_iot_${orgId}_${siteId}_${dashId}`)
    return raw ? JSON.parse(raw) : { checks: {}, note: '' }
  } catch {
    return { checks: {}, note: '' }
  }
}

export default function IotBiosecurityHub({ orgId, role, area, userName }) {
  const [sites, setSites] = useState([])
  const [siteId, setSiteId] = useState('')
  const [active, setActive] = useState(IOT_DASHBOARDS[0].id)
  const [loading, setLoading] = useState(true)
  const [checks, setChecks] = useState({})
  const [note, setNote] = useState('')
  const [sensorKpis, setSensorKpis] = useState({ online: 0, total: 0, alarms: 0 })
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    supabase
      .from('plants')
      .select('id, name, code, city')
      .eq('org_id', orgId)
      .order('name')
      .then(({ data }) => {
        const list = data ?? []
        setSites(list)
        if (list[0] && !siteId) setSiteId(list[0].id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [orgId])

  // Lecturas de sensores (si existen) para tablero ambiente
  useEffect(() => {
    if (!orgId || !siteId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: sensors } = await supabase
          .from('sensors')
          .select('id, status, plant_id')
          .eq('org_id', orgId)
          .eq('plant_id', siteId)
          .limit(80)
        if (cancelled) return
        const list = sensors ?? []
        const online = list.filter((s) => s.status === 'active' || s.status === 'online').length
        setSensorKpis({ online, total: list.length, alarms: list.length - online })
      } catch {
        if (!cancelled) setSensorKpis({ online: 0, total: 0, alarms: 0 })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, siteId])

  useEffect(() => {
    if (!orgId || !siteId || !active) return
    const p = loadDash(orgId, siteId, active)
    setChecks(p.checks || {})
    setNote(p.note || '')
    setSavedAt(p.at || null)
  }, [orgId, siteId, active])

  const persist = (nextChecks, nextNote) => {
    if (!orgId || !siteId) return
    const at = new Date().toISOString()
    localStorage.setItem(
      `incubapp_iot_${orgId}_${siteId}_${active}`,
      JSON.stringify({ checks: nextChecks, note: nextNote, at })
    )
    setSavedAt(at)
  }

  const site = useMemo(() => sites.find((s) => s.id === siteId) || null, [sites, siteId])
  const dash = IOT_DASHBOARDS.find((d) => d.id === active) || IOT_DASHBOARDS[0]
  const first = (userName || '').trim().split(/\s+/)[0] || ''
  const list = CHECKS[active] || []
  const done = list.filter((_, i) => checks[i]).length
  const pct = list.length ? Math.round((done / list.length) * 100) : 0

  // Semáforo consolidado multi-tablero para la sede
  const consolidated = useMemo(() => {
    if (!orgId || !siteId) return { avg: 0, by: {}, tone: riskTone(0) }
    const by = {}
    let sum = 0
    let n = 0
    for (const d of IOT_DASHBOARDS) {
      const items = CHECKS[d.id] || []
      if (!items.length) continue
      const p = loadDash(orgId, siteId, d.id)
      const ok = items.filter((_, i) => p.checks?.[i]).length
      const score = Math.round((ok / items.length) * 100)
      by[d.id] = score
      sum += score
      n += 1
    }
    const avg = n ? Math.round(sum / n) : 0
    return { avg, by, tone: riskTone(avg) }
  }, [orgId, siteId, checks, active, savedAt])

  const resetChecks = () => {
    setChecks({})
    setNote('')
    persist({}, '')
  }

  const markAll = (val) => {
    const next = {}
    list.forEach((_, i) => {
      next[i] = val
    })
    setChecks(next)
    persist(next, note)
  }

  return (
    <div className="card wide">
      <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0 }}>IoT y bioseguridad</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {first ? `${first} · ` : ''}
            {ROLE_LABEL[role] ?? role}
            {area ? ` · ${areaLabel(area)}` : ''}
          </p>
        </div>
        <span className={`pill status ${consolidated.tone.cls}`}>
          Sede {consolidated.tone.value} · {consolidated.avg}%
        </span>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Checklist operativo por sede (se guarda en este dispositivo). Cuando haya dispositivos IoT,
        las lecturas en vivo se mostrarán junto al checklist.
      </p>

      <div className="two-col" style={{ marginTop: 12 }}>
        <label>
          Sede
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            disabled={loading || !sites.length}
          >
            {!sites.length && <option value="">Sin sedes registradas</option>}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ''}
                {s.city ? ` · ${s.city}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="hint" style={{ alignSelf: 'end', marginBottom: 6 }}>
          {site
            ? `${site.name}: semáforo ${consolidated.tone.label.toLowerCase()} (${consolidated.avg}%).`
            : 'Cree plantas/sedes en Plantas o Granjas para vincular IoT.'}
        </div>
      </div>

      <div className="exec-kpi-grid" style={{ marginTop: 12 }}>
        {IOT_DASHBOARDS.map((d) => (
          <div key={d.id} className={`exec-kpi ${riskTone(consolidated.by[d.id] ?? 0).cls}`}>
            <span className="exec-kpi-value" style={{ fontSize: 18 }}>
              {consolidated.by[d.id] ?? 0}%
            </span>
            <span className="exec-kpi-label">{d.title.split(' ')[0]}</span>
          </div>
        ))}
      </div>

      <div className="iot-grid" style={{ marginTop: 16 }}>
        {IOT_DASHBOARDS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`iot-card${active === d.id ? ' active' : ''}`}
            onClick={() => setActive(d.id)}
          >
            <span className="iot-card-icon" aria-hidden="true">
              {d.icon}
            </span>
            <strong>{d.title}</strong>
            <span className="hint" style={{ margin: 0 }}>
              {d.blurb}
            </span>
            <span className={`iot-badge ${riskTone(consolidated.by[d.id] ?? 0).cls}`}>
              {consolidated.by[d.id] ?? 0}% OK
            </span>
          </button>
        ))}
      </div>

      <div className="iot-detail" style={{ marginTop: 18 }}>
        <div className="card-head" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            {dash.title}
            {site ? ` · ${site.name}` : ''}
          </h3>
          <span className={`pill status ${pct === 100 ? 'ok' : pct >= 50 ? 'warn' : 'off'}`}>
            Checklist {pct}%
          </span>
        </div>

        <div className="kpi-grid" style={{ marginTop: 4 }}>
          <div className="kpi-card">
            <span className="kpi-value">{pct}%</span>
            <span className="kpi-label">Checklist hoy</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">
              {done}/{list.length}
            </span>
            <span className="kpi-label">Ítems OK</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">{sensorKpis.online}/{sensorKpis.total || '—'}</span>
            <span className="kpi-label">Sensores sede</span>
          </div>
          {active === 'bioseguridad' && (
            <div className="kpi-card">
              <span className="kpi-value">{consolidated.tone.value}</span>
              <span className="kpi-label">Riesgo sede</span>
            </div>
          )}
        </div>

        <div className="actions row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="ghost small" onClick={() => markAll(true)}>
            Marcar todo OK
          </button>
          <button type="button" className="ghost small" onClick={() => markAll(false)}>
            Limpiar
          </button>
          <button type="button" className="ghost small" onClick={resetChecks}>
            Reiniciar sede/tablero
          </button>
        </div>

        <div className="check-tool-list" style={{ marginTop: 14 }}>
          {list.map((item, i) => (
            <label key={item} className="check-tool-item">
              <input
                type="checkbox"
                checked={!!checks[i]}
                onChange={(e) => {
                  const next = { ...checks, [i]: e.target.checked }
                  setChecks(next)
                  persist(next, note)
                }}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
        <label style={{ display: 'block', marginTop: 12 }}>
          Nota de campo
          <input
            type="text"
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              persist(checks, e.target.value)
            }}
            placeholder="Hallazgos, fallas, consumo…"
          />
        </label>
        {savedAt && (
          <p className="hint" style={{ marginTop: 8 }}>
            Guardado: {new Date(savedAt).toLocaleString('es-CO')}
          </p>
        )}

        {active === 'bioseguridad' && (
          <div className="tool-card" style={{ marginTop: 14 }}>
            <h4>Consolidado multi-tablero</h4>
            <ul className="hint" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.55 }}>
              {IOT_DASHBOARDS.filter((d) => d.id !== 'bioseguridad').map((d) => (
                <li key={d.id}>
                  {d.title}: <strong>{consolidated.by[d.id] ?? 0}%</strong>
                </li>
              ))}
              <li>
                Semáforo sede: <strong>{consolidated.tone.label}</strong> ({consolidated.avg}%)
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
