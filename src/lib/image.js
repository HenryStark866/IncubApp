/**
 * =============================================================================
 * ARCHIVO: src/lib/image.js
 * PROPÓSITO: Compresión de imágenes en el cliente antes de subir a Storage.
 * CÓMO FUNCIONA: Funciones o constantes importadas por hooks/componentes; sin UI propia. Transforman datos, validan permisos o hablan con APIs del navegador/Supabase.
 * Cada bloque relevante de este archivo está orientado a la operación multi-módulo
 * de incubación / granja / gerencia en IncubApp.
 * Documentado y mantenido por: Henry Stark Desarrollador
 * =============================================================================
 */

/**
 * Comprime una imagen en el cliente antes de subirla.
 * Reduce la imagen para que su lado mayor no supere `maxDim` (px) y la reencoda
 * como JPEG con la calidad indicada. Convierte fotos de cámara de 2–5 MB a
 * ~150–300 KB, lo que reduce drásticamente el uso de Storage y de ancho de banda.
 *
 * Robusto en móviles: usa createImageBitmap (decodifica imágenes grandes de forma
 * fiable y respeta la orientación EXIF) con respaldo a FileReader + Image para
 * navegadores viejos. Ante cualquier fallo devuelve el archivo original para no
 * bloquear la subida.
 */
/** Export «compressImage»: API pública de este módulo. Henry Stark Desarrollador */
export async function compressImage(file, maxDim = 1280, quality = 0.72) {
  if (!file || !file.type?.startsWith('image/')) return file
  try {
    const source = await loadImage(file)
    const srcW = source.width || source.naturalWidth
    const srcH = source.height || source.naturalHeight
    if (!srcW || !srcH) return file

    const { width, height } = fitWithin(srcW, srcH, maxDim)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(source, 0, 0, width, height)
    if (source.close) source.close() // liberar el ImageBitmap

    const blob = await canvasToJpeg(canvas, quality)
    if (!blob) return file
    // Si el "comprimido" quedó más grande que el original, conserva el original
    if (blob.size >= file.size) return file

    const base = (file.name || 'photo').replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file // nunca romper la subida por un fallo de compresión
  }
}

// Decodifica el archivo a algo dibujable en canvas (ImageBitmap o HTMLImageElement).
async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      try {
        return await createImageBitmap(file) // sin opción de orientación
      } catch {
        /* cae al respaldo con FileReader */
      }
    }
  }
  return await new Promise((resolve, reject) => {
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

// Ajusta (w,h) para que el lado mayor no supere maxDim, conservando proporción.
function fitWithin(w, h, maxDim) {
  const longest = Math.max(w, h)
  if (longest <= maxDim) return { width: w, height: h }
  const scale = maxDim / longest
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

function canvasToJpeg(canvas, quality) {
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
