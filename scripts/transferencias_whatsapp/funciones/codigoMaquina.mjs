/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/codigoMaquina.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Arma el código de máquina como está en la tabla machines («INC-08», «NAC-11»).
 * EN: Builds the machine code as stored in the machines table ("INC-08", "NAC-11").
 */

/**
 * @param {'INC'|'NAC'} prefijo ES: INC = incubadora, NAC = nacedora. EN: INC = setter, NAC = hatcher.
 * @param {number} numero ES: número de la máquina. EN: machine number.
 * @returns {string}
 */
export function codigoMaquina(prefijo, numero) {
  // ES: Dos dígitos con cero a la izquierda. EN: Two digits, zero-padded.
  return `${prefijo}-${String(numero).padStart(2, '0')}`
}
