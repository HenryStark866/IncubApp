/**
 * Exportación a Excel con membrete corporativo
 * IncubApp · Antioqueña de Incubación SAS (Incubant).
 * Henry Stark Desarrollador
 */
import {
  excelFooterRows,
  excelLetterheadRows,
  getCorporateIdentity,
} from './corporateBrand'

/**
 * Exporta una o más hojas a .xlsx con membrete corporativo.
 *
 * @param {string} filename - nombre base del archivo (sin fecha)
 * @param {Array<{ name: string, rows: object[] }>} sheets
 * @param {{
 *   title?: string,
 *   orgName?: string,
 *   module?: string,
 *   generatedBy?: string,
 *   nit?: string,
 *   skipLetterhead?: boolean,
 * }} [meta]
 */
export async function exportToExcel(filename, sheets, meta = {}) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const id = getCorporateIdentity(meta)
  const letterhead = meta.skipLetterhead ? [] : excelLetterheadRows({
    ...meta,
    title: meta.title || filename.replace(/[-_]/g, ' '),
  })
  const footer = meta.skipLetterhead ? [] : excelFooterRows(meta)

  for (const { name, rows } of sheets) {
    if (!rows || rows.length === 0) continue

    const headers = Object.keys(rows[0])
    const dataAoa = [
      headers,
      ...rows.map((r) => headers.map((h) => {
        const v = r[h]
        if (v == null) return ''
        if (typeof v === 'object') return JSON.stringify(v)
        return v
      })),
    ]

    // Membrete: cada fila del header corporativo se expande al ancho de columnas
    const headAoa = letterhead.map((line) => {
      const cells = Array.isArray(line) ? [...line] : [line]
      while (cells.length < Math.max(headers.length, 1)) cells.push('')
      return cells.slice(0, Math.max(headers.length, cells.length))
    })
    const footAoa = footer.map((line) => {
      const cells = Array.isArray(line) ? [...line] : [line]
      while (cells.length < Math.max(headers.length, 1)) cells.push('')
      return cells
    })

    const aoa = [...headAoa, ...dataAoa, ...footAoa]
    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Anchos
    ws['!cols'] = headers.map((h, colIdx) => {
      const samples = [
        h,
        ...rows.slice(0, 40).map((r) => String(r[h] ?? '')),
        ...headAoa.map((row) => String(row[colIdx] ?? '')),
      ]
      const maxLen = Math.max(...samples.map((s) => s.length), 8)
      return { wch: Math.min(48, maxLen + 2) }
    })

    // Fusión visual del encabezado SIG de 3 columnas (Izquierda: Empresa | Centro: SIG y Formato | Derecha: Control documental)
    if (!meta.skipLetterhead && headers.length >= 5) {
      ws['!merges'] = ws['!merges'] || []
      const lastCol = headers.length - 1
      for (let r = 0; r < Math.min(4, headAoa.length); r++) {
        ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: 1 } })
        ws['!merges'].push({ s: { r, c: 2 }, e: { r, c: 3 } })
        if (lastCol > 4) {
          ws['!merges'].push({ s: { r, c: 4 }, e: { r, c: lastCol } })
        }
      }
    }


    XLSX.utils.book_append_sheet(wb, ws, String(name).slice(0, 31))
  }

  if (wb.SheetNames.length === 0) return { error: 'No hay datos para exportar' }

  // Propiedades del libro (aparece en Excel → Info)
  wb.Props = {
    Title: meta.title || filename,
    Subject: `${id.product} · ${id.legalName}`,
    Author: meta.generatedBy || id.product,
    Company: id.legalName,
    Comments: `${id.line1}. ${id.confidentiality}`,
    CreatedDate: new Date(),
  }

  const stamp = new Date().toLocaleDateString('sv-SE')
  const safe = String(filename || 'reporte').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/gi, '_')
  XLSX.writeFile(wb, `${safe}-${stamp}.xlsx`)
  return { error: null }
}
