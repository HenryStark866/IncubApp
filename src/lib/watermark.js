/**
 * Marca de agua para selfies de asistencia (ingreso/salida).
 * Dibuja nombre, fecha, hora, lugar y GPS sobre la foto.
 * Henry Stark Desarrollador
 */

import { compressImage } from './image'

/**
 * @param {File|Blob} file - selfie
 * @param {{
 *   userName: string,
 *   userId?: string,
 *   punchType: 'in'|'out',
 *   lat?: number|null,
 *   lng?: number|null,
 *   accuracy?: number|null,
 *   placeLabel?: string,
 *   at?: Date,
 * }} meta
 * @returns {Promise<File>}
 */
export async function applyAttendanceWatermark(file, meta = {}) {
  const base = await compressImage(file, 1280, 0.82)
  try {
    const img = await loadDrawable(base)
    const w = img.width || img.naturalWidth
    const h = img.height || img.naturalHeight
    if (!w || !h) return base instanceof File ? base : fileToFile(base, file)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return base instanceof File ? base : fileToFile(base, file)

    ctx.drawImage(img, 0, 0, w, h)
    if (img.close) img.close()

    const at = meta.at || new Date()
    const dateStr = at.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    const timeStr = at.toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const typeLabel = meta.punchType === 'out' ? 'SALIDA' : 'INGRESO'
    const name = (meta.userName || 'Operario').trim().slice(0, 48)
    const place =
      meta.placeLabel ||
      (meta.lat != null && meta.lng != null
        ? `${Number(meta.lat).toFixed(5)}, ${Number(meta.lng).toFixed(5)}`
        : 'Ubicación no disponible')
    const acc =
      meta.accuracy != null && Number.isFinite(Number(meta.accuracy))
        ? `±${Math.round(meta.accuracy)} m`
        : ''

    const lines = [
      `CDH Maker · ${typeLabel}`,
      name,
      `${dateStr} · ${timeStr}`,
      `Lugar: ${place}${acc ? ` ${acc}` : ''}`,
    ]
    if (meta.userId) lines.push(`ID: ${String(meta.userId).slice(0, 8)}…`)

    // Barra inferior semi-opaca
    const pad = Math.max(10, Math.round(w * 0.02))
    const lineH = Math.max(14, Math.round(h * 0.028))
    const fontSize = Math.max(12, Math.round(w * 0.028))
    const barH = pad * 2 + lines.length * lineH + pad
    const barY = h - barH

    ctx.fillStyle = 'rgba(8, 12, 22, 0.72)'
    ctx.fillRect(0, barY, w, barH)

    // Franja de acento
    ctx.fillStyle = meta.punchType === 'out' ? 'rgba(245, 144, 15, 0.95)' : 'rgba(53, 214, 232, 0.95)'
    ctx.fillRect(0, barY, w, 3)

    ctx.font = `600 ${fontSize}px "IBM Plex Sans", system-ui, sans-serif`
    ctx.fillStyle = '#f4f7ff'
    ctx.textBaseline = 'top'
    lines.forEach((line, i) => {
      ctx.fillText(line, pad, barY + pad + i * lineH, w - pad * 2)
    })

    // Sello esquina superior
    ctx.font = `700 ${Math.max(11, Math.round(fontSize * 0.85))}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(8, 12, 22, 0.55)'
    const stamp = 'SELFIE VERIFICADA'
    const tw = ctx.measureText(stamp).width
    ctx.fillRect(pad - 4, pad - 4, tw + 12, fontSize + 10)
    ctx.fillStyle = '#9ef0c8'
    ctx.fillText(stamp, pad, pad)

    const blob = await canvasToBlob(canvas, 0.86)
    if (!blob) return base instanceof File ? base : fileToFile(base, file)
    const fname = `selfie_${meta.punchType || 'in'}_${Date.now()}.jpg`
    return new File([blob], fname, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return base instanceof File ? base : fileToFile(base, file)
  }
}

async function loadDrawable(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      return await createImageBitmap(file)
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    } else {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        const bin = atob(dataUrl.split(',')[1])
        const arr = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
        resolve(new Blob([arr], { type: 'image/jpeg' }))
      } catch {
        resolve(null)
      }
    }
  })
}

function fileToFile(blob, original) {
  return new File([blob], original?.name || 'selfie.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
