/**
 * =============================================================================
 * ARCHIVO / FILE: scripts/transferencias_whatsapp/principal.mjs
 * AUTOR / AUTHOR: Henry Taborda — Ing. en desarrollo de software
 *
 * ES: Punto de entrada. Normaliza las transferencias transcritas del WhatsApp, las cruza
 *     con los mapas de cargue reales, ajusta horas imposibles y genera:
 *       - supabase/migrations/20261006_transferencias_whatsapp.sql (lo aplica el servidor)
 *       - docs/Cruce_Transferencias_WhatsApp.md (reporte para soporte)
 * EN: Entry point. Normalizes the transcribed WhatsApp transfers, cross-checks them with
 *     the real load maps, fixes impossible times and generates:
 *       - supabase/migrations/20261006_transferencias_whatsapp.sql (applied by the server)
 *       - docs/Cruce_Transferencias_WhatsApp.md (support report)
 *
 * USO / USAGE:  node scripts/transferencias_whatsapp/principal.mjs [--corte=2026-10-06T12:00:00-05:00]
 * =============================================================================
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transferenciasReportadas, transferenciasFaltantes } from './datos/transferencias_reportadas.mjs'
import { normalizarTransferencia } from './funciones/normalizarTransferencia.mjs'
import { leerMapasDeCargue } from './funciones/leerMapasDeCargue.mjs'
import { cruzarConMapas } from './funciones/cruzarConMapas.mjs'
import { ajustarHoraPorRecargue } from './funciones/ajustarHoraPorRecargue.mjs'
import { notasDelCruce } from './funciones/notasDelCruce.mjs'
import { validarRitmoIncubadoras } from './funciones/validarRitmoIncubadoras.mjs'
import { mapasSinTransferencia } from './funciones/mapasSinTransferencia.mjs'
import { generarMigracionSql } from './funciones/generarMigracionSql.mjs'
import { generarReporteCruce } from './funciones/generarReporteCruce.mjs'

// ES: Rutas del repositorio. EN: Repository paths.
const raiz = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url))
// ES: Fecha de corte (por defecto, ahora). EN: Cut-off date (defaults to now).
const corte = new Date(process.argv.find((a) => a.startsWith('--corte='))?.slice(8) ?? Date.now())
// ES: Fecha del documento AAAA-MM-DD en Bogotá. EN: Document date YYYY-MM-DD in Bogota.
const fecha = corte.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// ES: 1) Normalizar lo transcrito. EN: 1) Normalize the transcription.
const normalizadas = transferenciasReportadas.map(normalizarTransferencia)
// ES: Claves repetidas = la misma transferencia transcrita dos veces. EN: Repeated keys = duplicated transcription.
const repetidas = normalizadas.map((t) => t.clave).filter((c, i, a) => a.indexOf(c) !== i)
if (repetidas.length) throw new Error(`Claves repetidas / duplicated keys: ${repetidas.join(', ')}`)

// ES: 2) Mapas de cargue reales exportados de la base. EN: 2) Real load maps exported from the DB.
const mapas = leerMapasDeCargue(raiz('scripts/september_load_maps_raw.json'))

// ES: 3) Primer cruce para detectar recargues y ajustar horas. EN: 3) First pass to detect reloads and fix times.
const primerCruce = new Map(cruzarConMapas(normalizadas, mapas).map((c) => [c.clave, c]))
const ajustadas = normalizadas.map((t) => ajustarHoraPorRecargue(t, primerCruce.get(t.clave)))

// ES: 4) Cruce definitivo con las horas ya ajustadas. EN: 4) Final cross-check with fixed times.
const cruces = cruzarConMapas(ajustadas, mapas)
const porClave = new Map(cruces.map((c) => [c.clave, c]))

// ES: 5) Filas para la migración: datos + notas + cruce. EN: 5) Migration rows: data + notes + cross-check.
const filas = ajustadas
  .sort((a, b) => Date.parse(a.transferidoEn) - Date.parse(b.transferidoEn))
  .map((t) => {
    const c = porClave.get(t.clave)
    // ES: El recargue se toma del primer cruce (el segundo ya no lo ve). EN: Reload comes from the first pass.
    const notasCruce = notasDelCruce({ ...c, recargue: primerCruce.get(t.clave)?.recargue ?? null }, t)
    return {
      clave: t.clave,
      incubadora: t.incubadora,
      numeroIncubadora: Number(t.incubadora.slice(4)),
      salon: t.salon,
      reportadoEn: t.reportadoEn,
      transferidoEn: t.transferidoEn,
      horaEstimada: t.horaEstimada,
      horaAjustadaDesde: t.horaAjustadaDesde ?? null,
      reportadoPor: t.reportadoPor,
      lotes: t.lotes,
      loteInferido: t.loteInferido,
      nacedoras: t.nacedoras.map((n) => ({
        orden: n.orden,
        codigo: n.codigo,
        numero: Number(n.codigo.slice(4)),
        lotes: n.lotes.map(({ lot, trays, carros }) => ({ lot, trays, carros })),
        carros: n.carros,
        bandejas: n.carros == null ? null : n.lotes.reduce((s, x) => s + (x.trays ?? 0), 0),
      })),
      correccion: t.correccion,
      cruceMapa: c.mapa ? { id: c.mapa.id, estado: c.estado, lotes: c.mapa.lotes, dias: c.mapa.dias, candidatos: c.candidatos.map((x) => x.incubadora) } : { estado: c.estado },
      notasCruce,
      texto: t.texto,
    }
  })

// ES: 6) Hallazgos generales. EN: 6) General findings.
const ritmo = validarRitmoIncubadoras(ajustadas)
const pendientes = mapasSinTransferencia(mapas, ajustadas, corte)

// ES: 7) Archivos de salida. EN: 7) Output files.
writeFileSync(raiz('supabase/migrations/20261006_transferencias_whatsapp.sql'), generarMigracionSql(filas, fecha))
writeFileSync(raiz('docs/Cruce_Transferencias_WhatsApp.md'), generarReporteCruce({ filas, cruces, ritmo, pendientes, faltantes: transferenciasFaltantes, fecha }))

// ES: Resumen en consola. EN: Console summary.
console.log(`Transferencias: ${filas.length} · ajustadas por recargue: ${filas.filter((f) => f.horaAjustadaDesde).length} · corregidas: ${filas.filter((f) => f.correccion).length}`)
console.log(`Cruce: ${JSON.stringify(cruces.reduce((a, c) => ({ ...a, [c.estado]: (a[c.estado] ?? 0) + 1 }), {}))}`)
console.log(`Ritmo: ${ritmo.length} hallazgos · cargues sin transferencia: ${pendientes.length}`)
