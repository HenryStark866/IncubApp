/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/misionales/descargarPdfPreoperacional.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Genera y descarga el PDF FOSST22 de una inspección. La librería de PDF se
 *     carga solo al descargar, para no hacer más pesada la app.
 * EN: Generates and downloads an inspection's FOSST22 PDF. The PDF library loads
 *     only on download, so the app stays light.
 * =============================================================================
 */

/** ES: Nombre del archivo: FOSST22_ABC123_2026-10-06.pdf. EN: File name. */
export function nombreArchivoPreoperacional(row) {
  // ES: Fecha local de Bogotá en formato AAAA-MM-DD. EN: Bogota local date YYYY-MM-DD.
  const fecha = new Date(row.inspected_at || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
  // ES: Placa sin caracteres raros. EN: Plate without odd characters.
  const placa = String(row.plate || 'SIN-PLACA').replace(/[^A-Za-z0-9-]/g, '')
  return `FOSST22_${placa}_${fecha}.pdf`
}

/**
 * @param {object} row ES: inspección. EN: inspection.
 * @param {{ orgName?: string }} [opciones]
 * @returns {Promise<{ error: string|null }>}
 */
export async function descargarPdfPreoperacional(row, opciones = {}) {
  try {
    // ES: Carga diferida del generador. EN: Lazy-load the generator.
    const { generarPdfPreoperacional } = await import('./generarPdfPreoperacional')
    const doc = generarPdfPreoperacional(row, opciones)
    // ES: save() dispara la descarga automática en el navegador. EN: save() triggers the download.
    doc.save(nombreArchivoPreoperacional(row))
    return { error: null }
  } catch (e) {
    return { error: `No se pudo generar el PDF: ${e?.message || e}` }
  }
}
