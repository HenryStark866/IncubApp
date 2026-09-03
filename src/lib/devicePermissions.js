/**
 * Permisos de dispositivo para fluidez operativa (cámara, ubicación, notificaciones…).
 * Web: se piden en contexto de usuario (gesture o arranque de sesión).
 */

import { ensureNotifyPermission } from './browserNotify'

const LS_KEY = 'incubapp_device_perms_v1'

function readState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeState(partial) {
  try {
    const next = { ...readState(), ...partial, at: new Date().toISOString() }
    localStorage.setItem(LS_KEY, JSON.stringify(next))
    return next
  } catch {
    return partial
  }
}

export function getDevicePermissionState() {
  return readState()
}

/** Geolocalización (rondas, asistencia, misionales, calibración GPS) */
export async function requestGeolocationPermission() {
  if (!navigator.geolocation) {
    writeState({ geo: 'unsupported' })
    return { ok: false, status: 'unsupported' }
  }
  try {
    const status = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (err) => resolve(err?.code === 1 ? 'denied' : 'error'),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      )
    })
    writeState({ geo: status })
    return { ok: status === 'granted', status }
  } catch {
    writeState({ geo: 'error' })
    return { ok: false, status: 'error' }
  }
}

/**
 * Cámara (evidencia foto, selfie asistencia, misionales).
 * getUserMedia pide permiso; se detiene el stream al instante.
 */
export async function requestCameraPermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    writeState({ camera: 'unsupported' })
    return { ok: false, status: 'unsupported' }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    stream.getTracks().forEach((t) => t.stop())
    writeState({ camera: 'granted' })
    return { ok: true, status: 'granted' }
  } catch (e) {
    const status = /NotAllowed|Permission/i.test(e?.name || e?.message || '')
      ? 'denied'
      : 'error'
    writeState({ camera: status })
    return { ok: false, status }
  }
}

/** Notificaciones del navegador (órdenes de cargue, alertas) */
export async function requestNotificationPermission() {
  const p = await ensureNotifyPermission()
  writeState({ notifications: p })
  return { ok: p === 'granted', status: p }
}

/** Micrófono — útil para registro de voz e incidencias de voz corporativas */
export async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    writeState({ microphone: 'unsupported' })
    return { ok: false, status: 'unsupported' }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach((t) => t.stop())
    writeState({ microphone: 'granted' })
    return { ok: true, status: 'granted' }
  } catch (e) {
    const status = /NotAllowed|Permission/i.test(e?.name || e?.message || '') ? 'denied' : 'error'
    writeState({ microphone: status })
    return { ok: false, status }
  }
}

/** Estado de batería del dispositivo (informativo, sin permiso explícito) */
export async function getBatteryStatus() {
  try {
    if (!('getBattery' in navigator)) return { ok: false, status: 'unsupported' }
    const battery = await navigator.getBattery()
    return {
      ok: true,
      level: Math.round(battery.level * 100),
      charging: battery.charging,
      chargingTime: battery.chargingTime,
      dischargingTime: battery.dischargingTime,
    }
  } catch {
    return { ok: false, status: 'error' }
  }
}

/** Estado de conectividad (informativo, sin permiso) */
export function getNetworkStatus() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  return {
    online: navigator.onLine,
    type: conn?.effectiveType || conn?.type || null,
    downlink: conn?.downlink || null,
    rtt: conn?.rtt || null,
    saveData: conn?.saveData || false,
  }
}

/**
 * Contactos (Contacts Picker API — Chromium Android; no disponible en todos los navegadores).
 * Si no existe, se marca unsupported sin fallar.
 */
export async function requestContactsCapability() {
  try {
    if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      // Solo comprobamos soporte; el picker real se usa al elegir contacto
      writeState({ contacts: 'supported' })
      return { ok: true, status: 'supported' }
    }
    writeState({ contacts: 'unsupported' })
    return { ok: false, status: 'unsupported' }
  } catch {
    writeState({ contacts: 'unsupported' })
    return { ok: false, status: 'unsupported' }
  }
}

/**
 * Solicita en secuencia los permisos operativos.
 * No bloquea la UI si el usuario deniega.
 */
export async function requestOperationalDevicePermissions({
  camera = true,
  geo = true,
  notifications = true,
  contacts = true,
  microphone = false,
} = {}) {
  const result = {}
  if (geo) result.geo = await requestGeolocationPermission()
  if (camera) result.camera = await requestCameraPermission()
  if (notifications) result.notifications = await requestNotificationPermission()
  if (contacts) result.contacts = await requestContactsCapability()
  if (microphone) result.microphone = await requestMicrophonePermission()
  writeState({ bundle: 'done', results: Object.fromEntries(
    Object.entries(result).map(([k, v]) => [k, v.status])
  ) })
  return result
}

/** ¿Ya pedimos el paquete en este dispositivo? */
export function devicePermissionsAlreadyAsked() {
  const s = readState()
  return s.bundle === 'done' || s.asked === true
}

export function markDevicePermissionsAsked() {
  writeState({ asked: true })
}
