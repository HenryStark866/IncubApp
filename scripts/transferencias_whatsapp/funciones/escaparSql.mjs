/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/escaparSql.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Prepara el JSON de datos para incrustarlo en SQL entre $datos$ … $datos$.
 * EN: Prepares the data JSON to embed it in SQL between $datos$ … $datos$.
 */

/**
 * @param {unknown} valor ES: datos a serializar. EN: data to serialize.
 * @returns {string} ES: JSON seguro dentro de $datos$. EN: JSON safe inside $datos$.
 */
export function escaparSql(valor) {
  // ES: Una fila por elemento para que el diff de git sea legible. EN: One row per item for a readable git diff.
  const json = Array.isArray(valor) ? `[\n${valor.map((v) => JSON.stringify(v)).join(',\n')}\n]` : JSON.stringify(valor)
  // ES: El delimitador no puede aparecer dentro del texto. EN: The delimiter cannot appear inside the text.
  if (json.includes('$datos$')) throw new Error('Los datos contienen $datos$ / data contains $datos$')
  return json
}
