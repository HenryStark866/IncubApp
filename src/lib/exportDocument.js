/**
 * Exportación corporativa: Excel, Word (.doc HTML) e impresión/PDF con membrete.
 * IncubApp · Antioqueña de Incubación SAS (Incubant).
 * Henry Stark Desarrollador
 */
import { exportToExcel } from './exportExcel'
import {
  escapeHtml,
  footerHtml,
  getCorporateIdentity,
  letterheadCss,
  letterheadHtml,
} from './corporateBrand'

/**
 * @typedef {{ title?: string, orgName?: string, module?: string, generatedBy?: string, subtitle?: string, nit?: string }} DocMeta
 */

/**
 * Excel con membrete (atajo).
 * @param {string} filename
 * @param {Array<{ name: string, rows: object[] }>} sheets
 * @param {DocMeta} [meta]
 */
export async function exportCorporateExcel(filename, sheets, meta = {}) {
  return exportToExcel(filename, sheets, meta)
}

/**
 * Documento Word compatible (.doc vía HTML) con membrete y logo.
 * Se abre en Microsoft Word / LibreOffice con formato corporativo.
 *
 * @param {string} filename
 * @param {Array<{ name?: string, rows: object[] }>|object[]} sheetsOrRows
 * @param {DocMeta} [meta]
 */
export function exportCorporateWord(filename, sheetsOrRows, meta = {}) {
  const sheets = normalizeSheets(sheetsOrRows)
  if (!sheets.length) return { error: 'No hay datos para exportar' }

  const id = getCorporateIdentity(meta)
  const title = meta.title || filename.replace(/[-_]/g, ' ')
  const bodyTables = sheets
    .map((sh) => {
      if (!sh.rows?.length) return ''
      const headers = Object.keys(sh.rows[0])
      const thead = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
      const tbody = sh.rows
        .map(
          (r) =>
            `<tr>${headers.map((h) => `<td>${escapeHtml(formatCell(r[h]))}</td>`).join('')}</tr>`
        )
        .join('')
      const caption = sh.name
        ? `<p style="font-weight:700;margin:14px 0 6px;color:#1a2332">${escapeHtml(sh.name)}</p>`
        : ''
      return `${caption}<table class="corp-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — ${escapeHtml(id.legalName)}</title>
  <!--[if gte mso 9]><xml>
    <w:WordDocument><w:View>Print</w:View></w:WordDocument>
  </xml><![endif]-->
  <style>${letterheadCss()}</style>
</head>
<body>
  ${letterheadHtml({ ...meta, title })}
  ${bodyTables}
  ${footerHtml(meta)}
</body>
</html>`

  const stamp = new Date().toLocaleDateString('sv-SE')
  const safe = String(filename || 'documento').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/gi, '_')
  downloadBlob(
    new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }),
    `${safe}-${stamp}.doc`
  )
  return { error: null }
}

/**
 * Abre vista de impresión con membrete (el usuario elige «Guardar como PDF»).
 * @param {string} filename
 * @param {Array<{ name?: string, rows: object[] }>|object[]} sheetsOrRows
 * @param {DocMeta} [meta]
 */
export function exportCorporatePdfPrint(filename, sheetsOrRows, meta = {}) {
  const sheets = normalizeSheets(sheetsOrRows)
  if (!sheets.length) return { error: 'No hay datos para exportar' }

  const id = getCorporateIdentity(meta)
  const title = meta.title || filename.replace(/[-_]/g, ' ')
  const bodyTables = sheets
    .map((sh) => {
      if (!sh.rows?.length) return ''
      const headers = Object.keys(sh.rows[0])
      const thead = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
      const tbody = sh.rows
        .map(
          (r) =>
            `<tr>${headers.map((h) => `<td>${escapeHtml(formatCell(r[h]))}</td>`).join('')}</tr>`
        )
        .join('')
      const caption = sh.name
        ? `<p style="font-weight:700;margin:14px 0 6px">${escapeHtml(sh.name)}</p>`
        : ''
      return `${caption}<table class="corp-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — ${escapeHtml(id.legalName)}</title>
  <style>${letterheadCss()}
    .print-bar {
      position: sticky; top: 0; z-index: 10;
      background: #1a2332; color: #fff;
      padding: 10px 14px; display: flex; gap: 10px; align-items: center;
      font-family: Arial, sans-serif; font-size: 13px;
    }
    .print-bar button {
      background: #e0740a; color: #fff; border: 0; border-radius: 8px;
      padding: 8px 14px; font-weight: 600; cursor: pointer;
    }
    .print-bar span { opacity: 0.9; flex: 1; }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <span>${escapeHtml(id.legalName)} · ${escapeHtml(id.product)} — use «Guardar como PDF» en el diálogo de impresión</span>
    <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
    <button type="button" onclick="window.close()" style="background:#6d7688">Cerrar</button>
  </div>
  ${letterheadHtml({ ...meta, title })}
  ${bodyTables}
  ${footerHtml(meta)}
  <script>setTimeout(function(){ try { window.focus(); } catch(e){} }, 300);</script>
</body>
</html>`

  const w = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768')
  if (!w) {
    return {
      error:
        'El navegador bloqueó la ventana. Permite ventanas emergentes para generar PDF.',
    }
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  return { error: null }
}

/**
 * Exporta en el formato pedido con el mismo membrete.
 * @param {'excel'|'word'|'pdf'} format
 * @param {string} filename
 * @param {Array|{rows:object[]}} sheetsOrRows
 * @param {DocMeta} [meta]
 */
export async function exportCorporate(format, filename, sheetsOrRows, meta = {}) {
  const sheets = normalizeSheets(sheetsOrRows)
  if (format === 'excel') return exportCorporateExcel(filename, sheets, meta)
  if (format === 'word') return exportCorporateWord(filename, sheets, meta)
  if (format === 'pdf') return exportCorporatePdfPrint(filename, sheets, meta)
  return { error: 'Formato no soportado' }
}

function normalizeSheets(sheetsOrRows) {
  if (!sheetsOrRows) return []
  if (Array.isArray(sheetsOrRows) && sheetsOrRows[0]?.rows) return sheetsOrRows
  if (Array.isArray(sheetsOrRows)) return [{ name: 'Datos', rows: sheetsOrRows }]
  if (sheetsOrRows.rows) return [sheetsOrRows]
  return []
}

function formatCell(v) {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
