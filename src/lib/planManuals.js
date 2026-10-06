/**
 * Manuales e instructivos del Plan AM por sede y por tarea.
 * Los documentos viven en src/assets/manuales/sig/** y la app los publica sola
 * (data/maintenanceManuals.js). Aquí solo se eligen los de cada sede o tarea.
 * Henry Stark Desarrollador
 */
import { LOCAL_MAINTENANCE_MANUALS } from '../data/maintenanceManuals'

/** Carpeta de manuales propios de cada sede (src/assets/manuales/sig/<carpeta>). */
const SEDE_FOLDERS = {
  'GRANJA LA FE': '/MANUALES GRANJA LA FE/',
}

/** Sede del plan («GRANJA LA FE») a partir de la sede asignada (plants: «G-GRANJA LA FE»). */
export function sedeOfSite(site) {
  const name = String(site?.name || '').trim().toUpperCase()
  if (!name) return null
  return name.replace(/^G-/, '')
}

const byName = (a, b) => a.file_name.localeCompare(b.file_name, 'es')

/** Manuales de una sede + el programa PRGMAT01 (que trae su hoja de plan). */
export function manualsForSede(sede, all = LOCAL_MAINTENANCE_MANUALS) {
  const folder = SEDE_FOLDERS[sede]
  if (!folder) return []
  const own = all.filter((m) => String(m.sourcePath || '').includes(folder)).sort(byName)
  const program = all.filter((m) => /PRGMAT01/i.test(m.file_name) && m.file_type === 'spreadsheet')
  return [...own, ...program]
}

/** Manual(es) que cita una tarea en su campo «manual» (p. ej. «MAN-LF-03 §8.2»). */
export function manualsForTask(task = {}, all = LOCAL_MAINTENANCE_MANUALS) {
  const text = String(task.manual || '')
  const own = manualsForSede(task.sede, all).filter((m) => /^MAN-/i.test(m.file_name))
  if (!own.length) return []
  if (/^Todos/i.test(text)) return own
  const codes = text.match(/MAN-[A-Z]{2}-\d{2}/g) || []
  return own.filter((m) => codes.some((c) => m.file_name.toUpperCase().startsWith(c)))
}

/** Clase de documento para el ícono y la etiqueta de descarga. */
export function manualKind(manual = {}) {
  if (/^MAN-/i.test(manual.file_name)) return 'Manual'
  if (/^Indicaciones/i.test(manual.file_name)) return 'Instructivo'
  if (/PRGMAT01/i.test(manual.file_name)) return 'Programa'
  return 'Documento'
}

/** Nombre legible sin extensión. */
export function manualTitle(manual = {}) {
  return String(manual.file_name || '').replace(/\.[^.]+$/, '')
}
