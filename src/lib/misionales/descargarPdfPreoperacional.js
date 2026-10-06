/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/misionales/descargarPdfPreoperacional.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Genera y descarga el PDF de una inspección. La librería de PDF se carga
 *     solo al descargar, para no hacer más pesada la app.
 *     06-10-2026: las inspecciones de la ventana original (formato «misional-v2»)
 *     salen con el PDF FO-SST-063 del original y sus fotos de evidencia; las
 *     anteriores siguen con el FOSST22. Consolidado de 15 con su propio PDF.
 * EN: Generates and downloads an inspection's PDF. The PDF library loads only on
 *     download, so the app stays light.
 * =============================================================================
 */
import { esFormatoMisional } from './registro'

/** ES: Fecha local de Bogotá AAAA-MM-DD. EN: Bogota local date. */
function diaBogota(valor) {
  return new Date(valor || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
}

/** ES: Placa sin caracteres raros. EN: Plate without odd characters. */
function placaArchivo(row) {
  return String(row?.plate || 'SIN-PLACA').replace(/[^A-Za-z0-9-]/g, '')
}

/** ES: Nombre del archivo: FOSST22_ABC123_2026-10-06.pdf / FO-SST-063_… EN: File name. */
export function nombreArchivoPreoperacional(row) {
  const codigo = esFormatoMisional(row) ? 'FO-SST-063' : 'FOSST22'
  return `${codigo}_${placaArchivo(row)}_${diaBogota(row.inspected_at)}.pdf`
}

/** Foto (URL firmada) → dataURL para meterla en el PDF */
async function aDataUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  return await new Promise((ok, mal) => {
    const r = new FileReader()
    r.onload = () => ok(r.result)
    r.onerror = mal
    r.readAsDataURL(blob)
  })
}

/**
 * @param {object} row ES: inspección. EN: inspection.
 * @param {{ orgName?: string, urlEvidencia?: (path: string) => Promise<string|null>, evidenciasImgs?: Record<string,string> }} [opciones]
 * @returns {Promise<{ error: string|null }>}
 */
export async function descargarPdfPreoperacional(row, opciones = {}) {
  try {
    let doc
    if (esFormatoMisional(row)) {
      const { generarPdfMisional } = await import('./generarPdfMisional')
      // Fotos de evidencia: si alguna no baja, el PDF sale igual con la marca «[Evidencia]».
      const evidenciasImgs = { ...(opciones.evidenciasImgs || {}) }
      const rutas = row.formato?.evidencias || {}
      if (opciones.urlEvidencia && !opciones.evidenciasImgs) {
        await Promise.all(
          Object.entries(rutas).map(async ([num, path]) => {
            try {
              const url = await opciones.urlEvidencia(path)
              if (url) evidenciasImgs[num] = await aDataUrl(url)
            } catch {
              /* sin esta foto */
            }
          })
        )
      }
      doc = generarPdfMisional(row, { evidenciasImgs })
    } else {
      // ES: Carga diferida del generador. EN: Lazy-load the generator.
      const { generarPdfPreoperacional } = await import('./generarPdfPreoperacional')
      doc = generarPdfPreoperacional(row, opciones)
    }
    // ES: save() dispara la descarga automática en el navegador. EN: save() triggers the download.
    doc.save(nombreArchivoPreoperacional(row))
    return { error: null }
  } catch (e) {
    return { error: `No se pudo generar el PDF: ${e?.message || e}` }
  }
}

/** PDF consolidado del ciclo de 15 (como el «reporte15» del original). */
export async function descargarPdfConsolidado(filas, reporte = {}) {
  try {
    if (!filas?.length) return { error: 'El consolidado no tiene inspecciones' }
    const { generarPdfConsolidado } = await import('./generarPdfMisional')
    const doc = generarPdfConsolidado(filas)
    const nombre = String(reporte.driver_name || filas[0].driver_name || 'conductor').replace(/[^A-Za-z0-9]+/g, '_')
    doc.save(`Consolidado15_${nombre}_${diaBogota(reporte.created_at)}.pdf`)
    return { error: null }
  } catch (e) {
    return { error: `No se pudo generar el PDF: ${e?.message || e}` }
  }
}
