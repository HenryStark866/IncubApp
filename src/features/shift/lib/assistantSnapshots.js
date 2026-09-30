/**
 * Resúmenes del turno para el asistente de voz: lo que cada inicio muestra, en
 * frases listas para leer en voz alta. Los usa lib/voiceAssistant (respuestas sin
 * internet) y viajan como contexto cuando la pregunta va a la IA.
 * Henry Stark Desarrollador · CDH Maker
 */
import { SHIFT_WINDOWS, clock } from './shiftHome'

const hh = (h) => `${String(h).padStart(2, '0')}:00`
const rango = (shift) => {
  const w = SHIFT_WINDOWS[shift]?.label || ''
  const [ini, fin] = w.split(' – ')
  return ini && fin ? `de ${ini} a ${fin}` : ''
}

/** Operario / auxiliar de turno. */
export function operatorSnapshot({ nombre, rol, slot, timeLeft, stage, lateMin = 0, done = 0, min = 6, nextAt = null, round = null, acts = { doing: [], todo: [] }, attention = [], nextShift = null, isAux = false }) {
  const pendientes = []
  if (stage?.stage === 'in') pendientes.push('marcar tu ingreso con selfie')
  if (!isAux && round && round.total && round.done < round.total) {
    const salas = (round.rooms || []).filter((r) => r.done < r.total).map((r) => r.name)
    pendientes.push(`terminar la ronda de las ${hh(slot.hour)} (faltan ${round.total - round.done} máquinas${salas.length ? `: ${salas.slice(0, 3).join(', ')}` : ''})`)
  }
  for (const a of acts.doing || []) pendientes.push(`terminar la actividad «${a.title}»`)
  for (const a of acts.todo || []) pendientes.push(`iniciar la actividad «${a.title}»`)

  const asistencia =
    stage?.stage === 'in'
      ? 'aún no has marcado ingreso'
      : stage?.stage === 'inside'
        ? `ingreso a las ${clock(stage.inPunch?.punched_at)}${lateMin > 0 ? `, ${lateMin} minutos tarde` : ', a tiempo'}`
        : stage?.stage === 'done'
          ? `ya marcaste salida a las ${clock(stage.outPunch?.punched_at)}`
          : null

  return {
    rol,
    nombre,
    pantalla: 'Inicio del turno',
    turno: `turno ${slot.shift}, ${rango(slot.shift)}${timeLeft ? `; ${timeLeft}` : ''}`,
    asistencia,
    rondas: isAux
      ? null
      : `Llevas ${done} de ${min} rondas del turno${round && round.total ? `. En la ronda de las ${hh(slot.hour)} van ${round.done} de ${round.total} máquinas` : ''}${nextAt && done < min ? `. La próxima sugerida es a las ${nextAt}` : ''}`,
    pendientes,
    siguiente: pendientes[0] || (nextAt && !isAux ? `nada urgente; tu próxima ronda sugerida es a las ${nextAt}` : null),
    maquinasNovedad: (attention || []).map((a) => `${a.code}: ${a.notes || (a.condition === 'fault' ? 'falla' : 'alerta')}`),
    proximoTurno: nextShift ? (nextShift.isRest ? `${nextShift.label} tienes descanso` : `${nextShift.label}, turno ${nextShift.shiftNumber} ${rango(nextShift.shiftNumber)}`) : null,
  }
}

/** Supervisor. */
export function supervisorSnapshot({ nombre, slot, timeLeft, status, feed = [], team, cols, hourNow = null, total = 0, attention = [] }) {
  const atencion = feed.filter((i) => i.severity > 0).map((i) => `${i.title} (${i.sub})`)
  return {
    rol: 'Supervisor de planta',
    nombre,
    pantalla: 'Tablero del turno',
    turno: `turno ${slot.shift}, ${rango(slot.shift)}${timeLeft ? `; ${timeLeft}` : ''}`,
    estadoTurno: status?.headline || null,
    pendientes: atencion,
    siguiente: atencion[0] ? `atender: ${atencion[0]}` : null,
    equipo: team
      ? `${team.present} de ${team.total} presentes${team.absent?.length ? `; sin llegar: ${team.absent.map((p) => p.name).join(', ')}` : ''}${team.behind?.length ? `; atrasados en rondas: ${team.behind.map((p) => p.name).join(', ')}` : ''}`
      : null,
    rondas: hourNow ? `En la ronda de las ${hh(slot.hour)} van ${hourNow.done} de ${total} máquinas de la planta` : null,
    actividades: cols ? `${cols.todo.length} pendientes, ${cols.doing.length} en curso y ${cols.done.length} hechas hoy` : null,
    maquinasNovedad: (attention || []).map((a) => `${a.code}: ${a.notes || (a.condition === 'fault' ? 'falla' : 'alerta')}`),
  }
}

/** Auxiliar de mantenimiento. */
export function maintenanceSnapshot({ nombre, shift, thisWeek = [], late = [], weekItems = 0, weekDone = 0, assigned = [], doneInShift = 0, label = (t) => t.description }) {
  const pendientes = [
    ...assigned.slice(0, 3).map((o) => `atender la OT ${o.code || ''} «${o.title}»`.replace('  ', ' ')),
    ...thisWeek.slice(0, 6).map((w) => `${w.task.code}: ${label(w.task)}`),
  ]
  return {
    rol: 'Auxiliar de mantenimiento',
    nombre,
    pantalla: 'Inicio de mantenimiento',
    turno: shift ? `turno ${shift.shiftNumber}, ${rango(shift.shiftNumber)}` : null,
    planSemana: `Del Plan AM de esta semana van ${weekDone} de ${weekItems} cumplidas; ${late.length} atrasadas`,
    pendientes,
    siguiente: pendientes[0] || null,
    hechoEnTurno: `${doneInShift} trabajos registrados en este turno`,
  }
}
