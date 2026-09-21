/**
 * =============================================================================
 * ARCHIVO: src/components/ShiftSchedule.jsx
 * PROPÃ“SITO: Componente UI Â«ShiftScheduleÂ»: pantalla o widget de la interfaz operativa de IncubApp. Se renderiza cuando el usuario tiene permiso de mÃ³dulo o pestaÃ±a correspondiente.
 * CÃ“MO FUNCIONA: Recibe props (orgId, userId, role, etc.), usa hooks y renderiza JSX. Los eventos del usuario llaman a mutaciones o navegaciÃ³n hacia otros mÃ³dulos.
 * Cada bloque relevante de este archivo estÃ¡ orientado a la operaciÃ³n multi-mÃ³dulo
 * de incubaciÃ³n / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useShiftSchedule } from '../features/operations/hooks/useShiftSchedule'

const DAYS = 17 // ciclo 15 turno + 2 descanso
const SHIFT_LABEL = { 1: 'T1', 2: 'T2', 3: 'T3' }
const SHIFT_LONG = { 1: 'T1 Â· 06â€“14', 2: 'T2 Â· 14â€“22', 3: 'T3 Â· 22â€“06' }
const iso = (d) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}
const firstName = (n) => (n || '').trim().split(/\s+/)[0] || ''

// Estado de una celda a partir de su asignaciÃ³n
const cellVal = (a) => (a ? (a.is_rest ? 'rest' : a.shift_number ? String(a.shift_number) : '') : '')

export default function ShiftSchedule({ orgId, userId, role }) {
  const canEdit = ['owner', 'admin', 'supervisor', 'coordinator'].includes(role)
  const sch = useShiftSchedule(orgId, userId)
  const [ops, setOps] = useState([])
  const [plants, setPlants] = useState([])
  const [plantId, setPlantId] = useState('')
  const [start, setStart] = useState(() => iso(new Date()))
  const [selected, setSelected] = useState(() => new Set())
  const [rotShift, setRotShift] = useState('1')
  const [rotStart, setRotStart] = useState(() => iso(new Date()))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      supabase
        .from('organization_members')
        .select('user_id, role, profiles ( full_name, email )')
        .eq('org_id', orgId)
        .in('role', ['operator', 'auxiliary']),
      supabase.from('plants').select('id, name, code').eq('org_id', orgId).order('created_at'),
    ]).then(([m, p]) => {
      setOps((m.data ?? []).map((r) => ({ id: r.user_id, name: r.profiles?.full_name || r.profiles?.email || 'Operario', role: r.role })))
      // Solo plantas de incubaciÃ³n (las granjas usan prefijo G-)
      setPlants((p.data ?? []).filter((x) => !(x.code?.startsWith('G') || x.name?.startsWith('G-'))))
    })
  }, [orgId])

  useEffect(() => {
    if (!plantId && plants.length > 0) setPlantId(plants[0].id)
  }, [plants, plantId])

  // DÃ­as visibles a partir de `start`
  const days = useMemo(() => {
    const s = new Date(`${start}T00:00:00`)
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(s)
      d.setDate(s.getDate() + i)
      return d
    })
  }, [start])

  // Mapa asignaciones: `${user}|${date}`
  const map = useMemo(() => {
    const m = new Map()
    for (const a of sch.assignments) m.set(`${a.user_id}|${a.work_date}`, a)
    return m
  }, [sch.assignments])

  // Operarios que ve cada quien: gestiÃ³n ve a todos; un operario solo a sÃ­ mismo
  const rows = canEdit ? ops : ops.filter((o) => o.id === userId)

  const shiftDays = (from) => {
    const d = new Date(`${from}T00:00:00`)
    setStart(iso(d))
  }
  const move = (delta) => {
    const d = new Date(`${start}T00:00:00`)
    d.setDate(d.getDate() + delta)
    setStart(iso(d))
  }

  const toggleSel = (id) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const onCell = async (uid, date, e) => {
    const v = e.target.value
    await sch.setAssignment({
      userId: uid,
      date,
      shiftNumber: v === 'rest' || v === '' ? null : Number(v),
      isRest: v === 'rest',
      plantId,
    })
  }

  const generate = async () => {
    setBusy(true)
    await sch.generateRotation({
      userIds: [...selected],
      startDate: rotStart,
      shiftNumber: Number(rotShift),
      plantId,
    })
    setBusy(false)
  }

  const dayHead = (d) =>
    d.toLocaleDateString('es-CO', { weekday: 'short' }).slice(0, 2) + ' ' + d.getDate()

  return (
    <div className="card wide">
      <div className="card-head">
        <div>
          <h2>Horarios de turno</h2>
          <span className="hint" style={{ margin: 0 }}>
            {canEdit ? 'Asigna T1/T2/T3 o descanso Â· rotaciÃ³n 15/2' : 'Tu calendario de turnos'}
          </span>
        </div>
        <span className="pill live"><span className="dot" /> En vivo</span>
      </div>

      {/* Controles superiores */}
      <div className="admin-section-head" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <button className="chip ghost" onClick={() => move(-DAYS)}>â€¹ Anterior</button>
          <input type="date" value={start} onChange={(e) => shiftDays(e.target.value)} />
          <button className="chip ghost" onClick={() => move(DAYS)}>Siguiente â€º</button>
        </span>
        {plants.length > 1 && (
          <select value={plantId} onChange={(e) => setPlantId(e.target.value)}>
            {plants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        )}
      </div>

      {sch.error && <p className="msg error">{sch.error}</p>}

      {/* Grilla */}
      <div className="sched-wrap">
        <table className="sched-table">
          <thead>
            <tr>
              <th className="sched-name">Operario</th>
              {days.map((d) => (
                <th key={iso(d)} className={d.getDay() === 0 || d.getDay() === 6 ? 'sched-weekend' : ''}>{dayHead(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={DAYS + 1} className="hint" style={{ padding: 12 }}>No hay operarios de turno registrados.</td></tr>
            )}
            {rows.map((op) => (
              <tr key={op.id}>
                <td className="sched-name">
                  {canEdit && (
                    <input type="checkbox" checked={selected.has(op.id)} onChange={() => toggleSel(op.id)} title="Seleccionar para rotaciÃ³n" />
                  )}
                  <span title={op.name}>{firstName(op.name)}</span>
                </td>
                {days.map((d) => {
                  const date = iso(d)
                  const a = map.get(`${op.id}|${date}`)
                  const v = cellVal(a)
                  if (canEdit) {
                    return (
                      <td key={date} className={`sched-cell v-${v || 'none'}`}>
                        <select value={v} onChange={(e) => onCell(op.id, date, e)} aria-label={`Turno ${firstName(op.name)} ${date}`}>
                          <option value="">â€”</option>
                          <option value="1">T1</option>
                          <option value="2">T2</option>
                          <option value="3">T3</option>
                          <option value="rest">D</option>
                        </select>
                      </td>
                    )
                  }
                  return (
                    <td key={date} className={`sched-cell v-${v || 'none'}`}>
                      <span>{a?.is_rest ? 'D' : a?.shift_number ? SHIFT_LABEL[a.shift_number] : 'â€”'}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        <span className="pill status ok" style={{ marginRight: 6 }}>T1</span> 06â€“14 Â·
        <span className="pill status" style={{ margin: '0 6px' }}>T2</span> 14â€“22 Â·
        <span className="pill status warn" style={{ margin: '0 6px' }}>T3</span> 22â€“06 Â·
        <span className="pill status idle" style={{ marginLeft: 6 }}>D</span> descanso
      </p>

      {/* Generador de rotaciÃ³n 15/2 */}
      {canEdit && (
        <>
          <h3 className="section-title" style={{ margin: '18px 0 8px' }}>Generar rotaciÃ³n 15/2</h3>
          <div className="inline-form compact">
            <p className="hint" style={{ margin: 0 }}>
              Marca los operarios en la tabla, elige el turno y la fecha de inicio: se crean 15 dÃ­as de turno + 2 de descanso.
            </p>
            <div className="two-col">
              <label>
                Turno
                <select value={rotShift} onChange={(e) => setRotShift(e.target.value)}>
                  <option value="1">{SHIFT_LONG[1]}</option>
                  <option value="2">{SHIFT_LONG[2]}</option>
                  <option value="3">{SHIFT_LONG[3]}</option>
                </select>
              </label>
              <label>
                Inicio
                <input type="date" value={rotStart} onChange={(e) => setRotStart(e.target.value)} />
              </label>
            </div>
            <div className="actions row">
              <button className="primary" onClick={generate} disabled={busy || selected.size === 0}>
                {busy ? 'Generandoâ€¦' : `Generar para ${selected.size} operario${selected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

