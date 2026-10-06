/**
 * =============================================================================
 * ARCHIVO / FILE: src/lib/origenTransferencia.js
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 * FECHA / DATE:   06-10-2026
 *
 * ES: Reconoce las transferencias que no se registraron en la app sino que se
 *     importaron (p. ej. del grupo de WhatsApp «Transferencias», migración
 *     20261006_transferencias_whatsapp.sql) y arma el texto que se muestra.
 * EN: Recognizes transfers that were not recorded in the app but imported (e.g. from
 *     the «Transferencias» WhatsApp group, migration 20261006_transferencias_whatsapp.sql)
 *     and builds the text shown for them.
 * =============================================================================
 */

/**
 * ES: ¿La transferencia vino de una importación? EN: Did the transfer come from an import?
 * @param {{ origen?: object|null }} transferencia
 * @returns {boolean}
 */
export function esTransferenciaImportada(transferencia) {
  // ES: Solo las importadas traen la columna origen con su clave. EN: Only imports carry origen with a key.
  return Boolean(transferencia?.origen?.clave)
}

/**
 * ES: Texto corto del origen («💬 WhatsApp · Germán (planta)»), o null si se registró en la app.
 * EN: Short origin text ("💬 WhatsApp · Germán (planta)"), or null if recorded in the app.
 * @param {{ origen?: object|null }} transferencia
 * @returns {string|null}
 */
export function etiquetaOrigenTransferencia(transferencia) {
  // ES: Registradas en la app no llevan etiqueta. EN: App-recorded ones get no label.
  if (!esTransferenciaImportada(transferencia)) return null
  // ES: Quién la reportó, si se sabe. EN: Who reported it, if known.
  const por = transferencia.origen.reportado_por
  // ES: Fuente legible. EN: Readable source.
  const fuente = String(transferencia.origen.fuente || '').startsWith('whatsapp') ? '💬 WhatsApp' : '📥 Importada'
  return por ? `${fuente} · ${por}` : fuente
}

/**
 * ES: Ruta de foto utilizable (las importadas no tienen foto real).
 * EN: Usable photo path (imported ones have no real photo).
 * @param {{ photo_path?: string|null, origen?: object|null }} transferencia
 * @returns {string|null}
 */
export function fotoDeTransferencia(transferencia) {
  // ES: «importado/…» es solo una marca para columnas NOT NULL. EN: "importado/…" is only a NOT NULL marker.
  if (esTransferenciaImportada(transferencia) || String(transferencia?.photo_path || '').startsWith('importado/')) return null
  return transferencia?.photo_path || null
}
