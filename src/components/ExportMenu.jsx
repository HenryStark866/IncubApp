/**
 * Menú de exportación corporativa (Excel / Word / PDF) con membrete.
 * Henry Stark Desarrollador
 */
import { useState } from 'react'
import { exportCorporate } from '../lib/exportDocument'

/**
 * @param {{
 *   filename: string,
 *   sheets: Array<{ name?: string, rows: object[] }>|object[],
 *   meta?: { title?: string, orgName?: string, module?: string, generatedBy?: string },
 *   label?: string,
 *   className?: string,
 *   disabled?: boolean,
 * }} props
 */
export default function ExportMenu({
  filename,
  sheets,
  meta = {},
  label = 'Exportar',
  className = '',
  disabled = false,
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const run = async (format) => {
    setBusy(true)
    setMsg(null)
    try {
      const { error } = await exportCorporate(format, filename, sheets, meta)
      if (error) setMsg({ kind: 'error', text: error })
      else if (format === 'pdf') {
        setMsg({
          kind: 'ok',
          text: 'Ventana de impresión abierta · elija «Guardar como PDF».',
        })
      } else {
        setMsg({ kind: 'ok', text: 'Documento generado con membrete corporativo.' })
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e?.message || String(e) })
    }
    setBusy(false)
  }

  const empty =
    !sheets ||
    (Array.isArray(sheets) &&
      !sheets.length) ||
    (Array.isArray(sheets) &&
      sheets[0]?.rows &&
      sheets.every((s) => !s.rows?.length))

  return (
    <div className={`export-menu ${className}`.trim()}>
      <div className="actions row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="primary small"
          disabled={disabled || busy || empty}
          onClick={() => run('excel')}
          title="Excel con membrete Antioqueña de Incubación / IncubApp"
        >
          {busy ? '…' : `${label} Excel`}
        </button>
        <button
          type="button"
          className="ghost small"
          disabled={disabled || busy || empty}
          onClick={() => run('word')}
          title="Word (.doc) con logo y membrete"
        >
          Word
        </button>
        <button
          type="button"
          className="ghost small"
          disabled={disabled || busy || empty}
          onClick={() => run('pdf')}
          title="Imprimir / Guardar PDF con membrete"
        >
          PDF
        </button>
      </div>
      {msg && (
        <p className={`msg ${msg.kind}`} style={{ marginTop: 8, marginBottom: 0 }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
