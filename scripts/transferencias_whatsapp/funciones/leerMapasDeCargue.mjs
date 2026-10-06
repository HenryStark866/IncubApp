/**
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/funciones/leerMapasDeCargue.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Lee la exportación real de mapas de cargue (load_maps) de septiembre que está en
 *     scripts/september_load_maps_raw.json (UTF-16, exportada desde la base) y deja por
 *     mapa: incubadora, inicio de ciclo, hora de cargue, lotes y carros.
 * EN: Reads the real September load-map export (load_maps) stored in
 *     scripts/september_load_maps_raw.json (UTF-16, exported from the database) and keeps
 *     per map: setter, cycle start, load time, lots and carts.
 */
import { readFileSync } from 'node:fs'

/**
 * @param {string} ruta ES: ruta del archivo exportado. EN: path of the exported file.
 * @returns {Array<object>}
 */
export function leerMapasDeCargue(ruta) {
  // ES: Se lee como bytes para detectar la codificación. EN: Read as bytes to detect encoding.
  const bytes = readFileSync(ruta)
  // ES: BOM FF FE = UTF-16 LE (exportación de PowerShell). EN: BOM FF FE = UTF-16 LE (PowerShell export).
  const texto = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString('utf16le').slice(1) : bytes.toString('utf8')
  // ES: Se interpreta el JSON. EN: Parse the JSON.
  const filas = JSON.parse(texto)
  // ES: Se resume cada mapa. EN: Summarize each map.
  return filas.map((f) => {
    const p = f.payload ?? {}
    // ES: Código «INC-22» sacado del nombre «Inc 22 (INC-22)». EN: Code "INC-22" from the name.
    const codigo = /\((INC-\d+)\)/.exec(f.machine_name ?? p.machineName ?? '')?.[1] ?? null
    // ES: Carros con número y lotes. EN: Carts with number and lots.
    const carros = (p.slots ?? []).filter((s) => s?.entry).map((s) => ({
      numero: Number(s.entry.cartNumber ?? s.cartNo),
      lotes: (s.entry.lots?.length ? s.entry.lots : [s.entry]).map((l) => String(l.lot ?? '').trim()).filter(Boolean),
    })).sort((a, b) => a.numero - b.numero)
    // ES: Inicio de ciclo leído en pantalla si existe (más fiel), si no el del mapa.
    // EN: On-screen cycle start if present (more faithful), otherwise the map's.
    const inicioCiclo = p.regularizado?.inicioCicloLeido ?? p.cycleStartAt ?? null
    return {
      id: f.id,
      codigo,
      cargadoEn: p.loadedAt ?? null,
      inicioCiclo,
      // ES: Lotes reales (sin «TRATADO», que es huevo tratado, no un lote de aves).
      // EN: Real lots (without "TRATADO", treated eggs, not a flock lot).
      lotes: [...new Set(carros.flatMap((c) => c.lotes))].filter((l) => /^\d+$/.test(l)).sort(),
      carros,
      regularizado: p.regularizado ?? null,
      // ES: Mapas marcados como versión previa/descartada no son un cargue físico.
      // EN: Maps flagged as previous/discarded versions are not a physical load.
      descartado: /descartada|Version previa/i.test(p.regularizado?.motivo ?? ''),
    }
  })
}
